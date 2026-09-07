import { ApiError, TASKS_DB_ID, notion, queryAll, respondError } from "../../lib/notion.js";
import { ensureTaskSchema, taskPatchProperties, taskFromPage, goalUidMap } from "../../lib/tasks.js";
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  try {
    const draft = req.body || {};
    if (!draft.name?.trim()) throw new ApiError("Missing name", 400);
    await ensureTaskSchema();
    if (draft.clientRequestId) {
      const existing = await queryAll(TASKS_DB_ID, { filter: { property: "Client Request ID", rich_text: { equals: draft.clientRequestId } } });
      if (existing.length) {
        const task = taskFromPage(existing[0], await goalUidMap());
        return res.status(200).json({ id: task.id, task });
      }
    }
    const properties = await taskPatchProperties({ ...draft, done: false });
    const goalUids = await goalUidMap();
    const page = await notion("/pages", { method: "POST", body: {
      parent: { database_id: TASKS_DB_ID }, properties,
      ...(draft.icon ? { icon: { type: "emoji", emoji: draft.icon } } : {}),
    } });
    const task = taskFromPage(page, goalUids);
    return res.status(200).json({ id: task.id, task });
  } catch (e) { return respondError(res, e); }
}
