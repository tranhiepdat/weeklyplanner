const MODEL = process.env.AI_MODEL || "claude-sonnet-4-6";

function vnToday() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function extractJson(text) {
  const clean = String(text || "").replace(/```json|```/g, "").trim();
  try { return JSON.parse(clean); } catch {}
  const a = clean.indexOf("{"); const b = clean.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(clean.slice(a, b + 1)); } catch {} }
  return null;
}
function cleanGoal(raw, today) {
  const fallbackDeadline = addDays(today, 90);
  const items = (Array.isArray(raw?.milestones) ? raw.milestones : []).slice(0, 5)
    .map((x, i) => ({ id: `m-${Date.now()}-${i}`, text: String(typeof x === "string" ? x : x?.text || "").trim().slice(0, 160), done: false }))
    .filter(x => x.text);
  return {
    title: String(raw?.title || "").trim().slice(0, 150),
    emoji: String(raw?.emoji || "🎯").trim().slice(0, 8) || "🎯",
    deadline: /^\d{4}-\d{2}-\d{2}$/.test(String(raw?.deadline || "")) ? raw.deadline : fallbackDeadline,
    weeklyOutcome: String(raw?.weeklyOutcome || "").trim().slice(0, 180),
    milestones: items.length ? items : [
      { id: `m-${Date.now()}-0`, text: "Xác định bước đầu tiên và tiêu chí hoàn thành", done: false },
      { id: `m-${Date.now()}-1`, text: "Hoàn thành phần cốt lõi của mục tiêu", done: false },
      { id: `m-${Date.now()}-2`, text: "Kiểm tra kết quả cuối và chốt mục tiêu", done: false },
    ],
    status: "active",
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!KEY) return res.status(503).json({ error: "AI chưa được cấu hình trên server." });

  const prompt = String(req.body?.prompt || "").trim();
  if (!prompt) return res.status(400).json({ error: "Hãy mô tả mục tiêu bạn muốn đạt được." });
  const activeGoals = (Array.isArray(req.body?.activeGoals) ? req.body.activeGoals : []).slice(0, 3);
  const today = vnToday();
  const day90 = addDays(today, 90);

  const system = `Bạn là một goal-planning coach. Nhiệm vụ: biến mong muốn của người dùng thành MỘT goal 90 ngày rõ, thực tế, đo được và dễ hành động.

Hôm nay: ${today}. Mốc 90 ngày: ${day90}.

QUY TẮC:
- Chỉ tạo đúng 1 goal.
- title phải mô tả KẾT QUẢ, không phải thói quen mơ hồ. Ngắn, tự nhiên, tiếng Việt nếu user nói tiếng Việt.
- deadline mặc định trong vòng 90 ngày. Nếu user nói deadline cụ thể thì tôn trọng nếu hợp lý.
- milestones: 3–5 cột mốc tuần tự, mỗi cái là một trạng thái/kết quả có thể kiểm chứng. Không biến thành checklist li ti.
- weeklyOutcome: đúng MỘT kết quả thực tế có thể đạt trong 7 ngày tới, phù hợp với việc user đang ở đầu hành trình. Tránh viết kiểu "tiếp tục cố gắng".
- emoji: 1 emoji hợp ngữ cảnh.
- Đừng trùng với active goals hiện có nếu yêu cầu của user thực chất là cùng một mục tiêu; nếu có overlap, vẫn tạo goal nhưng làm scope khác biệt rõ ràng.
- Không thêm giải thích ngoài JSON.

Active goals hiện có:
${activeGoals.length ? activeGoals.map((g, i) => `${i + 1}. ${g.title || ""}${g.deadline ? ` — ${g.deadline}` : ""}`).join("\n") : "(chưa có)"}

CHỈ trả về JSON:
{"title":"...","emoji":"...","deadline":"YYYY-MM-DD","weeklyOutcome":"...","milestones":["...","...","..."]}`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 900,
        temperature: 0.35,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!r.ok) {
      const text = await r.text();
      return res.status(502).json({ error: text.includes("credit balance") ? "AI account đang hết credit." : "AI đang bận, thử lại sau một chút nhé." });
    }
    const data = await r.json();
    const text = (data.content || []).filter(x => x.type === "text").map(x => x.text).join("\n");
    const obj = extractJson(text);
    if (!obj) return res.status(502).json({ error: "AI trả về kết quả chưa đúng định dạng. Thử lại nhé." });
    const goal = cleanGoal(obj, today);
    if (!goal.title) return res.status(502).json({ error: "AI chưa xác định được goal đủ rõ. Mô tả cụ thể hơn một chút nhé." });
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ goal });
  } catch (e) {
    return res.status(500).json({ error: "Không kết nối được AI lúc này.", detail: String(e).slice(0, 120) });
  }
}
