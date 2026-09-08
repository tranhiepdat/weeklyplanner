import { respondError } from "../../lib/notion.js";
import { patchTask } from "../../lib/tasks.js";
export default async function handler(req, res) {
  if (req.method !== "PATCH") return res.status(405).end();
  try { return res.status(200).json({ ok: true, task: await patchTask(req.body?.id, req.body || {}) }); }
  catch (e) { return respondError(res, e); }
}
