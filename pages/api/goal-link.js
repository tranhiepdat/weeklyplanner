const MODEL = process.env.AI_MODEL || "claude-sonnet-4-6";

function fallbackMatch(task, goals) {
  const words = s => new Set(String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 2));
  const tw = words(task?.name);
  let best = null, bestScore = 0;
  for (const g of goals || []) {
    const corpus = [g.title, g.weeklyOutcome, ...(g.milestones || []).map(m => m.text)].join(" ");
    const gw = words(corpus);
    let hit = 0; tw.forEach(w => { if (gw.has(w)) hit++; });
    const score = tw.size ? hit / tw.size : 0;
    if (score > bestScore) { bestScore = score; best = g; }
  }
  return bestScore >= .34 && best ? { goalId: best.uid, confidence: Math.min(.78, .45 + bestScore / 2) } : { goalId: null, confidence: 0 };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const tasks = Array.isArray(req.body?.tasks) ? req.body.tasks.slice(0, 12) : [];
  const goals = Array.isArray(req.body?.goals) ? req.body.goals.filter(g => g?.status === "active").slice(0, 3) : [];
  if (!tasks.length || !goals.length) return res.status(200).json({ matches: tasks.map(() => ({ goalId: null, confidence: 0 })) });

  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!KEY) return res.status(200).json({ matches: tasks.map(t => fallbackMatch(t, goals)) });

  const goalText = goals.map((g, i) => `${i + 1}. uid=${g.uid}\nTitle: ${g.title}\nThis week: ${g.weeklyOutcome || ""}\nMilestones: ${(g.milestones || []).map(m => m.text).join(" | ")}`).join("\n\n");
  const taskText = tasks.map((t, i) => `${i + 1}. ${t.name}`).join("\n");
  const prompt = `Match each new task to at most one active 90-day goal. Be conservative: if the task is merely vaguely related, return null. A match should mean doing the task materially advances that goal.\n\nGOALS:\n${goalText}\n\nTASKS:\n${taskText}\n\nReturn ONLY JSON: {"matches":[{"taskIndex":0,"goalId":"uid-or-null","confidence":0.0}]}. confidence is 0..1. Use null below 0.72.`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 600, messages: [{ role: "user", content: prompt }] }),
    });
    if (!r.ok) throw new Error("ai failed");
    const data = await r.json();
    const text = (data.content || []).filter(c => c.type === "text").map(c => c.text).join("\n").replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(text);
    const byIndex = new Map((parsed.matches || []).map(m => [Number(m.taskIndex), m]));
    const validIds = new Set(goals.map(g => g.uid));
    const matches = tasks.map((t, i) => {
      const m = byIndex.get(i);
      if (!m || !validIds.has(m.goalId) || Number(m.confidence) < .72) return { goalId: null, confidence: Number(m?.confidence) || 0 };
      return { goalId: m.goalId, confidence: Number(m.confidence) || .72 };
    });
    return res.status(200).json({ matches });
  } catch {
    return res.status(200).json({ matches: tasks.map(t => fallbackMatch(t, goals)) });
  }
}
