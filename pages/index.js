import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Head from "next/head";

const DAYS = ["Chủ Nhật","Thứ Hai","Thứ Ba","Thứ Tư","Thứ Năm","Thứ Sáu","Thứ Bảy"];
const DAYS_SHORT = ["CN","T2","T3","T4","T5","T6","T7"];
const fmt = d => d.toLocaleDateString("vi-VN", { day: "numeric", month: "numeric" });
const iso = d => {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().split("T")[0];
};
const TODAY = iso(new Date());

// Monday of the week containing date d
function mondayOf(d) {
  const x = new Date(d);
  const dow = x.getDay();
  x.setDate(x.getDate() - (dow === 0 ? 6 : dow - 1));
  x.setHours(0,0,0,0);
  return x;
}

// Scripture rotates per ISO week — English primary, Vietnamese secondary
const VERSES = [
  { en: ["The Lord is my shepherd; I shall not want.","He makes me lie down in green pastures.","He leads me beside still waters."], vi:"Chúa là mục tử chăn dắt tôi, tôi chẳng thiếu thốn gì.", ref:"Psalm 23:1–2", refVi:"Thánh Vịnh 23" },
  { en: ["Commit your way to the Lord;","trust in him, and he will act."], vi:"Hãy phó thác đường đời cho Chúa, Người sẽ ra tay.", ref:"Psalm 37:5", refVi:"Thánh Vịnh 37:5" },
  { en: ["I can do all things","through Christ who strengthens me."], vi:"Tôi làm được mọi sự nhờ Đấng ban sức mạnh cho tôi.", ref:"Philippians 4:13", refVi:"Pl 4:13" },
  { en: ["Be still, and know","that I am God."], vi:"Hãy lặng yên và biết rằng Ta là Thiên Chúa.", ref:"Psalm 46:10", refVi:"Tv 46:10" },
  { en: ["Cast all your anxiety on him","because he cares for you."], vi:"Hãy trút mọi lo âu cho Người, vì Người chăm sóc bạn.", ref:"1 Peter 5:7", refVi:"1 Pr 5:7" },
];
function weekIndex(monday) {
  const start = new Date("2026-01-05"); // a Monday
  const diff = Math.round((monday - start) / (7*24*3600*1000));
  return ((diff % VERSES.length) + VERSES.length) % VERSES.length;
}

const SESSIONS = [
  { key: "🌅 Sáng",            label: "🌅 Buổi sáng",        match: s => s && s.includes("Sáng") },
  { key: "🏢 Office (11–7h)",  label: "🏢 Office · 11–7h",   match: s => s && s.includes("Office") },
  { key: "🌙 Tối",             label: "🌙 Buổi tối",         match: s => s && s.includes("Tối") },
];

function tagStyle(type = "") {
  const t = type.toLowerCase();
  if (t.includes("work"))          return { background: "#dbeafe", color: "#1d4ed8" };
  if (t.includes("personal"))      return { background: "#ede9fe", color: "#6d28d9" };
  if (t.includes("chore"))         return { background: "#fef9c3", color: "#854d0e" };
  if (t.includes("health"))        return { background: "#fce7f3", color: "#9d174d" };
  if (t.includes("entertainment")) return { background: "#dcfce7", color: "#166534" };
  if (t.includes("family"))        return { background: "#ffedd5", color: "#9a3412" };
  if (t.includes("vacation"))      return { background: "#fee2e2", color: "#991b1b" };
  return { background: "#e0f2fe", color: "#0369a1" };
}

const wine = "#7a4a4a", gold = "#c9a84c";

function Ring({ pct, label, sub, color, loading }) {
  const R = 26, C = 2 * Math.PI * R;
  const offset = loading ? C : C - (pct / 100) * C;
  return (
    <div className="card ring-card" style={{ padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ position: "relative", width: 62, height: 62, flexShrink: 0 }}>
        <svg width="62" height="62" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="31" cy="31" r={R} fill="none" stroke="#f5e6e0" strokeWidth="5.5" />
          <circle cx="31" cy="31" r={R} fill="none" stroke={color} strokeWidth="5.5"
            strokeLinecap="round" strokeDasharray={C} strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset .8s ease" }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.05rem", fontWeight: 600, color: wine }}>
            {loading ? "—" : pct + "%"}
          </span>
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: ".62rem", fontWeight: 700, letterSpacing: ".05em", color: "#8a6a6a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.25rem", fontWeight: 600, color: wine, lineHeight: 1.2 }}>
          {loading ? "—" : sub}
        </div>
        <div style={{ fontSize: ".58rem", color: "#c9a0a0" }}>hoàn thành</div>
      </div>
    </div>
  );
}

