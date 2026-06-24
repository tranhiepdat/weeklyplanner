const MOOD_DB_ID = "5aaa712f4acc478b8d229bc78e0156bf";
const MOOD_LABELS = {
  1: "🥀 Nặng lòng",
  2: "😔 Mỏi mệt",
  3: "🕊️ Bình an",
  4: "😊 Vui tươi",
  5: "😇 Hân hoan",
};

export default async function handler(req, res) {
  const NOTION_KEY = process.env.NOTION_API_KEY;
  if (!NOTION_KEY) return res.status(500).json({ error: "Missing NOTION_API_KEY" });

  const headers = {
    Authorization: `Bearer ${NOTION_KEY}`,
    "Content-Type": "application/json",
    "Notion-Version": "2022-06-28",
  };

  // GET — return all moods as { "YYYY-MM-DD": score }. Sorted newest-first so that
  // if duplicate rows exist for a date, the most recently edited one wins.
  if (req.method === "GET") {
    try {
      const r = await fetch(`https://api.notion.com/v1/databases/${MOOD_DB_ID}/query`, {
        method: "POST", headers,
        body: JSON.stringify({ page_size: 100, sorts: [{ timestamp: "last_edited_time", direction: "descending" }] }),
      });
      if (!r.ok) { const e = await r.json(); return res.status(r.status).json({ error: e.message }); }
      const data = await r.json();
      const moods = {};
      data.results.forEach(pg => {
        const day = pg.properties.Day?.title?.[0]?.plain_text;
        const score = pg.properties["Mood Score"]?.number;
        if (day && score && moods[day] === undefined) moods[day] = score; // first = newest
      });
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ moods });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // POST — upsert mood for a date: { date, score }. De-dupes: keeps the newest row,
  // archives any extras for that date so reads stay consistent across devices.
  if (req.method === "POST") {
    const { date, score } = req.body || {};
    if (!date || !score) return res.status(400).json({ error: "Missing date or score" });
    try {
      const q = await fetch(`https://api.notion.com/v1/databases/${MOOD_DB_ID}/query`, {
        method: "POST", headers,
        body: JSON.stringify({ filter: { property: "Day", title: { equals: date } }, sorts: [{ timestamp: "last_edited_time", direction: "descending" }] }),
      });
      const qd = await q.json();
      const rows = qd.results || [];
      const keeper = rows[0];
      // archive duplicate rows for this date (best effort)
      await Promise.all(rows.slice(1).map(p =>
        fetch(`https://api.notion.com/v1/pages/${p.id}`, { method: "PATCH", headers, body: JSON.stringify({ archived: true }) }).catch(() => {})
      ));

      const props = {
        "Day": { title: [{ text: { content: date } }] },
        "Date": { date: { start: date } },
        "Mood Score": { number: score },
        "Mood": { select: { name: MOOD_LABELS[score] || MOOD_LABELS[3] } },
      };

      let r;
      if (keeper) {
        r = await fetch(`https://api.notion.com/v1/pages/${keeper.id}`, {
          method: "PATCH", headers, body: JSON.stringify({ properties: props }),
        });
      } else {
        r = await fetch(`https://api.notion.com/v1/pages`, {
          method: "POST", headers,
          body: JSON.stringify({ parent: { database_id: MOOD_DB_ID }, properties: props }),
        });
      }
      if (!r.ok) { const e = await r.json(); return res.status(r.status).json({ error: e.message }); }
      return res.status(200).json({ ok: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  return res.status(405).end();
}
