import { useCallback, useEffect, useMemo, useState } from "react";

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
function writeLocal(key, value) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
function goalProgress(goal) {
  const items = Array.isArray(goal?.milestones) ? goal.milestones : [];
  if (!items.length) return 0;
  return Math.round(items.filter(m => m.done).length / items.length * 100);
}
function milestonesDone(goal) {
  const items = Array.isArray(goal?.milestones) ? goal.milestones : [];
  return items.length > 0 && items.every(m => m.done);
}
function daysLeft(deadline) {
  if (!deadline) return null;
  const a = new Date(localIso() + "T12:00:00");
  const b = new Date(deadline + "T12:00:00");
  return Math.ceil((b - a) / 86400000);
}
function weekBounds() {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  const e = new Date(d); e.setDate(e.getDate() + 6);
  return [localIso(d), localIso(e)];
}
function freshMilestone(i = 0) {
  return { id: `m-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`, text: "", done: false };
}
function blankGoal(seed = {}) {
  return {
    title: seed.title || "",
    emoji: seed.emoji || "🎯",
    deadline: seed.deadline || plusDaysIso(90),
    weeklyOutcome: seed.weeklyOutcome || "",
    milestones: Array.isArray(seed.milestones) && seed.milestones.length ? seed.milestones.map(m => ({ ...m })) : [freshMilestone(0), freshMilestone(1), freshMilestone(2)],
    status: seed.status || "active",
    ...seed,
  };
}
function fmtDate(iso) {
  if (!iso) return "No deadline";
  try { return new Date(iso + "T12:00:00").toLocaleDateString("vi-VN", { day: "numeric", month: "short" }); } catch { return iso; }
}

function GoalRing({ value, size = 28 }) {
  const r = 9.5;
  const c = 2 * Math.PI * r;
  const off = c - (Math.max(0, Math.min(100, value)) / 100) * c;
  return <span className="wp-goal-ring" style={{ width: size, height: size }} aria-label={`${value}%`}>
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle className="track" cx="12" cy="12" r={r}/>
      <circle className="value" cx="12" cy="12" r={r} strokeDasharray={c} strokeDashoffset={off}/>
    </svg>
    <b>{value}</b>
  </span>;
}

function GoalEditor({ initial, activeCount, onClose, onSave, existingGoals = [] }) {
  const editing = !!initial?.id;
  const [mode, setMode] = useState(editing ? "manual" : "ai");
  const [draft, setDraft] = useState(() => blankGoal(initial || {}));
  const [prompt, setPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [generated, setGenerated] = useState(false);

  const patchDraft = patch => setDraft(g => ({ ...g, ...patch }));
  const patchMilestone = (id, patch) => setDraft(g => ({ ...g, milestones: g.milestones.map(m => m.id === id ? { ...m, ...patch } : m) }));
  const addMilestone = () => setDraft(g => g.milestones.length >= 5 ? g : ({ ...g, milestones: [...g.milestones, freshMilestone(g.milestones.length)] }));
  const removeMilestone = id => setDraft(g => ({ ...g, milestones: g.milestones.filter(m => m.id !== id) }));

  const cleanMilestones = draft.milestones.filter(m => String(m.text || "").trim());
  const canSave = !!draft.title.trim() && !!draft.deadline && cleanMilestones.length > 0 && (editing || activeCount < ACTIVE_LIMIT);

  const generate = async () => {
    if (!prompt.trim() || aiBusy) return;
    setAiBusy(true); setError("");
    try {
      const r = await fetch("/api/goals-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), activeGoals: existingGoals.filter(g => g.status === "active").map(g => ({ title: g.title, deadline: g.deadline })) }),
      });
      const data = await r.json();
      if (!r.ok || !data?.goal) throw new Error(data?.error || "AI chưa tạo được goal");
      setDraft(blankGoal(data.goal));
      setGenerated(true);
      setMode("manual");
    } catch (e) {
      setError(e.message || "AI đang trục trặc, thử lại giúp mình nhé.");
    } finally { setAiBusy(false); }
  };

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true); setError("");
    const payload = {
      ...draft,
      title: draft.title.trim(),
      emoji: (draft.emoji || "🎯").trim() || "🎯",
      weeklyOutcome: draft.weeklyOutcome.trim(),
      milestones: cleanMilestones.map(m => ({ ...m, text: m.text.trim() })),
    };
    const ok = await onSave(payload);
    if (!ok) { setError("Chưa lưu được goal. Thử lại giúp mình nhé."); setSaving(false); }
  };

  return <div className="wp-goal-backdrop" onMouseDown={e => e.currentTarget === e.target && onClose()}>
    <section className="wp-goal-sheet wp-goal-editor" role="dialog" aria-modal="true" aria-label={editing ? "Edit goal" : "Create goal"}>
      <header className="wp-goal-sheet-head">
        <div>
          <span className="wp-goal-eyebrow">{editing ? "EDIT GOAL" : "NEW 90-DAY GOAL"}</span>
          <h2>{editing ? "Giữ mục tiêu rõ và có thể hành động" : "Biến ý định thành một hướng đi rõ ràng"}</h2>
        </div>
        <button className="wp-goal-round-btn" onClick={onClose} aria-label="Đóng">×</button>
      </header>

      {!editing && <div className="wp-goal-mode-tabs" role="tablist">
        <button className={mode === "ai" ? "on" : ""} onClick={() => setMode("ai")}>✨ Build with AI</button>
        <button className={mode === "manual" ? "on" : ""} onClick={() => setMode("manual")}>Manual</button>
      </div>}

      {mode === "ai" && !editing ? <div className="wp-goal-ai-pane">
        <div className="wp-goal-ai-orb"><span>✦</span></div>
        <div className="wp-goal-ai-copy">
          <h3>Nói điều bạn muốn đạt được, tự nhiên như đang nhắn tin.</h3>
          <p>AI sẽ biến nó thành một goal 90 ngày với deadline, 3–5 milestones và một outcome cụ thể cho tuần này. Bạn vẫn review trước khi lưu.</p>
        </div>
        <div className="wp-goal-prompt-wrap">
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") generate(); }} placeholder="Ví dụ: Trong 3 tháng tới mình muốn học lái và đăng ký thi bằng C1, mình chưa chọn trường..." rows={4}/>
          <div className="wp-goal-prompt-foot"><span>⌘/Ctrl + Enter để tạo</span><button className="wp-goal-ai-btn" disabled={!prompt.trim() || aiBusy} onClick={generate}>{aiBusy ? <><i className="wp-goal-spinner"/> Đang nghĩ…</> : <>✦ Build my goal</>}</button></div>
        </div>
        <div className="wp-goal-examples">
          <span>Thử nhanh:</span>
          {["Làm portfolio Technical Artist đủ mạnh để apply", "Học lái và lấy bằng C1", "Hoàn thành prototype Arcadia có thể chơi được"].map(x => <button key={x} onClick={() => setPrompt(x)}>{x}</button>)}
        </div>
      </div> : <div className="wp-goal-form">
        {generated && <div className="wp-goal-generated"><span>✦</span><div><b>AI đã dựng khung goal cho bạn.</b><small>Đọc lại và chỉnh bất kỳ chỗ nào trước khi lưu.</small></div><button onClick={() => { setMode("ai"); setGenerated(false); }}>Làm lại</button></div>}

        <div className="wp-goal-form-row wp-goal-title-fields">
          <label className="wp-goal-field wp-goal-emoji-field"><span>Icon</span><input value={draft.emoji} onChange={e => patchDraft({ emoji: e.target.value })} maxLength={4}/></label>
          <label className="wp-goal-field"><span>Goal</span><input autoFocus={!editing && !generated} value={draft.title} onChange={e => patchDraft({ title: e.target.value })} placeholder="Một kết quả đủ rõ để biết khi nào đạt được" maxLength={150}/></label>
          <label className="wp-goal-field wp-goal-deadline-field"><span>Deadline</span><input type="date" value={draft.deadline} onChange={e => patchDraft({ deadline: e.target.value })}/></label>
        </div>

        <label className="wp-goal-field wp-goal-week-field"><span>This week · một kết quả thôi</span><input value={draft.weeklyOutcome} onChange={e => patchDraft({ weeklyOutcome: e.target.value })} placeholder="Ví dụ: Chọn trường và gửi hồ sơ đăng ký" maxLength={180}/></label>

        <div className="wp-goal-milestones-block">
          <div className="wp-goal-section-title"><div><span>MILESTONES</span><small>Progress của goal được tính từ đây, không phải số task.</small></div>{draft.milestones.length < 5 && <button onClick={addMilestone}>＋ Add milestone</button>}</div>
          <div className="wp-goal-milestone-list">
            {draft.milestones.map((m, i) => <div className="wp-goal-milestone-edit" key={m.id}>
              <button className={`wp-goal-mini-check ${m.done ? "done" : ""}`} onClick={() => patchMilestone(m.id, { done: !m.done })} aria-label="Toggle milestone">{m.done ? "✓" : i + 1}</button>
              <input value={m.text} onChange={e => patchMilestone(m.id, { text: e.target.value })} placeholder={i === 0 ? "Bước đầu tiên rõ ràng" : `Milestone ${i + 1}`} maxLength={160}/>
              {draft.milestones.length > 1 && <button className="wp-goal-remove" onClick={() => removeMilestone(m.id)} aria-label="Xóa milestone">×</button>}
            </div>)}
          </div>
        </div>

        <div className="wp-goal-preview-line">
          <GoalRing value={goalProgress(draft)} size={34}/><div><b>{draft.title || "Your 90-day goal"}</b><span>{fmtDate(draft.deadline)} · {cleanMilestones.length} milestones</span></div>
        </div>
      </div>}

      {activeCount >= ACTIVE_LIMIT && !editing && <div className="wp-goal-inline-warning">Bạn đã có đủ 3 active goals. Archive một goal trước để mở slot mới.</div>}
      {error && <div className="wp-goal-inline-warning">{error}</div>}

      {(mode === "manual" || editing) && <footer className="wp-goal-sheet-actions">
        {!editing && <button className="wp-goal-ghost" onClick={() => setMode("ai")}>← AI</button>}
        <div className="spacer"/>
        <button className="wp-goal-ghost" onClick={onClose}>Cancel</button>
        <button className="wp-goal-primary" disabled={!canSave || saving} onClick={save}>{saving ? "Saving…" : editing ? "Save changes" : "Create goal"}</button>
      </footer>}
    </section>
  </div>;
}

