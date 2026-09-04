import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const ACTIVE_LIMIT = 3;
const CACHE_KEY = "dat-goals-cache";
const LINKS_KEY = "dat-goal-links";
const TASKS_KEY = "dat-tasks-cache";

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
function readLocal(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function writeLocal(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
function progress(goal) {
  const ms = Array.isArray(goal?.milestones) ? goal.milestones : [];
  return ms.length ? Math.round(ms.filter(m => m.done).length / ms.length * 100) : 0;
}
function doneEnough(goal) {
  const ms = Array.isArray(goal?.milestones) ? goal.milestones : [];
  return ms.length > 0 && ms.every(m => m.done);
}
function daysLeft(deadline) {
  if (!deadline) return null;
  const a = new Date(localIso() + "T12:00:00");
  const b = new Date(deadline + "T12:00:00");
  return Math.ceil((b - a) / 86400000);
}
function freshMilestone(i, text = "") { return { id: `m-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`, text, done: false }; }
function blankGoal(seed = {}) {
  return {
    ...seed,
    title: seed.title || "",
    emoji: seed.emoji || "🎯",
    deadline: seed.deadline || plusDaysIso(90),
    weeklyOutcome: seed.weeklyOutcome || "",
    status: seed.status || "active",
    milestones: seed.milestones?.length ? seed.milestones.map(m => ({ ...m })) : [freshMilestone(0), freshMilestone(1), freshMilestone(2)],
  };
}
function weekBounds() {
  const d = new Date(); d.setHours(12, 0, 0, 0);
  const dow = d.getDay(); d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  const s = new Date(d), e = new Date(d); e.setDate(e.getDate() + 6);
  return [localIso(s), localIso(e)];
}

function Ring({ value }) {
  const r = 11.5, c = 2 * Math.PI * r, dash = c - (Math.max(0, Math.min(100, value)) / 100) * c;
  return <span className="wp-goal-ring" aria-label={`${value}%`}>
    <svg viewBox="0 0 28 28"><circle className="track" cx="14" cy="14" r={r}/><circle className="value" cx="14" cy="14" r={r} strokeDasharray={c} strokeDashoffset={dash}/></svg>
    <b>{value}</b>
  </span>;
}

function Editor({ initial, activeCount, existingGoals, onClose, onSave }) {
  const editing = !!initial?.id;
  const [mode, setMode] = useState(editing ? "manual" : "ai");
  const [draft, setDraft] = useState(() => blankGoal(initial || {}));
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [aiReady, setAiReady] = useState(false);

  const set = patch => setDraft(d => ({ ...d, ...patch }));
  const setMilestone = (id, patch) => setDraft(d => ({ ...d, milestones: d.milestones.map(m => m.id === id ? { ...m, ...patch } : m) }));
  const canSave = draft.title.trim() && draft.deadline && draft.milestones.some(m => m.text.trim()) && (editing || activeCount < ACTIVE_LIMIT);

  const buildWithAi = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true); setErr(""); setAiReady(false);
    try {
      const r = await fetch("/api/goal-ai", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), currentGoals: existingGoals.filter(g => g.status === "active").map(g => g.title) }),
      });
      const d = await r.json();
      if (!r.ok || !d?.goal) throw new Error(d?.error || "AI failed");
      const g = d.goal;
      setDraft(blankGoal({
        title: g.title || prompt.trim(), emoji: g.emoji || "🎯", deadline: g.deadline || plusDaysIso(90),
        weeklyOutcome: g.weeklyOutcome || "", milestones: (g.milestones || []).slice(0, 5).map((x, i) => freshMilestone(i, typeof x === "string" ? x : x?.text || "")),
      }));
      setMode("manual"); setAiReady(true);
    } catch { setErr("AI chưa dựng được goal. Bạn có thể thử lại hoặc chuyển sang Manual."); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    if (!canSave || busy) return;
    setBusy(true); setErr("");
    const clean = { ...draft, milestones: draft.milestones.filter(m => m.text.trim()).slice(0, 5).map(m => ({ ...m, text: m.text.trim() })) };
    const ok = await onSave(clean);
    if (!ok) { setErr("Chưa lưu được goal. Thử lại giúp mình nhé."); setBusy(false); }
  };

  return <div className="wp-goal-overlay" onMouseDown={e => e.currentTarget === e.target && onClose()}>
    <div className="wp-goal-sheet wp-goal-editor" role="dialog" aria-modal="true">
      <div className="wp-goal-sheet-head">
        <div><span className="eyebrow">{editing ? "EDIT GOAL" : "NEW 90-DAY GOAL"}</span><h2>{editing ? "Refine the path" : "What do you want to move forward?"}</h2></div>
        <button className="round" onClick={onClose}>×</button>
      </div>
      {!editing && <div className="wp-goal-mode-tabs"><button className={mode === "ai" ? "on" : ""} onClick={() => setMode("ai")}>✨ Build with AI</button><button className={mode === "manual" ? "on" : ""} onClick={() => setMode("manual")}>Manual</button></div>}
      {mode === "ai" ? <div className="wp-goal-ai-box">
        <span className="label">Nói goal theo cách tự nhiên</span>
        <textarea autoFocus value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Ví dụ: 3 tháng tới mình muốn lấy bằng C1, ưu tiên học cuối tuần và hoàn thành càng sớm càng tốt." />
        <div className="wp-goal-ai-foot"><small>AI sẽ dựng title, deadline, 3–5 milestones và việc quan trọng của tuần này. Bạn vẫn review trước khi lưu.</small><button disabled={!prompt.trim() || busy} onClick={buildWithAi}>{busy ? "Đang dựng…" : "✨ Build goal"}</button></div>
      </div> : <div className="wp-goal-form">
        {aiReady && <div className="wp-goal-ai-ready">✦ AI draft ready — chỉnh lại bất cứ phần nào trước khi lưu.</div>}
        <label><span>Goal</span><div className="wp-goal-title-line"><input className="emoji" value={draft.emoji} maxLength={4} onChange={e => set({ emoji: e.target.value })}/><input value={draft.title} onChange={e => set({ title: e.target.value })} placeholder="Lấy bằng C1" /></div></label>
        <div className="wp-goal-form-grid"><label><span>Deadline</span><input type="date" value={draft.deadline} onChange={e => set({ deadline: e.target.value })}/></label><label><span>This week outcome</span><input value={draft.weeklyOutcome} onChange={e => set({ weeklyOutcome: e.target.value })} placeholder="Kết quả quan trọng nhất tuần này"/></label></div>
        <div className="wp-goal-ms-head"><span>Milestones · tối đa 5</span>{draft.milestones.length < 5 && <button onClick={() => set({ milestones: [...draft.milestones, freshMilestone(draft.milestones.length)] })}>＋ Thêm</button>}</div>
        <div className="wp-goal-ms-edit">{draft.milestones.map((m, i) => <div key={m.id}><b>{i + 1}</b><input value={m.text} onChange={e => setMilestone(m.id, { text: e.target.value })} placeholder={`Milestone ${i + 1}`}/>{draft.milestones.length > 1 && <button onClick={() => set({ milestones: draft.milestones.filter(x => x.id !== m.id) })}>×</button>}</div>)}</div>
        {!editing && activeCount >= ACTIVE_LIMIT && <div className="wp-goal-warning">Bạn đã có đủ 3 Active Goals. Archive một goal trước nhé.</div>}
        {err && <div className="wp-goal-warning">{err}</div>}
        <div className="wp-goal-actions"><button className="secondary" onClick={onClose}>Hủy</button><button className="primary" disabled={!canSave || busy} onClick={submit}>{busy ? "Đang lưu…" : editing ? "Lưu thay đổi" : "Tạo goal"}</button></div>
      </div>}
      {mode === "ai" && err && <div className="wp-goal-warning ai-err">{err}</div>}
    </div>
  </div>;
}

