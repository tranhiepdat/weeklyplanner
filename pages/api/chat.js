// Chat-to-create-task assistant.
// Model is overridable via AI_MODEL env. Default Claude Sonnet 4.6 — one tier
// below Opus: noticeably cheaper/fewer tokens while staying very accurate at
// date/session/project reasoning. Set AI_MODEL to change (e.g. claude-opus-4-8
// for max accuracy, or claude-haiku-4-5 for the cheapest option).
const MODEL = process.env.AI_MODEL || "claude-sonnet-4-6";
const TASK_TYPES = ["💼 Works", "🧍 Personal", "🏥 Health", "🧹 Chore", "👨‍👩‍👧 Family", "🎮 Entertainment", "🏖️ Vacation"];
const SESSIONS = ["🌅 Sáng", "🏢 Office (11–7h)", "🌙 Tối"];
const PROJECTS = ["🔷 Nacon", "🟣 VP91", "🟠 KUNVANDONG", "🟢 AOV26", "Nội Bộ"];
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

  const { messages = [], weekDays = [], tasks = [] } = req.body || {};

  const vn = vnNow();
  const today = vn.dateStr;
  const phase = vn.hour < 11 ? "🌅 Sáng" : vn.hour < 19 ? "🏢 Office (11–7h)" : "🌙 Tối";

  // Explicit lookup table (past week → +2 weeks) so the model NEVER computes dates itself
  const dateTable = [];
  for (let i = -7; i < 14; i++) {
    const d = addDays(today, i);
    const rel = i === 0 ? "  ← HÔM NAY" : i === 1 ? "  ← ngày mai" : i === 2 ? "  ← ngày kia"
      : i === -1 ? "  ← hôm qua" : i === -2 ? "  ← hôm kia" : "";
    dateTable.push(`${d} = ${VN_DOW[dowOf(d)]}${rel}`);
  }

  // Learn Dat's tagging patterns from existing tasks + list tasks the AI can reschedule
  const distinct = (arr, cap) => [...new Set(arr)].slice(0, cap);
  const byType = {}, byProj = {};
  (tasks || []).forEach(t => {
    if (!t || !t.name) return;
    if (t.taskType) (byType[t.taskType] = byType[t.taskType] || []).push(t.name);
    (Array.isArray(t.project) ? t.project : []).forEach(p => (byProj[p] = byProj[p] || []).push(t.name));
  });
  const typeHints = Object.entries(byType).map(([k, v]) => `  ${k}: ${distinct(v, 6).join(", ")}`).join("\n");
  const projHints = Object.entries(byProj).map(([k, v]) => `  ${k}: ${distinct(v, 5).join(", ")}`).join("\n");
  const lo = addDays(today, -7), hi = addDays(today, 14);
  const movable = (tasks || [])
    .filter(t => t && t.id && t.name && t.date && t.date >= lo && t.date <= hi)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .slice(0, 40);
  const refList = movable.map((t, i) => `  #${i + 1} ${t.name} — ${t.date}${t.done ? " (đã xong)" : ""}`).join("\n");

  const sys = `Bạn là trợ lý lập kế hoạch thân thiện, tích cực, đồng hành theo tinh thần Công giáo, trò chuyện tiếng Việt với Dat (Matthew) — một người làm VFX/animation.

THỜI GIAN HIỆN TẠI (giờ Việt Nam): ${VN_DOW[dowOf(today)]}, ${today}, ${String(vn.hour).padStart(2, "0")}:${vn.minute}. Đang là ca: ${phase}.

BẢNG NGÀY (BẮT BUỘC dùng đúng các ngày trong bảng này — TUYỆT ĐỐI KHÔNG tự suy/tự tính ngày):
${dateTable.join("\n")}
Tuần Dat đang xem trên app: ${weekDays.length ? `${weekDays[0]} → ${weekDays[weekDays.length - 1]}` : "(không rõ)"}.

Cách hiểu ngày:
- "hôm nay"/không nói ngày nhưng ngụ ý làm ngay → ${today}.
- "mai"/"ngày mai" → ${addDays(today, 1)}; "ngày kia"/"mốt" → ${addDays(today, 2)}.
- "hôm qua" → ${addDays(today, -1)}; "hôm kia" → ${addDays(today, -2)}. ĐƯỢC PHÉP tạo hoặc dời việc vào NGÀY ĐÃ QUA trong bảng (vd ghi lại việc đã làm hôm qua) — cứ dùng ngày quá khứ trong bảng, không được từ chối.
- "thứ X" (không nói tuần nào) → lấy NGÀY thứ X gần nhất SẮP TỚI trong bảng. "thứ X tuần sau" → tuần kế tiếp; "thứ X tuần trước" → tuần trước (ngày quá khứ trong bảng).
- Luôn đối chiếu thứ trong bảng để chắc chắn ngày↔thứ khớp nhau.
${typeHints || projHints ? `\nTAG DAT HAY DÙNG — HỌC theo cách Dat gán tag: việc mới có tên/ý na ná việc cũ thì gán taskType (và dự án) GIỐNG như vậy. Vd nếu "đi bán" từng là 🧍 Personal thì lần sau cũng để Personal.\n${typeHints}${projHints ? "\n  — Dự án —\n" + projHints : ""}\n` : ""}${movable.length ? `\nVIỆC HIỆN CÓ (để DỜI ngày / TICK xong / đặt ƯU TIÊN — tham chiếu bằng số #n, KHÔNG tạo lại việc đã có trong đây):\n${refList}\n` : ""}
QUY TẮC TẠO TASK — chính xác là quan trọng nhất, THÀ HỎI LẠI CÒN HƠN ĐOÁN SAI:
- "taskType" ∈ ${JSON.stringify(TASK_TYPES)} — suy luận hợp lý, nếu không chắc để "".
- "session" ∈ ${JSON.stringify(SESSIONS)} hoặc "". CHỈ đặt khi user nói rõ hoặc ngụ ý rõ buổi (sáng/trưa/chiều/tối, hoặc giờ hành chính/đi làm = Office). KHÔNG suy bừa buổi — không rõ thì để "".
- "project" mỗi phần tử ∈ ${JSON.stringify(PROJECTS)}. CHỈ đặt khi user nhắc tên dự án. KUNVANDONG = phim cá nhân; VP91 = studio (tool UE/sequencer); Nacon = công ty/khách; AOV26 = dự án công ty (công việc ở cty); Nội Bộ = dự án nội bộ công ty. Không rõ thì để [].
- "priority" ∈ ${JSON.stringify(PRIORITIES)}. Chỉ đặt khi user nói gấp/khẩn (🔴 Urgent) hoặc quan trọng (🟡 Important). Bình thường để [].
- "tier": mức ƯU TIÊN TRONG NGÀY — KHÁC HẲN "priority" ở trên (đây là 🔥 đánh dấu việc cần làm trước trong ngày, không phải tag Urgent/Important). Đặt "must" khi user nói HOẶC NGỤ Ý việc đó cần ưu tiên trong ngày: phải xong hôm đó, cần làm trước/làm ngay, gấp, deadline trong ngày, quan trọng — KỂ CẢ khi họ không dùng chữ "ưu tiên". Việc lặt vặt/thong thả thì để "". Nếu đã đặt "priority" là 🔴 Urgent hoặc 🟡 Important thì "tier" thường cũng là "must". TIẾT CHẾ: 🔥 chỉ có ý nghĩa khi nó HIẾM — việc không 🔥 sẽ bị làm mờ đi trên giao diện, nên nếu đánh "must" cho mọi việc thì mất tác dụng. Thường chỉ 1–3 việc quan trọng nhất trong ngày mới là "must"; còn lại để "".
- "icon": 1 emoji hợp ngữ cảnh.
- "date": 1 ngày trong bảng (YYYY-MM-DD).
- Nhiều việc trong 1 câu → tách thành nhiều task.
- DỜI/ĐỔI NGÀY việc ĐÃ CÓ: nếu user muốn chuyển một việc đang có sang ngày khác (vd "dời đi bán qua mai", "chuyển họp sang thứ 5", "đẩy mấy việc hôm nay sang mai") → KHÔNG tạo task mới. Thêm vào "moves": mỗi phần tử {"ref": <số #n trong VIỆC HIỆN CÓ>, "date": "<ngày mới trong bảng>"}. Nếu không tìm thấy việc khớp trong danh sách thì hỏi lại cho rõ.
- TICK XONG việc ĐÃ CÓ: nếu user báo đã làm/đã xong một việc (vd "xong đi chợ rồi", "tick giúp việc X", "làm xong họp rồi") → thêm vào "dones": mỗi phần tử {"ref": <số #n>, "done": true}. Nếu user muốn BỎ tick (đánh dấu chưa xong lại) → "done": false.
- ĐẶT ƯU TIÊN việc ĐÃ CÓ: nếu user muốn ưu tiên / bỏ ưu tiên một việc (vd "ưu tiên việc X", "đánh dấu X quan trọng, làm trước", "hạ ưu tiên Y", "để dành Z") → thêm vào "tiers": mỗi phần tử {"ref": <số #n>, "tier": "must"|"optional"}. must = 🔥 Ưu tiên (làm ngay, nổi bật); optional = 💤 Ưu tiên thấp (để dành). Đây là mức ưu tiên trong ngày, KHÁC với trường "priority" (Urgent/Important) khi tạo việc mới.

KHI NÀO HỎI LẠI (đặt "needsClarification": true và "tasks": []):
- User muốn thêm việc nhưng KHÔNG rõ NGÀY và không ngụ ý "hôm nay" → hỏi gọn ngày nào.
- Không rõ user muốn làm GÌ (việc mơ hồ) → hỏi lại cho rõ.
- Lưu ý: buổi/dự án/loại nếu không rõ thì CỨ ĐỂ TRỐNG, KHÔNG cần hỏi (chỉ hỏi khi thiếu "việc gì" hoặc "ngày nào").
- Nếu chỉ trò chuyện/hỏi han, không yêu cầu thêm việc → "tasks": [], trả lời ấm áp.

CHỈ trả về DUY NHẤT một JSON hợp lệ (KHÔNG markdown, KHÔNG chữ nào ngoài JSON):
{"reply":"<câu trả lời tiếng Việt ngắn gọn, ấm áp>","needsClarification":<true|false>,"tasks":[{"name":"...","icon":"<1 emoji>","taskType":"...","session":"...","priority":[],"project":[],"date":"YYYY-MM-DD","tier":"must|"}],"moves":[{"ref":<số #n>,"date":"YYYY-MM-DD"}],"dones":[{"ref":<số #n>,"done":true}],"tiers":[{"ref":<số #n>,"tier":"must"}]}
- Khi tạo task: "reply" xác nhận ngắn gọn đã thêm việc gì + ngày/thứ (vd "đã thêm 'đi chợ' vào Thứ Ba ${addDays(today, 1)}"), giọng khích lệ.
- Khi dời việc: "reply" xác nhận đã dời việc gì sang ngày/thứ nào.
- Khi tick xong / đặt ưu tiên: "reply" xác nhận đã tick việc gì, hoặc đã đặt ưu tiên (🔥) / hạ ưu tiên (💤) việc gì.
- Khi hỏi lại: "reply" là câu hỏi gọn gàng, mọi mảng ("tasks","moves","dones","tiers") để [].`;

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
      const outTasks = (obj.needsClarification ? [] : (Array.isArray(obj.tasks) ? obj.tasks : []))
        // keep only tasks that at least have a name + a date
        .filter(t => t && t.name && t.date)
        // normalize the day-priority tier: only "must" is meaningful (else default/low)
        .map(t => ({ ...t, tier: t.tier === "must" ? "must" : undefined }));
      // resolve #ref → real task id from `movable`, for reschedule / done / priority
      const moves = [], dones = [], tiers = [];
      if (!obj.needsClarification) {
        (Array.isArray(obj.moves) ? obj.moves : []).forEach(mv => {
          const t = movable[Number(mv && mv.ref) - 1];
          if (t && typeof mv.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(mv.date)) moves.push({ id: t.id, name: t.name, date: mv.date });
        });
        (Array.isArray(obj.dones) ? obj.dones : []).forEach(dv => {
          const t = movable[Number(dv && dv.ref) - 1];
          if (t) dones.push({ id: t.id, name: t.name, done: dv.done !== false }); // default = mark done
        });
        (Array.isArray(obj.tiers) ? obj.tiers : []).forEach(tv => {
          const t = movable[Number(tv && tv.ref) - 1];
          const tier = tv && (tv.tier === "must" || tv.tier === "optional") ? tv.tier : null;
          if (t && tier) tiers.push({ id: t.id, name: t.name, tier });
        });
      }
      const did = outTasks.length || moves.length || dones.length || tiers.length;
      return res.status(200).json({ reply: obj.reply || (did ? "Đã xong!" : "Mình chưa rõ ý bạn lắm, nói lại giúp mình nha!"), tasks: outTasks, moves, dones, tiers, needsClarification: !!obj.needsClarification });
    }
    return res.status(200).json({ reply: text || "Mình chưa rõ ý bạn lắm, nói lại giúp mình nha!", tasks: [] });
  } catch (e) {
    return res.status(200).json({ reply: "Có lỗi kết nối tới AI. Thử lại nhé!", tasks: [], error: String(e).slice(0, 160) });
  }
}
