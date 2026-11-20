/** HTML presentation for permission-gated Friend Comparison.
 * Receives only the scoped output of buildFriendComparison, not raw user data.
 */
const esc = x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (n,d=0)=>n==null||!Number.isFinite(Number(n))?'—':Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const minutes=m=>m!=null&&Number.isFinite(Number(m))?`${Math.floor(Number(m)/60)}h ${String(Math.round(Number(m)%60)).padStart(2,'0')}m`:'—';
const dec=n=>fmt(n,1),rate=n=>n==null?'—':`${fmt(n,2)} ★`;
const speed=n=>n==null?'—':`${dec(n)} pg/hr`;
const days=n=>n==null?'—':`${fmt(n)} days`;
const fraction=n=>n==null?'—':`${Math.round(n*100)}%`;
const nozero=n=>n==null?'—':fmt(n);
const text=(s)=>esc(s==null?'—':s);
const subsection=(id,name,description,body,open=false)=>`<details class="compare-group card" ${open?'open':''} id="${esc(id)}"><summary><span><strong>${esc(name)}</strong><small>${esc(description)}</small></span><span class="compare-caret" aria-hidden="true">⌄</span></summary><div class="compare-body">${body}</div></details>`;
function pairs(title,rows,{note='',bar=false}={}) {
 const canBar=bar&&rows.some(r=>Number(r.a)>0||Number(r.b)>0);
 const max=Math.max(1,...rows.flatMap(r=>[Number.isFinite(Number(r.a))?Number(r.a):0,Number.isFinite(Number(r.b))?Number(r.b):0]));
 return `<div class="compare-card"><h3 class="small-title">${esc(title)}</h3>${note?`<p class="tiny">${esc(note)}</p>`:''}<div class="compare-column-head"><span>Metric</span><strong>You</strong><strong>Friend</strong></div>${rows.map(r=>{
   const left=r.aText??r.format?.(r.a)??nozero(r.a),right=r.bText??r.format?.(r.b)??nozero(r.b);
   return `<div class="compare-data-row"><span>${esc(r.label)}</span><span class="compare-number you">${text(left)}${canBar?`<i class="compare-mini-bar" style="width:${100*Math.max(0,Number(r.a)||0)/max}%"></i>`:''}</span><span class="compare-number friend">${text(right)}${canBar?`<i class="compare-mini-bar" style="width:${100*Math.max(0,Number(r.b)||0)/max}%"></i>`:''}</span></div>`;
 }).join('')}</div>`;
}
const mapRows=(a,b,name,value='minutes',format=minutes)=>{
 const am=new Map(a.map(x=>[x.id??x.key??x.genre??x.rating??x.label,x]));
 const bm=new Map(b.map(x=>[x.id??x.key??x.genre??x.rating??x.label,x]));
 const ids=[...new Set([...am.keys(),...bm.keys()])];
 return ids.map(id=>{
   const first=am.get(id),last=bm.get(id);
   return {label:name(first||last,id),a:first?first[value]:0,b:last?last[value]:0,format};
 });
};
const twoCards=(a,b)=>`<div class="compare-two">${a}${b}</div>`;

