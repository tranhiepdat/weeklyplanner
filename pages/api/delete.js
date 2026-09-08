import { ApiError, notion, respondError } from "../../lib/notion.js";
export default async function handler(req, res) {
  if (!["POST", "DELETE"].includes(req.method)) return res.status(405).end();
  try {
    if (!req.body?.id) throw new ApiError("Missing id", 400);
    await notion(`/pages/${req.body.id}`, { method: "PATCH", body: { archived: true } });
    return res.status(200).json({ ok: true });
  } catch (e) { return respondError(res, e); }
}
