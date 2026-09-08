import { TASKS_DB_ID, queryAll, respondError } from "../../lib/notion.js";
import { goalUidMap, taskFromPage, taskQuery } from "../../lib/tasks.js";

export const config = { maxDuration: 60 };
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).end();
  try {
    const syncedAt = new Date().toISOString(); // before the first page, never after the scan
    const { mode, body } = taskQuery(req.query?.since);
    const pages = await queryAll(TASKS_DB_ID, body);
    const goalUids = await goalUidMap();
    return res.status(200).json({ tasks: pages.map(p => taskFromPage(p, goalUids)), mode, syncedAt });
  } catch (e) { return respondError(res, e); }
}
