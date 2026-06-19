import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from "react";
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

const wine = "var(--c1)", gold = "var(--c2)";
// Cover art pool — cycles every load (sacred + cozy art; add more files to /public/img to expand)
const COVERS = ["/img/red-sea.gif","/img/moses-staff.gif","/img/jesus-water.jpg","/img/jesus-boat.jpg","/img/jesus-oil.jpg"];
// Style options for the picker (key + label + icon + 3-color swatch)
const THEMES = [
  { key: "light",  name: "Sacred",  icon: "✝️", sw: ["#7a4a4a", "#c9a84c", "#fdf8f2"] },
  { key: "dark",   name: "Cyber",   icon: "🕹️", sw: ["#00ff9c", "#00d0ff", "#04080a"] },
  { key: "cozy",   name: "Cozy",    icon: "🧸", sw: ["#a05c2c", "#d98e4a", "#f9efe2"] },
  { key: "cutie",  name: "Cutie",   icon: "🎨", sw: ["#5b8fd1", "#e89bb8", "#fdf6ee"] },
  { key: "nature", name: "Nature",  icon: "🌿", sw: ["#6f9e57", "#a7c47f", "#f2f5e6"] },
];
// Main section tabs (mobile-first: switch sections instead of long scroll)
const SECTION_TABS = [
  ["plan",  "📋", "Kế hoạch"],
  ["stats", "📊", "Biểu đồ"],
  ["habit", "💪", "Thói quen"],
  ["word",  "📖", "Lời Chúa"],
];

// ===== Productivity scoring system =====
// Every realm is valued. Base points are close together; real "impact" comes
// from a task's priority (Urgent/Important), which applies to any type — so a
// family or chore task can be just as high-impact as work. Your strongest realm
// of the day earns you a fun identity title.
const SCORE_CATS = {
  work:     { key: "work",     label: "Công Việc", emoji: "⚒️", color: "#2f6df0", title: "Thợ Cày Sự Nghiệp", desc: "việc ở công ty" },
  personal: { key: "personal", label: "Bản Thân",  emoji: "🚀", color: "#7c3aed", title: "Nhà Kiến Tạo",      desc: "dự án & việc cá nhân" },
  chore:    { key: "chore",    label: "Việc Nhà",  emoji: "🧹", color: "#c0883b", title: "Quán Quân Tổ Ấm",   desc: "dọn dẹp, chi tiêu, lặt vặt" },
  care:     { key: "care",     label: "Chăm Sóc",  emoji: "🌿", color: "#3aa17e", title: "Trái Tim Ấm Áp",    desc: "gia đình, sức khỏe, nghỉ ngơi" },
};
const CAT_ORDER = ["work", "personal", "chore", "care"];
function taskBaseScore(task) {
  const t = (task.taskType || "").toLowerCase();
  // base points stay close — every realm is meaningful in its own way
  let base = 6;
  if (t.includes("work")) base = 8;
  else if (t.includes("personal")) base = 8;
  else if (t.includes("family")) base = 8;
  else if (t.includes("health")) base = 7;
  else if (t.includes("chore")) base = 6;
  else if (t.includes("entertainment")) base = 5;
  else if (t.includes("vacation")) base = 5;
  // "impact" comes from priority — applies to ANY type (a family task can be high-impact too)
  const pr = (task.priority || []).join(" ").toLowerCase();
  if (pr.includes("urgent")) base += 8;
  else if (pr.includes("important")) base += 5;
  return base;
}
function taskCategory(task) {
  const t = (task.taskType || "").toLowerCase();
  if (t.includes("work")) return "work";
  if (t.includes("personal")) return "personal";
  if (t.includes("chore")) return "chore";
  return "care"; // health, family, entertainment, vacation, untyped
}

// ===== Sorting =====
// Priority weight for sorting (higher = surfaces first)
function priorityRank(task) {
  const p = (task.priority || []).join(" ").toLowerCase();
  if (p.includes("urgent")) return 2;
  if (p.includes("important")) return 1;
  return 0;
}
function priorityEmoji(task) {
  const p = (task.priority || []).join(" ").toLowerCase();
  return p.includes("urgent") ? "🔴" : p.includes("important") ? "🟡" : "";
}
// Stable display order for "sort by type"
const TYPE_SORT_ORDER = ["work", "personal", "health", "chore", "family", "entertainment", "vacation"];
function typeRank(task) {
  const t = (task.taskType || "").toLowerCase();
  const i = TYPE_SORT_ORDER.findIndex(k => t.includes(k));
  return i < 0 ? TYPE_SORT_ORDER.length : i;
}
// Combined priority for the "Ưu tiên" sort: Plan 🔥 must → 🔴 Urgent → 🟡 Important → normal → 💤 optional
function planPriorityRank(task, tierMap = {}) {
  const tier = tierMap[task.id];
  if (tier === "must") return 4;
  const pr = priorityRank(task);
  if (pr === 2) return 3;   // urgent
  if (pr === 1) return 2;   // important
  if (tier === "optional") return 0;
  return 1;                 // normal
}
// Sort a task list by the chosen mode. `order` is a {id:number} manual-order map.
// Returns a NEW array; ties fall back to the list's original order (stable).
function sortTasks(list, mode, order = {}, tierMap = {}) {
  const idx = new Map(list.map((t, i) => [t.id, i]));
  const manual = (t) => (order[t.id] != null ? order[t.id] : 100000 + idx.get(t.id));
  const arr = [...list];
  if (mode === "manual") {
    arr.sort((a, b) => manual(a) - manual(b));
  } else if (mode === "priority") {
    arr.sort((a, b) => (planPriorityRank(b, tierMap) - planPriorityRank(a, tierMap)) || (manual(a) - manual(b)));
  } else if (mode === "type") {
    arr.sort((a, b) => (typeRank(a) - typeRank(b)) || (priorityRank(b) - priorityRank(a)) || (idx.get(a.id) - idx.get(b.id)));
  }
  return arr;
}
// Analyze a set of tasks for one day → totals, completion, score by category, mood
function analyzeDay(dayTasks, mood) {
  const cats = {};
  CAT_ORDER.forEach(k => { cats[k] = { earned: 0, possible: 0, doneN: 0, n: 0 }; });
  let done = 0;
  dayTasks.forEach(t => {
    const c = taskCategory(t), s = taskBaseScore(t);
    cats[c].possible += s; cats[c].n += 1;
    if (t.done) { cats[c].earned += s; cats[c].doneN += 1; done += 1; }
  });
  const earned = CAT_ORDER.reduce((s, k) => s + cats[k].earned, 0);
  const possible = CAT_ORDER.reduce((s, k) => s + cats[k].possible, 0);
  const total = dayTasks.length;
  return { total, done, rate: total ? done / total : 0, earned, possible, cats, mood: mood || null };
}
// Which realm earned the most points today → the day's identity (null if nothing done)
function dominantCat(a) {
  let best = null, bestV = 0;
  CAT_ORDER.forEach(k => { if (a.cats[k].earned > bestV) { bestV = a.cats[k].earned; best = k; } });
  return best;
}
// Rule-based motivational coach note (Bible-themed) for a day's analysis
const COACH_VERSES = [
  "“Hãy làm việc hết lòng như làm cho Chúa.” — Cl 3:23",
  "“Tôi làm được mọi sự nhờ Đấng ban sức mạnh.” — Pl 4:13",
  "“Đây là ngày Chúa đã làm ra, nào ta hãy hân hoan.” — Tv 118:24",
  "“Hãy phó thác đường đời cho Chúa.” — Tv 37:5",
  "“Ai trung tín việc nhỏ sẽ trung tín việc lớn.” — Lc 16:10",
  "“Niềm vui trong Chúa là sức mạnh của anh em.” — Nkm 8:10",
];
function coachNote(a, dayLabel) {
  if (a.total === 0) return { tone: "rest", title: "Ngày nghỉ ngơi", body: `${dayLabel} chưa có việc nào. Một khoảng lặng để nạp lại năng lượng cũng là điều tốt lành.`, verse: COACH_VERSES[3], badge: null };
  const pct = Math.round(a.rate * 100);
  let title, body, tone;
  if (pct === 100) { tone = "triumph"; title = "Trọn vẹn! 🏆"; body = `${dayLabel} bạn hoàn thành tất cả ${a.total} việc (${a.earned} điểm).`; }
  else if (pct >= 70) { tone = "great"; title = "Một ngày mạnh mẽ 💪"; body = `${dayLabel} xong ${a.done}/${a.total} việc, được ${a.earned} điểm.`; }
  else if (pct >= 40) { tone = "ok"; title = "Tiến đều 🌱"; body = `${dayLabel} xong ${a.done}/${a.total} việc. Mỗi bước nhỏ đều đáng quý.`; }
  else if (pct > 0) { tone = "low"; title = "Khởi đầu là được 🤍"; body = `${dayLabel} mới xong ${a.done}/${a.total}. Không sao, ngày mai lại tiếp tục.`; }
  else { tone = "low"; title = "Chưa bắt đầu 🌅"; body = `${dayLabel} còn ${a.total} việc đang chờ. Bắt đầu từ việc nhỏ nhất nhé.`; }
  const dom = dominantCat(a);
  let badge = null;
  if (dom) {
    const c = SCORE_CATS[dom];
    badge = { emoji: c.emoji, title: c.title, color: c.color };
    body += ` Hôm nay bạn nghiêng về ${c.label.toLowerCase()} — xứng danh ${c.title}.`;
  }
  const verse = COACH_VERSES[Math.abs(hashStr(dayLabel)) % COACH_VERSES.length];
  return { tone, title, body, verse, badge };
}
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }



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
        <div style={{ fontSize: ".62rem", fontWeight: 700, letterSpacing: ".05em", color: "var(--c-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.25rem", fontWeight: 600, color: wine, lineHeight: 1.2 }}>
          {loading ? "—" : sub}
        </div>
        <div style={{ fontSize: ".58rem", color: "var(--c-muted2)" }}>hoàn thành</div>
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
// current UI theme drives which sound palette plays
let _uiTheme = "light";
function setSoundTheme(t) { _uiTheme = t; }

// retro digital blip — square wave with fast decay (dark/arcade palette)
function blip(ctx, { freq = 880, dur = 0.06, gain = 0.05, type = "square", glideTo = null, cutoff = 3200, when = 0, reverb = 0 }) {
  const t0 = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = cutoff;
  osc.type = type; osc.frequency.setValueAtTime(freq, t0);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(lp); lp.connect(g); g.connect(_master);
  if (reverb > 0) { const s = ctx.createGain(); s.gain.value = reverb; g.connect(s); s.connect(_reverb); }
  osc.start(t0); osc.stop(t0 + dur + 0.03);
}

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
// woody / creamy-keyboard hit: soft lowpassed attack "thock" + struck wooden body
// with fast decay and a slight downward pitch glide (like a marimba bar / keycap)
function wood(ctx, { freq = 300, gain = 0.07, dur = 0.1, glide = 0.86, cutoff = 1500, reverb = 0.12, when = 0, click = 0.035, body = "triangle" }) {
  const t0 = ctx.currentTime + when;
  // attack transient — short lowpassed noise (the creamy "thock", warm not clicky)
  if (click > 0) {
    const n = Math.max(1, Math.floor(ctx.sampleRate * 0.018));
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = cutoff * 1.5;
    const g = ctx.createGain(); g.gain.setValueAtTime(click, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.022);
    src.connect(lp); lp.connect(g); g.connect(_master);
    src.start(t0); src.stop(t0 + 0.025);
  }
  // body — struck wooden tone
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = cutoff;
  osc.type = body; osc.frequency.setValueAtTime(freq, t0);
  osc.frequency.exponentialRampToValueAtTime(freq * glide, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(lp); lp.connect(g); g.connect(_master);
  if (reverb > 0) { const s = ctx.createGain(); s.gain.value = reverb; g.connect(s); s.connect(_reverb); }
  osc.start(t0); osc.stop(t0 + dur + 0.03);
  // soft sub layer for a deeper, cozier thock
  const sub = ctx.createOscillator();
  const sg = ctx.createGain();
  sub.type = "sine"; sub.frequency.setValueAtTime(freq * 0.5, t0);
  sg.gain.setValueAtTime(0.0001, t0);
  sg.gain.exponentialRampToValueAtTime(gain * 0.5, t0 + 0.006);
  sg.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * 0.8);
  sub.connect(sg); sg.connect(_master);
  sub.start(t0); sub.stop(t0 + dur + 0.03);
}

// Semantic UI sounds — warm wood / creamy-keyboard, each call varies slightly
const SFX = {
  // generic tap — creamy keycap "thock"
  tick() { const c = actx(); if (!c) return; const v = rnd(0.93, 1.07);
    if (_uiTheme === "dark") { blip(c, { freq: 1100 * v, dur: 0.045, gain: 0.04, cutoff: 2800 }); return; }
    if (_uiTheme === "cozy") { wood(c, { freq: 205 * v, gain: 0.085, dur: 0.055, cutoff: 1050, reverb: 0.05, click: 0.07, glide: 0.8 }); return; }
    if (_uiTheme === "cutie") { voice(c, { type: "sine", freq: 1318 * v, dur: 0.1, gain: 0.05, attack: 0.004, cutoff: 4000, reverb: 0.18 }); voice(c, { type: "sine", freq: 2637 * v, dur: 0.05, gain: 0.012, cutoff: 6000, reverb: 0.1 }); return; }
    if (_uiTheme === "nature") { wood(c, { freq: 392 * v, gain: 0.06, dur: 0.1, cutoff: 1500, reverb: 0.18, click: 0.02, glide: 0.95 }); return; }
    wood(c, { freq: 300 * v, gain: 0.07, dur: 0.085, cutoff: 1400, reverb: 0.1, click: 0.04 });
  },
  // selection — light wooden marimba note (slightly brighter, two-tone)
  pop() { const c = actx(); if (!c) return; const v = rnd(0.92, 1.08);
    if (_uiTheme === "dark") {
      blip(c, { freq: 660 * v, dur: 0.05, gain: 0.045, glideTo: 990 * v });
      blip(c, { freq: 1320 * v, dur: 0.04, gain: 0.02, when: 0.045 });
      return;
    }
    if (_uiTheme === "cozy") {
      wood(c, { freq: 215 * v, gain: 0.08, dur: 0.05, cutoff: 1050, reverb: 0.05, click: 0.065, glide: 0.8 });
      wood(c, { freq: 265 * v, gain: 0.06, dur: 0.05, cutoff: 1150, reverb: 0.05, click: 0.04, glide: 0.82, when: 0.045 });
      return;
    }
    if (_uiTheme === "cutie") { voice(c, { type: "sine", freq: 1046 * v, dur: 0.11, gain: 0.06, cutoff: 4000, glideTo: 1568 * v, glideAt: 0.09, reverb: 0.2 }); voice(c, { type: "triangle", freq: 2092 * v, dur: 0.06, gain: 0.015, cutoff: 6000, when: 0.05, reverb: 0.12 }); return; }
    if (_uiTheme === "nature") { wood(c, { freq: 523 * v, gain: 0.06, dur: 0.13, cutoff: 1700, glide: 1.12, reverb: 0.2, click: 0.015 }); return; }
    wood(c, { freq: 392 * v, gain: 0.075, dur: 0.13, cutoff: 1700, reverb: 0.16, glide: 0.92, click: 0.03 });
    wood(c, { freq: 588 * v, gain: 0.03, dur: 0.09, cutoff: 2000, reverb: 0.14, when: 0.04, click: 0 });
  },
  // confirm/save — warm ascending wooden marimba C–E–G (low octave), cozy tail
  confirm() { const c = actx(); if (!c) return; const v = rnd(0.99, 1.01);
    if (_uiTheme === "dark") { // arcade power-up: fast ascending square arpeggio
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        blip(c, { freq: f * v, dur: 0.07, gain: 0.05, when: i * 0.05, cutoff: 3600, reverb: 0.12 }));
      return;
    }
    if (_uiTheme === "cozy") { // satisfying typing burst + warm note
      [195, 230, 210, 275].forEach((f, i) => wood(c, { freq: f * v, gain: 0.075, dur: 0.05, cutoff: 1100, reverb: 0.05, click: 0.06, glide: 0.8, when: i * 0.055 }));
      wood(c, { freq: 392 * v, gain: 0.05, dur: 0.22, cutoff: 1500, reverb: 0.25, glide: 0.97, when: 0.24, click: 0 });
      return;
    }
    if (_uiTheme === "cutie") { [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => voice(c, { type: "sine", freq: f * v, dur: 0.22, gain: 0.05, cutoff: 5000, reverb: 0.22, when: i * 0.06 })); return; }
    if (_uiTheme === "nature") { [392, 493.88, 587.33, 783.99].forEach((f, i) => voice(c, { type: "sine", freq: f * v, dur: 0.26, gain: 0.055, cutoff: 2200, reverb: 0.28, when: i * 0.08 })); return; }
    wood(c, { freq: 261.63 * v, gain: 0.08, dur: 0.2, cutoff: 1500, reverb: 0.28, glide: 0.96 });
    wood(c, { freq: 329.63 * v, gain: 0.07, dur: 0.22, cutoff: 1600, reverb: 0.3, glide: 0.96, when: 0.085, click: 0.02 });
    wood(c, { freq: 392.00 * v, gain: 0.065, dur: 0.26, cutoff: 1700, reverb: 0.34, glide: 0.96, when: 0.17, click: 0.02 });
  },
  // cancel/close — low descending wooden thock
  soft() { const c = actx(); if (!c) return; const v = rnd(0.97, 1.03);
    if (_uiTheme === "dark") { blip(c, { freq: 720 * v, dur: 0.09, gain: 0.04, glideTo: 360 * v }); return; }
    if (_uiTheme === "cozy") { wood(c, { freq: 165 * v, gain: 0.08, dur: 0.07, cutoff: 900, reverb: 0.06, click: 0.06, glide: 0.75 }); return; }
    if (_uiTheme === "cutie") { voice(c, { type: "sine", freq: 880 * v, dur: 0.16, gain: 0.05, cutoff: 3500, glideTo: 587 * v, glideAt: 0.14, reverb: 0.18 }); return; }
    if (_uiTheme === "nature") { wood(c, { freq: 330 * v, gain: 0.06, dur: 0.16, cutoff: 1200, glide: 0.78, reverb: 0.2, click: 0.02 }); return; }
    wood(c, { freq: 294 * v, gain: 0.07, dur: 0.16, cutoff: 1200, reverb: 0.16, glide: 0.78 });
  },
  // nav (day/week) — smooth airy whoosh, soft and rounded (no woody knock)
  swoosh() { const c = actx(); if (!c) return; const up = Math.random() > 0.5;
    if (_uiTheme === "dark") { voice(c, { type: "sine", freq: up ? 440 : 1040, dur: 0.17, gain: 0.03, cutoff: 3400, glideTo: up ? 1040 : 440, glideAt: 0.15, reverb: 0.18 }); return; }
    noise(c, { dur: 0.2, gain: 0.014, type: "lowpass", freq: up ? 760 : 1700, q: 0.4, sweepTo: up ? 1700 : 760, reverb: 0.24 });
    voice(c, { type: "sine", freq: up ? 523.25 : 783.99, dur: 0.18, gain: 0.032, cutoff: 3600, glideTo: up ? 783.99 : 523.25, glideAt: 0.16, reverb: 0.28 });
  },
  // swipe reveal (drag a task left) — soft short "snick"
  swipe() { const c = actx(); if (!c) return;
    if (_uiTheme === "dark") { blip(c, { freq: 1200, dur: 0.05, gain: 0.025, glideTo: 760, cutoff: 3200 }); return; }
    noise(c, { dur: 0.08, gain: 0.011, type: "bandpass", freq: 2600, q: 0.7, sweepTo: 1500, reverb: 0.12 });
    voice(c, { type: "sine", freq: 932, dur: 0.08, gain: 0.018, cutoff: 3600, glideTo: 660, glideAt: 0.07, reverb: 0.12 });
  },
  // delete — soft descending whoosh-away (gentle, not a hollow knock)
  danger() { const c = actx(); if (!c) return;
    if (_uiTheme === "dark") { blip(c, { freq: 520, dur: 0.16, gain: 0.04, glideTo: 130, cutoff: 2200, reverb: 0.2 }); return; }
    voice(c, { type: "sine", freq: 560, dur: 0.24, gain: 0.045, cutoff: 2600, glideTo: 175, glideAt: 0.22, reverb: 0.26 });
    voice(c, { type: "triangle", freq: 300, dur: 0.18, gain: 0.016, cutoff: 1800, glideTo: 120, glideAt: 0.16, reverb: 0.2, when: 0.02 });
    noise(c, { dur: 0.16, gain: 0.009, type: "lowpass", freq: 1200, q: 0.3, sweepTo: 320, reverb: 0.2 });
  },
};
function playClick(kind = "tick") { try { (SFX[kind] || SFX.tick)(); } catch {} }
// Subtle haptic feedback on supported mobile devices (native-app feel)
function haptic(ms = 12) { try { if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(ms); } catch {} }

