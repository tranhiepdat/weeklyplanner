import test from "node:test";
import assert from "node:assert/strict";
import { createPlannerStore, applyEntityPatch } from "../lib/planner-store.js";
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
const turn = () => new Promise(r => setImmediate(r));
const task = (patch = {}) => ({ id: "a", name: "One", done: false, date: "2026-09-07", planTier: "must", planOrder: 2, goalId: "g", ...patch });
const snapshot = tasks => ({ tasks, mode: "snapshot", syncedAt: "2026-09-07T01:00:00Z" });

function fixture(overrides = {}) {
  const requests = [];
  const request = async (url, options = {}) => {
    requests.push({ url, ...options });
    const result = overrides.handle?.(url, options);
    if (result !== undefined) return result;
    if (url === "/api/goals") return { goals: [] };
    return snapshot([task()]);
  };
  return { store: createPlannerStore({ request, ...overrides }), requests };
}

test("snapshot/delta reconcile clears null fields, preserves absent rows only for deltas", async () => {
  let response = snapshot([task(), task({ id: "b" })]);
  const { store } = fixture({ handle: url => url.startsWith("/api/tasks") ? response : undefined });
  await store.sync();
  response = { ...snapshot([task({ planTier: null, planOrder: null, goalId: null })]), mode: "delta" };
  await store.sync();
  assert.equal(store.getSnapshot().tasks.length, 2);
  assert.equal(store.getSnapshot().tasks[0].goalId, null);
  assert.equal(store.getSnapshot().tasks[0].planTier, null);
  response = snapshot([task({ id: "b" })]); await store.sync({ full: true });
  assert.deepEqual(store.getSnapshot().tasks.map(t => t.id), ["b"]);
});

test("sync sends incremental cursor and does a full reconciliation after five minutes", async () => {
  let now = 1;
  const { store, requests } = fixture({ now: () => now });
  await store.sync(); await store.sync();
  assert.match(requests[2].url, /since=/);
  now += 300001; await store.sync();
  assert.equal(requests[4].url, "/api/tasks");
});

test("concurrent refreshes share one request; a full refresh queues exactly one follow-up", async () => {
  const gate = deferred(); let reads = 0;
  const { store } = fixture({ handle: url => { if (url.startsWith("/api/tasks")) { reads++; return reads === 1 ? gate.promise : snapshot([task()]); } } });
  const first = store.sync(); void store.sync(); void store.sync({ full: true }); void store.sync({ full: true });
  assert.equal(reads, 1); gate.resolve(snapshot([task()])); await first; await turn();
  assert.equal(reads, 2);
});

test("a delayed snapshot cannot undo an acknowledged write", async () => {
  const read = deferred(), write = deferred(); let reads = 0;
  const { store } = fixture({ handle: (url, options) => {
    if (url.startsWith("/api/tasks")) return ++reads === 1 ? snapshot([task()]) : read.promise;
    if (options.method === "PATCH") return write.promise;
  } });
  await store.sync(); const refresh = store.sync(); const mutation = store.toggleTask("a", true);
  assert.equal(store.getSnapshot().tasks[0].done, true);
  write.resolve({ task: task({ done: true }) }); await mutation;
  read.resolve(snapshot([task()])); await refresh;
  assert.equal(store.getSnapshot().tasks[0].done, true);
});

test("optimistic edits survive polling and a failed older toggle does not undo the newer toggle", async () => {
  const first = deferred(), second = deferred(); let writes = 0;
  const { store } = fixture({ handle: (url, options) => options.method === "PATCH" ? (++writes === 1 ? first.promise : second.promise) : undefined });
  await store.sync(); const a = store.toggleTask("a", true); const b = store.toggleTask("a", false);
  await turn(); assert.equal(writes, 1);
  await store.sync(); assert.equal(store.getSnapshot().tasks[0].done, false);
  first.reject(new Error("Offline")); await a; await turn();
  assert.equal(writes, 2); assert.equal(store.getSnapshot().tasks[0].done, false);
  assert.equal(store.getSnapshot().errors.length, 0);
  second.resolve({ task: task({ done: false }) }); await b;
});

test("failed writes roll back only their fields and expose a retry", async () => {
  let fail = true;
  const { store } = fixture({ handle: (url, options) => {
    if (options.method === "PATCH") return fail ? Promise.reject(new Error("offline")) : { task: task({ goalId: null }) };
  } });
  await store.sync(); assert.equal(await store.updateTask("a", { goalId: null }), false);
  assert.equal(store.getSnapshot().tasks[0].goalId, "g");
  fail = false; await store.retryError(store.getSnapshot().errors[0].id);
  assert.equal(store.getSnapshot().tasks[0].goalId, null); assert.equal(store.getSnapshot().errors.length, 0);
});

