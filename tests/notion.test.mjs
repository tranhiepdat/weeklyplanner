import test from "node:test";
import assert from "node:assert/strict";
import { createNotionClient, queryAll, richText, plainText } from "../lib/notion.js";
import { taskQuery, taskFromPage, taskPatchProperties } from "../lib/tasks.js";
import { goalProperties, changedGoalProperties, dedupeGoals, mergeMilestoneDraft } from "../lib/goals.js";
import { readLegacyGoals, mergeLegacyGoals, importBackupBlocks } from "../lib/goal-import.js";
import { planJobs } from "../pages/api/plan.js";
process.env.NOTION_API_KEY = "test-only";

test("Notion 429 obeys Retry-After and queued writes are rate limited", async () => {
  let now=0, calls=0; const sleeps=[];
  const client=createNotionClient({ now:()=>now, interval:350, sleep:async ms=>{ sleeps.push(ms); now+=ms; }, fetcher:async()=>{
    calls++; return new Response(JSON.stringify(calls===1 ? { message:"limited" } : { ok:true }), { status:calls===1 ? 429:200, headers:{ "Retry-After":"2" } });
  } });
  await client("/pages/a",{method:"PATCH",body:{}});
  await client("/pages/b",{method:"PATCH",body:{}});
  assert.equal(calls,3); assert.deepEqual(sleeps,[2000,350]);
});

test("ambiguous create failures are not retried automatically", async()=>{
  let calls=0;
  const client=createNotionClient({ interval:0, fetcher:async()=>{ calls++; return new Response('{"message":"failure"}',{status:500}); } });
  await assert.rejects(client("/pages",{method:"POST",body:{}}),/failure/); assert.equal(calls,1);
});

test("pagination reads 1438 and more than 2500 rows without silently truncating",async()=>{
  for(const total of [1438,2601]) {
    const pages=await queryAll("db",{},async(path,{body})=>{
      const start=Number(body.start_cursor||0),end=Math.min(start+100,total);
      return {results:Array.from({length:end-start},(_,i)=>({id:start+i})),has_more:end<total,next_cursor:end<total?String(end):null};
    });
    assert.equal(pages.length,total);assert.equal(pages.at(-1).id,total-1);
  }
  await assert.rejects(queryAll("db",{},async()=>({results:[],has_more:true,next_cursor:"same"})),/pagination/);
});

test("delta reads overlap rounded Notion timestamps; invalid cursors fail",()=>{
  const q=taskQuery("2026-09-07T10:02:00Z",Date.parse("2026-09-07T10:03:00Z"));
  assert.equal(q.mode,"delta");assert.equal(q.body.filter.last_edited_time.on_or_after,"2026-09-07T10:00:00.000Z");
  assert.throws(()=>taskQuery("invalid"),/cursor/);assert.equal(taskQuery().mode,"snapshot");
});

test("task mapping exposes empty tier/order/link as null and joins all title fragments",()=>{
  const page={id:"t",properties:{Task:{title:[{plain_text:"one"},{plain_text:" two"}]},Done:{checkbox:true},Goal:{relation:[{id:"p"}]}}};
  const t=taskFromPage(page,new Map([["p","stable-uid"]]));
  assert.equal(t.name,"one two");assert.equal(t.goalId,"stable-uid");assert.equal(t.planTier,null);assert.equal(t.planOrder,null);
  page.properties.Goal.relation=[];assert.equal(taskFromPage(page).goalId,null);
});

test("goal linkage can be explicitly cleared and plan fields validated",async()=>{
  assert.deepEqual((await taskPatchProperties({goalId:null})).Goal,{relation:[]});
  assert.deepEqual((await taskPatchProperties({planTier:null,planOrder:null})),{Plan:{select:null},"Plan Order":{number:null}});
  await assert.rejects(taskPatchProperties({planTier:"bad"}),/tier/);
  await assert.rejects(taskPatchProperties({done:"yes"}),/done/);
  await assert.rejects(taskPatchProperties({planOrder:NaN}),/order/);
});

