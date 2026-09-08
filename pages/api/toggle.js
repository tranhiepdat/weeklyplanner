import { ApiError, respondError } from "../../lib/notion.js";
import { patchTask } from "../../lib/tasks.js";
export default async function handler(req, res) {
  if (req.method !== "PATCH") return res.status(405).end();
  try {
    if (typeof req.body?.done !== "boolean") throw new ApiError("Invalid done value", 400);
    return res.status(200).json({ ok: true, task: await patchTask(req.body.id, { done: req.body.done }) });
  } catch (e) { return respondError(res, e); }
}
