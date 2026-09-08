import { ApiError, respondError } from "../../lib/notion.js";
import { ensureGoalsSchema, listGoals, getGoal, writeGoal, serializeGoals, mergeMilestoneDraft, ACTIVE_LIMIT } from "../../lib/goals.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "POST", "PATCH"].includes(req.method)) return res.status(405).end();
  try {
    await ensureGoalsSchema();
    if (req.method === "GET") return res.status(200).json({ goals: await listGoals() });
    const result = await serializeGoals(async () => {
      const goals = await listGoals();
      const old = req.method === "PATCH" ? await getGoal(req.body?.id) : goals.find(g => g.uid === req.body?.uid);
      if (req.method === "POST" && old) return { goal: old, goals };
      const changes = req.method === "PATCH" ? { ...req.body?.goal } : { ...req.body };
      if ((!old || old.status !== "active") && (changes.status || "active") === "active" && goals.filter(g => g.status === "active").length >= ACTIVE_LIMIT)
        throw new ApiError("Active goal limit reached", 409);
      if (old && Array.isArray(changes.milestones) && Array.isArray(changes.milestoneBase)) {
        changes.milestones = mergeMilestoneDraft(changes.milestones, changes.milestoneBase, old.milestones);
        delete changes.milestoneBase;
      }
      if (changes.milestone) {
        if (!old?.milestones.some(m => m.id === changes.milestone.id)) throw new ApiError("Milestone not found", 404);
        changes.milestones = old.milestones.map(m => m.id === changes.milestone.id ? { ...m, done: !!changes.milestone.done } : m);
        delete changes.milestone;
      }
      const goal = await writeGoal(changes, old);
      return { goal, goals: [...goals.filter(g => g.uid !== goal.uid), goal] };
    });
    return res.status(200).json(result);
  } catch (e) { return respondError(res, e); }
}