test("batch merges tier and order per task and rejects oversized requests",()=>{
  assert.deepEqual(planJobs({tiers:[{id:"a",tier:"must"}],orders:[{id:"a",order:0}]}),[{id:"a",patch:{planTier:"must",planOrder:0}}]);
  assert.throws(()=>planJobs({orders:Array.from({length:26},(_,i)=>({id:String(i),order:i}))}),/25/);
});

test("goal patch updates one milestone checkbox without clobbering others",()=>{
  const old={uid:"g",title:"Goal",status:"active",milestones:[{id:"m1",text:"First",done:false},{id:"m2",text:"Second",done:true}]};
  const next={...old,milestones:[{...old.milestones[0],done:true},old.milestones[1]]};
  assert.deepEqual(changedGoalProperties(next,old),{"Milestone 1 Done":{checkbox:true}});
  assert.equal(goalProperties(old)["Milestone 2 Done"].checkbox,true);
});

test("legacy cookies and local goals merge by UID, preserve same-title distinct goals",()=>{
  const a={id:"a",uid:"u",title:"Same",updatedAt:"2026-09-01"}, b={...a,updatedAt:"2026-09-02"}, c={...a,id:"c",uid:"v"};
  const raw=Buffer.from(JSON.stringify([a])).toString("base64url");
  const legacy=readLegacyGoals({cookies:{wp_goals_0:raw.slice(0,20),wp_goals_1:raw.slice(20)}});
  assert.deepEqual(legacy.goals,[a]);
  assert.deepEqual(mergeLegacyGoals(legacy.goals,[b,c]).map(g=>g.uid),["u","v"]);
  assert.equal(dedupeGoals([a,b])[0].updatedAt,b.updatedAt);
  assert.equal(readLegacyGoals({cookies:{wp_goals_0:"truncated"}}).corrupt,true);
});

test("backups and long Notion rich text remain lossless and below per-item limits",()=>{
  const input="Việt Nam 🧭 ".repeat(400);
  assert.equal(plainText(richText(input)),input);assert.ok(richText(input).rich_text.every(t=>t.text.content.length<=1900));
  const payload={input,links:{task:"g"}};
  const blocks=importBackupBlocks(payload);
  assert.deepEqual(JSON.parse(blocks.map(b=>plainText(b.paragraph)).join("")),payload);
});


test("an open milestone text draft preserves a remote done toggle and a remote addition",()=>{
  const baseline=[{id:"a",text:"Before",done:false}];
  const latest=[{id:"a",text:"Before",done:true},{id:"b",text:"Remote new",done:false}];
  const merged=mergeMilestoneDraft([{...baseline[0],text:"After"}],baseline,latest);
  assert.deepEqual(merged,[{id:"a",text:"After",done:true},latest[1]]);
  assert.throws(()=>mergeMilestoneDraft([{...baseline[0],text:"After"}],baseline,[]),/Milestone/);
});


test("slow Notion reads do not block writes and concurrency is bounded", async () => {
  const releases = []; let active = 0, peak = 0;
  const client = createNotionClient({ interval: 0, fetcher: async () => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => releases.push(resolve));
    active--; return new Response('{}');
  } });
  const requests = Array.from({ length: 4 }, (_, i) => client(`/pages/${i}`, { method: i ? 'PATCH' : 'GET' }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(releases.length, 3);
  releases[1](); await requests[1];
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(releases.length, 4);
  releases[0](); releases[2](); releases[3]();
  await Promise.all(requests);
  assert.equal(peak, 3);
});


test("overlapping Notion requests still space their start times", async () => {
  let now = 0; const starts = [];
  const client = createNotionClient({ now: () => now, interval: 350,
    sleep: async ms => { now += ms; },
    fetcher: async () => { starts.push(now); return new Response('{}'); }
  });
  await Promise.all([client('/pages/a'), client('/pages/b'), client('/pages/c')]);
  assert.equal(starts.length, 3);
  assert.ok(starts[1] - starts[0] >= 350);
  assert.ok(starts[2] - starts[1] >= 350);
});