function GoalManager({ goals, tasks, links, onClose, onEdit, onCreate, onPatch, toast }) {
  const [view, setView] = useState("active");
  const [historyFilter, setHistoryFilter] = useState("achieved");
  const active = goals.filter(g => g.status === "active").slice(0, ACTIVE_LIMIT);
  const [weekStart, weekEnd] = weekBounds();

  const linkedThisWeek = goal => tasks.filter(t => {
    const gid = t.goalId || links[t.id];
    return gid === goal.uid && t.date && t.date >= weekStart && t.date <= weekEnd;
  });

  const history = goals.filter(g => g.status !== "active").filter(g => historyFilter === "all" || g.status === historyFilter)
    .sort((a, b) => String(b.achievedAt || b.archivedAt || b.updatedAt || "").localeCompare(String(a.achievedAt || a.archivedAt || a.updatedAt || "")));

  const archive = async g => { const ok = await onPatch(g, { status: "archived", archivedAt: localIso() }); if (ok) toast("Goal đã được archive"); };
  const achieve = async g => {
    if (!milestonesDone(g)) { toast("Hoàn thành milestones trước khi đánh dấu achieved"); return; }
    const ok = await onPatch(g, { status: "achieved", achievedAt: localIso() }); if (ok) toast("Goal achieved ✨");
  };
  const restore = async g => {
    if (active.length >= ACTIVE_LIMIT) { toast("Bạn đang có đủ 3 active goals"); return; }
    const ok = await onPatch(g, { status: "active", archivedAt: null }); if (ok) toast("Goal đã trở lại Active");
  };

  return <div className="wp-goal-backdrop" onMouseDown={e => e.currentTarget === e.target && onClose()}>
    <section className="wp-goal-sheet wp-goal-manager" role="dialog" aria-modal="true" aria-label="90 day goals">
      <header className="wp-goal-sheet-head wp-goal-manager-head">
        <div>
          <span className="wp-goal-eyebrow">90-DAY FOCUS</span>
          <h2>{view === "active" ? "Ba hướng đi. Một tuần để tiến lên." : "Những chặng đường đã đi qua"}</h2>
        </div>
        <div className="wp-goal-head-actions">
          <button className={`wp-goal-history-btn ${view === "history" ? "on" : ""}`} onClick={() => setView(view === "history" ? "active" : "history")}>{view === "history" ? "← Active" : "↺ History"}</button>
          {view === "active" && <button className="wp-goal-ai-add" disabled={active.length >= ACTIVE_LIMIT} onClick={onCreate}>✦ New goal</button>}
          <button className="wp-goal-round-btn" onClick={onClose} aria-label="Đóng">×</button>
        </div>
      </header>

      {view === "active" ? <div className="wp-goal-manager-body">
        <div className="wp-goal-manager-grid">
          {active.map((g, idx) => {
            const pct = goalProgress(g), left = daysLeft(g.deadline), linked = linkedThisWeek(g);
            return <article className={`wp-goal-full-card ${linked.length ? "moving" : "idle"}`} key={g.id} style={{ "--delay": `${idx * 55}ms` }}>
              <div className="wp-goal-card-top"><span className="wp-goal-card-num">0{idx + 1}</span><span className="wp-goal-card-icon">{g.emoji || "🎯"}</span><span className={`wp-goal-deadline-chip ${left != null && left <= 14 ? "soon" : ""}`}>{left == null ? "No deadline" : left < 0 ? `${Math.abs(left)}d overdue` : left === 0 ? "Due today" : `${left}d left`}</span></div>
              <h3>{g.title}</h3>
              <div className="wp-goal-card-progress"><div><i style={{ width: `${pct}%` }}/></div><b>{pct}%</b></div>

              <div className="wp-goal-week-box"><span>THIS WEEK</span><strong>{g.weeklyOutcome || "Chưa chọn outcome tuần này"}</strong></div>

              <div className="wp-goal-card-meta"><span><i className={linked.length ? "live" : ""}/>{linked.length ? `${linked.length} linked task${linked.length > 1 ? "s" : ""}` : "No linked task this week"}</span><span>{g.milestones?.filter(m => m.done).length || 0}/{g.milestones?.length || 0} milestones</span></div>

              <div className="wp-goal-card-milestones">
                {(g.milestones || []).map(m => <button key={m.id} className={m.done ? "done" : ""} onClick={() => onPatch(g, { milestones: g.milestones.map(x => x.id === m.id ? { ...x, done: !x.done } : x) })}><span>{m.done ? "✓" : ""}</span><em>{m.text}</em></button>)}
              </div>

              {!!linked.length && <div className="wp-goal-linked-mini">{linked.slice(0, 2).map(t => <div key={t.id} className={t.done ? "done" : ""}><span>{t.done ? "✓" : "→"}</span>{t.name}</div>)}{linked.length > 2 && <small>+{linked.length - 2} task khác</small>}</div>}

              <footer className="wp-goal-card-actions"><button onClick={() => onEdit(g)}>Edit</button><button onClick={() => archive(g)}>Archive</button><button className="achieve" disabled={!milestonesDone(g)} onClick={() => achieve(g)}>✓ Achieved</button></footer>
            </article>;
          })}

          {Array.from({ length: ACTIVE_LIMIT - active.length }).map((_, i) => <button className="wp-goal-empty-slot" key={`empty-${i}`} onClick={onCreate} style={{ "--delay": `${(active.length + i) * 55}ms` }}><span>✦</span><b>Open focus slot</b><small>Chọn một kết quả đáng để dành 90 ngày theo đuổi.</small></button>)}
        </div>

        {!!active.length && <div className="wp-goal-momentum-bar"><div className="wp-goal-momentum-copy"><span className="pulse"/><div><b>{active.filter(g => linkedThisWeek(g).length).length}/{active.length} goals có momentum tuần này</b><small>{active.some(g => !linkedThisWeek(g).length) ? "Goal đứng yên không cần thêm áp lực — chỉ cần một task nhỏ, rõ ràng." : "Cả ba hướng đi đều đang có hành động cụ thể. Giữ nhịp này."}</small></div></div><div className="wp-goal-momentum-dots">{active.map(g => <i key={g.id} className={linkedThisWeek(g).length ? "on" : ""}/>)}</div></div>}
      </div> : <div className="wp-goal-history-pane">
        <div className="wp-goal-filter-tabs">{[["achieved", "✓ Achieved"], ["archived", "Archived"], ["all", "All"]].map(([k, label]) => <button key={k} className={historyFilter === k ? "on" : ""} onClick={() => setHistoryFilter(k)}>{label}</button>)}</div>
        <div className="wp-goal-history-list">
          {!history.length && <div className="wp-goal-history-empty"><span>◌</span><b>Chưa có goal nào ở đây.</b><small>Khi bạn finish hoặc archive một goal, lịch sử của nó sẽ nằm đây.</small></div>}
          {history.map(g => <div className="wp-goal-history-row" key={g.id}>
            <div className="wp-goal-history-icon">{g.emoji || "🎯"}</div>
            <div className="wp-goal-history-copy"><b>{g.title}</b><span>{g.status === "achieved" ? `Achieved · ${fmtDate(g.achievedAt)}` : `Archived · ${fmtDate(g.archivedAt)}`} · {g.milestones?.filter(m => m.done).length || 0}/{g.milestones?.length || 0} milestones</span></div>
            <GoalRing value={goalProgress(g)} size={32}/>
            <div className="wp-goal-history-actions">{g.status === "archived" ? <button disabled={active.length >= ACTIVE_LIMIT} onClick={() => restore(g)}>↩ Restore</button> : <button onClick={() => onCreate(g)}>＋ Follow-up</button>}</div>
          </div>)}
        </div>
      </div>}
    </section>
  </div>;
}

