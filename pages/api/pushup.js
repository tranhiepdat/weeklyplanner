// Push-up sync (Notion). Schema-agnostic + self-healing so it works regardless of
// the DB's exact property names: it finds the title property by type, and creates
// "Count" (number) / "Date" (date) if they don't exist. This is what makes the
// counter sync across devices even if the DB wasn't set up with the expected schema.
const PUSHUP_DB_ID = "53cf8bf5ccfd46bd835ec480ca45bee4";

let _schema = null; // cached per warm instance: { titleName, hasCount, hasDate }

async function loadSchema(headers) {
  const r = await fetch(`https://api.notion.com/v1/databases/${PUSHUP_DB_ID}`, { headers });
  if (!r.ok) return null;
  const db = await r.json();
  const props = db.properties || {};
  let titleName = "Day";
  for (const [name, p] of Object.entries(props)) { if (p.type === "title") { titleName = name; break; } }
  return { titleName, hasCount: props.Count?.type === "number", hasDate: props.Date?.type === "date" };
}
async function ensureSchema(headers) {
  if (_schema) return _schema;
  const s = await loadSchema(headers);
  if (!s) return null;
  const add = {};
  if (!s.hasCount) add["Count"] = { number: { format: "number" } };
  if (!s.hasDate) add["Date"] = { date: {} };
  if (Object.keys(add).length) {
    const r = await fetch(`https://api.notion.com/v1/databases/${PUSHUP_DB_ID}`, {
      method: "PATCH", headers, body: JSON.stringify({ properties: add }),
    });
    if (r.ok) { s.hasCount = true; s.hasDate = true; }
  }
  _schema = s;
  return s;
}

export default async function handler(req, res) {
  const NOTION_KEY = process.env.NOTION_API_KEY;
  if (!NOTION_KEY) return res.status(500).json({ error: "Missing NOTION_API_KEY" });

  const headers = {
    Authorization: `Bearer ${NOTION_KEY}`,
    "Content-Type": "application/json",
    "Notion-Version": "2022-06-28",
  };

  // GET — return all counts as { "YYYY-MM-DD": n }. Newest-first so dup rows resolve to the latest.
  if (req.method === "GET") {
    try {
      const r = await fetch(`https://api.notion.com/v1/databases/${PUSHUP_DB_ID}/query`, {
        method: "POST", headers, body: JSON.stringify({ page_size: 100, sorts: [{ timestamp: "last_edited_time", direction: "descending" }] }),
      });
      if (!r.ok) { const e = await r.json(); return res.status(r.status).json({ error: e.message }); }
      const data = await r.json();
      const counts = {};
      data.results.forEach(pg => {
        const props = pg.properties || {};
        // read the day from whichever property is the title (name-agnostic)
        let day = null;
        for (const p of Object.values(props)) { if (p.type === "title") { day = p.title?.[0]?.plain_text; break; } }
        const n = props.Count?.number;
        if (day && typeof n === "number" && counts[day] === undefined) counts[day] = n; // first = newest
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
      const schema = (await ensureSchema(headers)) || { titleName: "Day", hasCount: true, hasDate: true };
      const titleName = schema.titleName;

      const q = await fetch(`https://api.notion.com/v1/databases/${PUSHUP_DB_ID}/query`, {
        method: "POST", headers,
        body: JSON.stringify({ filter: { property: titleName, title: { equals: date } }, sorts: [{ timestamp: "last_edited_time", direction: "descending" }] }),
      });
      const qd = await q.json();
      const rows = qd.results || [];
      const existing = rows[0];
      // archive duplicate rows for this date (best effort)
      await Promise.all(rows.slice(1).map(p =>
        fetch(`https://api.notion.com/v1/pages/${p.id}`, { method: "PATCH", headers, body: JSON.stringify({ archived: true }) }).catch(() => {})
      ));

      const props = {
        [titleName]: { title: [{ text: { content: date } }] },
        "Count": { number: count },
      };
      if (schema.hasDate) props["Date"] = { date: { start: date } };

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
