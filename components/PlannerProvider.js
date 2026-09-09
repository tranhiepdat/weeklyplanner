import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPlannerStore, requestJson } from "../lib/planner-store.js";

import { startOfWeek } from "../lib/goal-view.js";

const PlannerContext = createContext(null);
const CACHE_KEY = "dat-planner-v2";
const IMPORT_KEY = "dat-goals-import-v1";
function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function localDay() { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }

export function PlannerProvider({ children }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [weekMonday, setWeekMonday] = useState(() => startOfWeek());
  const [dialogs, setDialogs] = useState([]);
  const openDialog = useCallback(dialog => {
    const trigger = document.activeElement;
    setDialogs(stack => [...stack, { ...dialog, trigger }]);
  }, []);
  const closeDialog = useCallback(() => {
    setDialogs(stack => {
      const closing = stack.at(-1);
      requestAnimationFrame(() => { if (closing?.trigger?.isConnected) closing.trigger.focus(); });
      return stack.slice(0,-1);
    });
  }, []);
  const setEditTask = useCallback(task => task ? openDialog({kind: "task", task}) : closeDialog(), [openDialog,closeDialog]);
  const [store] = useState(() => createPlannerStore());
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const initialized = useRef(false), importing = useRef(false), rolledDay = useRef("");
  const migrationJob = useRef(null);
  const retryMigrationRef = useRef(null);

  useEffect(() => {
    let active = true;
    store.restoreCache(read(CACHE_KEY, { tasks: read("dat-tasks-cache", []), goals: read("dat-goals-cache", []) }));
    async function migrate() {
      if (importing.current) {
        await migrationJob.current;
        if (active) { initialized.current = true; await store.sync({ full: true }); }
        return;
      }
      importing.current = true;
      store.setMigration({ running: true, error: "" });
      try {
        let backup = read(IMPORT_KEY, null);
        if (!backup) {
          const legacy = await requestJson("/api/goals/legacy");
          const goals = read("dat-goals-cache", []), links = { ...read("dat-goal-links", {}) };
          for (const t of read("dat-tasks-cache", [])) if (t.goalId && !links[t.id]) links[t.id] = t.goalId;
          backup = { importId: crypto.randomUUID(), goals, links, legacy, completed: false };
          // This backup precedes all server imports/cache updates. If storage is
          // unavailable, retain the legacy data and show a recoverable error.
          localStorage.setItem(IMPORT_KEY, JSON.stringify(backup));
        }
        if (!backup.completed && (backup.goals.length || backup.legacy.raw || Object.keys(backup.links).length)) {
          let result;
          do {
            result = await requestJson("/api/goals/import", { method: "POST", body: backup });
            store.setMigration({ report: result.report });
          } while (!result.complete);
          backup.report = result.report;
        }
        backup.completed = true;
        localStorage.setItem(IMPORT_KEY, JSON.stringify(backup));
        store.setMigration({ report: backup.report || null });
      } catch (e) { store.setMigration({ error: e.message || "Chưa chuyển được dữ liệu cũ. Bản sao vẫn được giữ trên thiết bị." }); }
      finally {
        importing.current = false;
        store.setMigration({ running: false });
        if (active) { initialized.current = true; await store.sync({ full: true }); }
      }
    }
    const startMigration = () => { const job = migrate(); migrationJob.current = job; return job; };
    retryMigrationRef.current = startMigration;
    void startMigration();
    const refresh = () => {
      if (document.visibilityState === "visible" && navigator.onLine && initialized.current) void store.sync({ full: true });
    };
    const poll = setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine && initialized.current && !importing.current) void store.sync();
    }, 15000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false; clearInterval(poll);
      window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh); document.removeEventListener("visibilitychange", refresh);
    };
  }, [store]);

  useEffect(() => {
    if (!state.serverLoaded) return;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ tasks: state.tasks, goals: state.goals })); } catch {}
    const today = localDay();
    if (rolledDay.current !== today) { rolledDay.current = today; void store.rollover(today); }
  }, [state.tasks, state.goals, state.serverLoaded, store]);

  const value = useMemo(() => ({ ...state, ...store, weekMonday, setWeekMonday, dialogs, openDialog, closeDialog, editTask: dialogs.find(d => d.kind === "task")?.task || null, setEditTask, retryMigration: () => retryMigrationRef.current?.() }), [state, store, weekMonday, dialogs, openDialog, closeDialog, setEditTask]);
  return <PlannerContext.Provider value={value}>{mounted ? children : <p role="status">Đang mở planning…</p>}</PlannerContext.Provider>;
}
export function usePlanner() {
  const planner = useContext(PlannerContext);
  if (!planner) throw new Error("PlannerProvider is missing");
  return planner;
}
export function PlannerSyncNotice() {
  const p = usePlanner();
  const issues = [p.syncError, p.goalsError].filter(Boolean);
  return <div aria-live="polite" style={{ fontSize: ".78rem", lineHeight: 1.5, marginBottom: 10 }}>
    {!!issues.length && <div role="alert" style={{ color: "#b45309" }}>{issues.join(" · ")} <button onClick={() => p.sync({ full: true })}>Thử đồng bộ lại</button></div>}
    {p.errors.map(e => <div key={e.id} role="alert" style={{ color: "#b45309" }}>{e.message} <button onClick={() => p.retryError(e.id)}>Thử lưu lại</button></div>)}
    {p.migration.running && <div>Đang chuyển dữ liệu goals cũ sang Notion…</div>}
    {p.migration.error && <div role="alert" style={{ color: "#b45309" }}>{p.migration.error} <button onClick={p.retryMigration}>Thử import lại</button></div>}
    {p.migration.report?.corruptCookie && <div role="alert" style={{ color: "#b45309" }}>Cookie goals cũ không đọc được. Bản gốc đã được giữ trong bản sao import để phục hồi; dữ liệu cache đọc được vẫn đã nhập.</div>}
    {p.migration.report && (p.migration.report.conflicts?.length > 0 || p.migration.report.skipped?.length > 0) && <details>
      <summary>Import: {p.migration.report.conflicts?.length || 0} liên kết giữ bản server · {p.migration.report.skipped?.length || 0} liên kết chưa thể nhập</summary>
      <p>Bản gốc vẫn được giữ trong bản sao import. Mở chi tiết task để kiểm tra hoặc đổi goal.</p>
      <ul>{[...(p.migration.report.conflicts || []), ...(p.migration.report.skipped || [])].map((r, i) => <li key={i}>{p.tasks.find(t => t.id === r.taskId)?.name || r.taskId}: {r.reason || "Giữ liên kết hiện có trên server"}</li>)}</ul>
    </details>}
    {p.pendingCount > 0 && <span>Đang lưu {p.pendingCount} thay đổi…</span>}
  </div>;
}