export default function GoalsPanel() {
  const [goals, setGoals] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [links, setLinks] = useState({});
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState("light");
  const [managerOpen, setManagerOpen] = useState(false);
  const [editor, setEditor] = useState(null);
  const [toastText, setToastText] = useState("");
  const [syncError, setSyncError] = useState(false);

  const active = useMemo(() => goals.filter(g => g.status === "active").slice(0, ACTIVE_LIMIT), [goals]);
  const [weekStart, weekEnd] = weekBounds();

  const tasksForGoal = useCallback((goal) => tasks.filter(t => {
    const gid = t.goalId || links[t.id];
    return gid === goal.uid && t.date && t.date >= weekStart && t.date <= weekEnd;
  }), [tasks, links, weekStart, weekEnd]);

  const toast = useCallback(text => {
    setToastText(text);
    window.clearTimeout(window.__wpGoalToast);
    window.__wpGoalToast = window.setTimeout(() => setToastText(""), 2200);
  }, []);

  const hydrateGoals = useCallback(list => {
    const next = Array.isArray(list) ? list : [];
    setGoals(next); writeLocal(CACHE_KEY, next);
  }, []);

  const loadGoals = useCallback(async () => {
    try {
      const r = await fetch("/api/goals", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "load failed");
      hydrateGoals(d.goals); setSyncError(false);
    } catch {
      hydrateGoals(readLocal(CACHE_KEY, [])); setSyncError(true);
    } finally { setLoading(false); }
  }, [hydrateGoals]);

  useEffect(() => {
    const savedTheme = readLocal("dat-theme", null) || (typeof window !== "undefined" ? localStorage.getItem("dat-theme") : null);
    if (["light", "dark", "cozy", "cutie", "nature"].includes(savedTheme)) setTheme(savedTheme);
    setTasks(readLocal(TASKS_KEY, []));
    setLinks(readLocal(LINKS_KEY, {}));
    loadGoals();
    const onTasks = e => setTasks(e.detail?.tasks || readLocal(TASKS_KEY, []));
    const onLinks = () => setLinks(readLocal(LINKS_KEY, {}));
    window.addEventListener("wp-tasks-updated", onTasks);
    window.addEventListener("wp-goal-links-changed", onLinks);
    return () => { window.removeEventListener("wp-tasks-updated", onTasks); window.removeEventListener("wp-goal-links-changed", onLinks); };
  }, [loadGoals]);

  useEffect(() => {
    let observer;
    const sync = () => {
      const el = document.querySelector(".app-wrap");
      if (!el) return;
      const cls = [...el.classList].find(c => c.startsWith("theme-"));
      if (cls) setTheme(cls.replace("theme-", ""));
      if (!observer) { observer = new MutationObserver(sync); observer.observe(el, { attributes: true, attributeFilter: ["class"] }); }
    };
    const timer = setTimeout(sync, 0);
    return () => { clearTimeout(timer); observer?.disconnect(); };
  }, []);

  const saveGoal = async goal => {
    try {
      const editing = !!goal.id;
      const r = await fetch("/api/goals", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { id: goal.id, goal } : goal),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "save failed");
      hydrateGoals(d.goals); setSyncError(false); setEditor(null); toast(editing ? "Goal updated" : "Goal created ✨"); return true;
    } catch { setSyncError(true); return false; }
  };

  const patchGoal = async (goal, patch) => saveGoal({ ...goal, ...patch, updatedAt: new Date().toISOString() });

  const openCreate = seed => {
    if (!seed?.id && active.length >= ACTIVE_LIMIT) { toast("Bạn đang có đủ 3 active goals"); return; }
    if (seed?.status === "achieved") {
      setEditor(blankGoal({ title: `${seed.title} · next`, emoji: seed.emoji, deadline: plusDaysIso(90), weeklyOutcome: "", milestones: [freshMilestone(0), freshMilestone(1), freshMilestone(2)] }));
      return;
    }
    setEditor(seed?.id ? seed : blankGoal(seed || {}));
  };

  const moving = active.filter(g => tasksForGoal(g).length > 0).length;

  return <div className={`wp-goals-root theme-${theme}`}>
    <div className="wp-goal-rail-wrap">
      <button className="wp-goal-rail" onClick={() => setManagerOpen(true)} aria-label="Mở 90-day goals">
        <span className="wp-goal-rail-brand"><span className="wp-goal-brand-mark">◎</span><span><b>90 DAYS</b><small>{loading ? "Loading focus…" : active.length ? `${moving}/${active.length} moving this week` : "Choose your next three outcomes"}</small></span></span>
        <span className="wp-goal-rail-chips">
          {active.map(g => <span className="wp-goal-mini-chip" key={g.id}><GoalRing value={goalProgress(g)} size={27}/><span className="emoji">{g.emoji || "🎯"}</span><span className="copy"><b>{g.title}</b><small>{g.weeklyOutcome || `${daysLeft(g.deadline) ?? "–"} days left`}</small></span></span>)}
          {Array.from({ length: ACTIVE_LIMIT - active.length }).map((_, i) => <span className="wp-goal-mini-empty" key={i}>＋</span>)}
        </span>
        <span className="wp-goal-rail-open">Manage <i>›</i></span>
      </button>
      {syncError && <span className="wp-goal-sync-dot" title="Goal sync đang dùng cache local"/>}
    </div>

    {managerOpen && <GoalManager goals={goals} tasks={tasks} links={links} onClose={() => setManagerOpen(false)} onEdit={g => setEditor(g)} onCreate={seed => openCreate(seed)} onPatch={patchGoal} toast={toast}/>} 
    {editor && <GoalEditor initial={editor?.id ? editor : null} activeCount={active.length} existingGoals={goals} onClose={() => setEditor(null)} onSave={saveGoal}/>} 
    {toastText && <div className="wp-goal-toast"><span>✦</span>{toastText}</div>}

    <style jsx global>{`
      .wp-goals-root{--gg-bg:#fdf8f2;--gg-surface:#fffdf9;--gg-surface2:#f7ede6;--gg-ink:#4a3030;--gg-muted:#8a6a6a;--gg-muted2:#b89494;--gg-border:#e7c7bc;--gg-accent:#7a4a4a;--gg-accent2:#c9a84c;--gg-positive:#4d9364;position:relative;z-index:120;font-family:'Nunito',system-ui,sans-serif;color:var(--gg-ink);background:var(--gg-bg);isolation:isolate}
      .wp-goals-root.theme-dark{--gg-bg:#04080a;--gg-surface:#0b1512;--gg-surface2:#0d241b;--gg-ink:#d6ffe9;--gg-muted:#5fae8c;--gg-muted2:#3a7a60;--gg-border:#11402f;--gg-accent:#00ff9c;--gg-accent2:#00d0ff;--gg-positive:#00d88a}
      .wp-goals-root.theme-cozy{--gg-bg:#f9efe2;--gg-surface:#fffaf2;--gg-surface2:#f2dfca;--gg-ink:#5d3b26;--gg-muted:#91694d;--gg-muted2:#ba9272;--gg-border:#d9b58f;--gg-accent:#a05c2c;--gg-accent2:#d98e4a;--gg-positive:#608a56}
      .wp-goals-root.theme-cutie{--gg-bg:#fdf6ee;--gg-surface:#fffafd;--gg-surface2:#f6e8f1;--gg-ink:#594d69;--gg-muted:#8d7d9b;--gg-muted2:#b6a2b8;--gg-border:#ead4df;--gg-accent:#5b8fd1;--gg-accent2:#e89bb8;--gg-positive:#5d9b72}
      .wp-goals-root.theme-nature{--gg-bg:#f2f5e6;--gg-surface:#fbfdf4;--gg-surface2:#e7edd8;--gg-ink:#40523a;--gg-muted:#718267;--gg-muted2:#9eaa92;--gg-border:#cdd9b8;--gg-accent:#6f9e57;--gg-accent2:#a7c47f;--gg-positive:#4d8c59}

      .wp-goal-rail-wrap{max-width:1700px;margin:0 auto;padding:8px 16px 7px;position:relative}.wp-goal-rail{width:100%;min-height:48px;border:1px solid color-mix(in srgb,var(--gg-border) 82%,transparent);border-radius:15px;background:color-mix(in srgb,var(--gg-surface) 92%,transparent);box-shadow:0 5px 20px color-mix(in srgb,var(--gg-ink) 5%,transparent);backdrop-filter:blur(12px);display:flex;align-items:center;gap:12px;padding:6px 8px 6px 10px;color:var(--gg-ink);cursor:pointer;text-align:left;overflow:hidden;transition:transform .22s cubic-bezier(.2,.9,.3,1),border-color .2s ease,box-shadow .2s ease}.wp-goal-rail:hover{transform:translateY(-1px);border-color:color-mix(in srgb,var(--gg-accent) 34%,var(--gg-border));box-shadow:0 8px 24px color-mix(in srgb,var(--gg-ink) 8%,transparent)}.wp-goal-rail-brand{display:flex;align-items:center;gap:8px;flex:0 0 auto;min-width:126px}.wp-goal-brand-mark{width:30px;height:30px;border:1.5px solid color-mix(in srgb,var(--gg-accent) 70%,var(--gg-border));border-radius:50%;display:grid;place-items:center;color:var(--gg-accent);font-size:1.05rem;box-shadow:inset 0 0 0 4px color-mix(in srgb,var(--gg-accent) 5%,transparent)}.wp-goal-rail-brand b{display:block;font-size:.62rem;letter-spacing:.14em}.wp-goal-rail-brand small{display:block;margin-top:1px;font-size:.57rem;color:var(--gg-muted);white-space:nowrap}.wp-goal-rail-chips{display:flex;align-items:center;gap:6px;min-width:0;flex:1;overflow:hidden}.wp-goal-mini-chip{height:34px;min-width:0;flex:1 1 0;max-width:310px;border:1px solid color-mix(in srgb,var(--gg-border) 78%,transparent);border-radius:11px;background:color-mix(in srgb,var(--gg-surface2) 45%,var(--gg-surface));display:flex;align-items:center;gap:6px;padding:3px 8px 3px 4px;overflow:hidden;transition:background .2s ease,border-color .2s ease}.wp-goal-rail:hover .wp-goal-mini-chip{border-color:color-mix(in srgb,var(--gg-accent) 19%,var(--gg-border))}.wp-goal-mini-chip .emoji{font-size:.9rem;flex:0 0 auto}.wp-goal-mini-chip .copy{min-width:0}.wp-goal-mini-chip .copy b,.wp-goal-mini-chip .copy small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wp-goal-mini-chip .copy b{font-size:.66rem;line-height:1.2}.wp-goal-mini-chip .copy small{font-size:.54rem;color:var(--gg-muted);margin-top:1px}.wp-goal-mini-empty{width:31px;height:31px;flex:0 0 31px;border:1px dashed var(--gg-border);border-radius:10px;display:grid;place-items:center;color:var(--gg-muted2);font-size:.84rem;background:color-mix(in srgb,var(--gg-surface2) 25%,transparent)}.wp-goal-rail-open{display:flex;align-items:center;gap:5px;flex:0 0 auto;color:var(--gg-muted);font-size:.61rem;font-weight:800;padding:0 6px}.wp-goal-rail-open i{font-size:1rem;font-style:normal;transition:transform .2s ease}.wp-goal-rail:hover .wp-goal-rail-open i{transform:translateX(3px)}.wp-goal-sync-dot{position:absolute;right:20px;bottom:4px;width:6px;height:6px;border-radius:50%;background:#d98e4a;box-shadow:0 0 0 3px color-mix(in srgb,#d98e4a 18%,transparent)}

      .wp-goal-ring{position:relative;display:inline-grid;place-items:center;flex:0 0 auto}.wp-goal-ring svg{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg)}.wp-goal-ring circle{fill:none;stroke-width:2.3}.wp-goal-ring .track{stroke:color-mix(in srgb,var(--gg-border) 70%,transparent)}.wp-goal-ring .value{stroke:var(--gg-accent);stroke-linecap:round;transition:stroke-dashoffset .65s cubic-bezier(.2,.9,.3,1)}.wp-goal-ring b{font-size:.46rem;color:var(--gg-muted);font-weight:900}

      .wp-goal-backdrop{position:fixed;inset:0;z-index:8000;background:rgba(19,14,15,.43);backdrop-filter:blur(7px);display:flex;align-items:center;justify-content:center;padding:24px;animation:wpGoalBackdrop .22s ease both}.theme-dark .wp-goal-backdrop{background:rgba(0,0,0,.68)}.wp-goal-sheet{width:min(1040px,100%);max-height:min(790px,88vh);overflow:auto;overscroll-behavior:contain;background:var(--gg-surface);border:1px solid color-mix(in srgb,var(--gg-border) 88%,transparent);border-radius:24px;box-shadow:0 30px 90px rgba(20,12,15,.26);color:var(--gg-ink);animation:wpGoalSheetIn .36s cubic-bezier(.16,1,.3,1) both;scrollbar-width:thin}.theme-dark .wp-goal-sheet{box-shadow:0 0 0 1px rgba(0,255,156,.12),0 30px 90px rgba(0,0,0,.62)}.wp-goal-sheet-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:20px 22px 14px;border-bottom:1px solid color-mix(in srgb,var(--gg-border) 68%,transparent);position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--gg-surface) 94%,transparent);backdrop-filter:blur(16px)}.wp-goal-eyebrow{display:block;font-size:.58rem;font-weight:900;letter-spacing:.16em;color:var(--gg-accent);margin-bottom:3px}.wp-goal-sheet h2{font-family:'Cormorant Garamond',Georgia,serif;font-size:1.45rem;line-height:1.08;margin:0;font-weight:700;color:var(--gg-ink)}.wp-goal-round-btn{width:34px;height:34px;border:1px solid var(--gg-border);border-radius:50%;background:var(--gg-surface2);color:var(--gg-muted);font-size:1.05rem;cursor:pointer;display:grid;place-items:center;transition:transform .2s ease,background .2s ease}.wp-goal-round-btn:hover{transform:rotate(7deg) scale(1.05);background:color-mix(in srgb,var(--gg-accent) 8%,var(--gg-surface2))}.wp-goal-manager-head{align-items:center}.wp-goal-head-actions{display:flex;align-items:center;gap:7px}.wp-goal-history-btn,.wp-goal-ai-add{height:34px;border:1px solid var(--gg-border);border-radius:10px;background:var(--gg-surface);color:var(--gg-muted);padding:0 11px;font:800 .65rem 'Nunito',sans-serif;cursor:pointer}.wp-goal-history-btn.on{color:var(--gg-accent);border-color:color-mix(in srgb,var(--gg-accent) 40%,var(--gg-border));background:color-mix(in srgb,var(--gg-accent) 7%,var(--gg-surface))}.wp-goal-ai-add{background:var(--gg-accent);border-color:var(--gg-accent);color:#fff;box-shadow:0 6px 18px color-mix(in srgb,var(--gg-accent) 18%,transparent)}.theme-dark .wp-goal-ai-add,.theme-dark .wp-goal-primary,.theme-dark .wp-goal-ai-btn{color:#03140d}.wp-goal-ai-add:disabled{opacity:.35;cursor:not-allowed}

      .wp-goal-manager-body{padding:16px 18px 18px}.wp-goal-manager-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.wp-goal-full-card,.wp-goal-empty-slot{min-width:0;border:1px solid var(--gg-border);border-radius:17px;background:linear-gradient(180deg,color-mix(in srgb,var(--gg-surface) 96%,transparent),color-mix(in srgb,var(--gg-surface2) 20%,var(--gg-surface)));padding:14px;box-shadow:0 6px 22px color-mix(in srgb,var(--gg-ink) 5%,transparent);animation:wpGoalCardIn .45s cubic-bezier(.16,1,.3,1) both;animation-delay:var(--delay);transition:transform .23s cubic-bezier(.2,.9,.3,1),border-color .2s ease,box-shadow .2s ease}.wp-goal-full-card:hover{transform:translateY(-2px);border-color:color-mix(in srgb,var(--gg-accent) 31%,var(--gg-border));box-shadow:0 11px 28px color-mix(in srgb,var(--gg-ink) 8%,transparent)}.wp-goal-full-card.moving{box-shadow:inset 0 2px 0 color-mix(in srgb,var(--gg-positive) 48%,transparent),0 6px 22px color-mix(in srgb,var(--gg-ink) 5%,transparent)}.wp-goal-card-top{display:flex;align-items:center;gap:7px}.wp-goal-card-num{font-size:.56rem;font-weight:900;letter-spacing:.12em;color:var(--gg-muted2)}.wp-goal-card-icon{font-size:1.08rem}.wp-goal-deadline-chip{margin-left:auto;border-radius:999px;padding:4px 8px;background:var(--gg-surface2);color:var(--gg-muted);font-size:.57rem;font-weight:900}.wp-goal-deadline-chip.soon{background:#fff1d6;color:#aa5e11}.theme-dark .wp-goal-deadline-chip.soon{background:#2e2110;color:#ffce82}.wp-goal-full-card h3{font-family:'Cormorant Garamond',Georgia,serif;font-size:1.18rem;line-height:1.14;margin:10px 0 9px;min-height:2.28em}.wp-goal-card-progress{display:flex;align-items:center;gap:8px}.wp-goal-card-progress>div{height:6px;border-radius:999px;overflow:hidden;background:var(--gg-surface2);flex:1}.wp-goal-card-progress i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--gg-accent),var(--gg-accent2));animation:wpGoalProgress .65s cubic-bezier(.2,.9,.3,1) both;transform-origin:left}.wp-goal-card-progress b{font-size:.6rem;color:var(--gg-muted)}.wp-goal-week-box{margin-top:11px;background:color-mix(in srgb,var(--gg-surface2) 70%,var(--gg-surface));border:1px solid color-mix(in srgb,var(--gg-border) 60%,transparent);border-radius:11px;padding:9px 10px}.wp-goal-week-box span{display:block;font-size:.52rem;font-weight:900;letter-spacing:.12em;color:var(--gg-muted);margin-bottom:3px}.wp-goal-week-box strong{display:block;font-size:.7rem;line-height:1.35}.wp-goal-card-meta{display:flex;justify-content:space-between;gap:8px;margin:9px 1px 8px;color:var(--gg-muted);font-size:.55rem}.wp-goal-card-meta span{display:flex;align-items:center;gap:5px}.wp-goal-card-meta i{width:6px;height:6px;border-radius:50%;background:var(--gg-muted2)}.wp-goal-card-meta i.live{background:var(--gg-positive);box-shadow:0 0 0 3px color-mix(in srgb,var(--gg-positive) 13%,transparent);animation:wpGoalPulse 2s ease-in-out infinite}.wp-goal-card-milestones{display:grid;gap:4px}.wp-goal-card-milestones button{display:flex;align-items:flex-start;gap:7px;border:0;background:transparent;color:var(--gg-ink);text-align:left;padding:4px 3px;border-radius:7px;cursor:pointer;transition:background .15s ease,transform .15s ease}.wp-goal-card-milestones button:hover{background:color-mix(in srgb,var(--gg-accent) 6%,transparent);transform:translateX(2px)}.wp-goal-card-milestones button>span{width:15px;height:15px;flex:0 0 15px;border:1px solid var(--gg-border);border-radius:5px;display:grid;place-items:center;font-size:.52rem;color:#fff;margin-top:1px}.wp-goal-card-milestones button.done>span{background:var(--gg-positive);border-color:var(--gg-positive);animation:wpGoalCheck .25s cubic-bezier(.2,1.6,.4,1)}.wp-goal-card-milestones em{font-style:normal;font-size:.64rem;line-height:1.35}.wp-goal-card-milestones button.done em{text-decoration:line-through;color:var(--gg-muted)}.wp-goal-linked-mini{margin-top:8px;border-top:1px dashed var(--gg-border);padding-top:7px}.wp-goal-linked-mini>div{font-size:.59rem;color:var(--gg-muted);padding:2px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wp-goal-linked-mini>div span{margin-right:5px;color:var(--gg-accent)}.wp-goal-linked-mini>div.done{text-decoration:line-through;opacity:.6}.wp-goal-linked-mini small{display:block;font-size:.53rem;color:var(--gg-muted2);margin-top:2px}.wp-goal-card-actions{display:flex;gap:5px;margin-top:11px;padding-top:9px;border-top:1px solid color-mix(in srgb,var(--gg-border) 65%,transparent)}.wp-goal-card-actions button{border:1px solid var(--gg-border);background:var(--gg-surface);color:var(--gg-muted);border-radius:8px;padding:6px 8px;font:800 .58rem 'Nunito',sans-serif;cursor:pointer}.wp-goal-card-actions .achieve{margin-left:auto;color:var(--gg-positive);border-color:color-mix(in srgb,var(--gg-positive) 45%,var(--gg-border));background:color-mix(in srgb,var(--gg-positive) 6%,var(--gg-surface))}.wp-goal-card-actions button:disabled{opacity:.34;cursor:not-allowed}.wp-goal-empty-slot{min-height:300px;border-style:dashed;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:var(--gg-muted);cursor:pointer}.wp-goal-empty-slot>span{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;background:var(--gg-surface2);color:var(--gg-accent);font-size:1rem;margin-bottom:8px}.wp-goal-empty-slot b{font-size:.72rem;color:var(--gg-ink)}.wp-goal-empty-slot small{font-size:.59rem;line-height:1.45;max-width:190px;margin-top:4px}.wp-goal-empty-slot:hover{border-color:var(--gg-accent);transform:translateY(-2px)}.wp-goal-momentum-bar{margin-top:12px;border:1px solid color-mix(in srgb,var(--gg-accent2) 25%,var(--gg-border));background:color-mix(in srgb,var(--gg-accent2) 7%,var(--gg-surface));border-radius:12px;padding:9px 11px;display:flex;align-items:center;justify-content:space-between;gap:12px}.wp-goal-momentum-copy{display:flex;gap:8px;align-items:center}.wp-goal-momentum-copy .pulse{width:8px;height:8px;border-radius:50%;background:var(--gg-positive);box-shadow:0 0 0 4px color-mix(in srgb,var(--gg-positive) 12%,transparent)}.wp-goal-momentum-copy b,.wp-goal-momentum-copy small{display:block}.wp-goal-momentum-copy b{font-size:.64rem}.wp-goal-momentum-copy small{font-size:.56rem;color:var(--gg-muted);margin-top:1px}.wp-goal-momentum-dots{display:flex;gap:5px}.wp-goal-momentum-dots i{width:7px;height:7px;border-radius:50%;background:var(--gg-muted2)}.wp-goal-momentum-dots i.on{background:var(--gg-positive)}

      .wp-goal-history-pane{padding:15px 18px 18px}.wp-goal-filter-tabs{display:flex;gap:6px;margin-bottom:11px}.wp-goal-filter-tabs button{border:1px solid var(--gg-border);background:var(--gg-surface);color:var(--gg-muted);border-radius:999px;padding:6px 10px;font:800 .61rem 'Nunito',sans-serif;cursor:pointer}.wp-goal-filter-tabs button.on{border-color:color-mix(in srgb,var(--gg-accent) 45%,var(--gg-border));color:var(--gg-accent);background:color-mix(in srgb,var(--gg-accent) 7%,var(--gg-surface))}.wp-goal-history-list{display:grid;gap:7px}.wp-goal-history-row{display:grid;grid-template-columns:38px minmax(0,1fr) 34px auto;align-items:center;gap:9px;border:1px solid var(--gg-border);border-radius:12px;background:var(--gg-surface);padding:9px 10px;animation:wpGoalCardIn .35s ease both}.wp-goal-history-icon{width:34px;height:34px;border-radius:10px;background:var(--gg-surface2);display:grid;place-items:center}.wp-goal-history-copy{min-width:0}.wp-goal-history-copy b,.wp-goal-history-copy span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wp-goal-history-copy b{font-size:.7rem}.wp-goal-history-copy span{font-size:.57rem;color:var(--gg-muted);margin-top:2px}.wp-goal-history-actions button{border:1px solid var(--gg-border);background:var(--gg-surface);color:var(--gg-accent);border-radius:8px;padding:6px 9px;font:800 .59rem 'Nunito';cursor:pointer}.wp-goal-history-actions button:disabled{opacity:.35}.wp-goal-history-empty{padding:42px 20px;text-align:center;color:var(--gg-muted)}.wp-goal-history-empty>span{display:block;font-size:1.6rem;color:var(--gg-muted2)}.wp-goal-history-empty b,.wp-goal-history-empty small{display:block}.wp-goal-history-empty b{font-size:.72rem;color:var(--gg-ink);margin-top:5px}.wp-goal-history-empty small{font-size:.59rem;margin-top:3px}

      .wp-goal-editor{width:min(760px,100%)}.wp-goal-mode-tabs{display:flex;gap:4px;margin:14px 18px 0;padding:4px;background:var(--gg-surface2);border-radius:11px}.wp-goal-mode-tabs button{flex:1;border:0;border-radius:8px;background:transparent;color:var(--gg-muted);padding:8px;font:800 .66rem 'Nunito';cursor:pointer}.wp-goal-mode-tabs button.on{background:var(--gg-surface);color:var(--gg-accent);box-shadow:0 2px 8px color-mix(in srgb,var(--gg-ink) 7%,transparent)}.wp-goal-ai-pane{padding:24px 24px 18px;text-align:center}.wp-goal-ai-orb{width:52px;height:52px;border-radius:18px;margin:0 auto 12px;display:grid;place-items:center;background:radial-gradient(circle at 30% 25%,color-mix(in srgb,var(--gg-accent2) 55%,#fff),var(--gg-accent));box-shadow:0 13px 30px color-mix(in srgb,var(--gg-accent) 22%,transparent);animation:wpGoalFloat 3.2s ease-in-out infinite}.wp-goal-ai-orb span{color:white;font-size:1.15rem}.theme-dark .wp-goal-ai-orb span{color:#03140d}.wp-goal-ai-copy h3{font-family:'Cormorant Garamond',Georgia,serif;font-size:1.18rem;margin:0}.wp-goal-ai-copy p{max-width:560px;margin:5px auto 14px;color:var(--gg-muted);font-size:.65rem;line-height:1.5}.wp-goal-prompt-wrap{max-width:620px;margin:0 auto;border:1px solid color-mix(in srgb,var(--gg-accent) 24%,var(--gg-border));border-radius:15px;background:var(--gg-surface);padding:5px;box-shadow:0 9px 28px color-mix(in srgb,var(--gg-ink) 6%,transparent);transition:border-color .2s ease,box-shadow .2s ease}.wp-goal-prompt-wrap:focus-within{border-color:var(--gg-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--gg-accent) 8%,transparent),0 12px 30px color-mix(in srgb,var(--gg-ink) 7%,transparent)}.wp-goal-prompt-wrap textarea{display:block;width:100%;resize:vertical;min-height:96px;border:0;background:transparent;color:var(--gg-ink);outline:none;padding:10px 11px 7px;font:600 .76rem/1.5 'Nunito',sans-serif}.wp-goal-prompt-wrap textarea::placeholder{color:var(--gg-muted2)}.wp-goal-prompt-foot{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:4px 4px 4px 9px;border-top:1px solid color-mix(in srgb,var(--gg-border) 55%,transparent)}.wp-goal-prompt-foot>span{font-size:.53rem;color:var(--gg-muted2)}.wp-goal-ai-btn{border:0;border-radius:9px;background:linear-gradient(110deg,var(--gg-accent),color-mix(in srgb,var(--gg-accent) 70%,var(--gg-accent2)));color:white;padding:8px 12px;font:900 .64rem 'Nunito';cursor:pointer;box-shadow:0 6px 15px color-mix(in srgb,var(--gg-accent) 18%,transparent);position:relative;overflow:hidden}.wp-goal-ai-btn::after{content:"";position:absolute;inset:0;background:linear-gradient(110deg,transparent 25%,rgba(255,255,255,.28) 45%,transparent 65%);transform:translateX(-120%);animation:wpGoalShimmer 2.6s ease-in-out infinite}.wp-goal-ai-btn:disabled{opacity:.38;cursor:not-allowed}.wp-goal-examples{display:flex;justify-content:center;align-items:center;gap:5px;flex-wrap:wrap;margin-top:10px}.wp-goal-examples>span{font-size:.55rem;color:var(--gg-muted)}.wp-goal-examples button{border:1px solid var(--gg-border);background:var(--gg-surface);color:var(--gg-muted);border-radius:999px;padding:5px 8px;font:700 .55rem 'Nunito';cursor:pointer}.wp-goal-spinner{display:inline-block;width:10px;height:10px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:wpGoalSpin .75s linear infinite;vertical-align:-1px}

      .wp-goal-form{padding:16px 20px 8px}.wp-goal-generated{display:flex;align-items:center;gap:8px;border:1px solid color-mix(in srgb,var(--gg-positive) 33%,var(--gg-border));background:color-mix(in srgb,var(--gg-positive) 6%,var(--gg-surface));border-radius:11px;padding:8px 10px;margin-bottom:12px}.wp-goal-generated>span{color:var(--gg-positive)}.wp-goal-generated>div{flex:1;min-width:0}.wp-goal-generated b,.wp-goal-generated small{display:block}.wp-goal-generated b{font-size:.64rem}.wp-goal-generated small{font-size:.55rem;color:var(--gg-muted);margin-top:1px}.wp-goal-generated button{border:0;background:transparent;color:var(--gg-accent);font:800 .58rem 'Nunito';cursor:pointer}.wp-goal-form-row{display:grid;gap:8px}.wp-goal-title-fields{grid-template-columns:66px minmax(0,1fr) 150px}.wp-goal-field{display:block;min-width:0}.wp-goal-field>span{display:block;font-size:.55rem;font-weight:900;letter-spacing:.08em;color:var(--gg-muted);margin:0 0 5px 2px;text-transform:uppercase}.wp-goal-field input{width:100%;height:40px;border:1px solid var(--gg-border);border-radius:10px;background:var(--gg-surface);color:var(--gg-ink);outline:none;padding:0 10px;font:650 .72rem 'Nunito',sans-serif;transition:border-color .18s ease,box-shadow .18s ease}.wp-goal-field input:focus{border-color:var(--gg-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--gg-accent) 8%,transparent)}.wp-goal-emoji-field input{text-align:center;font-size:1rem;padding:0}.wp-goal-week-field{margin-top:10px}.wp-goal-milestones-block{margin-top:14px}.wp-goal-section-title{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:7px}.wp-goal-section-title span,.wp-goal-section-title small{display:block}.wp-goal-section-title span{font-size:.56rem;font-weight:900;letter-spacing:.11em;color:var(--gg-muted)}.wp-goal-section-title small{font-size:.53rem;color:var(--gg-muted2);margin-top:2px}.wp-goal-section-title button{border:0;background:transparent;color:var(--gg-accent);font:900 .58rem 'Nunito';cursor:pointer}.wp-goal-milestone-list{display:grid;gap:5px}.wp-goal-milestone-edit{display:grid;grid-template-columns:29px minmax(0,1fr) 28px;align-items:center;gap:5px}.wp-goal-mini-check{width:27px;height:27px;border:1px solid var(--gg-border);border-radius:8px;background:var(--gg-surface2);color:var(--gg-muted);font:900 .6rem 'Nunito';cursor:pointer}.wp-goal-mini-check.done{background:var(--gg-positive);border-color:var(--gg-positive);color:#fff;animation:wpGoalCheck .25s cubic-bezier(.2,1.6,.4,1)}.wp-goal-milestone-edit input{height:36px;border:1px solid var(--gg-border);border-radius:9px;background:var(--gg-surface);color:var(--gg-ink);padding:0 10px;outline:none;font:600 .68rem 'Nunito'}.wp-goal-milestone-edit input:focus{border-color:var(--gg-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--gg-accent) 7%,transparent)}.wp-goal-remove{border:0;background:transparent;color:var(--gg-muted2);font-size:1rem;cursor:pointer}.wp-goal-preview-line{display:flex;align-items:center;gap:9px;margin-top:14px;border-top:1px dashed var(--gg-border);padding-top:10px}.wp-goal-preview-line b,.wp-goal-preview-line span{display:block}.wp-goal-preview-line b{font-size:.66rem}.wp-goal-preview-line span{font-size:.55rem;color:var(--gg-muted);margin-top:1px}.wp-goal-inline-warning{margin:8px 20px 0;border:1px solid #edc995;background:#fff4df;color:#9e5b20;border-radius:9px;padding:7px 9px;font-size:.6rem}.theme-dark .wp-goal-inline-warning{background:#2e2110;color:#ffce82;border-color:#644720}.wp-goal-sheet-actions{display:flex;align-items:center;gap:7px;padding:12px 20px 16px;border-top:1px solid color-mix(in srgb,var(--gg-border) 65%,transparent);position:sticky;bottom:0;background:color-mix(in srgb,var(--gg-surface) 95%,transparent);backdrop-filter:blur(14px)}.wp-goal-sheet-actions .spacer{flex:1}.wp-goal-ghost,.wp-goal-primary{height:36px;border-radius:9px;padding:0 12px;font:900 .63rem 'Nunito';cursor:pointer}.wp-goal-ghost{border:1px solid var(--gg-border);background:var(--gg-surface);color:var(--gg-muted)}.wp-goal-primary{border:1px solid var(--gg-accent);background:var(--gg-accent);color:white;box-shadow:0 6px 16px color-mix(in srgb,var(--gg-accent) 18%,transparent)}.wp-goal-primary:disabled{opacity:.35;cursor:not-allowed}

      .wp-goal-toast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom));z-index:9000;transform:translateX(-50%);display:flex;align-items:center;gap:7px;border:1px solid color-mix(in srgb,var(--gg-accent) 28%,var(--gg-border));background:color-mix(in srgb,var(--gg-surface) 94%,transparent);backdrop-filter:blur(14px);color:var(--gg-ink);box-shadow:0 10px 32px rgba(0,0,0,.17);border-radius:999px;padding:9px 13px;font-size:.64rem;font-weight:800;animation:wpGoalToastIn .35s cubic-bezier(.16,1,.3,1) both}.wp-goal-toast span{color:var(--gg-accent2)}

      @keyframes wpGoalBackdrop{from{opacity:0}to{opacity:1}}@keyframes wpGoalSheetIn{from{opacity:0;transform:translateY(18px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}@keyframes wpGoalCardIn{from{opacity:0;transform:translateY(12px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}@keyframes wpGoalProgress{from{transform:scaleX(0)}to{transform:scaleX(1)}}@keyframes wpGoalPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(.75);opacity:.55}}@keyframes wpGoalCheck{0%{transform:scale(.7) rotate(-8deg)}70%{transform:scale(1.15)}100%{transform:scale(1)}}@keyframes wpGoalFloat{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-5px) rotate(2deg)}}@keyframes wpGoalShimmer{0%,55%{transform:translateX(-120%)}85%,100%{transform:translateX(120%)}}@keyframes wpGoalSpin{to{transform:rotate(360deg)}}@keyframes wpGoalToastIn{from{opacity:0;transform:translate(-50%,12px) scale(.96)}to{opacity:1;transform:translate(-50%,0) scale(1)}}

      @media(max-width:900px){.wp-goal-manager-grid{grid-template-columns:1fr}.wp-goal-full-card h3{min-height:0}.wp-goal-empty-slot{min-height:170px}.wp-goal-manager{width:min(660px,100%)}.wp-goal-mini-chip{min-width:180px;flex:0 0 180px}.wp-goal-rail-chips{overflow-x:auto;scrollbar-width:none}.wp-goal-rail-chips::-webkit-scrollbar{display:none}}
      @media(max-width:680px){.wp-goal-rail-wrap{padding:7px 9px 6px}.wp-goal-rail{min-height:44px;padding:5px 6px 5px 7px;border-radius:13px;gap:7px}.wp-goal-rail-brand{min-width:auto}.wp-goal-brand-mark{width:28px;height:28px}.wp-goal-rail-brand>span:last-child{display:none}.wp-goal-rail-open{display:none}.wp-goal-mini-chip{min-width:154px;flex-basis:154px;height:32px}.wp-goal-mini-chip .copy small{display:none}.wp-goal-mini-empty{width:29px;height:29px;flex-basis:29px}.wp-goal-backdrop{align-items:flex-end;padding:0}.wp-goal-sheet{width:100%;max-height:91vh;border-radius:22px 22px 0 0;border-bottom:0;animation:wpGoalSheetMobile .38s cubic-bezier(.16,1,.3,1) both;padding-bottom:env(safe-area-inset-bottom)}.wp-goal-sheet-head{padding:16px 15px 12px}.wp-goal-sheet h2{font-size:1.25rem}.wp-goal-manager-head{align-items:flex-start}.wp-goal-head-actions{gap:5px}.wp-goal-history-btn{display:none}.wp-goal-ai-add{padding:0 9px}.wp-goal-manager-body,.wp-goal-history-pane{padding:12px 11px 14px}.wp-goal-manager-grid{gap:9px}.wp-goal-momentum-copy small{display:none}.wp-goal-mode-tabs{margin:11px 12px 0}.wp-goal-ai-pane{padding:19px 13px 13px}.wp-goal-ai-copy p{font-size:.62rem}.wp-goal-examples{justify-content:flex-start;overflow-x:auto;flex-wrap:nowrap;padding-bottom:2px}.wp-goal-examples>span{display:none}.wp-goal-examples button{white-space:nowrap}.wp-goal-form{padding:13px 13px 7px}.wp-goal-title-fields{grid-template-columns:58px minmax(0,1fr)}.wp-goal-deadline-field{grid-column:1/-1}.wp-goal-section-title small{display:none}.wp-goal-sheet-actions{padding:10px 13px 12px}.wp-goal-inline-warning{margin:7px 13px 0}.wp-goal-history-row{grid-template-columns:34px minmax(0,1fr) auto}.wp-goal-history-row>.wp-goal-ring{display:none}.wp-goal-history-actions{grid-column:2/4}.wp-goal-history-actions button{width:100%}@keyframes wpGoalSheetMobile{from{opacity:.6;transform:translateY(100%)}to{opacity:1;transform:translateY(0)}}}
      @media(max-width:420px){.wp-goal-mini-chip{min-width:136px;flex-basis:136px}.wp-goal-mini-chip>.wp-goal-ring{display:none}.wp-goal-card-meta{font-size:.52rem}.wp-goal-card-actions button{padding:6px}.wp-goal-ai-orb{width:46px;height:46px}.wp-goal-prompt-foot>span{display:none}.wp-goal-prompt-foot{justify-content:flex-end}.wp-goal-sheet-head h2{font-size:1.15rem}}
      @media(prefers-reduced-motion:reduce){.wp-goal-rail,.wp-goal-full-card,.wp-goal-empty-slot,.wp-goal-sheet,.wp-goal-backdrop,.wp-goal-ring .value,.wp-goal-card-progress i,.wp-goal-card-meta i.live,.wp-goal-ai-orb,.wp-goal-ai-btn::after,.wp-goal-toast{animation:none!important;transition:none!important}}
    `}</style>
  </div>;
}
