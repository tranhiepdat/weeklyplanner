import GoalWorkspaceStyles from "./GoalWorkspaceStyles";
import { useEffect, useRef, useState } from 'react';
import { usePlanner, PlannerSyncNotice } from './PlannerProvider';
import { GoalDetail, useDialogFocus } from './GoalDialogs';
import { calendarDay, selectedWeekBounds } from '../lib/goal-view';
const dateLabel = d => d ? d.split('-').reverse().join('/') : 'Chưa đặt hạn';
const fresh = () => ({uid:crypto.randomUUID(),title:'',emoji:'🎯',status:'active',deadline:calendarDay(new Date(Date.now()+90*86400000)),weeklyOutcome:'',milestones:[{id:crypto.randomUUID(),text:'',done:false}]});
function EditableText(props) {
  const ref=useRef(null);
  useEffect(()=>{
    const el=ref.current;let width=-1;
    const fit=()=>{if(!el.clientWidth)return;el.style.height='auto';el.style.height=(el.scrollHeight+2)+'px';};
    fit();const observer=new ResizeObserver(()=>{if(width!==el.clientWidth){width=el.clientWidth;fit();}});observer.observe(el);
    return()=>observer.disconnect();
  },[props.value]);
  return <textarea {...props} ref={ref} rows={1} style={{resize:'none',overflow:'hidden',lineHeight:1.5}}/>;
}
export default function GoalWorkspace({entry,active,onClose}) {
  const p=usePlanner();
  const [overview,setOverview]=useState(!entry.goalId&&entry.kind!=='createGoal');
  const [weekStart,weekEnd]=selectedWeekBounds(p.weekMonday);
  const [selected,select]=useState(entry.goalId||p.goals.find(g=>g.status==='active')?.uid);
  const [filter,setFilter]=useState(!entry.goalId&&entry.kind!=='createGoal'?'active':p.goals.find(g=>g.uid===entry.goalId)?.status==='active'||!entry.goalId?'active':'history');
  const [draft,setDraft]=useState(entry.kind==='createGoal'?fresh():null),[base,setBase]=useState(null);
  const [saving,setSaving]=useState(false),[error,setError]=useState(''),[leave,setLeave]=useState(null),[celebrate,setCelebrate]=useState(false);
  const goal=p.goals.find(g=>g.uid===selected),shown=draft||goal;
  const dirty=!!draft;
  const navigate=action=>{if(saving)return;if(dirty)setLeave(()=>action);else action();};
  const ref=useDialogFocus(active,()=>navigate(onClose));
  const edit=patch=>{if(saving)return;if(!draft)setBase(goal);setDraft(d=>({...d||goal,...patch}));};
  const save=async()=>{
    if(!draft)return true;
    if(!draft.title.trim()||!draft.deadline||!draft.milestones.length||draft.milestones.some(m=>!m.text.trim())){setError('Điền tên, deadline và nội dung milestones trước khi lưu.');return false;}
    if(draft.id&&!p.goals.some(g=>g.id===draft.id)){setError('Goal đã bị xóa từ thiết bị khác.');return false;}
    const input=draft.id?{id:draft.id}:draft;
    if(draft.id){for(const k of ['title','emoji','deadline','weeklyOutcome','milestones'])if(JSON.stringify(draft[k])!==JSON.stringify(base[k]))input[k]=draft[k];if(input.milestones)input.milestoneBase=base.milestones;}
    setSaving(true);setError('');const ok=await p.saveGoal(input);setSaving(false);
    if(ok){select(draft.uid);setDraft(null);setBase(null);}else setError('Chưa lưu được. Bản nháp vẫn được giữ; hãy thử lại.');return ok;
  };
  const status=async value=>{setSaving(true);setError('');const ok=await p.saveGoal({id:goal.id,status:value,achievedAt:value==='achieved'?calendarDay(new Date()):null,archivedAt:value==='archived'?calendarDay(new Date()):null});setSaving(false);if(ok){setFilter(value==='active'?'active':'history');setCelebrate(value==='achieved');}else setError('Chưa lưu được trạng thái Goal. Hãy thử lại.');};
  const list=p.goals.filter(g=>filter==='all'||(filter==='active'?g.status==='active':g.status!=='active'));
  useEffect(()=>{if(!selected&&!draft&&list.length)select(list[0].uid);},[selected,draft,p.goals,filter]);
  const choose=uid=>navigate(()=>{setOverview(false);select(uid);setCelebrate(false);setError('');});
  const changeFilter=value=>navigate(()=>{setFilter(value);select(p.goals.find(g=>value==='all'||(value==='active'?g.status==='active':g.status!=='active'))?.uid);});
  const ms=shown?.milestones||[],done=ms.filter(m=>m.done).length,percent=ms.length?Math.round(done/ms.length*100):0;
  const days=shown?.deadline?Math.round((new Date(shown.deadline+'T12:00:00')-new Date(calendarDay(new Date())+'T12:00:00'))/86400000):null;
  const updateMilestone=(id,patch)=>edit({milestones:ms.map(m=>m.id===id?{...m,...patch}:m)});
  return <div className="wp-goal-overlay"><section className={`wp-goal-sheet goal-management goal-workspace ${overview?'is-overview':'is-detail'}`} style={{"--overview-width":`${Math.min(3,Math.max(1,list.length))*350+Math.max(0,Math.min(3,list.length)-1)*14+40}px`}} role="dialog" aria-label="Quản lý Goals" aria-modal="true" ref={ref} tabIndex={-1}>
    <header className="workspace-header"><div><h2>Goals</h2><p>Theo dõi mục tiêu và từng bước tiến</p></div><button aria-label="Đóng" onClick={()=>navigate(onClose)}>×</button></header>
    <div className="workspace-scroll"><PlannerSyncNotice/>
    <div className={`goal-management-layout ${overview?'overview-layout':''}`}><aside><nav aria-label="Trạng thái Goals"><button aria-pressed={filter==='active'} onClick={()=>changeFilter('active')}>Đang theo đuổi</button><button aria-pressed={filter==='all'} onClick={()=>changeFilter('all')}>Tất cả</button><button aria-pressed={filter==='history'} onClick={()=>changeFilter('history')}>History</button></nav>
      {!overview&&<button className="all-goals-button" onClick={()=>navigate(()=>setOverview(true))}>▦ Tổng quan Goals</button>}
      <select className="mobile-goal-select" aria-label="Chọn Goal" value={selected||''} onChange={e=>choose(e.target.value)}><option value="" disabled>Chọn Goal</option>{list.map(g=><option key={g.uid} value={g.uid}>{g.emoji} {g.title}{g.status==='achieved'?' · 🏆 Đã đạt':''}</option>)}</select>
      <div className="goal-management-list">{list.map(g=><button key={g.uid} aria-pressed={g.uid===selected} onClick={()=>choose(g.uid)}><span>{g.emoji}</span><span><b>{g.title}</b><small>{g.status==='achieved'?'🏆 Đã đạt':g.status==='archived'?'Đã lưu trữ':`${g.milestones.filter(m=>m.done).length}/${g.milestones.length} milestones`}</small></span></button>)}</div>
      {!list.length&&<p>Chưa có Goal trong nhóm này.</p>}<button disabled={saving||p.goals.filter(g=>g.status==='active').length>=3||!!p.goalsError} onClick={()=>navigate(()=>{setOverview(false);setDraft(fresh());setBase(null);})}>＋ Tạo Goal</button>
    </aside><main>{overview?<>
      <div className="overview-intro"><strong>{list.length} mục tiêu{filter==='active'?' đang theo đuổi':''}</strong><span>Tuần {dateLabel(weekStart)} – {dateLabel(weekEnd)}</span></div>
      <div className="all-goal-cards">{list.map(g=>{
        const steps=g.milestones||[],completed=steps.filter(m=>m.done).length,progress=steps.length?Math.round(completed/steps.length*100):0;
        const linked=p.tasks.filter(t=>t.goalId===g.uid),weekly=linked.filter(t=>t.date&&t.date>=weekStart&&t.date<=weekEnd);
        const left=g.deadline?Math.round((new Date(g.deadline+'T12:00:00')-new Date(calendarDay(new Date())+'T12:00:00'))/86400000):null;
        return <article key={g.uid} className="goal-summary-card">
          <div className="summary-status">{g.status==='achieved'?'🏆 Đã đạt':g.status==='archived'?'Đã lưu trữ':'● Đang theo đuổi'}</div>
          <div className="summary-title"><span>{g.emoji||'🎯'}</span><h3>{g.title}</h3></div>
          <div className="summary-deadline"><span>◷ {dateLabel(g.deadline)}</span><b>{g.status==='achieved'?`Đạt ${dateLabel(g.achievedAt)}`:left===null?'Chưa có hạn':left<0?`Quá hạn ${-left} ngày`:left===0?'Hôm nay':`Còn ${left} ngày`}</b></div>
          <div className="summary-progress"><strong>{progress}%</strong><span>{completed}/{steps.length} milestones</span></div><div className="milestone-track" role="progressbar" aria-label={`Tiến độ ${g.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><i style={{width:progress+'%'}}/></div>
          <div className="summary-metrics"><div><b>{weekly.filter(t=>t.done).length}/{weekly.length}</b><small>Xong · tuần đang xem</small></div><div><b>{linked.filter(t=>t.done).length}/{linked.length}</b><small>Xong tổng cộng</small></div></div>
          <div className="summary-outcome"><small>MỤC TIÊU TUẦN NÀY</small><p>{g.weeklyOutcome||'Chưa đặt outcome'}</p></div>
          <div className="summary-next"><small>{progress===100?'✓ Các cột mốc đã hoàn tất':'BƯỚC TIẾP THEO'}</small>{steps.find(m=>!m.done)&&<p>{steps.find(m=>!m.done).text}</p>}</div>
          <details className="summary-milestone-details"><summary>Xem {steps.length} milestones <span aria-hidden="true">⌄</span></summary><ol className="summary-milestones">{steps.map((m,i)=><li key={m.id} className={m.done?'done':i===steps.findIndex(x=>!x.done)?'next':''}><span>{m.done?'✓':i+1}</span><p>{m.text}</p></li>)}</ol></details>
          <button className="summary-open" aria-label={`Mở Goal ${g.title}`} onClick={()=>choose(g.uid)}>Xem task & chỉnh sửa <span aria-hidden="true">→</span></button>
        </article>;
      })}</div>{!list.length&&<div className="workspace-empty">Chưa có Goal trong nhóm này.</div>}
    </>:shown?<>
      <p className="editing-hint">✎ Sửa trực tiếp trong các ô bên dưới · bấm Lưu thay đổi khi xong</p>
      <div className="goal-status">{shown.status==='achieved'?'🏆 Đã đạt Goal':shown.status==='archived'?'Đã lưu trữ':'● Đang theo đuổi'}</div>
      <div className="inline-goal-title"><label className="emoji-field"><span>Biểu tượng</span><input aria-label="Emoji Goal" value={shown.emoji} onChange={e=>edit({emoji:e.target.value})} disabled={saving}/></label><label className="title-field"><span>Tên Goal <i aria-hidden="true">✎</i></span><EditableText aria-label="Tên Goal" placeholder="Tên Goal của bạn" value={shown.title} onChange={e=>edit({title:e.target.value})} disabled={saving}/></label></div>
      <div className="goal-overview"><label className="deadline-card"><span>Hạn · {dateLabel(shown.deadline)}</span><input aria-label="Deadline" type="date" value={shown.deadline} onChange={e=>edit({deadline:e.target.value})} disabled={saving}/><strong>{shown.status==='achieved'?'Đã đạt mục tiêu':days===null?'Chọn ngày đích':days<0?`Quá hạn ${-days} ngày`:days===0?'Hôm nay':`Còn ${days} ngày`}</strong></label><label className="outcome-card"><span>ĐIỀU MUỐN ĐẠT TUẦN NÀY</span><textarea aria-label="Outcome tuần" placeholder="Tuần này, mình sẽ…" value={shown.weeklyOutcome} onChange={e=>edit({weeklyOutcome:e.target.value})} disabled={saving}/></label></div>
      {shown.status==='achieved'&&<div className={`goal-achievement ${celebrate?'celebrate':''}`}><strong>🏆 Bạn đã làm được!</strong><p>Mỗi bước nhỏ đã đưa bạn đến đây. Hãy dành một chút để tự hào.</p><small>Ngày đạt · {dateLabel(shown.achievedAt)}</small></div>}
      <section className="milestone-section"><header><div><small>HÀNH TRÌNH</small><h3>Milestones</h3></div><strong>{done}/{ms.length} milestones · {percent}%</strong></header><div role="progressbar" aria-label="Tiến độ milestones" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="milestone-track"><i style={{width:percent+'%'}}/></div>
      <div className="milestone-steps">{ms.map((m,i)=><div key={m.id} className={`milestone-step ${m.done?'complete':i===ms.findIndex(x=>!x.done)?'next':''}`}><input type="checkbox" aria-label={`Hoàn thành milestone ${i+1}`} checked={m.done} onChange={e=>updateMilestone(m.id,{done:e.target.checked})} disabled={saving}/><div><small>{m.done?'✓ Hoàn tất':i===ms.findIndex(x=>!x.done)?'BƯỚC TIẾP THEO':`BƯỚC ${i+1}`}</small><EditableText aria-label={`Milestone ${i+1}`} placeholder="Một bước cụ thể" value={m.text} onChange={e=>updateMilestone(m.id,{text:e.target.value})} disabled={saving}/></div><button aria-label={`Xóa milestone ${i+1}`} disabled={saving||ms.length===1} onClick={()=>edit({milestones:ms.filter(x=>x.id!==m.id)})}>×</button></div>)}</div>
      <button disabled={saving||ms.length>=5} onClick={()=>edit({milestones:[...ms,{id:crypto.randomUUID(),text:'',done:false}]})}>＋ Thêm milestone</button></section>
      {!dirty&&goal&&<div className="goal-management-actions">{goal.status==='active'?<>{ms.length>0&&done===ms.length&&<div className="goal-ready"><b>Bạn đã hoàn thành các cột mốc!</b><button className="workspace-primary" disabled={saving} onClick={()=>status('achieved')}>Đánh dấu đạt Goal</button></div>}<button disabled={saving} onClick={()=>status('archived')}>Lưu trữ Goal</button></>:<button disabled={saving||p.goals.filter(g=>g.status==='active').length>=3} onClick={()=>status('active')}>Khôi phục</button>}</div>}
      {goal&&(!draft||draft.id)&&<GoalDetail embedded key={goal.uid} entry={{goalId:goal.uid}} active={active}/>}
    </>:<div className="workspace-empty">🎯<h3>Bắt đầu với điều có ý nghĩa với bạn.</h3><p>Chọn một Goal hoặc tạo Goal mới.</p></div>}</main></div></div>
    {error&&<p className="workspace-error" role="alert">{error}</p>}
    {leave?<footer className="workspace-save" role="alert"><span>Bạn có thay đổi chưa lưu.</span><button disabled={saving} onClick={()=>setLeave(null)}>Ở lại</button><button disabled={saving} onClick={()=>{const action=leave;setLeave(null);setDraft(null);setBase(null);action();}}>Bỏ thay đổi</button><button className="workspace-primary" disabled={saving} onClick={async()=>{if(await save()){const action=leave;setLeave(null);action();}}}>Lưu và tiếp tục</button></footer>:dirty&&<footer className="workspace-save"><span>{saving?'Đang lưu…':'Có thay đổi chưa lưu'}</span><button disabled={saving} onClick={()=>{setDraft(null);setBase(null);setError('');}}>Hủy</button><button className="workspace-primary" disabled={saving} onClick={save}>Lưu thay đổi</button></footer>}
    <GoalWorkspaceStyles/>

  </section></div>;
}
