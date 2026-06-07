import { useState, useEffect, useCallback } from "react";
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
  const R = 30, C = 2 * Math.PI * R;
  const offset = loading ? C : C - (pct / 100) * C;
  return (
    <div className="card" style={{ padding: 16, display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ position: "relative", width: 72, height: 72, flexShrink: 0 }}>
        <svg width="72" height="72" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="36" cy="36" r={R} fill="none" stroke="#f5e6e0" strokeWidth="6" />
          <circle cx="36" cy="36" r={R} fill="none" stroke={color} strokeWidth="6"
            strokeLinecap="round" strokeDasharray={C} strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset .8s ease" }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.25rem", fontWeight: 600, color: wine }}>
            {loading ? "—" : pct + "%"}
          </span>
        </div>
      </div>
      <div>
        <div style={{ fontSize: ".7rem", fontWeight: 700, letterSpacing: ".08em", color: "#8a6a6a" }}>{label}</div>
        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.4rem", fontWeight: 600, color: wine, lineHeight: 1.2 }}>
          {loading ? "—" : sub}
        </div>
        <div style={{ fontSize: ".62rem", color: "#c9a0a0" }}>việc hoàn thành</div>
      </div>
    </div>
  );
}

function TaskRow({ task, onToggle }) {
  return (
    <div className="task-row" style={{ opacity: task.done ? .45 : 1 }} onClick={() => onToggle(task.id, !task.done)}>
      <div className={`check ${task.done ? "on" : ""}`}>{task.done ? "✓" : ""}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: ".9rem", color: "#4a3030", lineHeight: 1.4, textDecoration: task.done ? "line-through" : "none" }}>
          {task.icon} {task.name}
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 3 }}>
          {task.taskType && <span className="tag" style={tagStyle(task.taskType)}>{task.taskType}</span>}
          {task.priority?.map(p => <span key={p} className="tag" style={p.toLowerCase().includes("urgent") ? { background: "#fee2e2", color: "#dc2626" } : { background: "#fef9c3", color: "#ca8a04" }}>{p}</span>)}
          {task.project?.map(p => <span key={p} className="tag" style={{ background: "#e0f2fe", color: "#0369a1" }}>{p}</span>)}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [tasks, setTasks]   = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError]   = useState("");
  const [weekMonday, setWeekMonday] = useState(mondayOf(new Date()));
  const [selectedDate, setSelectedDate] = useState(TODAY);

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
        .f1{animation:fadeUp .5s .05s both}.f2{animation:fadeUp .5s .15s both}
        .f3{animation:fadeUp .5s .25s both}.f4{animation:fadeUp .5s .35s both}
        .card{background:rgba(255,255,255,.82);backdrop-filter:blur(8px);
          border:1px solid rgba(201,160,160,.25);border-radius:16px;padding:18px;}
        .card-title{font-family:'Cormorant Garamond',serif;font-size:1rem;font-weight:600;
          color:${wine};margin-bottom:11px;display:flex;align-items:center;gap:6px;
          border-bottom:1px solid #e8c4b8;padding-bottom:7px;}
        .task-row{display:flex;align-items:flex-start;gap:10px;padding:8px 10px;
          border-radius:10px;margin-bottom:5px;cursor:pointer;transition:background .15s;}
        .task-row:hover{background:rgba(232,196,184,.22)}
        .check{width:18px;height:18px;border:1.5px solid #c9a0a0;border-radius:5px;
          flex-shrink:0;margin-top:2px;display:flex;align-items:center;justify-content:center;
          background:#fff;transition:all .2s;font-size:11px;color:#fff;}
        .check.on{background:#a8b89a;border-color:#a8b89a;}
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
        <div className="f2 grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <Ring pct={dayPct} label={selIsToday ? "HÔM NAY" : (DAYS[selDateObj.getDay()] + " " + fmt(selDateObj)).toUpperCase()} sub={`${dayDone}/${dayTasks.length}`} color={wine} loading={status==="loading"} />
          <Ring pct={weekPct} label={isCurrentWeek ? "TUẦN NÀY" : "TUẦN ĐANG XEM"} sub={`${weekDone}/${weekTasks.length}`} color={gold} loading={status==="loading"} />
        </div>

        {/* TASKS */}
        <div className="f3 card" style={{ marginBottom: 14 }}>
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
                      {sg.items.map(t => <TaskRow key={t.id} task={t} onToggle={toggle} />)}
                    </div>
                  ))}
                  {noSession.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: ".7rem", fontWeight: 700, letterSpacing: ".06em", color: "#8a6a6a", marginBottom: 6 }}>📋 Chưa xếp buổi</div>
                      {noSession.map(t => <TaskRow key={t.id} task={t} onToggle={toggle} />)}
                    </div>
                  )}
                </>
              )}

              {/* NO-DATE TASKS */}
              {noDateTasks.length > 0 && selIsToday && (
                <div style={{ marginTop: 18, borderTop: "1px dashed #e8c4b8", paddingTop: 14 }}>
                  <div style={{ fontSize: ".68rem", fontWeight: 700, letterSpacing: ".1em", color: "#8a6a6a", textTransform: "uppercase", marginBottom: 8 }}>📌 Chưa có ngày</div>
                  {noDateTasks.map(t => <TaskRow key={t.id} task={t} onToggle={toggle} />)}
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

      </div>
    </>
  );
}
