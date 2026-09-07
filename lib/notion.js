export const TASKS_DB_ID = process.env.NOTION_TASKS_DB_ID || "fc3108a6cf5b4130a5644a0094ffc837";
export const NOTION_VERSION = "2022-06-28";

export class ApiError extends Error {
  constructor(message, status = 500) { super(message); this.status = status; }
}

// Serial within a worker; Retry-After also handles contention with other workers
// and the existing mood/push-up integration sharing the same Notion connection.
export function createNotionClient({ fetcher = (...args) => fetch(...args), sleep = ms => new Promise(r => setTimeout(r, ms)), now = Date.now, interval = 350 } = {}) {
  let tail = Promise.resolve(), nextStart = 0;
  return (path, { method = "GET", body } = {}) => {
    const run = async () => {
      const key = process.env.NOTION_API_KEY;
      if (!key) throw new ApiError("Missing NOTION_API_KEY", 503);
      for (let attempt = 0; ; attempt++) {
        const delay = nextStart - now();
        if (delay > 0) await sleep(delay);
        nextStart = now() + interval;
        const response = await fetcher(`https://api.notion.com/v1${path}`, {
          method, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Notion-Version": NOTION_VERSION },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: AbortSignal.timeout(20000),
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok) return data;
        // A rejected rate-limited write is safe to retry. Do not retry ambiguous
        // creates on network/5xx failures: their idempotency key handles a retry.
        if (response.status === 429 && attempt < 3) {
          const seconds = Number(response.headers.get("Retry-After"));
          nextStart = now() + (Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 1000 * 2 ** attempt);
          continue;
        }
        throw new ApiError(data.message || `Notion request failed (${response.status})`, response.status);
      }
    };
    const result = tail.then(run, run);
    tail = result.catch(() => {});
    return result;
  };
}

export const notion = createNotionClient({ interval: process.env.NODE_ENV === "test" ? 0 : 350 });

export async function queryAll(databaseId, body = {}, client = notion) {
  const results = [], seen = new Set();
  let cursor;
  do {
    const data = await client(`/databases/${databaseId}/query`, { method: "POST", body: { ...body, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) } });
    if (!Array.isArray(data.results)) throw new ApiError("Incomplete Notion response");
    results.push(...data.results);
    if (!data.has_more) return results;
    if (!data.next_cursor || seen.has(data.next_cursor)) throw new ApiError("Incomplete Notion pagination");
    cursor = data.next_cursor; seen.add(cursor);
  } while (cursor);
  return results;
}

export const richText = value => ({ rich_text: value ? Array.from({ length: Math.ceil(String(value).length / 1900) }, (_, i) => ({ text: { content: String(value).slice(i * 1900, (i + 1) * 1900) } })) : [] });
export const plainText = property => (property?.rich_text || property?.title || []).map(t => t.plain_text ?? t.text?.content ?? "").join("");
export const dateProperty = value => ({ date: value ? { start: value } : null });

export async function ensureProperties(databaseId, expected, client = notion) {
  const db = await client(`/databases/${databaseId}`);
  const missing = {};
  for (const [name, definition] of Object.entries(expected)) {
    const type = Object.keys(definition)[0];
    if (!db.properties?.[name]) missing[name] = definition;
    else if (db.properties[name].type !== type) throw new ApiError(`Notion property "${name}" must be ${type}`, 409);
    else if (type === "relation" && db.properties[name].relation?.database_id?.replaceAll("-", "") !== definition.relation.database_id.replaceAll("-", ""))
      throw new ApiError(`Notion relation "${name}" points to a different database`, 409);
  }
  if (Object.keys(missing).length) await client(`/databases/${databaseId}`, { method: "PATCH", body: { properties: missing } });
}

export function respondError(res, error) {
  return res.status(error.status || 500).json({ error: String(error.message || error).slice(0, 300) });
}
