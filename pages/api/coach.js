// Daily AI coach report. Model overridable via AI_MODEL (default Claude Sonnet 4.6 —
// one tier below Opus: cheaper/fewer tokens, still accurate). Calls are cached
// client-side per day-signature, so credit usage stays low.
const MODEL = process.env.AI_MODEL || "claude-sonnet-4-6";

function extractJson(text) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  const s = cleaned.indexOf("{"), e = cleaned.lastIndexOf("}");
  if (s >= 0 && e > s) { try { return JSON.parse(cleaned.slice(s, e + 1)); } catch {} }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!KEY) return res.status(200).json({ error: "no_key" });

  const { dayLabel, summary } = req.body || {};
  if (!summary) return res.status(400).json({ error: "no_summary" });

  const sys = `Bạn là người đồng hành tinh thần ấm áp, tích cực, theo tinh thần Công giáo, viết tiếng Việt cho Dat (một người làm VFX/animation).
Viết một BÁO CÁO NGÀY ngắn gọn, CHU ĐÁO, gồm các phần sau (mỗi phần 1 dòng, có emoji đầu dòng; BỎ phần nào nếu không có dữ liệu):
- Dòng tổng quan: xong mấy/mấy VIỆC (nói theo SỐ VIỆC, không nhấn vào điểm số), nghiêng về lĩnh vực nào.
- ✅ Đã xong: tên vài việc đã hoàn thành.
- ⏳ Còn lại: nhắc việc chưa xong. ƯU TIÊN SỐ 1: nếu có "mustPending" (việc BẮT BUỘC phải xong hôm nay theo kế hoạch của Dat) thì nhắc ĐẦU TIÊN, mạnh mẽ nhất, nói rõ đây là việc bắt buộc. Kế đến là việc 🔴 Urgent / 🟡 Important ("priorityPending"). Sau đó các việc còn lại theo đúng thứ tự "pendingInOrder" (thứ tự Dat đã tự sắp). Có thể gom theo buổi (Sáng/Office/Tối) cho dễ theo dõi.
- 💪 Một câu động viên chân thành, hợp tình hình.

QUAN TRỌNG — nhắc đúng thời điểm dựa vào "now" (giờ hiện tại) và "phase" (ca hiện tại), CHỈ khi "isToday" = true:
- Ca "Sáng" còn việc Sáng chưa xong → nhắc nhẹ ráng làm nốt TRƯỚC KHI qua Office.
- Ca "Office" → nhắc việc Office/công việc còn lại; việc Sáng sót thì nhắc tranh thủ.
- Ca "Tối" → nhắc việc Tối còn lại, giọng nhẹ nhàng cuối ngày.
Nếu KHÔNG phải hôm nay thì viết như bản tổng kết, không nhắc theo giờ.

Ngắn gọn, ấm áp, KHÔNG dài dòng, không sáo rỗng, không dạy đời. Nói theo số việc thay vì điểm.
Trả lời DUY NHẤT bằng JSON (không markdown): {"title":"<tiêu đề ngắn có 1 emoji>","body":"<nội dung báo cáo, dùng \\n để xuống dòng giữa các phần>","verse":"<1 câu Kinh Thánh + nguồn, hợp tâm trạng/tình hình>"}`;

  const userMsg = `Ngày: ${dayLabel}
Dữ liệu (điểm chỉ là phụ; ưu tiên nói theo số việc & độ ưu tiên):
${JSON.stringify(summary)}`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 900, system: sys, messages: [{ role: "user", content: userMsg }] }),
    });
    if (!r.ok) { const e = await r.text(); return res.status(200).json({ error: e.includes("credit balance") ? "low_credit" : "api_error" }); }
    const data = await r.json();
    const text = (data.content || []).filter(c => c.type === "text").map(c => c.text).join("\n").trim();
    const obj = extractJson(text);
    if (obj) return res.status(200).json({ title: obj.title || "", body: obj.body || "", verse: obj.verse || "" });
    return res.status(200).json({ title: "", body: text, verse: "" });
  } catch (e) {
    return res.status(200).json({ error: "fetch_error" });
  }
}
