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

// Scripture pool — English primary, Vietnamese secondary. Picked at random each load.
const VERSES = [
  { en: ["The Lord is my shepherd; I shall not want.","He makes me lie down in green pastures.","He leads me beside still waters."], vi:"Chúa là mục tử chăn dắt tôi, tôi chẳng thiếu thốn gì.", ref:"Psalm 23:1–2", refVi:"Thánh Vịnh 23" },
  { en: ["Commit your way to the Lord;","trust in him, and he will act."], vi:"Hãy phó thác đường đời cho Chúa, Người sẽ ra tay.", ref:"Psalm 37:5", refVi:"Thánh Vịnh 37:5" },
  { en: ["I can do all things","through Christ who strengthens me."], vi:"Tôi làm được mọi sự nhờ Đấng ban sức mạnh cho tôi.", ref:"Philippians 4:13", refVi:"Pl 4:13" },
  { en: ["Be still, and know","that I am God."], vi:"Hãy lặng yên và biết rằng Ta là Thiên Chúa.", ref:"Psalm 46:10", refVi:"Tv 46:10" },
  { en: ["Cast all your anxiety on him","because he cares for you."], vi:"Hãy trút mọi lo âu cho Người, vì Người chăm sóc bạn.", ref:"1 Peter 5:7", refVi:"1 Pr 5:7" },
  { en: ["Trust in the Lord with all your heart,","and lean not on your own understanding."], vi:"Hãy hết lòng tin tưởng vào Chúa, đừng cậy vào sự hiểu biết của con.", ref:"Proverbs 3:5", refVi:"Cn 3:5" },
  { en: ["The Lord is my light and my salvation;","whom shall I fear?"], vi:"Chúa là nguồn ánh sáng và ơn cứu độ của tôi, tôi còn sợ chi ai?", ref:"Psalm 27:1", refVi:"Tv 27:1" },
  { en: ["For I know the plans I have for you,","plans to give you hope and a future."], vi:"Ta biết các kế hoạch Ta định làm cho ngươi: cho ngươi một tương lai và niềm hy vọng.", ref:"Jeremiah 29:11", refVi:"Gr 29:11" },
  { en: ["Come to me, all who are weary,","and I will give you rest."], vi:"Tất cả những ai đang vất vả, hãy đến với Ta, Ta sẽ cho nghỉ ngơi bồi dưỡng.", ref:"Matthew 11:28", refVi:"Mt 11:28" },
  { en: ["The joy of the Lord","is your strength."], vi:"Niềm vui trong Chúa là sức mạnh của anh em.", ref:"Nehemiah 8:10", refVi:"Nkm 8:10" },
  { en: ["Do everything in love."], vi:"Hãy làm mọi sự vì lòng yêu mến.", ref:"1 Corinthians 16:14", refVi:"1 Cr 16:14" },
  { en: ["This is the day the Lord has made;","let us rejoice and be glad in it."], vi:"Đây là ngày Chúa đã làm ra, nào ta hãy vui mừng hoan hỷ.", ref:"Psalm 118:24", refVi:"Tv 118:24" },
  { en: ["Give thanks to the Lord,","for he is good; his love endures forever."], vi:"Hãy tạ ơn Chúa vì Chúa nhân từ, muôn ngàn đời Chúa vẫn trọn tình thương.", ref:"Psalm 107:1", refVi:"Tv 107:1" },
  { en: ["Let all that you do","be done in love."], vi:"Mọi việc anh em làm, hãy làm vì đức ái.", ref:"1 Corinthians 16:14", refVi:"1 Cr 16:14" },
  { en: ["Whatever you do, work at it","with all your heart, as working for the Lord."], vi:"Bất cứ làm việc gì, hãy làm tận tâm như thể làm cho Chúa.", ref:"Colossians 3:23", refVi:"Cl 3:23" },
];
function randomVerse() {
  return VERSES[Math.floor(Math.random() * VERSES.length)];
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

// Solid accent color per task type — used to highlight the left edge of each task row
function typeColor(type = "") {
  const t = type.toLowerCase();
  if (t.includes("work"))          return "#2563eb";
  if (t.includes("personal"))      return "#7c3aed";
  if (t.includes("chore"))         return "#b45309";
  if (t.includes("health"))        return "#db2777";
  if (t.includes("entertainment")) return "#16a34a";
  if (t.includes("family"))        return "#ea580c";
  if (t.includes("vacation"))      return "#dc2626";
  return "#9aa0a6";
}

const TASK_TYPES = ["💼 Works","🧍 Personal","🧹 Chore","🏥 Health","👨‍👩‍👧 Family","🎮 Entertainment","🏖️ Vacation"];

// Bible-themed mood levels (1–5)
const MOOD_LEVELS = [
  { score: 1, emoji: "🥀", label: "Nặng lòng",  vi: "Thung lũng tối", color: "#7a4a4a" },
  { score: 2, emoji: "😔", label: "Mỏi mệt",    vi: "Gánh nặng",      color: "#9d6b5a" },
  { score: 3, emoji: "🕊️", label: "Bình an",    vi: "Tĩnh lặng",      color: "#c9a84c" },
  { score: 4, emoji: "😊", label: "Vui tươi",   vi: "Hân hoan",       color: "#b8860b" },
  { score: 5, emoji: "😇", label: "Hân hoan",   vi: "Tràn đầy ơn",    color: "#d4a017" },
];
function moodInfo(score) { return MOOD_LEVELS.find(m => m.score === score) || null; }

// Mood persistence (per-device, localStorage)
function moodKey(date) { return `dat-mood:${date}`; }
function getMood(date) {
  if (typeof window === "undefined") return null;
  try { const v = localStorage.getItem(moodKey(date)); return v ? parseInt(v, 10) : null; } catch { return null; }
}
function saveMood(date, score) {
  try { localStorage.setItem(moodKey(date), String(score)); } catch {}
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

// ===== High-quality Web Audio sound engine =====
let _audioCtx = null, _master = null, _reverb = null;
function actx() {
  if (typeof window === "undefined") return null;
  try {
    if (!_audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      _audioCtx = new AC();
      // master compressor → destination (glue + protects from clipping)
      _master = _audioCtx.createDynamicsCompressor();
      _master.threshold.value = -16; _master.knee.value = 26; _master.ratio.value = 3.2;
      _master.attack.value = 0.003; _master.release.value = 0.2;
      _master.connect(_audioCtx.destination);
      // lightweight algorithmic reverb (generated impulse) on a send bus
      _reverb = _audioCtx.createConvolver();
      const len = Math.floor(_audioCtx.sampleRate * 0.8);
      const imp = _audioCtx.createBuffer(2, len, _audioCtx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = imp.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8);
      }
      _reverb.buffer = imp;
      _reverb.connect(_master);
    }
    if (_audioCtx.state === "suspended") _audioCtx.resume();
  } catch { return null; }
  return _audioCtx;
}
function rnd(a, b) { return a + Math.random() * (b - a); }

// one oscillator voice: osc → lowpass → gain(env) → master (+ optional reverb send)
function voice(ctx, { type = "triangle", freq, dur = 0.12, gain = 0.08, attack = 0.004, detune = 0, glideTo = null, glideAt = null, cutoff = 2400, reverb = 0, when = 0 }) {
  const t0 = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass"; lp.frequency.value = cutoff;
  osc.type = type; osc.frequency.setValueAtTime(freq, t0);
  if (detune) osc.detune.value = detune;
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + (glideAt ?? dur));
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + dur);
  osc.connect(lp); lp.connect(g); g.connect(_master);
  if (reverb > 0) { const s = ctx.createGain(); s.gain.value = reverb; g.connect(s); s.connect(_reverb); }
  osc.start(t0); osc.stop(t0 + attack + dur + 0.05);
}
// filtered noise transient — click texture & swooshes
function noise(ctx, { dur = 0.03, gain = 0.05, type = "bandpass", freq = 2600, q = 0.8, sweepTo = null, reverb = 0, when = 0 }) {
  const t0 = ctx.currentTime + when;
  const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(_master);
  if (reverb > 0) { const s = ctx.createGain(); s.gain.value = reverb; g.connect(s); s.connect(_reverb); }
  src.start(t0); src.stop(t0 + dur + 0.02);
}

