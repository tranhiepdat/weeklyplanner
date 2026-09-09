import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { TASKS_DB_ID, plainText } from "../lib/notion.js";
import { goalSchema, goalProperties } from "../lib/goals.js";
import { taskSchema } from "../lib/tasks.js";
import tasksHandler from "../pages/api/tasks.js";
import updateHandler from "../pages/api/update.js";
import createHandler from "../pages/api/create.js";
import planHandler from "../pages/api/plan.js";
import goalsHandler from "../pages/api/goals.js";
import importHandler from "../pages/api/goals/import.js";
process.env.NOTION_API_KEY = "fixture-key";
process.env.NOTION_GOALS_DB_ID = "99999999-9999-4999-8999-999999999999";
const GOALS_DB = process.env.NOTION_GOALS_DB_ID;

function memoryNotion() {
  const pages = new Map(), requests = [], failures = [];
  const schema = definition => Object.fromEntries(Object.entries(definition).map(([name, body]) => [name, { ...body, type: Object.keys(body)[0] }]));
  const databases = new Map([[GOALS_DB, { properties: schema(goalSchema()) }], [TASKS_DB_ID, { properties: schema({ Task: { title: {} }, Done: { checkbox: {} }, ...taskSchema() }) }]]);
  const add = (db, properties, id = randomUUID()) => {
    const page = { id, parent: { database_id: db }, properties, created_time: new Date().toISOString(), last_edited_time: new Date().toISOString() };
    pages.set(id, page); return page;
  };
  const goal = (uid, updatedAt="2026-08-01T00:00:00Z") => add(GOALS_DB, goalProperties({uid,title:`Goal ${uid}`,emoji:"🎯",status:"active",createdAt:updatedAt,updatedAt,milestones:[{id:`${uid}-m`,text:"First",done:false}]}));
  const task = () => add(TASKS_DB_ID, { Task:{title:[{text:{content:"Task"}}]}, Done:{checkbox:false}, Goal:{relation:[]}, Plan:{select:null}, "Plan Order":{number:null} });
  const respond = (data,status=200) => new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Retry-After":"0"}});
  function matches(page,filter) {
    if(!filter) return true;
    if(filter.and) return filter.and.every(f=>matches(page,f));
    if(filter.timestamp) return page.last_edited_time>=filter.last_edited_time.on_or_after;
    const property=page.properties[filter.property];
    if(filter.rich_text) return plainText(property)===filter.rich_text.equals;
    if(filter.select?.does_not_equal) return property?.select?.name!==filter.select.does_not_equal;
    return true;
  }
  const fetcher=async (url,options={})=>{
    const path=new URL(url).pathname.replace('/v1',''),body=options.body?JSON.parse(options.body):{},method=options.method||"GET";
    requests.push({path,method,body});
    const index=failures.findIndex(f=>f.match({path,method,body}));
    if(index>=0) { const [failure]=failures.splice(index,1); return respond({message:failure.message||"Injected failure"},failure.status||500); }
    const parts=path.split('/').filter(Boolean),id=parts[1];
    if(parts[0]==='databases') {
      if(parts[2]==='query') {
        const all=[...pages.values()].filter(p=>p.parent.database_id===id&&!p.archived&&matches(p,body.filter));
        const start=Number(body.start_cursor||0),end=Math.min(start+100,all.length);
        return respond({results:all.slice(start,end),has_more:end<all.length,next_cursor:end<all.length?String(end):null});
      }
      if(!databases.has(id)) return respond({message:"Missing database"},404);
      if(method==='PATCH') Object.assign(databases.get(id).properties,schema(body.properties));
      return respond(databases.get(id));
    }
    if(parts[0]==='pages') {
      if(method==='POST') {
        const p=add(body.parent.database_id,body.properties); p.children=body.children||[]; return respond(p);
      }
      const page=pages.get(id);if(!page)return respond({message:"Missing page"},404);
      if(method==='PATCH') { Object.assign(page.properties,body.properties||{}); if(body.archived!==undefined)page.archived=body.archived;page.last_edited_time=new Date().toISOString(); }
      return respond(page);
    }
    return respond({message:`Unexpected path ${path}`},500);
  };
  return {pages,requests,failures,goal,task,fetcher};
}
async function call(handler,body={},method="POST",query={}) {
  let status=200,data,headers={};
  const res={ setHeader(k,v){headers[k]=v;},status(s){status=s;return this;},json(d){data=d;return this;},end(){return this;} };
  await handler({method,body,query,cookies:{}},res);return {status,data,headers};
}

