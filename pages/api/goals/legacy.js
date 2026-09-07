import { readLegacyGoals } from "../../../lib/goal-import.js";
export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).end();
  return res.status(200).json(readLegacyGoals(req));
}
