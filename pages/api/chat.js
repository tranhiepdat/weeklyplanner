// Chat-to-create-task assistant.
// Model is overridable via AI_MODEL env. Default Claude Sonnet 4.6 — one tier
// below Opus: noticeably cheaper/fewer tokens while staying very accurate at
// date/session/project reasoning. Set AI_MODEL to change (e.g. claude-opus-4-8
// for max accuracy, or claude-haiku-4-5 for the cheapest option).
const MODEL = process.env.AI_MODEL || "claude-sonnet-4-6";
const TASK_TYPES = ["💼 Works", "🧍 Personal", "🏥 Health", "🧹 Chore", "👨‍👩‍👧 Family", "🎮 Entertainment", "🏖️ Vacation"];
const SESSIONS = ["🌅 Sáng", "🏢 Office (11–7h)", "🌙 Tối"];
const PROJECTS = ["🔷 Nacon", "🟣 VP91", "🟠 KUNVANDONG"];
const PRIORITIES = ["🔴 Urgent", "🟡 Important"];
const VN_DOW = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

// --- Vietnam-time helpers (server timezone independent) ---
function vnNow() {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const p = Object.fromEntries(f.formatToParts(new Date()).map(x => [x.type, x.value]));
  return { dateStr: `${p.year}-${p.month}-${p.day}`, hour: parseInt(p.hour, 10), minute: p.minute };
}
// midday-UTC anchor keeps day-of-week / arithmetic free of timezone edge cases
function addDays(isoDate, n) {
  const d = new Date(isoDate + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function dowOf(isoDate) { return new Date(isoDate + "T12:00:00Z").getUTCDay(); }

// Extract the first balanced {...} JSON object from a model reply
function extractJson(text) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch {}
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!KEY) return res.status(200).json({ reply: "Mình chưa được cắm chìa khoá AI (ANTHROPIC_API_KEY) trên Vercel nên chưa chat được nha. Khi nào bạn thêm vào là mình hỗ trợ liền! 🙏", tasks: [], noKey: true });

  const { messages = [], weekDays = [] } = req.body || {};

  const vn = vnNow();
  const today = vn.dateStr;
  const phase = vn.hour < 11 ? "🌅 Sáng" : vn.hour < 19 ? "🏢 Office (11–7h)" : "🌙 Tối";

  // Explicit 14-day lookup table so the model NEVER has to compute dates itself
  const dateTable = [];
  for (let i = 0; i < 14; i++) {
    const d = addDays(today, i);
    const rel = i === 0 ? "  ← HÔM NAY" : i === 1 ? "  ← ngày mai" : i === 2 ? "  ← ngày kia" : "";
    dateTable.push(`${d} = ${VN_DOW[dowOf(d)]}${rel}`);
  }

  const sys = `Bạn là trợ lý lập kế hoạch thân thiện, tích cực, đồng hành theo tinh thần Công giáo, trò chuyện tiếng Việt với Dat (Matthew) — một người làm VFX/animation.

THỜI GIAN HIỆN TẠI (giờ Việt Nam): ${VN_DOW[dowOf(today)]}, ${today}, ${String(vn.hour).padStart(2, "0")}:${vn.minute}. Đang là ca: ${phase}.

BẢNG NGÀY (BẮT BUỘC dùng đúng các ngày trong bảng này — TUYỆT ĐỐI KHÔNG tự suy/tự tính ngày):
${dateTable.join("\n")}
Tuần Dat đang xem trên app: ${weekDays.length ? `${weekDays[0]} → ${weekDays[weekDays.length - 1]}` : "(không rõ)"}.

Cách hiểu ngày:
- "hôm nay"/không nói ngày nhưng ngụ ý làm ngay → ${today}.
- "mai"/"ngày mai" → ${addDays(today, 1)}; "ngày kia"/"mốt" → ${addDays(today, 2)}.
- "thứ X" (không nói tuần nào) → lấy NGÀY thứ X gần nhất SẮP TỚI trong bảng. "thứ X tuần sau" → lấy thứ X ở tuần kế tiếp.
- Luôn đối chiếu thứ trong bảng để chắc chắn ngày↔thứ khớp nhau.

QUY TẮC TẠO TASK — chính xác là quan trọng nhất, THÀ HỎI LẠI CÒN HƠN ĐOÁN SAI:
- "taskType" ∈ ${JSON.stringify(TASK_TYPES)} — suy luận hợp lý, nếu không chắc để "".
- "session" ∈ ${JSON.stringify(SESSIONS)} hoặc "". CHỈ đặt khi user nói rõ hoặc ngụ ý rõ buổi (sáng/trưa/chiều/tối, hoặc giờ hành chính/đi làm = Office). KHÔNG suy bừa buổi — không rõ thì để "".
- "project" mỗi phần tử ∈ ${JSON.stringify(PROJECTS)}. CHỈ đặt khi user nhắc tên dự án. KUNVANDONG = phim cá nhân; VP91 = studio (tool UE/sequencer); Nacon = công ty/khách. Không rõ thì để [].
- "priority" ∈ ${JSON.stringify(PRIORITIES)}. Chỉ đặt khi user nói gấp/khẩn (🔴 Urgent) hoặc quan trọng (🟡 Important). Bình thường để [].
- "icon": 1 emoji hợp ngữ cảnh.
- "date": 1 ngày trong bảng (YYYY-MM-DD).
- Nhiều việc trong 1 câu → tách thành nhiều task.

KHI NÀO HỎI LẠI (đặt "needsClarification": true và "tasks": []):
- User muốn thêm việc nhưng KHÔNG rõ NGÀY và không ngụ ý "hôm nay" → hỏi gọn ngày nào.
- Không rõ user muốn làm GÌ (việc mơ hồ) → hỏi lại cho rõ.
- Lưu ý: buổi/dự án/loại nếu không rõ thì CỨ ĐỂ TRỐNG, KHÔNG cần hỏi (chỉ hỏi khi thiếu "việc gì" hoặc "ngày nào").
- Nếu chỉ trò chuyện/hỏi han, không yêu cầu thêm việc → "tasks": [], trả lời ấm áp.

CHỈ trả về DUY NHẤT một JSON hợp lệ (KHÔNG markdown, KHÔNG chữ nào ngoài JSON):
{"reply":"<câu trả lời tiếng Việt ngắn gọn, ấm áp>","needsClarification":<true|false>,"tasks":[{"name":"...","icon":"<1 emoji>","taskType":"...","session":"...","priority":[],"project":[],"date":"YYYY-MM-DD"}]}
- Khi tạo task: "reply" xác nhận ngắn gọn đã thêm việc gì + ngày/thứ (vd "đã thêm 'đi chợ' vào Thứ Ba ${addDays(today, 1)}"), giọng khích lệ.
- Khi hỏi lại: "reply" là câu hỏi gọn gàng, "tasks": [].`;

  const anthropicMessages = messages
    .filter(m => m && (m.role === "user" || m.role === "assistant") && m.content)
    .map(m => ({ role: m.role, content: String(m.content) }));
  if (!anthropicMessages.length) return res.status(200).json({ reply: "Bạn muốn thêm việc gì nào? 😊", tasks: [] });

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1500, system: sys, messages: anthropicMessages }),
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
    const obj = extractJson(text);
    if (obj) {
      const tasks = (obj.needsClarification ? [] : (Array.isArray(obj.tasks) ? obj.tasks : []))
        // keep only tasks that at least have a name + a date in the allowed table
        .filter(t => t && t.name && t.date);
      return res.status(200).json({ reply: obj.reply || (tasks.length ? "Đã thêm xong!" : "Mình chưa rõ ý bạn lắm, nói lại giúp mình nha!"), tasks, needsClarification: !!obj.needsClarification });
    }
    return res.status(200).json({ reply: text || "Mình chưa rõ ý bạn lắm, nói lại giúp mình nha!", tasks: [] });
  } catch (e) {
    return res.status(200).json({ reply: "Có lỗi kết nối tới AI. Thử lại nhé!", tasks: [], error: String(e).slice(0, 160) });
  }
}