test("API round-trip: create task with goal, clear link, validate archived goal, idempotent create",async()=>{
  const n=memoryNotion();global.fetch=n.fetcher;
  const g=n.goal('stable');
  const created=await call(createHandler,{name:"Created",goalId:"stable",clientRequestId:"request-one"});
  assert.equal(created.status,200);assert.equal(created.data.task.goalId,"stable");
  assert.deepEqual(n.pages.get(created.data.id).properties.Goal.relation,[{id:g.id}]);
  const repeated=await call(createHandler,{name:"Created",goalId:"stable",clientRequestId:"request-one"});
  assert.equal(repeated.data.id,created.data.id);
  const cleared=await call(updateHandler,{id:created.data.id,goalId:null,done:true},"PATCH");
  assert.equal(cleared.data.task.goalId,null);assert.equal(cleared.data.task.done,true);
  g.properties.Status.select.name="archived";
  const archived=await call(updateHandler,{id:created.data.id,goalId:"stable"},"PATCH");assert.equal(archived.status,409);
  const read=await call(tasksHandler,{},"GET");assert.equal(read.data.mode,"snapshot");assert.equal(read.data.tasks.length,1);
  const delta=await call(tasksHandler,{},"GET",{since:read.data.syncedAt});assert.equal(delta.data.mode,"delta");
});

test("plan API reports partial failures and preserves successful per-item writes",async()=>{
  const n=memoryNotion();global.fetch=n.fetcher;const a=n.task(),b=n.task();
  n.failures.push({match:r=>r.path===`/pages/${b.id}`&&r.method==='PATCH'});
  const response=await call(planHandler,{tiers:[{id:a.id,tier:"must"},{id:b.id,tier:"optional"}],orders:[{id:a.id,order:0}]});
  assert.equal(response.status,207);assert.deepEqual(response.data.results.map(r=>r.ok),[true,false]);
  assert.equal(n.pages.get(a.id).properties.Plan.select.name,"🔥 Bắt buộc");assert.equal(n.pages.get(a.id).properties['Plan Order'].number,0);
  assert.equal(n.pages.get(b.id).properties.Plan.select,null);
});

test("goal API patches milestones by ID and enforces three active goals",async()=>{
  const n=memoryNotion();global.fetch=n.fetcher;const a=n.goal("a");n.goal("b");n.goal("c");
  const patch=await call(goalsHandler,{id:a.id,goal:{milestone:{id:"a-m",done:true}}},"PATCH");
  assert.equal(patch.status,200);assert.equal(patch.data.goal.milestones[0].done,true);
  const written=n.requests.filter(r=>r.method==='PATCH'&&r.path===`/pages/${a.id}`).at(-1).body.properties;
  assert.ok(!written.Goal);assert.deepEqual(written['Milestone 1 Done'],{checkbox:true});
  const overflow=await call(goalsHandler,{uid:"d",title:"D",milestones:[{id:"m",text:"M",done:false}]});
  assert.equal(overflow.status,409);
});

const legacyGoal=(uid,date)=>({id:`old-${uid}`,uid,title:`Old ${uid}`,status:"active",updatedAt:date,createdAt:date,milestones:[{id:`${uid}-m`,text:"Milestone",done:false}]});
async function finishImport(body) {
  let response;
  for(let i=0;i<20;i++) {response=await call(importHandler,body);assert.equal(response.status,200,JSON.stringify(response.data));if(response.data.complete)return response;}
  throw new Error("Import did not terminate");
}