// Pleasant ascending sparkle chime via Web Audio (no external file)
let _audioCtx = null;
function playDing() {
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = _audioCtx;
    if (ctx.state === "suspended") ctx.resume();
    // C5, E5, G5, C6 — happy major arpeggio
    const notes = [523.25, 659.25, 783.99, 1046.5];
    const now = ctx.currentTime;
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const t = now + i * 0.08;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });
    // sparkle shimmer on top
    const shimmer = ctx.createOscillator();
    const sGain = ctx.createGain();
    shimmer.type = "sine";
    shimmer.frequency.setValueAtTime(1568, now + 0.25);
    shimmer.frequency.linearRampToValueAtTime(2093, now + 0.5);
    sGain.gain.setValueAtTime(0, now + 0.25);
    sGain.gain.linearRampToValueAtTime(0.08, now + 0.3);
    sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    shimmer.connect(sGain);
    sGain.connect(ctx.destination);
    shimmer.start(now + 0.25);
    shimmer.stop(now + 0.65);
  } catch (e) { /* audio not available */ }
}

// Soft descending tone for un-completing a task
function playUndo() {
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = _audioCtx;
    if (ctx.state === "suspended") ctx.resume();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(659.25, now);      // E5
    osc.frequency.exponentialRampToValueAtTime(392, now + 0.22); // down to G4
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.13, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  } catch (e) { /* audio not available */ }
}

// Bible-themed particle burst emanating from the task box outline
function Particles({ width, height, onDone, reverse }) {
  const COLORS = ["#c9a84c","#e8c4b8","#a8b89a","#b8860b","#d4a5a5","#f0dea0"];
  const SHAPES = ["✝️","🕊️","✨"]; // cross, dove, sparkle
  const W = Math.max(width || 280, 60);
  const H = Math.max(height || 48, 40);

  const particles = useMemo(() => {
    const N = reverse ? 16 : 24;
    const perim = 2 * (W + H);
    const arr = [];
    for (let i = 0; i < N; i++) {
      const t = ((i + Math.random() * 0.6) / N) * perim;
      let px, py, dirX, dirY;
      if (t < W) { px = -W/2 + t; py = -H/2; dirX = 0; dirY = -1; }
      else if (t < W + H) { px = W/2; py = -H/2 + (t - W); dirX = 1; dirY = 0; }
      else if (t < 2*W + H) { px = W/2 - (t - W - H); py = H/2; dirX = 0; dirY = 1; }
      else { px = -W/2; py = H/2 - (t - 2*W - H); dirX = -1; dirY = 0; }
      const fly = 26 + Math.random() * 36;
      arr.push({
        id: i,
        sx: px, sy: py,
        ex: px + dirX * fly + (Math.random() - 0.5) * 18,
        ey: py + dirY * fly + (Math.random() - 0.5) * 18,
        color: COLORS[i % COLORS.length],
        shape: SHAPES[i % SHAPES.length],
        size: 11 + Math.random() * 6,
        delay: Math.random() * (reverse ? 40 : 70),
        rotate: Math.random() * 360 - 180,
      });
    }
    return arr;
  }, [W, H, reverse]);

  useEffect(() => {
    const t = setTimeout(onDone, reverse ? 560 : 900);
    return () => clearTimeout(t);
  }, [onDone, reverse]);

  return (
    <div style={{ position: "absolute", top: "50%", left: "50%", width: 0, height: 0, pointerEvents: "none", zIndex: 60 }}>
      {particles.map(p => (
        <div key={p.id} style={{
          position: "absolute",
          fontSize: p.size,
          color: p.color,
          textShadow: `0 0 4px ${p.color}77`,
          animation: `${reverse ? "particle-in" : "particle-edge"} ${reverse ? 520 : 860}ms ${p.delay}ms cubic-bezier(.05,.7,.15,1) forwards`,
          "--sx": `${p.sx}px`,
          "--sy": `${p.sy}px`,
          "--ex": `${p.ex}px`,
          "--ey": `${p.ey}px`,
          "--rot": `${p.rotate}deg`,
          opacity: 0,
        }}>{p.shape}</div>
      ))}
    </div>
  );
}

