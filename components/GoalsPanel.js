import { useCallback, useEffect, useMemo, useState } from "react";

const ACTIVE_LIMIT = 3;
const CACHE_KEY = "dat-goals-cache";
const LINKS_KEY = "dat-goal-links";
const TASKS_KEY = "dat-tasks-cache";

const statusOrder = { active: 0, achieved: 1, archived: 2 };

function todayIso() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
function plusDaysIso(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
function weekBounds() {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  const start = new Date(d);
  const end = new Date(d); end.setDate(end.getDate() + 6);
  const iso = x => {
    const y = new Date(x); y.setMinutes(y.getMinutes() - y.getTimezoneOffset()); return y.toISOString().slice(0, 10);
  };
  return [iso(start), iso(end)];
}
function daysLeft(deadline) {
  if (!deadline) return null;
  const a = new Date(todayIso() + "T12:00:00");
  const b = new Date(deadline + "T12:00:00");
  return Math.ceil((b - a) / 86400000);
}
function progress(goal) {
  const ms = Array.isArray(goal.milestones) ? goal.milestones : [];
  if (!ms.length) return 0;
  return Math.round(ms.filter(m => m.done).length / ms.length * 100);
}
function allMilestonesDone(goal) {
  const ms = Array.isArray(goal.milestones) ? goal.milestones : [];
  return ms.length > 0 && ms.every(m => m.done);
}
function readLocal(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}
function writeLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function GoalModal({ mode, initial, activeCount, onClose, onSave }) {
  const isEdit = mode === "edit";
  const [title, setTitle] = useState(initial?.title || "");
  const [emoji, setEmoji] = useState(initial?.emoji || "🎯");
  const [deadline, setDeadline] = useState(initial?.deadline || plusDaysIso(90));
  const [weeklyOutcome, setWeeklyOutcome] = useState(initial?.weeklyOutcome || "");
  const [milestones, setMilestones] = useState(() => {
    const old = initial?.milestones;
    if (old?.length) return old.map(m => ({ ...m }));
    return [0, 1, 2].map(i => ({ id: `m-${Date.now()}-${i}`, text: "", done: false }));
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const canSave = title.trim() && deadline && milestones.some(m => m.text.trim()) && (isEdit || activeCount < ACTIVE_LIMIT);
  const setM = (id, patch) => setMilestones(ms => ms.map(m => m.id === id ? { ...m, ...patch } : m));
  const submit = async () => {
    if (!canSave || saving) return;
    setSaving(true); setErr("");
    const clean = milestones.filter(m => m.text.trim()).map(m => ({ ...m, text: m.text.trim() }));
    const next = {
      ...(initial || {}), title: title.trim(), emoji: (emoji || "🎯").trim().slice(0, 4), deadline,
      weeklyOutcome: weeklyOutcome.trim(), milestones: clean,
      status: initial?.status || "active",
    };
    const ok = await onSave(next);
    if (!ok) { setErr("Chưa lưu được goal. Thử lại giúp mình nhé."); setSaving(false); }
  };

  return <div className="g-modal-back" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <div className="g-modal" role="dialog" aria-modal="true">
      <div className="g-modal-head">
        <div><div className="g-kicker">{isEdit ? "CHỈNH GOAL" : "GOAL MỚI"}</div><h3>{isEdit ? "Giữ mục tiêu thật rõ" : "90 ngày tới mình muốn đi đâu?"}</h3></div>
        <button className="g-icon-btn" onClick={onClose}>✕</button>
      </div>
      <label className="g-field"><span>Mục tiêu</span><div className="g-title-row"><input className="g-emoji" value={emoji} onChange={e => setEmoji(e.target.value)} maxLength={4}/><input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Ví dụ: Lấy bằng C1" maxLength={140}/></div></label>
      <div className="g-form-grid">
        <label className="g-field"><span>Deadline</span><input type="date" value={deadline} onChange={e => setDeadline(e.target.value)}/></label>
        <label className="g-field"><span>This week outcome</span><input value={weeklyOutcome} onChange={e => setWeeklyOutcome(e.target.value)} placeholder="Một kết quả quan trọng tuần này" maxLength={180}/></label>
      </div>
      <div className="g-field">
        <div className="g-field-title"><span>Milestones · 1–5 bước để biết mình thật sự đã tới đích</span>{milestones.length < 5 && <button className="g-link" onClick={() => setMilestones(ms => [...ms, { id: `m-${Date.now()}`, text: "", done: false }])}>＋ thêm</button>}</div>
        <div className="g-milestone-edit">
          {milestones.map((m, i) => <div key={m.id} className="g-milestone-input">
            <span>{i + 1}</span><input value={m.text} onChange={e => setM(m.id, { text: e.target.value })} placeholder={`Milestone ${i + 1}`} maxLength={140}/>
            {milestones.length > 1 && <button onClick={() => setMilestones(ms => ms.filter(x => x.id !== m.id))}>×</button>}
          </div>)}
        </div>
      </div>
      {!isEdit && activeCount >= ACTIVE_LIMIT && <div className="g-warning">Bạn đang có đủ 3 Active Goals. Archive một goal trước khi tạo goal mới.</div>}
      {err && <div className="g-warning">{err}</div>}
      <div className="g-modal-actions"><button className="g-secondary" onClick={onClose}>Hủy</button><button className="g-primary" disabled={!canSave || saving} onClick={submit}>{saving ? "Đang lưu…" : isEdit ? "Lưu thay đổi" : "Tạo goal"}</button></div>
    </div>
  </div>;
}

function HistoryModal({ goals, activeCount, onClose, onRestore, onFollowUp }) {
  const [tab, setTab] = useState("achieved");
  const list = goals.filter(g => tab === "all" ? g.status !== "active" : g.status === tab)
    .sort((a, b) => String(b.achievedAt || b.archivedAt || b.updatedAt || "").localeCompare(String(a.achievedAt || a.archivedAt || a.updatedAt || "")));
  return <div className="g-modal-back" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <div className="g-modal g-history" role="dialog" aria-modal="true">
      <div className="g-modal-head"><div><div className="g-kicker">GOAL HISTORY</div><h3>Nhìn lại những chặng đường đã đi</h3></div><button className="g-icon-btn" onClick={onClose}>✕</button></div>
      <div className="g-history-tabs">{[["achieved","✓ Achieved"],["archived","Archived"],["all","All"]].map(([k,l]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}</div>
      <div className="g-history-list">
        {!list.length && <div className="g-empty-history">Chưa có goal nào ở đây.</div>}
        {list.map(g => <div key={g.id} className="g-history-row">
          <div className="g-history-main"><span className="g-history-emoji">{g.emoji || "🎯"}</span><div><strong>{g.title}</strong><div>{g.status === "achieved" ? `Hoàn thành ${g.achievedAt || ""}` : `Archived ${g.archivedAt || ""}`} · {g.milestones?.filter(m => m.done).length || 0}/{g.milestones?.length || 0} milestones</div></div></div>
          <div className="g-history-actions">{g.status === "archived" && <button disabled={activeCount >= ACTIVE_LIMIT} onClick={() => onRestore(g)}>↩ Restore</button>}{g.status === "achieved" && <button onClick={() => onFollowUp(g)}>＋ Follow-up</button>}</div>
        </div>)}
      </div>
    </div>
  </div>;
}

export default function GoalsPanel() {
  const [goals, setGoals] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [links, setLinks] = useState({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(true);
  const [theme, setTheme] = useState("light");
  const [modal, setModal] = useState(null);
  const [history, setHistory] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [syncErr, setSyncErr] = useState(false);

  const active = useMemo(() => goals.filter(g => g.status === "active").sort((a,b) => String(a.createdAt || "").localeCompare(String(b.createdAt || ""))).slice(0, ACTIVE_LIMIT), [goals]);

  const hydrateCache = useCallback((next) => {
    const sorted = [...next].sort((a,b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9));
    setGoals(sorted); writeLocal(CACHE_KEY, sorted);
  }, []);

  const loadGoals = useCallback(async () => {
    try {
      const r = await fetch("/api/goals"); const d = await r.json();
      if (!r.ok) throw new Error(d.error || "goals failed");
      hydrateCache(d.goals || []); setSyncErr(false);
    } catch {
      const cached = readLocal(CACHE_KEY, []); if (cached.length) setGoals(cached); setSyncErr(true);
    } finally { setLoading(false); }
  }, [hydrateCache]);

  useEffect(() => {
    setOpen(readLocal("dat-goals-open", true));
    setTasks(readLocal(TASKS_KEY, [])); setLinks(readLocal(LINKS_KEY, {}));
    loadGoals();
    const onTasks = e => setTasks(e.detail?.tasks || readLocal(TASKS_KEY, []));
    const onLinks = () => setLinks(readLocal(LINKS_KEY, {}));
    window.addEventListener("wp-tasks-updated", onTasks); window.addEventListener("wp-goal-links-changed", onLinks);
    return () => { window.removeEventListener("wp-tasks-updated", onTasks); window.removeEventListener("wp-goal-links-changed", onLinks); };
  }, [loadGoals]);

  useEffect(() => {
    let obs;
    const sync = () => {
      const el = document.querySelector(".app-wrap");
      if (!el) return;
      const cls = [...el.classList].find(c => c.startsWith("theme-"));
      if (cls) setTheme(cls.slice(6));
      if (!obs) { obs = new MutationObserver(sync); obs.observe(el, { attributes: true, attributeFilter: ["class"] }); }
    };
    const t = setTimeout(sync, 0); return () => { clearTimeout(t); obs?.disconnect(); };
  }, []);

  const saveGoal = async (goal) => {
    try {
      const method = goal.id ? "PATCH" : "POST";
      const body = goal.id ? { id: goal.id, goal } : goal;
      const r = await fetch("/api/goals", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "save failed");
      hydrateCache(d.goals || []); setModal(null); setSyncErr(false); return true;
    } catch { setSyncErr(true); return false; }
  };
  const patchGoal = async (goal, patch) => saveGoal({ ...goal, ...patch, updatedAt: new Date().toISOString() });
  const toggleMilestone = (goal, id) => patchGoal(goal, { milestones: goal.milestones.map(m => m.id === id ? { ...m, done: !m.done } : m) });
  const archiveGoal = goal => patchGoal(goal, { status: "archived", archivedAt: todayIso() });
  const achieveGoal = goal => allMilestonesDone(goal) ? patchGoal(goal, { status: "achieved", achievedAt: todayIso() }) : false;
  const restoreGoal = goal => active.length < ACTIVE_LIMIT ? patchGoal(goal, { status: "active", archivedAt: null }) : false;

  const [weekStart, weekEnd] = weekBounds();
  const tasksForGoal = (goal) => tasks.filter(t => {
    const gid = t.goalId || links[t.id];
    return gid === goal.uid && t.date && t.date >= weekStart && t.date <= weekEnd;
  });
  const moving = active.filter(g => tasksForGoal(g).length > 0).length;

  const openCreate = (seed = null) => setModal({ mode: "create", goal: seed || { title: "", emoji: "🎯", deadline: plusDaysIso(90), weeklyOutcome: "", milestones: [] } });

  return <div className={`wp-goals theme-${theme}`}>
    <div className="g-shell">
      <div className="g-topline">
        <button className="g-heading" onClick={() => { const n = !open; setOpen(n); writeLocal("dat-goals-open", n); }}>
          <span className="g-target">◎</span><span><b>NEXT 90 DAYS</b><small>{active.length ? `${moving}/${active.length} goals đang có momentum tuần này` : "Chọn tối đa 3 điều thật sự đáng theo đuổi"}</small></span><span className="g-chevron">{open ? "⌃" : "⌄"}</span>
        </button>
        <div className="g-top-actions"><button onClick={() => setHistory(true)}>↺ History</button><button className="g-add" disabled={active.length >= ACTIVE_LIMIT} onClick={() => openCreate()}>＋ Goal</button></div>
      </div>

      {open && <div className="g-body">
        {syncErr && <div className="g-sync-note">⚠ Goal đang dùng cache trên máy; Notion sync chưa phản hồi.</div>}
        <div className="g-grid">
          {active.map((g, idx) => {
            const pct = progress(g), left = daysLeft(g.deadline), linked = tasksForGoal(g), isOpen = expanded === g.id;
            return <div key={g.id} className={`g-card ${linked.length ? "moving" : "idle"}`}>
              <button className="g-card-main" onClick={() => setExpanded(isOpen ? null : g.id)}>
                <div className="g-card-head"><span className="g-index">0{idx + 1}</span><span className="g-card-emoji">{g.emoji || "🎯"}</span><span className={`g-days ${left != null && left <= 14 ? "soon" : ""}`}>{left == null ? "No deadline" : left < 0 ? `${Math.abs(left)}d overdue` : left === 0 ? "Due today" : `${left} days left`}</span></div>
                <div className="g-title">{g.title}</div>
                <div className="g-progress-row"><div className="g-progress"><i style={{ width: `${pct}%` }}/></div><strong>{pct}%</strong></div>
                <div className="g-week"><span>THIS WEEK</span><b>{g.weeklyOutcome || "Chưa chọn outcome tuần này"}</b></div>
                <div className="g-momentum"><span className={linked.length ? "dot on" : "dot"}/>{linked.length ? `${linked.length} task${linked.length > 1 ? "s" : ""} đang đẩy goal này` : "Chưa có task nào cho goal này trong tuần"}</div>
              </button>
              {isOpen && <div className="g-details">
                <div className="g-detail-label">MILESTONES</div>
                <div className="g-checklist">{g.milestones?.map(m => <label key={m.id}><input type="checkbox" checked={!!m.done} onChange={() => toggleMilestone(g, m.id)}/><span>{m.text}</span></label>)}</div>
                {!!linked.length && <div className="g-linked"><div className="g-detail-label">LINKED THIS WEEK</div>{linked.slice(0, 4).map(t => <div key={t.id} className={t.done ? "done" : ""}>{t.done ? "✓" : "→"} {t.name}</div>)}</div>}
                <div className="g-card-actions"><button onClick={() => setModal({ mode: "edit", goal: g })}>Edit</button><button onClick={() => archiveGoal(g)}>Archive</button><button className="achieve" disabled={!allMilestonesDone(g)} title={allMilestonesDone(g) ? "" : "Hoàn thành tất cả milestone trước"} onClick={() => achieveGoal(g)}>✓ Mark achieved</button></div>
              </div>}
            </div>;
          })}
          {Array.from({ length: ACTIVE_LIMIT - active.length }).map((_, i) => <button key={`empty-${i}`} className="g-empty-card" onClick={() => openCreate()}><span>＋</span><b>New 90-day goal</b><small>Biến một điều quan trọng thành những bước có thể làm mỗi tuần.</small></button>)}
        </div>
        {!!active.length && moving < active.length && <div className="g-nudge"><span>✦</span><div><b>{active.length - moving} goal đang đứng yên tuần này.</b><small>Chỉ cần tạo một task thật cụ thể cho goal đó — momentum quan trọng hơn làm thật nhiều.</small></div></div>}
      </div>}
    </div>

    {modal && <GoalModal mode={modal.mode} initial={modal.goal} activeCount={active.length} onClose={() => setModal(null)} onSave={saveGoal}/>} 
    {history && <HistoryModal goals={goals} activeCount={active.length} onClose={() => setHistory(false)} onRestore={async g => { await restoreGoal(g); }} onFollowUp={g => { setHistory(false); openCreate({ title: `${g.title} · next`, emoji: g.emoji, deadline: plusDaysIso(90), weeklyOutcome: "", milestones: [] }); }}/>} 

    <style jsx>{`
      .wp-goals{--gbg:#fdf8f2;--gs:#fff;--gink:#4a3030;--gmuted:#8a6a6a;--gborder:#e8c4b8;--ga:#7a4a4a;--ga2:#c9a84c;--gsoft:#f7ece6;position:relative;z-index:80;background:var(--gbg);color:var(--gink);font-family:'Nunito',system-ui,sans-serif;border-bottom:1px solid color-mix(in srgb,var(--gborder) 70%,transparent)}
      .theme-dark{--gbg:#04080a;--gs:#0b1512;--gink:#d6ffe9;--gmuted:#5fae8c;--gborder:#11402f;--ga:#00ff9c;--ga2:#00d0ff;--gsoft:#0d241b}
      .theme-cozy{--gbg:#f9efe2;--gs:#fff9f0;--gink:#5d3b26;--gmuted:#91694d;--gborder:#d9b58f;--ga:#a05c2c;--ga2:#d98e4a;--gsoft:#f2dfca}
      .theme-cutie{--gbg:#fdf6ee;--gs:#fff;--gink:#594d69;--gmuted:#8d7d9b;--gborder:#ead4df;--ga:#5b8fd1;--ga2:#e89bb8;--gsoft:#f6e8f1}
      .theme-nature{--gbg:#f2f5e6;--gs:#fbfdf4;--gink:#40523a;--gmuted:#718267;--gborder:#cdd9b8;--ga:#6f9e57;--ga2:#a7c47f;--gsoft:#e7edd8}
      .g-shell{max-width:1700px;margin:0 auto;padding:10px 16px 12px}.g-topline{display:flex;align-items:center;justify-content:space-between;gap:12px}.g-heading{display:flex;align-items:center;gap:10px;border:0;background:transparent;color:var(--gink);cursor:pointer;text-align:left;padding:4px 0;min-width:0}.g-heading b{display:block;font-size:.72rem;letter-spacing:.13em}.g-heading small{display:block;color:var(--gmuted);font-size:.68rem;margin-top:2px}.g-target{width:32px;height:32px;border:1.5px solid var(--ga);border-radius:50%;display:grid;place-items:center;color:var(--ga);font-size:1.2rem}.g-chevron{color:var(--gmuted);font-size:.9rem}.g-top-actions{display:flex;gap:7px}.g-top-actions button,.g-card-actions button,.g-history-actions button,.g-history-tabs button,.g-secondary,.g-primary{border:1px solid var(--gborder);background:var(--gs);color:var(--gmuted);border-radius:10px;padding:7px 10px;font:700 .7rem 'Nunito',sans-serif;cursor:pointer}.g-top-actions .g-add,.g-primary{background:var(--ga);color:#fff;border-color:var(--ga)}.theme-dark .g-top-actions .g-add,.theme-dark .g-primary{color:#03140d}.g-top-actions button:disabled,.g-primary:disabled,.g-card-actions button:disabled,.g-history-actions button:disabled{opacity:.38;cursor:not-allowed}.g-body{padding-top:10px}.g-sync-note,.g-warning{font-size:.7rem;color:#a15d22;background:#fff4df;border:1px solid #edc995;padding:7px 10px;border-radius:9px;margin-bottom:9px}.g-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.g-card,.g-empty-card{background:var(--gs);border:1px solid var(--gborder);border-radius:15px;overflow:hidden;min-width:0;box-shadow:0 5px 18px color-mix(in srgb,var(--gink) 5%,transparent)}.g-card.moving{border-color:color-mix(in srgb,var(--ga) 40%,var(--gborder))}.g-card-main{display:block;width:100%;border:0;background:transparent;color:inherit;text-align:left;padding:13px;cursor:pointer}.g-card-head{display:flex;align-items:center;gap:7px}.g-index{font-size:.58rem;letter-spacing:.12em;color:var(--gmuted);font-weight:800}.g-card-emoji{font-size:1.05rem}.g-days{margin-left:auto;font-size:.61rem;font-weight:800;color:var(--gmuted);background:var(--gsoft);padding:3px 7px;border-radius:20px}.g-days.soon{color:#b45309;background:#fff1d6}.g-title{font-family:'Cormorant Garamond',Georgia,serif;font-size:1.13rem;font-weight:700;line-height:1.15;margin:9px 0 10px}.g-progress-row{display:flex;align-items:center;gap:8px}.g-progress{height:6px;background:var(--gsoft);border-radius:99px;overflow:hidden;flex:1}.g-progress i{display:block;height:100%;background:linear-gradient(90deg,var(--ga),var(--ga2));border-radius:inherit;transition:width .35s ease}.g-progress-row strong{font-size:.62rem;color:var(--gmuted)}.g-week{margin-top:11px;padding:8px 9px;background:var(--gsoft);border-radius:10px}.g-week span,.g-detail-label{display:block;font-size:.55rem;font-weight:900;letter-spacing:.12em;color:var(--gmuted);margin-bottom:3px}.g-week b{display:block;font-size:.74rem;line-height:1.35}.g-momentum{font-size:.63rem;color:var(--gmuted);margin-top:8px;display:flex;align-items:center;gap:6px}.dot{width:7px;height:7px;border-radius:50%;background:#d2b9b9;box-shadow:0 0 0 3px color-mix(in srgb,#d2b9b9 20%,transparent)}.dot.on{background:#46a36b;box-shadow:0 0 0 3px rgba(70,163,107,.13)}.g-details{border-top:1px dashed var(--gborder);padding:11px 13px 13px;background:color-mix(in srgb,var(--gsoft) 38%,var(--gs))}.g-checklist{display:grid;gap:6px}.g-checklist label{display:flex;gap:7px;align-items:flex-start;font-size:.72rem;line-height:1.35}.g-checklist input{accent-color:var(--ga);margin-top:2px}.g-linked{margin-top:11px}.g-linked>div:not(.g-detail-label){font-size:.66rem;color:var(--gmuted);padding:2px 0}.g-linked .done{text-decoration:line-through;opacity:.65}.g-card-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:11px}.g-card-actions .achieve{margin-left:auto;color:#2f8050;border-color:#8bc7a3}.g-empty-card{min-height:177px;border-style:dashed;background:color-mix(in srgb,var(--gs) 68%,transparent);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:18px;color:var(--gmuted);cursor:pointer}.g-empty-card>span{font-size:1.4rem;color:var(--ga)}.g-empty-card b{font-size:.78rem;color:var(--gink);margin:4px 0}.g-empty-card small{font-size:.64rem;line-height:1.4;max-width:220px}.g-nudge{display:flex;align-items:flex-start;gap:9px;margin-top:9px;padding:8px 11px;border-radius:10px;background:color-mix(in srgb,var(--ga2) 10%,var(--gs));border:1px solid color-mix(in srgb,var(--ga2) 28%,var(--gborder))}.g-nudge>span{color:var(--ga2)}.g-nudge b{display:block;font-size:.68rem}.g-nudge small{display:block;color:var(--gmuted);font-size:.62rem;margin-top:1px}.g-modal-back{position:fixed;inset:0;z-index:5000;background:rgba(0,0,0,.48);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:18px}.g-modal{width:min(680px,100%);max-height:min(760px,92vh);overflow:auto;background:var(--gs);border:1px solid var(--gborder);border-radius:20px;padding:18px;box-shadow:0 24px 70px rgba(0,0,0,.28)}.g-modal-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin-bottom:16px}.g-kicker{font-size:.58rem;font-weight:900;letter-spacing:.14em;color:var(--ga)}.g-modal h3{font-family:'Cormorant Garamond',Georgia,serif;font-size:1.35rem;margin-top:2px}.g-icon-btn{border:1px solid var(--gborder);background:var(--gsoft);color:var(--gmuted);width:32px;height:32px;border-radius:50%;cursor:pointer}.g-field{display:block;margin-bottom:13px}.g-field>span,.g-field-title>span{display:block;font-size:.62rem;font-weight:800;letter-spacing:.05em;color:var(--gmuted);margin-bottom:6px}.g-field input{width:100%;border:1px solid var(--gborder);background:var(--gs);color:var(--gink);border-radius:10px;padding:10px 11px;font:600 .78rem 'Nunito',sans-serif;outline:none}.g-field input:focus{border-color:var(--ga);box-shadow:0 0 0 3px color-mix(in srgb,var(--ga) 10%,transparent)}.g-title-row{display:grid;grid-template-columns:58px 1fr;gap:7px}.g-title-row .g-emoji{text-align:center;font-size:1.1rem}.g-form-grid{display:grid;grid-template-columns:160px 1fr;gap:9px}.g-field-title{display:flex;justify-content:space-between;gap:8px;align-items:center}.g-link{border:0;background:transparent;color:var(--ga);font:800 .66rem 'Nunito';cursor:pointer}.g-milestone-edit{display:grid;gap:6px}.g-milestone-input{display:grid;grid-template-columns:25px 1fr 28px;gap:5px;align-items:center}.g-milestone-input>span{width:22px;height:22px;display:grid;place-items:center;border-radius:50%;background:var(--gsoft);font-size:.6rem;color:var(--gmuted);font-weight:900}.g-milestone-input button{border:0;background:transparent;color:var(--gmuted);font-size:1rem;cursor:pointer}.g-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.g-primary,.g-secondary{padding:9px 14px}.g-history{width:min(760px,100%)}.g-history-tabs{display:flex;gap:6px;border-bottom:1px solid var(--gborder);padding-bottom:10px}.g-history-tabs button.on{color:var(--ga);border-color:var(--ga);background:var(--gsoft)}.g-history-list{display:grid;gap:8px;margin-top:11px}.g-history-row{display:flex;justify-content:space-between;gap:10px;align-items:center;border:1px solid var(--gborder);border-radius:12px;padding:10px}.g-history-main{display:flex;gap:9px;align-items:center;min-width:0}.g-history-emoji{font-size:1.2rem}.g-history-main strong{font-size:.78rem}.g-history-main div div{font-size:.62rem;color:var(--gmuted);margin-top:2px}.g-history-actions{flex:0 0 auto}.g-empty-history{text-align:center;color:var(--gmuted);font-size:.72rem;padding:24px}.theme-dark .g-days.soon,.theme-dark .g-warning,.theme-dark .g-sync-note{background:#2e2110;color:#ffcf80;border-color:#644720}
      @media(max-width:760px){.g-shell{padding:8px 10px 9px}.g-heading small{max-width:230px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.g-top-actions button:first-child{display:none}.g-grid{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;gap:8px;padding-bottom:3px}.g-card,.g-empty-card{flex:0 0 min(82vw,330px);scroll-snap-align:start}.g-form-grid{grid-template-columns:1fr}.g-modal-back{align-items:flex-end;padding:0}.g-modal{border-radius:20px 20px 0 0;max-height:90vh;padding-bottom:calc(18px + env(safe-area-inset-bottom))}.g-history-row{align-items:flex-start;flex-direction:column}.g-history-actions{width:100%}.g-history-actions button{width:100%}.g-nudge{display:none}}
      @media(max-width:430px){.g-target{width:28px;height:28px}.g-heading b{font-size:.66rem}.g-heading small{font-size:.6rem;max-width:190px}.g-top-actions .g-add{padding:7px 9px}.g-card,.g-empty-card{flex-basis:86vw}}
    `}</style>
  </div>;
}
