const DB_ID = "fc3108a6cf5b4130a5644a0094ffc837";

export default async function handler(req, res) {
  const NOTION_KEY = process.env.NOTION_API_KEY;
  if (!NOTION_KEY) return res.status(500).json({ error: "Missing NOTION_API_KEY" });

  const headers = {
    Authorization: `Bearer ${NOTION_KEY}`,
    "Content-Type": "application/json",
    "Notion-Version": "2022-06-28",
  };

  try {
    // Notion returns at most 100 rows per query. WITHOUT paginating, every task
    // past the first 100 silently disappears once the DB grows — which is exactly
    // what "thiếu task quá trời" was. Loop through next_cursor until has_more=false.
    // Sorted newest-edited first so, if the safety cap is ever hit, recent tasks win.
    const results = [];
    let cursor = undefined;
    for (let i = 0; i < 25; i++) { // safety cap ~2500 tasks
      const body = { page_size: 100, sorts: [{ timestamp: "last_edited_time", direction: "descending" }] };
      if (cursor) body.start_cursor = cursor;
      const r = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
        method: "POST", headers, body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json();
        return res.status(r.status).json({ error: err.message });
      }
      const data = await r.json();
      results.push(...(data.results || []));
      if (!data.has_more) break;
      cursor = data.next_cursor;
    }

    const tierName = p => p?.Plan?.select?.name;
    const tasks = results.map((page) => {
      const p = page.properties;
      const tName = tierName(p);
      return {
        id: page.id,
        icon: page.icon?.emoji || "",
        name: p.Task?.title?.[0]?.plain_text || "Untitled",
        done: p.Done?.checkbox || false,
        date: p["Due Date"]?.date?.start || null,
        taskType: p["Task Type"]?.select?.name || null,
        session: p["Buổi"]?.select?.name || null,
        priority: p.Priority?.multi_select?.map((s) => s.name) || [],
        project: p.Project?.multi_select?.map((s) => s.name) || [],
        // Plan Day (synced across devices). Missing props read as null — safe.
        planTier: tName ? (tName.includes("Bắt buộc") ? "must" : tName.includes("Để dành") ? "optional" : null) : null,
        planOrder: typeof p["Plan Order"]?.number === "number" ? p["Plan Order"].number : null,
      };
    });

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ tasks });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