function Manager({ goals, tasksForGoal, onClose, onEdit, onCreate, onPatch }) {
  const [tab, setTab] = useState("active");
  const active = goals.filter(g => g.status === "active");
  const history = goals.filter(g => g.status !== "active").sort((a, b) => String(b.achievedAt || b.archivedAt || b.updatedAt || "").localeCompare(String(a.achievedAt || a.archivedAt || a.updatedAt || "")));
  const list = tab === "active" ? active : history;

  return <div className="wp-goal-overlay" onMouseDown={e => e.currentTarget === e.target && onClose()}>
    <div className="wp-goal-sheet wp-goal-manager" role="dialog" aria-modal="true">
      <div className="wp-goal-sheet-head manager-head">
        <div><span className="eyebrow">NEXT 90 DAYS</span><h2>Three things worth moving</h2></div>
        <div className="wp-goal-head-actions"><button className={tab === "active" ? "seg on" : "seg"} onClick={() => setTab("active")}>Active</button><button className={tab === "history" ? "seg on" : "seg"} onClick={() => setTab("history")}>History</button>{tab === "active" && <button className="new" disabled={active.length >= ACTIVE_LIMIT} onClick={() => onCreate()}>＋ New goal</button>}<button className="round" onClick={onClose}>×</button></div>
      </div>
      <div className="wp-goal-manager-body">
        {!list.length && <div className="wp-goal-history-empty">Chưa có goal nào ở đây.</div>}
        {tab === "active" ? <div className="wp-goal-manager-grid">
          {active.map((g, i) => {
            const pct = progress(g), left = daysLeft(g.deadline), linked = tasksForGoal(g);
            return <div className="wp-goal-full" key={g.id} style={{ "--delay": `${i * 55}ms` }}>
              <div className="wp-goal-full-top"><span className="num">0{i + 1}</span><span className="ico">{g.emoji || "🎯"}</span><span className={left != null && left <= 14 ? "deadline soon" : "deadline"}>{left == null ? "No date" : left < 0 ? `${Math.abs(left)}d overdue` : `${left}d left`}</span></div>
              <h3>{g.title}</h3>
              <div className="wp-goal-progress"><i style={{ width: `${pct}%` }}/><b>{pct}%</b></div>
              <div className="wp-goal-week"><span>THIS WEEK</span><b>{g.weeklyOutcome || "Chưa chọn outcome tuần này"}</b></div>
              <div className="wp-goal-momentum"><i className={linked.length ? "on" : ""}/>{linked.length ? `${linked.length} linked task${linked.length > 1 ? "s" : ""} this week` : "No linked task this week"}</div>
              <div className="wp-goal-checklist">{g.milestones?.map(m => <label key={m.id}><input type="checkbox" checked={!!m.done} onChange={() => onPatch(g, { milestones: g.milestones.map(x => x.id === m.id ? { ...x, done: !x.done } : x) })}/><span>{m.text}</span></label>)}</div>
              <div className="wp-goal-card-actions"><button onClick={() => onEdit(g)}>Edit</button><button onClick={() => onPatch(g, { status: "archived", archivedAt: localIso() })}>Archive</button><button className="achieved" disabled={!doneEnough(g)} onClick={() => onPatch(g, { status: "achieved", achievedAt: localIso() })}>✓ Achieved</button></div>
            </div>;
          })}
          {Array.from({ length: ACTIVE_LIMIT - active.length }).map((_, i) => <button className="wp-goal-manager-empty" key={i} onClick={() => onCreate()}><span>＋</span><b>New goal</b><small>AI or manual</small></button>)}
        </div> : <div className="wp-goal-history-list">{history.map(g => <div className="wp-goal-history-row" key={g.id}><div><span>{g.emoji || "🎯"}</span><p><b>{g.title}</b><small>{g.status === "achieved" ? `Achieved ${g.achievedAt || ""}` : `Archived ${g.archivedAt || ""}`} · {g.milestones?.filter(m => m.done).length || 0}/{g.milestones?.length || 0} milestones</small></p></div><div>{g.status === "archived" ? <button disabled={active.length >= ACTIVE_LIMIT} onClick={() => onPatch(g, { status: "active", archivedAt: null })}>↩ Restore</button> : <button disabled={active.length >= ACTIVE_LIMIT} onClick={() => onCreate(g)}>＋ Follow-up</button>}</div></div>)}</div>}
      </div>
    </div>
  </div>;
}

