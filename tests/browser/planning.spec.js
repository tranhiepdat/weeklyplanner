const { test, expect } = require('@playwright/test');
const clone = value => JSON.parse(JSON.stringify(value));
function fixture() {
  const goals = ['Learn','Build'].map((title,i)=>({id:`goal-${i}`,uid:`g${i}`,title,emoji:'🎯',status:'active',deadline:'2026-12-01',weeklyOutcome:'Weekly outcome',createdAt:'2026-08-01',updatedAt:'2026-09-01',milestones:[{id:`m${i}`,text:'First milestone',done:false}]}));
  const tasks = [{id:'task-a',name:'Review proposal',done:false,date:'2026-09-07',session:'🌅 Sáng',taskType:null,icon:'',priority:[],project:[],planTier:'must',planOrder:0,goalId:'g0'}];
  let failWrite=false, failImport=false, importAttempts=0, delayedWrite=null;
  const requests=[];
  async function route(route) {
    const req=route.request(),path=new URL(req.url()).pathname,body=req.postDataJSON(),method=req.method();
    requests.push({path,url:req.url(),method,body});
    let data={},status=200;
    if(path==='/api/goals/legacy')data={goals:[],raw:'',corrupt:false};
    else if(path==='/api/goals/import') {importAttempts++; if(failImport){status=503;data={error:'Import temporarily unavailable'};}else data={complete:true,report:{conflicts:[],skipped:[],archivedGoals:[]}};}
    else if(path==='/api/tasks')data={tasks:clone(tasks),mode:new URL(req.url()).searchParams.has('since')?'delta':'snapshot',syncedAt:'2026-09-07T03:00:00Z'};
    else if(path==='/api/goals'&&method==='GET')data={goals:clone(goals)};
    else if(path==='/api/goals'&&method==='PATCH') {
      const g=goals.find(g=>g.id===body.id),patch=body.goal;
      if(patch.milestone)g.milestones=g.milestones.map(m=>m.id===patch.milestone.id?{...m,done:patch.milestone.done}:m);
      else Object.assign(g,patch);
      data={goal:clone(g),goals:clone(goals)};
    }
    else if(path==='/api/update') {
      if(delayedWrite)await delayedWrite;
      if(failWrite){status=503;data={error:'Notion temporarily unavailable'};}
      else{const t=tasks.find(t=>t.id===body.id);Object.assign(t,body);data={ok:true,task:clone(t)};}
    }
    else if(path==='/api/plan') {
      const patches=new Map();
      for(const p of body.tiers||[])patches.set(p.id,{...patches.get(p.id),planTier:p.tier});
      for(const p of body.orders||[])patches.set(p.id,{...patches.get(p.id),planOrder:p.order});
      const results=[...patches].map(([id,patch])=>{Object.assign(tasks.find(t=>t.id===id),patch);return{id,ok:true,patch};});
      data={ok:true,results};
    }
    else if(path==='/api/chat')data={reply:'Added',tasks:[{name:'New chat task',date:'2026-09-07',tier:'must'}]};
    else if(path==='/api/goal-link')data={matches:[{goalId:'g1',confidence:.9}]};
    else if(path==='/api/create'){
      const t={...tasks[0],...body,id:'chat-new',done:false};tasks.push(t);data={id:t.id,task:clone(t)};
    }
    else if(path==='/api/delete'){const index=tasks.findIndex(t=>t.id===body.id);if(index>=0)tasks.splice(index,1);data={ok:true};}
    else if(path==='/api/pushup')data={counts:{}};
    else if(path==='/api/mood')data={moods:{}};
    else if(path==='/api/verse')data={};
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  }
  return {tasks,goals,requests,route,set failWrite(v){failWrite=v;},set failImport(v){failImport=v;},get importAttempts(){return importAttempts;},set delayedWrite(v){delayedWrite=v;}};
}
async function device(browser,server,mobile=false,legacy=null){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-09-07T03:00:00Z')});
  await context.route('**/api/**',server.route);
  await page.addInitScript(data=>{localStorage.setItem('dat-volume','0');if(data){localStorage.setItem('dat-goals-cache',JSON.stringify(data.goals));localStorage.setItem('dat-goal-links',JSON.stringify(data.links));}},legacy);
  await page.goto('/');
  await expect(page.getByRole('button',{name:'Chi tiết Review proposal',exact:true})).toBeVisible();
  return {context,page,errors};
}
async function detail(page){await page.getByRole('button',{name:'Chi tiết Review proposal',exact:true}).click();await expect(page.getByLabel('Liên kết goal',{exact:true})).toBeVisible();}

