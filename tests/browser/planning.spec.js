const { test, expect } = require('@playwright/test');
const clone = value => JSON.parse(JSON.stringify(value));
function fixture() {
  const goals = ['Learn','Build'].map((title,i)=>({id:`goal-${i}`,uid:`g${i}`,title,emoji:'🎯',status:'active',deadline:'2026-12-01',weeklyOutcome:'Weekly outcome',createdAt:'2026-08-01',updatedAt:'2026-09-01',milestones:[{id:`m${i}`,text:'First milestone',done:false}]}));
  const tasks = [{id:'task-a',name:'Review proposal',done:false,date:'2026-09-07',session:'🌅 Sáng',taskType:null,icon:'',priority:[],project:[],planTier:'must',planOrder:0,goalId:'g0'}];
  let failGoals=false, failWrite=false, delayedWrite=null;
  const requests=[];
  async function route(route) {
    const req=route.request(),path=new URL(req.url()).pathname,body=req.postDataJSON(),method=req.method();
    requests.push({path,url:req.url(),method,body});
    let data={},status=200;
    if(path==='/api/tasks')data={tasks:clone(tasks),mode:new URL(req.url()).searchParams.has('since')?'delta':'snapshot',syncedAt:'2026-09-07T03:00:00Z'};
    else if(path==='/api/goals'&&method==='GET'){if(failGoals){status=503;data={error:'Goals temporarily unavailable'};}else data={goals:clone(goals)};}
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
  return {tasks,goals,requests,route,set failGoals(v){failGoals=v;},set failWrite(v){failWrite=v;},set delayedWrite(v){delayedWrite=v;}};
}
async function device(browser,server,mobile=false,legacy=null){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-09-07T03:00:00Z')});
  await context.route('**/api/**',server.route);
  await page.addInitScript(data=>{localStorage.setItem('dat-volume','0');if(data){localStorage.setItem('dat-goals-cache',JSON.stringify(data.goals));localStorage.setItem('dat-goal-links',JSON.stringify(data.links));}},legacy);
  await page.goto('/');
  await expect(page.getByRole('button',{name:'Hoàn thành Review proposal',exact:true})).toBeVisible();
  return {context,page,errors};
}
async function detail(page){await page.getByRole('button',{name:'Sửa Review proposal',exact:true}).click();await expect(page.getByLabel('Liên kết goal',{exact:true})).toBeVisible();}

async function choose(page,id){
  await page.getByLabel('Liên kết goal',{exact:true}).click();
  await page.getByRole('dialog',{name:'Liên kết goal',exact:true}).getByRole('button',{name:id==='g0'?/Learn/:id==='g1'?/Build/:/Không liên kết/}).click();
}

test('mobile and desktop sync done, goal links, nulls and direct Notion edits without losing an open draft',async({browser})=>{
  const server=fixture();const desktop=await device(browser,server),mobile=await device(browser,server,true);
  const check=p=>p.getByRole('checkbox',{name:'Hoàn thành Review proposal',exact:true});
  await check(desktop.page).click();await expect(check(desktop.page)).toHaveAttribute('aria-checked','true');
  await expect(desktop.page.locator('.wp-goal-row').first().locator('.task-number')).toHaveText('1/1');
  await mobile.page.clock.fastForward(15001);
  await expect(check(mobile.page)).toHaveAttribute('aria-checked','true');
  await detail(mobile.page);await choose(mobile.page,'g1');
  await mobile.page.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();
  await expect(mobile.page.getByLabel('Liên kết goal',{exact:true})).not.toBeVisible();
  await desktop.page.clock.fastForward(15001);
  await expect(desktop.page.locator('[data-testid="task-goal"]').first()).toContainText('Build');
  await expect(desktop.page.locator('.wp-goal-row').nth(1).locator('.task-number')).toHaveText('1/1');
  // A remote edit arrives while an unsaved goal choice is open.
  await detail(mobile.page);await choose(mobile.page,'g0');
  Object.assign(server.tasks[0],{done:false,planTier:null,planOrder:null});
  await mobile.page.clock.fastForward(15001);
  await expect(mobile.page.getByLabel('Liên kết goal',{exact:true})).toContainText('Learn');
  await mobile.page.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();
  expect(server.tasks[0].done).toBe(false);
  await desktop.page.clock.fastForward(15001);await expect(check(desktop.page)).toHaveAttribute('aria-checked','false');
  await detail(desktop.page);await choose(desktop.page,'');
  await desktop.page.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();
  await mobile.page.clock.fastForward(15001);await expect(mobile.page.locator('[data-testid="task-goal"]')).toHaveCount(0);
  expect(server.requests.some(r=>r.path==='/api/tasks'&&r.url.includes('since='))).toBe(true);
  expect(desktop.errors).toEqual([]);expect(mobile.errors).toEqual([]);
  await desktop.context.close();await mobile.context.close();
});

test('failed save keeps the editor draft and retry succeeds; only ellipsis opens settings',async({browser})=>{
  const server=fixture(),d=await device(browser,server,true);
  await d.page.getByRole('button',{name:'Hoàn thành Review proposal',exact:true}).click();
  await expect(d.page.getByRole('button',{name:'Bỏ hoàn thành Review proposal',exact:true})).toBeVisible();
  await d.page.getByRole('button',{name:'Bỏ hoàn thành Review proposal',exact:true}).click();
  await expect(d.page.getByRole('dialog')).toHaveCount(0);expect(server.tasks[0].done).toBe(false);
  await detail(d.page);
  await choose(d.page,'g1');server.failWrite=true;
  await d.page.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();
  await expect(d.page.getByText('Chưa lưu được. Dữ liệu đang sửa vẫn được giữ; hãy thử lại.',{exact:true})).toBeVisible();
  await expect(d.page.getByLabel('Liên kết goal',{exact:true})).toContainText('Build');
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
  await expect(d.page.getByRole('button',{name:/Review proposal/,exact:true})).toHaveCount(0);
  expect(d.errors).toEqual([]);await d.context.close();
});

test('legacy local goals and links are ignored in favor of the Notion snapshot',async({browser})=>{
  const server=fixture();
  const legacy={goals:[{id:'old',uid:'old-g',title:'Legacy goal'}],links:{'task-a':'old-g'}};
  const d=await device(browser,server,false,legacy);
  await expect(d.page.locator('.wp-goal-row')).toHaveCount(2);
  await expect(d.page.locator('.wp-goal-board')).toContainText('Learn');
  await expect(d.page.locator('.wp-goal-board')).not.toContainText('Legacy goal');
  expect(server.requests.some(r=>r.path==='/api/goals/legacy'||r.path==='/api/goals/import')).toBe(false);
  expect(await d.page.evaluate(()=>localStorage.getItem('dat-goals-import-v1'))).toBeNull();
  await d.context.close();
});

test('goal detail follows selected week, includes current done state, and all dates paginates',async({browser})=>{
 const s=fixture();
 s.tasks.push(...Array.from({length:22},(_,i)=>({...s.tasks[0],id:`old-${i}`,name:`Past ${String(i).padStart(2,'0')}`,date:'2026-09-06',done:true,planOrder:i})),{...s.tasks[0],id:'undated',name:'No date',date:null});
 const d=await device(browser,s);const p=d.page;
 await p.locator('.wp-goal-row').first().click();
 const dialog=p.getByRole('dialog',{name:'🎯 Learn',exact:true});
 await expect(dialog.getByRole('heading',{name:'Chưa xong · 1',exact:true})).toBeVisible();
 await expect(dialog.getByText('Tổng liên kết: 24',{exact:true})).toBeVisible();
 await expect(dialog.getByRole('button',{name:/Past 00/,exact:true})).toHaveCount(0);
 await dialog.getByRole('button',{name:'Tất cả',exact:true}).click();
 await expect(dialog.getByRole('button',{name:'Hoàn thành No date',exact:true})).toBeVisible();
 await expect(dialog.locator('.goal-task-item')).toHaveCount(22);
 await dialog.getByRole('button',{name:'Xem thêm',exact:true}).click();
 await expect(dialog.locator('.goal-task-item')).toHaveCount(24);
 await dialog.getByRole('button',{name:'Đóng',exact:true}).click();
 await p.getByTitle('Tuần trước',{exact:true}).first().click();
 await expect(p.locator('.wp-goal-row').first()).toContainText('2026-08-31 – 2026-09-06: 22/22');
 await p.locator('.wp-goal-row').first().click();
 await expect(dialog.getByRole('heading',{name:'Đã xong · 22',exact:true})).toBeVisible();
 await expect(dialog.getByRole('button',{name:/No date/,exact:true})).toHaveCount(0);
 await dialog.getByRole('checkbox',{name:'Hoàn thành Past 00',exact:true}).uncheck();
 await expect(dialog.getByRole('heading',{name:'Chưa xong · 1',exact:true})).toBeVisible();
 await expect(dialog.getByRole('heading',{name:'Đã xong · 21',exact:true})).toBeVisible();
 expect(d.errors).toEqual([]);await d.context.close();
});

test('row picker saves immediately with contextual retry, History is read-only, editor returns to goal detail',async({browser})=>{
 const s=fixture(),d=await device(browser,s,true),p=d.page;
 const rowButton=p.getByLabel('Liên kết goal cho Review proposal',{exact:true});
 await rowButton.click();s.failWrite=true;
 const picker=p.getByRole('dialog',{name:'Liên kết goal',exact:true});
 await picker.getByRole('button',{name:/Build/}).click();
 await expect(picker.getByRole('alert')).toContainText('Chưa lưu được liên kết');
 expect(s.tasks[0].done).toBe(false);s.failWrite=false;
 await picker.getByRole('button',{name:'Thử lại',exact:true}).click();
 await expect(picker).toHaveCount(0);await expect(rowButton).toContainText('Build');
 await expect(rowButton).toBeFocused();
 s.goals[1].status='archived';await p.clock.fastForward(15001);
 await rowButton.click();await expect(picker.getByText('History · Liên kết hiện tại')).toBeVisible();
 await expect(picker.getByRole('button',{name:/Build/})).toHaveCount(0);
 await picker.getByRole('button',{name:/Không liên kết/}).click();await expect(rowButton).toHaveText('＋ Liên kết goal');
 await rowButton.click();await picker.getByRole('button',{name:/Learn/}).click();
 await p.getByRole('button',{name:'📊 Biểu đồ',exact:true}).click();
 await p.locator('.wp-goal-row').first().click();
 const goal=p.getByRole('dialog',{name:'🎯 Learn',exact:true});
 await goal.getByRole('button',{name:'Sửa Review proposal',exact:true}).click();
 await expect(p.getByRole('dialog')).toHaveCount(1);
 await choose(p,'');expect(s.tasks[0].goalId).toBe('g0');
 await p.getByRole('button',{name:'Hủy',exact:true}).click();await p.clock.fastForward(300);
 await expect(goal).toBeVisible();await expect(goal.getByRole('button',{name:'Sửa Review proposal',exact:true})).toBeFocused();
 await goal.getByLabel('Liên kết goal cho Review proposal',{exact:true}).click();
 await picker.getByRole('button',{name:/Không liên kết/}).click();
 await expect(goal.getByRole('heading',{name:'Chưa xong · 0',exact:true})).toBeVisible();
 expect(d.errors).toEqual([]);await d.context.close();
});

test('deleted task cannot be saved from an open draft and keyboard focus stays in picker',async({browser})=>{
 const s=fixture(),d=await device(browser,s),p=d.page;
 await detail(p);await choose(p,'g1');
 await p.getByLabel('Liên kết goal',{exact:true}).click();
 const picker=p.getByRole('dialog',{name:'Liên kết goal',exact:true});
 await picker.getByRole('button').last().focus();await p.keyboard.press('Tab');
 await expect(picker.getByRole('button').first()).toBeFocused();
 await p.keyboard.press('Escape');await expect(p.getByLabel('Liên kết goal',{exact:true})).toBeFocused();
 s.tasks.splice(0);await p.evaluate(()=>window.dispatchEvent(new Event('online')));
 await expect(p.getByText('Task đã bị xóa từ thiết bị khác. Đóng form để cập nhật danh sách.',{exact:true})).toBeVisible();
 await expect(p.getByRole('button',{name:'Lưu thay đổi',exact:true})).toBeDisabled();
 expect(s.requests.filter(r=>r.path==='/api/update')).toHaveLength(0);
 expect(d.errors).toEqual([]);await d.context.close();
});

test('goals loading failure retries, empty active state opens creation, and picker follows dark theme',async({browser})=>{
 const s=fixture();s.failGoals=true;const d=await device(browser,s,true),p=d.page;
 await p.getByLabel('Liên kết goal cho Review proposal',{exact:true}).click();
 const picker=p.getByRole('dialog',{name:'Liên kết goal',exact:true});
 await expect(picker.getByRole('alert')).toContainText('Goals temporarily unavailable');
 s.failGoals=false;await picker.getByRole('button',{name:'Thử lại',exact:true}).click();
 await expect(picker.getByRole('button',{name:/Learn/})).toBeVisible();
 await picker.getByRole('button',{name:'Đóng',exact:true}).click();
 await p.getByTitle('Đổi giao diện',{exact:true}).click();await p.getByRole('button',{name:'🕹️ Cyber',exact:true}).click();
 await p.clock.fastForward(1000);
 await p.getByLabel('Liên kết goal cho Review proposal',{exact:true}).click();
 await expect(picker).toHaveCSS('background-color','rgb(4, 8, 10)');
 const box=await picker.boundingBox();expect(box.width).toBeLessThanOrEqual(390);expect(box.y+box.height).toBeCloseTo(844,0);
 await picker.getByRole('button',{name:'Đóng',exact:true}).click();
 s.goals.forEach(g=>g.status='archived');await p.clock.fastForward(15001);
 await p.getByLabel('Liên kết goal cho Review proposal',{exact:true}).click();
 await picker.getByRole('button',{name:'＋ Tạo Goal',exact:true}).click();
 await expect(p.getByRole('dialog',{name:'Sửa Goal',exact:true})).toBeVisible();
 await expect(p.getByRole('dialog')).toHaveCount(1);
 expect(d.errors).toEqual([]);await d.context.close();
});
