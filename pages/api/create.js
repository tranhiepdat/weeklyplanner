const TASKS_DB_ID = "fc3108a6cf5b4130a5644a0094ffc837";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const NOTION_KEY = process.env.NOTION_API_KEY;
  if (!NOTION_KEY) return res.status(500).json({ error: "Missing NOTION_API_KEY" });

  const { name, icon, taskType, session, priority, project, date } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: "Missing name" });

  const properties = {
    "Task": { title: [{ text: { content: name.trim() } }] },
    "Done": { checkbox: false },
  };
  if (taskType) properties["Task Type"] = { select: { name: taskType } };
  if (session) properties["Buổi"] = { select: { name: session } };
  if (Array.isArray(priority) && priority.length)
    properties["Priority"] = { multi_select: priority.map(p => ({ name: p })) };
  if (Array.isArray(project) && project.length)
    properties["Project"] = { multi_select: project.map(p => ({ name: p })) };
  if (date) properties["Due Date"] = { date: { start: date } };

  const body = {
    parent: { database_id: TASKS_DB_ID },
    properties,
  };
  if (icon) body.icon = { type: "emoji", emoji: icon };

  try {
    const r = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NOTION_KEY}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const e = await r.json();
      return res.status(r.status).json({ error: e.message });
    }
    const data = await r.json();
    res.status(200).json({ id: data.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
