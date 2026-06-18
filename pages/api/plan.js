// Plan Day sync — persists per-task tier (must/optional) + manual order to Notion
// so the plan is shared across devices. Self-heals the schema: if the "Plan"
// (select) / "Plan Order" (number) properties don't exist yet, it creates them.
const TASKS_DB_ID = "fc3108a6cf5b4130a5644a0094ffc837";
const TIER_TO_LABEL = { must: "🔥 Bắt buộc", optional: "💤 Để dành" };

let _ensured = false;
async function ensureProps(headers) {
  const r = await fetch(`https://api.notion.com/v1/databases/${TASKS_DB_ID}`, {
    method: "PATCH", headers,
    body: JSON.stringify({
      properties: {
        "Plan": { select: { options: [
          { name: "🔥 Bắt buộc", color: "red" },
          { name: "💤 Để dành", color: "gray" },
        ] } },
        "Plan Order": { number: { format: "number" } },
      },
    }),
  });
  _ensured = r.ok;
  return r.ok;
}

async function patchPage(id, properties, headers) {
  const send = () => fetch(`https://api.notion.com/v1/pages/${id}`, {
    method: "PATCH", headers, body: JSON.stringify({ properties }),
  });
  let r = await send();
  if (!r.ok) {
    const txt = await r.text();
    // Most likely the Plan / Plan Order property doesn't exist yet → create + retry once
    if (/is not a property|Plan|property|validation/i.test(txt)) {
      await ensureProps(headers);
      r = await send();
      if (!r.ok) throw new Error((await r.text()).slice(0, 180));
    } else {
      throw new Error(txt.slice(0, 180));
    }
  }
  return true;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const NOTION_KEY = process.env.NOTION_API_KEY;
  if (!NOTION_KEY) return res.status(500).json({ error: "Missing NOTION_API_KEY" });
  const headers = { Authorization: `Bearer ${NOTION_KEY}`, "Content-Type": "application/json", "Notion-Version": "2022-06-28" };

  const { id, tier, orders, tiers } = req.body || {};
  try {
    // Ensure the schema once per warm instance (cheap, avoids per-write retries)
    if (!_ensured) await ensureProps(headers);

    const jobs = [];
    const tierJob = (pid, tv) => {
      const label = TIER_TO_LABEL[tv];
      jobs.push(patchPage(pid, { "Plan": label ? { select: { name: label } } : { select: null } }, headers));
    };
    if (id) tierJob(id, tier);
    if (Array.isArray(tiers)) tiers.forEach(x => { if (x && x.id) tierJob(x.id, x.tier); });
    if (Array.isArray(orders)) {
      orders.forEach(o => {
        if (o && o.id && typeof o.order === "number") jobs.push(patchPage(o.id, { "Plan Order": { number: o.order } }, headers));
      });
    }
    if (!jobs.length) return res.status(400).json({ error: "Nothing to sync" });
    await Promise.all(jobs);
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e).slice(0, 180) });
  }
}
