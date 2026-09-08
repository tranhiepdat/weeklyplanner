import { ApiError, TASKS_DB_ID, notion, ensureProperties, plainText, richText, dateProperty } from "./notion.js";
import { goalsDatabaseId, listGoalPages, goalFromPage, resolveGoal } from "./goals.js";

export const PLAN_LABELS = { must: "🔥 Bắt buộc", optional: "💤 Để dành" };
export function taskSchema() {
  return {
    Plan: { select: { options: [{ name: PLAN_LABELS.must, color: "red" }, { name: PLAN_LABELS.optional, color: "gray" }] } },
    "Plan Order": { number: { format: "number" } }, "Client Request ID": { rich_text: {} },
    ...(process.env.NOTION_GOALS_DB_ID ? { Goal: { relation: { database_id: goalsDatabaseId(), single_property: {} } } } : {}),
  };
}
let ensured;
export async function ensureTaskSchema() {
  const key = `${TASKS_DB_ID}:${process.env.NOTION_GOALS_DB_ID || ""}`;
  if (!ensured || ensured.key !== key) {
    const promise = ensureProperties(TASKS_DB_ID, taskSchema()).catch(e => { ensured = null; throw e; });
    ensured = { key, promise };
  }
  await ensured.promise;
}
export async function goalUidMap() {
  if (!process.env.NOTION_GOALS_DB_ID) return new Map();
  return new Map((await listGoalPages()).map(page => [page.id, goalFromPage(page).uid]));
}
export function taskFromPage(page, goalUids = new Map()) {
  const p = page.properties, tier = p.Plan?.select?.name;
  const goalPageId = p.Goal?.relation?.[0]?.id || null;
  return {
    id: page.id, icon: page.icon?.emoji || "", name: plainText(p.Task) || "Untitled", done: !!p.Done?.checkbox,
    date: p["Due Date"]?.date?.start?.slice(0, 10) || null,
    taskType: p["Task Type"]?.select?.name || null, session: p["Buổi"]?.select?.name || null,
    priority: p.Priority?.multi_select?.map(s => s.name) || [], project: p.Project?.multi_select?.map(s => s.name) || [],
    planTier: tier?.includes("Bắt buộc") ? "must" : tier?.includes("Để dành") ? "optional" : null,
    planOrder: typeof p["Plan Order"]?.number === "number" ? p["Plan Order"].number : null,
    // Preserve unknown/trashed relations so they are visible and can be cleared.
    goalId: goalPageId ? goalUids.get(goalPageId) || goalPageId : null,
    goalPageId, lastEditedTime: page.last_edited_time,
  };
}
export async function taskPatchProperties(patch, { allowArchivedGoal = false } = {}) {
  const props = {};
  if (patch.name !== undefined) {
    if (typeof patch.name !== "string" || !patch.name.trim()) throw new ApiError("Missing name", 400);
    props.Task = { title: [{ text: { content: patch.name.trim().slice(0, 2000) } }] };
  }
  if (patch.done !== undefined) {
    if (typeof patch.done !== "boolean") throw new ApiError("Invalid done value", 400);
    props.Done = { checkbox: patch.done };
  }
  for (const [field, name] of [["session", "Buổi"], ["taskType", "Task Type"]])
    if (patch[field] !== undefined) props[name] = { select: patch[field] ? { name: String(patch[field]) } : null };
  if (patch.date !== undefined) {
    if (patch.date && (!/^\d{4}-\d{2}-\d{2}$/.test(patch.date) || !Number.isFinite(Date.parse(patch.date)))) throw new ApiError("Invalid task date", 400);
    props["Due Date"] = dateProperty(patch.date);
  }
  for (const [field, name] of [["priority", "Priority"], ["project", "Project"]])
    if (patch[field] !== undefined) {
      if (!Array.isArray(patch[field]) || patch[field].some(n => typeof n !== "string")) throw new ApiError(`Invalid ${field}`, 400);
      props[name] = { multi_select: patch[field].map(name => ({ name })) };
    }
  if (patch.planTier !== undefined) {
    if (patch.planTier !== null && !Object.hasOwn(PLAN_LABELS, patch.planTier)) throw new ApiError("Invalid plan tier", 400);
    props.Plan = { select: patch.planTier ? { name: PLAN_LABELS[patch.planTier] } : null };
  }
  if (patch.planOrder !== undefined) {
    if (patch.planOrder !== null && !Number.isFinite(patch.planOrder)) throw new ApiError("Invalid plan order", 400);
    props["Plan Order"] = { number: patch.planOrder };
  }
  if (patch.goalId !== undefined) props.Goal = { relation: await resolveGoal(patch.goalId, allowArchivedGoal) };
  if (patch.clientRequestId) props["Client Request ID"] = richText(String(patch.clientRequestId).slice(0, 120));
  return props;
}
export async function patchTask(id, patch) {
  if (!id || typeof id !== "string") throw new ApiError("Missing id", 400);
  if (["goalId", "planTier", "planOrder"].some(k => patch[k] !== undefined)) await ensureTaskSchema();
  const properties = await taskPatchProperties(patch);
  if (!Object.keys(properties).length) throw new ApiError("Nothing to update", 400);
  const goalUids = await goalUidMap();
  const page = await notion(`/pages/${id}`, { method: "PATCH", body: { properties } });
  return taskFromPage(page, goalUids);
}

export function taskQuery(since, now = Date.now()) {
  if (since === undefined) return { mode: "snapshot", body: { sorts: [{ timestamp: "last_edited_time", direction: "descending" }] } };
  if (typeof since !== "string" || !Number.isFinite(Date.parse(since)) || Date.parse(since) > now + 60000) throw new ApiError("Invalid sync cursor", 400);
  // Notion timestamps can be rounded to the minute. Re-read the previous two
  // minutes and replace by ID; never discard different content at equal times.
  const start = new Date(Date.parse(since) - 120000).toISOString();
  return { mode: "delta", body: { filter: { timestamp: "last_edited_time", last_edited_time: { on_or_after: start } }, sorts: [{ timestamp: "last_edited_time", direction: "ascending" }] } };
}
