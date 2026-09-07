import { randomUUID } from "node:crypto";
import { ApiError, notion, queryAll, ensureProperties, richText, plainText, dateProperty } from "./notion.js";

export const ACTIVE_LIMIT = 3;
export function goalsDatabaseId() {
  if (!process.env.NOTION_GOALS_DB_ID) throw new ApiError("Cần cấu hình NOTION_GOALS_DB_ID để đồng bộ goals với Notion.", 503);
  return process.env.NOTION_GOALS_DB_ID;
}
export function goalSchema() {
  const schema = {
    Goal: { title: {} }, UID: { rich_text: {} }, Emoji: { rich_text: {} },
    Deadline: { date: {} }, "Weekly Outcome": { rich_text: {} },
    Status: { select: { options: ["active", "archived", "achieved"].map(name => ({ name })) } },
    Kind: { select: { options: ["goal", "import"].map(name => ({ name })) } },
    "Created At": { date: {} }, "Updated At": { date: {} }, "Achieved At": { date: {} }, "Archived At": { date: {} },
    "Import Complete": { checkbox: {} }, "Import Progress": { rich_text: {} },
  };
  for (let i = 1; i <= 5; i++) {
    schema[`Milestone ${i}`] = { rich_text: {} };
    schema[`Milestone ${i} ID`] = { rich_text: {} };
    schema[`Milestone ${i} Done`] = { checkbox: {} };
  }
  return schema;
}
let ensured;
export async function ensureGoalsSchema() {
  const id = goalsDatabaseId();
  if (!ensured || ensured.id !== id) {
    const promise = ensureProperties(id, goalSchema()).catch(e => { ensured = null; throw e; });
    ensured = { id, promise };
  }
  await ensured.promise;
}

export function goalFromPage(page) {
  const p = page.properties;
  return {
    id: page.id, uid: plainText(p.UID) || page.id, title: plainText(p.Goal), emoji: plainText(p.Emoji) || "🎯",
    deadline: p.Deadline?.date?.start || "", weeklyOutcome: plainText(p["Weekly Outcome"]),
    status: p.Status?.select?.name || "active", createdAt: p["Created At"]?.date?.start || page.created_time,
    updatedAt: p["Updated At"]?.date?.start || page.last_edited_time, lastEditedTime: page.last_edited_time,
    achievedAt: p["Achieved At"]?.date?.start || null, archivedAt: p["Archived At"]?.date?.start || null,
    milestones: Array.from({ length: 5 }, (_, index) => {
      const i = index + 1;
      return { id: plainText(p[`Milestone ${i} ID`]) || `${page.id}-m${i}`, text: plainText(p[`Milestone ${i}`]), done: !!p[`Milestone ${i} Done`]?.checkbox };
    }).filter(m => m.text),
  };
}
export async function listGoalPages() {
  return queryAll(goalsDatabaseId(), { filter: { property: "Kind", select: { does_not_equal: "import" } } });
}
export function dedupeGoals(goals) {
  const byUid = new Map();
  for (const goal of goals) {
    const old = byUid.get(goal.uid);
    if (!old || String(goal.updatedAt || "") > String(old.updatedAt || "") || (goal.updatedAt === old.updatedAt && goal.id < old.id)) byUid.set(goal.uid, goal);
  }
  return [...byUid.values()].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")) || a.uid.localeCompare(b.uid));
}
export async function listGoals() { return dedupeGoals((await listGoalPages()).map(goalFromPage)); }