// These are real paired data visualizations, not metric tables decorated with 4px lines.
// They accept only the already permission-scoped output of buildFriendComparison.
const valid = value => value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
const chartNum = (value,kind='count') => {
 if(!valid(value))return '—';
 const n=Number(value);
 if(kind==='fraction')return `${Math.round(n*100)}%`;
 if(kind==='speed')return `${fmt(n,1)}`;
 if(kind==='minutes')return fmt(Math.round(n));
 if(Math.abs(n)>=10000)return `${fmt(n/1000,1)}k`;
 return Number.isInteger(n)?fmt(n):fmt(n,1);
};
const chartLegend = () => `<div class="compare-chart-legend" aria-hidden="true"><span><i class="compare-swatch you"></i>You</span><span><i class="compare-swatch friend"></i>Friend</span></div>`;
function chartHeader(title,note='',unit=''){
 return `<div class="compare-chart-heading"><div><h3 class="small-title">${esc(title)}</h3>${note?`<p class="tiny">${esc(note)}</p>`:''}</div>${unit?`<span class="compare-unit">${esc(unit)}</span>`:''}</div>`;
}
function pairedColumnChart(title,rows,{note='',kind='count',unit='',limit=40}={}){
 rows=(rows||[]).slice(0,limit);
 const values=rows.flatMap(r=>[r.a,r.b]).filter(valid).map(Number);
 const max=kind==='fraction'?1:Math.max(1,...values);
 const hasData=values.some(v=>v>0);
 const minW=Math.max(335,rows.length*62);
 const bars=rows.map(r=>{
  const name=esc(r.label);
  const one=(value,who)=>{
   const label=chartNum(value,kind);
   const height=valid(value)&&Number(value)>0?Math.max(1.5,Math.min(100,Number(value)/max*100)):0;
   return `<div class="compare-graph-bar ${who}${valid(value)?'':' is-missing'}" style="height:${height.toFixed(2)}%" title="${name} · ${who==='you'?'You':'Friend'}: ${esc(label)} ${esc(unit)}"><span class="compare-graph-value">${label==='—'?'—':(height?label:'')}</span></div>`;
  };
  return `<div class="compare-graph-group" aria-label="${name}: you ${esc(chartNum(r.a,kind))}, friend ${esc(chartNum(r.b,kind))}"><div class="compare-graph-bars">${one(r.a,'you')}${one(r.b,'friend')}</div><span class="compare-graph-label" title="${name}">${name}</span></div>`;
 }).join('');
 return `<section class="compare-card compare-viz">${chartHeader(title,note,unit)}${chartLegend()}${hasData?`<div class="compare-graph-scroll" tabindex="0" aria-label="${esc(title)}; scroll sideways for additional dates"><div class="compare-column-plot" style="min-width:${minW}px">${bars}</div></div>${rows.length>10?'<p class="compare-scroll-hint">Scroll sideways to explore all dates.</p>':''}`:'<p class="compare-chart-empty">No chartable activity in this period.</p>'}</section>`;
}
function pairedBarChart(title,rows,{note='',kind='count',unit='',limit=20}={}){
 rows=(rows||[]).slice(0,limit);
 const values=rows.flatMap(r=>[r.a,r.b]).filter(valid).map(Number);
 const max=kind==='fraction'?1:Math.max(1,...values);
 const hasData=values.some(v=>v>0);
 const items=rows.map(r=>{
  const bar=(v,who)=>{
   const width=valid(v)&&Number(v)>0?Math.min(100,Number(v)/max*100):0;
   return `<div class="compare-hbar-track ${who}"><i style="width:${width.toFixed(2)}%"></i></div>`;
  };
  return `<div class="compare-hbar-row"><span class="compare-hbar-title">${esc(r.label)}</span><div class="compare-hbar-stacks">${bar(r.a,'you')}${bar(r.b,'friend')}</div><div class="compare-hbar-values"><span>${esc(chartNum(r.a,kind))}</span><span>${esc(chartNum(r.b,kind))}</span></div></div>`;
 }).join('');
 return `<section class="compare-card compare-viz">${chartHeader(title,note,unit)}${chartLegend()}${hasData?`<div class="compare-hbar-rows" role="img" aria-label="${esc(title)}: paired bars for You and Friend">${items}</div>`:'<p class="compare-chart-empty">No chartable activity in this period.</p>'}</section>`;
}
function highlightCards(a,b,interests){
 const rows=[
  {title:'Reading time',left:minutes(a.minutes),right:minutes(b.minutes)},
  {title:'Pages progressed',left:nozero(a.pages),right:nozero(b.pages)},
  {title:'Reading sessions',left:nozero(a.sessionCount),right:nozero(b.sessionCount)},
  {title:'Active days',left:nozero(a.activeDays),right:nozero(b.activeDays)}
 ];
 return `<div class="compare-highlights">${rows.map(r=>`<div class="compare-highlight"><span class="compare-highlight-title">${esc(r.title)}</span><div class="compare-highlight-pair"><span><small>You</small><strong>${esc(r.left)}</strong></span><span><small>Friend</small><strong>${esc(r.right)}</strong></span></div></div>`).join('')}</div>`;
}

