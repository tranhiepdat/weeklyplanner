const PUSHUP_DB_ID = "53cf8bf5ccfd46bd835ec480ca45bee4";

export default async function handler(req, res) {
  const NOTION_KEY = process.env.NOTION_API_KEY;
  if (!NOTION_KEY) return res.status(500).json({ error: "Missing NOTION_API_KEY" });

  const headers = {
    Authorization: `Bearer ${NOTION_KEY}`,
    "Content-Type": "application/json",
    "Notion-Version": "2022-06-28",
  };

  // GET — return all counts as { "YYYY-MM-DD": n }
  if (req.method === "GET") {
    try {
      const r = await fetch(`https://api.notion.com/v1/databases/${PUSHUP_DB_ID}/query`, {
        method: "POST", headers, body: JSON.stringify({ page_size: 100 }),
      });
      if (!r.ok) { const e = await r.json(); return res.status(r.status).json({ error: e.message }); }
      const data = await r.json();
      const counts = {};
      data.results.forEach(pg => {
        const day = pg.properties.Day?.title?.[0]?.plain_text;
        const n = pg.properties.Count?.number;
        if (day && typeof n === "number") counts[day] = n;
      });
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ counts });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // POST — upsert absolute count for a date: { date, count }
  if (req.method === "POST") {
    const { date, count } = req.body || {};
    if (!date || typeof count !== "number" || count < 0)
      return res.status(400).json({ error: "Missing date or count" });
    try {
      const q = await fetch(`https://api.notion.com/v1/databases/${PUSHUP_DB_ID}/query`, {
        method: "POST", headers,
        body: JSON.stringify({ filter: { property: "Day", title: { equals: date } } }),
      });
      const qd = await q.json();
      const existing = qd.results?.[0];

      const props = {
        "Day": { title: [{ text: { content: date } }] },
        "Date": { date: { start: date } },
        "Count": { number: count },
      };

      let r;
      if (existing) {
        r = await fetch(`https://api.notion.com/v1/pages/${existing.id}`, {
          method: "PATCH", headers, body: JSON.stringify({ properties: props }),
        });
      } else {
        r = await fetch(`https://api.notion.com/v1/pages`, {
          method: "POST", headers,
          body: JSON.stringify({ parent: { database_id: PUSHUP_DB_ID }, properties: props, icon: { type: "emoji", emoji: "💪" } }),
        });
      }
      if (!r.ok) { const e = await r.json(); return res.status(r.status).json({ error: e.message }); }
      return res.status(200).json({ ok: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  return res.status(405).end();
}
