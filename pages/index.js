import { useState, useEffect, useCallback } from "react";
import Head from "next/head";

const TODAY = new Date().toISOString().split("T")[0];
const DAYS = ["Chủ Nhật","Thứ Hai","Thứ Ba","Thứ Tư","Thứ Năm","Thứ Sáu","Thứ Bảy"];
const fmt = d => d.toLocaleDateString("vi-VN", { day: "numeric", month: "numeric" });

const now = new Date();
const dow = now.getDay();
const mon = new Date(now); mon.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
const WEEK_LABEL = `${fmt(mon)} – ${fmt(sun)}`;

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

export default function Home() {
  const [tasks, setTasks]   = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError]   = useState("");
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

  // 7 ngày trong tuần hiện tại (Thứ 2 → Chủ Nhật)
  const weekDays = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    weekDays.push(d.toISOString().split("T")[0]);
  }
  const weekSet = new Set(weekDays);

  // Stats CHỈ tính trong tuần này
  const weekTasks = tasks.filter(t => t.date && weekSet.has(t.date));
  const total    = weekTasks.length;
  const done     = weekTasks.filter(t => t.done).length;
  const todayTasks = tasks.filter(t => t.date === TODAY);
  const todayDone  = todayTasks.filter(t => t.done).length;
  const todayRem   = todayTasks.length - todayDone;
  const pct        = total > 0 ? Math.round(done / total * 100) : 0;
  const todayPct   = todayTasks.length > 0 ? Math.round(todayDone / todayTasks.length * 100) : 0;

  const groups = {};
  tasks.forEach(t => {
    const k = t.date || "no-date";
    if (!groups[k]) groups[k] = [];
    groups[k].push(t);
  });
  const sortedDates = Object.keys(groups).filter(k => k !== "no-date").sort();
  if (groups["no-date"]) sortedDates.push("no-date");

  // Task của ngày đang chọn
  const selectedTasks = groups[selectedDate] || [];
  const noDateTasks = groups["no-date"] || [];

  const wine = "#7a4a4a", gold = "#c9a84c";

  return (
    <>
      <Head>
        <title>✝️ Dat's Weekly Planner</title>
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
        @media(max-width:600px){.grid2{grid-template-columns:1fr!important}.stats-row{grid-template-columns:1fr 1fr!important}}
        .day-tabs::-webkit-scrollbar{height:0;display:none}
        .day-tabs{scrollbar-width:none}
      `}</style>

      <div style={{ maxWidth: 1060, margin: "0 auto", padding: "0 16px 60px" }}>

        {/* HERO */}
        <div className="f1" style={{ textAlign: "center", padding: "40px 0 16px" }}>
          <span style={{ fontSize: "2rem", display: "block", marginBottom: 6, animation: "float 4s ease-in-out infinite" }}>✝️</span>
          <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontWeight: 300, fontSize: "clamp(1.8rem,4.5vw,2.9rem)", color: wine, letterSpacing: ".05em" }}>
            Dat&apos;s <em style={{ color: gold }}>Weekly</em> Planner
          </h1>
          <span style={{ display: "inline-block", marginTop: 8, padding: "4px 16px", background: "#f0dea0", border: `1px solid ${gold}`, borderRadius: 20, fontSize: ".72rem", color: wine, letterSpacing: ".1em", fontWeight: 700 }}>
            {WEEK_LABEL}
          </span>
        </div>

        {/* QUOTE */}
        <div className="f2" style={{ margin: "0 0 14px", padding: "16px 22px 16px 30px", background: "linear-gradient(135deg,rgba(122,74,74,.07),rgba(201,168,76,.07))", borderLeft: `3px solid ${gold}`, borderRadius: "0 12px 12px 0", position: "relative" }}>
          <span style={{ position: "absolute", top: -8, left: 12, fontSize: "1.7rem", color: gold, opacity: .4, fontFamily: "serif" }}>❝</span>
          <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.08rem", fontStyle: "italic", color: wine, lineHeight: 1.6 }}>
            "Hãy phó thác đường đời cho Chúa, tin tưởng vào Người, Người sẽ ra tay."<br/>
            <span style={{ fontSize: ".92rem", color: "#8a6a6a" }}>"Commit your way to the Lord; trust in him, and he will act."</span>
          </p>
          <cite style={{ display: "block", marginTop: 4, fontSize: ".72rem", color: "#8a6a6a", fontStyle: "normal" }}>— Thánh Vịnh 37:5 · Psalm 37:5 ✝️</cite>
        </div>

        {/* STATS - VÒNG TRÒN */}
        <div className="f2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          {[
            { pct: todayPct, done: todayDone, total: todayTasks.length, label: "HÔM NAY", color: "#7a4a4a" },
            { pct: pct, done: done, total: total, label: "TUẦN NÀY", color: "#c9a84c" },
          ].map(({ pct, done, total, label, color }) => {
            const R = 30, C = 2 * Math.PI * R;
            const offset = status === "loading" ? C : C - (pct / 100) * C;
            return (
              <div key={label} className="card" style={{ padding: "16px", display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ position: "relative", width: 72, height: 72, flexShrink: 0 }}>
                  <svg width="72" height="72" style={{ transform: "rotate(-90deg)" }}>
                    <circle cx="36" cy="36" r={R} fill="none" stroke="#f5e6e0" strokeWidth="6" />
                    <circle cx="36" cy="36" r={R} fill="none" stroke={color} strokeWidth="6"
                      strokeLinecap="round" strokeDasharray={C} strokeDashoffset={offset}
                      style={{ transition: "stroke-dashoffset .8s ease" }} />
                  </svg>
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
                    <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.25rem", fontWeight: 600, color: wine, lineHeight: 1 }}>
                      {status === "loading" ? "—" : pct + "%"}
                    </span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: ".7rem", fontWeight: 700, letterSpacing: ".08em", color: "#8a6a6a" }}>{label}</div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.4rem", fontWeight: 600, color: wine, lineHeight: 1.2 }}>
                    {status === "loading" ? "—" : `${done}/${total}`}
                  </div>
                  <div style={{ fontSize: ".62rem", color: "#c9a0a0" }}>việc hoàn thành</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* TASKS */}
        <div className="f3 card" style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e8c4b8", paddingBottom: 8, marginBottom: 14 }}>
            <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.2rem", fontWeight: 600, color: wine }}>📋 Kế hoạch tuần</span>
            <button onClick={load} style={{ fontSize: ".7rem", padding: "3px 12px", border: "1px solid #e8c4b8", borderRadius: 8, background: "transparent", color: "#8a6a6a", cursor: "pointer" }}>↻ Làm mới</button>
          </div>

          {status === "loading" && (
            <div style={{ textAlign: "center", padding: 28, color: "#8a6a6a" }}>
              <div style={{ width: 26, height: 26, border: "2px solid #e8c4b8", borderTopColor: wine, borderRadius: "50%", animation: "spin .8s linear infinite", margin: "0 auto 10px" }} />
              Đang tải từ Notion...
            </div>
          )}

          {status === "error" && (
            <div style={{ background: "#fff5f5", border: "1px solid #fed7d7", borderRadius: 10, padding: 14, fontSize: ".82rem", color: "#c53030", textAlign: "center" }}>
              ⚠️ {error}
            </div>
          )}

          {status === "ok" && (
            <>
              {/* TAB CHỌN NGÀY */}
              <div className="day-tabs" style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 10, marginBottom: 6, WebkitOverflowScrolling: "touch" }}>
                {weekDays.map(date => {
                  const d = new Date(date + "T00:00:00");
                  const isToday = date === TODAY;
                  const isSel = date === selectedDate;
                  const dayShort = ["CN","T2","T3","T4","T5","T6","T7"][d.getDay()];
                  const dayTasks = groups[date] || [];
                  const allDone = dayTasks.length > 0 && dayTasks.every(t => t.done);
                  const remaining = dayTasks.filter(t => !t.done).length;
                  return (
                    <button key={date} onClick={() => setSelectedDate(date)} style={{
                      flex: "0 0 auto", minWidth: 48, padding: "8px 6px", borderRadius: 12,
                      border: isSel ? `2px solid ${wine}` : "1px solid #e8c4b8",
                      background: isSel ? wine : "rgba(255,255,255,.7)",
                      color: isSel ? "#fff" : isToday ? wine : "#8a6a6a",
                      cursor: "pointer", textAlign: "center", transition: "all .2s", position: "relative",
                    }}>
                      <div style={{ fontSize: ".62rem", fontWeight: 700, letterSpacing: ".05em" }}>{dayShort}</div>
                      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.15rem", fontWeight: 600, lineHeight: 1.1 }}>{d.getDate()}</div>
                      {dayTasks.length > 0 && (
                        <div style={{
                          fontSize: ".55rem", marginTop: 2,
                          color: isSel ? "rgba(255,255,255,.85)" : allDone ? "#a8b89a" : "#c9a0a0",
                        }}>
                          {allDone ? "✓" : remaining}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* TÊN NGÀY ĐANG CHỌN */}
              {(() => {
                const d = new Date(selectedDate + "T00:00:00");
                const isToday = selectedDate === TODAY;
                return (
                  <div style={{ fontSize: ".75rem", fontWeight: 700, letterSpacing: ".1em", color: isToday ? wine : "#8a6a6a", textTransform: "uppercase", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                    {DAYS[d.getDay()]} {fmt(d)}
                    {isToday && <span style={{ background: wine, color: "#fff", fontSize: ".55rem", padding: "1px 6px", borderRadius: 8 }}>HÔM NAY</span>}
                  </div>
                );
              })()}

              {/* TASK NGÀY ĐANG CHỌN */}
              {selectedTasks.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 10px", color: "#c9a0a0", fontSize: ".85rem", fontStyle: "italic" }}>
                  🕊️ Không có việc nào ngày này
                </div>
              ) : selectedTasks.map(task => (
                <div key={task.id} className="task-row" style={{ opacity: task.done ? .45 : 1 }} onClick={() => toggle(task.id, !task.done)}>
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
              ))}

              {/* TASK CHƯA CÓ NGÀY */}
              {noDateTasks.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <div style={{ fontSize: ".68rem", fontWeight: 700, letterSpacing: ".1em", color: "#8a6a6a", textTransform: "uppercase", marginBottom: 8 }}>📌 Chưa có ngày</div>
                  {noDateTasks.map(task => (
                    <div key={task.id} className="task-row" style={{ opacity: task.done ? .45 : 1 }} onClick={() => toggle(task.id, !task.done)}>
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
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* LỜI CHÚA SONG NGỮ */}
        <div className="f4 card" style={{ marginBottom: 14 }}>
          <div className="card-title">📖 Lời Chúa trong tuần · Scripture</div>
          <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            <div>
              <div style={{ fontSize: ".6rem", fontWeight: 700, letterSpacing: ".1em", color: gold, marginBottom: 6 }}>🇻🇳 TIẾNG VIỆT</div>
              <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: ".95rem", fontStyle: "italic", color: wine, lineHeight: 1.75 }}>
                "Chúa là mục tử chăn dắt tôi, tôi chẳng thiếu thốn gì.<br/>
                Người cho tôi nằm nghỉ trên đồng cỏ xanh tươi,<br/>
                dẫn tôi tới dòng nước trong lành."
              </p>
            </div>
            <div>
              <div style={{ fontSize: ".6rem", fontWeight: 700, letterSpacing: ".1em", color: gold, marginBottom: 6 }}>🇬🇧 ENGLISH</div>
              <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: ".95rem", fontStyle: "italic", color: wine, lineHeight: 1.75 }}>
                "The Lord is my shepherd; I shall not want.<br/>
                He makes me lie down in green pastures.<br/>
                He leads me beside still waters."
              </p>
            </div>
          </div>
          <p style={{ fontSize: ".7rem", color: "#8a6a6a", marginTop: 10, textAlign: "center", borderTop: "1px solid rgba(201,160,160,.2)", paddingTop: 8 }}>— Thánh Vịnh 23:1–2 · Psalm 23:1–2</p>
        </div>

        {/* KINH NGUYỆN + TẠ ƠN */}
        <div className="f4 grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
          <div className="card">
            <div className="card-title">🕊️ Kinh nguyện hằng ngày</div>
            <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: ".92rem", fontStyle: "italic", color: wine, lineHeight: 1.75 }}>
              "Lạy Chúa, xin dùng con như khí cụ bình an của Chúa.<br/>
              Để con mang yêu thương vào nơi có oán thù,<br/>
              mang tha thứ vào nơi có xúc phạm,<br/>
              mang tin kính vào nơi có hoài nghi."
            </p>
            <p style={{ fontSize: ".7rem", color: "#8a6a6a", marginTop: 7 }}>— Kinh Thánh Phanxicô Assisi</p>
          </div>
          <div className="card">
            <div className="card-title">🙌 Tạ ơn hôm nay</div>
            {["Hôm nay con tạ ơn Chúa vì...","...","..."].map((ph, i) => (
              <input key={i} className="gratitude" placeholder={ph} />
            ))}
          </div>
        </div>

        <div style={{ textAlign: "center", padding: "28px 0 8px", fontFamily: "'Cormorant Garamond',serif", fontStyle: "italic", fontSize: ".88rem", color: "#8a6a6a" }}>
          <div style={{ marginBottom: 5 }}>✝️ 🌸 ✝️</div>
          "Trong mọi hoàn cảnh, hãy tạ ơn Chúa." · "In everything give thanks."<br/>
          <span style={{ fontSize: ".75rem" }}>— 1 Thessalonians 5:18</span>
        </div>

      </div>
    </>
  );
}
