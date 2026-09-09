// Calendar dates are local scheduling dates, never completion timestamps.
export function calendarDay(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function startOfWeek(date = new Date()) {
  const monday = new Date(date); monday.setHours(12,0,0,0);
  monday.setDate(monday.getDate() - (monday.getDay()+6)%7); return monday;
}
export function selectedWeekBounds(monday) {
  const start = startOfWeek(monday), end = new Date(start); end.setDate(end.getDate()+6);
  return [calendarDay(start),calendarDay(end)];
}
const sessions = ['🌅 Sáng','🏢 Office (11–7h)','🌙 Tối'];
export function linkedTasks(tasks, goalId, monday, filter = 'week') {
  const [start,end] = selectedWeekBounds(monday);
  const rank = s => { const i=sessions.findIndex(x => x===s || (s && x.includes(s.replace(/^\S+\s/,'')))); return i<0?3:i; };
  return tasks.filter(t=>t.goalId===goalId && (filter==='all'||(t.date && t.date>=start && t.date<=end)))
    .sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999') || rank(a.session)-rank(b.session) || (a.planOrder??Infinity)-(b.planOrder??Infinity) || a.name.localeCompare(b.name,'vi') || a.id.localeCompare(b.id));
}