// Semantic UI sounds — each call varies slightly so repeats feel organic
const SFX = {
  tick() { const c = actx(); if (!c) return; const v = rnd(0.93, 1.07);
    noise(c, { dur: 0.018, gain: 0.03, freq: 2800 * v, q: 0.6 });
    voice(c, { type: "triangle", freq: 900 * v, dur: 0.045, gain: 0.045, cutoff: 2600 });
  },
  pop() { const c = actx(); if (!c) return; const v = rnd(0.9, 1.1);
    voice(c, { type: "sine", freq: 480 * v, dur: 0.085, gain: 0.075, cutoff: 1800, glideTo: 760 * v, glideAt: 0.07 });
    noise(c, { dur: 0.012, gain: 0.018, freq: 3200, q: 0.5 });
  },
  confirm() { const c = actx(); if (!c) return; const v = rnd(0.99, 1.01);
    voice(c, { freq: 587.33 * v, dur: 0.12, gain: 0.07, cutoff: 3000, reverb: 0.18 });
    voice(c, { freq: 880 * v, dur: 0.16, gain: 0.06, cutoff: 3200, reverb: 0.22, when: 0.075 });
    voice(c, { type: "sine", freq: 1760 * v, dur: 0.1, gain: 0.025, cutoff: 4000, when: 0.075, reverb: 0.3 });
  },
  soft() { const c = actx(); if (!c) return; const v = rnd(0.97, 1.03);
    voice(c, { type: "sine", freq: 470 * v, dur: 0.12, gain: 0.06, cutoff: 1500, glideTo: 320 * v, glideAt: 0.11, reverb: 0.12 });
  },
  swoosh() { const c = actx(); if (!c) return; const up = Math.random() > 0.5;
    noise(c, { dur: 0.16, gain: 0.045, type: "bandpass", freq: up ? 700 : 2400, q: 1.1, sweepTo: up ? 2600 : 650, reverb: 0.12 });
  },
  danger() { const c = actx(); if (!c) return; const v = rnd(0.99, 1.01);
    voice(c, { type: "sawtooth", freq: 220 * v, dur: 0.16, gain: 0.05, cutoff: 1100, glideTo: 150 * v, glideAt: 0.14 });
    noise(c, { dur: 0.02, gain: 0.028, freq: 1800, q: 0.7 });
  },
};
function playClick(kind = "tick") { try { (SFX[kind] || SFX.tick)(); } catch {} }

