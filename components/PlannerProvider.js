import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPlannerStore } from "../lib/planner-store.js";

import { startOfWeek } from "../lib/goal-view.js";

const PlannerContext = createContext(null);
const CACHE_KEY = "dat-planner-v2";
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
  const initialized = useRef(false), rolledDay = useRef("");

  useEffect(() => {
    // This cache is only a temporary paint while the canonical Notion snapshot
    // loads. Legacy cookie/localStorage goals and links are intentionally ignored.
    store.restoreCache(read(CACHE_KEY, { tasks: [], goals: [] }));
    initialized.current = true;
    void store.sync({ full: true });
    const refresh = () => {
      if (document.visibilityState === "visible" && navigator.onLine && initialized.current) void store.sync({ full: true });
    };
    const poll = setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine && initialized.current) void store.sync();
    }, 15000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(poll);
      window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh); document.removeEventListener("visibilitychange", refresh);
    };
  }, [store]);

  useEffect(() => {
    if (!state.serverLoaded) return;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ tasks: state.tasks, goals: state.goals })); } catch {}
    const today = localDay();
    if (rolledDay.current !== today) { rolledDay.current = today; void store.rollover(today); }
  }, [state.tasks, state.goals, state.serverLoaded, store]);

  const value = useMemo(() => ({ ...state, ...store, weekMonday, setWeekMonday, dialogs, openDialog, closeDialog, editTask: dialogs.find(d => d.kind === "task")?.task || null, setEditTask }), [state, store, weekMonday, dialogs, openDialog, closeDialog, setEditTask]);
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
    {p.pendingCount > 0 && <span>Đang lưu {p.pendingCount} thay đổi…</span>}
  </div>;
}
