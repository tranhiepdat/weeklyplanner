import { createHash } from "node:crypto";
import { ApiError, TASKS_DB_ID, notion, queryAll, richText, plainText } from "./notion.js";
import { goalsDatabaseId, listGoals, writeGoal, goalFromPage, goalProperties, dedupeGoals, ACTIVE_LIMIT } from "./goals.js";

export function readLegacyGoals(req) {
  const raw = Array.from({ length: 4 }, (_, i) => req.cookies?.[`wp_goals_${i}`] || "").join("");
  try {
    const goals = raw ? JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) : [];
    return { goals: Array.isArray(goals) ? goals : [], raw, corrupt: !Array.isArray(goals) };
  } catch { return { goals: [], raw, corrupt: true }; }
}
export function mergeLegacyGoals(...sources) {
  return dedupeGoals(sources.flat().filter(g => g && (g.uid || g.id)).map(g => ({ ...g, uid: String(g.uid || g.id) })));
}
export function importBackupBlocks(payload) {
  const text = JSON.stringify(payload), blocks = [];
  for (let i = 0; i < text.length; i += 1800) blocks.push({ object: "block", type: "paragraph", paragraph: richText(text.slice(i, i + 1800)) });
  if (blocks.length > 100) throw new ApiError("Bản sao import quá lớn; dữ liệu gốc vẫn được giữ trên thiết bị.", 413);
  return blocks;
}

// Progress is stored on the Notion backup row, never in serverless memory.
// Each request verifies at most 5 goals / 10 links and can safely be replayed.
export async function importGoalBatch(body, legacy) {
  if (typeof body.importId !== "string" || !/^[a-zA-Z0-9-]{8,80}$/.test(body.importId)) throw new ApiError("Invalid import id", 400);
  if (!Array.isArray(body.goals) || !body.links || typeof body.links !== "object" || Array.isArray(body.links)) throw new ApiError("Invalid import payload", 400);
  const payload = { goals: body.goals, links: body.links, legacy: body.legacy || legacy };
  const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const key = `import:${body.importId}`;
  const records = await queryAll(goalsDatabaseId(), { filter: { property: "UID", rich_text: { equals: key } } });
  let record = records[0];
  let progress = { hash, goalIndex: 0, linkIndex: 0, report: { importedGoals: 0, linkedTasks: 0, conflicts: [], skipped: [], archivedGoals: [], corruptCookie: !!payload.legacy?.corrupt } };
  if (record) {
    progress = JSON.parse(plainText(record.properties["Import Progress"]));
    if (progress.hash !== hash) throw new ApiError("Import snapshot changed; keep the original backup and retry.", 409);
    if (record.properties["Import Complete"]?.checkbox) return { complete: true, report: progress.report };
  } else {
    record = await notion("/pages", { method: "POST", body: {
      parent: { database_id: goalsDatabaseId() },
      properties: { Goal: { title: [{ text: { content: `Device import ${body.importId}` } }] }, UID: richText(key), Kind: { select: { name: "import" } }, "Import Progress": richText(JSON.stringify(progress)), "Import Complete": { checkbox: false } },
      children: importBackupBlocks(payload),
    } });
  }
  const incoming = mergeLegacyGoals(payload.legacy?.goals || [], payload.goals);
  let goals = await listGoals();
  let goalCount = 0;
  while (progress.goalIndex < incoming.length && goalCount++ < 5) {
    const candidate = incoming[progress.goalIndex];
    const old = goals.find(g => g.uid === candidate.uid);
    if (!old || String(candidate.updatedAt || "") > String(old.updatedAt || "")) {
      const saved = await writeGoal(candidate, old, true);
      // Read the actual page, not the eventually-consistent query index.
      const verified = await notion(`/pages/${saved.id}`);
      if (JSON.stringify(goalProperties(goalFromPage(verified))) !== JSON.stringify(goalProperties(saved))) throw new ApiError("Goal import verification failed");
      goals = [...goals.filter(g => g.uid !== saved.uid), saved];
      progress.report.importedGoals++;
    }
    progress.goalIndex++;
  }
  const entries = Object.entries(payload.links).filter(([id, uid]) => id && typeof uid === "string" && uid);
  if (progress.goalIndex >= incoming.length) {
    let linkCount = 0;
    while (progress.linkIndex < entries.length && linkCount++ < 10) {
      const [taskId, uid] = entries[progress.linkIndex];
      const goal = goals.find(g => g.uid === uid);
      if (!goal || taskId.startsWith("temp-")) progress.report.skipped.push({ taskId, goalId: uid, reason: "Goal or saved task unavailable" });
      else {
        let task;
        try { task = await notion(`/pages/${taskId}`); }
        catch (e) { if (e.status !== 404) throw e; }
        if (!task || task.archived || task.in_trash || task.parent?.database_id?.replaceAll("-", "") !== TASKS_DB_ID.replaceAll("-", "")) progress.report.skipped.push({ taskId, goalId: uid, reason: "Task unavailable" });
        else {
          const relation = task.properties.Goal?.relation || [];
          if (relation.length && relation[0].id !== goal.id) progress.report.conflicts.push({ taskId, importedGoalId: uid, keptGoalPageId: relation[0].id });
          else if (!relation.length) {
            await notion(`/pages/${taskId}`, { method: "PATCH", body: { properties: { Goal: { relation: [{ id: goal.id }] } } } });
            const verified = await notion(`/pages/${taskId}`);
            if (verified.properties.Goal?.relation?.[0]?.id !== goal.id) throw new ApiError("Task link import verification failed");
            progress.report.linkedTasks++;
          }
        }
      }
      progress.linkIndex++;
    }
  }
  const complete = progress.goalIndex >= incoming.length && progress.linkIndex >= entries.length;
  if (complete) {
    // Use original edit times when archiving overflow: migration itself must not
    // make an older imported goal win over the next device's newer goal.
    const active = dedupeGoals(goals).filter(g => g.status === "active");
    for (const goal of active.slice(ACTIVE_LIMIT)) {
      const saved = await writeGoal({ ...goal, status: "archived", archivedAt: new Date().toISOString() }, goal, true);
      const verifiedGoal = goalFromPage(await notion(`/pages/${saved.id}`));
      if (verifiedGoal.status !== "archived" || verifiedGoal.uid !== goal.uid) throw new ApiError("Goal history verification failed");
      progress.report.archivedGoals.push(goal.uid);
    }
  }
  await notion(`/pages/${record.id}`, { method: "PATCH", body: { properties: { "Import Progress": richText(JSON.stringify(progress)), "Import Complete": { checkbox: complete } } } });
  const verified = await notion(`/pages/${record.id}`);
  if (plainText(verified.properties["Import Progress"]) !== JSON.stringify(progress) || !!verified.properties["Import Complete"]?.checkbox !== complete) throw new ApiError("Import progress verification failed");
  return { complete, report: progress.report, remaining: incoming.length - progress.goalIndex + entries.length - progress.linkIndex, backupPageId: record.id };
}