test('mobile and desktop sync done, goal links, nulls and direct Notion edits without losing an open draft',async({browser})=>{
  const server=fixture();const desktop=await device(browser,server),mobile=await device(browser,server,true);
  const check=p=>p.getByRole('checkbox',{name:'Hoàn thành Review proposal',exact:true});
  await check(desktop.page).click();await expect(check(desktop.page)).toHaveAttribute('aria-checked','true');
  await expect(desktop.page.locator('.wp-goal-row').first().locator('.task-number')).toHaveText('1/1');
  await mobile.page.clock.fastForward(15001);
  await expect(check(mobile.page)).toHaveAttribute('aria-checked','true');
  await detail(mobile.page);await mobile.page.getByLabel('Liên kết goal',{exact:true}).selectOption('g1');
  await mobile.page.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();
  await expect(mobile.page.getByLabel('Liên kết goal',{exact:true})).not.toBeVisible();
  await desktop.page.clock.fastForward(15001);
  await expect(desktop.page.locator('[data-testid="task-goal"]').first()).toContainText('Build');
  await expect(desktop.page.locator('.wp-goal-row').nth(1).locator('.task-number')).toHaveText('1/1');
  // A remote edit arrives while an unsaved goal choice is open.
  await detail(mobile.page);await mobile.page.getByLabel('Liên kết goal',{exact:true}).selectOption('g0');
  Object.assign(server.tasks[0],{done:false,planTier:null,planOrder:null});
  await mobile.page.clock.fastForward(15001);
  await expect(mobile.page.getByLabel('Liên kết goal',{exact:true})).toHaveValue('g0');
  await mobile.page.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();
  expect(server.tasks[0].done).toBe(false);
  await desktop.page.clock.fastForward(15001);await expect(check(desktop.page)).toHaveAttribute('aria-checked','false');
  await detail(desktop.page);await desktop.page.getByLabel('Liên kết goal',{exact:true}).selectOption('');
  await desktop.page.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();
  await mobile.page.clock.fastForward(15001);await expect(mobile.page.locator('[data-testid="task-goal"]')).toHaveCount(0);
  expect(server.requests.some(r=>r.path==='/api/tasks'&&r.url.includes('since='))).toBe(true);
  expect(desktop.errors).toEqual([]);expect(mobile.errors).toEqual([]);
  await desktop.context.close();await mobile.context.close();
});

test('failed save keeps the editor draft and retry succeeds; tapping the name never toggles done',async({browser})=>{
  const server=fixture(),d=await device(browser,server,true);
  await detail(d.page);expect(server.tasks[0].done).toBe(false);
  await d.page.getByLabel('Liên kết goal',{exact:true}).selectOption('g1');server.failWrite=true;
  await d.page.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();
  await expect(d.page.getByText('Chưa lưu được. Dữ liệu đang sửa vẫn được giữ; hãy thử lại.',{exact:true})).toBeVisible();
  await expect(d.page.getByLabel('Liên kết goal',{exact:true})).toHaveValue('g1');
  server.failWrite=false;await d.page.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();
  await expect(d.page.getByLabel('Liên kết goal',{exact:true})).not.toBeVisible();expect(server.tasks[0].goalId).toBe('g1');
  await d.context.close();
});

test('returning online/focus reconciles deletion and chat auto-link persists in create payload',async({browser})=>{
  const server=fixture(),d=await device(browser,server);
  await d.page.getByTitle('Chat tạo việc với AI',{exact:true}).click();
  await d.page.getByPlaceholder('Nói việc cần thêm…').fill('Add a task for Build');
  await d.page.getByRole('button',{name:'Gửi',exact:true}).click();
  await expect.poll(()=>server.requests.find(r=>r.path==='/api/create')?.body?.goalId).toBe('g1');
  expect(server.requests.find(r=>r.path==='/api/create').body.planTier).toBe('must');
  server.tasks.splice(0,1);
  await d.page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await expect(d.page.getByRole('button',{name:'Chi tiết Review proposal',exact:true})).toHaveCount(0);
  expect(d.errors).toEqual([]);await d.context.close();
});

test('legacy backup survives a failed import and resumes with the same import ID',async({browser})=>{
  const server=fixture();server.failImport=true;
  const legacy={goals:[{id:'old',uid:'old-g',title:'Legacy goal'}],links:{'task-a':'old-g'}};
  const d=await device(browser,server,false,legacy);
  await expect(d.page.getByRole('button',{name:'Thử import lại',exact:true}).first()).toBeVisible();
  const before=await d.page.evaluate(()=>JSON.parse(localStorage.getItem('dat-goals-import-v1')));
  expect(before.goals).toEqual(legacy.goals);expect(before.completed).toBe(false);
  server.failImport=false;await d.page.getByRole('button',{name:'Thử import lại',exact:true}).first().click();
  await expect.poll(()=>d.page.evaluate(()=>JSON.parse(localStorage.getItem('dat-goals-import-v1')).completed)).toBe(true);
  const imports=server.requests.filter(r=>r.path==='/api/goals/import');
  expect(imports[0].body.importId).toBe(imports[1].body.importId);
  expect(await d.page.evaluate(()=>JSON.parse(localStorage.getItem('dat-goals-cache')))).toEqual(legacy.goals);
  await d.context.close();
});
