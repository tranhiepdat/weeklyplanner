import { useLayoutEffect } from "react";
import GoalsPanel from "../components/GoalsPanel";

const TASKS_KEY = "dat-tasks-cache";
const LINKS_KEY = "dat-goal-links";

function safeJson(text, fallback = null) { try { return JSON.parse(text); } catch { return fallback; } }
function read(key, fallback) { try { const x = localStorage.getItem(key); return x ? JSON.parse(x) : fallback; } catch { return fallback; } }
function write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
function announceTasks(tasks) { write(TASKS_KEY, tasks); window.dispatchEvent(new CustomEvent("wp-tasks-updated", { detail: { tasks } })); }
function saveLink(taskId, goalId) {
  if (!taskId || !goalId) return;
  const links = read(LINKS_KEY, {}); links[taskId] = goalId; write(LINKS_KEY, links);
  window.dispatchEvent(new Event("wp-goal-links-changed"));
}
function urlPath(input) {
  const raw = typeof input === "string" ? input : input?.url || "";
  try { return new URL(raw, window.location.origin).pathname; } catch { return raw; }
}
function bodyFrom(input, init) {
  if (init?.body && typeof init.body === "string") return safeJson(init.body, {});
  return {};
}
function jsonResponse(original, data) {
  const headers = new Headers(original.headers); headers.set("content-type", "application/json");
  return new Response(JSON.stringify(data), { status: original.status, statusText: original.statusText, headers });
}

function GoalTaskBridge() {
  useLayoutEffect(() => {
    const originalFetch = window.fetch.bind(window);
    let alive = true;

    window.fetch = async (input, init = {}) => {
      const path = urlPath(input);
      const reqBody = bodyFrom(input, init);

      // For chat-created tasks, fetch the active goals alongside the existing AI call,
      // then use a small conservative AI matcher before the UI receives the result.
      if (path === "/api/chat" && String(init.method || "GET").toUpperCase() === "POST") {
        const [response, goalsResponse] = await Promise.all([
          originalFetch(input, init),
          originalFetch("/api/goals", { cache: "no-store" }).catch(() => null),
        ]);
        if (!response.ok) return response;
        const data = await response.clone().json().catch(() => null);
        const goalsData = goalsResponse?.ok ? await goalsResponse.json().catch(() => null) : null;
        const activeGoals = (goalsData?.goals || []).filter(g => g.status === "active");
        if (!data || !Array.isArray(data.tasks) || !data.tasks.length || !activeGoals.length) return response;
        try {
          const mr = await originalFetch("/api/goal-link", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tasks: data.tasks, goals: activeGoals }),
          });
          const md = mr.ok ? await mr.json() : null;
          if (Array.isArray(md?.matches)) {
            data.tasks = data.tasks.map((t, i) => md.matches[i]?.goalId ? { ...t, goalId: md.matches[i].goalId, goalConfidence: md.matches[i].confidence } : t);
            return jsonResponse(response, data);
          }
        } catch {}
        return response;
      }

      const response = await originalFetch(input, init);
      if (!alive) return response;

      // Mirror server tasks into a tiny local cache for the goals UI. This leaves
      // the existing planner/Notion flow untouched.
      if (path === "/api/tasks" && response.ok) {
        response.clone().json().then(d => { if (Array.isArray(d?.tasks)) announceTasks(d.tasks); }).catch(() => {});
      }

      if (path === "/api/create" && response.ok && String(init.method || "GET").toUpperCase() === "POST") {
        response.clone().json().then(d => {
          if (!d?.id) return;
          if (reqBody.goalId) saveLink(d.id, reqBody.goalId);
          const tasks = read(TASKS_KEY, []);
          const nextTask = { id: d.id, name: reqBody.name || "Untitled", icon: reqBody.icon || "", done: false, date: reqBody.date || null, taskType: reqBody.taskType || "", session: reqBody.session || "", priority: reqBody.priority || [], project: reqBody.project || [], goalId: reqBody.goalId || null };
          announceTasks([...tasks.filter(t => t.id !== d.id), nextTask]);
        }).catch(() => {});
      }

      if (path === "/api/update" && response.ok && String(init.method || "GET").toUpperCase() === "PATCH" && reqBody.id) {
        const tasks = read(TASKS_KEY, []); announceTasks(tasks.map(t => t.id === reqBody.id ? { ...t, ...reqBody } : t));
      }
      if (path === "/api/toggle" && response.ok && String(init.method || "GET").toUpperCase() === "PATCH" && reqBody.id) {
        const tasks = read(TASKS_KEY, []); announceTasks(tasks.map(t => t.id === reqBody.id ? { ...t, done: !!reqBody.done } : t));
      }
      if (path === "/api/delete" && response.ok && reqBody.id) {
        const tasks = read(TASKS_KEY, []); announceTasks(tasks.filter(t => t.id !== reqBody.id));
      }

      return response;
    };

    return () => { alive = false; window.fetch = originalFetch; };
  }, []);
  return null;
}

export default function App({ Component, pageProps }) {
  return <>
    <GoalTaskBridge />
    <GoalsPanel />
    <Component {...pageProps} />
  </>;
}
