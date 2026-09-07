import { ApiError, notion, respondError } from "../../lib/notion.js";
import { ensureTaskSchema, taskPatchProperties } from "../../lib/tasks.js";
export const config = { maxDuration: 60 };
export function planJobs(body) {
  if ((body.tiers !== undefined && !Array.isArray(body.tiers)) || (body.orders !== undefined && !Array.isArray(body.orders))) throw new ApiError("Invalid plan batch", 400);
  const jobs = new Map();
  const add = (id, patch) => {
    if (typeof id !== "string" || !id) throw new ApiError("Invalid task id", 400);
    if (Object.values(patch).some(v => v === undefined)) throw new ApiError("Missing plan value", 400);
    jobs.set(id, { ...jobs.get(id), ...patch });
  };
  if (body.id) add(body.id, { planTier: body.tier === "normal" ? null : body.tier });
  for (const row of body.tiers || []) add(row.id, { planTier: row.tier === "normal" ? null : row.tier });
  for (const row of body.orders || []) add(row.id, { planOrder: row.order });
  if (!jobs.size || jobs.size > 25) throw new ApiError("Send between 1 and 25 tasks per batch", 400);
  return [...jobs].map(([id, patch]) => ({ id, patch }));
}
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  try {
    const jobs = planJobs(req.body || {});
    // Validate every row before writing anything.
    for (const job of jobs) job.properties = await taskPatchProperties(job.patch);
    await ensureTaskSchema();
    const results = [];
    for (const job of jobs) {
      try {
        await notion(`/pages/${job.id}`, { method: "PATCH", body: { properties: job.properties } });
        results.push({ id: job.id, ok: true, patch: job.patch });
      } catch (e) { results.push({ id: job.id, ok: false, error: e.message }); }
    }
    const ok = results.every(r => r.ok);
    return res.status(ok ? 200 : 207).json({ ok, results });
  } catch (e) { return respondError(res, e); }
}