// Celebration ding — warm wooden marimba arpeggio (cozy), random key each time
const DING_VARIANTS = [
  [261.63, 329.63, 392.00, 523.25],  // C major
  [293.66, 369.99, 440.00, 587.33],  // D major
  [220.00, 277.18, 329.63, 440.00],  // A major
  [246.94, 311.13, 369.99, 493.88],  // B major
  [196.00, 246.94, 293.66, 392.00],  // G major
];
function playDing() {
  const c = actx(); if (!c) return;
  if (_uiTheme === "dark") { // arcade victory: rapid square fanfare + sparkle, random key
    const base = [523.25, 587.33, 659.25, 783.99][Math.floor(Math.random() * 4)];
    [1, 1.25, 1.5, 2].forEach((m, i) =>
      blip(c, { freq: base * m, dur: 0.09, gain: 0.06, when: i * 0.07, cutoff: 4000, reverb: 0.16 }));
    blip(c, { freq: base * 3, dur: 0.16, gain: 0.025, when: 0.3, glideTo: base * 4, cutoff: 5200, reverb: 0.3 });
    return;
  }
  if (_uiTheme === "cozy") { // happy typing flourish + warm wooden chime
    [200, 240, 220, 280, 260].forEach((f, i) => wood(c, { freq: f, gain: 0.08, dur: 0.05, cutoff: 1100, reverb: 0.05, click: 0.06, glide: 0.8, when: i * 0.05 }));
    wood(c, { freq: 329.63, gain: 0.07, dur: 0.3, cutoff: 1600, reverb: 0.3, glide: 0.97, when: 0.28, click: 0 });
    wood(c, { freq: 392, gain: 0.06, dur: 0.32, cutoff: 1700, reverb: 0.32, glide: 0.97, when: 0.38, click: 0 });
    return;
  }
  if (_uiTheme === "cutie") { // sparkly glockenspiel run
    [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568].forEach((f, i) => voice(c, { type: "sine", freq: f, dur: 0.4, gain: 0.07, cutoff: 6000, reverb: 0.3, when: i * 0.07 }));
    voice(c, { type: "triangle", freq: 2637, dur: 0.3, gain: 0.02, cutoff: 7000, reverb: 0.4, when: 0.42 });
    return;
  }
  if (_uiTheme === "nature") { // mellow ocarina arpeggio
    [392, 493.88, 587.33, 783.99, 880].forEach((f, i) => voice(c, { type: "sine", freq: f, dur: 0.42, gain: 0.07, cutoff: 2600, reverb: 0.34, when: i * 0.08 }));
    return;
  }
  const notes = DING_VARIANTS[Math.floor(Math.random() * DING_VARIANTS.length)];
  notes.forEach((f, i) => wood(c, { freq: f, gain: 0.11, dur: 0.34, cutoff: 1900, reverb: 0.3, glide: 0.97, when: i * 0.08, click: i === 0 ? 0.04 : 0.02 }));
  // soft warm shimmer to round it off
  wood(c, { freq: notes[3] * 1.5, gain: 0.035, dur: 0.3, cutoff: 2400, reverb: 0.42, glide: 1.0, when: 0.24, click: 0 });
}
// Soft descending two-note chime for un-completing a task (gentle, not a thock)
function playUndo() {
  const c = actx(); if (!c) return;
  if (_uiTheme === "dark") { blip(c, { freq: 880, dur: 0.14, gain: 0.04, glideTo: 440, cutoff: 3000, reverb: 0.18 }); return; }
  voice(c, { type: "sine", freq: 783.99, dur: 0.16, gain: 0.045, cutoff: 3500, reverb: 0.26 });
  voice(c, { type: "sine", freq: 587.33, dur: 0.22, gain: 0.038, cutoff: 3200, reverb: 0.32, when: 0.085 });
}

// Soft pickup "lift" when grabbing a task to drag
function playLift() {
  const c = actx(); if (!c) return;
  if (_uiTheme === "dark") { blip(c, { freq: 660, dur: 0.08, gain: 0.03, glideTo: 1320, cutoff: 4000, reverb: 0.2 }); return; }
  voice(c, { type: "sine", freq: 784, dur: 0.16, gain: 0.04, cutoff: 4500, glideTo: 1175, glideAt: 0.14, reverb: 0.3 });
  noise(c, { dur: 0.08, gain: 0.008, type: "highpass", freq: 5000, q: 0.4, reverb: 0.2 });
}
// Ethereal "drop into place" — dreamy shimmer chord with long reverb (drag-reorder settle)
function playDrop() {
  const c = actx(); if (!c) return;
  if (_uiTheme === "dark") {
    [880, 1320, 1760].forEach((f, i) => blip(c, { freq: f, dur: 0.2, gain: 0.035, when: i * 0.02, cutoff: 5200, reverb: 0.4 }));
    blip(c, { freq: 2640, dur: 0.34, gain: 0.014, when: 0.06, glideTo: 3520, cutoff: 6000, reverb: 0.55 });
    return;
  }
  // warm/light themes: airy major add9 + high sparkle tail, generous reverb (satisfying + dreamy)
  [523.25, 659.25, 783.99, 987.77].forEach((f, i) => voice(c, { type: "sine", freq: f, dur: 0.55, gain: 0.05, attack: 0.006, cutoff: 5200, reverb: 0.5, when: i * 0.02 }));
  voice(c, { type: "sine", freq: 1567.98, dur: 0.45, gain: 0.018, cutoff: 6800, reverb: 0.6, when: 0.05 });
  noise(c, { dur: 0.32, gain: 0.01, type: "highpass", freq: 4200, q: 0.4, reverb: 0.45 });
}

// Mode-switch sound: digital boot-up into dark, warm chord back to light
function playThemeSwitch(next) {
  const c = actx(); if (!c) return;
  if (next === "cutie") { [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => voice(c, { type: "sine", freq: f, dur: 0.3, gain: 0.06, cutoff: 6000, reverb: 0.3, when: i * 0.05 })); return; }
  if (next === "nature") { noise(c, { dur: 0.4, gain: 0.015, type: "bandpass", freq: 3500, q: 0.6, sweepTo: 5000, reverb: 0.3 }); [392, 523.25, 659.25].forEach((f, i) => voice(c, { type: "sine", freq: f, dur: 0.35, gain: 0.05, cutoff: 2400, reverb: 0.32, when: 0.1 + i * 0.09 })); return; }
  if (next === "cozy") { // cozy boot: mech keyboard riff
    [190, 230, 210, 260, 240].forEach((f, i) => wood(c, { freq: f, gain: 0.08, dur: 0.055, cutoff: 1050, reverb: 0.05, click: 0.065, glide: 0.8, when: i * 0.06 }));
    return;
  }
  if (next === "dark") {
    blip(c, { type: "sawtooth", freq: 200, dur: 0.22, gain: 0.04, glideTo: 1800, cutoff: 3000, reverb: 0.2 });
    [880, 1108.7, 1318.5].forEach((f, i) => blip(c, { freq: f, dur: 0.08, gain: 0.04, when: 0.2 + i * 0.06, reverb: 0.2 }));
  } else {
    wood(c, { freq: 261.63, gain: 0.08, dur: 0.3, cutoff: 1600, reverb: 0.32, glide: 0.97 });
    wood(c, { freq: 329.63, gain: 0.07, dur: 0.32, cutoff: 1700, reverb: 0.34, glide: 0.97, when: 0.1, click: 0.02 });
    wood(c, { freq: 392.00, gain: 0.06, dur: 0.36, cutoff: 1800, reverb: 0.38, glide: 0.97, when: 0.2, click: 0.02 });
  }
}

