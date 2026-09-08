import { notion, TASKS_DB_ID, queryAll } from '../lib/notion.js';
import { goalSchema, ensureGoalsSchema } from '../lib/goals.js';
import { ensureTaskSchema } from '../lib/tasks.js';

// Run once with the SAME integration used by the Vercel app. No secrets are
// printed or written. Existing task values and legacy cookies remain untouched.
async function main() {
  if (!process.env.NOTION_API_KEY) throw new Error('Set NOTION_API_KEY (the planner integration) before running setup.');
  let goalsId = process.env.NOTION_GOALS_DB_ID;
  if (!goalsId) {
    const tasks = await notion(`/databases/${TASKS_DB_ID}`);
    const parentArg = process.argv.find(a => a.startsWith('--parent-page='))?.slice('--parent-page='.length);
    const parent = parentArg || tasks.parent?.page_id;
    if (!parent) throw new Error('Supply --parent-page=<Notion page ID shared with the planner integration>.');
    let cursor, found;
    do {
      const children = await notion(`/blocks/${parent}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`);
      found ||= children.results.find(b => b.type === 'child_database' && b.child_database.title === 'WeeklyPlanner Goals');
      cursor = children.has_more ? children.next_cursor : null;
    } while (cursor);
    if (found) goalsId = found.id;
    else {
      const db = await notion('/databases', { method: 'POST', body: {
        parent: { type: 'page_id', page_id: parent }, title: [{ text: { content: 'WeeklyPlanner Goals' } }], properties: goalSchema(),
      } });
      goalsId = db.id;
    }
    process.env.NOTION_GOALS_DB_ID = goalsId;
  }
  const db = await notion(`/databases/${goalsId}`);
  if (!db.properties.Goal) {
    const title = Object.entries(db.properties).find(([, p]) => p.type === 'title');
    if (title) await notion(`/databases/${goalsId}`, { method: 'PATCH', body: { properties: { [title[0]]: { name: 'Goal' } } } });
  }
  await ensureGoalsSchema();
  await ensureTaskSchema();
  await queryAll(goalsId, { filter: { property: 'Kind', select: { does_not_equal: 'import' } } });
  console.log(`Setup verified. Set NOTION_GOALS_DB_ID=${goalsId} in the preview and production environments.`);
  console.log('Open the updated app on each device once to import its existing goals and links.');
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
