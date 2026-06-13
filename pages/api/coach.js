const MODEL = "claude-haiku-4-5-20251001";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!KEY) return res.status(200).json({ error: "no_key" });

  const { dayLabel, summary } = req.body || {};
  if (!summary) return res.status(400).json({ error: "no_summary" });

  const sys = `Bạn là người đồng hành tinh thần ấm áp, tích cực, theo tinh thần Công giáo, viết tiếng Việt cho Dat (một người làm VFX/animation).
Hãy viết một BÁO CÁO NGÀY ngắn gọn, chân thành, gồm các phần (mỗi phần 1 dòng, có emoji đầu dòng):
- Một dòng tổng quan tình trạng (vd: đã xong mấy/mấy việc, được bao nhiêu điểm, nghiêng về lĩnh vực nào).
- ✅ Việc đã xong: liệt kê ngắn tên các việc đã hoàn thành (nếu có).
- ⏳ Việc còn chờ: liệt kê ngắn các việc chưa xong như một lời nhắc nhẹ nhàng (nếu có).
- 💪 Một câu động viên chân thành, hợp tình hình (đừng sáo rỗng).
Ngắn gọn, ấm áp, không dài dòng. Nếu không có việc nào thì động viên nghỉ ngơi.

Trả lời DUY NHẤT bằng JSON (không markdown): {"title":"<tiêu đề ngắn có 1 emoji>","body":"<nội dung báo cáo, dùng \\n để xuống dòng giữa các phần>","verse":"<1 câu Kinh Thánh + nguồn, hợp tâm trạng/ tình hình>"}`;

  const userMsg = `Ngày: ${dayLabel}
Dữ liệu (điểm chỉ tính việc đã hoàn thành):
${JSON.stringify(summary)}`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 700, system: sys, messages: [{ role: "user", content: userMsg }] }),
    });
    if (!r.ok) { const e = await r.text(); return res.status(200).json({ error: e.includes("credit balance") ? "low_credit" : "api_error" }); }
    const data = await r.json();
    const text = (data.content || []).filter(c => c.type === "text").map(c => c.text).join("\n").trim();
    try {
      const obj = JSON.parse(text.replace(/```json|```/g, "").trim());
      return res.status(200).json({ title: obj.title || "", body: obj.body || "", verse: obj.verse || "" });
    } catch {
      return res.status(200).json({ title: "", body: text, verse: "" });
    }
  } catch (e) {
    return res.status(200).json({ error: "fetch_error" });
  }
}
