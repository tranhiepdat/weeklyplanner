const COOKIE_PREFIX = "wp_goals_";
const COOKIE_PARTS = 4;
const PART_SIZE = 3200;

function encode(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}
function decode(value) {
  try { return JSON.parse(Buffer.from(value, "base64url").toString("utf8")); } catch { return []; }
}
function readGoals(req) {
  const raw = Array.from({ length: COOKIE_PARTS }, (_, i) => req.cookies?.[COOKIE_PREFIX + i] || "").join("");
  const goals = raw ? decode(raw) : [];
  return Array.isArray(goals) ? goals : [];
}
function writeGoals(res, goals) {
  const raw = encode(goals);
  const headers = [];
  for (let i = 0; i < COOKIE_PARTS; i++) {
    const part = raw.slice(i * PART_SIZE, (i + 1) * PART_SIZE);
    headers.push(`${COOKIE_PREFIX}${i}=${part}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly`);
  }
  res.setHeader("Set-Cookie", headers);
}
function cleanMilestones(items) {
  return (Array.isArray(items) ? items : []).slice(0, 5).map((m, i) => ({
    id: String(m?.id || `m-${Date.now()}-${i}`).slice(0, 120),
    text: String(m?.text || "").trim().slice(0, 180),
    done: !!m?.done,
  })).filter(m => m.text);
}
function normalize(goal, old = null) {
  const now = new Date().toISOString();
  return {
    ...(old || {}),
    id: old?.id || String(goal?.id || `goal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    uid: old?.uid || String(goal?.uid || `g-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
    title: String(goal?.title || old?.title || "").trim().slice(0, 160),
    emoji: String(goal?.emoji || old?.emoji || "🎯").slice(0, 8),
    deadline: String(goal?.deadline || old?.deadline || "").slice(0, 10),
    weeklyOutcome: String(goal?.weeklyOutcome ?? old?.weeklyOutcome ?? "").trim().slice(0, 220),
    milestones: cleanMilestones(goal?.milestones ?? old?.milestones ?? []),
    status: ["active", "archived", "achieved"].includes(goal?.status) ? goal.status : (old?.status || "active"),
    createdAt: old?.createdAt || goal?.createdAt || now,
    updatedAt: goal?.updatedAt || now,
    achievedAt: goal?.achievedAt ?? old?.achievedAt ?? null,
    archivedAt: goal?.archivedAt ?? old?.archivedAt ?? null,
  };
}

export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const goals = readGoals(req);

  if (req.method === "GET") return res.status(200).json({ goals });

  if (req.method === "POST") {
    const active = goals.filter(g => g.status === "active").length;
    if (active >= 3) return res.status(409).json({ error: "Active goal limit reached", goals });
    const nextGoal = normalize(req.body || {});
    if (!nextGoal.title || !nextGoal.milestones.length) return res.status(400).json({ error: "Goal needs a title and milestones" });
    const next = [...goals, nextGoal];
    writeGoals(res, next);
    return res.status(200).json({ goals: next, goal: nextGoal });
  }

  if (req.method === "PATCH") {
    const id = req.body?.id;
    const incoming = req.body?.goal || {};
    const idx = goals.findIndex(g => g.id === id);
    if (idx < 0) return res.status(404).json({ error: "Goal not found", goals });
    const old = goals[idx];
    const nextGoal = normalize(incoming, old);
    if (old.status !== "active" && nextGoal.status === "active" && goals.filter(g => g.status === "active").length >= 3)
      return res.status(409).json({ error: "Active goal limit reached", goals });
    const next = [...goals]; next[idx] = nextGoal;
    writeGoals(res, next);
    return res.status(200).json({ goals: next, goal: nextGoal });
  }

  return res.status(405).end();
}
