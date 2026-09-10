// Preserve the existing reference window and tagging examples without sending
// the entire task database on every message.
export function compactChatContext(tasks, today, taskTier = {}) {
  const date = days => { const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10); };
  const byType={},byProj={};
  for(const t of tasks||[]) {
    if(!t?.name)continue;
    if(t.taskType){const a=byType[t.taskType]||=[];if(a.length<6&&!a.includes(t.name))a.push(t.name);}
    for(const p of Array.isArray(t.project)?t.project:[]){const a=byProj[p]||=[];if(a.length<5&&!a.includes(t.name))a.push(t.name);}
  }
  const refs=(tasks||[]).filter(t=>t?.id&&t.name&&t.date&&t.date>=date(-7)&&t.date<=date(14)).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,40).map(t=>({id:t.id,name:t.name,date:t.date,done:t.done,tier:(taskTier[t.id]||t.planTier||t.tier)==='must'?'must':undefined}));
  return {version:1,today,refs,byType,byProj};
}