// Sparkle burst emanating from the task box outline (done celebration)
function Particles({ width, height, onDone }) {
  const COLORS = (
    _uiTheme === "dark" ? ["#00ff9c","#00d0ff","#7dffc8","#baffe3","#00ffd5","#66ffb8"] :
    _uiTheme === "cutie" ? ["#5b8fd1","#e89bb8","#f0a93f","#86c5e8","#f7c5d9","#ffe0a3"] :
    _uiTheme === "nature" ? ["#6f9e57","#a7c47f","#e2885c","#c3d99a","#88b06a","#eccf8f"] :
    ["#c9a84c","#f0dea0","#e8c4b8","#d4a5a5","#b8860b","#dcc77a"]
  );
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

function TaskRow({ task, tier, onToggle, onEdit, onDelete, removing, justDone, justUndone }) {
  const [phase, setPhase] = useState("idle"); // idle | celebrating | reversing | done
  const [dims, setDims] = useState({ w: 280, h: 48 });
  const [swipeX, setSwipeX] = useState(0);
  const rowRef = useRef(null);
  const dragRef = useRef({ startX: 0, startY: 0, active: false, moved: false, baseX: 0 });

  useEffect(() => {
    if (justDone && task.done) {
      if (rowRef.current) {
        setDims({ w: rowRef.current.offsetWidth, h: rowRef.current.offsetHeight });
      }
      setPhase("celebrating");
      const t = setTimeout(() => setPhase("done"), 1000);
      return () => clearTimeout(t);
    } else if (justUndone && !task.done) {
      setPhase("reversing");
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
  const isMust = tier === "must";       // bắt buộc hôm nay → bold outline
  const isOptional = tier === "optional"; // để dành → faded

  // swipe gesture (pan-y preserved for page scroll)
  const onPD = (e) => { dragRef.current = { startX: e.clientX, startY: e.clientY, active: true, moved: false, baseX: swipeX }; };
  const onPM = (e) => {
    const d = dragRef.current; if (!d.active) return;
    const dx = e.clientX - d.startX, dy = e.clientY - d.startY;
    if (!d.moved && (Math.abs(dx) < 9 || Math.abs(dy) > Math.abs(dx))) return;
    d.moved = true;
    setSwipeX(Math.min(0, Math.max(-84, d.baseX + dx)));
  };
  const onPU = () => {
    const d = dragRef.current; if (!d.active) return; d.active = false;
    if (!d.moved) return;
    const open = swipeX < -42;
    if (open) playClick("swipe");
    setSwipeX(open ? -72 : 0);
  };
  const guardTap = (fn) => () => {
    if (dragRef.current.moved) { dragRef.current.moved = false; return; }
    if (swipeX < 0) { setSwipeX(0); return; } // tap closes the swipe first
    fn();
  };

  return (
    <div className={removing ? "task-shrink" : ""} style={{ position: "relative", overflow: removing ? "hidden" : "visible" }}>
      {/* delete action revealed behind on swipe */}
      <button data-sfx="danger" onClick={() => { setSwipeX(0); onDelete && onDelete(task.id); }} style={{
        position: "absolute", top: 2, bottom: 7, right: 0, width: 62, border: "none",
        borderRadius: 10, background: "#dc2626", color: "#fff", fontWeight: 800, fontSize: "1.1rem",
        cursor: "pointer", opacity: Math.min(1, -swipeX / 60), pointerEvents: swipeX < -40 ? "auto" : "none",
        display: "flex", alignItems: "center", justifyContent: "center",
        transform: `scale(${0.7 + Math.min(1, -swipeX / 72) * 0.3})`, transition: "transform .18s",
      }}>✕</button>

      <div ref={rowRef}
        onPointerDown={onPD} onPointerMove={onPM} onPointerUp={onPU} onPointerCancel={onPU}
        className={`task-row ${isDoneSettled ? "task-done" : ""} ${celebrating ? "task-rainbow" : ""} ${reversing ? "task-unpop" : ""}`}
        style={{
          opacity: celebrating ? 1 : (isDoneSettled ? .62 : (isOptional ? .5 : 1)),
          borderLeft: `5px solid ${accent}`,
          boxShadow: (celebrating || reversing) ? undefined : ([
            !isDoneSettled ? `inset 3px 0 0 ${accent}` : "",
            isMust ? "0 0 0 2px var(--c2)" : "",
          ].filter(Boolean).join(", ") || undefined),
          background: (!isDoneSettled && !celebrating && !reversing) ? `${accent}26` : undefined,
          transform: `translateX(${swipeX}px)`,
          transition: dragRef.current.active ? "none" : "transform .26s cubic-bezier(.22,1,.36,1), opacity .5s cubic-bezier(.22,1,.36,1), background .5s cubic-bezier(.22,1,.36,1), box-shadow .45s cubic-bezier(.22,1,.36,1)",
          touchAction: "pan-y",
        }}>
        <div className={`check ${task.done ? "on" : ""}`}
          onClick={guardTap(() => onToggle(task.id, !task.done))}
          style={!task.done ? { borderColor: accent } : undefined}>
          {task.done ? "✓" : ""}
        </div>
        <div style={{ flex: 1 }} onClick={guardTap(() => onToggle(task.id, !task.done))}>
          <div className="task-name-text" style={{ fontSize: ".9rem", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", wordBreak: "break-word" }}>
            {task.icon} {task.name}
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 3 }}>
            {task.taskType && <span className="tag" style={tagStyle(task.taskType)}>{task.taskType}</span>}
            {task.priority?.map(p => <span key={p} className="tag" style={p.toLowerCase().includes("urgent") ? { background: "#fee2e2", color: "#dc2626" } : { background: "#fef9c3", color: "#ca8a04" }}>{p}</span>)}
            {task.project?.map(p => <span key={p} className="tag" style={{ background: "#e0f2fe", color: "#0369a1" }}>{p}</span>)}
          </div>
        </div>
        <button onClick={(e) => { e.stopPropagation(); if (dragRef.current.moved) { dragRef.current.moved = false; return; } onEdit(task); }} style={{
          flexShrink: 0, width: 28, height: 28, borderRadius: 8, border: "none",
          background: "transparent", color: "var(--c-muted2)", cursor: "pointer", fontSize: "1rem",
          display: "flex", alignItems: "center", justifyContent: "center",
        }} title="Sửa">⋯</button>
      </div>
      {celebrating && (
        <Particles width={dims.w} height={dims.h} onDone={() => setPhase("done")} />
      )}
    </div>
  );
}

// ---- Sortable / draggable task list ----
// FLIP-animates row position changes (sort switches & drag-reorder). When
// `draggable`, each row gets a ⠿ handle; dragging reorders with a gap-shift
// preview, an ethereal drop sound + pop on release.
function SortableTaskList({ items, draggable, onReorder, renderRow }) {
  const wrapRef = useRef(null);
  const flipTops = useRef(new Map());
  const dragRef = useRef(null);
  const [drag, setDrag] = useState(null); // { from, dy, tgt, h }
  const orderKey = items.map(t => t.id).join(",");

  // FLIP: animate rows from their previous position to the new one (skipped mid-drag)
  useLayoutEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const nodes = [...el.querySelectorAll("[data-fid]")];
    if (!dragRef.current) {
      nodes.forEach(n => {
        const id = n.dataset.fid, nt = n.getBoundingClientRect().top, ot = flipTops.current.get(id);
        if (ot != null && Math.abs(ot - nt) > 1) {
          n.style.transition = "none";
          n.style.transform = `translateY(${ot - nt}px)`;
          requestAnimationFrame(() => {
            n.style.transition = "transform .32s cubic-bezier(.2,1,.3,1)";
            n.style.transform = "";
          });
        }
      });
    }
    const m = new Map();
    nodes.forEach(n => m.set(n.dataset.fid, n.getBoundingClientRect().top));
    flipTops.current = m;
  }, [orderKey]);

  const measure = () => {
    const el = wrapRef.current; if (!el) return [];
    return [...el.querySelectorAll("[data-fid]")].map(n => ({ top: n.getBoundingClientRect().top, h: n.offsetHeight }));
  };
  const onDown = (e, from) => {
    if (!draggable) return;
    e.preventDefault(); e.stopPropagation();
    const rects = measure();
    dragRef.current = { from, startY: e.clientY, tgt: from, rects, h: rects[from]?.h || 48 };
    setDrag({ from, dy: 0, tgt: from, h: dragRef.current.h });
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    playLift(); haptic(8);
  };
  const onMove = (e) => {
    const d = dragRef.current; if (!d) return;
    const dy = e.clientY - d.startY;
    const pointerY = d.rects[d.from].top + d.h / 2 + dy;
    let tgt = d.from;
    if (dy > 0) { for (let i = d.from + 1; i < d.rects.length; i++) { if (pointerY > d.rects[i].top + d.rects[i].h / 2) tgt = i; } }
    else { for (let i = d.from - 1; i >= 0; i--) { if (pointerY < d.rects[i].top + d.rects[i].h / 2) tgt = i; } }
    d.tgt = tgt;
    setDrag({ from: d.from, dy, tgt, h: d.h });
  };
  const onUp = () => {
    const d = dragRef.current; if (!d) return;
    const { from, tgt } = d;
    // capture current visual positions (incl. drag transforms) so FLIP animates from here
    const el = wrapRef.current;
    if (el) { const m = new Map(); [...el.querySelectorAll("[data-fid]")].forEach(n => m.set(n.dataset.fid, n.getBoundingClientRect().top)); flipTops.current = m; }
    dragRef.current = null;
    setDrag(null);
    if (tgt !== from) {
      const ids = items.map(t => t.id);
      const [moved] = ids.splice(from, 1);
      ids.splice(tgt, 0, moved);
      playDrop(); haptic(15);
      onReorder(ids);
      requestAnimationFrame(() => {
        const node = wrapRef.current && wrapRef.current.querySelector(`[data-fid="${CSS && CSS.escape ? CSS.escape(moved) : moved}"]`);
        if (node) { node.classList.remove("task-drop-pop"); void node.offsetWidth; node.classList.add("task-drop-pop"); node.addEventListener("animationend", () => node.classList.remove("task-drop-pop"), { once: true }); }
      });
    } else {
      playClick("soft");
    }
  };

  const rowTransform = (i) => {
    if (!drag) return "";
    if (i === drag.from) return `translateY(${drag.dy}px) scale(1.03)`;
    if (drag.tgt > drag.from && i > drag.from && i <= drag.tgt) return `translateY(${-drag.h}px)`;
    if (drag.tgt < drag.from && i < drag.from && i >= drag.tgt) return `translateY(${drag.h}px)`;
    return "";
  };

  return (
    <div ref={wrapRef}>
      {items.map((t, i) => {
        const lifted = drag && drag.from === i;
        return (
          <div key={t.id} data-fid={t.id} style={{
            position: "relative",
            transform: rowTransform(i),
            zIndex: lifted ? 30 : 1,
            transition: drag ? (lifted ? "none" : "transform .18s ease") : "transform .2s ease",
            filter: lifted ? "drop-shadow(0 10px 18px rgba(0,0,0,.22))" : undefined,
            opacity: lifted ? 0.96 : 1,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {draggable && (
                <div onPointerDown={(e) => onDown(e, i)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
                  title="Kéo để sắp xếp thứ tự"
                  style={{ flex: "0 0 auto", alignSelf: "stretch", display: "flex", alignItems: "center", justifyContent: "center", width: 24, cursor: "grab", color: "var(--c-muted2)", fontSize: "1.05rem", touchAction: "none", userSelect: "none" }}>⠿</div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>{renderRow(t)}</div>
            </div>
          </div>
        );
      })}
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
        <span style={{ fontSize: ".7rem", fontWeight: 700, letterSpacing: ".08em", color: "var(--c-muted)" }}>TÂM TRẠNG · {dayLabel}</span>
        <span style={{ fontSize: ".66rem", color: "var(--c-muted2)" }}>Tv 118:24</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div key={v} className="mood-emoji-pop" style={{ fontSize: "2.4rem", lineHeight: 1, filter: value ? "none" : "grayscale(.6) opacity(.6)", minWidth: 44, textAlign: "center" }}>
          {info?.emoji}
        </div>
        <div style={{ flex: 1 }}>
          <input
            type="range" min="1" max="5" step="1" value={v}
            onChange={e => { playClick("tick"); onChange(parseInt(e.target.value, 10)); }}
            className="mood-range"
            style={{
              width: "100%",
              background: `linear-gradient(90deg, #7a4a4a 0%, #c9a84c ${pct}%, var(--c-track) ${pct}%, var(--c-track) 100%)`,
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
        {value && <span style={{ fontSize: ".72rem", color: "var(--c-muted2)", fontStyle: "italic", marginLeft: 8 }}>· {info?.vi}</span>}
      </div>
    </div>
  );
}

// ---- Weekly dual-line chart: task count + mood across the 7 days ----
function WeekChart({ weekDays, byDate, moods }) {
  const moodColor = "var(--c-mood)"; // distinct violet for the mood line
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
        <span style={{ fontSize: ".7rem", fontWeight: 700, letterSpacing: ".08em", color: "var(--c-muted)" }}>📈 TUẦN NÀY · CÔNG VIỆC & TÂM TRẠNG</span>
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
            stroke="var(--c-track)" strokeWidth="1" />
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
            <circle cx={p[0]} cy={p[1]} r="6" fill="var(--c-surface)" stroke={moodColor} strokeWidth="1.5" />
            <text x={p[0]} y={p[1] + 3.5} textAnchor="middle" fontSize="9" fill={moodColor} fontWeight="700">✝</text>
          </g>
        ))}
        {/* x axis labels */}
        {weekDays.map((d, i) => {
          const dt = new Date(d + "T00:00:00");
          const isT = d === TODAY;
          return (
            <text key={"x" + i} x={xAt(i)} y={H - 8} textAnchor="middle" fontSize="9"
              fill={isT ? gold : "var(--c-muted2)"} fontWeight={isT ? "700" : "400"}>
              {DAYS_SHORT[dt.getDay()]}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// ---- Stacked score bar chart: 4 realms earned per day ----
function ScoreChart({ weekDays, byDate, moods }) {
  const W = 320, H = 180, padL = 16, padR = 16, padT = 22, padB = 30;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const days = weekDays.map(d => analyzeDay(byDate[d] || [], moods[d]));
  const maxEarned = Math.max(10, ...days.map(a => a.earned));
  const slot = innerW / 7;
  const barW = Math.min(26, slot * 0.6);
  const order = CAT_ORDER;
  const yTop = v => padT + innerH - (innerH * v) / maxEarned;

  const weekTotal = days.reduce((s, a) => s + a.earned, 0);

  return (
    <div className="card f3" style={{ marginBottom: 14, padding: "16px 14px 10px", overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6, padding: "0 4px" }}>
        <span style={{ fontSize: ".7rem", fontWeight: 700, letterSpacing: ".08em", color: "var(--c-muted)" }}>🏆 ĐIỂM NĂNG SUẤT · TUẦN NÀY</span>
        <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.15rem", fontWeight: 700, color: wine }}>{weekTotal}</span>
      </div>
      <div style={{ display: "flex", gap: 14, justifyContent: "center", marginBottom: 2, flexWrap: "wrap" }}>
        {order.map(k => (
          <span key={k} style={{ fontSize: ".64rem", color: SCORE_CATS[k].color, display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: SCORE_CATS[k].color, display: "inline-block" }} />
            {SCORE_CATS[k].emoji} {SCORE_CATS[k].label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
        {[0, 0.5, 1].map((g, i) => (
          <line key={i} x1={padL} x2={W - padR} y1={padT + innerH * g} y2={padT + innerH * g} stroke="var(--c-track)" strokeWidth="1" />
        ))}
        {days.map((a, i) => {
          const cx = padL + slot * i + slot / 2;
          let yCursor = padT + innerH;
          const segs = [];
          order.forEach(k => {
            const val = a.cats[k].earned;
            if (val > 0) {
              const h = (innerH * val) / maxEarned;
              yCursor -= h;
              segs.push(<rect key={k} x={cx - barW / 2} y={yCursor} width={barW} height={h} rx="2.5" fill={SCORE_CATS[k].color} opacity="0.92" />);
            }
          });
          const dt = new Date(weekDays[i] + "T00:00:00");
          const isT = weekDays[i] === TODAY;
          return (
            <g key={i}>
              {segs}
              {a.earned > 0 && <text x={cx} y={yTop(a.earned) - 5} textAnchor="middle" fontSize="9" fontWeight="700" fill={wine}>{a.earned}</text>}
              <text x={cx} y={H - 10} textAnchor="middle" fontSize="9" fill={isT ? gold : "var(--c-muted2)"} fontWeight={isT ? "700" : "400"}>{DAYS_SHORT[dt.getDay()]}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---- Insights panel: today's score breakdown + coach note + recent-day summaries ----
function ScoreBar({ cat, data }) {
  const c = SCORE_CATS[cat];
  const pct = data.n ? Math.round((data.doneN / data.n) * 100) : 0;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".72rem", marginBottom: 3, alignItems: "baseline" }}>
        <span style={{ color: c.color, fontWeight: 600 }}>{c.emoji} {c.label}</span>
        <span style={{ color: "var(--c-muted)" }}>
          <strong style={{ color: c.color }}>{data.doneN}</strong><span style={{ opacity: .55 }}>/{data.n} việc</span>
          <span style={{ opacity: .45, marginLeft: 6, fontSize: ".64rem" }}>· {data.earned}đ</span>
        </span>
      </div>
      <div style={{ height: 7, borderRadius: 5, background: "var(--c-track)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: c.color, borderRadius: 5, transition: "width .7s cubic-bezier(.34,1.3,.5,1)" }} />
      </div>
    </div>
  );
}

function InsightsPanel({ selectedDate, byDate, moods, sortMode, taskOrder, taskTier }) {
  const selObj = new Date(selectedDate + "T00:00:00");
  const selIsToday = selectedDate === TODAY;
  const dayLabel = selIsToday ? "Hôm nay" : `${DAYS[selObj.getDay()]} ${fmt(selObj)}`;
  const a = analyzeDay(byDate[selectedDate] || [], moods[selectedDate]);
  const note = coachNote(a, dayLabel);

  // AI evaluation — cached in localStorage by date; only re-calls when the day's
  // signature changes (tasks done/added or time-of-day phase) or on manual ↻ refresh.
  const nowD = new Date();
  const nowHour = nowD.getHours();
  const phase = selIsToday ? (nowHour < 11 ? "Sáng" : nowHour < 19 ? "Office" : "Tối") : "";
  const sig = `${a.done}/${a.total}|${phase}`;
  const [refreshTick, setRefreshTick] = useState(0);
  const [aiNote, setAiNote] = useState(() => {
    if (typeof window === "undefined") return null;
    try { const raw = localStorage.getItem("dat-coach:" + selectedDate); if (raw) return JSON.parse(raw).note; } catch {}
    return null;
  });
  const [aiLoading, setAiLoading] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cached = null;
    try { const raw = localStorage.getItem("dat-coach:" + selectedDate); if (raw) cached = JSON.parse(raw); } catch {}
    setAiNote(cached?.note || null);
    if (a.total === 0) return;
    if (cached && cached.sig === sig) return;        // already summarised, no change → save credit
    let cancelled = false;
    setAiLoading(true);
    const SESS = [["🌅 Sáng", "Sáng"], ["🏢 Office (11–7h)", "Office"], ["🌙 Tối", "Tối"], ["", "Khác"]];
    const dayTasks = byDate[selectedDate] || [];
    const bySession = {};
    SESS.forEach(([k, label]) => {
      const items = dayTasks.filter(t => (t.session || "") === k);
      if (items.length) bySession[label] = { done: items.filter(t => t.done).map(t => t.name), pending: items.filter(t => !t.done).map(t => t.name) };
    });
    const dom = dominantCat(a);
    const pending = dayTasks.filter(t => !t.done);
    const pendingOrdered = sortTasks(pending, sortMode === "session" ? "manual" : "priority", taskOrder || {}, taskTier || {});
    const summary = {
      isToday: selIsToday,
      now: selIsToday ? `${String(nowHour).padStart(2, "0")}:${String(nowD.getMinutes()).padStart(2, "0")}` : null,
      phase: phase || null,
      ratePct: Math.round(a.rate * 100), done: a.done, total: a.total, earned: a.earned, possible: a.possible,
      dominant: dom ? SCORE_CATS[dom].label : null,
      mood: a.mood ? moodInfo(a.mood)?.label : null,
      byRealm: CAT_ORDER.reduce((o, k) => { if (a.cats[k].n > 0) o[SCORE_CATS[k].label] = `${a.cats[k].doneN}/${a.cats[k].n} việc xong`; return o; }, {}),
      bySession,
      // help the coach prioritise reminders by the user's own ordering & priority flags
      pendingInOrder: pendingOrdered.map(t => t.name),
      priorityPending: pending.filter(t => priorityRank(t) > 0).map(t => `${priorityEmoji(t)} ${t.name}`),
      // Plan Day "must-do today" tasks still pending — remind these the hardest
      mustPending: pending.filter(t => (taskTier || {})[t.id] === "must").map(t => t.name),
    };
    fetch("/api/coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dayLabel, summary }) })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => {
        if (cancelled || !d || !d.body || d.error) return;
        const note = { title: d.title, body: d.body, verse: d.verse };
        try { localStorage.setItem("dat-coach:" + selectedDate, JSON.stringify({ sig, note })); } catch {}
        setAiNote(note);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setAiLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line
  }, [selectedDate, refreshTick]);
  const refreshAi = () => { try { localStorage.removeItem("dat-coach:" + selectedDate); } catch {} setRefreshTick(t => t + 1); };
  const noteTitle = aiNote?.title || note.title;
  const noteBody = aiNote?.body || note.body;
  const noteVerse = aiNote?.verse || note.verse;

  // recent days (previous two days relative to selected)
  const prevDays = [1, 2].map(off => {
    const d = new Date(selObj); d.setDate(selObj.getDate() - off);
    const key = iso(d);
    return { key, label: off === 1 ? "Hôm qua" : "Hôm kia", dObj: d, a: analyzeDay(byDate[key] || [], moods[key]) };
  });

  // translucent tone tints — they sit over the theme-aware card bg so text stays readable in every theme
  const toneBg = {
    triumph: "rgba(201,168,76,.16)",
    great: "rgba(58,161,126,.15)",
    ok: "rgba(192,136,59,.13)",
    low: "rgba(150,120,120,.12)",
    rest: "rgba(130,87,181,.14)",
  };

  return (
    <div className="card f2" style={{ marginBottom: 14, padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "16px 18px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <span style={{ fontSize: ".7rem", fontWeight: 700, letterSpacing: ".08em", color: "var(--c-muted)" }}>📊 PHÂN TÍCH · {dayLabel.toUpperCase()}</span>
          <div style={{ textAlign: "right" }}>
            <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.7rem", fontWeight: 700, color: wine, lineHeight: 1 }}>{a.done}<span style={{ color: "var(--c-muted2)" }}>/{a.total}</span></span>
            <div style={{ fontSize: ".64rem", color: "var(--c-muted2)", marginTop: 2 }}>việc xong{a.total > 0 ? ` · ${Math.round(a.rate * 100)}%` : ""} · {a.earned}đ</div>
          </div>
        </div>
        {/* identity badge — strongest realm of the day */}
        {note.badge && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 20, background: `${note.badge.color}15`, border: `1px solid ${note.badge.color}40`, marginBottom: 12 }}>
            <span style={{ fontSize: "1rem" }}>{note.badge.emoji}</span>
            <span style={{ fontSize: ".78rem", fontWeight: 700, color: note.badge.color }}>{note.badge.title}</span>
          </div>
        )}
        {CAT_ORDER.map(k => (a.cats[k].n > 0 &&
          <ScoreBar key={k} cat={k} data={a.cats[k]} />
        ))}
      </div>

      {/* coach note */}
      <div style={{ background: toneBg[note.tone] || toneBg.ok, padding: "14px 18px", borderTop: "1px solid rgba(201,160,160,.18)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.15rem", fontWeight: 700, color: wine }}>{noteTitle}</span>
          {aiNote && <span style={{ fontSize: ".58rem", fontWeight: 700, letterSpacing: ".05em", color: "var(--c-mood)", border: "1px solid var(--c-mood)", borderRadius: 8, padding: "1px 6px" }}>✨ AI</span>}
          {aiLoading && <span style={{ fontSize: ".64rem", color: "var(--c-muted)", fontStyle: "italic" }}>đang phân tích…</span>}
          {a.total > 0 && !aiLoading && (
            <button data-sfx="pop" onClick={refreshAi} title="Làm mới đánh giá AI" style={{ marginLeft: "auto", border: "none", background: "transparent", color: "var(--c-muted2)", cursor: "pointer", fontSize: ".9rem", padding: 2 }}>↻</button>
          )}
        </div>
        <div style={{ fontSize: ".82rem", color: "var(--c-ink)", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{noteBody}</div>
        <div style={{ fontSize: ".74rem", color: "var(--c-muted)", fontStyle: "italic", marginTop: 7 }}>{noteVerse}</div>
      </div>

      {/* recent days */}
      <div style={{ display: "flex", borderTop: "1px solid rgba(201,160,160,.18)" }}>
        {prevDays.map((p, i) => (
          <div key={p.key} style={{ flex: 1, padding: "10px 14px", borderLeft: i === 1 ? "1px solid rgba(201,160,160,.18)" : "none" }}>
            <div style={{ fontSize: ".64rem", fontWeight: 700, color: "var(--c-muted)", letterSpacing: ".05em" }}>{p.label.toUpperCase()} · {DAYS_SHORT[p.dObj.getDay()]}</div>
            {p.a.total > 0 ? (
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 3 }}>
                <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.25rem", fontWeight: 700, color: wine }}>{Math.round(p.a.rate * 100)}%</span>
                <span style={{ fontSize: ".68rem", color: "var(--c-muted)" }}>{p.a.done}/{p.a.total} · {p.a.earned}đ</span>
                {p.a.mood && <span style={{ fontSize: ".9rem", marginLeft: "auto" }}>{moodInfo(p.a.mood)?.emoji}</span>}
              </div>
            ) : (
              <div style={{ fontSize: ".72rem", color: "var(--c-muted2)", marginTop: 5 }}>— không có việc —</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Create task bottom sheet ----
const ICON_CHOICES = ["💼","💻","✨","📞","💰","💵","💸","🏦","🏠","🧹","👕","🛒","📦","🍲","🥖","⛽","🏸","🏋️","🦷","💊","📄","📋","⛪","🙏","🎮","✈️","⌨️","🎧","📱","🕐"];
function CreateModal({ defaultDate, onClose, onCreate }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [taskType, setTaskType] = useState("");
  const [session, setSession] = useState("");
  const [priority, setPriority] = useState([]);
  const [project, setProject] = useState([]);
  const [date, setDate] = useState(defaultDate || TODAY);
  const [closing, setClosing] = useState(false);
  const [modalMonday, setModalMonday] = useState(mondayOf(new Date((defaultDate || TODAY) + "T00:00:00")));

  const requestClose = (action) => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => action(), 270);
  };

  const modalWeekDays = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(modalMonday);
    d.setDate(modalMonday.getDate() + i);
    modalWeekDays.push(iso(d));
  }
  const mSun = new Date(modalMonday); mSun.setDate(modalMonday.getDate() + 6);
  const modalWeekLabel = `${fmt(modalMonday)} – ${fmt(mSun)}`;

  const togglePriority = (p) => setPriority(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  const toggleProject = (p) => setProject(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  const canCreate = name.trim().length > 0;

  const submit = () => {
    if (!canCreate) return;
    requestClose(() => onCreate({ name: name.trim(), icon, taskType, session, priority, project, date }));
  };

  const chip = (sel, c) => ({
    padding: "7px 12px", borderRadius: 10, cursor: "pointer", fontSize: ".8rem", fontWeight: 600,
    border: sel ? `2px solid ${c}` : "1px solid var(--c-border)",
    background: sel ? `${typeof c === "string" && c.startsWith("#") ? c + "1a" : "rgba(0,0,0,.04)"}` : "var(--c-surface)",
    color: sel ? c : "var(--c-muted)",
  });

  return (
    <div onClick={() => requestClose(onClose)} className={`sheet-backdrop ${closing ? "closing" : ""}`} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", backdropFilter: "blur(3px)",
      display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 100,
    }}>
      <div onClick={e => e.stopPropagation()} className={`sheet ${closing ? "closing" : ""}`} style={{
        background: "var(--c-bg)", borderRadius: "20px 20px 0 0", padding: "20px 20px 28px",
        width: "100%", maxWidth: 480, boxShadow: "0 -8px 30px rgba(0,0,0,.25)",
        maxHeight: "88vh", overflowY: "auto",
      }}>
        <div style={{ width: 40, height: 4, borderRadius: 3, background: "var(--c-border)", margin: "0 auto 16px" }} />
        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.3rem", fontWeight: 700, color: wine, marginBottom: 14 }}>➕ Công việc mới</div>

        {/* Name */}
        <div style={{ marginBottom: 16 }}>
          <input autoFocus value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") submit(); }}
            placeholder="Tên công việc..."
            style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: "1.5px solid var(--c-border)",
              background: "var(--c-surface)", color: "var(--c-ink)", fontSize: "1rem", outline: "none" }} />
        </div>

        {/* Icon */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: ".7rem", fontWeight: 700, letterSpacing: ".08em", color: "var(--c-muted)", marginBottom: 8 }}>ICON {icon && <span style={{ fontSize: "1rem", marginLeft: 6 }}>{icon}</span>}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {ICON_CHOICES.map(em => (
              <button key={em} data-sfx="tick" onClick={() => setIcon(icon === em ? "" : em)} style={{
                width: 36, height: 36, borderRadius: 9, fontSize: "1.05rem", cursor: "pointer",
                border: icon === em ? `2px solid ${wine}` : "1px solid var(--c-border)",
                background: icon === em ? "rgba(122,74,74,.12)" : "var(--c-surface)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>{em}</button>
            ))}
          </div>
          <input value={icon} onChange={e => setIcon(e.target.value.slice(-2))} placeholder="...hoặc gõ emoji bất kỳ"
            style={{ width: "100%", padding: "8px 12px", borderRadius: 10, border: "1px solid var(--c-border)",
              background: "var(--c-surface)", color: "var(--c-ink)", fontSize: ".85rem", outline: "none" }} />
        </div>

        {/* Type */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: ".7rem", fontWeight: 700, letterSpacing: ".08em", color: "var(--c-muted)", marginBottom: 8 }}>LOẠI CÔNG VIỆC</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {TASK_TYPES.map(tt => {
              const sel = taskType === tt; const c = typeColor(tt);
              return <button key={tt} data-sfx="pop" data-anim="chip" onClick={() => setTaskType(sel ? "" : tt)} style={chip(sel, c)}>{tt}</button>;
            })}
          </div>
        </div>

        {/* Session */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: ".7rem", fontWeight: 700, letterSpacing: ".08em", color: "var(--c-muted)", marginBottom: 8 }}>BUỔI</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["🌅 Sáng","🏢 Office (11–7h)","🌙 Tối"].map(sn => (
              <button key={sn} data-sfx="pop" data-anim="chip" onClick={() => setSession(session === sn ? "" : sn)} style={{
                padding: "8px 14px", borderRadius: 10, cursor: "pointer", fontSize: ".82rem", fontWeight: 600,
                border: session === sn ? `2px solid ${wine}` : "1px solid var(--c-border)",
                background: session === sn ? wine : "var(--c-surface)", color: session === sn ? "var(--c-on-accent)" : "var(--c-muted)",
              }}>{sn}</button>
            ))}
          </div>
        </div>

        {/* Priority + Project */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: ".7rem", fontWeight: 700, letterSpacing: ".08em", color: "var(--c-muted)", marginBottom: 8 }}>ƯU TIÊN & DỰ ÁN</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["🔴 Urgent","🟡 Important"].map(pp => (
              <button key={pp} data-sfx="pop" data-anim="chip" onClick={() => togglePriority(pp)}
                style={chip(priority.includes(pp), pp.includes("Urgent") ? "#dc2626" : "#ca8a04")}>{pp}</button>
            ))}
            {["🔷 Nacon","🟣 VP91","🟠 KUNVANDONG"].map(pj => (
              <button key={pj} data-sfx="pop" data-anim="chip" onClick={() => toggleProject(pj)}
                style={chip(project.includes(pj), "#0369a1")}>{pj}</button>
            ))}
          </div>
        </div>

        {/* Date */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: ".7rem", fontWeight: 700, letterSpacing: ".08em", color: "var(--c-muted)" }}>NGÀY</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button data-sfx="swoosh" onClick={() => { const m = new Date(modalMonday); m.setDate(m.getDate() - 7); setModalMonday(m); }} style={{ border: "1px solid var(--c-border)", background: "var(--c-surface)", borderRadius: 8, width: 26, height: 26, cursor: "pointer", color: wine }}>‹</button>
              <span style={{ fontSize: ".72rem", color: wine, fontWeight: 600, minWidth: 90, textAlign: "center" }}>{modalWeekLabel}</span>
              <button data-sfx="swoosh" onClick={() => { const m = new Date(modalMonday); m.setDate(m.getDate() + 7); setModalMonday(m); }} style={{ border: "1px solid var(--c-border)", background: "var(--c-surface)", borderRadius: 8, width: 26, height: 26, cursor: "pointer", color: wine }}>›</button>
            </div>
          </div>
          <div className="day-tabs" style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
            {modalWeekDays.map(d => {
              const dt = new Date(d + "T00:00:00");
              const sel = d === date; const isT = d === TODAY;
              return (
                <button key={d} data-sfx="pop" data-anim="chip" onClick={() => setDate(d)} style={{
                  flex: "0 0 auto", minWidth: 46, padding: "8px 6px", borderRadius: 10, cursor: "pointer",
                  border: sel ? `2px solid ${wine}` : isT ? `1px solid ${gold}` : "1px solid var(--c-border)",
                  background: sel ? wine : "var(--c-surface)", color: sel ? "var(--c-on-accent)" : isT ? gold : "var(--c-muted)", textAlign: "center",
                }}>
                  <div style={{ fontSize: ".6rem", fontWeight: 700 }}>{DAYS_SHORT[dt.getDay()]}</div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.05rem", fontWeight: 600 }}>{dt.getDate()}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10 }}>
          <button data-sfx="soft" onClick={() => requestClose(onClose)} style={{
            flex: 1, padding: "12px", borderRadius: 12, border: "1px solid var(--c-border)",
            background: "var(--c-surface)", color: "var(--c-muted)", cursor: "pointer", fontWeight: 600, fontSize: ".9rem",
          }}>Hủy</button>
          <button data-sfx="confirm" onClick={submit} disabled={!canCreate} style={{
            flex: 2, padding: "12px", borderRadius: 12, border: "none",
            background: canCreate ? wine : "var(--c-muted2)", color: "var(--c-on-accent)",
            cursor: canCreate ? "pointer" : "not-allowed", fontWeight: 700, fontSize: ".9rem",
          }}>✨ Tạo công việc</button>
        </div>
      </div>
    </div>
  );
}

// ---- Ultimate combined chart: toggleable overlapping series ----
function UltimateChart({ weekDays, byDate, moods, pushups }) {
  const [show, setShow] = useState({ tasks: true, mood: true, pushup: true, score: false });
  const SERIES = {
    tasks:  { label: "Số task",   color: wine,            emoji: "📋" },
    mood:   { label: "Tâm trạng", color: "var(--c-mood)", emoji: "🙂" },
    pushup: { label: "Hít đất",   color: "#3aa17e",       emoji: "💪" },
    score:  { label: "Điểm",      color: "#e08e2f",       emoji: "🏆" },
  };
  const W = 320, H = 168, padL = 14, padR = 14, padT = 20, padB = 24;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const xAt = i => padL + (innerW * i) / 6;
  const days = weekDays.map(d => analyzeDay(byDate[d] || [], moods[d]));
  const counts = weekDays.map(d => (byDate[d] || []).length);
  const scores = days.map(a => a.earned);
  const pups = weekDays.map(d => pushups[d] || 0);
  const maxC = Math.max(4, ...counts), maxS = Math.max(10, ...scores), maxP = Math.max(10, ...pups);
  const yN = (v, max) => padT + innerH - (innerH * v) / max;        // normalized per-series
  const yMood = m => padT + innerH - (innerH * (m - 1)) / 4;
  const path = pts => pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");

  const cPts = counts.map((v, i) => [xAt(i), yN(v, maxC)]);
  const sPts = scores.map((v, i) => [xAt(i), yN(v, maxS)]);
  const pPts = pups.map((v, i) => [xAt(i), yN(v, maxP)]);
  const mPts = weekDays.map((d, i) => moods[d] ? [xAt(i), yMood(moods[d]), moods[d]] : null);
  let mSegs = [], seg = [];
  mPts.forEach(p => { if (p) seg.push(p); else { if (seg.length) mSegs.push(seg); seg = []; } });
  if (seg.length) mSegs.push(seg);

  const toggle = k => setShow(prev => ({ ...prev, [k]: !prev[k] }));

  return (
    <div className="card f3" style={{ marginBottom: 14, padding: "16px 14px 10px", overflow: "hidden" }}>
      <div style={{ fontSize: ".7rem", fontWeight: 700, letterSpacing: ".08em", color: "var(--c-muted)", marginBottom: 8, padding: "0 4px" }}>📊 BIỂU ĐỒ TUẦN · BẬT TẮT THÔNG SỐ</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6, padding: "0 2px" }}>
        {Object.entries(SERIES).map(([k, sr]) => (
          <button key={k} data-sfx="pop" data-anim="chip" onClick={() => toggle(k)} style={{
            padding: "5px 11px", borderRadius: 14, fontSize: ".7rem", fontWeight: 700, cursor: "pointer",
            border: show[k] ? `1.5px solid ${sr.color}` : "1px solid var(--c-border)",
            background: show[k] ? `color-mix(in srgb, ${sr.color} 14%, transparent)` : "var(--c-surface)",
            color: show[k] ? sr.color : "var(--c-muted2)", opacity: show[k] ? 1 : .65,
            transition: "all .25s",
          }}>{sr.emoji} {sr.label}</button>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
        {[0, .25, .5, .75, 1].map((g, i) => (
          <line key={i} x1={padL} x2={W - padR} y1={padT + innerH * g} y2={padT + innerH * g} stroke="var(--c-track)" strokeWidth="1" />
        ))}
        {show.tasks && <>
          <path d={path(cPts)} fill="none" stroke={wine} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
          {cPts.map((p, i) => <g key={"c"+i}><circle cx={p[0]} cy={p[1]} r="2.6" fill={wine} />
            {counts[i] > 0 && <text x={p[0]} y={p[1] - 6} textAnchor="middle" fontSize="8" fill={wine} fontWeight="700">{counts[i]}</text>}</g>)}
        </>}
        {show.score && <>
          <path d={path(sPts)} fill="none" stroke="#e08e2f" strokeWidth="1.6" strokeDasharray="5 3" strokeLinejoin="round" strokeLinecap="round" />
          {sPts.map((p, i) => scores[i] > 0 && <text key={"s"+i} x={p[0]} y={p[1] + 3} textAnchor="middle" fontSize="8.5" fill="#e08e2f" fontWeight="700">◆</text>)}
        </>}
        {show.pushup && <>
          <path d={path(pPts)} fill="none" stroke="#3aa17e" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
          {pPts.map((p, i) => pups[i] > 0 && <g key={"p"+i}><circle cx={p[0]} cy={p[1]} r="2.6" fill="#3aa17e" />
            <text x={p[0]} y={p[1] - 6} textAnchor="middle" fontSize="8" fill="#3aa17e" fontWeight="700">{pups[i]}</text></g>)}
        </>}
        {show.mood && <>
          {mSegs.map((sg, si) => <path key={"m"+si} d={path(sg)} fill="none" stroke="var(--c-mood)" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />)}
          {mPts.map((p, i) => p && <text key={"me"+i} x={p[0]} y={p[1] + 4} textAnchor="middle" fontSize="11">{moodInfo(p[2])?.emoji}</text>)}
        </>}
        {weekDays.map((d, i) => {
          const dt = new Date(d + "T00:00:00"); const isT = d === TODAY;
          return <text key={"x"+i} x={xAt(i)} y={H - 7} textAnchor="middle" fontSize="9" fill={isT ? gold : "var(--c-muted2)"} fontWeight={isT ? "700" : "400"}>{DAYS_SHORT[dt.getDay()]}</text>;
        })}
      </svg>
    </div>
  );
}

// ---- Push-up tracker: animated counter, week graph, streak + coach ----
function useCountUp(target) {
  const [shown, setShown] = useState(target);
  const prevRef = useRef(target);
  useEffect(() => {
    const from = prevRef.current, to = target;
    prevRef.current = target;
    if (from === to) return;
    const t0 = performance.now(), durMs = 420;
    let raf;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / durMs);
      const e = 1 - Math.pow(1 - k, 3); // easeOutCubic
      setShown(Math.round(from + (to - from) * e));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return shown;
}
function pushupCoach(today, best, streak) {
  if (today === 0) return "Chưa cái nào — bắt đầu với 5 cái thôi! “Hãy mạnh mẽ và can đảm.” (Gs 1:9) 💪";
  if (best > 0 && today >= best && today > 0) return `KỶ LỤC MỚI ${today} cái! 🎉 “Tôi làm được mọi sự nhờ Đấng ban sức mạnh.” (Pl 4:13)`;
  if (today >= 50) return `${today} cái — quá khủng! Cơ thể là đền thờ, và bạn đang chăm sóc nó thật tốt 🏛️`;
  if (today >= 20) return `${today} cái — phong độ ổn định! Giữ nhịp này nhé 🔥`;
  return `${today} cái — khởi động tốt! Thêm vài cái nữa nào 🌱`;
}
function PushupTracker({ pushups, weekDays, selectedDate, onAdd, onSet }) {
  const isToday = selectedDate === TODAY;
  const dObj = new Date(selectedDate + "T00:00:00");
  const dayLabel = isToday ? "HÔM NAY" : `${DAYS[dObj.getDay()].toUpperCase()} · ${fmt(dObj)}`;
  const dayCount = pushups[selectedDate] || 0;
  const shown = useCountUp(dayCount);
  const all = Object.entries(pushups);
  const best = all.length ? Math.max(...all.map(([, n]) => n)) : 0;
  // streak: consecutive days with count > 0 ending today (or yesterday if today=0)
  let streak = 0;
  { const d = new Date(TODAY + "T00:00:00");
    if (!pushups[TODAY]) d.setDate(d.getDate() - 1);
    while (pushups[iso(d)] > 0) { streak++; d.setDate(d.getDate() - 1); } }

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  useEffect(() => { setEditing(false); }, [selectedDate]);
  const saveDraft = () => { const v = parseInt(draft, 10); if (!isNaN(v)) onSet(selectedDate, v); setEditing(false); };

  const coach = isToday
    ? pushupCoach(dayCount, best, streak)
    : (dayCount > 0 ? `${dayCount} cái — ghi nhận cho ngày này 💪` : "Ngày này chưa ghi cái nào — có thể chỉnh lại nếu bạn nhớ ra 🙂");

  return (
    <div className="card f3" style={{ marginBottom: 14, padding: "16px 18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: ".7rem", fontWeight: 700, letterSpacing: ".08em", color: "var(--c-muted)" }}>💪 HÍT ĐẤT · {dayLabel}</span>
        <span style={{ fontSize: ".66rem", color: "var(--c-muted2)" }}>🔥 {streak} ngày liên tiếp · 🏆 kỷ lục {best}</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
        {editing ? (
          <input autoFocus type="number" inputMode="numeric" value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") saveDraft(); if (e.key === "Escape") setEditing(false); }}
            onBlur={saveDraft}
            style={{ width: 90, fontFamily: "'Cormorant Garamond',serif", fontSize: "2.2rem", fontWeight: 700, color: wine, textAlign: "center", border: `2px solid ${wine}`, borderRadius: 12, background: "var(--c-surface)", outline: "none" }} />
        ) : (
          <button onClick={() => { setDraft(String(dayCount)); setEditing(true); }} title="Chạm để nhập số chính xác"
            style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "3rem", fontWeight: 700, color: wine, lineHeight: 1, minWidth: 86, textAlign: "center", border: "none", background: "transparent", cursor: "pointer", padding: 0 }}>
            {shown}
          </button>
        )}
        <div style={{ flex: 1, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[1, 5, 10].map(n => (
            <button key={n} data-sfx="pop" data-anim="chip" onClick={() => onAdd(selectedDate, n)} style={{
              flex: "1 0 auto", padding: "12px 8px", borderRadius: 12, border: `1.5px solid ${wine}`,
              background: "var(--c-surface)", color: wine, fontWeight: 800, fontSize: "1rem", cursor: "pointer",
            }}>+{n}</button>
          ))}
          <button data-sfx="soft" onClick={() => onAdd(selectedDate, -1)} title="Lùi 1" style={{
            flex: "0 0 auto", padding: "12px 12px", borderRadius: 12, border: "1px solid var(--c-border)",
            background: "var(--c-surface)", color: "var(--c-muted)", fontWeight: 700, cursor: "pointer",
          }}>−1</button>
        </div>
      </div>

      <div style={{ fontSize: ".8rem", color: "var(--c-muted)", fontStyle: "italic" }}>{coach}</div>
    </div>
  );
}

// ---- AI chat sheet: talk to the assistant to create tasks by message ----
function ChatSheet({ onClose, onCreateTasks, today, weekDays }) {
  const [closing, setClosing] = useState(false);
  const [msgs, setMsgs] = useState([{ role: "assistant", content: "Chào Dat! 👋 Mình giúp bạn thêm việc nè. Cứ nói tự nhiên, ví dụ: \"Mai sáng đi chợ, chiều office làm FX KUN, tối gọi bà ngoại\" — mình sẽ tạo task giúp bạn ✝️" }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);
  const requestClose = () => { if (closing) return; setClosing(true); setTimeout(onClose, 270); };
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [msgs, busy]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const next = [...msgs, { role: "user", content: text }];
    setMsgs(next); setInput(""); setBusy(true);
    try {
      const r = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, today, weekDays }),
      });
      const d = await r.json();
      const created = Array.isArray(d.tasks) ? d.tasks : [];
      if (created.length) onCreateTasks(created);
      const note = created.length ? `\n\n✅ Đã thêm ${created.length} việc: ${created.map(t => t.name).join(", ")}` : "";
      setMsgs(m => [...m, { role: "assistant", content: (d.reply || "Đã xong!") + note }]);
    } catch {
      setMsgs(m => [...m, { role: "assistant", content: "Có lỗi kết nối, thử lại nhé!" }]);
    }
    setBusy(false);
  };

  return (
    <div onClick={requestClose} className={`sheet-backdrop ${closing ? "closing" : ""}`} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", backdropFilter: "blur(3px)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 110 }}>
      <div onClick={e => e.stopPropagation()} className={`sheet ${closing ? "closing" : ""}`} style={{ background: "var(--c-bg)", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, boxShadow: "0 -8px 30px rgba(0,0,0,.25)", height: "76vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--c-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.2rem", fontWeight: 700, color: wine }}>💬 Trợ lý lập kế hoạch</div>
          <button data-sfx="soft" onClick={requestClose} style={{ border: "none", background: "transparent", color: "var(--c-muted)", fontSize: "1.4rem", cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {msgs.map((m, i) => (
            <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "82%", padding: "9px 13px", borderRadius: 14, whiteSpace: "pre-wrap", lineHeight: 1.45, fontSize: ".88rem", background: m.role === "user" ? wine : "var(--c-surface)", color: m.role === "user" ? "var(--c-on-accent)" : "var(--c-ink)", border: m.role === "user" ? "none" : "1px solid var(--c-border)" }}>
              {m.content}
            </div>
          ))}
          {busy && <div style={{ alignSelf: "flex-start", color: "var(--c-muted)", fontSize: ".85rem", fontStyle: "italic" }}>đang soạn…</div>}
        </div>
        <div style={{ padding: "12px 14px", borderTop: "1px solid var(--c-border)", display: "flex", gap: 8 }}>
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") send(); }} placeholder="Nói việc cần thêm…" disabled={busy}
            style={{ flex: 1, padding: "11px 14px", borderRadius: 12, border: "1.5px solid var(--c-border)", background: "var(--c-surface)", color: "var(--c-ink)", fontSize: ".95rem", outline: "none" }} />
          <button data-sfx="confirm" onClick={send} disabled={busy || !input.trim()} style={{ padding: "0 18px", borderRadius: 12, border: "none", background: input.trim() ? wine : "var(--c-muted2)", color: "var(--c-on-accent)", fontWeight: 700, cursor: input.trim() ? "pointer" : "default" }}>Gửi</button>
        </div>
      </div>
    </div>
  );
}

// ---- Plan Day: tasks grouped by buổi, drag between groups (sets session) + order ----
const PLAN_GROUPS = [
  { session: "🌅 Sáng", label: "🌅 Buổi sáng" },
  { session: "🏢 Office (11–7h)", label: "🏢 Office · 11–7h" },
  { session: "🌙 Tối", label: "🌙 Buổi tối" },
  { session: "", label: "📋 Chưa xếp buổi" },
];
const PlanLine = () => <div style={{ height: 3, borderRadius: 2, background: "var(--c2)", margin: "3px 6px", boxShadow: "0 0 6px var(--c2)" }} />;

// Cross-group drag board: drag a task into a buổi group → sets session + order.
// Tap a task → toggle 🔥 priority (with pop motion + sound).
function PlanBoard({ groups, mustIds, onToggleMust, onMove }) {
  const [drag, setDrag] = useState(null);   // { id, name, icon, w, ptrX, ptrY }
  const dragRef = useRef(null);             // mutable target: { id, overSession, overIndex, ... }
  const rowRefs = useRef(new Map());
  const groupRefs = useRef(new Map());
  const [pop, setPop] = useState(null);  // priority-select burst: { id, n, w, h }
  const handleTap = (id) => {
    const becoming = !mustIds.has(id);
    onToggleMust(id);
    if (becoming) {
      playDing(); haptic(16);
      const el = rowRefs.current.get(id);
      setPop({ id, n: (pop ? pop.n : 0) + 1, w: el ? el.offsetWidth : 280, h: el ? el.offsetHeight : 48 });
    } else { playClick("soft"); haptic(6); }
  };

  const computeTarget = (y) => {
    const d = dragRef.current; if (!d) return;
    let over = null, near = d.overSession, best = Infinity;
    groups.forEach(g => {
      const el = groupRefs.current.get(g.session); if (!el) return;
      const r = el.getBoundingClientRect();
      if (y >= r.top && y <= r.bottom) over = g.session;
      const dist = Math.abs(y - (r.top + r.bottom) / 2);
      if (dist < best) { best = dist; near = g.session; }
    });
    const session = over != null ? over : near;
    const g = groups.find(gr => gr.session === session);
    let idx = 0;
    if (g) {
      const others = g.items.filter(t => t.id !== d.id);
      for (let i = 0; i < others.length; i++) {
        const el = rowRefs.current.get(others[i].id); if (!el) continue;
        const r = el.getBoundingClientRect();
        if (y > r.top + r.height / 2) idx = i + 1;
      }
    }
    d.overSession = session; d.overIndex = idx;
  };
  const onDown = (e, t) => {
    e.preventDefault(); e.stopPropagation();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    const el = rowRefs.current.get(t.id);
    dragRef.current = { id: t.id, w: el ? el.offsetWidth : 280, overSession: t.session || "", overIndex: 0 };
    playLift(); haptic(10);
    computeTarget(e.clientY);
    setDrag({ id: t.id, name: t.name, icon: t.icon, w: dragRef.current.w, ptrX: e.clientX, ptrY: e.clientY });
  };
  const onMoveEvt = (e) => {
    if (!dragRef.current) return;
    computeTarget(e.clientY);
    setDrag(s => s && { ...s, ptrX: e.clientX, ptrY: e.clientY });
  };
  const onUp = () => {
    const d = dragRef.current; if (!d) return;
    dragRef.current = null;
    setDrag(null);
    playDrop(); haptic(15);
    onMove(d.id, d.overSession, d.overIndex);
  };

  const dr = dragRef.current;
  const overSession = dr ? dr.overSession : null;
  const overIndex = dr ? dr.overIndex : -1;

  return (
    <div>
      {groups.map(g => {
        const items = drag ? g.items.filter(t => t.id !== drag.id) : g.items;
        const isOver = !!drag && overSession === g.session;
        return (
          <div key={g.session || "none"} ref={el => { if (el) groupRefs.current.set(g.session, el); }} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: ".7rem", fontWeight: 700, letterSpacing: ".06em", color: g.session ? wine : "var(--c-muted)", marginBottom: 6, padding: "4px 8px", background: g.session ? "rgba(232,196,184,.25)" : "transparent", borderRadius: 8, display: "inline-block" }}>{g.label}{items.length ? ` · ${items.length}` : ""}</div>
            <div style={{ minHeight: 34, borderRadius: 10, padding: "2px 0", background: isOver ? "color-mix(in srgb, var(--c2) 9%, transparent)" : "transparent", transition: "background .15s" }}>
              {items.length === 0 && (
                <div style={{ fontSize: ".72rem", color: "var(--c-muted2)", fontStyle: "italic", padding: "9px 10px", textAlign: "center" }}>{isOver ? "↓ thả vào đây" : "— trống —"}</div>
              )}
              {items.map((t, i) => {
                const must = mustIds.has(t.id);
                return (
                  <div key={t.id}>
                    {isOver && overIndex === i && <PlanLine />}
                    <div ref={el => { if (el) rowRefs.current.set(t.id, el); }} style={{ marginBottom: 7, position: "relative" }}>
                      <div style={{ display: "flex", alignItems: "stretch", gap: 6 }}>
                        <div onPointerDown={e => onDown(e, t)} onPointerMove={onMoveEvt} onPointerUp={onUp} onPointerCancel={onUp} title="Kéo qua buổi khác / xếp thứ tự" style={{ flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", width: 26, cursor: "grab", color: "var(--c-muted2)", fontSize: "1.1rem", touchAction: "none", userSelect: "none" }}>⠿</div>
                        <div onClick={() => handleTap(t.id)} className={"plan-row" + (pop && pop.id === t.id ? " task-drop-pop" : "")} style={{ flex: 1, minWidth: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 9, padding: "9px 10px", borderRadius: 12, background: must ? "color-mix(in srgb, var(--c2) 12%, transparent)" : "var(--c-surface)", opacity: must ? 1 : .7, border: must ? "1.5px solid var(--c2)" : "1px solid var(--c-border)", boxShadow: must ? "0 0 0 2px color-mix(in srgb, var(--c2) 38%, transparent)" : "none", transition: "opacity .2s, box-shadow .2s, border-color .2s, background .2s" }}>
                          <span key={must ? "m" : "o"} className="mood-emoji-pop" style={{ fontSize: "1.3rem", lineHeight: 1 }}>{must ? "🔥" : "💤"}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: ".9rem", fontWeight: 600, color: "var(--c-ink)", lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{t.icon} {t.name}</div>
                            <div style={{ fontSize: ".62rem", fontWeight: 700, letterSpacing: ".04em", color: must ? "var(--c1)" : "var(--c-muted2)" }}>{must ? "ƯU TIÊN HÔM NAY" : "chạm để ưu tiên · ưu tiên thấp"}</div>
                          </div>
                        </div>
                      </div>
                      {pop && pop.id === t.id && <Particles key={pop.n} width={pop.w} height={pop.h} onDone={() => setPop(p => (p && p.id === t.id ? null : p))} />}
                    </div>
                  </div>
                );
              })}
              {isOver && overIndex >= items.length && <PlanLine />}
            </div>
          </div>
        );
      })}
      {drag && (
        <div style={{ position: "fixed", left: 0, top: 0, transform: `translate(${drag.ptrX - 28}px, ${drag.ptrY - 18}px)`, width: Math.max(160, drag.w - 26), pointerEvents: "none", zIndex: 200 }}>
          <div style={{ padding: "9px 11px", borderRadius: 12, background: "var(--c-surface)", border: "1.5px solid var(--c2)", boxShadow: "0 14px 30px rgba(0,0,0,.32)", transform: "rotate(-1.5deg) scale(1.03)" }}>
            <div style={{ fontSize: ".9rem", fontWeight: 600, color: "var(--c-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{drag.icon} {drag.name}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function PlanSheet({ date, tasks, taskTier, taskOrder, onMove, onClose, onCommit }) {
  const [closing, setClosing] = useState(false);
  const [mustIds, setMustIds] = useState(() => new Set(tasks.filter(t => taskTier[t.id] === "must").map(t => t.id)));
  const requestClose = (fn) => { if (closing) return; setClosing(true); setTimeout(fn, 270); };
  const dObj = new Date(date + "T00:00:00");
  const label = date === TODAY ? "Hôm nay" : `${DAYS[dObj.getDay()]} ${fmt(dObj)}`;
  const toggleMust = (id) => {
    setMustIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const groups = PLAN_GROUPS.map(g => ({ ...g, items: sortTasks(tasks.filter(t => (t.session || "") === g.session), "manual", taskOrder) }));
  const mustN = tasks.filter(t => mustIds.has(t.id)).length;

  return (
    <div onClick={() => requestClose(onClose)} className={`sheet-backdrop ${closing ? "closing" : ""}`} style={{ position: "fixed", inset: 0, background: "rgba(74,48,48,.45)", backdropFilter: "blur(3px)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 110 }}>
      <div onClick={e => e.stopPropagation()} className={`sheet ${closing ? "closing" : ""}`} style={{ background: "var(--c-bg)", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, boxShadow: "0 -8px 30px rgba(122,74,74,.25)", height: "86vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "16px 18px 10px" }}>
          <div style={{ width: 40, height: 4, borderRadius: 3, background: "var(--c-border)", margin: "0 auto 14px" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.3rem", fontWeight: 700, color: wine }}>🗂️ Lên kế hoạch · {label}</span>
            <button data-sfx="soft" onClick={() => requestClose(onClose)} style={{ border: "none", background: "transparent", color: "var(--c-muted)", fontSize: "1.4rem", cursor: "pointer", lineHeight: 1 }}>×</button>
          </div>
          <div style={{ fontSize: ".74rem", color: "var(--c-muted)", marginTop: 4 }}>
            Kéo <strong>⠿</strong> việc vào nhóm <strong>buổi</strong> (xếp luôn thứ tự); chạm việc để chọn <strong style={{ color: "var(--c1)" }}>🔥 ưu tiên</strong> — việc không chọn sẽ 💤 ưu tiên thấp.
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "4px 16px 14px" }}>
          {tasks.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 10px", color: "var(--c-muted2)", fontSize: ".88rem", fontStyle: "italic" }}>🕊️ Ngày này chưa có việc nào.<br />Thêm việc rồi quay lại nhé.</div>
          ) : (
            <PlanBoard groups={groups} mustIds={mustIds} onToggleMust={toggleMust} onMove={onMove} />
          )}
        </div>

        <div style={{ padding: "10px 16px calc(14px + env(safe-area-inset-bottom))", borderTop: "1px solid var(--c-border)" }}>
          <div style={{ fontSize: ".7rem", color: "var(--c-muted2)", textAlign: "center", marginBottom: 8 }}>🔥 {mustN} ưu tiên · 💤 {tasks.length - mustN} ưu tiên thấp · {tasks.length} việc</div>
          <button data-sfx="confirm" onClick={() => requestClose(() => onCommit([...mustIds]))} disabled={tasks.length === 0} style={{
            width: "100%", padding: "13px", borderRadius: 14, border: "none",
            background: tasks.length ? wine : "var(--c-muted2)", color: "var(--c-on-accent)",
            cursor: tasks.length ? "pointer" : "not-allowed", fontWeight: 800, fontSize: ".95rem",
          }}>✓ Chốt kế hoạch ngày</button>
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
  const [slideDir, setSlideDir] = useState(1); // +1 = slide from right, -1 = from left
  const goToDate = (d) => { setSlideDir(d >= selectedDate ? 1 : -1); setSelectedDate(d); };
  const [editTask, setEditTask] = useState(null);
  const [justDone, setJustDone] = useState(null);
  const [justUndone, setJustUndone] = useState(null);
  const [verse, setVerse] = useState(VERSES[0]);
  const [verseLoading, setVerseLoading] = useState(false);
  const [moods, setMoods] = useState({}); // date -> score, from localStorage
  const [showCreate, setShowCreate] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [theme, setTheme] = useState("light");
  const [themeFlipping, setThemeFlipping] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [pushups, setPushups] = useState({}); // date -> count
  const [coverIdx, setCoverIdx] = useState(0);
  useEffect(() => { setCoverIdx(Math.floor(Math.random() * COVERS.length)); }, []);

  // Task sorting: mode + manual drag order (both persisted per-device)
  const [sortMode, setSortMode] = useState("session"); // session | priority | type (all grouped by buổi)
  const [taskOrder, setTaskOrder] = useState({});       // { taskId: orderIndex }
  const [taskTier, setTaskTier] = useState({});         // { taskId: "must" | "optional" }  (Plan Day)
  const [plannedDays, setPlannedDays] = useState({});   // { "YYYY-MM-DD": true }
  const [planning, setPlanning] = useState(false);      // Plan Day sheet open
  const [tab, setTab] = useState("plan");               // plan | stats | habit | word
  const changeTab = (t) => { setTab(t); try { localStorage.setItem("dat-tab", t); } catch {} };
  useEffect(() => {
    try {
      const tb = localStorage.getItem("dat-tab");
      if (["plan", "stats", "habit", "word"].includes(tb)) setTab(tb);
      const m = localStorage.getItem("dat-sortmode");
      if (["session", "priority", "type"].includes(m)) setSortMode(m);
      const o = localStorage.getItem("dat-task-order");
      if (o) setTaskOrder(JSON.parse(o));
      const tr = localStorage.getItem("dat-task-tier");
      if (tr) setTaskTier(JSON.parse(tr));
      const pd = localStorage.getItem("dat-planned-days");
      if (pd) setPlannedDays(JSON.parse(pd));
    } catch {}
  }, []);
  const changeSortMode = (m) => { setSortMode(m); try { localStorage.setItem("dat-sortmode", m); } catch {} };
  const markPlanned = (date) => {
    setPlannedDays(prev => { const next = { ...prev, [date]: true }; try { localStorage.setItem("dat-planned-days", JSON.stringify(next)); } catch {} return next; });
  };
  const reorderTasks = (ids) => {
    setTaskOrder(prev => {
      const next = { ...prev };
      ids.forEach((id, i) => { next[id] = i; });
      try { localStorage.setItem("dat-task-order", JSON.stringify(next)); } catch {}
      return next;
    });
    // sync order to Notion (shared across devices), best effort
    fetch("/api/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orders: ids.map((id, i) => ({ id, order: i })) }) }).catch(() => {});
  };
  // Commit a whole day's plan: each task → "must" or "optional" (one synced batch)
  const applyTiers = (pairs) => {
    setTaskTier(prev => {
      const next = { ...prev };
      pairs.forEach(({ id, tier }) => { if (!tier || tier === "normal") delete next[id]; else next[id] = tier; });
      try { localStorage.setItem("dat-task-tier", JSON.stringify(next)); } catch {}
      return next;
    });
    fetch("/api/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tiers: pairs }) }).catch(() => {});
  };
  // Set one task's tier (from Edit sheet) — "must" | "optional" | "normal"/null
  const setTierFor = (id, tier) => {
    setTaskTier(prev => {
      const next = { ...prev };
      if (!tier || tier === "normal") delete next[id]; else next[id] = tier;
      try { localStorage.setItem("dat-task-tier", JSON.stringify(next)); } catch {}
      return next;
    });
    fetch("/api/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, tier: tier === "normal" ? null : tier }) }).catch(() => {});
  };
  // Plan Day drag: move a task into a buổi group at an index → set session + order
  const planMove = (id, toSession, toIndex) => {
    const moved = tasks.find(t => t.id === id); if (!moved) return;
    const members = sortTasks(tasks.filter(t => t.date === selectedDate && (t.session || "") === toSession && t.id !== id), "manual", taskOrder).map(t => t.id);
    members.splice(Math.max(0, Math.min(toIndex, members.length)), 0, id);
    reorderTasks(members);
    if ((moved.session || "") !== toSession) updateTask(id, { session: toSession });
  };

  // Theme: load saved choice, keep sound engine in sync
  useEffect(() => {
    try {
      const t = localStorage.getItem("dat-theme");
      if (["light","dark","cozy","cutie","nature"].includes(t)) { setTheme(t); setSoundTheme(t); }
    } catch {}
  }, []);
  const switchTheme = (next) => {
    if (!next || next === theme) { setShowThemePicker(false); return; }
    setTheme(next); setSoundTheme(next);
    try { localStorage.setItem("dat-theme", next); } catch {}
    playThemeSwitch(next);
    setThemeFlipping(true);
    setTimeout(() => setThemeFlipping(false), 520);
    setShowThemePicker(false);
  };

  // Create a task: optimistic insert, then swap temp id for the real Notion id
  const createTask = async (draft) => {
    const tempId = "temp-" + Date.now();
    const optimistic = {
      id: tempId, name: draft.name, icon: draft.icon || "", done: false,
      date: draft.date || null, session: draft.session || "",
      taskType: draft.taskType || "", priority: draft.priority || [], project: draft.project || [],
    };
    setTasks(prev => [...prev, optimistic]);
    playClick("confirm");
    try {
      const r = await fetch("/api/create", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!r.ok) throw new Error("create failed");
      const d = await r.json();
      setTasks(prev => prev.map(t => t.id === tempId ? { ...t, id: d.id } : t));
    } catch {
      setTasks(prev => prev.filter(t => t.id !== tempId)); // roll back
    }
  };

  // Push-ups: local cache + Notion sync (synced across devices). Ref keeps the
  // latest counts for arithmetic without stale closures.
  const pushupsRef = useRef({});
  useEffect(() => { pushupsRef.current = pushups; }, [pushups]);
  const refetchPushups = useCallback(() => {
    fetch("/api/pushup")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => {
        if (!d || !d.counts) return;
        setPushups(prev => {
          const merged = { ...prev, ...d.counts };
          try { localStorage.setItem("dat-pushups", JSON.stringify(merged)); } catch {}
          return merged;
        });
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    try {
      const cached = localStorage.getItem("dat-pushups");
      if (cached) setPushups(JSON.parse(cached));
    } catch {}
    refetchPushups();
  }, [refetchPushups]);
  // Re-sync when returning to the tab (other devices may have updated counts)
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") refetchPushups(); };
    window.addEventListener("focus", onVis);
    document.addEventListener("visibilitychange", onVis);
    return () => { window.removeEventListener("focus", onVis); document.removeEventListener("visibilitychange", onVis); };
  }, [refetchPushups]);
  const writePushup = (date, value) => {
    const next = Math.max(0, Math.round(value) || 0);
    setPushups(prev => {
      const merged = { ...prev, [date]: next };
      try { localStorage.setItem("dat-pushups", JSON.stringify(merged)); } catch {}
      return merged;
    });
    fetch("/api/pushup", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, count: next }),
    }).catch(() => {});
  };
  const addPushupsFor = (date, delta) => writePushup(date, (pushupsRef.current[date] || 0) + delta);
  const setPushupsFor = (date, value) => writePushup(date, value);

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
      // Auto roll-over: unfinished tasks from past days are moved forward to today
      const overdue = d.tasks.filter(t => t.date && t.date < TODAY && !t.done);
      const rolled = overdue.length
        ? d.tasks.map(t => (t.date && t.date < TODAY && !t.done) ? { ...t, date: TODAY } : t)
        : d.tasks;
      setTasks(rolled);
      overdue.forEach(t => {
        fetch("/api/update", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: t.id, date: TODAY }) }).catch(() => {});
      });
      // hydrate Plan Day tier/order from Notion (cross-device), merged over local cache
      const tFromN = {}, oFromN = {};
      rolled.forEach(t => { if (t.planTier) tFromN[t.id] = t.planTier; if (typeof t.planOrder === "number") oFromN[t.id] = t.planOrder; });
      if (Object.keys(tFromN).length) setTaskTier(prev => { const m = { ...prev, ...tFromN }; try { localStorage.setItem("dat-task-tier", JSON.stringify(m)); } catch {} return m; });
      if (Object.keys(oFromN).length) setTaskOrder(prev => { const m = { ...prev, ...oFromN }; try { localStorage.setItem("dat-task-order", JSON.stringify(m)); } catch {} return m; });
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
      playDing(); haptic(18);
      setJustDone(id);
      setTimeout(() => setJustDone(j => j === id ? null : j), 1100);
    } else {
      playUndo(); haptic(8);
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
      if (patch.priority !== undefined) body.priority = patch.priority;
      if (patch.project !== undefined) body.project = patch.project;
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

  // Shrink-out animation, then run the action (delete or move-day)
  const [removingId, setRemovingId] = useState(null);
  const removeWithShrink = (id, action) => {
    setRemovingId(id);
    setTimeout(() => { setRemovingId(null); action(); }, 300);
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

  // Day navigation — move ±1 day, rolling the week when crossing its edge
  const shiftDay = (delta) => {
    haptic(9);
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() + delta);
    const nd = iso(d);
    setSlideDir(delta);
    if (!weekSet.has(nd)) setWeekMonday(mondayOf(d));
    setSelectedDate(nd);
  };
  const shiftWeek = (delta) => {
    haptic(9);
    setSlideDir(delta);
    const m = new Date(weekMonday); m.setDate(m.getDate() + delta * 7); setWeekMonday(m);
  };
  const resetToToday = () => { haptic(12); setSlideDir(1); setWeekMonday(mondayOf(new Date())); setSelectedDate(TODAY); };
  // Day buttons = primary (wine, bold); week buttons = secondary (muted, double-chevron)
  const dayNavBtn = { padding: "8px 11px", borderRadius: 11, border: `1.5px solid ${wine}`, background: "var(--c-surface)", color: wine, cursor: "pointer", fontWeight: 800, fontSize: ".76rem", whiteSpace: "nowrap", lineHeight: 1, display: "inline-flex", alignItems: "center", gap: 3 };
  const weekNavBtn = { padding: "8px 10px", borderRadius: 11, border: "1px solid var(--c-border)", background: "var(--c-surface)", color: "var(--c-muted)", cursor: "pointer", fontWeight: 700, fontSize: ".68rem", whiteSpace: "nowrap", lineHeight: 1, display: "inline-flex", alignItems: "center", gap: 2 };
  const renderTaskRow = (t) => (
    <TaskRow task={t} tier={taskTier[t.id]} onToggle={toggle} onEdit={setEditTask}
      justDone={justDone === t.id} justUndone={justUndone === t.id}
      removing={removingId === t.id} onDelete={(id) => removeWithShrink(id, () => deleteTask(id))} />
  );

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
  // a day counts as "planned" if marked locally or any of its tasks has a tier (synced)
  const isPlanned = (date) => !!plannedDays[date] || (byDate[date] || []).some(t => taskTier[t.id]);

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
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#7a4a4a" />
        <meta name="apple-mobile-web-app-title" content="Dat Planner" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Nunito:wght@300;400;600;700&family=Chakra+Petch:wght@400;500;700&family=Patrick+Hand&family=Baloo+2:wght@400;500;700;800&display=swap" rel="stylesheet" />
      </Head>

      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        :root, .theme-light{
          --c1:#7a4a4a; --c2:#c9a84c; --c-mood:#8257b5;
          --c-bg:#fdf8f2; --c-surface:#ffffff; --c-on-accent:#ffffff;
          --c-ink:#4a3030; --c-muted:#8a6a6a; --c-muted2:#c9a0a0;
          --c-border:#e8c4b8; --c-track:#efe2d4;
        }
        .theme-dark{
          --c1:#00ff9c; --c2:#00d0ff; --c-mood:#ff4df0;
          --c-bg:#04080a; --c-surface:#0b1512; --c-on-accent:#03140d;
          --c-ink:#d6ffe9; --c-muted:#5fae8c; --c-muted2:#3a7a60;
          --c-border:#11402f; --c-track:#0d241b;
        }
        /* native-app feel: no pinch-zoom, no horizontal scroll, no overscroll bounce/pull-refresh */
        html{overflow-x:clip;overscroll-behavior:none;-webkit-text-size-adjust:100%;}
        body{font-family:'Nunito',sans-serif;background:var(--c-bg);color:var(--c-ink);min-height:100vh;
          overflow-x:clip;overscroll-behavior:none;touch-action:manipulation;width:100%;position:relative;
          -webkit-tap-highlight-color:transparent;
          background-image:radial-gradient(ellipse at 10% 20%,rgba(232,196,184,.3) 0%,transparent 50%),
          radial-gradient(ellipse at 90% 80%,rgba(168,184,154,.2) 0%,transparent 50%);}
        .app-wrap{max-width:100vw;overflow-x:clip;}
        .app-wrap{min-height:100vh;background:var(--c-bg);transition:background .45s ease;}
        .theme-dark.app-wrap{
          background-image:radial-gradient(ellipse at 15% 10%,rgba(0,255,156,.06) 0%,transparent 55%),
            radial-gradient(ellipse at 85% 90%,rgba(0,208,255,.05) 0%,transparent 55%);
          font-family:'Chakra Petch',monospace;
        }
        .theme-dark *{font-family:'Chakra Petch',monospace!important;}
        /* CRT scanlines overlay */
        .theme-dark::before{content:"";position:fixed;inset:0;pointer-events:none;z-index:9998;
          background:repeating-linear-gradient(0deg,rgba(0,255,156,.028) 0 1px,transparent 1px 3px);}
        /* squared edges + neon skin */
        .theme-dark .card,.theme-dark button,.theme-dark .task-row,.theme-dark .tag,
        .theme-dark .check,.theme-dark input,.theme-dark .sheet{border-radius:0!important;}
        .theme-dark .card{background:rgba(8,18,14,.88);border:1px solid rgba(0,255,156,.28);
          box-shadow:0 0 14px rgba(0,255,156,.07), inset 0 0 30px rgba(0,255,156,.03);
          animation:cardIn .45s cubic-bezier(.22,1,.36,1);}
        @keyframes cardIn{0%{opacity:0;transform:translateX(-14px);box-shadow:0 0 0 rgba(0,255,156,0)}
          60%{box-shadow:0 0 22px rgba(0,255,156,.22)}100%{opacity:1;transform:translateX(0)}}
        .theme-dark .task-row{border-bottom:1px solid rgba(0,255,156,.08);}
        .theme-dark .task-row:hover{background:rgba(0,255,156,.07)}
        .theme-dark .task-row .task-name-text{color:var(--c-ink);}
        .theme-dark .task-done{background:linear-gradient(90deg,rgba(0,255,156,.14),rgba(0,255,156,.04));}
        .theme-dark .task-done .task-name-text{color:#7dffc8;}
        .theme-dark .check{border-color:rgba(0,255,156,.5);background:#06100c;color:#03140d;}
        .theme-dark .check.on{background:var(--c1);border-color:var(--c1);box-shadow:0 0 10px rgba(0,255,156,.6);}
        .theme-dark .card-title{color:var(--c1);border-bottom-color:rgba(0,255,156,.2);text-shadow:0 0 8px rgba(0,255,156,.4);}
        .theme-dark .gratitude{color:var(--c-ink);border-bottom-color:rgba(0,255,156,.25);}
        .theme-dark .gratitude::placeholder{color:var(--c-muted2);}
        .theme-dark img{filter:saturate(.65) brightness(.7) contrast(1.05);}
        .theme-dark button{text-shadow:0 0 6px rgba(0,255,156,.25);}
        .theme-dark .task-rainbow{box-shadow:0 0 24px rgba(0,255,156,.55);}
        /* neon sweep highlight on selected-day slide */
        .theme-dark .slide-r,.theme-dark .slide-l{position:relative;}
        .theme-dark .slide-r::after,.theme-dark .slide-l::after{content:"";position:absolute;inset:0;pointer-events:none;
          background:linear-gradient(100deg,transparent 30%,rgba(0,255,156,.12) 50%,transparent 70%);
          background-size:250% 100%;animation:neonSweep .7s ease forwards;}
        @keyframes neonSweep{0%{background-position:120% 0;opacity:1}100%{background-position:-60% 0;opacity:0}}
        /* theme flip transition */
        @keyframes themeFlip{0%{opacity:.25;filter:saturate(.2) brightness(1.6)}100%{opacity:1;filter:none}}
        .theme-flipping{animation:themeFlip .5s ease;}
        @keyframes pickIn{0%{opacity:0;transform:translateY(-8px) scale(.96)}100%{opacity:1;transform:translateY(0) scale(1)}}
        /* ===== COZY theme — warm hand-craft ===== */
        .theme-cozy{
          --c1:#a05c2c; --c2:#d98e4a; --c-mood:#b06fb8;
          --c-bg:#f9efe2; --c-surface:#fffaf2; --c-on-accent:#fff8ef;
          --c-ink:#5b4232; --c-muted:#8d6b52; --c-muted2:#c9aa86;
          --c-border:#e3c8a8; --c-track:#efe0cc;
        }
        .theme-cozy *{font-family:'Patrick Hand',cursive!important;letter-spacing:.01em;}
        .theme-cozy .card{background:#fffaf2;border:1.5px dashed #d8b48c;
          box-shadow:4px 4px 0 rgba(160,92,44,.13);}
        .theme-cozy .card-title{border-bottom:1.5px dashed #e0c39e;}
        .theme-cozy .check{border-radius:7px;border-style:dashed;}
        .theme-cozy .task-row:hover{background:rgba(217,142,74,.12)}
        .theme-cozy button{box-shadow:2px 2px 0 rgba(160,92,44,.18);}
        /* ===== CUTIE theme — colorful pastel, bouncy ===== */
        .theme-cutie{
          --c1:#5b8fd1; --c2:#e89bb8; --c-mood:#f0a93f;
          --c-bg:#fdf6ee; --c-surface:#ffffff; --c-on-accent:#ffffff;
          --c-ink:#5a5048; --c-muted:#9a8fa8; --c-muted2:#c9b8d0;
          --c-border:#f0d9e4; --c-track:#f1e8f0;
        }
        .theme-cutie *{font-family:'Baloo 2','Nunito',cursive!important;}
        .theme-cutie .card{background:#ffffff;border:2px solid #fce4ec;border-radius:22px!important;
          box-shadow:0 6px 0 rgba(232,155,184,.16), 0 8px 20px rgba(120,150,210,.1);}
        .theme-cutie .card-title{border-bottom:2px dotted #f3d3e0;color:#5b8fd1;}
        .theme-cutie button{border-radius:16px!important;}
        .theme-cutie .check{border-radius:9px;border-width:2px;}
        .theme-cutie .check.on{background:var(--c2);border-color:var(--c2);box-shadow:0 0 0 4px rgba(232,155,184,.2);}
        .theme-cutie .task-row{border-radius:16px;}
        .theme-cutie .task-row:hover{background:rgba(91,143,209,.07)}
        .theme-cutie .task-rainbow{animation:none!important;position:relative;overflow:hidden;box-shadow:0 0 0 3px rgba(232,155,184,.35);}
        .theme-cutie .task-rainbow::before{content:"";position:absolute;inset:0;z-index:0;transform:translateX(-101%);
          background:linear-gradient(90deg,#5b8fd1,#e89bb8);animation:wipeIn .5s cubic-bezier(.34,1.6,.4,1) forwards;}
        .theme-cutie .task-rainbow>*{position:relative;z-index:1;}
        .theme-cutie .task-rainbow .task-name-text{color:#fff!important;font-weight:700;}
        .theme-cutie::after{content:"🧸";position:fixed;left:10px;bottom:10px;font-size:26px;opacity:.5;pointer-events:none;z-index:5;animation:floaty 4s ease-in-out infinite;}
        .theme-cutie::before{content:"🍪 ✨";position:fixed;left:8px;top:8px;font-size:18px;opacity:.45;pointer-events:none;z-index:5;}
        /* ===== NATURE theme — sage matcha, calm ===== */
        .theme-nature{
          --c1:#6f9e57; --c2:#a7c47f; --c-mood:#e2885c;
          --c-bg:#f2f5e6; --c-surface:#fbfdf3; --c-on-accent:#fbfdf3;
          --c-ink:#4a5836; --c-muted:#7e9166; --c-muted2:#b3c596;
          --c-border:#d6e3bc; --c-track:#e6eed5;
        }
        .theme-nature *{font-family:'Baloo 2','Nunito',cursive!important;}
        .theme-nature .card{background:#fbfdf3;border:2px solid #dce8c4;border-radius:20px!important;
          box-shadow:0 5px 0 rgba(111,158,87,.12), 0 8px 18px rgba(111,158,87,.08);}
        .theme-nature .card-title{border-bottom:2px solid #dce8c4;color:#5f8a48;}
        .theme-nature button{border-radius:14px!important;}
        .theme-nature .check{border-radius:8px;border-width:2px;}
        .theme-nature .check.on{background:var(--c1);border-color:var(--c1);box-shadow:0 0 0 4px rgba(111,158,87,.18);}
        .theme-nature .task-row{border-radius:14px;}
        .theme-nature .task-row:hover{background:rgba(111,158,87,.08)}
        .theme-nature .task-rainbow{animation:none!important;position:relative;overflow:hidden;box-shadow:0 0 0 3px rgba(111,158,87,.3);}
        .theme-nature .task-rainbow::before{content:"";position:absolute;inset:0;z-index:0;transform:translateX(-101%);
          background:linear-gradient(90deg,#6f9e57,#a7c47f);animation:wipeIn .55s cubic-bezier(.3,.9,.3,1) forwards;}
        .theme-nature .task-rainbow>*{position:relative;z-index:1;}
        .theme-nature .task-rainbow .task-name-text{color:#fff!important;font-weight:700;}
        .theme-nature::before{content:"🌿 ☁️";position:fixed;left:8px;top:8px;font-size:18px;opacity:.5;pointer-events:none;z-index:5;}
        .theme-nature::after{content:"🐰";position:fixed;left:10px;bottom:10px;font-size:24px;opacity:.55;pointer-events:none;z-index:5;animation:floaty 5s ease-in-out infinite;}
        @keyframes floaty{0%,100%{transform:translateY(0) rotate(-4deg)}50%{transform:translateY(-8px) rotate(4deg)}}
        /* done celebration (dark + cozy): BOLD solid color wipe left→right via overlay */
        .theme-dark .task-rainbow, .theme-cozy .task-rainbow{
          animation:none!important; position:relative; overflow:hidden;
        }
        .theme-dark .task-rainbow{box-shadow:0 0 22px rgba(0,255,156,.5);}
        .theme-cozy .task-rainbow{box-shadow:3px 3px 0 rgba(160,92,44,.25);}
        .theme-dark .task-rainbow::before, .theme-cozy .task-rainbow::before{
          content:"";position:absolute;inset:0;z-index:0;transform:translateX(-101%);
          animation:wipeIn .5s cubic-bezier(.2,.85,.25,1) forwards;
        }
        .theme-dark .task-rainbow::before{background:var(--c1);}
        .theme-cozy .task-rainbow::before{background:#d98e4a;}
        .theme-dark .task-rainbow>*, .theme-cozy .task-rainbow>*{position:relative;z-index:1;}
        .theme-dark .task-rainbow .task-name-text{color:var(--c-on-accent)!important;font-weight:700;text-shadow:none;}
        .theme-cozy .task-rainbow .task-name-text{color:#fff8ef!important;font-weight:700;text-shadow:none;}
        @keyframes wipeIn{to{transform:translateX(0)}}
        /* task shrink-out (move/delete) */
        .task-shrink{animation:taskShrink .3s ease forwards;}
        @keyframes taskShrink{0%{max-height:140px;opacity:1;transform:scale(1)}100%{max-height:0;opacity:0;transform:scale(.82);margin:0;padding:0}}
        /* mood emoji pop on change */
        @keyframes emojiPop{0%{transform:scale(.55) rotate(-8deg)}60%{transform:scale(1.32)}100%{transform:scale(1)}}
        .mood-emoji-pop{animation:emojiPop .34s cubic-bezier(.34,1.6,.5,1);}
        /* ===== responsive: desktop = 2 columns (all visible); mobile = bottom tabs ===== */
        .main-pad{max-width:1400px;margin:0 auto;padding:env(safe-area-inset-top) 16px calc(72px + env(safe-area-inset-bottom));}
        .day-nav{display:flex;}
        .section-tabs{display:flex;}
        .fab{display:flex;align-items:center;justify-content:center;}
        .section-tabs button:hover{filter:brightness(1.02);}
        @media(max-width:999px){
          .layout,.col-a,.col-b{display:block;}
          .panel{display:none;}
          .panel.active{display:block;max-width:640px;margin:0 auto;animation:fadeUp .3s ease both;}
          .day-nav{display:none;}
          .day-nav.is-plan{display:flex;}
          .tab-plan{padding-bottom:calc(120px + env(safe-area-inset-bottom));}
          .fab-create{bottom:calc(112px + env(safe-area-inset-bottom));}
          .fab-chat{bottom:calc(178px + env(safe-area-inset-bottom));}
          .tab-stats .fab,.tab-habit .fab,.tab-word .fab{display:none;}
        }
        @media(min-width:1000px){
          .layout{display:flex;align-items:flex-start;gap:18px;max-width:1180px;margin:0 auto;}
          .col-a{flex:1 1 56%;min-width:0;}
          .col-b{flex:1 1 44%;min-width:0;}
          .panel{display:block;}
          .section-tabs{display:none;}
          .main-pad{padding-bottom:calc(74px + env(safe-area-inset-bottom));}
          .fab-create{bottom:calc(60px + env(safe-area-inset-bottom));}
          .fab-chat{bottom:calc(126px + env(safe-area-inset-bottom));}
        }
        /* Cyber theme: square the new bars + plan rows, add neon */
        .theme-dark .bottom-bar{background:rgba(8,18,14,.94)!important;border-top:1px solid rgba(0,255,156,.3)!important;box-shadow:0 0 18px rgba(0,255,156,.12)!important;}
        .theme-dark .plan-row{border-radius:0!important;}
        .theme-dark .hero-banner{border-radius:0!important;border-color:rgba(0,255,156,.3)!important;box-shadow:0 0 18px rgba(0,255,156,.1)!important;}
        .col-main,.col-side{min-width:0;}
        @media(min-width:1000px){
          .main-grid{display:flex;align-items:flex-start;gap:18px;}
          .col-main{flex:1 1 56%;min-width:0;}
          .col-side{flex:1 1 44%;min-width:0;}
        }
        /* sessions side-by-side only when there's real room */
        @media(min-width:1180px){.session-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;align-items:start;}}
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
        /* satisfying "pop" when a dragged task settles into its new spot */
        @keyframes dropPop{
          0%{ transform:scale(1.07); filter:drop-shadow(0 10px 20px rgba(0,0,0,.22)); }
          55%{ transform:scale(.985); }
          100%{ transform:scale(1); filter:drop-shadow(0 0 0 rgba(0,0,0,0)); }
        }
        .task-drop-pop{ animation:dropPop .42s cubic-bezier(.34,1.56,.64,1); }
        @media(prefers-reduced-motion:reduce){.task-drop-pop{animation:none}}
        .f1{animation:fadeUp .5s .05s both}.f2{animation:fadeUp .5s .15s both}
        .f3{animation:fadeUp .5s .25s both}.f4{animation:fadeUp .5s .35s both}
        .card{background:rgba(255,255,255,.82);backdrop-filter:blur(8px);
          border:1px solid rgba(201,160,160,.25);border-radius:16px;padding:18px;}
        .card-title{font-family:'Cormorant Garamond',serif;font-size:1rem;font-weight:600;
          color:${wine};margin-bottom:11px;display:flex;align-items:center;gap:6px;
          border-bottom:1px solid var(--c-border);padding-bottom:7px;}
        .task-row{display:flex;align-items:flex-start;gap:10px;padding:8px 10px;
          border-radius:10px;margin-bottom:5px;cursor:pointer;
          transition:background .45s cubic-bezier(.22,1,.36,1), opacity .5s cubic-bezier(.22,1,.36,1), box-shadow .45s cubic-bezier(.22,1,.36,1), transform .25s cubic-bezier(.34,1.56,.64,1);}
        .task-row:hover{background:rgba(232,196,184,.22)}
        .task-row .task-name-text{color:#4a3030;transition:color .35s ease;}
        .task-done{background:linear-gradient(135deg,rgba(95,170,95,.40),rgba(95,170,95,.15));}
        .task-done:hover{background:linear-gradient(135deg,rgba(95,170,95,.48),rgba(95,170,95,.22));}
        .task-done .task-name-text{color:#3f7a3f;}
        .check{width:18px;height:18px;border:1.5px solid #c9a0a0;border-radius:5px;
          flex-shrink:0;margin-top:2px;display:flex;align-items:center;justify-content:center;
          background:#fff;transition:all .25s cubic-bezier(.34,1.56,.64,1);font-size:11px;color:#fff;}
        .check.on{background:#56a256;border-color:#56a256;transform:scale(1.08);box-shadow:0 0 0 3px rgba(86,162,86,.22);}
        .tag{font-size:.62rem;padding:1px 7px;border-radius:10px;font-weight:700;}
        .gratitude{width:100%;border:none;border-bottom:1px solid var(--c-border);background:transparent;
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
        @keyframes btnPress{0%{transform:scale(1)}28%{transform:scale(.88)}62%{transform:scale(1.04)}100%{transform:scale(1)}}
        .btn-press{animation:btnPress .22s cubic-bezier(.34,1.7,.5,1);}
        @keyframes btnPressGlow{0%{transform:scale(1);box-shadow:0 0 0 0 rgba(201,168,76,.5)}32%{transform:scale(.93)}100%{transform:scale(1);box-shadow:0 0 0 14px rgba(201,168,76,0)}}
        .btn-press[data-sfx="confirm"]{animation:btnPressGlow .42s cubic-bezier(.34,1.6,.5,1);}
        @keyframes btnPressGlowRed{0%{transform:scale(1);box-shadow:0 0 0 0 rgba(220,38,38,.5)}32%{transform:scale(.93)}100%{transform:scale(1);box-shadow:0 0 0 14px rgba(220,38,38,0)}}
        .btn-press[data-sfx="danger"]{animation:btnPressGlowRed .42s cubic-bezier(.34,1.6,.5,1);}
        /* day/week content slide transitions */
        @keyframes slideR{0%{opacity:0;transform:translateX(34px)}100%{opacity:1;transform:translateX(0)}}
        @keyframes slideL{0%{opacity:0;transform:translateX(-34px)}100%{opacity:1;transform:translateX(0)}}
        .slide-r{animation:slideR .36s cubic-bezier(.22,1,.36,1)}
        .slide-l{animation:slideL .36s cubic-bezier(.22,1,.36,1)}
        /* staggered group rise */
        @keyframes rise{0%{opacity:0;transform:translateY(12px)}100%{opacity:1;transform:translateY(0)}}
        .rise{animation:rise .42s cubic-bezier(.22,1,.36,1) both}
        @media(prefers-reduced-motion:reduce){.slide-r,.slide-l,.rise{animation:none}}
        /* pronounced chip press (task type / session / date toggles) */
        @keyframes chipPress{0%{transform:scale(1)}26%{transform:scale(.84)}58%{transform:scale(1.1)}100%{transform:scale(1)}}
        .btn-press[data-anim="chip"]{animation:chipPress .44s cubic-bezier(.34,1.8,.45,1);}
        /* bottom-sheet modal slide up / down */
        @keyframes sheetUp{0%{transform:translateY(100%)}100%{transform:translateY(0)}}
        @keyframes sheetDown{0%{transform:translateY(0)}100%{transform:translateY(110%)}}
        @keyframes backdropIn{from{opacity:0}to{opacity:1}}
        @keyframes backdropOut{from{opacity:1}to{opacity:0}}
        .sheet{animation:sheetUp .4s cubic-bezier(.16,1,.3,1);}
        .sheet.closing{animation:sheetDown .28s cubic-bezier(.5,0,.75,0) forwards;}
        .sheet-backdrop{animation:backdropIn .32s ease;}
        .sheet-backdrop.closing{animation:backdropOut .28s ease forwards;}
        @media(prefers-reduced-motion:reduce){.sheet,.sheet.closing{animation:none}}
      `}</style>

      <div className={`app-wrap theme-${theme} ${themeFlipping ? "theme-flipping" : ""}`}>
      <div className={"main-pad tab-" + tab}>

        {/* THEME SWITCH — floating top-right, opens style picker */}
        <button data-sfx="swoosh" onClick={() => setShowThemePicker(v => !v)} title="Đổi giao diện" style={{
          position: "fixed", top: "calc(12px + env(safe-area-inset-top))", right: 14, zIndex: 95,
          width: 44, height: 44, borderRadius: theme === "dark" ? 0 : 22,
          border: `1.5px solid ${theme === "dark" ? "rgba(0,255,156,.5)" : "var(--c-border)"}`,
          background: theme === "dark" ? "rgba(8,18,14,.9)" : "rgba(255,255,255,.85)",
          backdropFilter: "blur(6px)", cursor: "pointer", fontSize: "1.25rem",
          boxShadow: theme === "dark" ? "0 0 14px rgba(0,255,156,.35)" : "0 3px 12px rgba(122,74,74,.18)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>{THEMES.find(t => t.key === theme)?.icon || "🎨"}</button>

        {showThemePicker && (
          <>
            <div onClick={() => setShowThemePicker(false)} style={{ position: "fixed", inset: 0, zIndex: 96 }} />
            <div style={{
              position: "fixed", top: "calc(64px + env(safe-area-inset-top))", right: 14, zIndex: 97, width: 208,
              background: "var(--c-surface)", border: "1px solid var(--c-border)",
              borderRadius: theme === "dark" ? 0 : 16, padding: 8,
              boxShadow: "0 10px 30px rgba(0,0,0,.22)", animation: "pickIn .26s cubic-bezier(.22,1,.36,1)",
            }}>
              <div style={{ fontSize: ".64rem", fontWeight: 700, letterSpacing: ".08em", color: "var(--c-muted)", padding: "4px 8px 8px" }}>CHỌN GIAO DIỆN</div>
              {THEMES.map(t => {
                const active = t.key === theme;
                return (
                  <button key={t.key} data-sfx="pop" onClick={() => switchTheme(t.key)} style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 10px",
                    borderRadius: theme === "dark" ? 0 : 11, cursor: "pointer", marginBottom: 2,
                    border: active ? `1.5px solid var(--c1)` : "1px solid transparent",
                    background: active ? "color-mix(in srgb, var(--c1) 12%, transparent)" : "transparent",
                    color: "var(--c-ink)", textAlign: "left",
                  }}>
                    <span style={{ fontSize: "1.1rem" }}>{t.icon}</span>
                    <span style={{ flex: 1, fontWeight: 700, fontSize: ".85rem" }}>{t.name}</span>
                    <span style={{ display: "flex", gap: 2 }}>
                      {t.sw.map((c, i) => <span key={i} style={{ width: 11, height: 11, borderRadius: 3, background: c, border: "1px solid rgba(0,0,0,.12)" }} />)}
                    </span>
                    {active && <span style={{ color: "var(--c1)", fontWeight: 800, marginLeft: 2 }}>✓</span>}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* HERO with GIF banner */}
        <div className="f1" style={{ textAlign: "center", padding: "26px 0 14px" }}>
          <div className="hero-banner" style={{ position: "relative", borderRadius: 18, overflow: "hidden", marginBottom: 16, border: "1px solid rgba(201,160,160,.3)", boxShadow: "0 6px 24px rgba(122,74,74,.12)" }}>
            <img src={COVERS[coverIdx]} alt="" style={{ width: "100%", height: 150, objectFit: "cover", display: "block" }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(253,248,242,0) 40%, rgba(253,248,242,.9) 100%)" }} />
            <div style={{ position: "absolute", bottom: 10, left: 0, right: 0 }}>
              <span style={{ fontSize: "1.6rem", display: "block", animation: "float 4s ease-in-out infinite" }}>✝️</span>
            </div>
          </div>
          <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontWeight: 300, fontSize: "clamp(1.8rem,4.5vw,2.9rem)", color: wine, letterSpacing: ".05em" }}>
            Dat&apos;s <em style={{ color: gold }}>Weekly</em> Planner
          </h1>
        </div>

        {/* CONTENT — desktop: 2 columns (all visible); mobile: one tab at a time */}
        <div className="layout">
        <div className="col-a">
        {/* ===== PLAN ===== */}
        <div className={"panel" + (tab === "plan" ? " active" : "")}>
        {/* PROGRESS RINGS + tasks + insights */}
        {/* PROGRESS RINGS — selected day + selected week */}
        <div className="f2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <Ring pct={dayPct} label={selIsToday ? "HÔM NAY" : (DAYS[selDateObj.getDay()] + " " + fmt(selDateObj)).toUpperCase()} sub={`${dayDone}/${dayTasks.length}`} color={wine} loading={status==="loading"} />
          <Ring pct={weekPct} label={isCurrentWeek ? "TUẦN NÀY" : "TUẦN ĐANG XEM"} sub={`${weekDone}/${weekTasks.length}`} color={gold} loading={status==="loading"} />
        </div>

        {/* MOOD SLIDER — for selected day */}
        <div className="f2">
          <MoodSlider date={selectedDate} value={moods[selectedDate] || null} onChange={(s) => setMoodFor(selectedDate, s)} />
        </div>

        {/* TASKS */}
        <div className="f3 card" style={{ marginBottom: 14, overflow: "visible" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--c-border)", paddingBottom: 8, marginBottom: 14 }}>
            <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.2rem", fontWeight: 600, color: wine }}>📋 Kế hoạch</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button data-sfx="confirm" onClick={() => setPlanning(true)} style={{ fontSize: ".74rem", padding: "5px 12px", border: `1.5px solid ${wine}`, borderRadius: 10, background: `color-mix(in srgb, ${wine} 10%, transparent)`, color: wine, cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap" }}>🗂️ {isPlanned(selectedDate) ? "Sửa KH" : "Lên kế hoạch"}</button>
              <button onClick={load} title="Làm mới" style={{ fontSize: ".85rem", padding: "4px 10px", border: "1px solid var(--c-border)", borderRadius: 8, background: "transparent", color: "var(--c-muted)", cursor: "pointer" }}>↻</button>
            </div>
          </div>

          {status === "loading" && (
            <div style={{ textAlign: "center", padding: 28, color: "var(--c-muted)" }}>
              <div style={{ width: 26, height: 26, border: "2px solid var(--c-border)", borderTopColor: wine, borderRadius: "50%", animation: "spin .8s linear infinite", margin: "0 auto 10px" }} />
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
                    <button key={date} data-sfx="pop" onClick={() => goToDate(date)} style={{
                      flex: "0 0 auto", minWidth: 48, padding: "8px 6px", borderRadius: 12,
                      border: isSel ? `2px solid ${wine}` : "1px solid var(--c-border)",
                      background: isSel ? wine : "var(--c-surface)",
                      color: isSel ? "var(--c-on-accent)" : isToday ? wine : "var(--c-muted)",
                      cursor: "pointer", textAlign: "center", transition: "all .2s",
                    }}>
                      <div style={{ fontSize: ".62rem", fontWeight: 700 }}>{DAYS_SHORT[d.getDay()]}</div>
                      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.15rem", fontWeight: 600, lineHeight: 1.1 }}>{d.getDate()}</div>
                      {dt.length > 0 && <div style={{ fontSize: ".55rem", marginTop: 2, color: isSel ? "rgba(255,255,255,.85)" : allDone ? "#a8b89a" : "var(--c-muted2)" }}>{allDone ? "✓" : rem}</div>}
                    </button>
                  );
                })}
              </div>

              {/* SLIDE CONTAINER — day content slides on date/week change */}
              <div key={selectedDate} className={slideDir >= 0 ? "slide-r" : "slide-l"}>
              {/* SELECTED DAY NAME */}
              <div style={{ fontSize: ".75rem", fontWeight: 700, letterSpacing: ".1em", color: selIsToday ? wine : "var(--c-muted)", textTransform: "uppercase", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                {DAYS[selDateObj.getDay()]} {fmt(selDateObj)}
                {selIsToday && <span style={{ background: wine, color: "var(--c-on-accent)", fontSize: ".55rem", padding: "1px 6px", borderRadius: 8 }}>HÔM NAY</span>}
                {isPlanned(selectedDate) && <span style={{ background: "color-mix(in srgb, var(--c2) 22%, transparent)", color: "var(--c1)", border: "1px solid var(--c2)", fontSize: ".55rem", padding: "1px 7px", borderRadius: 8 }}>✓ ĐÃ LÊN KẾ HOẠCH</span>}
              </div>

              {/* SORT MODE SELECTOR */}
              {dayTasks.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
                  <span style={{ fontSize: ".6rem", fontWeight: 700, letterSpacing: ".08em", color: "var(--c-muted2)", marginRight: 2 }}>SẮP XẾP</span>
                  {[["session", "🕐 Buổi"], ["priority", "🔥 Ưu tiên"], ["type", "🏷️ Loại"]].map(([k, label]) => {
                    const on = sortMode === k;
                    return (
                      <button key={k} data-sfx="pop" data-anim="chip" onClick={() => changeSortMode(k)} style={{
                        padding: "5px 11px", borderRadius: 14, fontSize: ".72rem", fontWeight: 700, cursor: "pointer",
                        border: on ? `1.5px solid ${wine}` : "1px solid var(--c-border)",
                        background: on ? `color-mix(in srgb, ${wine} 12%, transparent)` : "var(--c-surface)",
                        color: on ? wine : "var(--c-muted2)", transition: "all .2s",
                      }}>{label}</button>
                    );
                  })}
                </div>
              )}

              {/* TASKS — always grouped by buổi; within-group order follows the sort mode */}
              {dayTasks.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 10px", color: "var(--c-muted2)", fontSize: ".85rem", fontStyle: "italic" }}>🕊️ Không có việc nào ngày này</div>
              ) : (
                <>
                  <div style={{ fontSize: ".66rem", color: "var(--c-muted2)", marginBottom: 8, fontStyle: "italic" }}>
                    {sortMode === "session" ? <>✋ Kéo <span style={{ fontWeight: 700 }}>⠿</span> để sắp xếp trong mỗi buổi</>
                      : sortMode === "priority" ? "🔥 Ưu tiên (bắt buộc → khẩn → quan trọng) lên đầu mỗi buổi"
                      : "🏷️ Sắp theo loại việc trong mỗi buổi"}
                  </div>
                  <div className="session-grid">
                  {sessionGroups.map((sg, gi) => sg.items.length > 0 && (
                    <div key={sg.key} className="rise" style={{ marginBottom: 14, animationDelay: `${gi * 0.06}s` }}>
                      <div style={{ fontSize: ".7rem", fontWeight: 700, letterSpacing: ".06em", color: wine, marginBottom: 6, padding: "4px 8px", background: "rgba(232,196,184,.25)", borderRadius: 8, display: "inline-block" }}>{sg.label}</div>
                      <SortableTaskList items={sortTasks(sg.items, sortMode === "session" ? "manual" : sortMode, taskOrder, taskTier)} draggable={sortMode === "session"} onReorder={reorderTasks} renderRow={renderTaskRow} />
                    </div>
                  ))}
                  </div>
                  {noSession.length > 0 && (
                    <div className="rise" style={{ marginBottom: 14, animationDelay: "0.2s" }}>
                      <div style={{ fontSize: ".7rem", fontWeight: 700, letterSpacing: ".06em", color: "var(--c-muted)", marginBottom: 6 }}>📋 Chưa xếp buổi</div>
                      <SortableTaskList items={sortTasks(noSession, sortMode === "session" ? "manual" : sortMode, taskOrder, taskTier)} draggable={sortMode === "session"} onReorder={reorderTasks} renderRow={renderTaskRow} />
                    </div>
                  )}
                </>
              )}

              {/* NO-DATE TASKS */}
              {noDateTasks.length > 0 && selIsToday && (
                <div style={{ marginTop: 18, borderTop: "1px dashed var(--c-border)", paddingTop: 14 }}>
                  <div style={{ fontSize: ".68rem", fontWeight: 700, letterSpacing: ".1em", color: "var(--c-muted)", textTransform: "uppercase", marginBottom: 8 }}>📌 Chưa có ngày</div>
                  {noDateTasks.map(t => <TaskRow key={t.id} task={t} onToggle={toggle} onEdit={setEditTask} justDone={justDone === t.id} justUndone={justUndone === t.id} removing={removingId === t.id} onDelete={(id) => removeWithShrink(id, () => deleteTask(id))} />)}
                </div>
              )}
              </div>{/* end slide container */}
            </>
          )}
        </div>

        {/* INSIGHTS — analysis + coach note + recent days */}
        {status === "ok" && <InsightsPanel selectedDate={selectedDate} byDate={byDate} moods={moods} sortMode={sortMode} taskOrder={taskOrder} taskTier={taskTier} />}
        </div>
        </div>{/* end col-a */}

        <div className="col-b">
        {/* ===== STATS ===== */}
        <div className={"panel" + (tab === "stats" ? " active" : "")}>
          <UltimateChart weekDays={weekDays} byDate={byDate} moods={moods} pushups={pushups} />
          <ScoreChart weekDays={weekDays} byDate={byDate} moods={moods} />
        </div>
        {/* ===== HABIT ===== */}
        <div className={"panel" + (tab === "habit" ? " active" : "")}>
          <PushupTracker pushups={pushups} weekDays={weekDays} selectedDate={selectedDate} onAdd={addPushupsFor} onSet={setPushupsFor} />
        </div>
        {/* ===== WORD ===== */}
        <div className={"panel" + (tab === "word" ? " active" : "")}>
          <div className="f2" style={{ margin: "0 0 14px", padding: "18px 22px 18px 30px", background: "linear-gradient(135deg,rgba(122,74,74,.07),rgba(201,168,76,.07))", borderLeft: `3px solid ${gold}`, borderRadius: "0 12px 12px 0", position: "relative" }}>
            <span style={{ position: "absolute", top: -8, left: 12, fontSize: "1.7rem", color: gold, opacity: .4, fontFamily: "serif" }}>❝</span>
            <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.15rem", fontStyle: "italic", color: wine, lineHeight: 1.55 }}>
              {v.en.map((line, i) => <span key={i}>{line}<br/></span>)}
            </p>
            {v.vi && <p style={{ fontSize: ".82rem", color: "var(--c-muted2)", fontStyle: "italic", marginTop: 6 }}>{v.vi}</p>}
            <cite style={{ display: "block", marginTop: 4, fontSize: ".72rem", color: "var(--c-muted)", fontStyle: "normal" }}>— {v.ref} ✝️</cite>
          </div>
          <div className="f4 card" style={{ marginBottom: 14, overflow: "hidden", padding: 0 }}>
            <img src={COVERS[(coverIdx + 2) % COVERS.length]} alt="" style={{ width: "100%", height: 180, objectFit: "cover", objectPosition: "center 30%", display: "block" }} />
            <div style={{ padding: 18 }}>
              <div className="card-title" style={{ justifyContent: "space-between" }}>
                <span>📖 Scripture · Lời Chúa</span>
                <button data-sfx="pop" onClick={() => loadVerse(false)} disabled={verseLoading} style={{ fontSize: ".68rem", padding: "3px 10px", border: "1px solid var(--c-border)", borderRadius: 8, background: "transparent", color: "var(--c-muted)", cursor: verseLoading ? "wait" : "pointer", opacity: verseLoading ? .5 : 1 }}>{verseLoading ? "…" : "🔄 Câu khác"}</button>
              </div>
              <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1rem", fontStyle: "italic", color: wine, lineHeight: 1.7 }}>
                {v.en.map((line, i) => <span key={i}>{line}<br/></span>)}
              </p>
              {v.vi && <p style={{ fontSize: ".82rem", color: "var(--c-muted2)", fontStyle: "italic", marginTop: 8 }}>{v.vi}</p>}
              <p style={{ fontSize: ".7rem", color: "var(--c-muted)", marginTop: 8, borderTop: "1px solid rgba(201,160,160,.2)", paddingTop: 8 }}>— {v.ref}{v.vi ? ` · ${v.refVi}` : ""}</p>
            </div>
          </div>
        </div>
        </div>{/* end col-b */}
        </div>{/* end layout */}

        {/* FOOTER */}
        <div style={{ textAlign: "center", padding: "28px 0 8px", fontFamily: "'Cormorant Garamond',serif", fontStyle: "italic", fontSize: ".88rem", color: "var(--c-muted)" }}>
          <div style={{ marginBottom: 5 }}>✝️ 🌸 ✝️</div>
          "In everything give thanks."<br/>
          <span style={{ fontSize: ".78rem", color: "var(--c-muted2)" }}>Trong mọi hoàn cảnh, hãy tạ ơn Chúa.</span><br/>
          <span style={{ fontSize: ".72rem" }}>— 1 Thessalonians 5:18</span>
        </div>

        {editTask && (
          <EditModal
            task={editTask}
            currentTier={taskTier[editTask.id]}
            onSetTier={setTierFor}
            weekDays={weekDays}
            onClose={() => setEditTask(null)}
            onSave={(patch) => {
              const id = editTask.id; setEditTask(null);
              if (patch.date !== undefined) { playClick("swoosh"); removeWithShrink(id, () => updateTask(id, patch)); }
              else updateTask(id, patch);
            }}
            onDelete={() => { const id = editTask.id; setEditTask(null); removeWithShrink(id, () => deleteTask(id)); }}
          />
        )}

        {/* BOTTOM BAR — day/week nav (Plan tab) stacked above the section tabs (always) */}
        <div className="bottom-bar" style={{
          position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 86,
          background: "color-mix(in srgb, var(--c-bg) 93%, transparent)",
          backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
          borderTop: "1px solid var(--c-border)",
          boxShadow: "0 -4px 18px rgba(0,0,0,.12)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}>
          <div className={"day-nav" + (tab === "plan" ? " is-plan" : "")} style={{ maxWidth: 480, margin: "0 auto", alignItems: "center", justifyContent: "space-between", gap: 6, padding: "7px 12px 5px" }}>
            <div style={{ display: "flex", gap: 6 }}>
              <button data-sfx="swoosh" onClick={() => shiftWeek(-1)} title="Tuần trước" style={weekNavBtn}>« Tuần</button>
              <button data-sfx="swoosh" onClick={() => shiftDay(-1)} title="Ngày trước" style={dayNavBtn}>‹ Ngày</button>
            </div>
            <div style={{ textAlign: "center", lineHeight: 1.04, minWidth: 0 }}>
              <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: ".9rem", fontWeight: 600, color: wine, whiteSpace: "nowrap" }}>{DAYS_SHORT[selDateObj.getDay()]} · {fmt(selDateObj)}</div>
              {selIsToday
                ? <div style={{ fontSize: ".5rem", fontWeight: 700, letterSpacing: ".12em", color: gold }}>● HÔM NAY</div>
                : <button data-sfx="confirm" onClick={resetToToday} title="Về hôm nay" style={{ fontSize: ".55rem", fontWeight: 700, color: wine, background: `color-mix(in srgb, ${gold} 22%, transparent)`, border: `1px solid ${gold}`, borderRadius: 12, padding: "1px 9px", cursor: "pointer", whiteSpace: "nowrap" }}>↺ Hôm nay</button>}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button data-sfx="swoosh" onClick={() => shiftDay(1)} title="Ngày sau" style={dayNavBtn}>Ngày ›</button>
              <button data-sfx="swoosh" onClick={() => shiftWeek(1)} title="Tuần sau" style={weekNavBtn}>Tuần »</button>
            </div>
          </div>
          <div className="section-tabs" style={{ maxWidth: 560, margin: "0 auto", gap: 4, padding: "6px 10px 6px" }}>
            {SECTION_TABS.map(([k, em, lbl]) => {
              const on = tab === k;
              return (
                <button key={k} data-sfx="pop" onClick={() => changeTab(k)} style={{
                  flex: 1, padding: "5px 4px", borderRadius: 12, cursor: "pointer",
                  border: on ? `1.5px solid ${wine}` : "1px solid transparent",
                  background: on ? `color-mix(in srgb, ${wine} 14%, transparent)` : "transparent",
                  color: on ? wine : "var(--c-muted2)", fontWeight: 700, fontSize: ".64rem",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 2, transition: "all .2s", lineHeight: 1.1,
                }}>
                  <span style={{ fontSize: "1.15rem", lineHeight: 1 }}>{em}</span>
                  {lbl}
                </button>
              );
            })}
          </div>
        </div>

        {/* FLOATING CREATE BUTTON */}
        <button data-sfx="pop" onClick={() => setShowCreate(true)} title="Tạo công việc" className="fab fab-create" style={{
          position: "fixed", right: 18, zIndex: 90,
          width: 58, height: 58, borderRadius: theme === "dark" ? 0 : 29,
          border: theme === "dark" ? "1.5px solid rgba(0,255,156,.6)" : "none",
          background: theme === "dark" ? "rgba(8,18,14,.92)" : wine,
          color: theme === "dark" ? "var(--c1)" : "#fff",
          fontSize: "1.7rem", fontWeight: 300, cursor: "pointer",
          boxShadow: theme === "dark" ? "0 0 18px rgba(0,255,156,.45)" : "0 6px 18px rgba(122,74,74,.4)",
          lineHeight: 1,
        }}>＋</button>

        {/* FLOATING CHAT BUTTON */}
        <button data-sfx="pop" onClick={() => setShowChat(true)} title="Chat tạo việc với AI" className="fab fab-chat" style={{
          position: "fixed", right: 18, zIndex: 90,
          width: 58, height: 58, borderRadius: theme === "dark" ? 0 : 29,
          border: theme === "dark" ? "1.5px solid rgba(0,208,255,.6)" : "none",
          background: theme === "dark" ? "rgba(8,18,14,.92)" : "var(--c2)",
          color: theme === "dark" ? "var(--c2)" : "#fff",
          fontSize: "1.5rem", cursor: "pointer",
          boxShadow: theme === "dark" ? "0 0 18px rgba(0,208,255,.4)" : "0 6px 18px rgba(201,168,76,.45)",
          lineHeight: 1,
        }}>💬</button>

        {showCreate && (
          <CreateModal
            defaultDate={selectedDate}
            onClose={() => setShowCreate(false)}
            onCreate={(draft) => { createTask(draft); setShowCreate(false); }}
          />
        )}

        {showChat && (
          <ChatSheet
            onClose={() => setShowChat(false)}
            onCreateTasks={(tasks) => tasks.forEach(createTask)}
            today={TODAY}
            weekDays={weekDays}
          />
        )}

        {planning && (
          <PlanSheet
            date={selectedDate}
            tasks={dayTasks}
            taskTier={taskTier}
            taskOrder={taskOrder}
            onMove={planMove}
            onClose={() => setPlanning(false)}
            onCommit={(mustIds) => {
              const mustSet = new Set(mustIds);
              applyTiers(dayTasks.map(t => ({ id: t.id, tier: mustSet.has(t.id) ? "must" : "optional" })));
              markPlanned(selectedDate);
              changeSortMode("session");
              setPlanning(false);
              haptic(20);
            }}
          />
        )}

      </div>
      </div>
    </>
  );
}

function EditModal({ task, currentTier, weekDays, onClose, onSave, onDelete, onSetTier }) {
  const [name, setName] = useState(task.name);
  const [editingName, setEditingName] = useState(false);
  const [session, setSession] = useState(task.session || "");
  const [date, setDate] = useState(task.date || "");
  const [taskType, setTaskType] = useState(task.taskType || "");
  const [priority, setPriority] = useState(Array.isArray(task.priority) ? task.priority : []);
  const [project, setProject] = useState(Array.isArray(task.project) ? task.project : []);
  const [tier, setTier] = useState(currentTier || "normal");
  const [confirmDel, setConfirmDel] = useState(false);
  const [closing, setClosing] = useState(false);
  // Tuần đang hiển thị trong phần chọn ngày (mặc định tuần chứa ngày hiện tại của task)
  const [modalMonday, setModalMonday] = useState(mondayOf(task.date ? new Date(task.date + "T00:00:00") : new Date()));

  // Animate the sheet out before running the actual action (close/save/delete)
  const requestClose = (action) => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => action(), 270);
  };

  const modalWeekDays = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(modalMonday);
    d.setDate(modalMonday.getDate() + i);
    modalWeekDays.push(iso(d));
  }
  const mSun = new Date(modalMonday); mSun.setDate(modalMonday.getDate() + 6);
  const modalWeekLabel = `${fmt(modalMonday)} – ${fmt(mSun)}`;

  const sameArr = (a, b) => { const x = [...(a || [])].sort().join("|"); const y = [...(b || [])].sort().join("|"); return x === y; };
  const patch = {};
  if (name !== task.name) patch.name = name;
  if (session !== (task.session || "")) patch.session = session || null;
  if (date !== (task.date || "")) patch.date = date || null;
  if (taskType !== (task.taskType || "")) patch.taskType = taskType || null;
  if (!sameArr(priority, task.priority)) patch.priority = priority;
  if (!sameArr(project, task.project)) patch.project = project;
  const hasChange = Object.keys(patch).length > 0;
  const tierChanged = tier !== (currentTier || "normal");
  const dirty = hasChange || tierChanged;
  const togglePriority = (p) => setPriority(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  const toggleProject = (p) => setProject(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);

  return (
    <div onClick={() => requestClose(onClose)} className={`sheet-backdrop ${closing ? "closing" : ""}`} style={{
      position: "fixed", inset: 0, background: "rgba(74,48,48,.4)", backdropFilter: "blur(3px)",
      display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 100,
    }}>
      <div onClick={e => e.stopPropagation()} className={`sheet ${closing ? "closing" : ""}`} style={{
        background: "var(--c-bg)", borderRadius: "20px 20px 0 0", padding: "20px 20px 28px",
        width: "100%", maxWidth: 480, boxShadow: "0 -8px 30px rgba(122,74,74,.2)",
        maxHeight: "85vh", overflowY: "auto",
      }}>
        {/* Handle bar */}
        <div style={{ width: 40, height: 4, background: "var(--c-border)", borderRadius: 2, margin: "0 auto 18px" }} />

        {/* Name */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: ".7rem", fontWeight: 700, letterSpacing: ".08em", color: "var(--c-muted)" }}>TÊN CÔNG VIỆC</span>
            <button onClick={() => setEditingName(v => !v)} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: ".95rem", color: wine }}>✏️</button>
          </div>
          {editingName ? (
            <input autoFocus value={name} onChange={e => setName(e.target.value)} style={{
              width: "100%", padding: "10px 12px", border: `1.5px solid ${wine}`, borderRadius: 10,
              fontFamily: "'Nunito',sans-serif", fontSize: ".95rem", color: "var(--c-ink)", outline: "none",
            }} />
          ) : (
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.2rem", color: wine, fontWeight: 600 }}>
              {task.icon} {name}
            </div>
          )}
        </div>

        {/* Session */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: ".7rem", fontWeight: 700, letterSpacing: ".08em", color: "var(--c-muted)", marginBottom: 8 }}>BUỔI</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["🌅 Sáng","🏢 Office (11–7h)","🌙 Tối"].map(s => (
              <button key={s} data-sfx="pop" data-anim="chip" onClick={() => setSession(session === s ? "" : s)} style={{
                padding: "8px 14px", borderRadius: 10, cursor: "pointer", fontSize: ".82rem", fontWeight: 600,
                border: session === s ? `2px solid ${wine}` : "1px solid var(--c-border)",
                background: session === s ? wine : "var(--c-surface)", color: session === s ? "var(--c-on-accent)" : "var(--c-muted)",
              }}>{s}</button>
            ))}
          </div>
        </div>

        {/* Task Type */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: ".7rem", fontWeight: 700, letterSpacing: ".08em", color: "var(--c-muted)", marginBottom: 8 }}>LOẠI CÔNG VIỆC</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {TASK_TYPES.map(tt => {
              const sel = taskType === tt;
              const c = typeColor(tt);
              return (
                <button key={tt} data-sfx="pop" data-anim="chip" onClick={() => setTaskType(sel ? "" : tt)} style={{
                  padding: "7px 12px", borderRadius: 10, cursor: "pointer", fontSize: ".8rem", fontWeight: 600,
                  border: sel ? `2px solid ${c}` : "1px solid var(--c-border)",
                  background: sel ? `${c}1a` : "var(--c-surface)", color: sel ? c : "var(--c-muted)",
                }}>{tt}</button>
              );
            })}
          </div>
        </div>

        {/* Priority & Project */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: ".7rem", fontWeight: 700, letterSpacing: ".08em", color: "var(--c-muted)", marginBottom: 8 }}>ƯU TIÊN &amp; DỰ ÁN</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[["🔴 Urgent", "#dc2626"], ["🟡 Important", "#ca8a04"]].map(([pp, c]) => {
              const sel = priority.includes(pp);
              return (
                <button key={pp} data-sfx="pop" data-anim="chip" onClick={() => togglePriority(pp)} style={{
                  padding: "7px 12px", borderRadius: 10, cursor: "pointer", fontSize: ".8rem", fontWeight: 600,
                  border: sel ? `2px solid ${c}` : "1px solid var(--c-border)",
                  background: sel ? `${c}1a` : "var(--c-surface)", color: sel ? c : "var(--c-muted)",
                }}>{pp}</button>
              );
            })}
            {["🔷 Nacon", "🟣 VP91", "🟠 KUNVANDONG"].map(pj => {
              const sel = project.includes(pj);
              return (
                <button key={pj} data-sfx="pop" data-anim="chip" onClick={() => toggleProject(pj)} style={{
                  padding: "7px 12px", borderRadius: 10, cursor: "pointer", fontSize: ".8rem", fontWeight: 600,
                  border: sel ? "2px solid #0369a1" : "1px solid var(--c-border)",
                  background: sel ? "#0369a11a" : "var(--c-surface)", color: sel ? "#0369a1" : "var(--c-muted)",
                }}>{pj}</button>
              );
            })}
          </div>
          {(priority.includes("🔴 Urgent") || priority.includes("🟡 Important")) && (
            <div style={{ fontSize: ".68rem", color: "var(--c-muted)", marginTop: 7 }}>
              ✨ Việc {priority.includes("🔴 Urgent") ? "khẩn cấp" : "quan trọng"} được cộng thêm điểm ({priority.includes("🔴 Urgent") ? "+8" : "+5"}) vì tác động lớn.
            </div>
          )}
        </div>

        {/* Plan tier — priority within the day (🔥 outline / 💤 faded in the main view) */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: ".7rem", fontWeight: 700, letterSpacing: ".08em", color: "var(--c-muted)", marginBottom: 8 }}>ƯU TIÊN TRONG NGÀY</div>
          <div style={{ display: "flex", gap: 8 }}>
            {[["must", "🔥 Ưu tiên", "var(--c2)"], ["normal", "• Bình thường", "var(--c-muted)"], ["optional", "💤 Ưu tiên thấp", "#64748b"]].map(([key, lbl, col]) => {
              const sel = tier === key;
              return (
                <button key={key} data-sfx="pop" data-anim="chip" onClick={() => setTier(key)} style={{
                  flex: 1, padding: "8px 6px", borderRadius: 10, cursor: "pointer", fontSize: ".76rem", fontWeight: 700,
                  border: sel ? `2px solid ${col}` : "1px solid var(--c-border)",
                  background: sel ? `color-mix(in srgb, ${col} 16%, transparent)` : "var(--c-surface)",
                  color: sel ? (key === "must" ? "var(--c1)" : col) : "var(--c-muted2)",
                }}>{lbl}</button>
              );
            })}
          </div>
        </div>

        {/* Date */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: ".7rem", fontWeight: 700, letterSpacing: ".08em", color: "var(--c-muted)" }}>NGÀY</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button data-sfx="swoosh" onClick={() => { const m = new Date(modalMonday); m.setDate(m.getDate()-7); setModalMonday(m); }} style={{ border: "1px solid var(--c-border)", background: "var(--c-surface)", borderRadius: 8, width: 26, height: 26, cursor: "pointer", color: wine }}>‹</button>
              <span style={{ fontSize: ".72rem", color: wine, fontWeight: 600, minWidth: 90, textAlign: "center" }}>{modalWeekLabel}</span>
              <button data-sfx="swoosh" onClick={() => { const m = new Date(modalMonday); m.setDate(m.getDate()+7); setModalMonday(m); }} style={{ border: "1px solid var(--c-border)", background: "var(--c-surface)", borderRadius: 8, width: 26, height: 26, cursor: "pointer", color: wine }}>›</button>
            </div>
          </div>
          <div className="day-tabs" style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
            {modalWeekDays.map(d => {
              const dt = new Date(d + "T00:00:00");
              const sel = d === date;
              const isT = d === TODAY;
              return (
                <button key={d} data-sfx="pop" data-anim="chip" onClick={() => setDate(d)} style={{
                  flex: "0 0 auto", minWidth: 46, padding: "8px 6px", borderRadius: 10, cursor: "pointer",
                  border: sel ? `2px solid ${wine}` : isT ? `1px solid ${gold}` : "1px solid var(--c-border)",
                  background: sel ? wine : "var(--c-surface)", color: sel ? "var(--c-on-accent)" : isT ? gold : "var(--c-muted)", textAlign: "center",
                }}>
                  <div style={{ fontSize: ".6rem", fontWeight: 700 }}>{DAYS_SHORT[dt.getDay()]}</div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.05rem", fontWeight: 600 }}>{dt.getDate()}</div>
                </button>
              );
            })}
          </div>
          {date && <div style={{ fontSize: ".72rem", color: "var(--c-muted)", marginTop: 8 }}>
            Đang chọn: <strong style={{ color: wine }}>{DAYS[new Date(date+"T00:00:00").getDay()]} {fmt(new Date(date+"T00:00:00"))}</strong>
          </div>}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10 }}>
          <button data-sfx="soft" onClick={() => requestClose(onClose)} style={{
            flex: 1, padding: "12px", borderRadius: 12, border: "1px solid var(--c-border)",
            background: "var(--c-surface)", color: "var(--c-muted)", cursor: "pointer", fontWeight: 600, fontSize: ".9rem",
          }}>Hủy</button>
          <button data-sfx="confirm" onClick={() => requestClose(() => {
            if (tierChanged) onSetTier(task.id, tier);
            if (hasChange) onSave(patch); else onClose();
          })} style={{
            flex: 2, padding: "12px", borderRadius: 12, border: "none",
            background: dirty ? wine : "var(--c-muted2)", color: "var(--c-on-accent)", cursor: "pointer", fontWeight: 700, fontSize: ".9rem",
          }}>{dirty ? "Lưu thay đổi" : "Đóng"}</button>
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
              <button data-sfx="danger" onClick={() => requestClose(onDelete)} style={{
                padding: "7px 16px", borderRadius: 10, border: "none", background: "#dc2626",
                color: "var(--c-on-accent)", cursor: "pointer", fontWeight: 700, fontSize: ".8rem",
              }}>Xóa</button>
              <button data-sfx="soft" onClick={() => setConfirmDel(false)} style={{
                padding: "7px 14px", borderRadius: 10, border: "1px solid var(--c-border)", background: "var(--c-surface)",
                color: "var(--c-muted)", cursor: "pointer", fontWeight: 600, fontSize: ".8rem",
              }}>Thôi</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