const shortList=(books,cap=8)=>books?.length?`<ul class="compare-book-list">${books.slice(0,cap).map(book=>`<li><strong>${esc(book.title)}</strong><small>${esc(book.author||'Author not recorded')}</small></li>`).join('')}</ul>${books.length>cap?`<p class="tiny">+ ${books.length-cap} more books</p>`:''}`:'<p class="tiny">None recorded</p>';
function periodRows(mine,theirs){
 return mine.periods.map((g,i)=>({label:g.label,a:g.minutes,b:theirs.periods[i]?.minutes||0,format:minutes}));
}
function goalRows(mine,theirs){
 return mine.goalSeries.map((g,i)=>{
  const other=theirs.goalSeries[i];
  return {label:g.key.slice(0,7)===g.key?g.key.slice(5):g.key.slice(5),a:g.days?g.daysMet/g.days:null,b:other?.days?other.daysMet/other.days:null,format:fraction};
 });
}
function heatmapPanel(label,heat){
 const max=Math.max(1,heat.maxMinutes);
 const bands=['Morning','Midday','Afternoon','Evening','Night'];
 return `<div class="compare-heat-box"><h4>${esc(label)}</h4><div class="compare-heat-head"><span></span>${bands.map(s=>`<span>${s.slice(0,3)}</span>`).join('')}</div>${heat.rows.map(row=>`<div class="compare-heat-line"><strong>${esc(row.name.slice(0,3))}</strong>${row.cells.map((cell,i)=>`<span title="${esc(row.name)} · ${bands[i]} · ${dec(cell.minutes)} minutes" aria-label="${esc(row.name)} ${bands[i]}: ${fmt(cell.minutes)} minutes" style="background:${cell.minutes?`rgba(48,126,80,${(.16+cell.minutes/max*.75).toFixed(2)})`:'#eef1e9'}"></span>`).join('')}</div>`).join('')}<p class="tiny">${minutes(heat.unknownMinutes)} unassigned (missing start times)</p></div>`;
}
function summaryView(d){
 if(!d.own||!d.other)return `<div class="notice warn">A summary is not yet available for one of these accounts. Check the Supabase summary function and refresh.</div>`;
 const a=d.own,b=d.other;
 const fields=[
  ['Books finished', 'books_finished',nozero],['Annual books goal','annual_goal',nozero],['Total reading time','total_minutes',minutes],
  ['Reading Only','reading_minutes',minutes],['Audiobook Only','audiobook_minutes',minutes],['Read + Listen','combined_minutes',minutes],
  ['Sessions','sessions_count',nozero],['Favorites count','favorites_count',nozero],['Mean rating','average_rating',rate]
 ];
 return `<div class="notice">Summary-only sharing: comparison is limited to the permitted annual aggregates for <strong>${esc(b.year||a.year||'the current year')}</strong>. More detailed metrics require the friend to grant Full access.</div>${pairedBarChart('Reading time by method',[{label:'Reading Only',a:a.reading_minutes,b:b.reading_minutes},{label:'Audiobook Only',a:a.audiobook_minutes,b:b.audiobook_minutes},{label:'Read + Listen',a:a.combined_minutes,b:b.combined_minutes}],{kind:'minutes',unit:'minutes'})}${pairs('Shared annual summary',fields.map(([label,key,format])=>({label,a:a[key],b:b[key],format})))}`;
}
function fullView(d){
 const a=d.mine,b=d.theirs,c=d.interests;
 const reportName=esc(d.friend.display_name||'Friend');
 const countMode=mapRows(a.activity.buckets,b.activity.buckets,x=>x.label,'minutes',minutes);
 const timed=mapRows(a.clock.buckets,b.clock.buckets,x=>x.label,'minutes',minutes);
 const speedTime=mapRows(a.clock.buckets,b.clock.buckets,x=>x.label,'pagesPerHour',speed);
 const byWeek=a.weekday.days.map((x,i)=>({label:x.name,a:x.avgMinutesPerDay,b:b.weekday.days[i].avgMinutesPerDay,format:n=>`${dec(n)} min/day`}));
 const len=mapRows(a.sessionsByLength.buckets,b.sessionsByLength.buckets,x=>x.label,'count',nozero);
 const genre=(key='books',f=nozero)=>{
   const left=new Map(a.library.genres.map(x=>[x.genre,x]));const right=new Map(b.library.genres.map(x=>[x.genre,x]));
   const keys=[...new Set([...left.keys(),...right.keys()])].sort((x,y)=>((right.get(y)?.books||0)+(left.get(y)?.books||0))-((right.get(x)?.books||0)+(left.get(x)?.books||0)));
   return keys.slice(0,14).map(k=>({label:k,a:left.get(k)?.[key]??(key==='avgRating'?null:0),b:right.get(k)?.[key]??(key==='avgRating'?null:0),format:f}));
 };
 const rating=(a.library.ratings||[]).concat(b.library.ratings||[]).map(x=>x.rating).filter((x,i,l)=>l.indexOf(x)===i).sort((x,y)=>x-y).map(r=>({label:`${fmt(r,2)} ★`,a:a.library.ratings.find(x=>x.rating===r)?.count||0,b:b.library.ratings.find(x=>x.rating===r)?.count||0,format:nozero}));
 const speedModes=[['Overall','overall'],['Reading Only','reading'],['Audiobook Only','audiobook'],['Read + Listen','read_listen']].map(([label,key])=>({label,a:a.speed[key].pagesPerHour,b:b.speed[key].pagesPerHour,format:speed}));
 const topBooks=(person)=>`<ul class="compare-efficiency">${person.perBook.slice(0,8).map(x=>`<li><strong>${esc(x.book.title)}</strong><small>${esc(x.book.author||'')} · ${minutes(x.minutes)} · ${fmt(x.pages)} pages · ${x.sessions} sessions · ${x.readingDays} active days</small></li>`).join('')||'<li>No reading activity in this period.</li>'}</ul>`;
 const year=String(d.period.year);
 const goalChart=pairedColumnChart('Daily goal completion by period',goalRows(a,b),{note:'Share of tracked days meeting each reader’s goal for that date.',kind:'fraction',unit:'goal days met'});
 const activityChart=pairedColumnChart('Reading activity over time',periodRows(a,b),{note:'Calendar dates or months in the selected period. No sessions are double counted.',kind:'minutes',unit:'minutes'});
 const pagesChart=pairedColumnChart('Pages progressed over time',a.periods.map((p,i)=>({label:p.label,a:p.pages,b:b.periods[i]?.pages??0,format:nozero})),{unit:'pages'});
 const rateByPeriod=pairedColumnChart('Speed over time · Overall',a.periods.map((p,i)=>({label:p.label,a:p.speed,b:b.periods[i]?.speed??null,format:speed})),{note:'Measured pages divided by measured session hours; missing readings are not estimated.',kind:'speed',unit:'pages/hour'});
 const rateByMethod=['reading','audiobook','read_listen'].map((k,i)=>{
   const active=a.periods.map((p,j)=>({label:p.label,a:p.modeSpeed[k].pagesPerHour,b:b.periods[j].modeSpeed[k].pagesPerHour,format:speed})).filter(r=>r.a!==null||r.b!==null);
   return pairedColumnChart(`Speed trends · ${['Reading Only','Audiobook Only','Read + Listen'][i]}`,active.length?active:[{label:'No measured sessions',a:null,b:null,format:speed}],{kind:'speed',unit:'pages/hour'});
 }).join('');
 const topEfficiency=(person)=>`<ul class="compare-efficiency">${person.efficiency.slice(0,6).map(e=>`<li><strong>${esc(e.title)}</strong><small>${e.readingDays}/${e.elapsedDays} active/elapsed days · ${e.minutesPerActiveDay==null?'—':dec(e.minutesPerActiveDay)+'m'} per active day · ${e.pagesPerActiveDay==null?'—':dec(e.pagesPerActiveDay)+'p'} per active day · ${e.consistency==null?'—':fraction(e.consistency)} consistency</small></li>`).join('')||'<li>No dated reading passes.</li>'}</ul>`;
 const byBookSpeed=person=>`<ul class="compare-efficiency">${person.perBook.filter(x=>x.speed.overall.measuredSessions>0).slice(0,8).map(x=>`<li><strong>${esc(x.book.title)}</strong><small>${speed(x.speed.overall.pagesPerHour)} · ${x.speed.overall.measuredSessions} measured sessions</small></li>`).join('')||'<li>No measured speed for books in this period.</li>'}</ul>`;
 const speedGenre=(()=>{const ga=new Map(a.genresSpeed.map(x=>[x.genre,x]));const gb=new Map(b.genresSpeed.map(x=>[x.genre,x]));return [...new Set([...ga.keys(),...gb.keys()])].slice(0,12).map(k=>({label:k,a:ga.get(k)?.pagesPerHour??null,b:gb.get(k)?.pagesPerHour??null,format:speed}));})();
 const tbrAge=a.library.tbr.distribution.buckets.map((r,i)=>({label:r.label,a:r.count,b:b.library.tbr.distribution.buckets[i].count,format:nozero}));
 const readModes=mapRows(a.activity.buckets,b.activity.buckets,x=>x.label,'share',n=>`${dec(n)}%`);
 return `<div class="compare-explanation">${esc(d.period.label)} · You: tracking since ${esc(a.cutoff||'unknown')} · ${reportName}: tracking since ${esc(b.cutoff||'unknown')}. Each account's own cutoff applies; comparisons may cover different numbers of tracked days. ${c.shared.length} title${c.shared.length===1?'':'s'} in common.</div>
 ${highlightCards(a,b,c)}
 ${subsection('compare-overview','Overview and activity','Reading time, page progress, sessions, active days and activity charts',
   `${activityChart}${pagesChart}<details class="compare-detail-disclosure"><summary>View all activity metrics</summary>${pairs('Additional activity metrics',[
      {label:'Reading time',a:a.minutes,b:b.minutes,format:minutes},
      {label:'Pages progressed',a:a.pages,b:b.pages,format:nozero},
      {label:'Physical-reading pages',a:a.physicalPages,b:b.physicalPages,format:nozero},
      {label:'Audiobook page-equivalents',a:a.audiobookEquivalents,b:b.audiobookEquivalents,format:nozero},
      {label:'Reading sessions',a:a.sessionCount,b:b.sessionCount,format:nozero},
      {label:'Books read in period',a:a.distinctBooks,b:b.distinctBooks,format:nozero},
      {label:'Active reading days',a:a.activeDays,b:b.activeDays,format:nozero},
      {label:'Current reading-day streak',a:a.streak.current,b:b.streak.current,format:days},
      {label:'Longest reading-day streak',a:a.streak.longest,b:b.streak.longest,format:days}
     ])}</details>${twoCards(`<div class="compare-card"><h3 class="small-title">Your most-read books</h3>${topBooks(a)}</div>`,`<div class="compare-card"><h3 class="small-title">${reportName}'s most-read books</h3>${topBooks(b)}</div>`)}
    ${pairs('Most-read book · by time',[
     {label:'Top book minutes',a:a.perBook[0]?.minutes||0,b:b.perBook[0]?.minutes||0,format:minutes},
     {label:'Top book sessions',a:a.perBook[0]?.sessions||0,b:b.perBook[0]?.sessions||0,format:nozero},
     {label:'Top book active days',a:a.perBook[0]?.readingDays||0,b:b.perBook[0]?.readingDays||0,format:nozero}])}`,true)}
 ${subsection('compare-goals','Goals and consistency','Annual completion, daily goal progress, goal reference and streaks',
    `${pairs('Annual and daily goals',[
      {label:`Books finished in ${year}`,a:a.completions,b:b.completions,format:nozero},
      {label:'Annual books target',a:a.annualGoal,b:b.annualGoal,format:nozero},
      {label:'Annual goal progress',a:a.completions/a.annualGoal,b:b.completions/b.annualGoal,format:fraction},
      {label:'Daily minutes target today',a:a.goal.targetMinutes,b:b.goal.targetMinutes,format:n=>`${fmt(n)} min`},
      {label:'Minutes logged today',a:a.goal.todayMinutes,b:b.goal.todayMinutes,format:minutes},
      {label:'Days meeting goal',a:a.goal.daysMet,b:b.goal.daysMet,format:nozero},
      {label:'Tracked calendar days',a:a.goal.evaluatedDays,b:b.goal.evaluatedDays,format:nozero},
      {label:'Goal success rate',a:a.goal.percentDaysMet,b:b.goal.percentDaysMet,format:fraction},
      {label:'Current goal streak',a:a.goal.currentGoalStreak,b:b.goal.currentGoalStreak,format:days},
      {label:'Longest goal streak',a:a.goal.longestGoalStreak,b:b.goal.longestGoalStreak,format:days},
      {label:'Total target minutes this period',a:a.goalSeries.reduce((n,x)=>n+x.targetMinutes,0),b:b.goalSeries.reduce((n,x)=>n+x.targetMinutes,0),format:minutes}
    ])}${goalChart}${pairedColumnChart('Logged reading time by day / month',a.goalSeries.map((g,i)=>({label:g.key.slice(5),a:g.actualMinutes,b:b.goalSeries[i]?.actualMinutes??0})),{note:'Compare actual recorded minutes. Each reader’s dated daily-goal totals remain in Annual and daily goals above.',kind:'minutes',unit:'minutes'})}${pairs('Daily goal totals by period',a.goalSeries.map((g,i)=>({label:g.key.slice(5),a:g.targetMinutes,b:b.goalSeries[i]?.targetMinutes??0,format:minutes})))}`)}
 ${subsection('compare-speed','Speed and reading performance','Weighted page speed by activity mode, genre, book and calendar period',
   `${pairedBarChart('Reading speed · pages per hour',speedModes,{note:'Only sessions with known page progress and time are included.',kind:'speed',unit:'pages/hour'})}
   ${pairs('Measured and unmeasured speed data',[
    {label:'Sessions with measured page speed',a:a.speed.overall.measuredSessions,b:b.speed.overall.measuredSessions,format:nozero},
    {label:'Sessions with no measurable page speed',a:a.speed.overall.excludedSessions,b:b.speed.overall.excludedSessions,format:nozero},
    {label:'Measured reading time',a:a.speed.overall.minutes,b:b.speed.overall.minutes,format:minutes}
   ])}${rateByPeriod}${rateByMethod}${pairedBarChart('Reading speed by primary genre',speedGenre,{kind:'speed',unit:'pages/hour'})}
   ${twoCards(`<div class="compare-card"><h3 class="small-title">Your speed by book</h3>${byBookSpeed(a)}</div>`,`<div class="compare-card"><h3 class="small-title">${reportName}: speed by book</h3>${byBookSpeed(b)}</div>`)}
   <p class="tiny">Audiobook-only page speed uses recorded print-edition page-equivalents; position-only logs cannot calculate pages/hour. Read + Listen minutes and pages count once.</p>`)}
 ${subsection('compare-habits','Time of day and reading habits','Five local time bands, day of week, heatmaps, length and method distribution',
   `${pairedBarChart('Reading time by time of day',timed,{note:'Local start times; minutes crossing a band boundary are split.',kind:'minutes',unit:'minutes'})}
    ${pairedBarChart('Weighted reading speed by time of day',speedTime,{note:'Measured sessions grouped by recorded local start time.',kind:'speed',unit:'pages/hour'})}
    ${pairs('Start-time coverage',[
      {label:'Minutes with known start time',a:a.clock.knownMinutes,b:b.clock.knownMinutes,format:minutes},
      {label:'Minutes without known start time',a:a.clock.unknownMinutes,b:b.clock.unknownMinutes,format:minutes},
      {label:'Sessions without known start time',a:a.clock.unknownSessions,b:b.clock.unknownSessions,format:nozero}
    ])}
    ${pairedBarChart('Reading by day of week · Sunday first',byWeek,{note:'Average minutes per tracked calendar weekday, including zero-session days.',kind:'minutes',unit:'minutes/day'})}
    ${pairs('Weekdays vs weekends',[
      {label:'Weekday reading time',a:a.weekday.weekdays.minutes,b:b.weekday.weekdays.minutes,format:minutes},
      {label:'Weekend reading time',a:a.weekday.weekends.minutes,b:b.weekday.weekends.minutes,format:minutes},
      {label:'Weekday average',a:a.weekday.weekdays.avgMinutesPerDay,b:b.weekday.weekdays.avgMinutesPerDay,format:n=>`${dec(n)} min/day`},
      {label:'Weekend average',a:a.weekday.weekends.avgMinutesPerDay,b:b.weekday.weekends.avgMinutesPerDay,format:n=>`${dec(n)} min/day`}
    ])}
    <div class="compare-heat-duo">${heatmapPanel('You',a.heatmap)}${heatmapPanel(reportName,b.heatmap)}</div>
    ${pairs('Session length',[
       {label:'Average session',a:a.sessionsByLength.avgMinutes,b:b.sessionsByLength.avgMinutes,format:n=>n==null?'—':`${dec(n)} min`},
       {label:'Median session',a:a.sessionsByLength.medianMinutes,b:b.sessionsByLength.medianMinutes,format:n=>n==null?'—':`${dec(n)} min`},
       {label:'Longest session',a:a.sessionsByLength.longestMinutes,b:b.sessionsByLength.longestMinutes,format:n=>n==null?'—':`${fmt(n)} min`}
    ])}${pairedBarChart('Session duration distribution',len,{unit:'sessions'})}
    ${pairedBarChart('Reading method · logged time',countMode,{kind:'minutes',unit:'minutes'})}
    ${pairedBarChart('Reading method · share of time',readModes,{unit:'% of time'})}
    ${pairs('Reading method · session counts',mapRows(a.activity.buckets,b.activity.buckets,x=>x.label,'sessions',nozero))}
    <p class="tiny">The 7 × 5 habit grid uses the five local clock bands. Missing historical start times are reported as unknown, not distributed into a guessed time period.</p>`)}
 ${subsection('compare-interests','Shared books and interests','Overlapping books, rating differences, similar and distinct genres',
   `${pairs('Your libraries',[
     {label:'Books in library',a:a.libraryCount,b:b.libraryCount,format:nozero},
     {label:'Books both of you have',a:c.shared.length,b:c.shared.length,format:nozero},
     {label:'Unique to each library',a:c.mineOnly.length,b:c.theirsOnly.length,format:nozero},
     {label:'Favorites',a:a.favorites,b:b.favorites,format:nozero},
     {label:'Rated books',a:a.rated,b:b.rated,format:nozero},
     {label:'Mean personal rating',a:a.library.averageRating,b:b.library.averageRating,format:rate}
    ])}
    <div class="compare-card"><h3 class="small-title">Books you both have</h3>${c.shared.length?`<ul class="compare-shared-list">${c.shared.slice(0,16).map(x=>`<li><span><strong>${esc(x.mine.title)}</strong><small>${esc(x.mine.author)}</small></span><span class="compare-book-rating">You: ${rate(x.mine.rating)}<small>${reportName}: ${rate(x.theirs.rating)}${x.ratingGap===null?'':` · Difference ${dec(Math.abs(x.ratingGap))} ★`}</small></span></li>`).join('')}</ul>${c.shared.length>16?`<p class="tiny">+${c.shared.length-16} more</p>`:''}`:'<p class="tiny">No overlapping books identified by matching title and author yet.</p>'}</div>
    ${twoCards(`<div class="compare-card"><h3 class="small-title">Only in your library</h3>${shortList(c.mineOnly)}</div>`,`<div class="compare-card"><h3 class="small-title">Only in ${reportName}'s library</h3>${shortList(c.theirsOnly)}</div>`)}
    <div class="compare-card"><h3 class="small-title">Genre similarities</h3><p class="compare-tag-label">Shared interests</p><div class="compare-tags">${c.sharedGenres.map(g=>`<span class="compare-tag">${esc(g)}</span>`).join('')||'<span class="tiny">No matching genre tags yet</span>'}</div>
    ${twoCards(`<div><p class="compare-tag-label">Unique to you</p><div class="compare-tags">${c.mineGenres.map(g=>`<span class="compare-tag">${esc(g)}</span>`).join('')||'<span class="tiny">None</span>'}</div></div>`,`<div><p class="compare-tag-label">Unique to ${reportName}</p><div class="compare-tags">${c.theirsGenres.map(g=>`<span class="compare-tag">${esc(g)}</span>`).join('')||'<span class="tiny">None</span>'}</div></div>`)}</div>
    ${pairedBarChart('Library by genre (primary genre)',genre('books'),{unit:'books'})}
    ${pairedBarChart('Average personal rating by genre',genre('avgRating',rate),{kind:'speed',unit:'stars'})}
    ${pairedBarChart('Quarter-star rating distribution',rating,{unit:'books'})}
    ${pairs('Reading status / shelf',[
      {label:'Currently reading',a:a.statuses.reading,b:b.statuses.reading,format:nozero},
      {label:'Want to read',a:a.statuses.tbr,b:b.statuses.tbr,format:nozero},
      {label:'Finished',a:a.statuses.finished,b:b.statuses.finished,format:nozero},
      {label:'Did not finish',a:a.statuses.dnf,b:b.statuses.dnf,format:nozero}
    ])}
    <p class="tiny">Matching uses normalized titles and author names; different editions of the same book can count as an overlap. Genre distribution follows each book's primary assigned genre.</p>`)}
 ${subsection('compare-library','TBR, completion efficiency and rereads','Aging, active vs elapsed days and original-vs-reread metrics',
   `${pairs('TBR aging',[
     {label:'Books on Want to Read',a:a.library.tbr.count,b:b.library.tbr.count,format:nozero},
     {label:'Average TBR age',a:a.library.tbr.averageAgeDays,b:b.library.tbr.averageAgeDays,format:n=>n==null?'—':`${fmt(n)} days`},
     {label:'Median TBR age',a:a.library.tbr.distribution.medianAgeDays,b:b.library.tbr.distribution.medianAgeDays,format:n=>n==null?'—':`${fmt(n)} days`},
     {label:'Unknown TBR added date',a:a.library.tbr.unknown,b:b.library.tbr.unknown,format:nozero}
   ])}${pairedBarChart('Distribution of days on TBR',tbrAge,{unit:'books'})}
   ${twoCards(`<div class="compare-card"><h3 class="small-title">Your most-active books</h3>${topEfficiency(a)}</div>`,`<div class="compare-card"><h3 class="small-title">${reportName}: most-active books</h3>${topEfficiency(b)}</div>`)}
   ${pairs('Reread history · lifetime',[
     {label:'Books reread',a:a.rereads.booksReread,b:b.rereads.booksReread,format:nozero},
     {label:'Rereads started',a:a.rereads.rereadsStarted,b:b.rereads.rereadsStarted,format:nozero},
     {label:'Rereads finished',a:a.rereads.rereadsFinished,b:b.rereads.rereadsFinished,format:nozero},
     {label:'Currently rereading',a:a.rereads.currentlyRereading,b:b.rereads.currentlyRereading,format:nozero},
     {label:'Reread sessions',a:a.rereads.rereadSessions,b:b.rereads.rereadSessions,format:nozero},
     {label:'Reread minutes',a:a.rereads.rereadMinutes,b:b.rereads.rereadMinutes,format:minutes},
     {label:'Completed pairs with full session times',a:a.rereadPairs.pairedTimeCount,b:b.rereadPairs.pairedTimeCount,format:nozero},
     {label:'Average original read time',a:a.rereadPairs.avgFirstMinutes,b:b.rereadPairs.avgFirstMinutes,format:minutes},
     {label:'Average completed reread time',a:a.rereadPairs.avgRereadMinutes,b:b.rereadPairs.avgRereadMinutes,format:minutes},
     {label:'Average first-read sessions',a:a.rereadPairs.avgFirstSessions,b:b.rereadPairs.avgFirstSessions,format:dec},
     {label:'Average reread sessions',a:a.rereadPairs.avgRereadSessions,b:b.rereadPairs.avgRereadSessions,format:dec},
     {label:'Known reading method switches',a:a.rereadPairs.methodChanges,b:b.rereadPairs.methodChanges,format:nozero},
     {label:'Most common method switch',aText:a.rereadPairs.mostCommonSwitch?`${a.rereadPairs.mostCommonSwitch.from} → ${a.rereadPairs.mostCommonSwitch.to}`:'—',bText:b.rereadPairs.mostCommonSwitch?`${b.rereadPairs.mostCommonSwitch.from} → ${b.rereadPairs.mostCommonSwitch.to}`:'—'}
   ])}<p class="tiny">Lifetime library and reread metrics intentionally match Insights' lifetime scope, while activities, speed, habits, and goal metrics use the selected calendar window. Unknown dates and page counts remain unestimated.</p>`)}
 <p class="tiny compare-footer-note">Only information this friend explicitly shared with Full access is included. Revoke or reduce access in Settings at any time; shared data is reloaded under Supabase RLS.</p>`;
}
export function renderFriendComparisonBody(result){
 if(result.access==='none')return '<div class="notice warn">This reader has not shared a profile with you. Ask them to enable sharing in Settings.</div>';
 return result.access==='summary'?summaryView(result):fullView(result);
}
