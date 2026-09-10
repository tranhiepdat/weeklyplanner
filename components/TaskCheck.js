// One checkbox surface for planner tasks, linked tasks and milestone drafts.
// The shared .check/.on rules provide each theme's shape, outline and feedback.
export default function TaskCheck({checked,label,onChange,disabled=false,style}) {
  return <div role="checkbox" aria-checked={!!checked} aria-label={label} aria-disabled={disabled||undefined}
    tabIndex={disabled?-1:0} className={`check ${checked?'on':''}`} style={style}
    onClick={()=>{if(!disabled)onChange(!checked);}}
    onKeyDown={e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();if(!disabled)onChange(!checked);}}}>
    {checked?'✓':''}
  </div>;
}
