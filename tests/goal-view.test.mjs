import test from 'node:test';
import assert from 'node:assert/strict';
import {selectedWeekBounds,linkedTasks} from '../lib/goal-view.js';
const week=new Date(2026,8,9);
test('calendar week includes Monday through Sunday across months and years',()=>{
 assert.deepEqual(selectedWeekBounds(week),['2026-09-07','2026-09-13']);
 assert.deepEqual(selectedWeekBounds(new Date(2027,0,3)),['2026-12-28','2027-01-03']);
});
test('selected week uses scheduling dates and current done state; all includes undated tasks',()=>{
 const tasks=['2026-09-06','2026-09-07','2026-09-13','2026-09-14',null].map((date,i)=>({id:String(i),name:String(i),goalId:'g',date,done:i%2===0}));
 assert.deepEqual(linkedTasks(tasks,'g',week).map(t=>t.id),['1','2']);
 assert.equal(linkedTasks(tasks,'g',week,'all').length,5);
 assert.equal(linkedTasks(tasks,'other',week,'all').length,0);
 tasks[1].done=true;assert.equal(linkedTasks(tasks,'g',week).filter(t=>t.done).length,2);
 assert.deepEqual(linkedTasks(tasks,'g',new Date(2026,7,31)).map(t=>t.id),['0']);
});
test('task sorting uses date, session, planning order then title',()=>{
 const base={date:'2026-09-07',goalId:'g',session:'🌅 Sáng'};
 const tasks=[{...base,id:'b',name:'B',planOrder:1},{...base,id:'a',name:'A',planOrder:1},{...base,id:'first',name:'Z',planOrder:0},{...base,id:'evening',name:'A',session:'🌙 Tối',planOrder:0},{...base,id:'none',name:'A',session:null}];
 assert.deepEqual(linkedTasks(tasks,'g',week).map(t=>t.id),['first','a','b','evening','none']);
});
