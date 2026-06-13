const MODEL = "claude-haiku-4-5-20251001";
const TASK_TYPES = ["💼 Works", "🧍 Personal", "🏥 Health", "🧹 Chore", "👨‍👩‍👧 Family", "🎮 Entertainment", "🏖️ Vacation"];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!KEY) return res.status(200).json({ reply: "Mình chưa được cắm chìa khoá AI (ANTHROPIC_API_KEY) trên Vercel nên chưa chat được nha. Khi nào bạn thêm vào là mình hỗ trợ liền! 🙏", tasks: [], noKey: true });

  const { messages = [], today, weekDays = [] } = req.body || {};

  const sys = `Bạn là trợ lý lập kế hoạch thân thiện, tích cực, đồng hành theo tinh thần Công giáo, trò chuyện tiếng Việt với người dùng tên Dat (Matthew) — một người làm VFX/animation.
Hôm nay là ${today}. Tuần đang xem gồm các ngày: ${weekDays.join(", ")}.

Nhiệm vụ: trò chuyện ấm áp, và KHI người dùng muốn thêm việc thì tạo task giúp họ.

LUÔN trả lời DUY NHẤT bằng một JSON object hợp lệ (KHÔNG markdown, KHÔNG chữ nào ngoài JSON), dạng:
{"reply":"<câu trả lời tiếng Việt ngắn gọn, ấm áp>","tasks":[{"name":"...","icon":"<1 emoji>","taskType":"...","session":"...","priority":[],"project":[],"date":"YYYY-MM-DD"}]}

Quy tắc:
- "tasks" là [] nếu người dùng chỉ trò chuyện, hỏi han, không yêu cầu tạo việc.
- "taskType" ∈ ${JSON.stringify(TASK_TYPES)} hoặc "" nếu không rõ.
- "session" ∈ ["🌅 Sáng","🏢 Office (11–7h)","🌙 Tối",""] — sáng/chiều-tối; chọn "🏢 Office (11–7h)" nếu là việc công ty giờ hành chính.
- "priority" mỗi phần tử ∈ ["🔴 Urgent","🟡 Important"]; để [] nếu bình thường.
- "project" mỗi phần tử ∈ ["🔷 Nacon","🟣 VP91","🟠 KUNVANDONG"]; KUNVANDONG = phim cá nhân, VP91 = studio (tool UE/sequencer).
- "icon": 1 emoji hợp ngữ cảnh.
- "date": suy ra ngày YYYY-MM-DD. Mặc định = hôm nay nếu không nói rõ; "mai"/"ngày mai" = ngày kế; "T2/T3..." trong tuần đang xem; v.v.
- Nếu người dùng kể nhiều việc một lúc, tách thành nhiều task.
- "reply" nên xác nhận ngắn gọn đã thêm việc gì (nếu có), giọng khích lệ.`;

  const anthropicMessages = messages
    .filter(m => m && (m.role === "user" || m.role === "assistant") && m.content)
    .map(m => ({ role: m.role, content: String(m.content) }));
  if (!anthropicMessages.length) return res.status(200).json({ reply: "Bạn muốn thêm việc gì nào? 😊", tasks: [] });

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1024, system: sys, messages: anthropicMessages }),
    });
    if (!r.ok) {
      const e = await r.text();
      const lowCredit = e.includes("credit balance");
      return res.status(200).json({
        reply: lowCredit
          ? "Tài khoản AI đang hết credit rồi 😅 Bạn nạp thêm ở Plans & Billing nhé, xong là mình chat được liền!"
          : "Xin lỗi, AI đang trục trặc xíu. Thử lại sau nha!",
        tasks: [], error: e.slice(0, 160),
      });
    }
    const data = await r.json();
    const text = (data.content || []).filter(c => c.type === "text").map(c => c.text).join("\n").trim();
    let parsed = { reply: text || "Mình chưa rõ ý bạn lắm, nói lại giúp mình nha!", tasks: [] };
    try {
      const obj = JSON.parse(text.replace(/```json|```/g, "").trim());
      parsed = { reply: obj.reply || "Đã xong!", tasks: Array.isArray(obj.tasks) ? obj.tasks : [] };
    } catch { /* keep raw text as reply */ }
    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(200).json({ reply: "Có lỗi kết nối tới AI. Thử lại nhé!", tasks: [], error: String(e).slice(0, 160) });
  }
}
