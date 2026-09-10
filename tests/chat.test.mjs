import test from 'node:test';
import assert from 'node:assert/strict';
import {compactChatContext} from '../lib/chat-context.js';
import handler from '../pages/api/chat.js';

test('compact chat context keeps reference IDs and caps examples for 1438 tasks',()=>{
 const tasks=Array.from({length:1438},(_,i)=>({id:String(i),name:`Work ${i}`,date:i<50?'2026-09-10':'2025-01-01',taskType:'Work',project:['Project'],done:false}));
 const c=compactChatContext(tasks,'2026-09-10');
 assert.deepEqual(c.refs.map(t=>t.id),tasks.slice(0,40).map(t=>t.id));
 assert.equal(c.byType.Work.length,6);assert.equal(c.byProj.Project.length,5);
 const before=JSON.stringify({tasks}).length,after=JSON.stringify({context:c}).length;
 assert.ok(after<before*.1);console.log(`Chat payload fixture: ${before} → ${after} bytes`);
});

test('chat accepts legacy and compact context, times AI and rejects truncated output',async()=>{
 process.env.ANTHROPIC_API_KEY='test';
 const tasks=[{id:'real-id',name:'Task',date:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh'}).format(new Date()),done:false}];
 const today=tasks[0].date;
 let truncated=false,seen;
 const original=global.fetch;
 global.fetch=async(url,options)=>{seen=options;return new Response(JSON.stringify({stop_reason:truncated?'max_tokens':'end_turn',content:[{type:'text',text:JSON.stringify({reply:'OK',tasks:[],moves:[],dones:[{ref:1,done:true}],tiers:[]})}]}));};
 try {
  for(const payload of [{tasks},{context:compactChatContext(tasks,today)}]){
   let data;const headers={};await handler({method:'POST',body:{...payload,messages:[{role:'user',content:'xong Task'}]}},{setHeader:(k,v)=>headers[k]=v,status(){return this;},json(d){data=d;},end(){}});
   assert.equal(data.dones[0].id,'real-id');assert.ok(seen.signal);assert.match(headers['Server-Timing'],/ai;dur=/);
  }
  truncated=true;let data;await handler({method:'POST',body:{tasks,messages:[{role:'user',content:'xong'}]}},{setHeader(){},status(){return this;},json(d){data=d;},end(){}});
  assert.deepEqual(data.tasks,[]);assert.equal(data.dones,undefined);
 }finally{global.fetch=original;}
});