test("a partial plan batch commits successes; retry submits only failed task IDs", async () => {
  let attempt = 0; const batches = [];
  const { store } = fixture({ handle: (url, options) => {
    if (url === "/api/tasks") return snapshot([task(), task({ id: "b" })]);
    if (url === "/api/plan") {
      batches.push(options.body); attempt++;
      return { results: options.body.tiers.map(t => ({ id: t.id, ok: t.id === "a" || attempt > 1, patch: { planTier: t.tier }, error: "rate limited" })) };
    }
  } });
  await store.sync();
  assert.equal(await store.planBatch([{ id: "a", planTier: "optional" }, { id: "b", planTier: "optional" }]), false);
  assert.equal(store.getSnapshot().tasks.find(t => t.id === "a").planTier, "optional");
  assert.equal(store.getSnapshot().tasks.find(t => t.id === "b").planTier, "must");
  await store.retryError(store.getSnapshot().errors[0].id);
  assert.deepEqual(batches[1].tiers.map(t => t.id), ["b"]);
});

test("batch writes are chunked to 25 and a stale refresh cannot resurrect a deletion", async () => {
  const gate = deferred(); let reads = 0, sizes = [];
  const { store } = fixture({ handle: (url, options) => {
    if (url === "/api/tasks") return ++reads === 1 ? snapshot([task()]) : gate.promise;
    if (url === "/api/delete") return { ok: true };
    if (url === "/api/plan") { sizes.push(options.body.orders.length); return { results: options.body.orders.map(o => ({ id: o.id, ok: true, patch: { planOrder: o.order } })) }; }
  } });
  await store.sync(); const read = store.sync({ full: true }); await store.deleteTask("a");
  gate.resolve(snapshot([task()])); await read; assert.equal(store.getSnapshot().tasks.length, 0);
  await store.planBatch(Array.from({ length: 61 }, (_, i) => ({ id: String(i), planOrder: i })));
  assert.deepEqual(sizes, [25,25,11]);
});

test("create retries reuse the client request ID and temporary tasks reconcile with real IDs", async () => {
  const bodies = []; let fail = true;
  const { store } = fixture({ handle: (url, options) => {
    if (url !== "/api/create") return;
    bodies.push(options.body);
    return fail ? Promise.reject(new Error("timeout")) : { id: "new", task: task({ id: "new", name: "Created" }) };
  } });
  await store.createTask({ name: "Created" });
  fail = false; await store.retryError(store.getSnapshot().errors[0].id);
  assert.equal(bodies[0].clientRequestId, bodies[1].clientRequestId);
  assert.equal(store.getSnapshot().tasks.filter(t => t.id === "new").length, 1);
  assert.ok(!store.getSnapshot().tasks.some(t => t.id.startsWith("temp-")));
});

test("goal milestones patch by ID and optimistic link changes update the shared goal counts", async () => {
  const g = { id: "goal-page", uid: "g", milestones: [{ id: "m1", done: false }, { id: "m2", done: true }] };
  assert.deepEqual(applyEntityPatch(g, { milestone: { id: "m1", done: true } }).milestones.map(m => m.done), [true,true]);
  const write = deferred();
  const { store } = fixture({ handle: (url, options) => options.method === "PATCH" ? write.promise : undefined });
  await store.sync(); const update = store.updateTask("a", { goalId: null });
  assert.equal(store.getSnapshot().tasks.filter(t => t.goalId === "g").length, 0);
  write.resolve({ task: task({ goalId: null }) }); await update;
});

test("read failure preserves cached tasks and does not advance the cursor", async () => {
  let fail = false;
  const { store, requests } = fixture({ handle: url => fail && url.startsWith("/api/tasks") ? Promise.reject(new Error("offline")) : undefined });
  await store.sync(); fail = true; await store.sync();
  assert.equal(store.getSnapshot().tasks.length, 1); assert.equal(store.getSnapshot().syncError, "offline");
  fail = false; await store.sync(); assert.equal(requests[2].url, requests[4].url);
});


test("cached tasks remain available offline but are not treated as fresh server hydration",async()=>{
  const {store}=fixture({handle:()=>Promise.reject(new Error("offline"))});
  store.restoreCache({tasks:[task(),task({id:"temp-unsaved"})],goals:[]});
  await store.sync();
  assert.equal(store.getSnapshot().tasks.length,1);
  assert.equal(store.getSnapshot().serverLoaded,false);
  assert.equal(store.getSnapshot().status,"ok");
});

test("periodic reads do not trigger overdue task writes",async()=>{
  const {store,requests}=fixture({handle:url=>url.startsWith("/api/tasks")?snapshot([task({date:"2020-01-01"})]):undefined});
  await store.sync(); await store.sync(); await store.sync({full:true});
  assert.ok(requests.every(r=>!r.method));
});
