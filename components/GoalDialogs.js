import { useEffect, useRef, useState } from 'react';
import { usePlanner } from './PlannerProvider';
import { linkedTasks, selectedWeekBounds } from '../lib/goal-view.js';

export function useDialogFocus(active, onClose) {
  const ref = useRef(null), close = useRef(onClose); close.current=onClose;
  useEffect(()=>{
    if(!active || !ref.current) return;
    const el=ref.current;
    const frame=requestAnimationFrame(()=>{ if(!el.contains(document.activeElement)) (el.querySelector('button:not(:disabled), input:not(:disabled)')||el).focus(); });
    const key=e=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close.current();}
      if(e.key==='Tab'){
        const nodes=[...el.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(n=>n.getClientRects().length);
        if(!nodes.length){e.preventDefault();el.focus();return;}
        const first=nodes[0],last=nodes.at(-1);
        if(e.shiftKey && (document.activeElement===first||!el.contains(document.activeElement))){e.preventDefault();last.focus();}
        else if(!e.shiftKey && (document.activeElement===last||!el.contains(document.activeElement))){e.preventDefault();first.focus();}
      }
    };
    el.addEventListener('keydown',key);
    return ()=>{cancelAnimationFrame(frame);el.removeEventListener('keydown',key);};
  },[active]);
  return ref;
}
function Dialog({title,onClose,children,active=true}) {
  const ref=useDialogFocus(active,onClose);
  return <div className="goal-dialog-backdrop" style={{display:active?'flex':'none'}} onClick={onClose}>
    <section ref={ref} className="goal-dialog" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onClick={e=>e.stopPropagation()}>
      <header><h2>{title}</h2><button aria-label="Đóng" onClick={onClose}>✕</button></header>{children}
    </section>
  </div>;
}
export function GoalLinkButton({task,onSelect,disabled=false,editor=false}) {
  const p=usePlanner(),goal=p.goals.find(g=>g.uid===task.goalId);
  return <button type="button" className="goal-link-button" data-testid={task.goalId?'task-goal':'task-goal-empty'}
    aria-label={editor?'Liên kết goal':`Liên kết goal cho ${task.name}`} disabled={disabled||task.id.startsWith('temp-')}
    onPointerDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}
    onClick={e=>{e.stopPropagation();p.openDialog({kind:'picker',taskId:task.id,goalId:task.goalId,onSelect});}}>
    {task.goalId ? `${goal?.emoji||'🎯'} ${goal?.title||'Goal không còn khả dụng'}${goal?.status!=='active'?' · History':''}` : '＋ Liên kết goal'}
  </button>;
}
export function GoalPicker({entry}) {
  const p=usePlanner(),[saving,setSaving]=useState(false),[failure,setFailure]=useState(null);
  const task=p.tasks.find(t=>t.id===entry.taskId), selected=entry.onSelect?entry.goalId:task?.goalId;
  const unavailable=!!p.goalsError||!!p.migration.error,loading=!p.serverLoaded||p.migration.running;
  const active=p.goals.filter(g=>g.status==='active'), current=p.goals.find(g=>g.uid===selected);
  const choose=async id=>{
    if(!task || saving) return;
    if(entry.onSelect){entry.onSelect(id);p.closeDialog();return;}
    setSaving(true);setFailure(null);
    const ok=await p.updateTask(task.id,{goalId:id});setSaving(false);
    if(ok)p.closeDialog();else setFailure({id,message:'Chưa lưu được liên kết. Vui lòng thử lại.'});
  };
  return <Dialog title="Liên kết goal" onClose={()=>{if(!saving)p.closeDialog();}}>
    <p>Chọn mục tiêu cho task này</p>
    {!task?<p role="alert">Task đã bị xóa từ thiết bị khác.</p>:<>
      {loading?<p role="status">Đang tải goals…</p>:unavailable?<p role="alert">{p.goalsError||p.migration.error} <button onClick={()=>p.migration.error?p.retryMigration():p.sync({full:true})}>Thử lại</button></p>:<>
        <button className="goal-option" disabled={saving} aria-pressed={!selected} onClick={()=>choose(null)}><span>∅</span><span><b>Không liên kết</b><small>Gỡ liên kết hiện tại</small></span><span>{!selected?'✓':''}</span></button>
        {selected && (!current || current.status!=='active') && <div className="goal-option history"><span>{current?.emoji||'🎯'}</span><span><b>{current?.title||'Goal không còn khả dụng'}</b><small>History · Liên kết hiện tại</small></span><span>✓</span></div>}
        {active.map(g=><button key={g.uid} className="goal-option" disabled={saving} aria-pressed={selected===g.uid} onClick={()=>choose(g.uid)}><span>{g.emoji||'🎯'}</span><span><b>{g.title}</b><small>{g.milestones?.find(m=>!m.done)?.text||'Milestones hoàn tất'}</small></span><span>{selected===g.uid?'✓':''}</span></button>)}
        {!active.length && <p>Chưa có goal active. <button onClick={()=>p.openDialog({kind:'createGoal'})}>＋ Tạo Goal</button></p>}
      </>}
    </>}
    {saving && <p role="status">Đang lưu liên kết…</p>}
    {failure && <p role="alert">{failure.message} <button disabled={saving||!task} onClick={()=>choose(failure.id)}>Thử lại</button></p>}
  </Dialog>;
}
export function GoalDetail({entry,active}) {
  const p=usePlanner(),[filter,setFilter]=useState('week'),[limits,setLimits]=useState([20,20]),[failure,setFailure]=useState(null);
  const goal=p.goals.find(g=>g.uid===entry.goalId),[start,end]=selectedWeekBounds(p.weekMonday);
  useEffect(()=>setLimits([20,20]),[filter,start,entry.goalId]);
  if(!goal)return <Dialog active={active} title="Chi tiết Goal" onClose={p.closeDialog}><p>Goal không còn khả dụng.</p><button onClick={()=>p.sync({full:true})}>Thử lại</button></Dialog>;
  const all=p.tasks.filter(t=>t.goalId===goal.uid),visible=linkedTasks(p.tasks,goal.uid,p.weekMonday,filter);
  const toggle=async(id,done)=>{setFailure(null);if(!await p.toggleTask(id,done))setFailure({id,done});};
  const milestones=goal.milestones||[],percent=milestones.length?Math.round(100*milestones.filter(m=>m.done).length/milestones.length):0;
  return <Dialog active={active} title={`${goal.emoji||'🎯'} ${goal.title}`} onClose={p.closeDialog}>
    <p>{goal.status!=='active'?'History · ':''}{goal.deadline?`Hạn ${goal.deadline}`:''}</p>
    {goal.weeklyOutcome && <p>{goal.weeklyOutcome}</p>}
    <h3>Milestones · {percent}%</h3><ul className="goal-milestones">{milestones.map(m=><li key={m.id}>{m.done?'✓':'○'} {m.text}</li>)}</ul>
    <p><b>Tổng liên kết: {all.length}</b> · {all.filter(t=>t.done).length} đã xong</p>
    <p>Tuần đang xem · {start} – {end}</p>
    <nav aria-label="Lọc task liên kết"><button aria-pressed={filter==='week'} onClick={()=>setFilter('week')}>Tuần đang xem</button><button aria-pressed={filter==='all'} onClick={()=>setFilter('all')}>Tất cả</button></nav>
    {failure && <p role="alert">Chưa lưu được trạng thái task. <button onClick={()=>toggle(failure.id,failure.done)}>Thử lại</button></p>}
    {[false,true].map((done,index)=>{const group=visible.filter(t=>!!t.done===done);return <section key={String(done)} className="goal-task-group">
      <h3>{done?'Đã xong':'Chưa xong'} · {group.length}</h3>
      {!group.length && <p>Không có task trong nhóm này.</p>}
      {group.slice(0,limits[index]).map(t=><div className="goal-task-item" key={t.id}>
        <input type="checkbox" checked={!!t.done} aria-label={`Hoàn thành ${t.name}`} onChange={e=>toggle(t.id,e.target.checked)}/>
        <div><button className="goal-task-title" onClick={()=>p.setEditTask(t)}>{t.name}</button><small>{t.date||'Chưa có ngày'} · {t.session||'Chưa chọn buổi'}</small><GoalLinkButton task={t}/></div>
      </div>)}
      {group.length>limits[index] && <button onClick={()=>setLimits(v=>v.map((n,i)=>i===index?n+20:n))}>Xem thêm</button>}
    </section>;})}
  </Dialog>;
}
export function GoalDialogStyles(){return <style jsx global>{`
.goal-link-button{font:inherit;font-size:.75rem;color:var(--c-wine,var(--c-ink));background:var(--c-surface);border:1px solid var(--c-border);border-radius:9px;min-height:32px;padding:5px 9px;margin-top:5px;max-width:100%;text-align:left;cursor:pointer;overflow-wrap:anywhere}
.goal-dialog-backdrop{position:fixed;inset:0;z-index:120;background:#201b2566;backdrop-filter:blur(4px);align-items:center;justify-content:center;padding:24px}
.goal-dialog{background:var(--c-bg,#fff);color:var(--c-ink,#292524);border:1px solid var(--c-border,#ddd);border-radius:22px;max-width:620px;width:100%;max-height:88dvh;overflow:auto;padding:24px;box-shadow:0 20px 80px #0003;font-family:inherit;box-sizing:border-box}
.goal-dialog header{display:flex;align-items:center;justify-content:space-between;gap:12px}.goal-dialog h2{font-size:1.3rem;margin:0}.goal-dialog h3{font-size:.95rem}.goal-dialog p,.goal-dialog small{font-size:.82rem;line-height:1.5}.goal-dialog button{font:inherit;cursor:pointer;border:1px solid var(--c-border,#ddd);background:var(--c-surface,#fafafa);color:inherit;border-radius:10px;padding:9px 12px;min-height:40px}.goal-dialog button:disabled{opacity:.55;cursor:wait}.goal-dialog button:focus-visible,.goal-link-button:focus-visible{outline:3px solid var(--c-wine,#9a6678);outline-offset:2px}.goal-dialog button[aria-pressed=true]{border-color:var(--c-wine,#9a6678);background:color-mix(in srgb,var(--c-ink,#292524) 8%,var(--c-bg,#fff))}.goal-dialog nav{display:flex;gap:8px}.goal-dialog .goal-option{display:flex;width:100%;align-items:center;gap:12px;margin:8px 0;padding:14px;text-align:left;box-sizing:border-box}.goal-option>span:first-child{font-size:1.5rem}.goal-option>span:nth-child(2){flex:1;min-width:0}.goal-option b,.goal-option small{display:block;overflow-wrap:anywhere}.goal-option small{opacity:.7;margin-top:4px}.goal-option.history{border:1px dashed var(--c-border,#ccc);border-radius:10px}.goal-task-item{display:flex;align-items:flex-start;gap:12px;border-top:1px solid var(--c-border,#ddd);padding:12px 0}.goal-task-item>div{min-width:0;flex:1}.goal-task-item input{width:22px;height:22px;margin-top:9px;flex-shrink:0;accent-color:var(--c-wine,#9a6678)}.goal-dialog .goal-task-title{display:block;text-align:left;border:0;background:none;padding:5px 0;overflow-wrap:anywhere;width:100%}.goal-task-item small{display:block;opacity:.7}.goal-milestones{padding-left:0;list-style:none;font-size:.85rem;line-height:1.8}.goal-task-group{margin-top:24px}
@media(max-width:640px){.goal-dialog-backdrop{padding:0;align-items:flex-end}.goal-dialog{max-width:none;max-height:90dvh;border-radius:22px 22px 0 0;padding:20px 18px calc(20px + env(safe-area-inset-bottom))}.goal-link-button{min-height:36px}}
`}</style>}
