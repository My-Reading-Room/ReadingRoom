/** My Reading Room v1.9 — pure analytics on the viewer's authorized data.
 * Session dates and optional start_local_time are local wall-clock values.
 * No start time is inferred for legacy or manually entered sessions.
 */
import { bookReadingDays, readingSpeedStats } from './reading-metrics.js';
import { WEEKDAY_NAMES } from './calendar-week.js';

export const TIME_OF_DAY = Object.freeze([
  {id:'morning',label:'Morning',hours:'05:00–10:59',start:300},
  {id:'midday',label:'Midday',hours:'11:00–12:59',start:660},
  {id:'afternoon',label:'Afternoon',hours:'13:00–16:59',start:780},
  {id:'evening',label:'Evening',hours:'17:00–19:59',start:1020},
  {id:'night',label:'Night',hours:'20:00–04:59',start:1200}
]);
export const WEEKDAYS = WEEKDAY_NAMES;
export const MODES = Object.freeze(['reading','audiobook','read_listen']);
const BOUNDARIES=[300,660,780,1020,1200,1440];
const validDate=d=>{if(typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d))return false;const n=Date.parse(d+'T00:00:00Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===d;};
const dateNumber=d=>validDate(d)?Date.parse(d+'T00:00:00Z')/86400000:null;
const shiftDate=(d,n)=>new Date((dateNumber(d)+n)*86400000).toISOString().slice(0,10);
const weekday=d=>validDate(d)?new Date(d+'T12:00:00Z').getUTCDay():null;
const minOf=s=>{if(typeof s!=='string')return null;const m=s.match(/^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);if(!m)return null;const h=Number(m[1]),mins=Number(m[2]);return h>=0&&h<24&&mins>=0&&mins<60?h*60+mins:null;};
export function timeBucket(minutes){return minutes<300||minutes>=1200?'night':minutes<660?'morning':minutes<780?'midday':minutes<1020?'afternoon':'evening';}
function validMinutes(s){const m=Number(s?.duration_minutes);return Number.isFinite(m)&&m>0?m:0;}
const mode=s=>MODES.includes(s?.activity_mode)?s.activity_mode:'reading';
const emptyBucket=id=>({id,label:TIME_OF_DAY.find(x=>x.id===id)?.label||id,minutes:0,sessions:0,speedPages:0,speedMinutes:0,pagesPerHour:null});

/** Allocate ACTUAL session minutes into the five time bands, including midnight.
 * Page speed is assigned to the session START band; no pages are guessed for
 * partial time-band slices. A pause/resume session uses its logged wall-clock
 * start and elapsed reading duration, not a full timestamp-based activity trail.
 */
export function splitTimedSession(session){
  const date=session?.session_date,pos=minOf(session?.start_local_time);
  const duration=validMinutes(session);
  if(!validDate(date)||pos===null||!duration||duration>10080)return [];
  let remaining=duration,minutesOfDay=pos,offset=0;
  const out=[];
  while(remaining>0){
    const next=BOUNDARIES.find(x=>x>minutesOfDay)||1440;
    const amount=Math.min(remaining,next-minutesOfDay);
    out.push({date:shiftDate(date,offset),weekday:weekday(shiftDate(date,offset)),bucket:timeBucket(minutesOfDay),minutes:amount});
    remaining-=amount;minutesOfDay+=amount;
    if(minutesOfDay>=1440){minutesOfDay=0;offset++;}
  }
  return out;
}
export function timeOfDayStats(sessions=[]){
  const buckets=TIME_OF_DAY.map(x=>emptyBucket(x.id)),by=Object.fromEntries(buckets.map(b=>[b.id,b]));
  let knownMinutes=0,unknownMinutes=0,unknownSessions=0;
  for(const s of sessions){
    const mins=validMinutes(s);if(!mins)continue;
    const pieces=splitTimedSession(s);
    if(!pieces.length){unknownSessions++;unknownMinutes+=mins;continue;}
    knownMinutes+=pieces.reduce((n,p)=>n+p.minutes,0);
    pieces.forEach(p=>by[p.bucket].minutes+=p.minutes);
    const b=by[timeBucket(minOf(s.start_local_time))];b.sessions++;
    // Session-level page count is always exact or user-entered; never allocate
    // pages proportionally to an individual time-of-day bucket.
    const pages=Number(s.pages_read);
    if(s.pages_read!=null&&Number.isFinite(pages)&&pages>0){b.speedPages+=pages;b.speedMinutes+=mins;}
  }
  buckets.forEach(b=>b.pagesPerHour=b.speedMinutes>0?b.speedPages*60/b.speedMinutes:null);
  return {buckets,knownMinutes,unknownMinutes,unknownSessions,totalMinutes:knownMinutes+unknownMinutes};
}

/** Five time bands × all activity and each of the three activity types.
 * Every pages/hr value is a weighted rate: total exact pages / total measured
 * minutes. Unknown start times and sessions without page data stay excluded.
 */
export function timeOfDaySpeedByMode(sessions=[]){
 const keys=['overall',...MODES];
 const breakdown=Object.fromEntries(keys.map(key=>[key,timeOfDayStats(key==='overall'?sessions:sessions.filter(s=>mode(s)===key))]));
 return TIME_OF_DAY.map((band,index)=>({id:band.id,label:band.label,hours:band.hours,
   speeds:Object.fromEntries(keys.map(key=>{
     const b=breakdown[key].buckets[index];
     return [key,{pagesPerHour:b.pagesPerHour,measuredMinutes:b.speedMinutes,
       measuredPages:b.speedPages}];
   }))
 }));
}

/** Weekday analysis uses the stored session_date, identical to regular Insights
 * and daily goals. Every calendar date contributes to averages, including days
 * without sessions (but not future dates). Split-by-time heatmap is separate.
 */
export function dayOfWeekStats(sessions=[],{periodStart,periodEnd,today,activeFrom=null}={}){
 const begin=dateNumber(periodStart),end=dateNumber(periodEnd),now=dateNumber(today);
 const trackFrom=dateNumber(activeFrom),effectiveBegin=trackFrom===null?begin:Math.max(begin,trackFrom);
 if(begin===null||end===null||now===null||end<begin)throw new RangeError('Valid calendar period required');
 const days=WEEKDAYS.map((name,i)=>({id:i,name,daysInPeriod:0,minutes:0,sessions:0,activeDates:new Set(),avgMinutesPerDay:0}));
 for(let day=effectiveBegin;day<=Math.min(end,now);day++){const d=new Date(day*86400000).toISOString().slice(0,10);days[weekday(d)].daysInPeriod++;}
 for(const s of sessions){if(!validDate(s.session_date)||s.session_date<periodStart||(trackFrom!==null&&dateNumber(s.session_date)<trackFrom)||s.session_date>periodEnd||s.session_date>today)continue;
 const b=days[weekday(s.session_date)],m=validMinutes(s);if(!m)continue;b.minutes+=m;b.sessions++;b.activeDates.add(s.session_date);}
 for(const b of days){b.activeDays=b.activeDates.size;b.avgMinutesPerDay=b.daysInPeriod?b.minutes/b.daysInPeriod:0;delete b.activeDates;}
 const aggregate=indices=>{const arr=indices.map(i=>days[i]),minutes=arr.reduce((a,x)=>a+x.minutes,0),calendarDays=arr.reduce((a,x)=>a+x.daysInPeriod,0);return {minutes,calendarDays,avgMinutesPerDay:calendarDays?minutes/calendarDays:0,sessions:arr.reduce((a,x)=>a+x.sessions,0)};};
 return {days,weekdays:aggregate([1,2,3,4,5]),weekends:aggregate([0,6])};
}
export function weekdayTimeHeatmap(sessions=[]){
 const rows=WEEKDAYS.map((name,idx)=>({name,id:idx,cells:TIME_OF_DAY.map(t=>({id:t.id,minutes:0}))}));
 let unknownMinutes=0;
 for(const s of sessions){const mins=validMinutes(s);if(!mins)continue;const parts=splitTimedSession(s);
 if(!parts.length){unknownMinutes+=mins;continue;}
 for(const p of parts){const cell=rows[p.weekday].cells.find(x=>x.id===p.bucket);cell.minutes+=p.minutes;}
 }
 return {rows,unknownMinutes,maxMinutes:Math.max(0,...rows.flatMap(r=>r.cells.map(c=>c.minutes)))};
}
export function sessionLengthStats(sessions=[]){
 const breaks=[{id:'0-15',label:'1–15 min',min:1,max:15},{id:'16-30',label:'16–30 min',min:16,max:30},{id:'31-60',label:'31–60 min',min:31,max:60},{id:'61-90',label:'61–90 min',min:61,max:90},{id:'91+',label:'91+ min',min:91,max:Infinity}];
 const valid=sessions.map(validMinutes).filter(m=>m>0).sort((a,b)=>a-b),sum=valid.reduce((a,b)=>a+b,0);
 const n=valid.length,med=n?(valid[Math.floor((n-1)/2)]+valid[Math.floor(n/2)])/2:null;
 return {count:n,totalMinutes:sum,avgMinutes:n?sum/n:null,medianMinutes:med,longestMinutes:valid.at(-1)||null,buckets:breaks.map(b=>({id:b.id,label:b.label,count:valid.filter(m=>m>=b.min&&m<=b.max).length}))};
}
export function activityDistribution(sessions=[]){
 const buckets=MODES.map(id=>({id,label:id==='reading'?'Reading Only':id==='audiobook'?'Audiobook Only':'Read + Listen',minutes:0,sessions:0,share:0}));
 const lookup=Object.fromEntries(buckets.map(b=>[b.id,b]));
 for(const s of sessions){const m=validMinutes(s);if(m<=0)continue;const b=lookup[mode(s)];b.minutes+=m;b.sessions++;}
 const totalMinutes=buckets.reduce((a,b)=>a+b.minutes,0);
 buckets.forEach(b=>b.share=totalMinutes?100*b.minutes/totalMinutes:0);
 return {buckets,totalMinutes,totalSessions:buckets.reduce((a,b)=>a+b.sessions,0)};
}
export function completionEfficiency(books=[],sessions=[],{today,activityMode='all'}={}){
 return books.map(book=>{
 const latest=Array.isArray(book.read_history)&&book.read_history.length?book.read_history.at(-1).number:1;
 const passSessions=sessions.filter(s=>s.user_book_id===book.id&&Number(s.read_number||1)===latest);
 const d=bookReadingDays(book,passSessions,{today,activityMode});
 const logs=passSessions.filter(s=>s.user_book_id===book.id&&validDate(s.session_date)
 &&(!today||s.session_date<=today)&&(activityMode==='all'||mode(s)===activityMode)
 &&(!d.startDate||s.session_date>=d.startDate)&&(!d.endDate||s.session_date<=d.endDate));
 const minutes=logs.reduce((n,s)=>n+validMinutes(s),0);
 const pages=logs.reduce((n,s)=>{const p=Number(s.pages_read);return n+(s.pages_read!=null&&Number.isFinite(p)&&p>0?p:0);},0);
 return {bookId:book.id,title:book.title,status:book.status,readingDays:d.readingDays,elapsedDays:d.elapsedDays,consistency:d.consistency,
 minutes,pages,sessions:logs.length,minutesPerActiveDay:d.readingDays?minutes/d.readingDays:null,pagesPerActiveDay:d.readingDays?pages/d.readingDays:null};
 }).filter(x=>x.elapsedDays!==null).sort((a,b)=>b.readingDays-a.readingDays||b.minutes-a.minutes);
}

/** Calendar-day TBR age distribution. Bins are non-overlapping, include today
 * as age zero, and deliberately exclude records with no trustworthy date.
 * Library creation and Goodreads added dates are flagged as proxies, because
 * neither proves the date the book entered a TBR shelf. */
export const TBR_AGE_BINS = Object.freeze([
 {id:'0-30',label:'0–30 days',min:0,max:30},
 {id:'31-90',label:'31–90 days',min:31,max:90},
 {id:'91-180',label:'91–180 days',min:91,max:180},
 {id:'181-365',label:'181–365 days',min:181,max:365},
 {id:'366-730',label:'1–2 years',min:366,max:730},
 {id:'731-1095',label:'2–3 years',min:731,max:1095},
 {id:'1096-1460',label:'3–4 years',min:1096,max:1460},
 {id:'1461-1825',label:'4–5 years',min:1461,max:1825},
 {id:'1826+',label:'5+ years',min:1826,max:Infinity}
]);
export function tbrAgeDistribution(aged=[],unknown=0){
 const values=aged.map(x=>Number(x.ageDays)).filter(n=>Number.isInteger(n)&&n>=0).sort((a,b)=>a-b);
 const count=values.length,maxIndex=values.length-1;
 const median=count?(values[Math.floor(maxIndex/2)]+values[Math.ceil(maxIndex/2)])/2:null;
 const buckets=TBR_AGE_BINS.map(b=>{const books=values.filter(n=>n>=b.min&&n<=b.max).length;return {...b,count:books,share:count?books/count:0};});
 return {buckets,known:count,unknown,medianAgeDays:median,estimated:aged.filter(x=>x.source&&x.source!=='tbr_added_on').length};
}

export function libraryStatistics(books=[],{today}={}){
 const todayN=dateNumber(today);if(todayN===null)throw new RangeError('Valid today required');
 const groups=new Map(),ratings=new Map();let rated=0,sumRatings=0;
 for(const book of books){
   // Every assigned genre is reflected immediately, not just the first tag.
   const tags=[...new Set((Array.isArray(book.genres)?book.genres:[]).filter(g=>typeof g==='string'&&g.trim()).map(g=>g.trim()))];
   const names=tags.length?tags:['Uncategorized'];
   const rating=Number(book.rating),hasRating=book.rating!=null&&Number.isFinite(rating)&&rating>=.25&&rating<=5&&Math.round(rating*4)===rating*4;
   const read=book.status==='finished'||(Array.isArray(book.read_history)&&book.read_history.some(p=>p.status==='finished'));
   for(const name of names){
     if(!groups.has(name))groups.set(name,{genre:name,books:0,read:0,unread:0,rated:0,ratingTotal:0,avgRating:null});
     const entry=groups.get(name);entry.books++;if(read)entry.read++;else entry.unread++;
     if(hasRating){entry.rated++;entry.ratingTotal+=rating;}
   }
   if(hasRating){rated++;sumRatings+=rating;ratings.set(rating,(ratings.get(rating)||0)+1);}
 }
 const genres=[...groups.values()].map(x=>({...x,avgRating:x.rated?x.ratingTotal/x.rated:null})).sort((a,b)=>b.books-a.books||a.genre.localeCompare(b.genre));
 const tbr=books.filter(b=>b.status==='tbr');let unknownTbr=0;
 const aged=tbr.map(b=>{
   const source=validDate(b.tbr_added_on)?'tbr_added_on':validDate(b.goodreads_added_on)?'goodreads_added_on':validDate(String(b.created_at||'').slice(0,10))?'created_at':null;
   const date=source==='tbr_added_on'?b.tbr_added_on:source==='goodreads_added_on'?b.goodreads_added_on:source==='created_at'?String(b.created_at).slice(0,10):null;
   if(!date||dateNumber(date)>todayN){unknownTbr++;return null;}
   return {bookId:b.id,title:b.title,addedOn:date,ageDays:todayN-dateNumber(date),source};
 }).filter(Boolean).sort((a,b)=>b.ageDays-a.ageDays);
 const ageSum=aged.reduce((a,b)=>a+b.ageDays,0);
 return {genres,ratings:[...ratings].sort((a,b)=>a[0]-b[0]).map(([rating,count])=>({rating,count})),rated,averageRating:rated?sumRatings/rated:null,
 tbr:{aged,count:tbr.length,known:aged.length,unknown:unknownTbr,averageAgeDays:aged.length?ageSum/aged.length:null,oldest:aged.slice(0,5),distribution:tbrAgeDistribution(aged,unknownTbr)}};
}

/** Weighted pages/hour grouped by each book's PRIMARY genre. A multi-tagged
 * book appears once, so its session pages and minutes are never duplicated.
 * Filtered mode may be all, reading, audiobook or read_listen. Audiobook
 * rates use recorded print-edition page-equivalents, not guessed pages. */
export function genreSpeedStats(books=[],sessions=[],{activityMode='all'}={}){
 if(activityMode!=='all'&&!MODES.includes(activityMode))throw new RangeError('Invalid reading mode');
 const allowed=new Map(books.map(b=>[b.id,(Array.isArray(b.genres)?b.genres.find(g=>typeof g==='string'&&g.trim()):null)?.trim()||'Uncategorized']));
 const buckets=new Map();
 for(const s of sessions){
  if(!allowed.has(s.user_book_id)||activityMode!=='all'&&mode(s)!==activityMode)continue;
  const label=allowed.get(s.user_book_id);
  if(!buckets.has(label))buckets.set(label,[]);
  buckets.get(label).push(s);
 }
 return [...buckets].map(([genre,rows])=>({genre,bookCount:new Set(rows.map(r=>r.user_book_id)).size,
    ...readingSpeedStats(rows)}))
  .filter(row=>row.measuredSessions>0)
  .sort((a,b)=>b.minutes-a.minutes||a.genre.localeCompare(b.genre));
}
