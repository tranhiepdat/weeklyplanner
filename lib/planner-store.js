// Framework-independent store: snapshots, optimistic overlays, and a serial
// write queue shared by the planner, goal board, and task editor.
export async function requestJson(url, options = {}) {
  const response = await fetch(url, { cache: "no-store", ...options, ...(options.body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(options.body) }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Không lưu được (${response.status}).`);
  return data;
}
export function applyEntityPatch(row, patch) {
  const { milestone, milestoneBase, ...fields } = patch;
  const next = { ...row, ...fields };
  if (milestone) next.milestones = (next.milestones || []).map(m => m.id === milestone.id ? { ...m, done: milestone.done } : m);
  return next;
}
const overlaps = (a, b) => Object.keys(a).some(k => Object.hasOwn(b, k));
const uid = () => globalThis.crypto.randomUUID();

export function createPlannerStore({ request = requestJson, now = Date.now, cache = {} } = {}) {
  let bases = { tasks: new Map((cache.tasks || []).map(t => [t.id, t])), goals: new Map((cache.goals || []).map(g => [g.id, g])) };
  let pending = [], errors = [], version = 0, versions = new Map(), writeTail = Promise.resolve();
  let inFlight = null, rerunFull = false, syncCursor = null, lastFull = 0, disposed = false;
  let serverLoaded = false;
  let status = "loading", syncError = "", goalsError = "", syncing = false;
  const listeners = new Set();
  const key = (entity, id) => `${entity}:${id}`;
  const touch = (entity, id) => versions.set(key(entity, id), ++version);
  let snapshot;
  function rows(entity) {
    const map = new Map(bases[entity]);
    for (const op of pending.filter(o => o.entity === entity)) {
      if (op.patch._deleted) map.delete(op.id);
      else map.set(op.id, applyEntityPatch(map.get(op.id) || { id: op.id }, op.patch));
    }
    return [...map.values()];
  }
  function emit() {
    snapshot = { tasks: rows("tasks"), goals: rows("goals"), status, serverLoaded, syncing, syncError, goalsError,
      pendingCount: pending.length, errors: errors.map(({ id, message }) => ({ id, message })) };
    if (!disposed) listeners.forEach(fn => fn());
  }
  function merge(entity, incoming, full, at) {
    const existing = bases[entity], next = full ? new Map() : new Map(existing);
    const protectedIds = new Set(pending.filter(p => p.entity === entity).map(p => p.id));
    for (const [id, row] of existing) if ((versions.get(key(entity, id)) || 0) > at || protectedIds.has(id)) next.set(id, row);
    for (const row of incoming) {
      if ((versions.get(key(entity, row.id)) || 0) > at) continue;
      next.set(row.id, row);
    }
    bases[entity] = next;
  }
  async function sync({ full = false } = {}) {
    if (disposed) return;
    if (inFlight) { if (full) rerunFull = true; return inFlight; }
    const useFull = full || !syncCursor || now() - lastFull >= 300000;
    const at = version;
    syncing = true; emit();
    inFlight = (async () => {
      const results = await Promise.allSettled([
        request(`/api/tasks${useFull ? "" : `?since=${encodeURIComponent(syncCursor)}`}`),
        request("/api/goals"),
      ]);
      if (disposed) return;
      const [taskResult, goalResult] = results;
      if (taskResult.status === "fulfilled" && Array.isArray(taskResult.value.tasks)) {
        const d = taskResult.value;
        merge("tasks", d.tasks, d.mode !== "delta", at);
        syncCursor = d.syncedAt || null;
        if (d.mode !== "delta") lastFull = now();
        status = "ok"; serverLoaded = true; syncError = "";
      } else {
        syncError = taskResult.reason?.message || "Không đọc được dữ liệu task.";
        status = bases.tasks.size ? "ok" : "error";
      }
      if (goalResult.status === "fulfilled" && Array.isArray(goalResult.value.goals)) {
        merge("goals", goalResult.value.goals, true, at); goalsError = "";
      } else goalsError = goalResult.reason?.message || "Không đọc được goals.";
    })().finally(() => {
      inFlight = null; syncing = false; emit();
      if (rerunFull && !disposed) { rerunFull = false; void sync({ full: true }); }
    });
    return inFlight;
  }

  // All local writes are ordered, including multi-task plan batches. A response
  // from an earlier read cannot undo a newer write or resurrect a deleted task.
  function execute(operations, work, retry) {
    const ops = operations.map(op => ({ ...op, token: uid() }));
    for (const op of ops) {
      touch(op.entity, op.id);
      errors = errors.filter(e => !e.operations.some(o => o.entity === op.entity && o.id === op.id && overlaps(o.patch, op.patch)));
    }
    pending.push(...ops); emit();
    const run = async () => {
      let results;
      try { results = await work(); }
      catch (e) { results = ops.map(op => ({ id: op.id, ok: false, error: e.message })); }
      const failed = [];
      for (const op of ops) {
        const result = results.find(r => r.id === op.id) || { ok: false, error: "Thiếu kết quả lưu từ server." };
        pending = pending.filter(p => p.token !== op.token);
        touch(op.entity, op.id);
        if (result.ok) {
          if (op.patch._deleted) bases[op.entity].delete(op.id);
          else {
            const saved = result.row || applyEntityPatch(bases[op.entity].get(op.id) || { id: op.id }, result.patch || op.patch);
            bases[op.entity].delete(op.id);
            bases[op.entity].set(saved.id, saved); touch(op.entity, saved.id);
          }
        } else failed.push({ op, error: result.error || "Không lưu được thay đổi." });
      }
      if (failed.length) {
        // A later queued edit supersedes an old failed write to the same field.
        const relevant = failed.filter(({ op }) => !pending.some(p => p.entity === op.entity && p.id === op.id && overlaps(p.patch, op.patch)));
        if (relevant.length) errors.push({ id: uid(), message: relevant.map(f => f.error).filter((x, i, a) => a.indexOf(x) === i).join(" · "), operations: relevant.map(f => f.op), retry: () => retry(relevant.map(f => f.op)) });
      }
      emit();
      return failed.length ? null : results;
    };
    const result = writeTail.then(run, run); writeTail = result.catch(() => {}); return result;
  }
  function updateTask(id, patch) {
    if (!rows("tasks").some(t => t.id === id)) return Promise.resolve(false);
    const op = { entity: "tasks", id, patch };
    return execute([op], async () => {
      const d = await request("/api/update", { method: "PATCH", body: { id, ...patch } });
      return [{ id, ok: true, ...(d.task ? { row: d.task } : { patch }) }];
    }, () => updateTask(id, patch)).then(Boolean);
  }
  function toggleTask(id, done) { return updateTask(id, { done }); }
  function deleteTask(id) {
    return execute([{ entity: "tasks", id, patch: { _deleted: true } }], async () => {
      await request("/api/delete", { method: "POST", body: { id } }); return [{ id, ok: true }];
    }, () => deleteTask(id)).then(Boolean);
  }
  function createTask(draft) {
    const clientRequestId = draft.clientRequestId || uid(), id = `temp-${clientRequestId}`;
    const input = { ...draft, clientRequestId };
    const patch = { name: draft.name, icon: draft.icon || "", done: false, date: draft.date || null, session: draft.session || null, taskType: draft.taskType || null,
      priority: draft.priority || [], project: draft.project || [], goalId: draft.goalId || null, planTier: draft.planTier || null, planOrder: null };
    return execute([{ entity: "tasks", id, patch }], async () => {
      const d = await request("/api/create", { method: "POST", body: input });
      if (!d.id) throw new Error("Thiếu ID task đã tạo.");
      return [{ id, ok: true, row: d.task || { ...patch, id: d.id } }];
    }, () => createTask(input)).then(result => result?.[0]?.row.id || null);
  }
  function planBatch(patches) {
    if (!patches.length) return Promise.resolve(true);
    const ops = patches.map(({ id, ...patch }) => ({ entity: "tasks", id, patch }));
    return execute(ops, async () => {
      const results = [];
      for (let i = 0; i < patches.length; i += 25) {
        const chunk = patches.slice(i, i + 25);
        try {
          const d = await request("/api/plan", { method: "POST", body: {
            tiers: chunk.filter(p => p.planTier !== undefined).map(p => ({ id: p.id, tier: p.planTier })),
            orders: chunk.filter(p => p.planOrder !== undefined).map(p => ({ id: p.id, order: p.planOrder })),
          } });
          results.push(...(d.results || chunk.map(p => ({ id: p.id, ok: false, error: "Thiếu kết quả lưu." }))));
        } catch (e) { results.push(...chunk.map(p => ({ id: p.id, ok: false, error: e.message }))); }
      }
      return results;
    }, failed => planBatch(failed.map(op => ({ id: op.id, ...op.patch })))).then(Boolean);
  }
  function saveGoal(input) {
    const existing = !!input.id, goalUid = input.uid || uid(), id = input.id || `temp-${goalUid}`;
    const patch = existing ? { ...input } : { ...input, uid: goalUid, status: input.status || "active" };
    delete patch.id;
    return execute([{ entity: "goals", id, patch }], async () => {
      const d = await request("/api/goals", { method: existing ? "PATCH" : "POST", body: existing ? { id, goal: patch } : patch });
      if (!d.goal?.id) throw new Error("Thiếu goal đã lưu.");
      return [{ id, ok: true, row: d.goal }];
    }, () => saveGoal({ ...input, uid: goalUid })).then(Boolean);
  }
  async function rollover(today) {
    // Called only on initial hydration / a new day, not by the polling read.
    for (const task of snapshot.tasks) {
      const current = snapshot.tasks.find(t => t.id === task.id);
      if (current && !current.done && current.date && current.date < today && !current.id.startsWith("temp-")) await updateTask(current.id, { date: today });
    }
  }
  async function retryError(id) {
    const err = errors.find(e => e.id === id);
    errors = errors.filter(e => e.id !== id); emit();
    if (err) return err.retry();
  }
  emit();
  return { getSnapshot: () => snapshot, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    sync, updateTask, toggleTask, createTask, deleteTask, planBatch, saveGoal, rollover, retryError,
    restoreCache: cache => {
      if (serverLoaded || version) return;
      for (const entity of ["tasks", "goals"]) if (Array.isArray(cache[entity])) bases[entity] = new Map(cache[entity].filter(row => row?.id && !row.id.startsWith("temp-")).map(row => [row.id, row]));
      if (bases.tasks.size) status = "ok";
      emit();
    },
    dispose: () => { disposed = true; listeners.clear(); },
  };
}
