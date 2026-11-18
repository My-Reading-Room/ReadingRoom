/** Reading Replay: deterministic, read-only recaps made from existing authorized records.
 * Local dates are calendar days, not UTC timestamps. Imported Goodreads finishes
 * contribute dated/year-only BOOK milestones, never fabricated session metrics.
 */
import { weekStartSunday } from './calendar-week.js';
import { readingPasses } from './reading-history.js';
import { readingSpeedByMode, dailyGoalTimeSeries } from './reading-metrics.js';
import { timeOfDayStats, activityDistribution, TIME_OF_DAY } from './reading-habits.js';
import { isTrackingDate, anchoredGoalHistory } from './tracking-start.js';

const isoDate=d=>d.toISOString().slice(0,10);
const dateUTC=d=>{if(!isTrackingDate(d))throw new RangeError('A valid YYYY-MM-DD local date is required');return new Date(d+'T12:00:00Z');};
const moveDays=(d,n)=>{const x=dateUTC(d);x.setUTCDate(x.getUTCDate()+n);return isoDate(x);};
const dayCount=(a,b)=>Math.round((dateUTC(b)-dateUTC(a))/86400000)+1;
const validPositive=x=>Number.isFinite(Number(x))&&Number(x)>0?Number(x):0;
const pageValue=s=>s.pages_read===null||s.pages_read===undefined||s.pages_read===''?0:validPositive(s.pages_read);
const validRating=v=>v!==null&&v!==undefined&&Number.isFinite(Number(v))&&Number(v)>=.25&&Number(v)<=5?Number(v):null;
const periodTypes=['week','month','year'];

/** Offset zero is the most recently COMPLETED period. Negative offsets are older complete periods. */
export function replayPeriod(kind='week',today,offset=0){
 if(!periodTypes.includes(kind)||!Number.isInteger(offset)||offset>0||offset < -300)throw new RangeError('Invalid replay period');
 const anchor=dateUTC(today),currentYear=anchor.getUTCFullYear();let start,end;
 if(kind==='week'){
   start=moveDays(weekStartSunday(today),7*(offset-1));end=moveDays(start,6);
 }else if(kind==='month'){
   const base=new Date(Date.UTC(currentYear,anchor.getUTCMonth()+offset-1,1,12));
   start=isoDate(base);end=isoDate(new Date(Date.UTC(base.getUTCFullYear(),base.getUTCMonth()+1,0,12)));
 }else {const y=currentYear+offset-1;start=`${y}-01-01`;end=`${y}-12-31`;}
 // Only sealed calendar periods appear in Reading Replay. Live progress belongs in Insights.
 const visibleEnd=end;
 const elapsed=dayCount(start,end);
 const full=true;
 const format=d=>dateUTC(d).toLocaleDateString('en-US',{timeZone:'UTC',month:'short',day:'numeric'});
 const year=start.slice(0,4),monthName=dateUTC(start).toLocaleDateString('en-US',{timeZone:'UTC',month:'long'});
 const label=kind==='week'?`${format(start)} – ${format(end)}, ${end.slice(0,4)}`:kind==='month'?`${monthName} ${year}`:year;
 const period={kind,start,end,visibleEnd,elapsed,full,offset,label,year:Number(year)};
 const prior=replayPeriodPrevious(period);
 return {...period,previousStart:prior.start,previousEnd:prior.end,previousVisibleEnd:prior.end};
}
/** Resolve a celebration link to the exact completed period it names. */
export function replayOffsetForEnd(kind,today,end){
 if(typeof end!=='string')return null;
 for(let offset=0;offset>=-300;offset--){
  const p=replayPeriod(kind,today,offset);
  if(p.end===end)return offset;
  if(p.end<end)break;
 }
 return null;
}
function replayPeriodPrevious(p){
 if(p.kind==='week')return {start:moveDays(p.start,-7),end:moveDays(p.end,-7)};
 if(p.kind==='month'){
   const d=dateUTC(p.start),prev=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()-1,1,12));
   return {start:isoDate(prev),end:isoDate(new Date(Date.UTC(prev.getUTCFullYear(),prev.getUTCMonth()+1,0,12)))};
 }
 return {start:`${p.year-1}-01-01`,end:`${p.year-1}-12-31`};
}

