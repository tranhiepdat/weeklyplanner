const DB_ID = "fc3108a6cf5b4130a5644a0094ffc837";

export default async function handler(req, res) {
  const NOTION_KEY = process.env.NOTION_API_KEY;
  if (!NOTION_KEY) return res.status(500).json({ error: "Missing NOTION_API_KEY" });

  try {
    const r = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NOTION_KEY}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({ page_size: 100 }),
    });

    if (!r.ok) {
      const err = await r.json();
      return res.status(r.status).json({ error: err.message });
    }

    const data = await r.json();

    const tasks = data.results.map((page) => {
      const p = page.properties;
      return {
        id: page.id,
        icon: page.icon?.emoji || "",
        name: p.Task?.title?.[0]?.plain_text || "Untitled",
        done: p.Done?.checkbox || false,
        date: p["Due Date"]?.date?.start || null,
        taskType: p["Task Type"]?.select?.name || null,
        priority: p.Priority?.multi_select?.map((s) => s.name) || [],
        project: p.Project?.multi_select?.map((s) => s.name) || [],
      };
    });

    res.status(200).json({ tasks });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