export function normalizeGoal(input, old = null, importing = false) {
  const now = new Date().toISOString();
  const goal = { ...(old || {}), ...input };
  goal.uid = old?.uid || String(input.uid || input.id || randomUUID()).slice(0, 120);
  goal.title = String(goal.title || "").trim().slice(0, 160);
  goal.emoji = String(goal.emoji || "🎯").slice(0, 8);
  goal.weeklyOutcome = String(goal.weeklyOutcome || "").trim().slice(0, 220);
  goal.deadline = String(goal.deadline || "").slice(0, 10);
  if (goal.deadline && (!/^\d{4}-\d{2}-\d{2}$/.test(goal.deadline) || !Number.isFinite(Date.parse(goal.deadline)))) throw new ApiError("Invalid goal deadline", 400);
  if (!["active", "archived", "achieved"].includes(goal.status)) goal.status = "active";
  goal.milestones = (Array.isArray(goal.milestones) ? goal.milestones : []).slice(0, 5).map((m, i) => ({
    id: String(m.id || `${goal.uid}-m${i}`).slice(0, 120), text: String(m.text || "").trim().slice(0, 180), done: !!m.done,
  })).filter(m => m.text);
  if (!goal.title || !goal.milestones.length) throw new ApiError("Goal needs a title and milestones", 400);
  goal.createdAt = old?.createdAt || (importing && Number.isFinite(Date.parse(input.createdAt)) ? input.createdAt : now);
  goal.updatedAt = importing && Number.isFinite(Date.parse(input.updatedAt)) ? input.updatedAt : now;
  return goal;
}
export function goalProperties(goal) {
  const props = {
    Goal: { title: [{ text: { content: goal.title } }] }, UID: richText(goal.uid), Emoji: richText(goal.emoji),
    Deadline: dateProperty(goal.deadline), "Weekly Outcome": richText(goal.weeklyOutcome),
    Status: { select: { name: goal.status } }, Kind: { select: { name: "goal" } },
    "Created At": dateProperty(goal.createdAt), "Updated At": dateProperty(goal.updatedAt),
    "Achieved At": dateProperty(goal.achievedAt), "Archived At": dateProperty(goal.archivedAt),
  };
  for (let i = 1; i <= 5; i++) {
    const m = goal.milestones[i - 1];
    props[`Milestone ${i}`] = richText(m?.text);
    props[`Milestone ${i} ID`] = richText(m?.id);
    props[`Milestone ${i} Done`] = { checkbox: !!m?.done };
  }
  return props;
}
// Only changed properties are written: a title edit cannot overwrite another
// device's checkbox. Each milestone checkbox is a separate Notion property.
export function changedGoalProperties(goal, old) {
  const next = goalProperties(goal), before = old ? goalProperties(old) : {};
  return Object.fromEntries(Object.entries(next).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(before[key])));
}
export async function writeGoal(input, old = null, importing = false) {
  const goal = normalizeGoal(input, old, importing);
  const page = await notion(old ? `/pages/${old.id}` : "/pages", {
    method: old ? "PATCH" : "POST",
    body: { ...(old ? {} : { parent: { database_id: goalsDatabaseId() } }), properties: changedGoalProperties(goal, old) },
  });
  return goalFromPage(page);
}
export async function getGoal(id) {
  if (!id) throw new ApiError("Missing goal id", 400);
  const page = await notion(`/pages/${id}`);
  if (page.parent?.database_id?.replaceAll("-", "") !== goalsDatabaseId().replaceAll("-", "") || page.archived || page.in_trash || page.properties.Kind?.select?.name === "import") throw new ApiError("Goal not found", 404);
  return goalFromPage(page);
}
export async function resolveGoal(goalId, allowArchived = false) {
  if (goalId === null || goalId === "") return [];
  if (typeof goalId !== "string") throw new ApiError("Invalid goalId", 400);
  const goal = (await listGoals()).find(g => g.uid === goalId);
  if (!goal) throw new ApiError("Goal not found", 404);
  if (!allowArchived && goal.status !== "active") throw new ApiError("Chỉ có thể chọn goal đang active.", 409);
  return [{ id: goal.id }];
}
// Same-worker serialization reduces edit/import races; persisted UIDs make
// import retries idempotent across worker restarts.
let writeTail = Promise.resolve();
export function serializeGoals(fn) {
  const result = writeTail.then(fn, fn); writeTail = result.catch(() => {}); return result;
}

// Three-way merge for an open editor: unchanged milestone fields use the
// current server value, including another device's completion checkbox.
export function mergeMilestoneDraft(draft, baseline, latest) {
  const before = new Map(baseline.map(m => [m.id, m])), current = new Map(latest.map(m => [m.id, m]));
  const next = [];
  for (const m of draft) {
    const base = before.get(m.id), live = current.get(m.id);
    if (!base) { next.push(m); continue; }
    if (!live) {
      if (m.text !== base.text || m.done !== base.done) throw new ApiError("Milestone đã bị xóa trên thiết bị khác. Hãy mở lại goal để kiểm tra.", 409);
      continue;
    }
    next.push({ ...m, text: m.text === base.text ? live.text : m.text, done: m.done === base.done ? live.done : m.done });
  }
  for (const m of latest) if (!before.has(m.id) && !next.some(x => x.id === m.id)) next.push(m);
  if (next.length > 5) throw new ApiError("Goal có milestone mới trên thiết bị khác; hãy kiểm tra giới hạn 5 milestone.", 409);
  return next;
}