test("two-device import keeps newest three active, preserves backups/conflicts and is replay-safe",async()=>{
  const n=memoryNotion();global.fetch=n.fetcher;const task=n.task();
  const first={importId:"device-first",goals:[legacyGoal("a","2026-08-01"),legacyGoal("b","2026-08-02"),legacyGoal("c","2026-08-03")],links:{[task.id]:"a"},legacy:{goals:[],raw:""}};
  await finishImport(first);
  const second={importId:"device-second",goals:[legacyGoal("a","2026-08-05"),legacyGoal("d","2026-08-04")],links:{[task.id]:"d"},legacy:{goals:[],raw:""}};
  const imported=await finishImport(second);
  assert.equal(imported.data.report.conflicts.length,1);
  assert.equal(n.pages.get(task.id).properties.Goal.relation[0].id,[...n.pages.values()].find(p=>plainText(p.properties.UID)==="a").id);
  const all=[...n.pages.values()].filter(p=>p.parent.database_id===GOALS_DB&&p.properties.Kind.select.name==='goal');
  assert.equal(all.length,4);
  assert.deepEqual(all.filter(p=>p.properties.Status.select.name==='active').map(p=>plainText(p.properties.UID)).sort(),['a','c','d']);
  const backup=[...n.pages.values()].find(p=>plainText(p.properties.UID)==='import:device-second');
  assert.deepEqual(JSON.parse(backup.children.map(b=>plainText(b.paragraph)).join('')).goals,second.goals);
  const count=n.pages.size;await finishImport(second);assert.equal(n.pages.size,count);
});

test("import resumes after a failed link write, verifies storage before completing",async()=>{
  const n=memoryNotion();global.fetch=n.fetcher;const tasks=Array.from({length:12},()=>n.task());
  const body={importId:"device-resume",goals:[legacyGoal("g","2026-08-01")],links:Object.fromEntries(tasks.map(t=>[t.id,"g"])),legacy:{goals:[],raw:""}};
  n.failures.push({match:r=>r.path===`/pages/${tasks[2].id}`&&r.method==='PATCH'});
  const failed=await call(importHandler,body);assert.equal(failed.status,500);
  const record=[...n.pages.values()].find(p=>p.properties.Kind?.select?.name==='import');assert.equal(record.properties['Import Complete'].checkbox,false);
  const completed=await finishImport(body);assert.equal(completed.data.complete,true);
  assert.ok(tasks.every(t=>t.properties.Goal.relation.length===1));
  assert.equal([...n.pages.values()].filter(p=>p.properties.Kind?.select?.name==='goal').length,1);
});

test("missing goals configuration returns an actionable error without overwriting legacy cookies",async()=>{
  const original=process.env.NOTION_GOALS_DB_ID;delete process.env.NOTION_GOALS_DB_ID;
  try {const result=await call(goalsHandler,{},"GET");assert.equal(result.status,503);assert.match(result.data.error,/NOTION_GOALS_DB_ID/);assert.equal(result.headers['Set-Cookie'],undefined);}
  finally {process.env.NOTION_GOALS_DB_ID=original;}
});

test('a stale editor cannot modify trashed or unrelated Notion pages',async()=>{
 const n=memoryNotion(),original=globalThis.fetch;globalThis.fetch=n.fetcher;
 try {
  const t=n.task();t.archived=true;
  assert.equal((await call(updateHandler,{id:t.id,name:'Stale draft'},'PATCH')).status,410);
  const g=n.goal('unrelated');
  assert.equal((await call(updateHandler,{id:g.id,name:'Wrong database'},'PATCH')).status,404);
  assert.equal(n.requests.filter(r=>r.method==='PATCH'&&r.path.startsWith('/pages/')).length,0);
 } finally {globalThis.fetch=original;}
});
