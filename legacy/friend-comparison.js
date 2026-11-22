/** Side-by-side, permission-scoped Insights for two readers.
 * Full-profile shares only: the caller must not expose detailed rows under
 * Summary-only. The Supabase RLS policy independently enforces this boundary.
 * Metrics reuse the same pure calculations as the owner's Insights screen.
 */
import {profileTrackingStart, sessionsInReportingPeriod, anchoredGoalHistory} from './tracking-start.js';
import {readingSpeedByMode, dailyReadingGoalStats, dailyGoalTimeSeries, bookActivitySummary} from './reading-metrics.js';
import {TIME_OF_DAY, WEEKDAYS, timeOfDayStats, dayOfWeekStats, weekdayTimeHeatmap, sessionLengthStats, activityDistribution, libraryStatistics, genreSpeedStats, completionEfficiency} from './reading-habits.js';
import {completedBooksInYear, rereadingStats, rereadComparisonStats} from './reading-history.js';

const numeric = value => { const n=Number(value); return Number.isFinite(n) ? n : 0; };
const validMinutes = row => {const n=Number(row?.duration_minutes);return Number.isFinite(n)&&n>0?n:0;};
const validPages = row => row?.pages_read!=null && Number.isFinite(Number(row.pages_read)) && Number(row.pages_read)>0 ? Number(row.pages_read) : 0;
const modeOf = s => ['audiobook','read_listen'].includes(s.activity_mode)?s.activity_mode:'reading';
export const comparableBookKey = b => {
  const normalize = v=>String(v||'').normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
  const title=normalize(b?.title),author=normalize(b?.author);
  return title&&author?title+'|'+author:null;
};
const avg = nums=>nums.length?nums.reduce((a,b)=>a+b,0)/nums.length:null;
const daysBetween=(date,days)=>new Date((Date.parse(date+'T00:00:00Z')/86400000+days)*86400000).toISOString().slice(0,10);
function daysOfPeriod(start,end,period){
 if(period==='year')return Array.from({length:12},(_,i)=>{const k=`${start.slice(0,4)}-${String(i+1).padStart(2,'0')}`;return {key:k,label:new Date(`${k}-01T00:00:00Z`).toLocaleDateString('en-US',{month:'short',timeZone:'UTC'}),month:true};});
 const list=[];for(let d=start;d<=end;d=daysBetween(d,1)) list.push({key:d,label:period==='week'?new Date(d+'T00:00:00Z').toLocaleDateString('en-US',{weekday:'short',timeZone:'UTC'}):d.slice(8),month:false});
 return list;
}
function dailyStreak(sessions,today,start){
 const dates=new Set(sessions.filter(s=>s.session_date<=today&&(!start||s.session_date>=start)&&validMinutes(s)>0).map(s=>s.session_date));
 let cursor=dates.has(today)?today:daysBetween(today,-1),current=0;
 while(dates.has(cursor)&&(!start||cursor>=start)){current++;cursor=daysBetween(cursor,-1);}
 let longest=0,run=0,previous=null;
 for(const date of [...dates].sort()){run=previous&&daysBetween(previous,1)===date?run+1:1;longest=Math.max(longest,run);previous=date;}
 return {current,longest};
}
function metricsForOwner(data,owner,period){
 const {books=[],sessions=[],profiles=[],goals=[],goalHistory=[]}=data;
 const profile=profiles.find(p=>p.id===owner)||{id:owner};
 const cutoff=profileTrackingStart(profile);
 const ownedBooks=books.filter(b=>b.user_id===owner);
 const ids=new Set(ownedBooks.map(b=>b.id));
 const allSessions=sessions.filter(s=>s.user_id===owner&&ids.has(s.user_book_id));
 const rows=sessionsInReportingPeriod(allSessions,{periodStart:period.start,periodEnd:period.end,today:period.today,trackingStart:cutoff});
 const bookIndex=new Map(ownedBooks.map(b=>[b.id,b]));
 const perBook=[...new Set(rows.map(s=>s.user_book_id))].map(id=>{
   const book=bookIndex.get(id),summary=bookActivitySummary(rows,{bookId:id});
   return book?{book, ...summary, speed:readingSpeedByMode(rows.filter(s=>s.user_book_id===id))}:null;
 }).filter(Boolean).sort((a,b)=>b.minutes-a.minutes||a.book.title.localeCompare(b.book.title));
 const minutes=rows.reduce((a,s)=>a+validMinutes(s),0),pages=rows.reduce((a,s)=>a+validPages(s),0);
 const physicalPages=rows.filter(s=>modeOf(s)!=='audiobook').reduce((a,s)=>a+validPages(s),0);
 const audiobookEquivalents=rows.filter(s=>modeOf(s)==='audiobook').reduce((a,s)=>a+validPages(s),0);
 const distinctDates=new Set(rows.filter(s=>validMinutes(s)>0).map(s=>s.session_date));
 const y=Number(period.year),completions=completedBooksInYear(ownedBooks,y).length;
 const annualGoal=goals.find(g=>g.user_id===owner&&Number(g.year)===y)?.books_target||12;
 const versions=anchoredGoalHistory(goalHistory.filter(g=>g.user_id===owner),cutoff,profile.tracking_start_goal_minutes);
 const fallback=Number(goals.filter(g=>g.user_id===owner&&Number(g.year)<=y).sort((a,b)=>b.year-a.year)[0]?.daily_minutes_target)||30;
 const goal=dailyReadingGoalStats(allSessions,{targetMinutes:fallback,goalHistory:versions,today:period.today,periodStart:period.start,periodEnd:period.end,activeFrom:cutoff});
 const goalSeries=dailyGoalTimeSeries(allSessions,{targetMinutes:fallback,goalHistory:versions,today:period.today,periodStart:period.start,periodEnd:period.end,groupBy:period.mode==='year'?'month':'day',activeFrom:cutoff});
 const periods=daysOfPeriod(period.start,period.end,period.mode).map(g=>{
   const sessionsFor=rows.filter(s=>g.month?s.session_date.startsWith(g.key):s.session_date===g.key);
   const byMode=readingSpeedByMode(sessionsFor);
   return {...g,modeSpeed:byMode,minutes:sessionsFor.reduce((a,s)=>a+validMinutes(s),0),pages:sessionsFor.reduce((a,s)=>a+validPages(s),0),sessions:sessionsFor.length,
     speed:byMode.overall.pagesPerHour};
 });
 const speed=readingSpeedByMode(rows),clock=timeOfDayStats(rows);
 const weekday=dayOfWeekStats(rows,{periodStart:period.start,periodEnd:period.end,today:period.today,activeFrom:cutoff});
 const sessionsByLength=sessionLengthStats(rows),activity=activityDistribution(rows),heatmap=weekdayTimeHeatmap(rows);
 const library=libraryStatistics(ownedBooks,{today:period.today}),genresSpeed=genreSpeedStats(ownedBooks,rows);
 const rereads=rereadingStats(ownedBooks,allSessions),rereadPairs=rereadComparisonStats(ownedBooks,allSessions,{today:period.today});
 const efficiency=completionEfficiency(ownedBooks,allSessions,{today:period.today});
 const statuses=Object.fromEntries(['tbr','reading','finished','dnf'].map(k=>[k,ownedBooks.filter(b=>b.status===k).length]));
 return {owner,profile,cutoff,books:ownedBooks,rows,allSessions,minutes,pages,physicalPages,audiobookEquivalents,
   distinctBooks:perBook.length,activeDays:distinctDates.size,sessionCount:rows.length,completions,annualGoal,goal,goalSeries,
   streak:dailyStreak(allSessions,period.today,cutoff),speed,clock,weekday,sessionsByLength,activity,heatmap,library,
   genresSpeed,rereads,rereadPairs,efficiency,perBook,periods,statuses,
   favorites:ownedBooks.filter(b=>b.favorite).length,
   rated:ownedBooks.filter(b=>b.rating!=null).length,
   libraryCount:ownedBooks.length
 };
}
function interests(a,b){
 const aIndex=new Map(a.books.map(x=>[comparableBookKey(x),x]).filter(([k])=>k));
 const bIndex=new Map(b.books.map(x=>[comparableBookKey(x),x]).filter(([k])=>k));
 const shared=[...aIndex.keys()].filter(k=>bIndex.has(k)).map(k=>({key:k,mine:aIndex.get(k),theirs:bIndex.get(k),
    ratingGap:aIndex.get(k).rating!=null&&bIndex.get(k).rating!=null?numeric(aIndex.get(k).rating)-numeric(bIndex.get(k).rating):null}));
 const mineOnly=[...aIndex.keys()].filter(k=>!bIndex.has(k)).map(k=>aIndex.get(k));
 const theirsOnly=[...bIndex.keys()].filter(k=>!aIndex.has(k)).map(k=>bIndex.get(k));
 const aGenres=new Set(a.books.flatMap(book=>Array.isArray(book.genres)?book.genres:[]).filter(Boolean));
 const bGenres=new Set(b.books.flatMap(book=>Array.isArray(book.genres)?book.genres:[]).filter(Boolean));
 return {shared, mineOnly, theirsOnly,
   sharedGenres:[...aGenres].filter(g=>bGenres.has(g)).sort(),
   mineGenres:[...aGenres].filter(g=>!bGenres.has(g)).sort(),
   theirsGenres:[...bGenres].filter(g=>!aGenres.has(g)).sort()};
}
/** Explicitly permission-check raw data at the aggregation boundary. */
export function buildFriendComparison({viewerId,friendId,shares=[],profiles=[],books=[],sessions=[],goals=[],goalHistory=[],summaries=[],period}={}){
 if(!viewerId||!friendId||viewerId===friendId)return {access:'none'};
 const share=shares.find(sh=>sh.owner_id===friendId&&sh.viewer_id===viewerId);
 if(!share || !['full','summary'].includes(share.access_level))return {access:'none'};
 const friend=profiles.find(p=>p.id===friendId)||{id:friendId,display_name:'Reader'};
 if(share.access_level==='summary'){
   const own=summaries.find(s=>s.owner_id===viewerId),other=summaries.find(s=>s.owner_id===friendId);
   // Nothing from books or sessions is even inspected in this branch.
   return {access:'summary',friend,own:own||null,other:other||null};
 }
 if(!period||!period.start||!period.end||!period.today)throw new Error('Comparison requires a calendar period');
 const dataset={books,sessions,profiles,goals,goalHistory};
 const mine=metricsForOwner(dataset,viewerId,period),theirs=metricsForOwner(dataset,friendId,period);
 return {access:'full',friend,mine,theirs,interests:interests(mine,theirs),period,
   bands:TIME_OF_DAY.map(x=>({id:x.id,label:x.label,hours:x.hours})),weekdays:WEEKDAYS};
}