// Celebration ding — randomly pick a major arpeggio so it feels fresh each time
const DING_VARIANTS = [
  [523.25, 659.25, 783.99, 1046.5],   // C major
  [587.33, 739.99, 880.00, 1174.66],  // D major
  [493.88, 622.25, 739.99, 987.77],   // B major
  [659.25, 830.61, 987.77, 1318.51],  // E major
  [440.00, 554.37, 659.25, 880.00],   // A major
];
function playDing() {
  const c = actx(); if (!c) return;
  const notes = DING_VARIANTS[Math.floor(Math.random() * DING_VARIANTS.length)];
  notes.forEach((f, i) => voice(c, { type: "triangle", freq: f, dur: 0.34, gain: 0.16, cutoff: 3600, reverb: 0.25, when: i * 0.075 }));
  voice(c, { type: "sine", freq: notes[3] * 1.5, dur: 0.32, gain: 0.05, cutoff: 5000, when: 0.22, reverb: 0.4, glideTo: notes[3] * 2, glideAt: 0.3 });
}
// Soft descending tone for un-completing a task
function playUndo() {
  const c = actx(); if (!c) return; const v = rnd(0.98, 1.02);
  voice(c, { type: "triangle", freq: 659.25 * v, dur: 0.26, gain: 0.12, cutoff: 2200, glideTo: 392 * v, glideAt: 0.22, reverb: 0.12 });
}