function TaskRow({ task, onToggle, onEdit, justDone, justUndone }) {
  const [phase, setPhase] = useState("idle"); // idle | celebrating | reversing | done
  const [dims, setDims] = useState({ w: 280, h: 48 });
  const rowRef = useRef(null);

  useEffect(() => {
    if (justDone && task.done) {
      if (rowRef.current) {
        setDims({ w: rowRef.current.offsetWidth, h: rowRef.current.offsetHeight });
      }
      setPhase("celebrating"); // rainbow + shake + particles all start NOW
      const t = setTimeout(() => setPhase("done"), 1000);
      return () => clearTimeout(t);
    } else if (justUndone && !task.done) {
      if (rowRef.current) {
        setDims({ w: rowRef.current.offsetWidth, h: rowRef.current.offsetHeight });
      }
      setPhase("reversing"); // particles converge inward
      const t = setTimeout(() => setPhase("idle"), 560);
      return () => clearTimeout(t);
    } else if (!task.done) {
      setPhase("idle");
    }
  }, [justDone, justUndone, task.done]);

  const isDoneSettled = task.done && phase !== "celebrating";
  const celebrating = phase === "celebrating";
  const reversing = phase === "reversing";

  return (
    <div style={{ position: "relative" }}>
      <div ref={rowRef}
        className={`task-row ${isDoneSettled ? "task-done" : ""} ${celebrating ? "task-rainbow" : ""} ${reversing ? "task-reverse" : ""}`}
        style={{ opacity: isDoneSettled ? .55 : 1 }}>
        <div className={`check ${task.done ? "on" : ""}`}
          onClick={() => onToggle(task.id, !task.done)}>
          {task.done ? "✓" : ""}
        </div>
        <div style={{ flex: 1 }} onClick={() => onToggle(task.id, !task.done)}>
          <div className="task-name-text" style={{ fontSize: ".9rem", lineHeight: 1.4 }}>
            {task.icon} {task.name}
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 3 }}>
            {task.taskType && <span className="tag" style={tagStyle(task.taskType)}>{task.taskType}</span>}
            {task.priority?.map(p => <span key={p} className="tag" style={p.toLowerCase().includes("urgent") ? { background: "#fee2e2", color: "#dc2626" } : { background: "#fef9c3", color: "#ca8a04" }}>{p}</span>)}
            {task.project?.map(p => <span key={p} className="tag" style={{ background: "#e0f2fe", color: "#0369a1" }}>{p}</span>)}
          </div>
        </div>
        <button onClick={(e) => { e.stopPropagation(); onEdit(task); }} style={{
          flexShrink: 0, width: 28, height: 28, borderRadius: 8, border: "none",
          background: "transparent", color: "#c9a0a0", cursor: "pointer", fontSize: "1rem",
          display: "flex", alignItems: "center", justifyContent: "center",
        }} title="Sửa">⋯</button>
      </div>
      {celebrating && (
        <Particles width={dims.w} height={dims.h} onDone={() => setPhase("done")} />
      )}
      {reversing && (
        <Particles width={dims.w} height={dims.h} reverse onDone={() => setPhase("idle")} />
      )}
    </div>
  );
}

