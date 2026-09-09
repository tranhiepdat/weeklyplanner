import { GoalDetail, GoalPicker, GoalDialogStyles, useDialogFocus } from "./GoalDialogs";
import { selectedWeekBounds } from "../lib/goal-view.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { usePlanner, PlannerSyncNotice } from "./PlannerProvider";

const ACTIVE_LIMIT = 3;
function localIso(date = new Date()) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
function plusDaysIso(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return localIso(d);
}
function daysLeft(deadline) {
  if (!deadline) return null;
  const a = new Date(`${localIso()}T12:00:00`);
  const b = new Date(`${deadline}T12:00:00`);
  return Math.ceil((b - a) / 86400000);
}
function milestoneProgress(goal) {
  const items = Array.isArray(goal?.milestones) ? goal.milestones : [];
  return items.length ? Math.round(items.filter(m => m.done).length / items.length * 100) : 0;
}
function milestoneState(goal) {
  const items = Array.isArray(goal?.milestones) ? goal.milestones : [];
  const done = items.filter(m => m.done).length;
  const currentIndex = items.findIndex(m => !m.done);
  return {
    done,
    total: items.length,
    currentIndex,
    current: currentIndex >= 0 ? items[currentIndex] : null,
    complete: items.length > 0 && currentIndex === -1,
  };
}
function freshMilestone(i, text = "") {
  return { id: `m-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`, text, done: false };
}
function blankGoal(seed = {}) {
  return {
    ...seed,
    uid: seed.uid || crypto.randomUUID(),
    title: seed.title || "",
    emoji: seed.emoji || "🎯",
    deadline: seed.deadline || plusDaysIso(90),
    weeklyOutcome: seed.weeklyOutcome || "",
    status: seed.status || "active",
    milestones: seed.milestones?.length
      ? seed.milestones.map(m => ({ ...m }))
      : [freshMilestone(0), freshMilestone(1), freshMilestone(2)],
  };
}