// Sparkle burst emanating from the task box outline (done celebration)
function Particles({ width, height, onDone }) {
  const COLORS = ["#c9a84c","#f0dea0","#e8c4b8","#d4a5a5","#b8860b","#dcc77a"];
  const SHAPES = ["✦"]; // single 4-pointed sparkle star
  const W = Math.max(width || 280, 60);
  const H = Math.max(height || 48, 40);

  const particles = useMemo(() => {
    const N = 13;
    const perim = 2 * (W + H);
    const arr = [];
    for (let i = 0; i < N; i++) {
      const t = ((i + Math.random() * 0.7) / N) * perim;
      let px, py, dirX, dirY;
      if (t < W) { px = -W/2 + t; py = -H/2; dirX = 0; dirY = -1; }
      else if (t < W + H) { px = W/2; py = -H/2 + (t - W); dirX = 1; dirY = 0; }
      else if (t < 2*W + H) { px = W/2 - (t - W - H); py = H/2; dirX = 0; dirY = 1; }
      else { px = -W/2; py = H/2 - (t - 2*W - H); dirX = -1; dirY = 0; }
      const fly = 24 + Math.random() * 40;
      // size contrast: ~⅓ big sparkles, rest small
      const big = i % 3 === 0;
      arr.push({
        id: i,
        sx: px, sy: py,
        ex: px + dirX * fly + (Math.random() - 0.5) * 18,
        ey: py + dirY * fly + (Math.random() - 0.5) * 18,
        color: COLORS[i % COLORS.length],
        shape: SHAPES[0],
        size: big ? 19 + Math.random() * 7 : 8 + Math.random() * 4,
        delay: Math.random() * 80,
        rotate: Math.random() * 360 - 180,
      });
    }
    return arr;
  }, [W, H]);

  useEffect(() => {
    const t = setTimeout(onDone, 900);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div style={{ position: "absolute", top: "50%", left: "50%", width: 0, height: 0, pointerEvents: "none", zIndex: 60 }}>
      {particles.map(p => (
        <div key={p.id} style={{
          position: "absolute",
          fontSize: p.size,
          color: p.color,
          textShadow: `0 0 4px ${p.color}77`,
          animation: `particle-edge 860ms ${p.delay}ms cubic-bezier(.05,.7,.15,1) forwards`,
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
      setPhase("celebrating"); // rainbow + shake + sparkles all start NOW
      const t = setTimeout(() => setPhase("done"), 1000);
      return () => clearTimeout(t);
    } else if (justUndone && !task.done) {
      setPhase("reversing"); // red highlight pop, no particles
      const t = setTimeout(() => setPhase("idle"), 460);
      return () => clearTimeout(t);
    } else if (!task.done) {
      setPhase("idle");
    }
  }, [justDone, justUndone, task.done]);

  const isDoneSettled = task.done && phase !== "celebrating";
  const celebrating = phase === "celebrating";
  const reversing = phase === "reversing";

  const accent = typeColor(task.taskType || "");
  return (
    <div style={{ position: "relative" }}>
      <div ref={rowRef}
        className={`task-row ${isDoneSettled ? "task-done" : ""} ${celebrating ? "task-rainbow" : ""} ${reversing ? "task-unpop" : ""}`}
        style={{
          opacity: isDoneSettled ? .55 : 1,
          borderLeft: `4px solid ${accent}`,
          background: (!isDoneSettled && !celebrating && !reversing) ? `${accent}0d` : undefined,
        }}>
        <div className={`check ${task.done ? "on" : ""}`}
          onClick={() => onToggle(task.id, !task.done)}
          style={!task.done ? { borderColor: accent } : undefined}>
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
    </div>
  );
}

// ---- Mood slider (Bible-themed) for a given day ----
function MoodSlider({ date, value, onChange }) {
  const info = moodInfo(value || 3);
  const v = value || 3;
  const isToday = date === TODAY;
  const dObj = new Date(date + "T00:00:00");
  const dayLabel = isToday ? "HÔM NAY" : `${DAYS[dObj.getDay()].toUpperCase()} ${fmt(dObj)}`;
  // gradient track wine -> gold
  const pct = ((v - 1) / 4) * 100;
  return (
    <div className="card" style={{ marginBottom: 14, padding: "16px 18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <span style={{ fontSize: ".7rem", fontWeight: 700, letterSpacing: ".08em", color: "#8a6a6a" }}>TÂM TRẠNG · {dayLabel}</span>
        <span style={{ fontSize: ".66rem", color: "#c9a0a0" }}>Tv 118:24</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ fontSize: "2.4rem", lineHeight: 1, filter: value ? "none" : "grayscale(.6) opacity(.6)", transition: "all .25s", minWidth: 44, textAlign: "center" }}>
          {info?.emoji}
        </div>
        <div style={{ flex: 1 }}>
          <input
            type="range" min="1" max="5" step="1" value={v}
            onChange={e => onChange(parseInt(e.target.value, 10))}
            className="mood-range"
            style={{
              width: "100%",
              background: `linear-gradient(90deg, #7a4a4a 0%, #c9a84c ${pct}%, #efe2d4 ${pct}%, #efe2d4 100%)`,
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
            {MOOD_LEVELS.map(m => (
              <button key={m.score} data-sfx="pop" onClick={() => onChange(m.score)} title={m.label} style={{
                border: "none", background: "transparent", cursor: "pointer", fontSize: ".82rem",
                opacity: v === m.score ? 1 : .35, transform: v === m.score ? "scale(1.25)" : "scale(1)",
                transition: "all .2s",
              }}>{m.emoji}</button>
            ))}
          </div>
        </div>
      </div>
      <div style={{ textAlign: "center", marginTop: 10 }}>
        <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.15rem", fontWeight: 600, color: info?.color }}>
          {value ? `${info?.label}` : "Kéo để chọn tâm trạng"}
        </span>
        {value && <span style={{ fontSize: ".72rem", color: "#a98", fontStyle: "italic", marginLeft: 8 }}>· {info?.vi}</span>}
      </div>
    </div>
  );
}

// ---- Weekly dual-line chart: task count + mood across the 7 days ----
function WeekChart({ weekDays, byDate, moods }) {
  const moodColor = "#8257b5"; // distinct violet for the mood line
  const W = 320, H = 170, padL = 16, padR = 16, padT = 24, padB = 26;
  const innerW = W - padL - padR, innerH = H - padT - padB;

  const counts = weekDays.map(d => (byDate[d] || []).length);
  const maxCount = Math.max(4, ...counts);
  const xAt = i => padL + (innerW * i) / 6;
  const yCount = c => padT + innerH - (innerH * c) / maxCount;
  const yMood = m => padT + innerH - (innerH * (m - 1)) / 4; // mood 1..5

  const countPts = counts.map((c, i) => [xAt(i), yCount(c)]);
  const moodPts = weekDays.map((d, i) => {
    const m = moods[d];
    return m ? [xAt(i), yMood(m)] : null;
  });

  const linePath = pts => pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  // mood path skips gaps
  let moodSegments = [];
  let seg = [];
  moodPts.forEach(p => { if (p) seg.push(p); else { if (seg.length) moodSegments.push(seg); seg = []; } });
  if (seg.length) moodSegments.push(seg);

  return (
    <div className="card" style={{ marginBottom: 14, padding: "16px 14px 10px", overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, padding: "0 4px" }}>
        <span style={{ fontSize: ".7rem", fontWeight: 700, letterSpacing: ".08em", color: "#8a6a6a" }}>📈 TUẦN NÀY · CÔNG VIỆC & TÂM TRẠNG</span>
      </div>
      {/* legend */}
      <div style={{ display: "flex", gap: 16, justifyContent: "center", marginBottom: 4 }}>
        <span style={{ fontSize: ".66rem", color: wine, display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 14, height: 3, background: wine, display: "inline-block", borderRadius: 2 }} /> Số task
        </span>
        <span style={{ fontSize: ".66rem", color: moodColor, display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 14, height: 3, background: moodColor, display: "inline-block", borderRadius: 2 }} /> Tâm trạng ✝️
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
        {/* horizontal grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((g, i) => (
          <line key={i} x1={padL} x2={W - padR} y1={padT + innerH * g} y2={padT + innerH * g}
            stroke="#efe2d4" strokeWidth="1" />
        ))}
        {/* task count line */}
        <path d={linePath(countPts)} fill="none" stroke={wine} strokeWidth="2.5"
          strokeLinejoin="round" strokeLinecap="round" />
        {countPts.map((p, i) => (
          <g key={"c" + i}>
            <circle cx={p[0]} cy={p[1]} r="3.5" fill={wine} />
            {counts[i] > 0 && <text x={p[0]} y={p[1] - 7} textAnchor="middle" fontSize="9" fill={wine} fontWeight="700">{counts[i]}</text>}
          </g>
        ))}
        {/* mood line (violet) with cross markers */}
        {moodSegments.map((s, si) => (
          <path key={"m" + si} d={linePath(s)} fill="none" stroke={moodColor} strokeWidth="2.5"
            strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {moodPts.map((p, i) => p && (
          <g key={"mc" + i}>
            <circle cx={p[0]} cy={p[1]} r="6" fill="#fff" stroke={moodColor} strokeWidth="1.5" />
            <text x={p[0]} y={p[1] + 3.5} textAnchor="middle" fontSize="9" fill={moodColor} fontWeight="700">✝</text>
          </g>
        ))}
        {/* x axis labels */}
        {weekDays.map((d, i) => {
          const dt = new Date(d + "T00:00:00");
          const isT = d === TODAY;
          return (
            <text key={"x" + i} x={xAt(i)} y={H - 8} textAnchor="middle" fontSize="9"
              fill={isT ? gold : "#a98"} fontWeight={isT ? "700" : "400"}>
              {DAYS_SHORT[dt.getDay()]}
            </text>
          );
        })}
      </svg>
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
  const [verse, setVerse] = useState(VERSES[0]);
  const [verseLoading, setVerseLoading] = useState(false);
  const [moods, setMoods] = useState({}); // date -> score, from localStorage

  // Fetch an unlimited random verse from the Bible API; fall back to local pool
  const loadVerse = useCallback((useFallback = false) => {
    if (useFallback) setVerse(randomVerse()); // only on first mount so page isn't empty
    setVerseLoading(true);
    fetch("/api/verse")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => {
        if (!d || !d.en) throw new Error("bad verse");
        setVerse({ en: [d.en], vi: d.vi || "", ref: d.ref, refVi: d.refVi || d.ref });
      })
      .catch(() => { if (!useFallback) setVerse(randomVerse()); })
      .finally(() => setVerseLoading(false));
  }, []);

  useEffect(() => { loadVerse(true); }, [loadVerse]);

  // Global button feedback: sound (by data-sfx) + springy press animation for EVERY button
  useEffect(() => {
    const onDown = (e) => {
      const btn = e.target.closest && e.target.closest("button");
      if (!btn || btn.disabled) return;
      playClick(btn.dataset.sfx || "tick");
      // spring press animation (CSS animation overrides inline transforms while running)
      btn.classList.remove("btn-press");
      // force reflow so the animation can retrigger on rapid taps
      void btn.offsetWidth;
      btn.classList.add("btn-press");
      const done = () => btn.classList.remove("btn-press");
      btn.addEventListener("animationend", done, { once: true });
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

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

  // Generic update (session / date / name / taskType) with optimistic UI + revert
  const updateTask = async (id, patch) => {
    const prevTask = tasks.find(t => t.id === id);
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
    try {
      const body = { id };
      if (patch.session !== undefined) body.session = patch.session;
      if (patch.date !== undefined) body.date = patch.date;
      if (patch.name !== undefined) body.name = patch.name;
      if (patch.taskType !== undefined) body.taskType = patch.taskType;
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

  // Delete (archive) a task with optimistic removal + revert on failure
  const deleteTask = async (id) => {
    const prevTasks = tasks;
    setTasks(prev => prev.filter(t => t.id !== id));
    try {
      const r = await fetch("/api/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!r.ok) throw new Error("failed");
    } catch {
      setTasks(prevTasks); // restore
    }
  };

  // Set mood for a date (localStorage cache + state + Notion sync)
  const setMoodFor = (date, score) => {
    saveMood(date, score);                       // instant local cache
    setMoods(prev => ({ ...prev, [date]: score }));
    fetch("/api/mood", {                          // sync to Notion (best effort)
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, score }),
    }).catch(() => { /* stays in local cache */ });
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

  // Load moods: local cache first (instant), then Notion to sync across devices
  useEffect(() => {
    const local = {};
    weekDays.forEach(d => { const v = getMood(d); if (v) local[d] = v; });
    setMoods(local);
    fetch("/api/mood")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => {
        if (!d || !d.moods) return;
        // merge Notion moods (source of truth) and refresh local cache
        setMoods(prev => {
          const merged = { ...prev };
          weekDays.forEach(day => {
            if (d.moods[day]) { merged[day] = d.moods[day]; saveMood(day, d.moods[day]); }
          });
          return merged;
        });
      })
      .catch(() => { /* keep local cache */ });
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

  // Random scripture, refreshed every page load
  const v = verse;

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
        .task-rainbow{
          animation: rainbow 480ms linear, shake 560ms cubic-bezier(.36,.07,.19,.97);
          border-radius: 12px;
          transform-origin: center;
          box-shadow: 0 4px 20px rgba(199,125,255,.5);
          z-index: 5;
          position: relative;
        }
        .task-rainbow .task-name-text{ color:#fff !important; font-weight:700; text-shadow:0 1px 3px rgba(0,0,0,.2); }
        @keyframes unpop{
          0%  { background:rgba(220,38,38,0); transform:scale(1); }
          30% { background:rgba(220,38,38,.20); transform:scale(1.03); }
          100%{ background:rgba(220,38,38,0); transform:scale(1); }
        }
        .task-unpop{ animation: unpop 450ms cubic-bezier(.34,1.56,.64,1); border-radius:10px; }
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
        .mood-range{-webkit-appearance:none;appearance:none;height:8px;border-radius:6px;outline:none;cursor:pointer;margin:2px 0;}
        .mood-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:24px;height:24px;border-radius:50%;
          background:#fff;border:3px solid #c9a84c;box-shadow:0 2px 8px rgba(122,74,74,.35);cursor:pointer;transition:transform .15s;}
        .mood-range::-webkit-slider-thumb:active{transform:scale(1.2);}
        .mood-range::-moz-range-thumb{width:24px;height:24px;border-radius:50%;background:#fff;border:3px solid #c9a84c;
          box-shadow:0 2px 8px rgba(122,74,74,.35);cursor:pointer;}
        @media(max-width:600px){.grid2{grid-template-columns:1fr!important}}
        /* universal button feel */
        button{transition:filter .12s ease, box-shadow .15s ease;-webkit-tap-highlight-color:transparent;touch-action:manipulation;}
        button:hover{filter:brightness(1.03);}
        @keyframes btnPress{0%{transform:scale(1)}32%{transform:scale(.91)}100%{transform:scale(1)}}
        .btn-press{animation:btnPress .22s cubic-bezier(.34,1.7,.5,1);}
        @keyframes btnPressGlow{0%{transform:scale(1);box-shadow:0 0 0 0 rgba(201,168,76,.5)}32%{transform:scale(.93)}100%{transform:scale(1);box-shadow:0 0 0 14px rgba(201,168,76,0)}}
        .btn-press[data-sfx="confirm"]{animation:btnPressGlow .42s cubic-bezier(.34,1.6,.5,1);}
        @keyframes btnPressGlowRed{0%{transform:scale(1);box-shadow:0 0 0 0 rgba(220,38,38,.5)}32%{transform:scale(.93)}100%{transform:scale(1);box-shadow:0 0 0 14px rgba(220,38,38,0)}}
        .btn-press[data-sfx="danger"]{animation:btnPressGlowRed .42s cubic-bezier(.34,1.6,.5,1);}
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
          {v.vi && <p style={{ fontSize: ".82rem", color: "#a98", fontStyle: "italic", marginTop: 6 }}>{v.vi}</p>}
          <cite style={{ display: "block", marginTop: 4, fontSize: ".72rem", color: "#8a6a6a", fontStyle: "normal" }}>— {v.ref} ✝️</cite>
        </div>

        {/* WEEK NAVIGATION */}
        <div className="f2" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 10 }}>
          <button data-sfx="swoosh" onClick={() => { const m = new Date(weekMonday); m.setDate(m.getDate()-7); setWeekMonday(m); }}
            style={{ padding: "8px 14px", border: "1px solid #e8c4b8", borderRadius: 10, background: "rgba(255,255,255,.7)", color: wine, cursor: "pointer", fontWeight: 700, fontSize: ".85rem" }}>‹ Tuần trước</button>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.1rem", fontWeight: 600, color: wine }}>{weekLabel}</div>
            {isCurrentWeek && <div style={{ fontSize: ".6rem", color: gold, fontWeight: 700, letterSpacing: ".1em" }}>TUẦN NÀY</div>}
            {!isCurrentWeek && <button data-sfx="swoosh" onClick={() => { setWeekMonday(mondayOf(new Date())); setSelectedDate(TODAY); }} style={{ fontSize: ".6rem", color: "#8a6a6a", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>↩ về tuần này</button>}
          </div>
          <button data-sfx="swoosh" onClick={() => { const m = new Date(weekMonday); m.setDate(m.getDate()+7); setWeekMonday(m); }}
            style={{ padding: "8px 14px", border: "1px solid #e8c4b8", borderRadius: 10, background: "rgba(255,255,255,.7)", color: wine, cursor: "pointer", fontWeight: 700, fontSize: ".85rem" }}>Tuần sau ›</button>
        </div>

        {/* PROGRESS RINGS — selected day + selected week */}
        <div className="f2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <Ring pct={dayPct} label={selIsToday ? "HÔM NAY" : (DAYS[selDateObj.getDay()] + " " + fmt(selDateObj)).toUpperCase()} sub={`${dayDone}/${dayTasks.length}`} color={wine} loading={status==="loading"} />
          <Ring pct={weekPct} label={isCurrentWeek ? "TUẦN NÀY" : "TUẦN ĐANG XEM"} sub={`${weekDone}/${weekTasks.length}`} color={gold} loading={status==="loading"} />
        </div>

        {/* MOOD SLIDER — for selected day */}
        <div className="f2">
          <MoodSlider date={selectedDate} value={moods[selectedDate] || null} onChange={(s) => setMoodFor(selectedDate, s)} />
        </div>

        {/* WEEK CHART — task count + mood */}
        <div className="f3">
          <WeekChart weekDays={weekDays} byDate={byDate} moods={moods} />
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
                    <button key={date} data-sfx="pop" onClick={() => setSelectedDate(date)} style={{
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
            <div className="card-title" style={{ justifyContent: "space-between" }}>
              <span>📖 Scripture · Lời Chúa</span>
              <button data-sfx="pop" onClick={() => loadVerse(false)} disabled={verseLoading} style={{ fontSize: ".68rem", padding: "3px 10px", border: "1px solid #e8c4b8", borderRadius: 8, background: "transparent", color: "#8a6a6a", cursor: verseLoading ? "wait" : "pointer", opacity: verseLoading ? .5 : 1 }}>{verseLoading ? "…" : "🔄 Câu khác"}</button>
            </div>
            <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1rem", fontStyle: "italic", color: wine, lineHeight: 1.7 }}>
              {v.en.map((line, i) => <span key={i}>{line}<br/></span>)}
            </p>
            {v.vi && <p style={{ fontSize: ".82rem", color: "#a98", fontStyle: "italic", marginTop: 8 }}>{v.vi}</p>}
            <p style={{ fontSize: ".7rem", color: "#8a6a6a", marginTop: 8, borderTop: "1px solid rgba(201,160,160,.2)", paddingTop: 8 }}>— {v.ref}{v.vi ? ` · ${v.refVi}` : ""}</p>
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
            onDelete={() => { deleteTask(editTask.id); setEditTask(null); }}
          />
        )}

      </div>
    </>
  );
}

function EditModal({ task, weekDays, onClose, onSave, onDelete }) {
  const [name, setName] = useState(task.name);
  const [editingName, setEditingName] = useState(false);
  const [session, setSession] = useState(task.session || "");
  const [date, setDate] = useState(task.date || "");
  const [taskType, setTaskType] = useState(task.taskType || "");
  const [confirmDel, setConfirmDel] = useState(false);
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
  if (taskType !== (task.taskType || "")) patch.taskType = taskType || null;
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
              <button key={s} data-sfx="pop" onClick={() => setSession(session === s ? "" : s)} style={{
                padding: "8px 14px", borderRadius: 10, cursor: "pointer", fontSize: ".82rem", fontWeight: 600,
                border: session === s ? `2px solid ${wine}` : "1px solid #e8c4b8",
                background: session === s ? wine : "#fff", color: session === s ? "#fff" : "#8a6a6a",
              }}>{s}</button>
            ))}
          </div>
        </div>

        {/* Task Type */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: ".7rem", fontWeight: 700, letterSpacing: ".08em", color: "#8a6a6a", marginBottom: 8 }}>LOẠI CÔNG VIỆC</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {TASK_TYPES.map(tt => {
              const sel = taskType === tt;
              const c = typeColor(tt);
              return (
                <button key={tt} data-sfx="pop" onClick={() => setTaskType(sel ? "" : tt)} style={{
                  padding: "7px 12px", borderRadius: 10, cursor: "pointer", fontSize: ".8rem", fontWeight: 600,
                  border: sel ? `2px solid ${c}` : "1px solid #e8c4b8",
                  background: sel ? `${c}1a` : "#fff", color: sel ? c : "#8a6a6a",
                }}>{tt}</button>
              );
            })}
          </div>
        </div>

        {/* Date */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: ".7rem", fontWeight: 700, letterSpacing: ".08em", color: "#8a6a6a" }}>NGÀY</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button data-sfx="swoosh" onClick={() => { const m = new Date(modalMonday); m.setDate(m.getDate()-7); setModalMonday(m); }} style={{ border: "1px solid #e8c4b8", background: "#fff", borderRadius: 8, width: 26, height: 26, cursor: "pointer", color: wine }}>‹</button>
              <span style={{ fontSize: ".72rem", color: wine, fontWeight: 600, minWidth: 90, textAlign: "center" }}>{modalWeekLabel}</span>
              <button data-sfx="swoosh" onClick={() => { const m = new Date(modalMonday); m.setDate(m.getDate()+7); setModalMonday(m); }} style={{ border: "1px solid #e8c4b8", background: "#fff", borderRadius: 8, width: 26, height: 26, cursor: "pointer", color: wine }}>›</button>
            </div>
          </div>
          <div className="day-tabs" style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
            {modalWeekDays.map(d => {
              const dt = new Date(d + "T00:00:00");
              const sel = d === date;
              const isT = d === TODAY;
              return (
                <button key={d} data-sfx="pop" onClick={() => setDate(d)} style={{
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
          <button data-sfx="soft" onClick={onClose} style={{
            flex: 1, padding: "12px", borderRadius: 12, border: "1px solid #e8c4b8",
            background: "#fff", color: "#8a6a6a", cursor: "pointer", fontWeight: 600, fontSize: ".9rem",
          }}>Hủy</button>
          <button data-sfx="confirm" onClick={() => hasChange ? onSave(patch) : onClose()} style={{
            flex: 2, padding: "12px", borderRadius: 12, border: "none",
            background: hasChange ? wine : "#c9a0a0", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: ".9rem",
          }}>{hasChange ? "Lưu thay đổi" : "Đóng"}</button>
        </div>

        {/* Delete */}
        <div style={{ marginTop: 12, textAlign: "center" }}>
          {!confirmDel ? (
            <button data-sfx="danger" onClick={() => setConfirmDel(true)} style={{
              border: "none", background: "transparent", color: "#c08", cursor: "pointer",
              fontSize: ".8rem", fontWeight: 600, opacity: .8,
            }}>🗑️ Xóa công việc này</button>
          ) : (
            <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: ".8rem", color: "#b91c1c" }}>Xóa thật nhé?</span>
              <button data-sfx="danger" onClick={onDelete} style={{
                padding: "7px 16px", borderRadius: 10, border: "none", background: "#dc2626",
                color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: ".8rem",
              }}>Xóa</button>
              <button data-sfx="soft" onClick={() => setConfirmDel(false)} style={{
                padding: "7px 14px", borderRadius: 10, border: "1px solid #e8c4b8", background: "#fff",
                color: "#8a6a6a", cursor: "pointer", fontWeight: 600, fontSize: ".8rem",
              }}>Thôi</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
