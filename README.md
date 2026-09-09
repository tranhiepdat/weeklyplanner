# WeeklyPlanner

Personal weekly planner built with Next.js and Notion. Tasks, daily priorities/order, goals, milestones, and task–goal links are shared across devices.

## Run locally

Use Node.js 22 or newer and npm:

```sh
npm ci
cp .env.example .env.local
# Fill in the server-side credentials for your Notion integration.
npm run dev
```

The task integration must have read, insert, and update access to the planner databases. AI features additionally use `ANTHROPIC_API_KEY`. Credentials never belong in client-side `NEXT_PUBLIC_` variables.

## Configure shared goals

Use the **same Notion integration** as the deployed planner. The setup command creates or reuses a `WeeklyPlanner Goals` database beside the tasks database, adds the task `Goal` relation and missing planning properties, and prints the goals database ID. Existing task values are preserved. Re-running setup reuses the database.

```sh
node --env-file=.env.local scripts/setup-notion.mjs
# If the tasks database has no page parent:
node --env-file=.env.local scripts/setup-notion.mjs --parent-page=YOUR_SHARED_PAGE_ID
```

Set the returned `NOTION_GOALS_DB_ID` in `.env.local` and in the relevant Vercel Preview/Production environments. If a goals database already exists, configure its ID before running setup. Its title column is renamed to `Goal`; property type/relationship mismatches are reported rather than silently replaced. `NOTION_TASKS_DB_ID` is optional and defaults to the existing database.

Without goals configuration, the UI reports the missing setting and retains legacy backups; it does not pretend goals were saved. Keep `Notion-Version: 2022-06-28` for this release.

## Device synchronization

- The app reads a full task snapshot initially, then polls changes every 15 seconds while visible and online. Notion latency is additional.
- Delta reads overlap by two minutes to account for rounded Notion timestamps. All pages are read; incomplete responses are errors, not successful truncated snapshots.
- Focus, reconnect, manual refresh, and every five minutes trigger a complete reconciliation, including tasks trashed in Notion. Direct Notion edits are included.
- Local writes are optimistic and ordered. A stale response cannot revert a newer write, pending edits survive polling, and open editor drafts are not replaced.
- Failed operations show a retry action. Plan batches contain at most 25 tasks, return per-task results, and retry only failed items. Notion requests are paced within each worker; `429` responses respect `Retry-After` across workers.
- Automatic overdue rollover runs on initial successful hydration or a new local day, separately from periodic reads. Failed rollover writes use the same visible retry flow.

Click/tap a task name to open its details. Use the checkbox for done/undo. Use the separate **＋ Liên kết goal** / goal-name button to save a link immediately, or choose inside the task editor and save with **Lưu thay đổi**. The themed picker becomes a bottom sheet on mobile. Only active goals allow new links; archived/achieved links remain visible as History and can be changed or removed. Milestone progress and completed-task counts are independent.

Click a goal to see its milestones and linked tasks grouped into **Chưa xong / Đã xong**. The default filter follows the planner’s selected Monday–Sunday week, including when navigating backward. **Tất cả** includes undated tasks. Counts use the scheduled task date and its current done state, not historical completion events. Milestone percentage is independent of this filter. Each group initially shows 20 tasks, ordered by date, session, planning order, and title. Task editing returns to the originating goal detail without losing the selected filter.

### API additions

`GET /api/tasks?since=<ISO timestamp>` returns `{ tasks, mode: "snapshot" | "delta", syncedAt }`. Omit `since` for a full snapshot. Only snapshots remove missing tasks. Each task includes `goalId` (stable goal UID or `null`), `goalPageId`, and `lastEditedTime`.

Task create/update accept `goalId`; explicit `null` clears the Notion relation. Create uses a client-generated `clientRequestId` for retry deduplication. Update additionally accepts `planTier`/`planOrder`; `null` clears them. Successful writes return the saved task. `POST /api/plan` retains `tiers`/`orders`, combines fields per task, and returns `{ ok, results: [{ id, ok, patch?, error? }] }`; partial success uses HTTP 207.

Goals use `GET/POST/PATCH /api/goals`. New goals have a stable client-generated `uid`; repeated creates reuse it. Goal PATCH sends only changed fields; `{ milestone: { id, done } }` updates one milestone checkbox. Milestones occupy five independent text/ID/checkbox property groups in Notion.

## Import existing devices

Each device must open the new version once. Before importing, it saves an immutable snapshot of `dat-goals-cache`, `dat-goal-links`, cached task links, and the legacy HTTP-only goals cookies to `dat-goals-import-v1`. The same payload is backed up on a `Kind=import` row in the goals database, with resumable progress stored there. The UI's new cache uses `dat-planner-v2`; original legacy keys are retained.

Imports merge goals by UID (never title), keep the newest `updatedAt`, and archive overflow beyond the three newest active goals. Links only fill empty server relations. Conflicts keep the server relation and appear in the import report; unavailable goals/tasks are recorded as skipped. Imports proceed in small verified batches and can be retried after a failure. Cookies are cleared and the local completion marker written only after confirmation. A corrupt cookie is preserved verbatim in the backup; intact local goal data can still be imported.

For recovery, inspect the Notion import row's paragraph blocks (concatenate them to recover the original JSON), or export the local `dat-goals-import-v1` value. Backups contain personal planner data and should stay in the same private Notion workspace. Do not clear browser storage before that device has imported.

## Verification and release

```sh
npm test
npm run build
npx playwright install chrome
npm run test:e2e
```

Unit/API tests use a memory Notion fixture. Browser tests run a production build with intercepted fixture APIs in independent mobile/desktop contexts; they never mutate production data. `PLAYWRIGHT_BASE_URL` can point the same browser tests at a deployed preview. The fixture routes still intercept data calls.

Configure separate test task/goal databases in Vercel Preview, run setup with that test integration, and validate real Notion writes there before production release. Then configure production goals, deploy, and open both existing devices to import. Check for sync/import errors, test done/undo and link/unlink from both devices, and verify a direct Notion edit appears after polling.

If rollout needs to be reversed, retain the new Notion databases and device backups. The previous release uses device cookies and cannot provide shared goal synchronization; restore any needed device data from its backup rather than deleting the shared data.
