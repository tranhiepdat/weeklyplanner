import { respondError } from "../../../lib/notion.js";
import { ensureGoalsSchema, serializeGoals } from "../../../lib/goals.js";
import { ensureTaskSchema } from "../../../lib/tasks.js";
import { readLegacyGoals, importGoalBatch } from "../../../lib/goal-import.js";
export const config = { maxDuration: 60, api: { bodyParser: { sizeLimit: "1mb" } } };
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).end();
  try {
    await ensureGoalsSchema(); await ensureTaskSchema();
    const result = await serializeGoals(() => importGoalBatch(req.body || {}, readLegacyGoals(req)));
    if (result.complete) res.setHeader("Set-Cookie", Array.from({ length: 4 }, (_, i) => `wp_goals_${i}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly`));
    return res.status(200).json(result);
  } catch (e) { return respondError(res, e); }
}