export default function GoalsPanel() {
  const [host, setHost] = useState(null);
  const [theme, setTheme] = useState("light");
  const [goals, setGoals] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [links, setLinks] = useState({});
  const [manager, setManager] = useState(false);
  const [editor, setEditor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncErr, setSyncErr] = useState(false);
  const [toast, setToast] = useState("");

  const active = useMemo(() => goals.filter(g => g.status === "active").slice(0, ACTIVE_LIMIT), [goals]);
  const [weekStart, weekEnd] = weekBounds();
  const tasksForGoal = useCallback(goal => tasks.filter(t => {
    const gid = t.goalId || links[t.id];
    return (gid === goal.uid || gid === goal.id) && t.date && t.date >= weekStart && t.date <= weekEnd;
  }), [tasks, links, weekStart, weekEnd]);
  const moving = active.filter(g => tasksForGoal(g).length > 0).length;

  useEffect(() => {
    let cancelled = false, observer;
    const place = () => {
      if (cancelled) return;
      const plan = document.querySelector(".tab-plan");
      if (!plan) return;
      let slot = document.getElementById("wp-goal-slot");
      if (!slot) {
        slot = document.createElement("div"); slot.id = "wp-goal-slot"; slot.className = "wp-goal-slot";
        plan.prepend(slot);
      }
      setHost(slot);
    };
    place();
    observer = new MutationObserver(place); observer.observe(document.body, { childList: true, subtree: true });
    return () => { cancelled = true; observer.disconnect(); const slot = document.getElementById("wp-goal-slot"); if (slot?.parentNode) slot.parentNode.removeChild(slot); };
  }, []);

  useEffect(() => {
    let observer;
    const sync = () => {
      const el = document.querySelector(".app-wrap"); if (!el) return;
      const cls = [...el.classList].find(c => c.startsWith("theme-")); if (cls) setTheme(cls.replace("theme-", ""));
      if (!observer) { observer = new MutationObserver(sync); observer.observe(el, { attributes: true, attributeFilter: ["class"] }); }
    };
    const t = setTimeout(sync, 0); return () => { clearTimeout(t); observer?.disconnect(); };
  }, []);

  const hydrate = useCallback(next => { setGoals(Array.isArray(next) ? next : []); writeLocal(CACHE_KEY, Array.isArray(next) ? next : []); }, []);
  const loadGoals = useCallback(async () => {
    try { const r = await fetch("/api/goals"); const d = await r.json(); if (!r.ok) throw new Error(); hydrate(d.goals || []); setSyncErr(false); }
    catch { hydrate(readLocal(CACHE_KEY, [])); setSyncErr(true); }
    finally { setLoading(false); }
  }, [hydrate]);

  useEffect(() => {
    setTasks(readLocal(TASKS_KEY, [])); setLinks(readLocal(LINKS_KEY, {})); loadGoals();
    const onTasks = e => setTasks(e.detail?.tasks || readLocal(TASKS_KEY, []));
    const onLinks = () => setLinks(readLocal(LINKS_KEY, {}));
    window.addEventListener("wp-tasks-updated", onTasks); window.addEventListener("wp-goal-links-changed", onLinks);
    return () => { window.removeEventListener("wp-tasks-updated", onTasks); window.removeEventListener("wp-goal-links-changed", onLinks); };
  }, [loadGoals]);

  const flash = text => { setToast(text); setTimeout(() => setToast(""), 1800); };
  const persist = async (goal, closeEditor = false) => {
    try {
      const editing = !!goal.id;
      const r = await fetch("/api/goals", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing ? { id: goal.id, goal } : goal) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "save failed");
      hydrate(d.goals || []); setSyncErr(false); if (closeEditor) setEditor(null); flash(editing ? "Goal updated" : "Goal created ✨"); return true;
    } catch { setSyncErr(true); return false; }
  };
  const patch = (goal, p) => persist({ ...goal, ...p, updatedAt: new Date().toISOString() }, false);
  const openCreate = seed => {
    if (active.length >= ACTIVE_LIMIT) { flash("Bạn đang có đủ 3 active goals"); return; }
    if (seed?.status === "achieved") setEditor(blankGoal({ title: `${seed.title} · next`, emoji: seed.emoji }));
    else setEditor(blankGoal(seed || {}));
  };

  const card = <div className="card wp-goal-home-card">
    <div className="wp-goal-home-head">
      <button className="wp-goal-home-title" onClick={() => setManager(true)}><span className="mark">◎</span><span><b>NEXT 90 DAYS</b><small>{loading ? "Loading…" : active.length ? `${moving}/${active.length} goals moving this week` : "Choose up to 3 goals worth pursuing"}</small></span></button>
      <div className="wp-goal-home-actions">{syncErr && <span className="sync" title="Goal sync đang dùng cache local"/>}<button onClick={() => setManager(true)}>Manage</button><button className="add" disabled={active.length >= ACTIVE_LIMIT} onClick={() => openCreate()}>＋</button></div>
    </div>
    <div className="wp-goal-home-row">
      {active.map((g, i) => {
        const pct = progress(g), left = daysLeft(g.deadline), linked = tasksForGoal(g);
        return <button key={g.id} className="wp-goal-home-item" onClick={() => setManager(true)} style={{ "--delay": `${i * 55}ms` }}><Ring value={pct}/><span className="wp-goal-home-copy"><span className="title"><i>{g.emoji || "🎯"}</i>{g.title}</span><span className="sub">{g.weeklyOutcome || (left == null ? "No deadline" : left < 0 ? `${Math.abs(left)}d overdue` : `${left} days left`)}</span></span><span className={linked.length ? "momentum on" : "momentum"} title={linked.length ? `${linked.length} linked tasks` : "No linked task this week"}/></button>;
      })}
      {Array.from({ length: ACTIVE_LIMIT - active.length }).map((_, i) => <button className="wp-goal-home-empty" key={i} onClick={() => openCreate()}><span>＋</span><small>Goal</small></button>)}
    </div>
  </div>;

  const modalClass = `wp-goals-modal-root theme-${theme}`;
  return <>
    {host && createPortal(card, host)}
    {manager && typeof document !== "undefined" && createPortal(<div className={modalClass}><Manager goals={goals} tasksForGoal={tasksForGoal} onClose={() => setManager(false)} onEdit={g => setEditor(g)} onCreate={g => openCreate(g)} onPatch={patch}/></div>, document.body)}
    {editor && typeof document !== "undefined" && createPortal(<div className={modalClass}><Editor initial={editor?.id ? editor : null} activeCount={active.length} existingGoals={goals} onClose={() => setEditor(null)} onSave={g => persist(g, true)}/></div>, document.body)}
    {toast && typeof document !== "undefined" && createPortal(<div className={`${modalClass} wp-goal-toast`}>✦ {toast}</div>, document.body)}
    <style jsx global>{`
      #wp-goal-slot{display:block;margin-bottom:14px}.wp-goal-home-card{padding:0!important;overflow:hidden;position:relative;animation:wpGoalCardIn .42s cubic-bezier(.16,1,.3,1) both}.wp-goal-home-head{min-height:44px;padding:7px 9px 6px 11px;border-bottom:1px solid var(--c-border);display:flex;align-items:center;justify-content:space-between;gap:9px}.wp-goal-home-title{border:0;background:transparent;color:var(--c-ink);padding:0;display:flex;align-items:center;gap:8px;text-align:left;cursor:pointer;min-width:0}.wp-goal-home-title .mark{width:29px;height:29px;border-radius:50%;border:1.5px solid var(--c1);display:grid;place-items:center;color:var(--c1);font-size:1rem;flex:0 0 auto}.wp-goal-home-title b{display:block;font-size:.64rem;letter-spacing:.12em}.wp-goal-home-title small{display:block;font-size:.58rem;color:var(--c-muted);margin-top:1px}.wp-goal-home-actions{display:flex;align-items:center;gap:6px;flex:0 0 auto}.wp-goal-home-actions button{height:28px;border:1px solid var(--c-border);border-radius:9px;background:var(--c-surface);color:var(--c-muted);padding:0 9px;font:800 .61rem 'Nunito',sans-serif;cursor:pointer}.wp-goal-home-actions .add{width:29px;padding:0;background:var(--c1);border-color:var(--c1);color:var(--c-on-accent);font-size:.9rem}.wp-goal-home-actions button:disabled{opacity:.35;cursor:not-allowed}.wp-goal-home-actions .sync{width:6px;height:6px;border-radius:50%;background:#d98e4a;box-shadow:0 0 0 3px rgba(217,142,74,.13)}.wp-goal-home-row{display:flex;gap:7px;padding:8px;overflow-x:auto;scrollbar-width:none}.wp-goal-home-row::-webkit-scrollbar{display:none}.wp-goal-home-item,.wp-goal-home-empty{height:48px;min-width:0;flex:1 1 0;border:1px solid color-mix(in srgb,var(--c-border) 88%,transparent);border-radius:11px;background:color-mix(in srgb,var(--c-surface) 74%,var(--c-track));color:var(--c-ink);cursor:pointer;animation:wpGoalMiniIn .4s cubic-bezier(.16,1,.3,1) both;animation-delay:var(--delay);transition:transform .2s cubic-bezier(.2,.9,.3,1),border-color .2s ease,background .2s ease;display:flex;align-items:center;gap:7px;padding:5px 8px}.wp-goal-home-item:hover{transform:translateY(-1px);border-color:color-mix(in srgb,var(--c1) 35%,var(--c-border));background:color-mix(in srgb,var(--c1) 5%,var(--c-surface))}.wp-goal-ring{width:29px;height:29px;position:relative;display:grid;place-items:center;flex:0 0 auto}.wp-goal-ring svg{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg)}.wp-goal-ring circle{fill:none;stroke-width:2.1}.wp-goal-ring .track{stroke:var(--c-track)}.wp-goal-ring .value{stroke:var(--c1);stroke-linecap:round;transition:stroke-dashoffset .55s cubic-bezier(.2,.9,.3,1)}.wp-goal-ring b{font-size:.45rem;color:var(--c-muted)}.wp-goal-home-copy{min-width:0;display:block;text-align:left;flex:1}.wp-goal-home-copy .title,.wp-goal-home-copy .sub{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wp-goal-home-copy .title{font-size:.67rem;font-weight:800}.wp-goal-home-copy .title i{font-style:normal;margin-right:4px}.wp-goal-home-copy .sub{font-size:.54rem;color:var(--c-muted);margin-top:2px}.wp-goal-home-item .momentum{width:7px;height:7px;border-radius:50%;background:var(--c-muted2);flex:0 0 auto;opacity:.6}.wp-goal-home-item .momentum.on{background:#48a26b;opacity:1;box-shadow:0 0 0 3px rgba(72,162,107,.12);animation:wpGoalPulse 2.3s ease-in-out infinite}.wp-goal-home-empty{min-width:86px;max-width:120px;justify-content:center;flex-direction:column;gap:0;border-style:dashed;color:var(--c-muted2);background:transparent}.wp-goal-home-empty span{font-size:.85rem;line-height:1}.wp-goal-home-empty small{font-size:.5rem;font-weight:800;letter-spacing:.08em;margin-top:2px}
      .wp-goals-modal-root{--g-bg:var(--c-bg);--g-surface:var(--c-surface);--g-ink:var(--c-ink);--g-muted:var(--c-muted);--g-muted2:var(--c-muted2);--g-border:var(--c-border);--g-track:var(--c-track);--g-a:var(--c1);--g-a2:var(--c2);font-family:'Nunito',sans-serif;color:var(--g-ink)}.wp-goal-overlay{position:fixed;inset:0;z-index:9000;background:rgba(20,14,16,.46);backdrop-filter:blur(7px);display:flex;align-items:center;justify-content:center;padding:22px;animation:wpGoalBackdrop .2s ease both}.wp-goal-sheet{width:min(980px,100%);max-height:min(800px,90vh);overflow:auto;background:var(--g-surface);border:1px solid var(--g-border);border-radius:22px;color:var(--g-ink);box-shadow:0 28px 85px rgba(20,12,15,.27);animation:wpGoalSheetIn .35s cubic-bezier(.16,1,.3,1) both}.wp-goal-sheet-head{position:sticky;top:0;z-index:3;background:color-mix(in srgb,var(--g-surface) 94%,transparent);backdrop-filter:blur(15px);display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:18px 20px 13px;border-bottom:1px solid var(--g-border)}.wp-goal-sheet-head .eyebrow{display:block;font-size:.57rem;letter-spacing:.15em;font-weight:900;color:var(--g-a);margin-bottom:2px}.wp-goal-sheet h2{font-family:'Cormorant Garamond',Georgia,serif;font-size:1.35rem;line-height:1.08;margin:0}.wp-goal-sheet button{font-family:'Nunito',sans-serif}.wp-goal-sheet .round{width:33px;height:33px;border-radius:50%;border:1px solid var(--g-border);background:var(--g-track);color:var(--g-muted);font-size:1.05rem;cursor:pointer;display:grid;place-items:center}.manager-head{align-items:center}.wp-goal-head-actions{display:flex;align-items:center;gap:6px}.wp-goal-head-actions .seg,.wp-goal-head-actions .new{height:32px;border:1px solid var(--g-border);border-radius:9px;background:var(--g-surface);color:var(--g-muted);padding:0 10px;font-weight:800;font-size:.62rem;cursor:pointer}.wp-goal-head-actions .seg.on{color:var(--g-a);border-color:color-mix(in srgb,var(--g-a) 42%,var(--g-border));background:color-mix(in srgb,var(--g-a) 7%,var(--g-surface))}.wp-goal-head-actions .new{background:var(--g-a);color:var(--c-on-accent);border-color:var(--g-a)}.wp-goal-head-actions button:disabled{opacity:.35;cursor:not-allowed}.wp-goal-manager-body{padding:15px}.wp-goal-manager-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px}.wp-goal-full,.wp-goal-manager-empty{border:1px solid var(--g-border);border-radius:16px;background:linear-gradient(180deg,var(--g-surface),color-mix(in srgb,var(--g-track) 24%,var(--g-surface)));padding:13px;min-width:0;animation:wpGoalMiniIn .42s cubic-bezier(.16,1,.3,1) both;animation-delay:var(--delay)}.wp-goal-full-top{display:flex;align-items:center;gap:6px}.wp-goal-full-top .num{font-size:.54rem;letter-spacing:.12em;font-weight:900;color:var(--g-muted2)}.wp-goal-full-top .ico{font-size:1rem}.wp-goal-full-top .deadline{margin-left:auto;font-size:.56rem;font-weight:900;color:var(--g-muted);padding:3px 7px;border-radius:20px;background:var(--g-track)}.wp-goal-full-top .deadline.soon{color:#a96013;background:#fff0d4}.wp-goal-full h3{font-family:'Cormorant Garamond',Georgia,serif;font-size:1.1rem;line-height:1.16;margin:9px 0}.wp-goal-progress{height:7px;border-radius:99px;background:var(--g-track);overflow:hidden;position:relative}.wp-goal-progress i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--g-a),var(--g-a2));transition:width .45s ease}.wp-goal-progress b{position:absolute;right:0;top:-15px;font-size:.52rem;color:var(--g-muted)}.wp-goal-week{margin-top:10px;padding:7px 8px;border-radius:9px;background:var(--g-track)}.wp-goal-week span{display:block;font-size:.49rem;font-weight:900;letter-spacing:.11em;color:var(--g-muted)}.wp-goal-week b{display:block;font-size:.67rem;margin-top:2px;line-height:1.35}.wp-goal-momentum{display:flex;align-items:center;gap:6px;font-size:.57rem;color:var(--g-muted);margin:8px 0}.wp-goal-momentum i{width:7px;height:7px;border-radius:50%;background:var(--g-muted2)}.wp-goal-momentum i.on{background:#48a26b;box-shadow:0 0 0 3px rgba(72,162,107,.12)}.wp-goal-checklist{display:grid;gap:5px;border-top:1px dashed var(--g-border);padding-top:9px}.wp-goal-checklist label{display:flex;align-items:flex-start;gap:6px;font-size:.65rem;line-height:1.35}.wp-goal-checklist input{accent-color:var(--g-a);margin-top:2px}.wp-goal-card-actions{display:flex;gap:5px;flex-wrap:wrap;margin-top:10px}.wp-goal-card-actions button,.wp-goal-history-row button{border:1px solid var(--g-border);background:var(--g-surface);color:var(--g-muted);border-radius:8px;padding:6px 8px;font-weight:800;font-size:.57rem;cursor:pointer}.wp-goal-card-actions .achieved{margin-left:auto;color:#3c8054;border-color:#8bc5a0}.wp-goal-card-actions button:disabled,.wp-goal-history-row button:disabled{opacity:.35;cursor:not-allowed}.wp-goal-manager-empty{min-height:230px;border-style:dashed;background:transparent;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--g-muted2);cursor:pointer}.wp-goal-manager-empty span{font-size:1.35rem}.wp-goal-manager-empty b{font-size:.68rem;color:var(--g-ink);margin:3px 0}.wp-goal-manager-empty small{font-size:.55rem}.wp-goal-history-list{display:grid;gap:8px}.wp-goal-history-row{border:1px solid var(--g-border);border-radius:12px;padding:10px;display:flex;align-items:center;justify-content:space-between;gap:10px}.wp-goal-history-row>div:first-child{display:flex;align-items:center;gap:8px;min-width:0}.wp-goal-history-row>div:first-child>span{font-size:1.1rem}.wp-goal-history-row p{min-width:0}.wp-goal-history-row p b,.wp-goal-history-row p small{display:block}.wp-goal-history-row p b{font-size:.72rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wp-goal-history-row p small{font-size:.57rem;color:var(--g-muted);margin-top:2px}.wp-goal-history-empty{text-align:center;color:var(--g-muted);font-size:.68rem;padding:30px}
      .wp-goal-editor{width:min(700px,100%)}.wp-goal-mode-tabs{display:flex;gap:5px;padding:12px 18px 0}.wp-goal-mode-tabs button{border:1px solid var(--g-border);background:var(--g-surface);color:var(--g-muted);border-radius:9px;padding:7px 10px;font-weight:800;font-size:.62rem;cursor:pointer}.wp-goal-mode-tabs button.on{color:var(--g-a);border-color:color-mix(in srgb,var(--g-a) 42%,var(--g-border));background:color-mix(in srgb,var(--g-a) 7%,var(--g-surface))}.wp-goal-ai-box,.wp-goal-form{padding:15px 18px 18px}.wp-goal-ai-box .label,.wp-goal-form label>span,.wp-goal-ms-head>span{display:block;font-size:.58rem;font-weight:900;letter-spacing:.06em;color:var(--g-muted);margin-bottom:6px}.wp-goal-ai-box textarea{width:100%;min-height:125px;resize:vertical;border:1px solid var(--g-border);border-radius:13px;background:color-mix(in srgb,var(--g-track) 25%,var(--g-surface));color:var(--g-ink);padding:12px;font:600 .78rem/1.5 'Nunito',sans-serif;outline:none}.wp-goal-ai-box textarea:focus,.wp-goal-form input:focus{border-color:var(--g-a);box-shadow:0 0 0 3px color-mix(in srgb,var(--g-a) 10%,transparent)}.wp-goal-ai-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:9px}.wp-goal-ai-foot small{font-size:.57rem;line-height:1.45;color:var(--g-muted);max-width:420px}.wp-goal-ai-foot button,.wp-goal-actions .primary{border:1px solid var(--g-a);background:var(--g-a);color:var(--c-on-accent);border-radius:10px;padding:8px 12px;font-weight:900;font-size:.63rem;cursor:pointer;white-space:nowrap}.wp-goal-ai-foot button:disabled,.wp-goal-actions button:disabled{opacity:.35;cursor:not-allowed}.wp-goal-form label{display:block;margin-bottom:12px}.wp-goal-form input{width:100%;border:1px solid var(--g-border);border-radius:10px;background:var(--g-surface);color:var(--g-ink);padding:9px 10px;font:600 .75rem 'Nunito',sans-serif;outline:none}.wp-goal-title-line{display:grid;grid-template-columns:52px 1fr;gap:6px}.wp-goal-title-line .emoji{text-align:center;font-size:1rem}.wp-goal-form-grid{display:grid;grid-template-columns:160px 1fr;gap:8px}.wp-goal-ms-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px}.wp-goal-ms-head button{border:0;background:transparent;color:var(--g-a);font-weight:900;font-size:.61rem;cursor:pointer}.wp-goal-ms-edit{display:grid;gap:6px}.wp-goal-ms-edit>div{display:grid;grid-template-columns:23px 1fr 25px;gap:5px;align-items:center}.wp-goal-ms-edit b{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;background:var(--g-track);color:var(--g-muted);font-size:.55rem}.wp-goal-ms-edit button{border:0;background:transparent;color:var(--g-muted);font-size:1rem;cursor:pointer}.wp-goal-ai-ready{padding:7px 9px;border-radius:9px;background:color-mix(in srgb,var(--g-a2) 10%,var(--g-surface));border:1px solid color-mix(in srgb,var(--g-a2) 28%,var(--g-border));color:var(--g-muted);font-size:.61rem;margin-bottom:11px;animation:wpGoalReady .45s ease both}.wp-goal-warning{padding:7px 9px;border-radius:9px;background:#fff3de;border:1px solid #edca97;color:#9b5d20;font-size:.61rem;margin-top:9px}.wp-goal-warning.ai-err{margin:0 18px 15px}.wp-goal-actions{display:flex;justify-content:flex-end;gap:7px;margin-top:15px}.wp-goal-actions .secondary{border:1px solid var(--g-border);background:var(--g-surface);color:var(--g-muted);border-radius:10px;padding:8px 12px;font-weight:800;font-size:.63rem;cursor:pointer}.wp-goal-toast{position:fixed;z-index:10000;left:50%;bottom:26px;transform:translateX(-50%);padding:8px 12px;border-radius:999px;background:var(--g-ink);color:var(--g-surface);font:800 .64rem 'Nunito',sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.25);animation:wpGoalToast .28s cubic-bezier(.16,1,.3,1) both;pointer-events:none}
      @keyframes wpGoalCardIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}@keyframes wpGoalMiniIn{from{opacity:0;transform:translateY(6px) scale(.98)}to{opacity:1;transform:none}}@keyframes wpGoalBackdrop{from{opacity:0}to{opacity:1}}@keyframes wpGoalSheetIn{from{opacity:0;transform:translateY(16px) scale(.985)}to{opacity:1;transform:none}}@keyframes wpGoalPulse{0%,100%{box-shadow:0 0 0 3px rgba(72,162,107,.10)}50%{box-shadow:0 0 0 5px rgba(72,162,107,.03)}}@keyframes wpGoalReady{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}@keyframes wpGoalToast{from{opacity:0;transform:translate(-50%,8px) scale(.95)}to{opacity:1;transform:translate(-50%,0) scale(1)}}
      @media(max-width:760px){#wp-goal-slot{margin-bottom:11px}.wp-goal-home-head{min-height:42px}.wp-goal-home-title small{max-width:210px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wp-goal-home-actions button:first-of-type{display:none}.wp-goal-home-row{padding:7px}.wp-goal-home-item{flex:0 0 190px}.wp-goal-home-empty{flex:0 0 68px;min-width:68px}.wp-goal-overlay{align-items:flex-end;padding:0}.wp-goal-sheet{border-radius:20px 20px 0 0;max-height:91vh;width:100%;padding-bottom:env(safe-area-inset-bottom)}.wp-goal-manager-grid{display:flex;overflow-x:auto;gap:8px;scroll-snap-type:x mandatory}.wp-goal-full,.wp-goal-manager-empty{flex:0 0 82vw;scroll-snap-align:start}.wp-goal-sheet-head{padding:15px}.wp-goal-sheet h2{font-size:1.18rem}.wp-goal-head-actions .seg{display:none}.wp-goal-head-actions .new{padding:0 8px}.wp-goal-form-grid{grid-template-columns:1fr}.wp-goal-ai-foot{align-items:flex-start;flex-direction:column}.wp-goal-ai-foot button{width:100%}.wp-goal-history-row{align-items:flex-start;flex-direction:column}.wp-goal-history-row>div:last-child,.wp-goal-history-row>div:last-child button{width:100%}}
      @media(max-width:430px){.wp-goal-home-title .mark{width:27px;height:27px}.wp-goal-home-title b{font-size:.6rem}.wp-goal-home-title small{font-size:.53rem;max-width:165px}.wp-goal-home-item{flex-basis:175px}.wp-goal-home-actions .add{width:27px}.wp-goal-editor{max-height:94vh}}
      @media(prefers-reduced-motion:reduce){.wp-goal-home-card,.wp-goal-home-item,.wp-goal-full,.wp-goal-sheet,.wp-goal-overlay,.wp-goal-ai-ready,.wp-goal-toast{animation:none!important}.wp-goal-home-item .momentum.on{animation:none!important}.wp-goal-ring .value{transition:none!important}}
    `}</style>
  </>;
}