function Editor({ initial, activeCount, existingGoals, onClose, onSave, embedded=false }) {
  const dialogRef = useDialogFocus(!embedded, onClose);
  const editing = !!initial?.id;
  const [mode, setMode] = useState(editing ? "manual" : "ai");
  const [draft, setDraft] = useState(() => blankGoal(initial || {}));
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [aiReady, setAiReady] = useState(false);

  const set = patch => setDraft(d => ({ ...d, ...patch }));
  const setMilestone = (id, patch) => setDraft(d => ({
    ...d,
    milestones: d.milestones.map(m => m.id === id ? { ...m, ...patch } : m),
  }));
  const canSave = draft.title.trim() && draft.deadline &&
    draft.milestones.some(m => m.text.trim()) && (editing || activeCount < ACTIVE_LIMIT);

  const buildWithAi = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setErr("");
    setAiReady(false);
    try {
      const r = await fetch("/api/goals-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          activeGoals: existingGoals
            .filter(g => g.status === "active")
            .map(g => ({ title: g.title, deadline: g.deadline })),
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.goal) throw new Error(data?.error || "AI chưa dựng được goal.");
      const g = data.goal;
      setDraft(blankGoal({
        title: g.title || prompt.trim(),
        emoji: g.emoji || "🎯",
        deadline: g.deadline || plusDaysIso(90),
        weeklyOutcome: g.weeklyOutcome || "",
        milestones: (g.milestones || []).slice(0, 5).map((x, i) =>
          freshMilestone(i, typeof x === "string" ? x : x?.text || "")
        ),
      }));
      setMode("manual");
      setAiReady(true);
    } catch (e) {
      setErr(e?.message || "AI chưa dựng được goal. Thử lại giúp mình nhé.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!canSave || busy) return;
    setBusy(true);
    setErr("");
    const clean = {
      ...draft,
      title: draft.title.trim(),
      weeklyOutcome: draft.weeklyOutcome.trim(),
      milestones: draft.milestones
        .filter(m => m.text.trim())
        .slice(0, 5)
        .map(m => ({ ...m, text: m.text.trim() })),
    };
    const ok = await onSave(clean);
    if (!ok) {
      setErr("Chưa lưu được goal. Thử lại giúp mình nhé.");
      setBusy(false);
    }
  };

  return <div className={embedded ? "goal-editor-inline" : "wp-goal-overlay"} onMouseDown={e => !embedded && e.currentTarget === e.target && onClose()}>
    <div ref={dialogRef} tabIndex={-1} aria-label="Sửa Goal" className="wp-goal-sheet wp-goal-editor" role={embedded ? undefined : "dialog"} aria-modal={embedded ? undefined : true}>
      <div className="wp-goal-sheet-head">
        <div>
          <span className="eyebrow">{editing ? "EDIT GOAL" : "NEW 90-DAY GOAL"}</span>
          <h2>{editing ? "Chỉnh lại đường đi" : "Bạn muốn tiến tới điều gì?"}</h2>
        </div>
        <button className="round" onClick={onClose}>×</button>
      </div>

      {!editing && <div className="wp-goal-mode-tabs">
        <button className={mode === "ai" ? "on" : ""} onClick={() => setMode("ai")}>✨ Build with AI</button>
        <button className={mode === "manual" ? "on" : ""} onClick={() => setMode("manual")}>Manual</button>
      </div>}

      {mode === "ai" ? <div className="wp-goal-ai-box">
        <span className="label">Nói goal theo cách tự nhiên</span>
        <textarea
          autoFocus
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Ví dụ: 3 tháng tới mình muốn lấy bằng C1, học cuối tuần và thi càng sớm càng tốt."
        />
        <div className="wp-goal-ai-foot">
          <small>AI sẽ dựng goal, deadline, 3–5 milestones và outcome tuần này. Bạn review trước khi lưu.</small>
          <button disabled={!prompt.trim() || busy} onClick={buildWithAi}>
            {busy ? "Đang dựng…" : "✨ Build goal"}
          </button>
        </div>
        {err && <div className="wp-goal-warning">{err}</div>}
      </div> : <div className="wp-goal-form">
        {aiReady && <div className="wp-goal-ai-ready">✦ AI draft ready — bạn có thể chỉnh mọi thứ trước khi lưu.</div>}

        <label>
          <span>Goal</span>
          <div className="wp-goal-title-line">
            <input className="emoji" value={draft.emoji} maxLength={4} onChange={e => set({ emoji: e.target.value })}/>
            <input value={draft.title} onChange={e => set({ title: e.target.value })} placeholder="Lấy bằng C1"/>
          </div>
        </label>

        <div className="wp-goal-form-grid">
          <label>
            <span>Deadline</span>
            <input type="date" value={draft.deadline} onChange={e => set({ deadline: e.target.value })}/>
          </label>
          <label>
            <span>This week outcome</span>
            <input value={draft.weeklyOutcome} onChange={e => set({ weeklyOutcome: e.target.value })} placeholder="Kết quả quan trọng nhất tuần này"/>
          </label>
        </div>

        <div className="wp-goal-ms-head">
          <span>Milestones · tối đa 5</span>
          {draft.milestones.length < 5 && <button onClick={() => set({ milestones: [...draft.milestones, freshMilestone(draft.milestones.length)] })}>＋ Thêm</button>}
        </div>
        <div className="wp-goal-ms-edit">
          {draft.milestones.map((m, i) => <div key={m.id}>
            <b>{i + 1}</b>
            <input value={m.text} onChange={e => setMilestone(m.id, { text: e.target.value })} placeholder={`Milestone ${i + 1}`}/>
            {draft.milestones.length > 1 && <button onClick={() => set({ milestones: draft.milestones.filter(x => x.id !== m.id) })}>×</button>}
          </div>)}
        </div>

        {!editing && activeCount >= ACTIVE_LIMIT && <div className="wp-goal-warning">Bạn đang có đủ 3 active goals. Archive một goal trước nhé.</div>}
        {err && <div className="wp-goal-warning">{err}</div>}

        <div className="wp-goal-actions">
          <button className="secondary" onClick={onClose}>Hủy</button>
          <button className="primary" disabled={!canSave || busy} onClick={submit}>
            {busy ? "Đang lưu…" : editing ? "Lưu thay đổi" : "Tạo goal"}
          </button>
        </div>
      </div>}
    </div>
  </div>;
}

function Manager({entry,active:isActive,onClose}) {
  const p=usePlanner(),ref=useDialogFocus(isActive,onClose);
  const [selected,setSelected]=useState(entry.goalId||p.goals.find(g=>g.status==='active')?.uid);
  const [filter,setFilter]=useState(p.goals.find(g=>g.uid===entry.goalId)?.status==='active'||!entry.goalId?'active':'history');
  const [draft,setDraft]=useState(entry.kind==='createGoal'||entry.kind==='goalEditor'?blankGoal(entry.goal||{}):null);
  const [failure,setFailure]=useState('');
  const goal=p.goals.find(g=>g.uid===selected), active=p.goals.filter(g=>g.status==='active');
  const list=p.goals.filter(g=>filter==='active'?g.status==='active':g.status!=='active');
  const save=async g=>{
    if(draft?.id&&!p.goals.some(x=>x.id===draft.id)){setFailure('Goal không còn khả dụng.');return false;}
    let input=g;
    if(draft?.id){input={id:draft.id};for(const field of ['title','emoji','deadline','weeklyOutcome','milestones'])if(JSON.stringify(g[field])!==JSON.stringify(draft[field]))input[field]=g[field];if(input.milestones)input.milestoneBase=draft.milestones;}
    const ok=await p.saveGoal(input);
    if(ok){setSelected(g.uid);setDraft(null);}return ok;
  };
  const patch=async changes=>{setFailure('');if(!await p.saveGoal({id:goal.id,...changes}))setFailure('Chưa lưu được. Vui lòng thử lại.');};
  return <div className="wp-goal-overlay"><section ref={ref} role="dialog" aria-modal="true" aria-label="Quản lý Goals" tabIndex={-1} className="wp-goal-sheet goal-management">
    <header className="wp-goal-sheet-head"><div><span className="eyebrow">90 NGÀY</span><h2>Quản lý Goals</h2></div><button aria-label="Đóng" onClick={onClose}>×</button></header>
    <PlannerSyncNotice/>
    <div className="goal-management-layout"><aside>
      <nav aria-label="Trạng thái Goals"><button disabled={!!draft} aria-pressed={filter==='active'} onClick={()=>setFilter('active')}>Đang theo đuổi</button><button disabled={!!draft} aria-pressed={filter==='history'} onClick={()=>setFilter('history')}>History</button></nav>
      <div className="goal-management-list">{list.map(g=><button key={g.uid} disabled={!!draft} aria-pressed={selected===g.uid&&!draft} onClick={()=>{setSelected(g.uid);setDraft(null);setFailure('');}}><span>{g.emoji||'🎯'}</span><span><b>{g.title}</b><small>{milestoneProgress(g)}% · {g.status==='active'?'Đang theo đuổi':'History'}</small></span></button>)}</div>
      {!list.length&&<p>Chưa có Goal trong nhóm này.</p>}
      <button disabled={!!draft||active.length>=3||!!p.goalsError} onClick={()=>setDraft(blankGoal())}>＋ Tạo Goal</button>
    </aside><main>
      {draft?<Editor key={draft.uid} embedded initial={draft} activeCount={active.length} existingGoals={p.goals} onClose={()=>setDraft(null)} onSave={save}/>:
      goal?<><header className="goal-selected-heading"><span>{goal.emoji||'🎯'}</span><h2>{goal.title}</h2></header>
        <div className="goal-management-actions"><button onClick={()=>setDraft(blankGoal(goal))}>Sửa Goal</button>
        {goal.status==='active'?<><button onClick={()=>patch({status:'archived',archivedAt:localIso()})}>Archive</button><button disabled={!milestoneState(goal).complete} onClick={()=>patch({status:'achieved',achievedAt:localIso()})}>✓ Hoàn thành Goal</button></>:<button disabled={active.length>=3} onClick={()=>patch({status:'active',archivedAt:null,achievedAt:null})}>Khôi phục</button>}</div>
        {failure&&<p role="alert">{failure}</p>}
        <div className="goal-management-checks">{goal.milestones?.map(m=><label key={m.id}><input type="checkbox" checked={!!m.done} onChange={()=>patch({milestone:{id:m.id,done:!m.done}})}/><span>{m.text}</span></label>)}</div>
        <GoalDetail embedded key={goal.uid} entry={{goalId:goal.uid}} active={isActive}/>
      </>:<p>Chọn một Goal hoặc tạo Goal mới.</p>}
    </main></div>
  </section></div>;
}

export default function GoalsPanel() {
  const [host, setHost] = useState(null);
  const [theme, setTheme] = useState("light");
  const { goals, tasks, saveGoal, status, goalsError, errors, weekMonday, dialogs, openDialog, closeDialog } = usePlanner();
  const top = dialogs.at(-1);
  const manager = dialogs.some(d => d.kind === "manage");
  const editorEntry = dialogs.find(d => d.kind === "goalEditor" || d.kind === "createGoal");
  const editor = editorEntry ? editorEntry.goal || {} : null;
  const setManager = value => value ? openDialog({kind:"manage"}) : closeDialog();
  const setEditor = goal => goal ? openDialog({kind:"goalEditor",goal}) : closeDialog();
  const loading = status === "loading";
  const syncErr = !!goalsError;
  const [toast, setToast] = useState("");

  const active = useMemo(() => goals.filter(g => g.status === "active").slice(0, ACTIVE_LIMIT), [goals]);
  const [weekStart, weekEnd] = selectedWeekBounds(weekMonday);

  const allTasksForGoal = useCallback(goal => tasks.filter(t => t.goalId === goal.uid), [tasks]);

  const statsForGoal = useCallback(goal => {
    const linked = allTasksForGoal(goal);
    const week = linked.filter(t => t.date && t.date >= weekStart && t.date <= weekEnd);
    return {
      progress: milestoneProgress(goal),
      days: daysLeft(goal.deadline),
      ms: milestoneState(goal),
      tasksTotal: linked.length,
      tasksDone: linked.filter(t => t.done).length,
      weekTotal: week.length,
      weekDone: week.filter(t => t.done).length,
    };
  }, [allTasksForGoal, weekStart, weekEnd]);

  useEffect(() => {
    let cancelled = false;
    let observer;

    const place = () => {
      if (cancelled) return;
      const title = [...document.querySelectorAll(".card-title")]
        .find(el => (el.textContent || "").includes("Nhìn lại"));
      const card = title?.closest(".card");
      if (!card) return;

      card.classList.add("wp-goal-review-replaced");
      let slot = card.querySelector("#wp-goal-review-slot");
      if (!slot) {
        slot = document.createElement("div");
        slot.id = "wp-goal-review-slot";
        card.appendChild(slot);
      }
      setHost(slot);
    };

    place();
    observer = new MutationObserver(place);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelled = true;
      observer?.disconnect();
      const slot = document.getElementById("wp-goal-review-slot");
      const card = slot?.closest(".card");
      card?.classList.remove("wp-goal-review-replaced");
      slot?.remove();
    };
  }, []);

  useEffect(() => {
    let observer;
    const sync = () => {
      const app = document.querySelector(".app-wrap");
      if (!app) return;
      const cls = [...app.classList].find(c => c.startsWith("theme-"));
      if (cls) setTheme(cls.replace("theme-", ""));
      if (!observer) {
        observer = new MutationObserver(sync);
        observer.observe(app, { attributes: true, attributeFilter: ["class"] });
      }
    };
    sync();
    return () => observer?.disconnect();
  }, []);

  const persist = async (goal, closeEditor = false) => {
    let input = goal;
    if (goal.id && closeEditor && editor?.id === goal.id) {
      input = { id: goal.id };
      for (const field of ["title", "emoji", "deadline", "weeklyOutcome", "milestones", "status", "achievedAt", "archivedAt"])
        if (JSON.stringify(goal[field]) !== JSON.stringify(editor[field])) input[field] = goal[field];
      if (input.milestones) input.milestoneBase = editor.milestones;
    }
    const ok = await saveGoal(input);
    if (ok) {
      if (closeEditor) setEditor(null);
      setToast(goal.id ? "Goal updated" : "Goal created ✨");
      setTimeout(() => setToast(""), 1600);
    }
    return ok;
  };
  const patch = (goal, changes) => persist({ id: goal.id, ...changes });

  const openCreate = seed => {
    if (loading || syncErr) return;
    if (!seed?.id && active.length >= ACTIVE_LIMIT) return;
    if (seed?.status === "achieved") {
      setEditor(blankGoal({
        title: `${seed.title} · next`,
        emoji: seed.emoji,
        deadline: plusDaysIso(90),
        weeklyOutcome: "",
        milestones: [freshMilestone(0), freshMilestone(1), freshMilestone(2)],
      }));
      return;
    }
    setEditor(seed?.id ? seed : blankGoal(seed || {}));
  };

  const totals = useMemo(() => {
    const stats = active.map(statsForGoal);
    return {
      done: stats.reduce((sum, s) => sum + s.tasksDone, 0),
      total: stats.reduce((sum, s) => sum + s.tasksTotal, 0),
      moving: stats.filter(s => s.weekTotal > 0).length,
    };
  }, [active, statsForGoal]);

  const board = <div className="wp-goal-board">
    <div className="wp-goal-board-head">
      <div className="wp-goal-board-title">
        <span className="mark">◎</span>
        <div>
          <b>90-DAY GOALS</b>
          <small>
            {loading
              ? "Loading progress…"
              : active.length
                ? `${totals.moving}/${active.length} có task trong tuần đang xem · ${totals.done}/${totals.total || 0} linked tasks done`
                : "Chọn tối đa 3 điều quan trọng cho 90 ngày tới"}
          </small>
        </div>
      </div>
      <div className="wp-goal-board-actions">
        {syncErr && <span className="sync" title="Chưa đồng bộ được goals với Notion"/>}
        <button onClick={() => setManager(true)}>Manage</button>
        <button className="add" disabled={active.length >= ACTIVE_LIMIT} onClick={() => openCreate()}>＋</button>
      </div>
    </div>

    {(syncErr || errors.length > 0) && <PlannerSyncNotice />}
    {!!active.length && <div className="wp-goal-table-head">
      <span>Goal</span><span>Milestone hiện tại</span><span>Tasks</span><span>Progress</span>
    </div>}

    <div className="wp-goal-table">
      {active.map((g, i) => {
        const s = statsForGoal(g);
        return <button className="wp-goal-row" key={g.id} style={{ "--delay": `${i * 55}ms` }} onClick={() => openDialog({kind:"goal",goalId:g.uid})}>
          <span className="wp-goal-cell goal">
            <span className="emoji">{g.emoji || "🎯"}</span>
            <span className="copy">
              <b>{g.title}</b>
              <small>{g.weeklyOutcome ? `Tuần này · ${g.weeklyOutcome}` : "Chưa đặt outcome tuần này"}</small>
            </span>
          </span>

          <span className="wp-goal-cell milestone">
            <span className={s.ms.complete ? "ms-badge done" : "ms-badge"}>
              {s.ms.complete ? "✓" : `${s.ms.done + 1}/${s.ms.total || 1}`}
            </span>
            <span className="copy">
              <b>{s.ms.complete ? "Milestones complete" : `Milestone ${s.ms.currentIndex + 1} / ${s.ms.total}`}</b>
              <small>{s.ms.complete ? "Ready to mark achieved" : s.ms.current?.text || "Chưa có milestone"}</small>
            </span>
          </span>

          <span className="wp-goal-cell tasks">
            <b className="task-number">{s.tasksDone}/{s.tasksTotal}</b>
            <span className="copy">
              <b>Tổng liên kết · đã xong</b>
              <small>Tuần đang xem · {weekStart} – {weekEnd}: {s.weekDone}/{s.weekTotal}</small>
            </span>
          </span>

          <span className="wp-goal-cell progress">
            <span className="progress-top"><b>{s.progress}%</b><small>{s.days == null ? "No deadline" : s.days < 0 ? `${Math.abs(s.days)}d overdue` : `${s.days}d left`}</small></span>
            <span className="progress-track"><i style={{ width: `${s.progress}%` }}/></span>
          </span>
        </button>;
      })}

      {!active.length && <div className="wp-goal-empty">
        <span>🎯</span>
        <div><b>Chưa có 90-day goal</b><small>Tạo goal đầu tiên bằng AI, rồi app sẽ theo task + milestone cho bạn ở đây.</small></div>
        <button onClick={() => openCreate()}>✨ Tạo goal</button>
      </div>}
    </div>
  </div>;

  const modalClass = `wp-goals-modal-root theme-${theme}`;

  return <>
    <GoalDialogStyles />
    {typeof document !== "undefined" && createPortal(<div className={modalClass}>
      {dialogs.filter(d => ['goal','manage','goalEditor','createGoal'].includes(d.kind)).map((d,i)=><div key={i} style={{display:top===d?'contents':'none'}}><Manager entry={d} active={top===d} onClose={closeDialog}/></div>)}
      {top?.kind === "picker" && <GoalPicker entry={top} />}
    </div>, document.body)}
    {host && createPortal(board, host)}

    {toast && typeof document !== "undefined" && createPortal(
      <div className={`${modalClass} wp-goal-toast`}>✦ {toast}</div>,
      document.body
    )}

    <style jsx global>{`
      .wp-goals-modal-root{--c-bg:var(--g-bg);--c-surface:var(--g-surface);--c-ink:var(--g-ink);--c-border:var(--g-border);--c-wine:var(--g-a)}
      .wp-goal-review-replaced{padding:0!important;overflow:hidden}
      .wp-goal-review-replaced>*:not(#wp-goal-review-slot){display:none!important}
      #wp-goal-review-slot{display:block!important}
      .wp-goal-board{color:var(--c-ink);font-family:'Nunito',sans-serif;animation:wpGoalBoardIn .4s cubic-bezier(.16,1,.3,1) both}
      .wp-goal-board-head{min-height:48px;padding:8px 10px 7px 12px;border-bottom:1px solid var(--c-border);display:flex;align-items:center;justify-content:space-between;gap:10px}
      .wp-goal-board-title{display:flex;align-items:center;gap:9px;min-width:0}.wp-goal-board-title .mark{width:30px;height:30px;border-radius:50%;border:1.5px solid var(--c1);display:grid;place-items:center;color:var(--c1);font-size:1rem;flex:0 0 auto}.wp-goal-board-title b{display:block;font-size:.67rem;letter-spacing:.12em}.wp-goal-board-title small{display:block;font-size:.58rem;color:var(--c-muted);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:520px}
      .wp-goal-board-actions{display:flex;align-items:center;gap:6px;flex:0 0 auto}.wp-goal-board-actions button{height:29px;border:1px solid var(--c-border);border-radius:9px;background:var(--c-surface);color:var(--c-muted);padding:0 9px;font:800 .61rem 'Nunito',sans-serif;cursor:pointer}.wp-goal-board-actions .add{width:30px;padding:0;background:var(--c1);border-color:var(--c1);color:var(--c-on-accent);font-size:.9rem}.wp-goal-board-actions button:disabled{opacity:.35;cursor:not-allowed}.wp-goal-board-actions .sync{width:6px;height:6px;border-radius:50%;background:#d98e4a;box-shadow:0 0 0 3px rgba(217,142,74,.13)}
      .wp-goal-table-head{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1.5fr) minmax(75px,.85fr) minmax(90px,.9fr);gap:12px;padding:7px 12px 5px;color:var(--c-muted2);font-size:.52rem;font-weight:900;letter-spacing:.09em;text-transform:uppercase}
      .wp-goal-table{padding:0 8px 8px}.wp-goal-row{width:100%;border:1px solid transparent;border-top-color:color-mix(in srgb,var(--c-border) 68%,transparent);background:transparent;color:var(--c-ink);display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1.5fr) minmax(75px,.85fr) minmax(90px,.9fr);gap:12px;align-items:center;padding:9px 4px;text-align:left;cursor:pointer;animation:wpGoalRowIn .42s cubic-bezier(.16,1,.3,1) both;animation-delay:var(--delay);transition:background .2s ease,border-color .2s ease,transform .2s ease}.wp-goal-row:first-child{border-top-color:transparent}.wp-goal-row:hover{background:color-mix(in srgb,var(--c1) 4%,var(--c-surface));border-color:color-mix(in srgb,var(--c1) 18%,var(--c-border));border-radius:11px;transform:translateY(-1px)}
      .wp-goal-cell{min-width:0}.wp-goal-cell.goal,.wp-goal-cell.milestone,.wp-goal-cell.tasks{display:flex;align-items:center;gap:8px}.wp-goal-cell .emoji{font-size:1.05rem;flex:0 0 auto}.wp-goal-cell .copy{min-width:0}.wp-goal-cell .copy b,.wp-goal-cell .copy small{display:block}.wp-goal-cell .copy b{font-size:.68rem;line-height:1.25}.wp-goal-cell .copy small{font-size:.56rem;color:var(--c-muted);line-height:1.3;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ms-badge{min-width:31px;height:24px;padding:0 7px;border-radius:999px;background:var(--c-track);display:grid;place-items:center;color:var(--c1);font-size:.57rem;font-weight:900;flex:0 0 auto}.ms-badge.done{background:color-mix(in srgb,#48a26b 14%,var(--c-surface));color:#3f8759}.task-number{font-size:.9rem;font-weight:900;min-width:34px;color:var(--c1)}.wp-goal-cell.progress{display:block}.progress-top{display:flex;justify-content:space-between;align-items:baseline;gap:7px}.progress-top b{font-size:.68rem}.progress-top small{font-size:.53rem;color:var(--c-muted);white-space:nowrap}.progress-track{display:block;height:6px;border-radius:99px;background:var(--c-track);overflow:hidden;margin-top:5px}.progress-track i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--c1),var(--c2));transition:width .6s cubic-bezier(.2,.9,.3,1)}
      .wp-goal-empty{display:flex;align-items:center;gap:10px;padding:16px 12px}.wp-goal-empty>span{font-size:1.5rem}.wp-goal-empty>div{min-width:0;flex:1}.wp-goal-empty b,.wp-goal-empty small{display:block}.wp-goal-empty b{font-size:.72rem}.wp-goal-empty small{font-size:.59rem;color:var(--c-muted);margin-top:2px;line-height:1.4}.wp-goal-empty button{border:1px solid var(--c1);background:var(--c1);color:var(--c-on-accent);border-radius:10px;padding:8px 10px;font:800 .62rem 'Nunito';cursor:pointer;white-space:nowrap}

      .wp-goals-modal-root{--g-bg:#fdf8f2;--g-surface:#fff;--g-ink:#4a3030;--g-muted:#8a6a6a;--g-muted2:#c9a0a0;--g-border:#e8c4b8;--g-track:#efe2d4;--g-a:#7a4a4a;--g-a2:#c9a84c;--g-on:#fff;font-family:'Nunito',sans-serif;color:var(--g-ink)}
      .wp-goals-modal-root.theme-dark{--g-bg:#04080a;--g-surface:#0b1512;--g-ink:#d6ffe9;--g-muted:#5fae8c;--g-muted2:#3a7a60;--g-border:#11402f;--g-track:#0d241b;--g-a:#00ff9c;--g-a2:#00d0ff;--g-on:#03140d}.wp-goals-modal-root.theme-cozy{--g-bg:#f9efe2;--g-surface:#fff9f0;--g-ink:#5d3b26;--g-muted:#91694d;--g-muted2:#ba9272;--g-border:#d9b58f;--g-track:#f2dfca;--g-a:#a05c2c;--g-a2:#d98e4a;--g-on:#fff}.wp-goals-modal-root.theme-cutie{--g-bg:#fdf6ee;--g-surface:#fff;--g-ink:#594d69;--g-muted:#8d7d9b;--g-muted2:#b6a2b8;--g-border:#ead4df;--g-track:#f6e8f1;--g-a:#5b8fd1;--g-a2:#e89bb8;--g-on:#fff}.wp-goals-modal-root.theme-nature{--g-bg:#f2f5e6;--g-surface:#fbfdf4;--g-ink:#40523a;--g-muted:#718267;--g-muted2:#9eaa92;--g-border:#cdd9b8;--g-track:#e7edd8;--g-a:#6f9e57;--g-a2:#a7c47f;--g-on:#fff}
      .wp-goal-overlay{position:fixed;inset:0;z-index:9000;background:rgba(20,14,16,.46);backdrop-filter:blur(7px);display:flex;align-items:center;justify-content:center;padding:22px;animation:wpGoalBackdrop .2s ease both}.wp-goal-sheet{width:min(980px,100%);max-height:min(800px,90vh);overflow:auto;background:var(--g-surface);border:1px solid var(--g-border);border-radius:22px;color:var(--g-ink);box-shadow:0 28px 85px rgba(20,12,15,.27);animation:wpGoalSheetIn .35s cubic-bezier(.16,1,.3,1) both}.wp-goal-sheet-head{position:sticky;top:0;z-index:3;background:color-mix(in srgb,var(--g-surface) 94%,transparent);backdrop-filter:blur(15px);display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:18px 20px 13px;border-bottom:1px solid var(--g-border)}.wp-goal-sheet-head .eyebrow{display:block;font-size:.57rem;letter-spacing:.15em;font-weight:900;color:var(--g-a);margin-bottom:2px}.wp-goal-sheet h2{font-family:'Cormorant Garamond',Georgia,serif;font-size:1.35rem;line-height:1.08;margin:0}.wp-goal-sheet button{font-family:'Nunito',sans-serif}.wp-goal-sheet .round{width:33px;height:33px;border-radius:50%;border:1px solid var(--g-border);background:var(--g-track);color:var(--g-muted);font-size:1.05rem;cursor:pointer;display:grid;place-items:center}
      .manager-head{align-items:center}.wp-goal-head-actions{display:flex;align-items:center;gap:6px}.wp-goal-head-actions .seg,.wp-goal-head-actions .new{height:32px;border:1px solid var(--g-border);border-radius:9px;background:var(--g-surface);color:var(--g-muted);padding:0 10px;font-weight:800;font-size:.62rem;cursor:pointer}.wp-goal-head-actions .seg.on{color:var(--g-a);border-color:color-mix(in srgb,var(--g-a) 42%,var(--g-border));background:color-mix(in srgb,var(--g-a) 7%,var(--g-surface))}.wp-goal-head-actions .new{background:var(--g-a);color:var(--g-on);border-color:var(--g-a)}.wp-goal-head-actions button:disabled{opacity:.35;cursor:not-allowed}.wp-goal-manager-body{padding:15px}.wp-goal-manager-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px}.wp-goal-full,.wp-goal-manager-empty{border:1px solid var(--g-border);border-radius:16px;background:linear-gradient(180deg,var(--g-surface),color-mix(in srgb,var(--g-track) 24%,var(--g-surface)));padding:13px;min-width:0;animation:wpGoalRowIn .42s cubic-bezier(.16,1,.3,1) both;animation-delay:var(--delay)}.wp-goal-full-top{display:flex;align-items:center;gap:6px}.wp-goal-full-top .num{font-size:.54rem;letter-spacing:.12em;font-weight:900;color:var(--g-muted2)}.wp-goal-full-top .ico{font-size:1rem}.wp-goal-full-top .deadline{margin-left:auto;font-size:.56rem;font-weight:900;color:var(--g-muted);padding:3px 7px;border-radius:20px;background:var(--g-track)}.wp-goal-full-top .deadline.soon{color:#a96013;background:#fff0d4}.wp-goal-full h3{font-family:'Cormorant Garamond',Georgia,serif;font-size:1.1rem;line-height:1.16;margin:9px 0}.wp-goal-manager-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px}.wp-goal-manager-metrics>div{background:var(--g-track);border-radius:9px;padding:7px}.wp-goal-manager-metrics b,.wp-goal-manager-metrics span{display:block}.wp-goal-manager-metrics b{font-size:.74rem}.wp-goal-manager-metrics span{font-size:.49rem;color:var(--g-muted);margin-top:1px}.wp-goal-progress{height:7px;border-radius:99px;background:var(--g-track);overflow:hidden;position:relative}.wp-goal-progress i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--g-a),var(--g-a2));transition:width .45s ease}.wp-goal-progress b{position:absolute;right:0;top:-15px;font-size:.52rem;color:var(--g-muted)}.wp-goal-next,.wp-goal-week{margin-top:10px;padding:7px 8px;border-radius:9px;background:var(--g-track)}.wp-goal-next span,.wp-goal-week span{display:block;font-size:.49rem;font-weight:900;letter-spacing:.11em;color:var(--g-muted)}.wp-goal-next b,.wp-goal-week b{display:block;font-size:.65rem;margin-top:2px;line-height:1.35}.wp-goal-checklist{display:grid;gap:5px;border-top:1px dashed var(--g-border);padding-top:9px;margin-top:10px}.wp-goal-checklist label{display:flex;align-items:flex-start;gap:6px;font-size:.65rem;line-height:1.35}.wp-goal-checklist input{accent-color:var(--g-a);margin-top:2px}.wp-goal-card-actions{display:flex;gap:5px;flex-wrap:wrap;margin-top:10px}.wp-goal-card-actions button,.wp-goal-history-row button{border:1px solid var(--g-border);background:var(--g-surface);color:var(--g-muted);border-radius:8px;padding:6px 8px;font-weight:800;font-size:.57rem;cursor:pointer}.wp-goal-card-actions .achieved{margin-left:auto;color:#3c8054;border-color:#8bc5a0}.wp-goal-card-actions button:disabled,.wp-goal-history-row button:disabled{opacity:.35;cursor:not-allowed}.wp-goal-manager-empty{min-height:270px;border-style:dashed;background:transparent;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--g-muted2);cursor:pointer}.wp-goal-manager-empty span{font-size:1.35rem}.wp-goal-manager-empty b{font-size:.68rem;color:var(--g-ink);margin:3px 0}.wp-goal-manager-empty small{font-size:.55rem}.wp-goal-history-list{display:grid;gap:8px}.wp-goal-history-row{border:1px solid var(--g-border);border-radius:12px;padding:10px;display:flex;align-items:center;justify-content:space-between;gap:10px}.wp-goal-history-row>div:first-child{display:flex;align-items:center;gap:8px;min-width:0}.wp-goal-history-row>div:first-child>span{font-size:1.1rem}.wp-goal-history-row p{min-width:0}.wp-goal-history-row p b,.wp-goal-history-row p small{display:block}.wp-goal-history-row p b{font-size:.72rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wp-goal-history-row p small{font-size:.57rem;color:var(--g-muted);margin-top:2px}.wp-goal-history-empty{text-align:center;color:var(--g-muted);font-size:.68rem;padding:30px}
      .wp-goal-editor{width:min(700px,100%)}.wp-goal-mode-tabs{display:flex;gap:5px;padding:12px 18px 0}.wp-goal-mode-tabs button{border:1px solid var(--g-border);background:var(--g-surface);color:var(--g-muted);border-radius:9px;padding:7px 10px;font-weight:800;font-size:.62rem;cursor:pointer}.wp-goal-mode-tabs button.on{color:var(--g-a);border-color:color-mix(in srgb,var(--g-a) 42%,var(--g-border));background:color-mix(in srgb,var(--g-a) 7%,var(--g-surface))}.wp-goal-ai-box,.wp-goal-form{padding:15px 18px 18px}.wp-goal-ai-box .label,.wp-goal-form label>span,.wp-goal-ms-head>span{display:block;font-size:.58rem;font-weight:900;letter-spacing:.06em;color:var(--g-muted);margin-bottom:6px}.wp-goal-ai-box textarea{width:100%;min-height:125px;resize:vertical;border:1px solid var(--g-border);border-radius:13px;background:color-mix(in srgb,var(--g-track) 25%,var(--g-surface));color:var(--g-ink);padding:12px;font:600 .78rem/1.5 'Nunito',sans-serif;outline:none}.wp-goal-ai-box textarea:focus,.wp-goal-form input:focus{border-color:var(--g-a);box-shadow:0 0 0 3px color-mix(in srgb,var(--g-a) 10%,transparent)}.wp-goal-ai-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:9px}.wp-goal-ai-foot small{font-size:.57rem;line-height:1.45;color:var(--g-muted);max-width:420px}.wp-goal-ai-foot button,.wp-goal-actions .primary{border:1px solid var(--g-a);background:var(--g-a);color:var(--g-on);border-radius:10px;padding:8px 12px;font-weight:900;font-size:.63rem;cursor:pointer;white-space:nowrap}.wp-goal-ai-foot button:disabled,.wp-goal-actions button:disabled{opacity:.35;cursor:not-allowed}.wp-goal-form label{display:block;margin-bottom:12px}.wp-goal-form input{width:100%;border:1px solid var(--g-border);border-radius:10px;background:var(--g-surface);color:var(--g-ink);padding:9px 10px;font:600 .75rem 'Nunito',sans-serif;outline:none}.wp-goal-title-line{display:grid;grid-template-columns:52px 1fr;gap:6px}.wp-goal-title-line .emoji{text-align:center;font-size:1rem}.wp-goal-form-grid{display:grid;grid-template-columns:160px 1fr;gap:8px}.wp-goal-ms-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px}.wp-goal-ms-head button{border:0;background:transparent;color:var(--g-a);font-weight:900;font-size:.61rem;cursor:pointer}.wp-goal-ms-edit{display:grid;gap:6px}.wp-goal-ms-edit>div{display:grid;grid-template-columns:23px 1fr 25px;gap:5px;align-items:center}.wp-goal-ms-edit b{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;background:var(--g-track);color:var(--g-muted);font-size:.55rem}.wp-goal-ms-edit button{border:0;background:transparent;color:var(--g-muted);font-size:1rem;cursor:pointer}.wp-goal-ai-ready{padding:7px 9px;border-radius:9px;background:color-mix(in srgb,var(--g-a2) 10%,var(--g-surface));border:1px solid color-mix(in srgb,var(--g-a2) 28%,var(--g-border));color:var(--g-muted);font-size:.61rem;margin-bottom:11px}.wp-goal-warning{padding:7px 9px;border-radius:9px;background:#fff3de;border:1px solid #edca97;color:#9b5d20;font-size:.61rem;margin-top:9px}.wp-goal-actions{display:flex;justify-content:flex-end;gap:7px;margin-top:15px}.wp-goal-actions .secondary{border:1px solid var(--g-border);background:var(--g-surface);color:var(--g-muted);border-radius:10px;padding:8px 12px;font-weight:800;font-size:.63rem;cursor:pointer}.wp-goal-toast{position:fixed;z-index:10000;left:50%;bottom:26px;transform:translateX(-50%);padding:8px 12px;border-radius:999px;background:var(--g-ink);color:var(--g-surface);font:800 .64rem 'Nunito',sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.25);animation:wpGoalToast .28s cubic-bezier(.16,1,.3,1) both;pointer-events:none}

      @media(max-width:900px){.wp-goal-table-head{display:none}.wp-goal-row{grid-template-columns:1fr 1fr;gap:8px 12px;padding:10px 4px}.wp-goal-cell.progress{align-self:center}.wp-goal-manager-grid{grid-template-columns:1fr}.wp-goal-manager-empty{min-height:120px}}
      @media(max-width:600px){.wp-goal-board-head{align-items:flex-start}.wp-goal-board-title small{max-width:220px}.wp-goal-board-actions button:first-of-type{display:inline-flex}.wp-goal-row{grid-template-columns:1fr;padding:10px 5px}.wp-goal-cell.milestone,.wp-goal-cell.tasks,.wp-goal-cell.progress{padding-left:31px}.wp-goal-cell.tasks{justify-content:flex-start}.wp-goal-cell.progress{padding-right:4px}.wp-goal-empty{align-items:flex-start;flex-wrap:wrap}.wp-goal-empty button{margin-left:34px}.wp-goal-overlay{align-items:flex-end;padding:0}.wp-goal-sheet{border-radius:20px 20px 0 0;max-height:92vh}.wp-goal-sheet-head{padding:15px}.wp-goal-head-actions .seg{display:none}.wp-goal-form-grid{grid-template-columns:1fr}.wp-goal-ai-foot{align-items:flex-start;flex-direction:column}.wp-goal-ai-foot button{width:100%}.wp-goal-manager-metrics{grid-template-columns:repeat(3,1fr)}}
      @media(prefers-reduced-motion:reduce){.wp-goal-board,.wp-goal-row,.wp-goal-sheet,.wp-goal-toast{animation:none!important}.wp-goal-row,.progress-track i{transition:none!important}}
      @keyframes wpGoalBoardIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}@keyframes wpGoalRowIn{from{opacity:0;transform:translateY(7px) scale(.99)}to{opacity:1;transform:none}}@keyframes wpGoalBackdrop{from{opacity:0}to{opacity:1}}@keyframes wpGoalSheetIn{from{opacity:0;transform:translateY(16px) scale(.985)}to{opacity:1;transform:none}}@keyframes wpGoalToast{from{opacity:0;transform:translate(-50%,8px) scale(.95)}to{opacity:1;transform:translate(-50%,0) scale(1)}}
      .wp-goal-sheet.goal-management{width:min(1060px,95vw);max-height:92dvh;overflow:auto}.goal-management-layout{display:grid;grid-template-columns:260px minmax(0,1fr);gap:28px}.goal-management-layout main{min-width:0}.goal-management-layout aside{min-width:0;border-right:1px solid var(--g-border);padding-right:20px}.goal-management nav{display:flex;gap:6px;margin-bottom:16px}.goal-management button{font:inherit;color:inherit;border:1px solid var(--g-border);background:var(--g-surface);border-radius:10px;padding:8px 12px;cursor:pointer}.goal-management button:disabled{opacity:.45;cursor:default}.goal-management button[aria-pressed=true]{background:color-mix(in srgb,var(--g-a) 15%,var(--g-bg));border-color:var(--g-a)}.goal-management-list{display:grid;gap:8px;margin-bottom:16px}.goal-management-list button{display:flex;gap:10px;text-align:left;width:100%;align-items:flex-start}.goal-management-list b{font-size:.88rem;line-height:1.45;overflow-wrap:anywhere}.goal-management-list small{display:block;opacity:.65;margin-top:5px}.goal-selected-heading{display:flex;align-items:flex-start;gap:12px}.goal-selected-heading>span{font-size:2rem}.goal-selected-heading h2{font-size:1.4rem;line-height:1.4;margin:0;overflow-wrap:anywhere}.goal-management-actions{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}.goal-management-checks{display:grid;gap:10px;margin:20px 0}.goal-management-checks label{display:flex;gap:10px;align-items:flex-start;font-size:.85rem;line-height:1.5}.goal-management-checks input{width:18px;height:18px;flex-shrink:0;accent-color:var(--g-a)}.goal-editor-inline .wp-goal-sheet{width:100%;max-height:none;box-shadow:none;border:0;padding:0}.goal-inline .goal-milestones{display:none}.wp-goal-cell.goal .copy b{font-size:.95rem;line-height:1.45;overflow-wrap:anywhere}
      @media(max-width:640px){.wp-goal-sheet.goal-management{width:100%;max-height:94dvh;border-radius:22px 22px 0 0;padding:20px}.goal-management-layout{grid-template-columns:1fr;gap:20px}.goal-management-layout aside{min-width:0;border-right:0;border-bottom:1px solid var(--g-border);padding:0 0 16px}.goal-management-list{display:flex;overflow-x:auto}.goal-management-list button{min-width:190px;max-width:240px}.goal-selected-heading h2{font-size:1.2rem}}
      .goal-management>.wp-goal-sheet-head{padding:0 0 20px}.wp-goal-sheet.goal-management{padding:24px;box-sizing:border-box}.goal-inline>p{margin:10px 0;line-height:1.6}.goal-dialog.goal-inline{padding:0;max-height:none;border:0;box-shadow:none;background:transparent}.goal-management-list button>span:last-child{min-width:0}.goal-management button:focus-visible{outline:3px solid var(--g-a);outline-offset:2px}
    `}</style>
  </>;
}
