import { useEffect, useRef, useState } from 'react';
import { usePlanner } from './PlannerProvider';
import { calendarDay, linkedTasks, selectedWeekBounds } from '../lib/goal-view.js';

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
export function GoalTag({task}) {
  const p=usePlanner(),goal=p.goals.find(g=>g.uid===task.goalId);
  if(!task.goalId)return null;
  const hue=[...task.goalId].reduce((n,c)=>(n*31+c.charCodeAt(0))%360,0);
  return <span className="goal-tag" title={goal?.title||'Goal'} style={{'--goal-hue':hue}} onClick={e=>e.stopPropagation()}>{goal?.emoji||'🎯'} {goal?.title||'Goal'}{goal&&goal.status!=='active'?' · History':''}</span>;
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
  const unavailable=!!p.goalsError,loading=!p.serverLoaded;
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
      {loading?<p role="status">Đang tải goals từ Notion…</p>:unavailable?<p role="alert">{p.goalsError} <button onClick={()=>p.sync({full:true})}>Thử lại</button></p>:<>
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
export function GoalDetail({entry,active,embedded=false}) {
  const p=usePlanner(),[filter,setFilter]=useState('week'),[limit,setLimit]=useState(20),[day,setDay]=useState(0),[failure,setFailure]=useState(null);
  const [motion,setMotion]=useState({}), rowsRef=useRef(null), actions=useRef(new Map()), timers=useRef(new Map()), focusAfterMove=useRef(null);
  const goal=p.goals.find(g=>g.uid===entry.goalId),[start,end]=selectedWeekBounds(p.weekMonday);
  useEffect(()=>{setLimit(20);setDay(0);},[filter,start,entry.goalId]);
  useEffect(()=>()=>{for(const timer of timers.current.values())clearTimeout(timer);},[]);
  useEffect(()=>{
    const target=focusAfterMove.current;
    if(!target)return;
    focusAfterMove.current=null;
    // Moving between groups remounts the row. Keep keyboard focus on its control.
    if(document.activeElement!==document.body&&document.activeElement?.isConnected)return;
    const row=[...rowsRef.current?.querySelectorAll('[data-goal-task]')||[]].find(el=>el.dataset.goalTask===target.id);
    row?.querySelector(target.control)?.focus({preventScroll:true});
  },[p.tasks,motion]);
  if(!goal)return <p>Goal không còn khả dụng.</p>;
  const all=p.tasks.filter(t=>t.goalId===goal.uid),visible=linkedTasks(p.tasks,goal.uid,p.weekMonday,filter);
  const dates=Array.from({length:7},(_,i)=>{const d=new Date(start+'T12:00:00');d.setDate(d.getDate()+i);return calendarDay(d);});
  const toggle=async(id,done)=>{
    const action=(actions.current.get(id)||0)+1;actions.current.set(id,action);
    const focused=document.activeElement;
    if(focused?.closest('[data-goal-task]')?.dataset.goalTask===id)focusAfterMove.current={id,control:focused.matches('input')?'input':'.goal-task-title'};
    setFailure(null);setMotion(current=>({...current,[id]:done?'done':'undo'}));
    clearTimeout(timers.current.get(id));
    timers.current.set(id,setTimeout(()=>{
      setMotion(current=>{const next={...current};delete next[id];return next;});timers.current.delete(id);
    },460));
    // Animation is only feedback; the existing optimistic queue starts immediately.
    const ok=await p.toggleTask(id,done);
    if(!ok&&actions.current.get(id)===action)setFailure({id,done});
  };
  const displayed=filter==='all'?visible.slice(0,limit):visible;
  const groups=filter==='week'?dates:[...new Set(displayed.map(t=>t.date||''))];
  const label=d=>d?d.split('-').reverse().slice(0,2).join('/'):'Chưa có ngày';
  return <div className="goal-dialog goal-inline goal-calendar">
    <header><h3>Task liên kết</h3><small>Tổng liên kết: {all.length} · {all.filter(t=>t.done).length} đã xong</small></header>
    <p>Tuần đang xem · {start} – {end}</p>
    <nav aria-label="Lọc task liên kết"><button aria-pressed={filter==='week'} onClick={()=>setFilter('week')}>Tuần đang xem</button><button aria-pressed={filter==='all'} onClick={()=>setFilter('all')}>Tất cả</button></nav>
    <p>{visible.length} task · {visible.filter(t=>t.done).length} đã xong</p>
    {failure&&<p role="alert">Chưa lưu được trạng thái task. <button onClick={()=>toggle(failure.id,failure.done)}>Thử lại</button></p>}
    {filter==='week'&&<nav className="goal-days" aria-label="Chọn ngày">{dates.map((d,i)=><button key={d} aria-pressed={day===i} onClick={()=>setDay(i)}>{i===6?'CN':`T${i+2}`}<small>{label(d)} · {visible.filter(t=>t.date===d).length}</small></button>)}</nav>}
    <div ref={rowsRef} className={filter==='week'?'goal-week-columns':'goal-all-days'}>{groups.map((d,i)=>{
      const tasks=displayed.filter(t=>(t.date||'')===d);
      return <section key={d} className={`goal-day-column ${day===i?'selected-day':''}`}><header><b>{filter==='week'?(i===6?'Chủ nhật':`Thứ ${i+2}`):''} {label(d)}</b><small>{tasks.filter(t=>t.done).length}/{tasks.length} đã xong</small></header>
      {[false,true].map(done=>{const group=tasks.filter(t=>!!t.done===done);return <div key={String(done)} className="goal-task-group"><h4>{done?'Đã xong':'Chưa xong'} · {group.length}</h4>{!group.length&&<p className="goal-day-empty">{done?'Chưa có task hoàn thành':'Không có task'}</p>}{group.map(t=><div className={`goal-task-item${t.done?' is-complete':''}`} data-goal-task={t.id} data-motion={motion[t.id]} key={t.id}>
        <input type="checkbox" checked={!!t.done} aria-label={`Hoàn thành ${t.name}`} onChange={e=>toggle(t.id,e.target.checked)}/><div><button type="button" className="goal-task-title" aria-pressed={!!t.done} title={t.done?'Bấm để bỏ hoàn thành':'Bấm để hoàn thành'} aria-label={`${t.done?'Bỏ hoàn thành':'Hoàn thành'} ${t.name}`} onClick={()=>toggle(t.id,!t.done)}>{t.name}</button><small>{t.session||'Chưa chọn buổi'}</small></div><button type="button" className="goal-task-edit" title="Chỉnh sửa task" aria-label={`Sửa ${t.name}`} onClick={()=>p.setEditTask(t)}>⋯</button>
      </div>)}</div>;})}</section>;
    })}</div>
    {!visible.length&&<p>Chưa có task trong khoảng này.</p>}
    {filter==='all'&&visible.length>limit&&<button onClick={()=>setLimit(n=>n+20)}>Xem thêm</button>}
    <style jsx global>{`
.goal-calendar>header{align-items:center;flex-wrap:wrap}.goal-week-columns{display:grid;grid-template-columns:repeat(7,minmax(180px,1fr));gap:10px;overflow-x:auto;padding-bottom:12px}.goal-day-column{background:var(--g-bg,var(--c-bg));border:1px solid var(--g-border,var(--c-border));border-radius:14px;padding:12px;min-width:0}.goal-day-column>header{display:block;border-bottom:1px solid var(--g-border,var(--c-border));padding-bottom:12px}.goal-day-column>header small{display:block;margin-top:5px}.goal-calendar .goal-task-group{margin-top:16px}.goal-task-group h4{font-size:.72rem;color:var(--g-muted,var(--c-muted));margin:0 0 8px}.goal-calendar .goal-task-item{background:var(--g-surface,var(--c-surface));border:1px solid var(--g-border,var(--c-border));border-radius:10px;padding:8px;margin-bottom:6px;gap:5px;flex-wrap:wrap}.goal-calendar .goal-task-item>div{flex-basis:85px}.goal-calendar .goal-task-item input{width:17px;height:17px;margin-top:8px}.goal-calendar.goal-dialog .goal-task-edit{flex:0 0 28px;min-height:32px;font-size:.9rem}.goal-calendar.goal-dialog .goal-task-title{font-size:.82rem;line-height:1.5}.goal-calendar .goal-task-item small{font-size:.65rem}.goal-day-empty{opacity:.55;font-size:.75rem!important}.goal-calendar .goal-days{display:none}.goal-all-days{display:grid;gap:12px}.goal-all-days .goal-task-item{flex-wrap:nowrap}.goal-all-days .goal-task-item>div{flex:1}
.goal-calendar .goal-task-item{transition:background .2s,border-color .2s}.goal-calendar .goal-task-item.is-complete{border-color:color-mix(in srgb,var(--g-a,var(--c-wine)) 24%,var(--g-border,var(--c-border)));background:color-mix(in srgb,var(--g-a,var(--c-wine)) 4%,var(--g-surface,var(--c-surface)))}.goal-calendar .goal-task-item input{cursor:pointer;accent-color:var(--g-a,var(--c-wine));border-radius:5px}.goal-calendar .goal-task-item input:focus-visible{outline:2px solid var(--g-a,var(--c-wine));outline-offset:3px}.goal-calendar.goal-dialog .goal-task-title{min-height:32px;padding:5px 6px;text-align:left;font-weight:600;border:1px solid var(--g-border,var(--c-border));border-radius:7px;background:var(--g-bg,var(--c-bg));transition:background .15s,border-color .15s}.goal-calendar.goal-dialog .goal-task-title:hover{background:var(--g-track,var(--c-surface));border-color:var(--g-a,var(--c-wine));box-shadow:none}.goal-calendar.goal-dialog .goal-task-title[aria-pressed=true]{color:var(--g-muted,var(--c-muted));text-decoration:line-through;text-decoration-thickness:1px;border-color:transparent;background:transparent}.goal-calendar.goal-dialog .goal-task-edit{align-self:flex-start;min-width:28px;border:1px solid var(--g-border,var(--c-border));background:var(--g-bg,var(--c-bg));color:var(--g-a,var(--c-wine));font-weight:800;letter-spacing:1px}.goal-calendar .goal-task-item small{margin-top:4px;padding-left:6px}.goal-calendar .goal-task-item[data-motion=done]{animation:goalTaskDone .42s cubic-bezier(.2,.8,.2,1)}.goal-calendar .goal-task-item[data-motion=undo]{animation:goalTaskUndo .42s cubic-bezier(.2,.8,.2,1)}.goal-calendar .goal-task-item[data-motion] input{animation:goalTaskCheck .38s ease-out}
@keyframes goalTaskDone{0%{transform:translateY(-7px) scale(.98);box-shadow:0 0 0 3px color-mix(in srgb,var(--g-a,var(--c-wine)) 28%,transparent);opacity:.7}60%{transform:translateY(1px) scale(1)}100%{transform:none;box-shadow:0 0 0 0 transparent;opacity:1}}@keyframes goalTaskUndo{0%{transform:translateY(7px) scale(.98);box-shadow:0 0 0 3px color-mix(in srgb,var(--g-a,var(--c-wine)) 18%,transparent);opacity:.7}100%{transform:none;box-shadow:0 0 0 0 transparent;opacity:1}}@keyframes goalTaskCheck{0%{transform:scale(.8)}55%{transform:scale(1.2)}100%{transform:scale(1)}}
@media(prefers-reduced-motion:reduce){.goal-calendar .goal-task-item,.goal-calendar .goal-task-item[data-motion],.goal-calendar .goal-task-item[data-motion] input,.goal-calendar.goal-dialog .goal-task-title{animation:none;transition:none}}
@media(max-width:700px){.goal-calendar .goal-days{display:flex;overflow:auto;gap:4px;margin-bottom:12px}.goal-days button{min-width:62px;padding:7px!important}.goal-days small{display:block;font-size:.6rem}.goal-week-columns{display:block;overflow:visible}.goal-week-columns>.goal-day-column{display:none}.goal-week-columns>.selected-day{display:block}.goal-calendar .goal-task-item{flex-wrap:nowrap}.goal-calendar .goal-task-item>div{flex:1}}
`}</style>
  </div>;
}
export function GoalDialogStyles(){return <style jsx global>{`
.goal-tag{display:block;width:fit-content;max-width:100%;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.68rem;line-height:1.5;padding:2px 7px;margin-top:4px;border-radius:6px;color:var(--c-ink);background:hsl(var(--goal-hue) 65% 55% / .18);border:1px solid hsl(var(--goal-hue) 65% 50% / .35)}.goal-inline{border:0;box-shadow:none;max-height:none;max-width:none;padding:0;background:transparent}.goal-link-button{font:inherit;font-size:.75rem;color:var(--c-wine,var(--c-ink));background:var(--c-surface);border:1px solid var(--c-border);border-radius:9px;min-height:32px;padding:5px 9px;margin-top:5px;max-width:100%;text-align:left;cursor:pointer;overflow-wrap:anywhere}
.goal-dialog-backdrop{position:fixed;inset:0;z-index:120;background:#201b2566;backdrop-filter:blur(4px);align-items:center;justify-content:center;padding:24px}
.goal-dialog{background:var(--c-bg,#fff);color:var(--c-ink,#292524);border:1px solid var(--c-border,#ddd);border-radius:22px;max-width:620px;width:100%;max-height:88dvh;overflow:auto;padding:24px;box-shadow:0 20px 80px #0003;font-family:inherit;box-sizing:border-box}
.goal-dialog header{display:flex;align-items:center;justify-content:space-between;gap:12px}.goal-dialog h2{font-size:1.3rem;margin:0}.goal-dialog h3{font-size:.95rem}.goal-dialog p,.goal-dialog small{font-size:.82rem;line-height:1.5}.goal-dialog button{font:inherit;cursor:pointer;border:1px solid var(--c-border,#ddd);background:var(--c-surface,#fafafa);color:inherit;border-radius:10px;padding:9px 12px;min-height:40px}.goal-dialog button:disabled{opacity:.55;cursor:wait}.goal-dialog button:focus-visible,.goal-link-button:focus-visible{outline:3px solid var(--c-wine,#9a6678);outline-offset:2px}.goal-dialog button[aria-pressed=true]{border-color:var(--c-wine,#9a6678);background:color-mix(in srgb,var(--c-ink,#292524) 8%,var(--c-bg,#fff))}.goal-dialog nav{display:flex;gap:8px}.goal-dialog .goal-option{display:flex;width:100%;align-items:center;gap:12px;margin:8px 0;padding:14px;text-align:left;box-sizing:border-box}.goal-option>span:first-child{font-size:1.5rem}.goal-option>span:nth-child(2){flex:1;min-width:0}.goal-option b,.goal-option small{display:block;overflow-wrap:anywhere}.goal-option small{opacity:.7;margin-top:4px}.goal-option.history{border:1px dashed var(--c-border,#ccc);border-radius:10px}.goal-task-item{display:flex;align-items:flex-start;gap:12px;border-top:1px solid var(--c-border,#ddd);padding:12px 0}.goal-task-item>div{min-width:0;flex:1}.goal-task-item input{width:22px;height:22px;margin-top:9px;flex-shrink:0;accent-color:var(--c-wine,#9a6678)}.goal-dialog .goal-task-title{display:block;text-align:left;border:0;background:none;padding:5px 0;overflow-wrap:anywhere;width:100%}.goal-dialog .goal-task-edit{flex:0 0 40px;padding:4px;font-size:1.1rem}.goal-task-item small{display:block;opacity:.7}.goal-milestones{padding-left:0;list-style:none;font-size:.85rem;line-height:1.8}.goal-task-group{margin-top:24px}
@media(max-width:640px){.goal-dialog-backdrop{padding:0;align-items:flex-end}.goal-dialog{max-width:none;max-height:90dvh;border-radius:22px 22px 0 0;padding:20px 18px calc(20px + env(safe-area-inset-bottom))}.goal-link-button{min-height:36px}}
`}</style>}
