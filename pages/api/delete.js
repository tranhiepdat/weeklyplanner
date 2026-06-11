export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "DELETE") return res.status(405).end();

  const NOTION_KEY = process.env.NOTION_API_KEY;
  if (!NOTION_KEY) return res.status(500).json({ error: "Missing NOTION_API_KEY" });

  const { id } = req.body;
  if (!id) return res.status(400).json({ error: "Missing id" });

  try {
    // Archiving a page moves it to Notion trash (recoverable)
    const r = await fetch(`https://api.notion.com/v1/pages/${id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${NOTION_KEY}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({ archived: true }),
    });

    if (!r.ok) {
      const err = await r.json();
      return res.status(r.status).json({ error: err.message });
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