const inBounds=(day,start,end)=>isTrackingDate(day)&&day>=start&&day<=end;
const mainGenre=book=>Array.isArray(book?.genres)?(book.genres.find(g=>typeof g==='string'&&g.trim())||'Uncategorized').trim():'Uncategorized';
function finishMilestones(books,kind,start,end,visibleEnd){
 const items=[],yearOnly=[];
 for(const book of books){
  const passes=readingPasses(book);
  for(const pass of passes){
   if(pass.status!=='finished')continue;
   const dated=isTrackingDate(pass.finished_on)?pass.finished_on:null;
   const year=Number(pass.finished_year||dated?.slice(0,4));
   if(dated&&inBounds(dated,start,visibleEnd))items.push({book,pass,finished_on:dated,yearOnly:false});
   else if(!dated&&kind==='year'&&year===Number(start.slice(0,4)))yearOnly.push({book,pass,finished_on:null,yearOnly:true});
  }
 }
 // Distinct books (not reread passes) are used in completion totals.
 const distinct=[...new Map([...items,...yearOnly].map(x=>[String(x.book.id),x])).values()];
 return {items:[...items,...yearOnly],distinct,yearOnlyCount:yearOnly.length,rereads:[...items,...yearOnly].filter(x=>x.pass.number>1).length};
}
function makeSummary(books,sessions,p,{includeYearOnly=true,trackingStart=null}){
 const first=trackingStart&&trackingStart>p.start?trackingStart:p.start;
 const eligible=first<=p.visibleEnd?dayCount(first,p.visibleEnd):0;
 const rows=sessions.filter(s=>inBounds(s.session_date,first,p.visibleEnd));
 const timed=rows.filter(s=>validPositive(s.duration_minutes)>0);
 const minutes=timed.reduce((n,s)=>n+validPositive(s.duration_minutes),0);
 const pages=rows.reduce((n,s)=>n+pageValue(s),0);
 const physicalPages=rows.filter(s=>(s.activity_mode||'reading')!=='audiobook').reduce((n,s)=>n+pageValue(s),0);
 const audioPages=rows.filter(s=>s.activity_mode==='audiobook').reduce((n,s)=>n+pageValue(s),0);
 const days=[...new Set(timed.map(s=>s.session_date))].sort();
 const byDay=new Map();for(const s of timed)byDay.set(s.session_date,(byDay.get(s.session_date)||0)+validPositive(s.duration_minutes));
 const distribution=activityDistribution(timed),clock=timeOfDayStats(timed);
 const byBook=new Map(),byGenre=new Map(),byMonth=new Map();
 const lookup=new Map(books.map(b=>[String(b.id),b]));
 for(const s of timed){
  const book=lookup.get(String(s.user_book_id));if(!book)continue;
  const m=validPositive(s.duration_minutes),key=String(book.id),genre=mainGenre(book);
  byBook.set(key,(byBook.get(key)||0)+m);byGenre.set(genre,(byGenre.get(genre)||0)+m);
  const month=s.session_date.slice(0,7);byMonth.set(month,(byMonth.get(month)||0)+m);
 }
 const sorted=(map)=>[...map].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
 const topBooks=sorted(byBook).slice(0,5).map(([id,minutes])=>({book:lookup.get(id),minutes}));
 const complete=finishMilestones(books,p.kind,p.start,p.end,p.visibleEnd);
 let topGenres=sorted(byGenre).map(([genre,minutes])=>({genre,value:minutes})),genreBasis='logged minutes';
 if(!topGenres.length){
  const tally=new Map();for(const {book} of complete.distinct){const g=mainGenre(book);tally.set(g,(tally.get(g)||0)+1);}
  topGenres=sorted(tally).map(([genre,value])=>({genre,value}));genreBasis='finished books';
 }
 const ratings=complete.distinct.map(({book})=>validRating(book.rating)).filter(v=>v!==null);
 const activity=days.reduce((a,d)=>{const day=byDay.get(d)||0;return !a||day>a.minutes?{date:d,minutes:day}:a;},null);
 const peakMonth=[...byMonth.entries()].sort((a,b)=>b[1]-a[1])[0];
 const busiestMonth=peakMonth?{month:peakMonth[0],minutes:peakMonth[1]}:null;
 const speed=readingSpeedByMode(rows);
 let bestStreak=0,run=0,last='';for(const d of days){run=last&&moveDays(last,1)===d?run+1:1;bestStreak=Math.max(bestStreak,run);last=d;}
 // Calendar chart: everyday dates for weekly/monthly, full 12 months for annual.
 const timeline=[];
 if(p.kind==='year')for(let m=1;m<=12;m++){
  const month=`${p.year}-${String(m).padStart(2,'0')}`;
  timeline.push({key:month,label:dateUTC(month+'-01').toLocaleDateString('en-US',{timeZone:'UTC',month:'short'}),value:byMonth.get(month)||0,future:month>p.visibleEnd.slice(0,7)});
 }else for(let d=p.start;d<=p.end;d=moveDays(d,1)){
  timeline.push({key:d,label:p.kind==='week'?dateUTC(d).toLocaleDateString('en-US',{timeZone:'UTC',weekday:'short'}):String(Number(d.slice(-2))),value:byDay.get(d)||0,future:d>p.visibleEnd});
 }
 const clockBands=TIME_OF_DAY.map(b=>({id:b.id,label:b.label,minutes:clock.buckets.find(x=>x.id===b.id).minutes}));
 const topClock=[...clockBands].sort((a,b)=>b.minutes-a.minutes)[0];
 return {minutes,pages,physicalPages,audioPages,activeDays:days.length,sessions:rows.length,booksTouched:new Set(rows.map(s=>s.user_book_id)).size,
  eligibleDays:eligible,rows,days,byDay,topBooks,topGenres,genreBasis,finished:complete.distinct,finishPasses:complete.items,yearOnlyCount:complete.yearOnlyCount,
  rereads:complete.rereads,averageRating:ratings.length?ratings.reduce((a,b)=>a+b,0)/ratings.length:null,ratingCount:ratings.length,
  mode:distribution.buckets,clock:clockBands,knownClockMinutes:clock.knownMinutes,unknownClockMinutes:clock.unknownMinutes,
  topClock:clock.knownMinutes?topClock:null,speed,peakDay:activity,peakMonth:busiestMonth,bestStreak,timeline};
}
export function buildReadingReplay({books=[],sessions=[],goalHistory=[],today,trackingStart=null,startingGoal=null,yearGoal=null,kind='week',offset=0}={}){
 const p=replayPeriod(kind,today,offset),ownerBooks=Array.isArray(books)?books:[],ids=new Set(ownerBooks.map(b=>String(b.id)));
 const rows=(Array.isArray(sessions)?sessions:[]).filter(s=>ids.has(String(s.user_book_id)));
 const start=isTrackingDate(trackingStart)?trackingStart:null;
 const current=makeSummary(ownerBooks,rows,p,{trackingStart:start});
 // Completed periods compare against the entire preceding completed period.
 const prior={...p,start:p.previousStart,end:p.previousEnd,visibleEnd:p.previousVisibleEnd,year:Number(p.previousStart.slice(0,4))};
 const previous=makeSummary(ownerBooks,rows,prior,{trackingStart:start});
 const anchored=anchoredGoalHistory(goalHistory,start,startingGoal);
 let goal=null;
 if(current.eligibleDays){
  const dailyGoal=Number.isInteger(Number(startingGoal))&&Number(startingGoal)>0?Number(startingGoal):30;
  const points=dailyGoalTimeSeries(rows,{targetMinutes:dailyGoal,goalHistory:anchored,today,
    periodStart:p.start,periodEnd:p.end,groupBy:kind==='year'?'month':'day',activeFrom:start});
  goal={daysMet:points.reduce((n,x)=>n+x.daysMet,0),days:points.reduce((n,x)=>n+x.days,0),targets:points.reduce((n,x)=>n+x.targetMinutes,0)};
 }
 // Annual target is independently stored. If the year has no saved target,
 // don't claim achievement of a made-up 12-book annual challenge.
 const challenge=kind==='year'&&Number.isInteger(Number(yearGoal))&&Number(yearGoal)>0?{target:Number(yearGoal),done:current.finished.length}:null;
 const delta=previous.eligibleDays>0?{minutes:current.minutes-previous.minutes,percent:previous.minutes>0?(current.minutes-previous.minutes)/previous.minutes*100:null,priorMinutes:previous.minutes}:null;
 const sessionNote=start&&start>p.start?`Session metrics begin ${start}; earlier completions remain included.`:null;
 const noClock=current.minutes>0&&!current.knownClockMinutes;
 return {period:p,...current,previous,goal,challenge,delta,sessionNote,noClock,
  hasSessionData:current.sessions>0,hasAnyData:current.sessions>0||current.finished.length>0,
  disclaimer:'Finished books come from recorded completion dates (or known years in annual recaps). Time, pages, speed and routines use logged sessions only.'};
}