export default function Home() {
  const [tasks, setTasks]   = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError]   = useState("");
  const [weekMonday, setWeekMonday] = useState(mondayOf(new Date()));
  const [selectedDate, setSelectedDate] = useState(TODAY);
  const [editTask, setEditTask] = useState(null);
  const [justDone, setJustDone] = useState(null);
  const [justUndone, setJustUndone] = useState(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const r = await fetch("/api/tasks");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setTasks(d.tasks);
      setStatus("ok");
    } catch (e) {
      setError(e.message);
      setStatus("error");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (id, newDone) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done: newDone } : t));
    if (newDone) {
      playDing();
      setJustDone(id);
      setTimeout(() => setJustDone(j => j === id ? null : j), 1100);
    } else {
      playUndo();
      setJustUndone(id);
      setTimeout(() => setJustUndone(j => j === id ? null : j), 650);
    }
    try {
      const r = await fetch("/api/toggle", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, done: newDone }),
      });
      if (!r.ok) throw new Error("failed");
    } catch {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !newDone } : t));
    }
  };

  // Generic update (session / date / name) with optimistic UI + revert
  const updateTask = async (id, patch) => {
    const prevTask = tasks.find(t => t.id === id);
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
    try {
      const body = { id };
      if (patch.session !== undefined) body.session = patch.session;
      if (patch.date !== undefined) body.date = patch.date;
      if (patch.name !== undefined) body.name = patch.name;
      const r = await fetch("/api/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("failed");
    } catch {
      // revert
      setTasks(prev => prev.map(t => t.id === id ? prevTask : t));
    }
  };

  // Week days for current weekMonday
  const weekDays = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekMonday);
    d.setDate(weekMonday.getDate() + i);
    weekDays.push(iso(d));
  }
  const weekSet = new Set(weekDays);
  const sundayDate = new Date(weekMonday); sundayDate.setDate(weekMonday.getDate() + 6);
  const weekLabel = `${fmt(weekMonday)} – ${fmt(sundayDate)}`;
  const isCurrentWeek = weekSet.has(TODAY);

  // Make sure selectedDate stays within visible week
  useEffect(() => {
    if (!weekSet.has(selectedDate)) {
      setSelectedDate(weekSet.has(TODAY) ? TODAY : weekDays[0]);
    }
    // eslint-disable-next-line
  }, [weekMonday]);

  // Group
  const byDate = {};
  tasks.forEach(t => {
    const k = t.date || "no-date";
    (byDate[k] = byDate[k] || []).push(t);
  });

  // Progress — week (selected week) & selected day
  const weekTasks = tasks.filter(t => t.date && weekSet.has(t.date));
  const weekDone = weekTasks.filter(t => t.done).length;
  const weekPct = weekTasks.length ? Math.round(weekDone / weekTasks.length * 100) : 0;

  const dayTasks = byDate[selectedDate] || [];
  const dayDone = dayTasks.filter(t => t.done).length;
  const dayPct = dayTasks.length ? Math.round(dayDone / dayTasks.length * 100) : 0;

  const noDateTasks = byDate["no-date"] || [];

  // Verse for the visible week
  const v = VERSES[weekIndex(weekMonday)];

  // Group selected day's tasks by session
  const sessionGroups = SESSIONS.map(s => ({
    ...s,
    items: dayTasks.filter(t => s.match(t.session)),
  }));
  const noSession = dayTasks.filter(t => !t.session);

  const selDateObj = new Date(selectedDate + "T00:00:00");
  const selIsToday = selectedDate === TODAY;

  return (
    <>
      <Head>
        <title>✝️ Dat&apos;s Weekly Planner</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Nunito:wght@300;400;600;700&display=swap" rel="stylesheet" />
      </Head>

      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:'Nunito',sans-serif;background:#fdf8f2;color:#4a3030;min-height:100vh;
          background-image:radial-gradient(ellipse at 10% 20%,rgba(232,196,184,.3) 0%,transparent 50%),
          radial-gradient(ellipse at 90% 80%,rgba(168,184,154,.2) 0%,transparent 50%);}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes rainbow{
          0%  { background: linear-gradient(90deg,#ff6b6b,#ffd93d); }
          20% { background: linear-gradient(90deg,#ffd93d,#6bcb77); }
          40% { background: linear-gradient(90deg,#6bcb77,#4d96ff); }
          60% { background: linear-gradient(90deg,#4d96ff,#c77dff); }
          80% { background: linear-gradient(90deg,#c77dff,#ff6eb4); }
          100%{ background: linear-gradient(90deg,#ff6eb4,#ff6b6b); }
        }
        @keyframes shake{
          0%,100%{transform:translateX(0) rotate(0) scale(1.08)}
          15%   {transform:translateX(-6px) rotate(-2deg) scale(1.08)}
          30%   {transform:translateX(6px)  rotate(2deg) scale(1.1)}
          45%   {transform:translateX(-5px) rotate(-1.5deg) scale(1.08)}
          60%   {transform:translateX(5px)  rotate(1.5deg) scale(1.1)}
          75%   {transform:translateX(-3px) rotate(-1deg) scale(1.06)}
          90%   {transform:translateX(3px)  rotate(1deg) scale(1.04)}
        }
        @keyframes particle-edge{
          0%  { opacity:0; transform:translate(var(--sx),var(--sy)) rotate(0) scale(.5); }
          12% { opacity:1; }
          100%{ opacity:0; transform:translate(var(--ex),var(--ey)) rotate(var(--rot)) scale(.85); }
        }
        @keyframes particle-in{
          0%  { opacity:0; transform:translate(var(--ex),var(--ey)) rotate(var(--rot)) scale(.85); }
          25% { opacity:.95; }
          100%{ opacity:0; transform:translate(var(--sx),var(--sy)) rotate(0) scale(.4); }
        }
        .task-rainbow{
          animation: rainbow 480ms linear, shake 560ms cubic-bezier(.36,.07,.19,.97);
          border-radius: 12px;
          transform-origin: center;
          box-shadow: 0 4px 20px rgba(199,125,255,.5);
          z-index: 5;
          position: relative;
        }
        .task-rainbow .task-name-text{ color:#fff !important; font-weight:700; text-shadow:0 1px 3px rgba(0,0,0,.2); }
        @keyframes reverseFade{
          0%  { background:linear-gradient(135deg,rgba(168,184,154,.28),rgba(168,184,154,.12)); transform:scale(1); }
          40% { transform:scale(.97); }
          100%{ background:rgba(255,255,255,0); transform:scale(1); }
        }
        .task-reverse{ animation: reverseFade 540ms ease-out; border-radius:10px; }
        .f1{animation:fadeUp .5s .05s both}.f2{animation:fadeUp .5s .15s both}
        .f3{animation:fadeUp .5s .25s both}.f4{animation:fadeUp .5s .35s both}
        .card{background:rgba(255,255,255,.82);backdrop-filter:blur(8px);
          border:1px solid rgba(201,160,160,.25);border-radius:16px;padding:18px;}
        .card-title{font-family:'Cormorant Garamond',serif;font-size:1rem;font-weight:600;
          color:${wine};margin-bottom:11px;display:flex;align-items:center;gap:6px;
          border-bottom:1px solid #e8c4b8;padding-bottom:7px;}
        .task-row{display:flex;align-items:flex-start;gap:10px;padding:8px 10px;
          border-radius:10px;margin-bottom:5px;cursor:pointer;
          transition:background .35s ease, transform .25s cubic-bezier(.34,1.56,.64,1);}
        .task-row:hover{background:rgba(232,196,184,.22)}
        .task-row .task-name-text{color:#4a3030;transition:color .35s ease;}
        .task-done{background:linear-gradient(135deg,rgba(168,184,154,.28),rgba(168,184,154,.12));}
        .task-done:hover{background:linear-gradient(135deg,rgba(168,184,154,.34),rgba(168,184,154,.18));}
        .task-done .task-name-text{color:#5a7050;}
        .check{width:18px;height:18px;border:1.5px solid #c9a0a0;border-radius:5px;
          flex-shrink:0;margin-top:2px;display:flex;align-items:center;justify-content:center;
          background:#fff;transition:all .25s cubic-bezier(.34,1.56,.64,1);font-size:11px;color:#fff;}
        .check.on{background:#a8b89a;border-color:#a8b89a;transform:scale(1.08);}
        .tag{font-size:.62rem;padding:1px 7px;border-radius:10px;font-weight:700;}
        .gratitude{width:100%;border:none;border-bottom:1px solid #e8c4b8;background:transparent;
          font-family:'Nunito',sans-serif;font-size:.83rem;color:#4a3030;
          padding:5px 2px;margin-bottom:8px;outline:none;}
        .gratitude::placeholder{color:#c9a0a0;font-style:italic;}
        .day-tabs::-webkit-scrollbar{height:0;display:none}
        .day-tabs{scrollbar-width:none}
        @media(max-width:600px){.grid2{grid-template-columns:1fr!important}}
      `}</style>

      <div style={{ maxWidth: 1060, margin: "0 auto", padding: "0 16px 60px" }}>

        {/* HERO with GIF banner */}
        <div className="f1" style={{ textAlign: "center", padding: "26px 0 14px" }}>
          <div style={{ position: "relative", borderRadius: 18, overflow: "hidden", marginBottom: 16, border: "1px solid rgba(201,160,160,.3)", boxShadow: "0 6px 24px rgba(122,74,74,.12)" }}>
            <img src="/img/red-sea.gif" alt="" style={{ width: "100%", height: 150, objectFit: "cover", display: "block" }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(253,248,242,0) 40%, rgba(253,248,242,.9) 100%)" }} />
            <div style={{ position: "absolute", bottom: 10, left: 0, right: 0 }}>
              <span style={{ fontSize: "1.6rem", display: "block", animation: "float 4s ease-in-out infinite" }}>✝️</span>
            </div>
          </div>
          <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontWeight: 300, fontSize: "clamp(1.8rem,4.5vw,2.9rem)", color: wine, letterSpacing: ".05em" }}>
            Dat&apos;s <em style={{ color: gold }}>Weekly</em> Planner
          </h1>
        </div>

        {/* VERSE — English primary */}
        <div className="f2" style={{ margin: "0 0 14px", padding: "18px 22px 18px 30px", background: "linear-gradient(135deg,rgba(122,74,74,.07),rgba(201,168,76,.07))", borderLeft: `3px solid ${gold}`, borderRadius: "0 12px 12px 0", position: "relative" }}>
          <span style={{ position: "absolute", top: -8, left: 12, fontSize: "1.7rem", color: gold, opacity: .4, fontFamily: "serif" }}>❝</span>
          <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.15rem", fontStyle: "italic", color: wine, lineHeight: 1.55 }}>
            {v.en.map((line, i) => <span key={i}>{line}<br/></span>)}
          </p>
          <p style={{ fontSize: ".82rem", color: "#a98", fontStyle: "italic", marginTop: 6 }}>{v.vi}</p>
          <cite style={{ display: "block", marginTop: 4, fontSize: ".72rem", color: "#8a6a6a", fontStyle: "normal" }}>— {v.ref} · {v.refVi} ✝️</cite>
        </div>

        {/* WEEK NAVIGATION */}
        <div className="f2" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 10 }}>
          <button onClick={() => { const m = new Date(weekMonday); m.setDate(m.getDate()-7); setWeekMonday(m); }}
            style={{ padding: "8px 14px", border: "1px solid #e8c4b8", borderRadius: 10, background: "rgba(255,255,255,.7)", color: wine, cursor: "pointer", fontWeight: 700, fontSize: ".85rem" }}>‹ Tuần trước</button>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.1rem", fontWeight: 600, color: wine }}>{weekLabel}</div>
            {isCurrentWeek && <div style={{ fontSize: ".6rem", color: gold, fontWeight: 700, letterSpacing: ".1em" }}>TUẦN NÀY</div>}
            {!isCurrentWeek && <button onClick={() => { setWeekMonday(mondayOf(new Date())); setSelectedDate(TODAY); }} style={{ fontSize: ".6rem", color: "#8a6a6a", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>↩ về tuần này</button>}
          </div>
          <button onClick={() => { const m = new Date(weekMonday); m.setDate(m.getDate()+7); setWeekMonday(m); }}
            style={{ padding: "8px 14px", border: "1px solid #e8c4b8", borderRadius: 10, background: "rgba(255,255,255,.7)", color: wine, cursor: "pointer", fontWeight: 700, fontSize: ".85rem" }}>Tuần sau ›</button>
        </div>

        {/* PROGRESS RINGS — selected day + selected week */}
        <div className="f2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <Ring pct={dayPct} label={selIsToday ? "HÔM NAY" : (DAYS[selDateObj.getDay()] + " " + fmt(selDateObj)).toUpperCase()} sub={`${dayDone}/${dayTasks.length}`} color={wine} loading={status==="loading"} />
          <Ring pct={weekPct} label={isCurrentWeek ? "TUẦN NÀY" : "TUẦN ĐANG XEM"} sub={`${weekDone}/${weekTasks.length}`} color={gold} loading={status==="loading"} />
        </div>

        {/* TASKS */}
        <div className="f3 card" style={{ marginBottom: 14, overflow: "visible" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e8c4b8", paddingBottom: 8, marginBottom: 14 }}>
            <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.2rem", fontWeight: 600, color: wine }}>📋 Kế hoạch</span>
            <button onClick={load} style={{ fontSize: ".7rem", padding: "3px 12px", border: "1px solid #e8c4b8", borderRadius: 8, background: "transparent", color: "#8a6a6a", cursor: "pointer" }}>↻ Làm mới</button>
          </div>

          {status === "loading" && (
            <div style={{ textAlign: "center", padding: 28, color: "#8a6a6a" }}>
              <div style={{ width: 26, height: 26, border: "2px solid #e8c4b8", borderTopColor: wine, borderRadius: "50%", animation: "spin .8s linear infinite", margin: "0 auto 10px" }} />
              Đang tải từ Notion...
            </div>
          )}

          {status === "error" && (
            <div style={{ background: "#fff5f5", border: "1px solid #fed7d7", borderRadius: 10, padding: 14, fontSize: ".82rem", color: "#c53030", textAlign: "center" }}>⚠️ {error}</div>
          )}

          {status === "ok" && (
            <>
              {/* DAY TABS */}
              <div className="day-tabs" style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 10, marginBottom: 10 }}>
                {weekDays.map(date => {
                  const d = new Date(date + "T00:00:00");
                  const isToday = date === TODAY;
                  const isSel = date === selectedDate;
                  const dt = byDate[date] || [];
                  const allDone = dt.length > 0 && dt.every(t => t.done);
                  const rem = dt.filter(t => !t.done).length;
                  return (
                    <button key={date} onClick={() => setSelectedDate(date)} style={{
                      flex: "0 0 auto", minWidth: 48, padding: "8px 6px", borderRadius: 12,
                      border: isSel ? `2px solid ${wine}` : "1px solid #e8c4b8",
                      background: isSel ? wine : "rgba(255,255,255,.7)",
                      color: isSel ? "#fff" : isToday ? wine : "#8a6a6a",
                      cursor: "pointer", textAlign: "center", transition: "all .2s",
                    }}>
                      <div style={{ fontSize: ".62rem", fontWeight: 700 }}>{DAYS_SHORT[d.getDay()]}</div>
                      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.15rem", fontWeight: 600, lineHeight: 1.1 }}>{d.getDate()}</div>
                      {dt.length > 0 && <div style={{ fontSize: ".55rem", marginTop: 2, color: isSel ? "rgba(255,255,255,.85)" : allDone ? "#a8b89a" : "#c9a0a0" }}>{allDone ? "✓" : rem}</div>}
                    </button>
                  );
                })}
              </div>

              {/* SELECTED DAY NAME */}
              <div style={{ fontSize: ".75rem", fontWeight: 700, letterSpacing: ".1em", color: selIsToday ? wine : "#8a6a6a", textTransform: "uppercase", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                {DAYS[selDateObj.getDay()]} {fmt(selDateObj)}
                {selIsToday && <span style={{ background: wine, color: "#fff", fontSize: ".55rem", padding: "1px 6px", borderRadius: 8 }}>HÔM NAY</span>}
              </div>

              {/* TASKS BY SESSION */}
              {dayTasks.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 10px", color: "#c9a0a0", fontSize: ".85rem", fontStyle: "italic" }}>🕊️ Không có việc nào ngày này</div>
              ) : (
                <>
                  {sessionGroups.map(sg => sg.items.length > 0 && (
                    <div key={sg.key} style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: ".7rem", fontWeight: 700, letterSpacing: ".06em", color: wine, marginBottom: 6, padding: "4px 8px", background: "rgba(232,196,184,.25)", borderRadius: 8, display: "inline-block" }}>{sg.label}</div>
                      {sg.items.map(t => <TaskRow key={t.id} task={t} onToggle={toggle} onEdit={setEditTask} justDone={justDone === t.id} justUndone={justUndone === t.id} />)}
                    </div>
                  ))}
                  {noSession.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: ".7rem", fontWeight: 700, letterSpacing: ".06em", color: "#8a6a6a", marginBottom: 6 }}>📋 Chưa xếp buổi</div>
                      {noSession.map(t => <TaskRow key={t.id} task={t} onToggle={toggle} onEdit={setEditTask} justDone={justDone === t.id} justUndone={justUndone === t.id} />)}
                    </div>
                  )}
                </>
              )}

              {/* NO-DATE TASKS */}
              {noDateTasks.length > 0 && selIsToday && (
                <div style={{ marginTop: 18, borderTop: "1px dashed #e8c4b8", paddingTop: 14 }}>
                  <div style={{ fontSize: ".68rem", fontWeight: 700, letterSpacing: ".1em", color: "#8a6a6a", textTransform: "uppercase", marginBottom: 8 }}>📌 Chưa có ngày</div>
                  {noDateTasks.map(t => <TaskRow key={t.id} task={t} onToggle={toggle} onEdit={setEditTask} justDone={justDone === t.id} justUndone={justUndone === t.id} />)}
                </div>
              )}
            </>
          )}
        </div>

        {/* SCRIPTURE CARD with image — English primary */}
        <div className="f4 card" style={{ marginBottom: 14, overflow: "hidden", padding: 0 }}>
          <img src="/img/jesus-water.jpg" alt="" style={{ width: "100%", height: 180, objectFit: "cover", objectPosition: "center 30%", display: "block" }} />
          <div style={{ padding: 18 }}>
            <div className="card-title">📖 Scripture · Lời Chúa</div>
            <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1rem", fontStyle: "italic", color: wine, lineHeight: 1.7 }}>
              {v.en.map((line, i) => <span key={i}>{line}<br/></span>)}
            </p>
            <p style={{ fontSize: ".82rem", color: "#a98", fontStyle: "italic", marginTop: 8 }}>{v.vi}</p>
            <p style={{ fontSize: ".7rem", color: "#8a6a6a", marginTop: 8, borderTop: "1px solid rgba(201,160,160,.2)", paddingTop: 8 }}>— {v.ref} · {v.refVi}</p>
          </div>
        </div>

        {/* PRAYER + GRATITUDE */}
        <div className="f4 grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
          <div className="card" style={{ overflow: "hidden", padding: 0 }}>
            <img src="/img/jesus-boat.jpg" alt="" style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }} />
            <div style={{ padding: 18 }}>
              <div className="card-title">🕊️ Daily Prayer</div>
              <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: ".92rem", fontStyle: "italic", color: wine, lineHeight: 1.7 }}>
                "Lord, make me an instrument of your peace.<br/>
                Where there is hatred, let me sow love;<br/>
                where there is injury, pardon."
              </p>
              <p style={{ fontSize: ".7rem", color: "#8a6a6a", marginTop: 7 }}>— Prayer of St. Francis · Kinh Phanxicô</p>
            </div>
          </div>
          <div className="card">
            <div className="card-title">🙌 Gratitude · Tạ ơn hôm nay</div>
            {["Today I thank God for... · Hôm nay con tạ ơn vì...","...","..."].map((ph, i) => (
              <input key={i} className="gratitude" placeholder={ph} />
            ))}
          </div>
        </div>

        {/* FOOTER */}
        <div style={{ textAlign: "center", padding: "28px 0 8px", fontFamily: "'Cormorant Garamond',serif", fontStyle: "italic", fontSize: ".88rem", color: "#8a6a6a" }}>
          <div style={{ marginBottom: 5 }}>✝️ 🌸 ✝️</div>
          "In everything give thanks."<br/>
          <span style={{ fontSize: ".78rem", color: "#a98" }}>Trong mọi hoàn cảnh, hãy tạ ơn Chúa.</span><br/>
          <span style={{ fontSize: ".72rem" }}>— 1 Thessalonians 5:18</span>
        </div>

        {editTask && (
          <EditModal
            task={editTask}
            weekDays={weekDays}
            onClose={() => setEditTask(null)}
            onSave={(patch) => { updateTask(editTask.id, patch); setEditTask(null); }}
          />
        )}

      </div>
    </>
  );
}

function EditModal({ task, weekDays, onClose, onSave }) {
  const [name, setName] = useState(task.name);
  const [editingName, setEditingName] = useState(false);
  const [session, setSession] = useState(task.session || "");
  const [date, setDate] = useState(task.date || "");
  // Tuần đang hiển thị trong phần chọn ngày (mặc định tuần chứa ngày hiện tại của task)
  const [modalMonday, setModalMonday] = useState(mondayOf(task.date ? new Date(task.date + "T00:00:00") : new Date()));

  const modalWeekDays = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(modalMonday);
    d.setDate(modalMonday.getDate() + i);
    modalWeekDays.push(iso(d));
  }
  const mSun = new Date(modalMonday); mSun.setDate(modalMonday.getDate() + 6);
  const modalWeekLabel = `${fmt(modalMonday)} – ${fmt(mSun)}`;

  const patch = {};
  if (name !== task.name) patch.name = name;
  if (session !== (task.session || "")) patch.session = session || null;
  if (date !== (task.date || "")) patch.date = date || null;
  const hasChange = Object.keys(patch).length > 0;

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(74,48,48,.4)", backdropFilter: "blur(3px)",
      display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 100,
      animation: "fadeUp .2s ease",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#fdf8f2", borderRadius: "20px 20px 0 0", padding: "20px 20px 28px",
        width: "100%", maxWidth: 480, boxShadow: "0 -8px 30px rgba(122,74,74,.2)",
        maxHeight: "85vh", overflowY: "auto",
      }}>
        {/* Handle bar */}
        <div style={{ width: 40, height: 4, background: "#e8c4b8", borderRadius: 2, margin: "0 auto 18px" }} />

        {/* Name */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: ".7rem", fontWeight: 700, letterSpacing: ".08em", color: "#8a6a6a" }}>TÊN CÔNG VIỆC</span>
            <button onClick={() => setEditingName(v => !v)} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: ".95rem", color: wine }}>✏️</button>
          </div>
          {editingName ? (
            <input autoFocus value={name} onChange={e => setName(e.target.value)} style={{
              width: "100%", padding: "10px 12px", border: `1.5px solid ${wine}`, borderRadius: 10,
              fontFamily: "'Nunito',sans-serif", fontSize: ".95rem", color: "#4a3030", outline: "none",
            }} />
          ) : (
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.2rem", color: wine, fontWeight: 600 }}>
              {task.icon} {name}
            </div>
          )}
        </div>

        {/* Session */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: ".7rem", fontWeight: 700, letterSpacing: ".08em", color: "#8a6a6a", marginBottom: 8 }}>BUỔI</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["🌅 Sáng","🏢 Office (11–7h)","🌙 Tối"].map(s => (
              <button key={s} onClick={() => setSession(session === s ? "" : s)} style={{
                padding: "8px 14px", borderRadius: 10, cursor: "pointer", fontSize: ".82rem", fontWeight: 600,
                border: session === s ? `2px solid ${wine}` : "1px solid #e8c4b8",
                background: session === s ? wine : "#fff", color: session === s ? "#fff" : "#8a6a6a",
              }}>{s}</button>
            ))}
          </div>
        </div>

        {/* Date */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: ".7rem", fontWeight: 700, letterSpacing: ".08em", color: "#8a6a6a" }}>NGÀY</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button onClick={() => { const m = new Date(modalMonday); m.setDate(m.getDate()-7); setModalMonday(m); }} style={{ border: "1px solid #e8c4b8", background: "#fff", borderRadius: 8, width: 26, height: 26, cursor: "pointer", color: wine }}>‹</button>
              <span style={{ fontSize: ".72rem", color: wine, fontWeight: 600, minWidth: 90, textAlign: "center" }}>{modalWeekLabel}</span>
              <button onClick={() => { const m = new Date(modalMonday); m.setDate(m.getDate()+7); setModalMonday(m); }} style={{ border: "1px solid #e8c4b8", background: "#fff", borderRadius: 8, width: 26, height: 26, cursor: "pointer", color: wine }}>›</button>
            </div>
          </div>
          <div className="day-tabs" style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
            {modalWeekDays.map(d => {
              const dt = new Date(d + "T00:00:00");
              const sel = d === date;
              const isT = d === TODAY;
              return (
                <button key={d} onClick={() => setDate(d)} style={{
                  flex: "0 0 auto", minWidth: 46, padding: "8px 6px", borderRadius: 10, cursor: "pointer",
                  border: sel ? `2px solid ${wine}` : isT ? `1px solid ${gold}` : "1px solid #e8c4b8",
                  background: sel ? wine : "#fff", color: sel ? "#fff" : isT ? gold : "#8a6a6a", textAlign: "center",
                }}>
                  <div style={{ fontSize: ".6rem", fontWeight: 700 }}>{DAYS_SHORT[dt.getDay()]}</div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.05rem", fontWeight: 600 }}>{dt.getDate()}</div>
                </button>
              );
            })}
          </div>
          {date && <div style={{ fontSize: ".72rem", color: "#8a6a6a", marginTop: 8 }}>
            Đang chọn: <strong style={{ color: wine }}>{DAYS[new Date(date+"T00:00:00").getDay()]} {fmt(new Date(date+"T00:00:00"))}</strong>
          </div>}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "12px", borderRadius: 12, border: "1px solid #e8c4b8",
            background: "#fff", color: "#8a6a6a", cursor: "pointer", fontWeight: 600, fontSize: ".9rem",
          }}>Hủy</button>
          <button onClick={() => hasChange ? onSave(patch) : onClose()} style={{
            flex: 2, padding: "12px", borderRadius: 12, border: "none",
            background: hasChange ? wine : "#c9a0a0", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: ".9rem",
          }}>{hasChange ? "Lưu thay đổi" : "Đóng"}</button>
        </div>
      </div>
    </div>
  );
}
