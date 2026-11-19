import { createRepo, localDate, offsetDate } from './db.js';
import { searchCatalog, getEditions, toLibraryBook, coverByISBN, enrichBookMetadata } from './catalog.js';
import { parseGoodreads, buildGoodreadsReadHistory, normTitle, sameBook, prepareGoodreadsImport } from './goodreads-import.js';
import { enrichAfterGoodreadsImport } from './import-enrichment.js';
import { filterLibraryBooks, availableGenres } from './library-view.js';
import { normalizeISBN, isValidISBN, normalizeASIN, isValidASIN, coverURL, manualGenres, STANDARD_GENRES, selectedGenres, addSelectedGenre, removeSelectedGenre, primarySelectedGenre, mergeReviewedMetadata, lookupBookOnRequest } from './book-detail-metadata.js';
import { bookReadingDays, readingSpeedStats, readingSpeedByMode, bookActivitySummary, dailyReadingGoalStats, dailyGoalTargetAt, dailyGoalTimeSeries } from './reading-metrics.js';
import { ReadingClock } from './session-clock.js';
import { sessionBookChoices, selectedSessionBookId } from './session-book-picker.js';
import { sessionPageStart, pagesFromEndingPage } from './session-page-progress.js';
import { weekStartSunday, weekEndSaturday } from './calendar-week.js';
import { isTrackingDate, profileTrackingStart, sessionsInReportingPeriod, anchoredGoalHistory } from './tracking-start.js';
import { friendActivityFeed } from './friend-feed.js';
import { buildFriendComparison } from './friend-comparison.js';
import { renderFriendComparisonBody } from './friend-comparison-view.js';
import { bookChartColors } from './book-chart-colors.js';
import { seriesMetadata, seriesStatistics } from './series-insights.js';
import { seriesKey, fetchSeriesLookup, isSeriesLookupConfigured, fillMissingSeriesFields, proposedSeriesFields, catalogSeriesMatch, isSeriesSourceURL } from './series-catalog.js';
import { tbrTransitions } from './tbr-transitions.js';
import { insightBooks } from './library-drilldown.js';
import { buildReadingReplay, replayPeriod, replayOffsetForEnd } from './reading-replay.js';
import { latestUnseenReplays, markReplaySeen } from './replay-ready.js';
import { suggestedLocalSessionTime } from './session-start-suggestion.js';
import { renderReadingReplayView, readingReplaySlideCount, readingReplayShareText } from './reading-replay-view.js';
import { isbn13ForEdition, lookupOpenLibraryChapters, draftFromContentsText, scanContentsPhotos, MAX_CONTENTS_PHOTOS, validateContentsPhotos, validateVerifiedChapterMap, reviewedSharedCandidate } from './chapter-sourcing.js';
import { TIME_OF_DAY, WEEKDAYS, timeOfDayStats, timeOfDaySpeedByMode, dayOfWeekStats, weekdayTimeHeatmap, sessionLengthStats, activityDistribution, completionEfficiency, libraryStatistics, genreSpeedStats } from './reading-habits.js';
import { readingPasses, beginReread, readNumberForDate, currentReadNumber, updateLatestPass, completedBooksInYear, rereadingStats, rereadComparisonStats, readingPassMetrics, passModeLabel, editReadingHistory, rereadSessionCorrections, sessionPassError } from './reading-history.js';

const app = document.querySelector('#app');
const repo = createRepo();
const state = {
  user:null,data:null,tab:'insights',activeId:null,filter:'all',libraryQuery:'',libraryGenre:'all',libraryView:'cards',librarySort:'shelf_order',librarySortDir:'asc',lastImportReport:'',
  period:'week',insightsView:'summary',metric:'minutes',insightBook:'all',insightYear:new Date().getFullYear(),feedLimit:30,feedType:'all',replayKind:'week',replayOffset:0,replaySlide:0,replayReady:[],friendsView:'activity',compareFriendId:'',comparePeriod:'week',compareYear:new Date().getFullYear(),
  seriesCatalog:{},seriesBookCatalog:{},seriesLoading:'',seriesOpen:'',seriesPendingApply:null,
  shelfFilter:'all',searchQuery:'',catalog:[],editions:[],selectedSearch:null,selectedEdition:null,
  searchBusy:false,searchError:'',modal:null,bookModalTab:'details',bookLookup:null,lookupBusy:false,
  logBookScope:'reading',logBookQuery:'',logMethod:'pages',logMode:'reading',logDate:localDate(),logDateTouched:false,logBook:'',logMinutes:'30',logEndingPage:'',logStartingPage:'',logStartOverrideOpen:false,
  logAudioStart:'0',logAudioEnd:'30',logStartLocalTime:'',logTimeManual:false,logPass:'auto',insightMode:'all',libraryMode:'all',shelfMode:'all',logViewMode:'all',latestShareInvite:'',
  chapterFrom:'',chapterTo:'',chapterDraftBookId:'',chapterDraft:null,chapterPhotos:[],chapterBusy:false,chapterMessage:'',sharedChapterOptions:[],formMessage:'',authMode:'signin',authMessage:'',
  busy:false,showAllBookDays:false,dragBook:null,shelfPage:0,
  importRows:[],importSessionsByTitle:{},importGenresByTitle:{},importSummary:'',importProgress:null,importAbortRequested:false,yearGoalDraft:null,dailyGoalDraft:null
};
const readingClock = new ReadingClock(globalThis.localStorage);
let clockTickHandle=null;let toastHandle=null;let foregroundRefresh=0;

const icons={
  insights:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 16V12m5 4V8m5 8v-5"/>',
  shelf:'<path d="M4 21V4m16 17V4M4 7h16M4 20h16"/><path d="M8 8v12m5-12v12m4-12v12"/>',
  library:'<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  log:'<path d="M12 2v20M2 12h20"/>',
  friends:'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  settings:'<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/><path d="M4.5 10 3 12l1.5 2 1 3 3 1 3.5 3 3.5-3 3-1 1-3 1.5-2-1.5-2-1-3-3-1L12 3 8.5 6l-3 1z"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 1 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  x:'<path d="M18 6 6 18M6 6l12 12"/>',
  down:'<path d="m6 9 6 6 6-6"/>',
  left:'<path d="m15 18-6-6 6-6"/>',
  right:'<path d="m9 18 6-6-6-6"/>',
  users:'<path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 20v-2a4 4 0 0 0-3-3.87M16 3.1a4 4 0 0 1 0 7.8"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  book:'<path d="M12 7a8 8 0 0 0-9-2v14a8 8 0 0 1 9 2 8 8 0 0 1 9-2V5a8 8 0 0 0-9 2zM12 7v14"/>',
  flame:'<path d="M12 22c4 0 7-3 7-7 0-3-2-6-4-8-.1 3-2 4-2 4-1-4-2-6-5-9 .6 4-1 5-2 8-2 5 0 12 6 12z"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check:'<path d="m4 12 5 5L20 6"/>',
  arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
  refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9A7 7 0 0 1 18 6l2 1M4 17l2 1a7 7 0 0 0 12.5-3"/>',
  upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 17v3h16v-3"/>',
  download:'<path d="M12 3v13m-5-5 5 5 5-5M4 17v3h16v-3"/>',
  trash:'<path d="M3 6h18M8 6V4h8v2m3 0-1 15H6L5 6M10 10v7M14 10v7"/>',
  eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  edit:'<path d="m4 20 5-1 11-11-4-4L5 15zM13 7l4 4"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  info:'<circle cx="12" cy="12" r="10"/><path d="M12 11v5M12 7h.01"/>',
  play:'<path d="m7 4 13 8-13 8z"/>',
  pause:'<path d="M7 5v14M17 5v14"/>',
  stop:'<rect x="5" y="5" width="14" height="14" rx="2"/>',
  camera:'<path d="M14 4H9l-2 3H3v13h18V7h-5z"/><circle cx="12" cy="13" r="4"/>',
  recaps:'<path d="M12 2.5 14.5 9l6.5 2.5-6.5 2.5L12 20.5 9.5 14 3 11.5 9.5 9z"/><path d="m19 18 1 1-1 1-1-1z"/>',
  star:'<path d="m12 2 3.2 6.6 7.3 1-5.3 5.2 1.3 7.2-6.5-3.4-6.5 3.4 1.3-7.2-5.3-5.2 7.3-1z"/>'
};
const ico=(name,size=18)=>`<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.book}</svg>`;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const fmtDate=d=>d?new Date(`${d}T12:00:00`).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):'Not set';
const localClockTime=(d=new Date())=>`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
const fmtTime=m=>`${Math.floor(num(m)/60)}h ${String(Math.round(num(m)%60)).padStart(2,'0')}m`;
const hashColor=str=>{let h=0;for(const c of String(str))h=(h*31+c.charCodeAt(0))|0;return `hsl(${Math.abs(h)%310+25} 28% 35%)`;};
const unique=(list,f)=>new Set(list.map(f)).size;
const sum=(list,field)=>list.reduce((a,x)=>a+num(x[field]),0);
const bookById=id=>state.data?.books.find(b=>b.id===id);
const own=()=>state.activeId===state.user?.id;
const viewBooks=()=>state.data?.books.filter(b=>b.user_id===state.activeId)||[];
const viewSessions=()=>state.data?.sessions.filter(s=>s.user_id===state.activeId)||[];
const viewChapters=()=>state.data?.chapters.filter(c=>c.user_id===state.activeId)||[];
const viewGoals=()=>state.data?.goals.filter(g=>g.user_id===state.activeId)||[];
const viewGoalHistory=()=>state.data?.goalHistory?.filter(g=>g.user_id===state.activeId)||[];
const effectiveGoalHistory=()=>anchoredGoalHistory(viewGoalHistory(),activeAccountStartDate(),profileById(state.activeId)?.tracking_start_goal_minutes);
// Keep a year-specific target when one was saved, carrying forward the most recent
// earlier goal as a default for a new year. The value does not depend on Insights filters.
const dailyGoalForYear=(year)=>{
  const goals=viewGoals().filter(g=>Number(g.year)<=year && Number.isInteger(Number(g.daily_minutes_target)) && Number(g.daily_minutes_target)>0);
  goals.sort((a,b)=>Number(b.year)-Number(a.year));
  return Number(goals[0]?.daily_minutes_target)||30;
};
// Goal versions are stored as dated facts. A change applies from its saved
// calendar date forward; historical markers and reference lines do not move.
const targetForDate=date=>dailyGoalTargetAt(effectiveGoalHistory(),date,dailyGoalForYear(Number(date.slice(0,4))));
// Each viewed reader has their own reporting boundary (including shared profiles).
const activeAccountStartDate=()=>profileTrackingStart(profileById(state.activeId));
const goalRecord=(year,fields={})=>{
  const existing=viewGoals().find(g=>Number(g.year)===year);
  return {user_id:state.user.id,year,books_target:existing?.books_target||12,
    daily_minutes_target:dailyGoalForYear(year),...fields};
};
const viewPrefs=()=>state.data?.shelves.find(x=>x.user_id===state.activeId)||{finish:'walnut',display_mode:'mix',decor:'cozy'};
const profileById=id=>state.data?.profiles.find(p=>p.id===id)||{id,display_name:'Reader'};
const initials=name=>String(name||'R').split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase();
const safeImage=url=>{try {const u=new URL(url);return u.protocol==='https:'?u.href:'';}catch{return ''}};
const ownBooks=()=>state.data?.books.filter(b=>b.user_id===state.user?.id)||[];
// Keep the selected title in the visible list, including when a reading shelf
// changes, a book is deleted, or a search narrows the alternate full-library list.
function reconcileLogBook(){
 const choices=sessionBookChoices(ownBooks(),state.logBookScope,state.logBookQuery);
 const next=selectedSessionBookId(choices,state.logBook);
 if(state.logBook!==next){state.logBook=next;state.logPass='auto';state.chapterFrom='';state.chapterTo='';resetLogPageDraft();}
 return choices;
}
function resetLogPageDraft(){
 state.logEndingPage='';state.logStartingPage='';state.logStartOverrideOpen=false;
}
function logPageContext(book,date){
 const pass=state.logPass==='auto'?readNumberForDate(book,date):Number(state.logPass);
 const context=sessionPageStart(book,viewSessions(),{date,readNumber:pass,currentPass:currentReadNumber(book)});
 const manual=state.logStartingPage!=='';
 const start=manual?Number(state.logStartingPage):context.startPage;
 return {...context,startPage:start,source:manual?'manual':context.source};
}
function pageStartSourceLabel(source){
 return source==='book'?'Book details · Current page':source==='previous-session'?'Previous logged ending page':source==='pass-start'?'Start of this reading pass':source==='manual'?'Manually corrected starting page':'Not known from older reading sessions';
}
function updateLogPagePreview(){
 if(state.tab!=='log'||state.logMethod!=='pages')return;
 const book=bookById(state.logBook),node=app.querySelector('#log-page-preview');
 if(!book||!node)return;
 const context=logPageContext(book,state.logDate||today());
 const startLabel=app.querySelector('#log-page-start-label');
 if(startLabel)startLabel.textContent=context.startPage==null?'unknown':'page '+context.startPage;
 const sourceLabel=app.querySelector('#log-page-source-label');
 if(sourceLabel)sourceLabel.textContent=pageStartSourceLabel(context.source);
 const result=pagesFromEndingPage(context.startPage,state.logEndingPage,book.page_count,context.nextStartPage);
 node.textContent=result.error ? result.error : `${result.pages} ${state.logMode==='audiobook'?'page-equivalents':'pages'} progressed (${context.startPage} → ${Number(state.logEndingPage)})`;
 node.classList.toggle('invalid',Boolean(result.error)&&state.logEndingPage!=='');
}
const today=()=>localDate();
const getYear=()=>new Date().getFullYear();
const statusText={tbr:'Want to read',reading:'Currently reading',finished:'Finished',dnf:'Did not finish'};
const activityModes={reading:'Reading only',audiobook:'Audiobook only',read_listen:'Read + Listen'};
const modeOf=s=>s.activity_mode||'reading'; // Legacy sessions are reading-only.
// Audiobook-only page logs represent equivalent progress through the selected print edition.
// They are not physical pages read. Read + Listen progress counts only once per session.
const pageTotals=list=>({
  physical:sum(list.filter(x=>modeOf(x)!=='audiobook'),'pages_read'),
  audioEquivalent:sum(list.filter(x=>modeOf(x)==='audiobook'),'pages_read')
});
const pageDetail=s=>s.pages_read==null
  ?(s.log_type==='audio_position'?`Audio position ${s.audio_start_minute}–${s.audio_end_minute} min`:'Pages not recorded')
  :`${s.pages_read} ${modeOf(s)==='audiobook'?'page-equivalents':'pages'}${s.log_type==='pages'&&s.end_page!=null?' · stopped on p. '+s.end_page:''}`;
const selectedMode=(s,filter)=>filter==='all'||modeOf(s)===filter;
const ownedModes=bookId=>[...new Set(viewSessions().filter(s=>s.user_book_id===bookId).map(modeOf))];
const modeBadge=mode=>`<span class="status-pill activity-${esc(mode)}">${esc(activityModes[mode]||activityModes.reading)}</span>`;
const modeOptions=(value,anyLabel='All reading modes')=>`<option value="all" ${value==='all'?'selected':''}>${anyLabel}</option>${Object.entries(activityModes).map(([id,label])=>`<option value="${id}" ${value===id?'selected':''}>${esc(label)}</option>`).join('')}`;
const shareLevelFor=id=>state.data?.shares?.find(sh=>sh.owner_id===id&&sh.viewer_id===state.user?.id)?.access_level||null;
const summaryOnly=()=>!own()&&shareLevelFor(state.activeId)==='summary';
const filteredSessions=()=>viewSessions().filter(s=>selectedMode(s,state.insightMode)&&(state.insightBook==='all'||s.user_book_id===state.insightBook));

const replayKindNames={week:'Weekly',month:'Monthly',year:'Annual'};
function replayModelFor(kind='week',offset=0,readerId=state.activeId){
 const profile=profileById(readerId),period=replayPeriod(kind,today(),offset);
 const books=state.data?.books.filter(b=>b.user_id===readerId)||[];
 const sessions=state.data?.sessions.filter(s=>s.user_id===readerId)||[];
 const goals=state.data?.goals.filter(g=>g.user_id===readerId)||[];
 const versions=state.data?.goalHistory?.filter(g=>g.user_id===readerId)||[];
 const goal=goals.find(g=>Number(g.year)===period.year);
 const history=goals.filter(g=>Number(g.year)<=period.year && Number(g.daily_minutes_target)>0)
  .sort((a,b)=>Number(b.year)-Number(a.year));
 const startingGoal=Number(profile.tracking_start_goal_minutes)||Number(history[0]?.daily_minutes_target)||30;
 return buildReadingReplay({books,sessions,goalHistory:versions,today:today(),
  trackingStart:profileTrackingStart(profile),startingGoal,yearGoal:goal?.books_target,kind,offset});
}
function refreshReplayReady(){
 if(!state.user||!state.data){state.replayReady=[];return;}
 state.replayReady=latestUnseenReplays({ownerId:state.user.id,today:today(),storage:globalThis.localStorage,
  hasData:kind=>replayModelFor(kind,0,state.user.id).hasAnyData});
}
function dismissReplayReady(){
 for(const item of state.replayReady)markReplaySeen({ownerId:state.user.id,kind:item.kind,end:item.period.end,storage:globalThis.localStorage});
 state.replayReady=[];
}
function renderReplayReadyBanner(){
 if(!own()||!state.replayReady.length||state.tab==='recaps'||state.modal)return '';
 return `<aside class="replay-ready-banner" aria-label="New completed reading recaps" role="status">
  <div class="replay-ready-stars" aria-hidden="true">✦ ✨ ✦</div>
  <div class="replay-ready-content"><div class="eyebrow">YOUR READING REPLAY IS READY</div><h2>${state.replayReady.length===1?'A new recap is ready!':'Your new recaps are ready!'}</h2>
  <p>Celebrate the chapters you completed. These are finished periods — live progress stays in Insights.</p>
  <div class="replay-ready-actions">${state.replayReady.map(item=>`<button class="btn primary" type="button" data-action="replay-ready-open" data-replay-kind="${item.kind}" data-replay-end="${item.period.end}">${esc(replayKindNames[item.kind])}: ${esc(item.period.label)} →</button>`).join('')}
   <button class="btn" type="button" data-action="replay-ready-dismiss">Not now</button></div></div></aside>`;
}
function suggestNewLogTime(){
 if(!state.logDateTouched)state.logDate=today();
 state.logStartLocalTime=suggestedLocalSessionTime({date:state.logDate||today(),now:new Date(),clockStartedAtMs:readingClock.firstStartedAtMs});
 state.logTimeManual=false;
}
function clearChapterPhotos(){
 for(const {preview} of state.chapterPhotos){if(preview&&typeof URL!=='undefined')URL.revokeObjectURL?.(preview);}
 state.chapterPhotos=[];
}
function invalidateScannedDraft(){
 if(state.chapterDraft?.source?.startsWith('Scanned')){state.chapterDraft=null;state.chapterMessage='Photo selection changed. Scan the ordered pages again to update the draft.';}
}
function queueContentsPhotos(files){
 const newOnes=Array.from(files||[]).filter(file=>!state.chapterPhotos.some(x=>x.file.name===file.name&&x.file.size===file.size&&x.file.lastModified===file.lastModified));
 if(!newOnes.length)return 0;
 const combined=[...state.chapterPhotos.map(x=>x.file),...newOnes];
 validateContentsPhotos(combined);
 for(const file of newOnes){state.chapterPhotos.push({file,preview:typeof URL!=='undefined'&&URL.createObjectURL?URL.createObjectURL(file):''});}
 invalidateScannedDraft();return newOnes.length;
}

function toast(msg,error=false){
  const div=document.querySelector('#toast-root');div.innerHTML=`<div class="toast ${error?'error':''}">${esc(msg)}</div>`;
  clearTimeout(toastHandle);toastHandle=setTimeout(()=>{div.innerHTML='';},4700);
}
async function sync(quiet=false){
  try{state.data=await repo.load();if(!state.activeId||!state.data.profiles.some(p=>p.id===state.activeId))state.activeId=state.user?.id;
    reconcileLogBook();
    readingClock.setOwner(state.user?.id);refreshReplayReady();render();startClockTicker();if(!quiet)toast('Your reading room is up to date.');}
  catch(err){toast(err.message||'Unable to load data',true);}
}
async function run(task,success='Saved'){
  if(state.busy)return;state.busy=true;
  try{await task();await sync(true);if(success)toast(success);}
  catch(err){toast(err.message||'Something went wrong.',true);}
  finally{state.busy=false;}
}
function checkCoverLoads(url){
 const safe=safeImage(url);
 if(!safe)return Promise.resolve(false);
 if(typeof Image==='undefined')return Promise.resolve(true);
 return new Promise(resolve=>{
  const img=new Image();
  const timer=setTimeout(()=>{img.src='';resolve(false);},5000);
  img.onload=()=>{clearTimeout(timer);resolve(img.naturalWidth>1&&img.naturalHeight>1);};
  img.onerror=()=>{clearTimeout(timer);resolve(false);};
  img.src=safe;
 });
}
function cover(book,size=''){
  if(!book)return '';
  const color=book.demo_color||hashColor(book.title);
  const url=safeImage(book.cover_url);
  return `<div class="cover ${size}" style="--cover:${color};--cover-ink:#f6eacd" aria-label="Cover for ${esc(book.title)}">
    <span class="cover-title">${esc(book.title)}</span><span class="cover-mark">✦</span><span class="cover-author">${esc(book.author)}</span>
    ${url?`<img src="${esc(url)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"/>`:''}
  </div>`;
}
function navigation(){
 const tabs=[['insights','Insights'],['recaps','Recaps'],['friends','Friends'],['library','My Library'],['log','Log Reading'],['shelf','Bookshelf'],['settings','Settings']];
 return tabs.map(([id,label])=>`<button class="nav-btn ${state.tab===id?'active':''}" data-tab="${id}">${ico(id)} ${label}</button>`).join('');
}
function renderShell(){
  const users=(state.data?.profiles||[]).filter(p=>p.id===state.user.id||(state.data.shares||[]).some(sh=>sh.viewer_id===state.user.id&&sh.owner_id===p.id));const name=profileById(state.activeId).display_name;
 const profileOptions=users.map(p=>`<option value="${esc(p.id)}" ${state.activeId===p.id?'selected':''}>${p.id===state.user.id?'My profile':p.display_name+' · '+(shareLevelFor(p.id)==='summary'?'Summary':'Full')}</option>`).join('');
 const navs=[['library','Library'],['shelf','Shelf'],['log','Log'],['insights','Insights'],['recaps','Recaps'],['friends','Friends'],['settings','Settings']];
 return `<div class="shell"><aside class="sidebar">
   <a class="brand" href="/" data-tab="insights"><img src="/assets/icon.svg" alt=""/><strong>reading <em>room.</em></strong></a>
   <nav class="nav">${navigation()}</nav>
   <div class="side-bottom"><strong>${repo.mode==='demo'?'Interactive demo':'Private, per-person sharing'}</strong><br/>Books, sessions and shelves live together. ${repo.mode==='demo'?'Connect Supabase to sync phones.':'Sharing levels are set by each profile owner.'}</div>
  </aside><div class="workarea">
   <header class="topbar"><div class="top-left"><div class="top-title">${ico('book',16)} <span>${esc(name)}'s reading room</span></div></div>
   <div class="top-actions">${repo.mode==='demo'?'<span class="status-pill tbr" style="white-space:nowrap">DEMO</span>':''}
    <select class="profile-select" id="profile-picker" aria-label="Choose whose profile to view">${profileOptions}</select>
    <span class="avatar" aria-hidden="true">${esc(initials(name))}</span>
   </div></header>
   <main class="page">${renderReplayReadyBanner()}${renderPage()}</main>
  </div></div><nav class="bottom-nav">${navs.map(([id,label])=>`<button data-tab="${id}" class="${state.tab===id?'active':''}" ${id===state.tab?'aria-current="page"':''}>${id==='log'?`<span class="add-icon">${ico('plus',20)}</span>`:ico(id,20)}<span class="${id==='log'?'add-label':''}">${label}</span></button>`).join('')}</nav>
  ${renderModal()}`;
}
function renderPage(){
 if(!state.data)return '<div class="startup">Loading…</div>';
 if(summaryOnly() && !['settings','friends'].includes(state.tab))return renderProfileSummary();
 switch(state.tab){case 'library':return renderLibrary();case 'log':return renderLog();case 'friends':return renderFriends();case 'recaps':return renderRecaps();case 'shelf':return renderShelf();case 'settings':return renderSettings();default:return renderInsights();}
}

function getReplayModel(){return replayModelFor(state.replayKind,state.replayOffset,state.activeId);}
function renderRecaps(){
 if(summaryOnly())return renderProfileSummary(); // no book- or session-level data for summary sharing
 return renderReadingReplayView(getReplayModel(),{slide:state.replaySlide,owner:own(),readerName:profileById(state.activeId).display_name});
}

function renderFriends(){
 const nav=`<div class="segmented friends-view-toggle" role="group" aria-label="Friends sections">
   <button type="button" class="seg-btn ${state.friendsView==='activity'?'active':''}" data-friends-view="activity">Activity feed</button>
   <button type="button" class="seg-btn ${state.friendsView==='compare'?'active':''}" data-friends-view="compare">Compare friends</button></div>`;
 return `${nav}${state.friendsView==='compare'?renderFriendComparison():renderFriendsFeed()}`;
}
function comparisonPeriod(){
 const date=today(),year=state.compareYear;
 if(state.comparePeriod==='week'){
  const start=weekStartSunday(date),end=weekEndSaturday(date);
  return {mode:'week',start,end,today:date,year:getYear(),label:`${fmtDate(start)} – ${fmtDate(end)}`};
 }
 if(state.comparePeriod==='month'){
  const end=localDate(new Date(Number(date.slice(0,4)),Number(date.slice(5,7)),0,12));
  return {mode:'month',start:date.slice(0,7)+'-01',end,today:date,year:getYear(),label:new Date(date.slice(0,7)+'-01T12:00:00').toLocaleDateString(undefined,{month:'long',year:'numeric'})};
 }
 return {mode:'year',start:`${year}-01-01`,end:`${year}-12-31`,today:date,year,label:`January – December ${year}`};
}
function renderFriendComparison(){
 const viewers=(state.data?.shares||[]).filter(sh=>sh.viewer_id===state.user?.id&&sh.owner_id!==state.user?.id&&['full','summary'].includes(sh.access_level));
 const options=[...new Map(viewers.map(sh=>[sh.owner_id,sh])).values()];
 if(!options.length)return `<div class="eyebrow">READING TOGETHER</div><h1 class="heading">Compare friends</h1><p class="subtitle">Compare what you read, how you read, and your reading habits.</p><div class="card feed-empty">${ico('users',30)}<strong>No shared profiles yet</strong><p>Ask a friend to share their profile with you in Settings, then compare your reading interests here.</p></div>`;
 const friendId=options.some(sh=>sh.owner_id===state.compareFriendId)?state.compareFriendId:options[0].owner_id;
 const access=options.find(sh=>sh.owner_id===friendId)?.access_level;
 const period=comparisonPeriod();
 const comparison=buildFriendComparison({viewerId:state.user.id,friendId,shares:state.data.shares,
  profiles:state.data.profiles,books:state.data.books,sessions:state.data.sessions,
  goals:state.data.goals,goalHistory:state.data.goalHistory,summaries:state.data.summaries,period});
 return `<div class="eyebrow">READING TOGETHER</div><h1 class="heading">Friend Comparison</h1>
 <p class="subtitle">Your library, reading speed, daily routines, ratings and book interests — compared side by side.</p>
 <div class="card compare-filters"><div class="formfield"><label for="compare-friend">Compare yourself with</label>
   <select id="compare-friend" class="select">${options.map(sh=>{const name=profileById(sh.owner_id).display_name;return `<option value="${esc(sh.owner_id)}" ${sh.owner_id===friendId?'selected':''}>${esc(name)} · ${sh.access_level==='full'?'Full access':'Summary only'}</option>`;}).join('')}</select></div>
  <div class="formfield"><label>Time period</label>${access==='summary'?'<p class="tiny">Current-year summary only (no dated activity is shared).</p>':`<div class="segmented compare-period-toggle">${[['week','This week'],['month','This month'],['year','This year']].map(([id,label])=>`<button type="button" class="seg-btn ${state.comparePeriod===id?'active':''}" data-compare-period="${id}">${label}</button>`).join('')}</div>`}</div>
  ${access==='full'&&state.comparePeriod==='year'?`<div class="formfield"><label for="compare-year">Year</label><select id="compare-year" class="select">${Array.from({length:7},(_,i)=>getYear()-i).map(y=>`<option ${y===state.compareYear?'selected':''}>${y}</option>`).join('')}</select></div>`:''}</div>
 <div class="compare-names"><span><i class="compare-person you"></i>You</span><span><i class="compare-person friend"></i>${esc(comparison.friend?.display_name||'Friend')}</span><span class="compare-access">${access==='full'?'Full comparison':'Summary-only access'}</span></div>
 ${renderFriendComparisonBody(comparison)}`;
}

function renderFriendsFeed(){
 const feed=friendActivityFeed({viewerId:state.user?.id,shares:state.data?.shares,profiles:state.data?.profiles,
   books:state.data?.books,sessions:state.data?.sessions,today:today(),limit:state.feedLimit,type:state.feedType});
 const filterOptions=[['all','All activity'],['started','Started'],['session','Sessions'],['finished','Finished']];
 let lastDay='';
 const items=feed.events.map(e=>{
   const b=bookById(e.bookId);
   const iconName=e.kind==='started'?'book':e.kind==='finished'?'check':'clock';
   const kindName=e.kind==='started'?'Started a book':e.kind==='finished'?'Finished a book':'Reading session';
   const iconWord=e.kind==='started'?'started':e.kind==='finished'?'finished':'session';
   const isReread=e.readNumber>1;
   const detail=e.kind==='started'?(isReread?'started rereading':'started reading'):
      e.kind==='finished'?(isReread?'finished a reread of':'finished reading'):
      e.mode==='audiobook'?`listened for <strong>${Math.round(e.minutes)} minutes</strong>`:
      e.mode==='read_listen'?`read &amp; listened for <strong>${Math.round(e.minutes)} minutes</strong>`:
      `read for <strong>${Math.round(e.minutes)} minutes</strong>`;
   const rating=e.kind==='finished'&&Number.isFinite(e.rating)?`<span class="feed-post-rating">Current rating: <strong>${e.rating.toFixed(2)} ★</strong></span>`:'';
   const dayBreak=e.date!==lastDay?`<h3 class="feed-day-heading"><span>${esc(fmtDate(e.date))}</span></h3>`:'';
   lastDay=e.date;
   // Time is available only for sessions with an actual recorded local start.
   const clock=e.localTime?new Date(`2000-01-01T${e.localTime}:00`).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}):null;
   return `${dayBreak}<article class="feed-event feed-post kind-${iconWord} ${e.isOwn?'feed-self':''}">
     <header class="feed-post-header"><span class="feed-avatar" aria-hidden="true">${esc(initials(e.readerName))}</span>
      <div class="feed-post-byline"><strong>${esc(e.readerName)}${e.isOwn?' <span class="feed-you-tag">You</span>':''}</strong><span>${detail}</span></div>
      <time datetime="${esc(e.date+(e.localTime?'T'+e.localTime:''))}">${esc(fmtDate(e.date))}${clock?`<span class="feed-clock">${esc(clock)}</span>`:''}</time></header>
     <button type="button" class="feed-book" data-action="view-friend-book" data-owner="${esc(e.ownerId)}" data-id="${esc(e.bookId)}" aria-label="View ${esc(e.title)} in ${esc(e.readerName)}'s library">
      ${b?cover(b,'small'):''}<span class="feed-book-info"><small class="feed-book-eyebrow">${esc(kindName)}</small><strong>${esc(e.title)}</strong><small>${esc(e.author||'Author not recorded')}</small></span><span class="feed-open" aria-hidden="true">${ico('right',16)}</span></button>
     <footer class="feed-post-footer"><span class="feed-kind-pill ${iconWord}">${ico(iconName,13)} ${esc(kindName)}</span>${isReread?`<span class="feed-pass">Reread #${e.readNumber-1}</span>`:''}${rating}</footer>
     </article>`;
 }).join('');
 return `<div class="eyebrow">YOUR READING COMMUNITY</div><h1 class="heading">Reading Activity</h1>
   <p class="subtitle">Your reading updates and those of friends sharing Full profiles, together in one feed.</p>
   <div class="friends-feed-wrap"><div class="feed-intro"><div><h2 class="section-title">You &amp; your friends</h2><p class="section-sub">Newest activity first · Includes your own books and Full-shared friends</p></div><div class="feed-counts"><span><strong>${feed.fullShareCount}</strong> Friends</span><span><strong>${feed.total}</strong> ${state.feedType==='all'?'Activities':'Matches'}</span></div></div>
   <div class="feed-filter-tabs" role="group" aria-label="Filter friend activity">
    ${filterOptions.map(([value,label])=>`<button type="button" class="feed-filter ${state.feedType===value?'active':''}" data-feed-type="${value}" aria-pressed="${state.feedType===value}">${label}</button>`).join('')}</div>
   ${feed.total?`<div class="feed-events">${items}</div>${feed.hasMore?`<button class="btn block feed-more" data-action="feed-more">Show older activity (${feed.total-feed.events.length} more)</button>`:''}`:
   `<div class="feed-empty">${ico('users',30)}<strong>${state.feedType==='all'?'No shared reading activity yet':'No events match this filter'}</strong><p>${feed.fullShareCount?'Try a different filter, or log a new reading session.':'Log a reading session or invite a friend to share a Full profile in Settings.'}</p></div>`}
   <p class="feed-privacy">Friends' notes and private logs are never shown. Ratings next to finished books are the current rating, not necessarily the rating when the book was finished.</p></div>`;
}

function renderProfileSummary(){
 const p=profileById(state.activeId),r=(state.data?.summaries||[]).find(v=>v.owner_id===p.id);
 if(!r)return `<div class="card"><h1 class="heading">${esc(p.display_name)}'s profile</h1><p class="notice warn">Summary-only access is enabled, but the summary is not available. Check your connection or database migration.</p></div>`;
 const y=r.year||getYear(),goal=Number(r.annual_goal||12),done=Number(r.books_finished||0);
 const totalM=Number(r.total_minutes||0);
 return `<div class="eyebrow">SHARED PROFILE · SUMMARY ONLY</div><h1 class="heading">${esc(p.display_name)}'s reading year</h1><p class="subtitle">${y} highlights. ${esc(p.display_name)} shares only high-level statistics with you.</p>
 <div class="kpis">${metricCard(done,'Books completed')}${metricCard(goal,'Annual books goal')}${metricCard(fmtTime(totalM),'Total activity')}${metricCard(Number(r.favorites_count||0),'Favorites count')}${metricCard(r.average_rating==null?'—':Number(r.average_rating).toFixed(2)+' ★','Average rating')}${metricCard(Number(r.sessions_count||0),'Sessions')}</div>
 <div class="card goal"><h2 class="section-title">Annual progress</h2><div class="goal-number">${done}<span> of ${goal} finished</span></div><div class="progress"><div style="width:${Math.min(100,done/Math.max(1,goal)*100)}%"></div></div></div>
 <div class="card"><h2 class="section-title">Reading modes · ${y}</h2><p class="section-sub">High-level time totals only</p>
 ${Object.entries({reading:r.reading_minutes,audiobook:r.audiobook_minutes,read_listen:r.combined_minutes}).map(([k,v])=>`<div class="rank-row"><div class="rank-top"><strong>${activityModes[k]}</strong><span>${fmtTime(v||0)}</span></div></div>`).join('')}
 <div class="notice">The owner has not shared book titles, individual ratings, reading sessions, chapter maps, Favorites titles, notes, or their bookshelf. To see those, they must grant Full access.</div></div>`;
}
function render(){
 if(!state.user && repo.mode==='cloud'){app.innerHTML=renderAuth();return;}
 if(!state.data){app.innerHTML='<div class="startup">Loading library…</div>';return;}
 app.innerHTML=renderShell();
 // Align the historical goal marker to the true first visible date and actual bars.
 globalThis.requestAnimationFrame?.(()=>alignQuickSummaryGoal());
}
function alignQuickSummaryGoal(){
 const svg=app.querySelector('.activity-goal-overlay');if(!svg)return;
 const columns=[...svg.parentElement.querySelectorAll('.chart-column')];
 const area=svg.getBoundingClientRect(),max=Number(svg.dataset.goalMax);
 if(!area.width||!max)return;
 let path='',was=false;
 for(const column of columns){
  const target=column.dataset.goalTarget===''?null:Number(column.dataset.goalTarget);
  if(target===null||!Number.isFinite(target)){was=false;continue;}
  const rect=column.getBoundingClientRect();
  const x=((rect.left+rect.width/2-area.left)/area.width*1000).toFixed(2);
  const y=(164-Math.min(164,target/max*164)).toFixed(2);
  path+=(was?' L':' M')+x+' '+y;was=true;
 }
 if(path)svg.querySelector('path')?.setAttribute('d',path);
}
window.addEventListener('resize',()=>globalThis.requestAnimationFrame?.(()=>alignQuickSummaryGoal()));

function emptyText(title,text){return `<div class="card" style="text-align:center;padding:35px 15px"><div style="font-size:26px">📚</div><h3>${esc(title)}</h3><p class="section-sub">${esc(text)}</p></div>`;}
function readable(b){return `${esc(b.title)} · ${esc(b.author)}`;}
function bookCard(b){
 const progress=b.page_count?Math.min(100,Math.round((b.current_page||0)/b.page_count*100)):null;
 return `<button class="book-card" data-action="open-book" data-id="${esc(b.id)}">${cover(b)}
 <div style="min-width:0;flex:1"><div class="book-card-title">${esc(b.title)} ${b.favorite?'<span class="heart">♥</span>':''}</div>
 <div class="book-card-author">${esc(b.author)}</div>
 <div class="book-meta"><span class="status-pill ${esc(b.status)}">${statusText[b.status]||'TBR'}</span><br/>${b.rating?`${Number(b.rating).toFixed(2)} ★`:'Unrated'} ${b.page_count?' · '+b.page_count+' pages':''}</div>
 ${ownedModes(b.id).length?`<div style="margin:6px 0">${ownedModes(b.id).map(modeBadge).join(' ')}</div>`:''}
 ${b.status==='reading'&&progress!==null?`<div class="progress"><div style="width:${progress}%"></div></div><span class="tiny">${progress}% complete</span>`:''}</div></button>`;
}
function renderLibraryTable(books){
 const cols=[
  ['title','Title'],['author','Author'],['genre','Assigned genres'],['status','Shelf'],
  ['rating','Rating'],['page_count','Pages'],['isbn','ISBN'],['asin','ASIN'],['publisher','Publisher'],
  ['binding','Binding'],['edition_year','Edition year'],['original_published_year','Original year'],
  ['goodreads_added_on','Goodreads added'],['tbr_added_on','TBR added'],['started_on','Started'],['finished_on','Finished']
 ];
 const header=(key,label)=>`<th scope="col"><button type="button" data-library-sort="${key}" aria-label="Sort by ${label}">${label}${state.librarySort===key?(state.librarySortDir==='asc'?' ↑':' ↓'):''}</button></th>`;
 const cells=b=>[
  `<strong>${esc(b.title)}</strong>${b.favorite?' <span class="heart">♥</span>':''}`,
  esc(b.author||'—'),esc((b.genres||[]).join(', ')||'Uncategorized'),esc(statusText[b.status]||b.status),
  b.rating==null?'—':Number(b.rating).toFixed(2)+' ★',b.page_count||'—',esc(b.isbn||'—'),esc(b.asin||'—'),
  esc(b.publisher||'—'),esc(b.binding||'—'),b.edition_year||'—',b.original_published_year||'—',
  b.goodreads_added_on?fmtDate(b.goodreads_added_on):'—',b.tbr_added_on?fmtDate(b.tbr_added_on):'—',b.started_on?fmtDate(b.started_on):'—',b.finished_on?fmtDate(b.finished_on):'—'
 ];
 return `<div class="library-table-wrap" role="region" aria-label="Full library table. Scroll horizontally for all columns." tabindex="0">
  <table class="library-table"><thead><tr>${cols.map(([key,label])=>header(key,label)).join('')}</tr></thead>
  <tbody>${books.map(b=>`<tr data-action="open-book" data-id="${esc(b.id)}" tabindex="0" role="button" aria-label="Open details for ${esc(b.title)}">${cells(b).map((c,i)=>`<td${i===0?' class="title-cell"':''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
  <p class="tiny" style="margin-top:8px">Select a row to view or edit details. Click a column heading to sort. Swipe sideways on a phone to see every field.</p>`;
}
function renderLibrary(){
 const filters=[['all','All Books'],['tbr','TBR'],['reading','Reading'],['finished','Finished'],['dnf','DNF'],['favorites','♥ Favorites']];
 const all=viewBooks();
 const genres=availableGenres(all);
 if(!['all','__uncategorized__',...genres].includes(state.libraryGenre))state.libraryGenre='all';
 const list=filterLibraryBooks(all,{shelf:state.filter,mode:state.libraryMode,genre:state.libraryGenre,
   query:state.libraryQuery,modeForBook:b=>ownedModes(b.id),sort:state.librarySort,sortDirection:state.librarySortDir});
 const selectedGenre=state.libraryGenre;
 return `<div class="eyebrow">YOUR COLLECTION</div><div class="toolbar space"><div><h1 class="heading">My Library</h1><p class="subtitle">${all.length} books · ${all.filter(b=>b.favorite).length} favorites · ${own()?'Your personal catalog':'Viewing your reading partner'}</p></div>
 ${own()?`<button class="btn primary" data-action="search-modal">${ico('plus',16)} Add books</button>`:''}</div>
 <div class="toolbar library-filter-toolbar"><input class="input" style="max-width:320px;flex:1" id="library-search" value="${esc(state.libraryQuery)}" placeholder="Search your library..." aria-label="Search your library"/>
 ${filters.map(([id,label])=>`<button class="btn sm ${state.filter===id?'selected':''}" data-filter="${id}">${label}</button>`).join('')}
 <select class="select" id="library-mode" aria-label="Filter library by reading mode" style="max-width:190px">${modeOptions(state.libraryMode)}</select>
 <select class="select" id="library-genre" aria-label="Filter library by genre" style="max-width:200px"><option value="all">All genres</option><option value="__uncategorized__" ${selectedGenre==='__uncategorized__'?'selected':''}>Uncategorized</option>${genres.map(g=>`<option value="${esc(g)}" ${selectedGenre===g?'selected':''}>${esc(g)}</option>`).join('')}</select></div>
 <div class="library-view-row"><span class="text-sm muted">Showing <strong>${list.length}</strong> of ${all.length} books${selectedGenre!=='all'?' · '+esc(selectedGenre==='__uncategorized__'?'Uncategorized':selectedGenre):''}</span>
 <div class="library-view-toggle" role="group" aria-label="Library display mode"><button type="button" class="btn sm ${state.libraryView==='cards'?'selected':''}" data-library-view="cards" aria-pressed="${state.libraryView==='cards'}">${ico('library',14)} Covers</button><button type="button" class="btn sm ${state.libraryView==='table'?'selected':''}" data-library-view="table" aria-pressed="${state.libraryView==='table'}">${ico('menu',14)} Table</button></div></div>
 ${list.length?(state.libraryView==='table'?renderLibraryTable(list):`<div class="book-grid">${list.map(bookCard).join('')}</div>`):emptyText('No books here','Try a different genre, shelf, mode, or search term.')}
 ${state.lastImportReport?`<div class="notice" role="status">${esc(state.lastImportReport)}</div>`:''}
 ${own()?`<div class="toolbar" style="margin-top:21px"><button class="btn" data-action="import-modal">${ico('upload',15)} Import Goodreads CSV / JSON</button><button class="btn" data-action="enrich-books">${ico('refresh',15)} Fill missing metadata</button><button class="btn" data-action="match-editions">${ico('search',15)} Match editions</button><button class="btn" data-action="refresh-genres">${ico('star',15)} Refresh genres</button><button class="btn" data-action="manual-modal">${ico('edit',15)} Add manually</button></div>`:''}`;
}
function chapterMap(bookId){return viewChapters().filter(c=>c.user_book_id===bookId).sort((a,b)=>a.chapter_number-b.chapter_number);}
function chapterPages(bookId,from,to){
 const start=Number(from),end=Number(to);
 if(!Number.isInteger(start)||!Number.isInteger(end)||start<1||end<start)return null;
 const map=new Map(chapterMap(bookId).map(c=>[c.chapter_number,c]));
 let pages=0;
 for(let i=start;i<=end;i++){const c=map.get(i);if(!c)return null;pages+=c.end_page-c.start_page+1;}
 return pages;
}
function renderLog(){
 const date=state.logDate||today();
 const data=viewSessions().filter(s=>s.session_date===date && selectedMode(s,state.logViewMode));
 const bookIds=[...new Set(data.map(s=>s.user_book_id))];
 const totalPages=sum(data,'pages_read'),minutes=sum(data,'duration_minutes'),dailyPageTotals=pageTotals(data);
 const allBooks=ownBooks();
 const books=reconcileLogBook();
 const selectedBook=books.find(b=>b.id===state.logBook);
 const mapped=state.logBook?chapterMap(state.logBook):[];
 const from=state.chapterFrom||String(mapped[0]?.chapter_number||'');
 const to=state.chapterTo||String(mapped[0]?.chapter_number||'');
 const mappedPages=chapterPages(state.logBook,from,to);
 const pageContext=selectedBook?logPageContext(selectedBook,date):null;
 const startingPage=pageContext?.startPage;
 const pagePreview=selectedBook?pagesFromEndingPage(startingPage,state.logEndingPage,selectedBook.page_count,pageContext.nextStartPage):null;
 const startSource=pageStartSourceLabel(pageContext?.source);
 const onlyOwn=own();
 return `<div class="eyebrow">READING JOURNAL</div><h1 class="heading">Log Reading</h1><p class="subtitle">Label each session as Reading Only, Audiobook Only, or Read + Listen. Enter the page you stopped on to calculate pages progressed, or use exact mapped chapters and audiobook positions. No guessed pages from time or average chapter lengths.</p>
 ${onlyOwn?`<div class="grid2"><div class="card"><h2 class="section-title">New reading session</h2>
  ${!allBooks.length?'<div class="notice warn">Add a book to your library before logging reading.</div>':!books.length&&state.logBookScope==='reading'?'<div class="notice">No books are currently on your Reading shelf. Choose another book or add a new book to log a session.</div>':''}
  <div class="formgrid"><div class="formfield"><label for="log-book">Book</label>
  ${state.logBookScope==='all'?`<input class="input log-book-search" id="log-book-search" type="search" value="${esc(state.logBookQuery)}" placeholder="Search all books by title or author…" aria-label="Search books to log"/>`:''}
  <select class="select" id="log-book" ${books.length?'':'disabled'}>${books.length?books.map(b=>`<option value="${esc(b.id)}" ${state.logBook===b.id?'selected':''}>${esc(b.title)}${state.logBookScope==='all'?' · '+esc(statusText[b.status]||b.status):''}</option>`).join(''):`<option value="">${state.logBookScope==='all'?'No matching books':'No books currently reading'}</option>`}</select>
  <div class="log-book-tools"><button type="button" class="btn sm" data-action="toggle-log-book-scope" aria-pressed="${state.logBookScope==='all'}">${ico(state.logBookScope==='all'?'left':'search',14)} ${state.logBookScope==='all'?'Back to currently reading':'Choose another book'}</button><button type="button" class="btn sm" data-action="search-modal">${ico('plus',14)} Add new book</button></div>
  <p class="tiny">${state.logBookScope==='all'?'Searching your full library. Select a past book to backdate a session or use Read history for a reread. Logging a TBR book moves it to Currently Reading.':`Showing ${books.length} currently reading book${books.length===1?'':'s'}. Other books are still available using Choose another book.`}</p>
  </div>
  <div class="formfield"><label for="log-date">Date</label><input type="date" class="input" id="log-date" value="${esc(date)}" max="${today()}"/></div></div>
  ${selectedBook?`<div class="formfield" style="margin-top:12px"><label for="log-pass">Reading pass</label><select class="select" id="log-pass"><option value="auto" ${state.logPass==='auto'?'selected':''}>Automatically choose: ${esc(readNumberForDate(selectedBook,date)===1?'Original read':'Reread #'+(readNumberForDate(selectedBook,date)-1))}</option>${readingPasses(selectedBook).map(p=>`<option value="${p.number}" ${state.logPass===String(p.number)?'selected':''}>${esc(p.number===1?'Original read':'Reread #'+(p.number-1))} (${esc(statusText[p.status]||p.status)})</option>`).join('')}</select><p class="tiny">Sessions belong to one read-through. Use Book details → Read history to add a missing reread, then choose the correct pass here for backdated logs.</p></div>`:''}
  <div class="formfield" style="margin:15px 0"><label for="log-mode">Activity label</label><select class="select" id="log-mode">${Object.entries(activityModes).map(([id,label])=>`<option value="${id}" ${state.logMode===id?'selected':''}>${label}</option>`).join('')}</select><p class="tiny">Read + Listen counts the elapsed session time once, not twice.</p></div>
  <div class="log-methods"><button data-logmethod="pages" class="method ${state.logMethod==='pages'?'active':''}">Time + Ending Page<div class="desc">${state.logMode==='audiobook'?'Enter the print-equivalent page reached':'Enter the page you stopped on'}</div></button>
  <button data-logmethod="chapters" class="method ${state.logMethod==='chapters'?'active':''}">Time + Chapters<div class="desc">Exact edition mapping only</div></button>${state.logMode!=='reading'?`<button data-logmethod="audio_position" class="method ${state.logMethod==='audio_position'?'active':''}">Time + Audio Position<div class="desc">Track audiobook timestamps</div></button>`:''}</div>
  <div class="formfield" style="margin:13px 0"><label for="log-start-time">Local session start time (editable)</label><input type="time" class="input" id="log-start-time" value="${esc(state.logStartLocalTime)}" style="max-width:190px"/><p class="tiny">${date===today()?'Suggested when you open a new log, using your device’s local clock. Correct it if your reading actually began earlier.':'Backdated log: enter the actual start time if known; historical times are never guessed.'} You can leave it blank if unknown. Used for time-of-day insights and the activity feed.</p></div>
  <div class="formgrid"><div class="formfield"><label for="log-minutes">Session time (minutes)</label><input class="input" type="number" min="1" step="1" id="log-minutes" value="${esc(state.logMinutes)}"/></div>
  ${state.logMethod==='pages'?`<div class="formfield"><label for="log-ending-page">${state.logMode==='audiobook'?'Print-edition equivalent page left off on':'Page left off on'}</label><input class="input" type="number" min="1" step="1" id="log-ending-page" ${selectedBook?.page_count?`max="${selectedBook.page_count}"`:''} value="${esc(state.logEndingPage)}" placeholder="e.g. ${Number(startingPage??0)+25}"/>
  <p class="page-progress-source">Starting from <strong id="log-page-start-label">${startingPage===null||startingPage===undefined?'unknown':'page '+startingPage}</strong> · <span id="log-page-source-label">${esc(startSource)}</span>${selectedBook?.page_count?' · '+selectedBook.page_count+' total pages':''}</p>
  <p class="page-progress-result${pagePreview?.error&&state.logEndingPage!==''?' invalid':''}" id="log-page-preview" role="status" aria-live="polite">${esc(pagePreview?.error||`${pagePreview?.pages} ${state.logMode==='audiobook'?'page-equivalents':'pages'} progressed (${startingPage} → ${Number(state.logEndingPage)})`)}</p>
  ${startingPage!=null?`<button type="button" class="btn text page-start-toggle" data-action="toggle-log-start-page">${state.logStartOverrideOpen?'Hide starting-page editor':'Correct starting page'}</button>`:''}
  ${state.logStartOverrideOpen||startingPage==null?`<label for="log-starting-page" style="margin-top:8px">Starting page before this session</label><input class="input" type="number" min="0" step="1" id="log-starting-page" value="${esc(state.logStartingPage!==''?state.logStartingPage:startingPage??'')}" placeholder="Required for older sessions"/><p class="help">Only edit this if your book progress or older session history does not reflect where you started. This does not change the book until you save.</p>`:''}
  ${pageContext?.hasLaterSessions?`<p class="help">Backdated entry: existing later session totals are not recalculated. ${pageContext.laterSessionHasUnknownStart?'The next older-format log has no saved starting page; check for overlap.':'Ending page cannot go beyond the next logged starting page.'}</p>`:''}
  </div>`:state.logMethod==='chapters'?`<div class="formfield"><label>${state.logMode==='audiobook'?'Exact page-equivalents from chapters':'Exact pages from chapters'}</label><div class="input" style="background:#f2f6ef">${mappedPages===null?'Mapping required':mappedPages+' pages'}</div></div>`:`<div class="formfield"><label>Audiobook progress</label><div class="input" style="background:#f2f6ef">Elapsed position · no page estimate</div></div>`}</div>
  ${state.logMethod==='chapters'?`<div class="formgrid" style="margin-top:13px"><div class="formfield"><label>From chapter</label><select id="log-from" class="select"><option value="">Select</option>${mapped.map(c=>`<option value="${c.chapter_number}" ${from===String(c.chapter_number)?'selected':''}>${esc(c.chapter_label||'Chapter '+c.chapter_number)}</option>`).join('')}</select></div>
  <div class="formfield"><label>Through chapter</label><select id="log-to" class="select"><option value="">Select</option>${mapped.map(c=>`<option value="${c.chapter_number}" ${to===String(c.chapter_number)?'selected':''}>${esc(c.chapter_label||'Chapter '+c.chapter_number)}</option>`).join('')}</select></div></div>
  <div class="notice ${mappedPages===null?'warn':''}">${mapped.length?`${mapped.length} mapped chapters for this edition. ${mappedPages===null?'The selected range has gaps or is incomplete.':'This range equals '+mappedPages+' exact pages.'}`:'No exact chapter boundaries have been entered for this edition.'}<br/>No chapters are averaged or estimated.
  <button class="btn sm" style="margin-top:8px" data-action="open-book" data-id="${esc(state.logBook)}" data-chapters="yes">Manage exact chapter boundaries</button></div>`:''}
  ${state.logMethod==='audio_position'?`<div class="formgrid" style="margin:12px 0"><div class="formfield"><label>Audiobook start position (minutes)</label><input class="input" id="log-audio-start" type="number" min="0" step="1" value="${esc(state.logAudioStart)}"/></div><div class="formfield"><label>End position (minutes)</label><input class="input" id="log-audio-end" type="number" min="1" step="1" value="${esc(state.logAudioEnd)}"/></div></div><div class="notice">The start/end positions show audiobook progress. Page totals stay blank unless actual pages or exact mapped chapters were recorded.</div>`:''}
  <div class="timer reading-clock"><div class="clock-top"><div><strong>Optional reading stopwatch</strong><div class="tiny">Start and pause while reading. Or enter your minutes manually above.</div></div><span class="status-pill" id="clock-status">${clockStatus()}</span></div>
  <strong class="clock-face" id="timer-face" role="timer" aria-label="Elapsed reading time">${readingClock.display()}</strong>
  <div class="clock-actions"><button class="btn sm primary" data-action="clock-toggle">${ico(readingClock.running?'pause':'play',14)} ${readingClock.running?'Pause':readingClock.elapsedMs()>0?'Resume':'Start'}</button><button class="btn sm" data-action="clock-use">${ico('stop',14)} Stop &amp; use time</button><button class="btn sm" data-action="clock-reset">Reset</button></div>
  <p class="tiny">Elapsed time is calculated from timestamps, not background timer ticks. Your stopwatch draft is stored on this device. Review the duration before saving if the app was left running after you finished reading.</p></div>
  <button class="btn primary block" data-action="save-log" ${!selectedBook?'disabled':''}>${ico('plus',16)} Save reading session</button>
  <p class="tiny" style="margin-top:10px">All three reading modes accept Time + Ending Page or Time + exact Chapters. Audio modes also support Time + Audio Position without a page count. Audiobook page numbers represent print-edition progress, not physically read pages. Never guess pages from listening time or average chapter length.</p>
 </div><div class="card"><h2 class="section-title">${esc(fmtDate(date))}</h2><p class="section-sub">Your daily reading breakdown ${state.logViewMode==='all'?'· all activity types':'· '+activityModes[state.logViewMode]}</p>
 <div class="kpis" style="margin:17px 0;grid-template-columns:repeat(2,1fr)"><div class="kpi"><div class="kpi-num">${fmtTime(minutes)}</div><div class="kpi-label">Reading time</div></div><div class="kpi"><div class="kpi-num">${totalPages}</div><div class="kpi-label">Total pages progressed</div></div></div>
 <p class="tiny">${dailyPageTotals.physical} physical pages · ${dailyPageTotals.audioEquivalent} audiobook page-equivalents</p><div class="toolbar" style="margin:11px 0"><span class="tiny">${bookIds.length} books · ${data.length} sessions</span><select class="select" id="log-view-mode" aria-label="Filter sessions by reading mode" style="max-width:190px">${modeOptions(state.logViewMode)}</select></div>
 ${bookIds.map(id=>{
 const book=bookById(id),records=data.filter(s=>s.user_book_id===id);if(!book)return '';
 return `<div class="session-breakdown"><div class="inline" style="align-items:flex-start">${cover(book,'small')}<div><strong>${esc(book.title)}</strong><div class="tiny">${fmtTime(sum(records,'duration_minutes'))} · ${sum(records,'pages_read')} pages progressed</div>${records.map(s=>`<div class="inline" style="margin-top:7px;font-size:10px;color:#76897b">${modeBadge(modeOf(s))} ${s.log_type==='chapters'?'Chapters '+s.chapter_from+'–'+s.chapter_to:s.log_type==='audio_position'?'Audio '+s.audio_start_minute+'–'+s.audio_end_minute+' min':'Pages'} · ${s.duration_minutes}m · ${pageDetail(s)} <button class="btn text" data-action="delete-session" data-id="${esc(s.id)}" aria-label="Delete session">${ico('trash',13)}</button></div>`).join('')}</div></div></div>`;
 }).join('')||'<div class="notice warn">No reading activity has been logged for this day.</div>'}
 </div></div>`:`<div class="notice">You're viewing ${esc(profileById(state.activeId).display_name)}'s activity. Only the account owner can add or change reading sessions.</div><div class="card"><div class="inline"><label for="partner-log-date">Date</label><input id="partner-log-date" type="date" class="input" style="max-width:190px" value="${esc(date)}"/></div><div class="kpis" style="margin-top:15px">${metricCard(fmtTime(minutes),'Time')}${metricCard(totalPages,'Pages')}${metricCard(bookIds.length,'Books')}</div>${data.map(s=>`<div class="session-row"><div>${cover(bookById(s.user_book_id),'small')}</div><div><div class="session-title">${esc(bookById(s.user_book_id)?.title||'Unknown book')}</div><div class="session-meta">${modeBadge(modeOf(s))} · ${s.duration_minutes} min · ${pageDetail(s)}</div></div></div>`).join('')||'<p class="text-sm muted">No activity on this date.</p>'}</div>`}`;
}
const metricCard=(value,label)=>`<div class="kpi"><div class="kpi-num">${value}</div><div class="kpi-label">${label}</div></div>`;
function clockStatus(){return readingClock.running?'Running':readingClock.elapsedMs()?'Paused':'Ready';}
function tickReadingClock(){
 const face=app.querySelector('#timer-face');if(face)face.textContent=readingClock.display();
 const status=app.querySelector('#clock-status');if(status)status.textContent=clockStatus();
}
function startClockTicker(){
 clearInterval(clockTickHandle);clockTickHandle=null;
 tickReadingClock();if(readingClock.running)clockTickHandle=setInterval(tickReadingClock,500);
}
function addDays(date,n){const d=new Date(`${date}T12:00:00`);d.setDate(d.getDate()+n);return localDate(d);}
function datesBetween(a,b){const out=[];for(let d=a;d<=b;d=addDays(d,1))out.push(d);return out;}
function yearEnd(year){return `${year}-12-31`;}
function periodSpec(){
 const date=today(),year=state.insightYear;
 if(state.period==='week'){const start=weekStartSunday(date),end=weekEndSaturday(date);return{start,end,label:`${fmtDate(start)} – ${fmtDate(end)}`,year};}
 if(state.period==='month'){const last=localDate(new Date(Number(date.slice(0,4)),Number(date.slice(5,7)),0,12));return {start:date.slice(0,7)+'-01',end:last,label:new Date(`${date.slice(0,7)}-01T12:00:00`).toLocaleDateString(undefined,{month:'long',year:'numeric'}),year};}
 return{start:`${year}-01-01`,end:yearEnd(year),label:`January – December ${year}`,year};
}
function periodGroups(spec){
 if(state.period==='year')return Array.from({length:12},(_,i)=>{const m=`${spec.year}-${String(i+1).padStart(2,'0')}`;return {key:m,label:new Date(`${m}-01T12:00:00`).toLocaleDateString(undefined,{month:'short'}),month:true};});
 return datesBetween(spec.start,spec.end).map(d=>({key:d,label:state.period==='week'?new Date(`${d}T12:00:00`).toLocaleDateString(undefined,{weekday:'short'}):String(Number(d.slice(-2))),month:false}));
}
function periodSessions(){
 const p=periodSpec();return sessionsInReportingPeriod(filteredSessions(),{periodStart:p.start,periodEnd:p.end,today:today(),trackingStart:activeAccountStartDate()});
}
function streaks(){
 const tracking=activeAccountStartDate();
 const set=new Set(filteredSessions().filter(s=>s.session_date<=today()&&(!tracking||s.session_date>=tracking)).map(s=>s.session_date));
 let cursor=today(),current=0;
 if(!set.has(cursor))cursor=addDays(cursor,-1);
 while(set.has(cursor)){current++;cursor=addDays(cursor,-1);}
 const days=[...set].sort();let best=0,run=0,prev=null;
 for(const d of days){run=prev&&addDays(prev,1)===d?run+1:1;best=Math.max(best,run);prev=d;}
 return {current,best};
}
function activityChart(data,spec){
 const books=viewBooks();const chartColors=bookChartColors(books,data);const groups=periodGroups(spec),mapped=groups.map(g=>{
  const rows=data.filter(s=>g.month?s.session_date.startsWith(g.key):s.session_date===g.key);
  const totals={};rows.forEach(s=>{totals[s.user_book_id]=(totals[s.user_book_id]||0)+num(s[state.metric==='minutes'?'duration_minutes':'pages_read']);});
  return {...g,totals,total:Object.values(totals).reduce((a,b)=>a+b,0)};
 });
 // Goals are time-based. Pages charts must never imply a pages/day target.
 // Always show the account's all-mode goal, even when bars are book/mode filtered.
 const goalRows=state.metric==='minutes'?dailyGoalTimeSeries(viewSessions(),{
   targetMinutes:dailyGoalForYear(spec.year),goalHistory:effectiveGoalHistory(),today:today(),
   periodStart:spec.start,periodEnd:spec.end,groupBy:state.period==='year'?'month':'day',
   activeFrom:activeAccountStartDate()
 }):[];
 const dailyTargets=new Map(goalRows.filter(x=>!x.future&&x.days>0).map(x=>[x.key,x.targetMinutes]));
 const max=Math.max(1,...mapped.map(g=>g.total),...dailyTargets.values());
 const ids=books.filter(b=>chartColors.has(String(b.id))).sort((a,b)=>String(a.title).localeCompare(String(b.title)));
 // Align the goal line with the same zero baseline and 164px chart scale
 // as the bar stacks. No points for future or pre-tracking dates.
 let goalPath='';let previous=null;
 mapped.forEach((g,i)=>{
  const target=dailyTargets.get(g.key);if(target==null){previous=null;return;}
  const x=((i+.5)/Math.max(1,mapped.length)*1000).toFixed(2);
  const y=(164-(target/max)*164).toFixed(2);
  goalPath+=(previous?' L':' M')+x+' '+y;previous=i;
 });
 const goalOverlay=goalPath?`<svg class="activity-goal-overlay" data-goal-max="${max}" viewBox="0 0 1000 164" preserveAspectRatio="none" role="img" aria-label="Daily goal by calendar date, beginning on tracking start date"><path d="${goalPath}" fill="none" stroke="#b67b39" stroke-width="2.2" stroke-dasharray="7 8" stroke-linecap="round" stroke-opacity=".77" vector-effect="non-scaling-stroke"/></svg>`:'';
 const plot=`<div class="activity-chart-scroll"><div class="chart-area ${state.period==='month'?'chart-month':''}">${goalOverlay}${mapped.map(g=>{
  const ht=g.total?Math.max(3,Math.round(g.total/max*164)):0;
  const parts=ids.map(b=>{const val=g.totals[b.id]||0;return val?`<i class="chart-book-segment" style="height:${val/g.total*ht}px;background:${chartColors.get(String(b.id))}" title="${esc(b.title)}: ${val} ${state.metric}"></i>`:''}).join('');
  const numeric=g.total?Number(g.total.toFixed(1)).toLocaleString():'0';
  return `<div class="chart-column" data-goal-target="${dailyTargets.get(g.key)??''}" data-goal-date="${esc(g.key)}" title="${esc(g.label)}: ${g.total} ${state.metric}"><span class="chart-value" aria-label="${numeric} ${state.metric}">${g.total?numeric:''}</span><div class="chart-stack" style="height:${ht}px">${parts}</div><span class="chart-label">${state.period==='month'&&Number(g.key.slice(-2))%5!==1&&g.key!==today()?'':esc(g.label)}</span></div>`;
 }).join('')}</div></div>`;
 const legend=`<div class="legend book-chart-legend">${ids.map(b=>`<span><i class="dot" style="background:${chartColors.get(String(b.id))}"></i>${esc(b.title)}</span>`).join('')||'<span>No reading activity in this period</span>'}</div>`;
 return plot+legend+(goalOverlay?`<div class="activity-goal-hint"><i class="legend-line"></i> Daily goal · all reading modes${state.insightBook!=='all'||state.insightMode!=='all'?' (goal is for your full day)':''}</div>`:'');
}
function heatmap(){
 const first=weekStartSunday(addDays(today(),-77)),days=Array.from({length:84},(_,i)=>addDays(first,i));
 const totals={};viewSessions().forEach(s=>{
  const m=Number(s.duration_minutes);
  if(Number.isFinite(m)&&m>0&&s.session_date<=today())totals[s.session_date]=(totals[s.session_date]||0)+m;
 });
 const minDate=activeAccountStartDate();
 return `<div class="heatmap">${days.map(d=>{
  const preTracking=Boolean(minDate&&d<minDate);
  const m=preTracking?0:totals[d]||0,target=targetForDate(d);
  const future=d>today()||preTracking,v=future?0:m===0?0:m<30?1:m<60?2:m<105?3:4,met=!future&&m>=target;
  const label=preTracking?`${d}: before tracking start date`:`${d}: ${m} of ${target} goal minutes${met?' - goal met':''}`;
  return `<div class="heat-cell ${v?'lv'+v:''} ${met?'goal-met':''}" title="${esc(label)}" aria-label="${esc(label)}"></div>`;
 }).join('')}</div><div class="tiny heatmap-legend"><span>12 weeks ago</span><span><i class="goal-key"></i> Gold outline = daily goal met</span></div>`;
}
/** Daily bar versus dated goal line; year aggregates actual and targets by month.
 * Only elapsed calendar dates count. This deliberately ignores selected book
 * and activity filters: the daily time goal includes all reading modes.
 */
function goalVsActualChart(spec){
 const rows=dailyGoalTimeSeries(viewSessions(),{
   targetMinutes:30,goalHistory:effectiveGoalHistory(),today:today(),periodStart:spec.start,
   periodEnd:spec.end,groupBy:state.period==='year'?'month':'day',activeFrom:activeAccountStartDate()
 });
 const items=rows.filter(r=>!r.future),all=rows;
 const actual=items.reduce((a,x)=>a+x.actualMinutes,0),reference=items.reduce((a,x)=>a+x.targetMinutes,0);
 const max=Math.max(30,...items.flatMap(r=>[r.actualMinutes,r.targetMinutes]))*1.12;
 const width=state.period==='month'?Math.max(550,all.length*26):state.period==='year'?430:425;
 const h=244,left=39,right=12,top=20,bottom=40;
 const plotW=width-left-right,plotH=h-top-bottom;
 const x=i=>left+(i+.5)*plotW/all.length;
 const y=value=>top+plotH*(1-value/max);
 let bars='',path='',labels='';let last=null;
 const barWidth=Math.max(7,Math.min(30,plotW/all.length*.49));
 for(let i=0;i<all.length;i++){
   const r=all[i],cx=x(i);
   if(!r.future){
     const yy=y(r.actualMinutes),barH=Math.max(0,top+plotH-yy);
     bars+=`<rect x="${(cx-barWidth/2).toFixed(1)}" y="${yy.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barH.toFixed(1)}" rx="2" fill="#618b72"><title>${esc(r.key)}: ${Math.round(r.actualMinutes)} actual minutes; ${Math.round(r.targetMinutes)} goal minutes (${r.daysMet}/${r.days} goal days)</title></rect>`;
     if(r.actualMinutes>0){bars+=`<text class="chart-svg-value" x="${cx.toFixed(1)}" y="${Math.max(11,yy-6).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="#28583b">${Math.round(r.actualMinutes)}</text>`;}
     if(last===null)path=`M${cx.toFixed(1)},${y(r.targetMinutes).toFixed(1)}`;
     else {const middle=(last.x+cx)/2;path+=` H${middle.toFixed(1)} V${y(r.targetMinutes).toFixed(1)} H${cx.toFixed(1)}`;}

     last={x:cx};
   }
   const showLabel=state.period==='month'?i%3===0||i===all.length-1:true;
   if(showLabel){const label=state.period==='year'?new Date(`${r.key}-01T12:00:00`).toLocaleDateString(undefined,{month:'short'}):state.period==='week'?new Date(`${r.key}T12:00:00`).toLocaleDateString(undefined,{weekday:'short'}):String(Number(r.key.slice(-2)));
     labels+=`<text x="${cx.toFixed(1)}" y="${h-16}" text-anchor="middle" font-size="10" fill="#7c8e81">${esc(label)}</text>`;
   }
 }
 let grid='';for(let i=0;i<=4;i++){const val=max*i/4,yy=y(val);grid+=`<line x1="${left}" x2="${width-right}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}" stroke="#e7ebe4" stroke-width="1"/><text x="${left-6}" y="${(yy+4).toFixed(1)}" text-anchor="end" font-size="10" fill="#809082">${Math.round(val)}</text>`;}
 const title=state.period==='year'?"Monthly total vs sum of each day's goal":"Daily reading minutes vs that day's goal";
 return `<div class="card goal-reference-card" style="margin-top:15px"><div class="cardhead"><div><h2 class="section-title">Reading time vs goal</h2><p class="section-sub">${title} · ${esc(spec.label)} · all activity types</p></div></div>
 <div class="goal-reference-summary"><span><strong>${fmtTime(actual)}</strong> logged</span><span><strong>${fmtTime(reference)}</strong> daily goal through today</span></div>
 <div class="goal-reference-scroll ${state.period==='month'?'':'goal-reference-compact'}"><svg class="goal-reference-svg" viewBox="0 0 ${width} ${h}" width="${width}" height="${h}" role="img" aria-label="Reading time versus dated daily goal for ${esc(spec.label)}">${grid}${path?`<path d="${path}" class="goal-guide-line" fill="none" stroke="#b67b39" stroke-width="1.35" stroke-dasharray="5 6" stroke-opacity="0.68" stroke-linejoin="round" stroke-linecap="round"><title>Daily goal, using the historically saved target for each date</title></path>`:''}${bars}${labels}</svg></div>
 <div class="goal-reference-legend"><span><i class="legend-square actual"></i> Actual reading minutes</span><span><i class="legend-line"></i> Daily goal</span></div>
 <p class="tiny" style="margin-top:10px">Daily goal and progress begin on the saved tracking start date. Past daily goal targets remain fixed. New goal settings apply starting on the date you change them. Weekly/monthly views compare individual days; yearly view adds each day's historical target into its calendar month's goal total. Future days are not counted as missed goals. All reading and listening time counts once.</p></div>`;
}
const speedColors={ reading:'#56876c', audiobook:'#6488b4', read_listen:'#b48a56' };
const speedLabel=value=>value==null?'—':Number(value).toFixed(1);
const speedModeText={ reading:'Reading only', audiobook:'Audiobook only', read_listen:'Read + Listen' };

/** The speed comparison intentionally spans all three activity modes. The top
 * activity filter affects other charts, while this section stays comparable.
 * The book filter and the current calendar window apply to both. */
function renderReadingSpeedInsights(periodRows,spec){
 const stats=readingSpeedByMode(periodRows);
 const keys=['reading','audiobook','read_listen'];
 const max=Math.max(1,...keys.map(k=>stats[k].pagesPerHour||0));
 const cards=[['overall','All activity'],...keys.map(k=>[k,speedModeText[k]])]
   .map(([k,label])=>`<div class="speed-summary ${esc(k)}"><span class="speed-mode-label">${esc(label)}</span><strong class="speed-value">${speedLabel(stats[k].pagesPerHour)} <small>pages/hr</small></strong><span class="tiny">${stats[k].measuredSessions} measured session${stats[k].measuredSessions===1?'':'s'}</span></div>`).join('');
 const bars=keys.map(k=>`<div class="speed-row"><div class="rank-top"><strong><i class="speed-dot" style="background:${speedColors[k]}"></i>${speedModeText[k]}</strong><span>${stats[k].pagesPerHour==null?'No measured pages':speedLabel(stats[k].pagesPerHour)+' pages/hr'}</span></div><div class="bar-track"><div class="bar-fill" style="width:${(stats[k].pagesPerHour||0)/max*100}%;background:${speedColors[k]}"></div></div></div>`).join('');
 // Calendar-correct day/week/month grouping, preserving true gaps rather than
 // drawing fake zero-speed points where no eligible session exists.
 const groups=periodGroups(spec);
 const points=groups.map(group=>{
   const entries=periodRows.filter(row=>group.month?row.session_date?.startsWith(group.key):row.session_date===group.key);
   return Object.fromEntries(keys.map(k=>[k,readingSpeedStats(entries,{activityMode:k}).pagesPerHour]));
 });
 const possible=points.flatMap(p=>keys.map(k=>p[k]).filter(v=>v!=null));
 const yMax=Math.max(20,Math.ceil(Math.max(1,...possible)/20)*20);
 const L=40,R=600,T=12,B=150,H=B-T,plotWidth=R-L;
 const coords=(i,value)=>[L+(groups.length===1?plotWidth/2:i*plotWidth/(groups.length-1)), B-value/yMax*H];
 const grid=[0,.5,1].map(frac=>`<g><line x1="${L}" y1="${B-H*frac}" x2="${R}" y2="${B-H*frac}" stroke="#e2e9e0"/><text x="${L-7}" y="${B-H*frac+4}" text-anchor="end" fill="#83978a" font-size="10">${Math.round(yMax*frac)}</text></g>`).join('');
 const series=keys.map(k=>{
   let paths='',dots='';
   points.forEach((point,i)=>{
     if(point[k]==null)return;
     const [x,y]=coords(i,point[k]);
     if(i>0&&points[i-1][k]!=null){const [px,py]=coords(i-1,points[i-1][k]);paths+=`<line x1="${px}" y1="${py}" x2="${x}" y2="${y}" stroke="${speedColors[k]}" stroke-width="2.6" stroke-linecap="round"/>`;}
     dots+=`<circle cx="${x}" cy="${y}" r="3.6" fill="${speedColors[k]}"><title>${esc(speedModeText[k])} · ${esc(groupLabel(groups[i]))} · ${point[k].toFixed(1)} pages/hr</title></circle>`;
     const showValue=state.period==='week'||(state.period==='year'&&i%2===0)||(state.period==='month'&&i%7===0);
     if(showValue)dots+=`<text x="${x}" y="${Math.max(11,y+(k==='read_listen'?15:-8-(k==='audiobook'?10:0)))}" text-anchor="middle" fill="${speedColors[k]}" font-size="9" font-weight="700">${point[k].toFixed(1)}</text>`;
   });
   return paths+dots;
 }).join('');
 function groupLabel(g){return g.label;}
 const ticks=groups.map((g,i)=>i===0||i===groups.length-1||state.period==='year'||(state.period==='month'&&i%5===0)?`<text x="${coords(i,0)[0]}" y="171" fill="#87978b" font-size="10" text-anchor="middle">${esc(g.label)}</text>`:'').join('');
 const trend=`<div class="speed-trend" role="img" aria-label="Reading speed over ${esc(spec.label)}, in pages per hour by reading activity type"><svg viewBox="0 0 615 180" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"><text x="3" y="12" fill="#809487" font-size="10">pg/hr</text>${grid}${series}${ticks}</svg></div>`;
 const bookIds=[...new Set(periodRows.map(row=>row.user_book_id))].filter(id=>viewBooks().some(b=>b.id===id));
 const bookRows=bookIds.map(id=>({book:bookById(id),values:readingSpeedByMode(periodRows.filter(row=>row.user_book_id===id))}))
   .filter(item=>item.values.overall.measuredSessions>0).sort((a,b)=>b.values.overall.minutes-a.values.overall.minutes);
 const table=bookRows.length?`<div class="speed-book-table" role="table" aria-label="Reading speed per book and activity type"><div class="speed-book-header" role="row"><span role="columnheader">Book</span>${keys.map(k=>`<span role="columnheader">${esc(speedModeText[k])}</span>`).join('')}</div>${bookRows.slice(0,8).map(item=>`<div class="speed-book-line" role="row"><span role="cell" class="speed-book-name">${esc(item.book?.title||'Book')}<small>${speedLabel(item.values.overall.pagesPerHour)} overall</small></span>${keys.map(k=>`<span role="cell">${speedLabel(item.values[k].pagesPerHour)}</span>`).join('')}</div>`).join('')}</div>`:'<p class="text-sm muted">No sessions with recorded pages for this period and book selection.</p>';
 const genreEntries=periodRows.filter(r=>selectedMode(r,state.insightMode));
 const byGenre=genreSpeedStats(viewBooks(),genreEntries);
 const genreMax=Math.max(1,...byGenre.map(g=>g.pagesPerHour||0));
 const genreBars=byGenre.length?byGenre.slice(0,10).map(g=>`<div class="speed-row"><div class="rank-top"><strong>${esc(g.genre)}</strong><span>${g.pagesPerHour.toFixed(1)} pg/hr · ${g.measuredSessions} sessions</span></div><div class="bar-track"><div class="bar-fill" style="width:${100*g.pagesPerHour/genreMax}%;background:#8472a4"></div></div><div class="tiny">${g.bookCount} book${g.bookCount===1?'':'s'} · ${fmtTime(g.minutes)} measured</div></div>`).join(''):'<p class="text-sm muted">No eligible genre-labeled sessions with page progress in this period.</p>';
 const skipped=stats.overall.excludedSessions;
 return `<div class="card speed-panel" style="margin-top:15px"><div class="cardhead"><div><h2 class="section-title">Reading speed by activity type</h2><p class="section-sub">Weighted pages progressed per measured hour · ${esc(spec.label)}</p></div></div>
 <div class="speed-summary-grid">${cards}</div><div class="speed-comparison">${bars}</div>
 <div class="cardline"></div><h3 class="small-title">Speed trends by reading method</h3><p class="section-sub">Daily rates this week/month; monthly rates for the annual view. Days with no measured pages are left blank.</p>${trend}
 <div class="cardline"></div><h3 class="small-title">Speed by individual book</h3><p class="section-sub">Same calendar period and book selection · values in pages/hour</p>${table}
 <div class="cardline"></div><h3 class="small-title">Reading speed by genre</h3><p class="section-sub">Weighted pages/hour · ${state.insightMode==='all'?'All activity types':esc(activityModes[state.insightMode])} · primary genre only</p><div class="speed-comparison">${genreBars}</div>
 <p class="tiny">Each book contributes to its first listed genre only, preventing duplicate pages/time. Unclassified books appear as Uncategorized. Missing page progress is excluded; audio-only speed uses recorded print-edition page-equivalents.</p>
 <p class="tiny speed-note">Physical reading uses actual pages, audiobook-only uses print-edition page-equivalents, and Read + Listen counts progress and time once. Page counts come from direct entry or exact mapped chapters; never estimated from chapter averages or listening duration. ${skipped?skipped+' session'+(skipped===1?' was':'s were')+' excluded from speed calculations because valid time and page progress were not both recorded.':''} Comparisons intentionally show all three methods even if the main activity filter is set to one mode.</p></div>`;
}

function renderBookSpeedInsight(sessions){
 const data=readingSpeedByMode(sessions),modes=['reading','audiobook','read_listen'];
 return `<div class="card soft book-speed-card" style="margin-bottom:14px"><h3 class="small-title">Reading speed by activity type</h3><p class="section-sub">For this book · pages progressed per measured hour</p><div class="speed-book-detail-grid">${modes.map(k=>`<div class="speed-detail"><span class="speed-mode-label">${speedModeText[k]}</span><strong>${speedLabel(data[k].pagesPerHour)} <small>pg/hr</small></strong><span class="tiny">${data[k].measuredSessions} measured sessions</span></div>`).join('')}</div><p class="tiny">Audiobook-only speed uses edition page-equivalents. Read + Listen is counted once. Sessions with no page progress are excluded.</p></div>`;
}

function renderBookDaysInsight(){
 const allSessions=viewSessions(),books=viewBooks().filter(b=>state.insightBook==='all'||b.id===state.insightBook);
 const data=books.map(book=>({book, ...bookReadingDays(book,allSessions.filter(s=>s.user_book_id===book.id&&Number(s.read_number||1)===currentReadNumber(book)),{today:today(),activityMode:state.insightMode})}))
   .filter(x=>x.elapsedDays!==null).sort((a,b)=>b.readingDays-a.readingDays||b.elapsedDays-a.elapsedDays);
 const displayed=state.showAllBookDays?data:data.slice(0,8);
 return `<div class="card" style="margin-top:15px"><div class="cardhead"><div><h2 class="section-title">Reading days by book</h2>
  <p class="section-sub">Days in the latest reading pass for each book, independent of the calendar chart range. Active days = distinct dates with sessions${state.insightMode==='all'?'':` for ${activityModes[state.insightMode]}`}. Elapsed days = start through finish (or today), inclusive.</p></div></div>
  ${data.length?`<div class="book-days-table" role="table" aria-label="Reading days and calendar days by book"><div class="days-row header" role="row"><span role="columnheader">Book</span><span role="columnheader">Reading days</span><span role="columnheader">Elapsed days</span><span role="columnheader">Consistency</span></div>
  ${displayed.map(x=>`<div class="days-row" role="row"><span class="days-book" role="cell"><strong>${esc(x.book.title)}</strong><small>${esc(x.startDate)} – ${esc(x.endDate)}</small></span><span role="cell">${x.readingDays}</span><span role="cell">${x.elapsedDays}</span><span role="cell"><strong>${Math.round(x.consistency*100)}%</strong><div class="bar-track"><div class="bar-fill" style="width:${x.consistency*100}%"></div></div></span></div>`).join('')}</div>
  ${data.length>8?`<button class="btn sm" data-action="toggle-book-days" style="margin-top:13px">${state.showAllBookDays?'Show fewer books':`Show all ${data.length} books`}</button>`:''}`:'<p class="notice">No books have a start date or dated reading sessions yet.</p>'}
  <p class="tiny" style="margin-top:11px">Reading or listening multiple times on one day counts as one active day. Unlogged days remain part of elapsed time. The selected activity filter changes active days, not the book’s overall elapsed days.</p></div>`;
}
/** v2.0 — original vs reread, based only on captured pass-specific sessions. */
const modeColors={reading:'#568468',audiobook:'#557fa0',read_listen:'#b28a56'};
function passMethodBreakdown(pass){
 if(!pass.primaryMode)return '<p class="tiny">Activity method not recorded for this pass.</p>';
 return `<div class="reread-mode-track" role="img" aria-label="${esc(pass.modeShares.map(x=>x.label+' '+x.percent.toFixed(1)+'%').join('; '))}">${pass.modeShares.filter(x=>x.minutes).map(x=>`<span title="${esc(x.label)}: ${x.percent.toFixed(1)}%" style="width:${x.percent.toFixed(3)}%;background:${modeColors[x.id]}"></span>`).join('')}</div><p class="tiny reread-mode-text">${pass.modeShares.filter(x=>x.minutes).map(x=>`${esc(x.label)} ${x.percent.toFixed(0)}%`).join(' · ')}</p>`;
}
function renderComparePassColumn(pass,label){
 const duration=pass.recordedMinutes===null?'Not recorded':fmtTime(pass.recordedMinutes);
 return `<div class="reread-pass-panel"><div class="reread-pass-eyebrow">${esc(label)} · ${esc(statusText[pass.status]||pass.status)}</div>
 <strong class="reread-time">${esc(duration)}</strong><span class="tiny">${pass.recordedMinutes===null?'Reading time unavailable':pass.timeComplete?'Recorded reading time':'Recorded time · incomplete logs'}</span>
 <div class="reread-pass-method"><span class="tiny">Primary method (by logged time)</span><strong>${esc(passModeLabel(pass.primaryMode))}</strong></div>${passMethodBreakdown(pass)}
 <div class="reread-detail-rows"><span>Sessions</span><strong>${pass.sessionCount||'Not recorded'}</strong>
 <span>Active days</span><strong>${pass.activeDays||'Not recorded'}</strong>
 <span>Elapsed days</span><strong>${pass.elapsedDays??'Unknown'}</strong>
 <span>Pages / active day</span><strong>${pass.pagesPerActiveDay===null?'—':pass.pagesPerActiveDay.toFixed(1)}</strong>
 <span>Recorded speed</span><strong>${pass.pagesPerHour===null?'—':pass.pagesPerHour.toFixed(1)+' pg/hr'}</strong></div>
 <p class="tiny">${esc(pass.started_on||'Start date unknown')}${pass.finished_on?' → '+esc(pass.finished_on):pass.status==='finished'&&pass.finished_year?' → '+pass.finished_year+' (exact date unknown)':' · no finish date'}</p></div>`;
}
function renderRereadComparisonCard(original,reread,bookTitle=''){
 if(!original.sessionCount&&!reread.sessionCount){
  const passSummary=(pass,label)=>{
   const dates=pass.started_on&&pass.finished_on?`${fmtDate(pass.started_on)} â†’ ${fmtDate(pass.finished_on)}`:pass.finished_on?`Finished ${fmtDate(pass.finished_on)}`:pass.started_on?`Started ${fmtDate(pass.started_on)}`:pass.status==='finished'&&pass.finished_year?`Finished in ${pass.finished_year} (exact date unknown)`:'Dates not recorded';
   const sub=pass.elapsedDays!=null?`${pass.elapsedDays} elapsed day${pass.elapsedDays===1?'':'s'}`:'Imported date record';
   return `<div class="reread-pass-panel" style="padding:11px 12px"><div class="reread-pass-eyebrow">${esc(label)} Â· ${esc(statusText[pass.status]||pass.status)}</div><strong style="font-size:13px;color:#284d38">${esc(dates)}</strong><span class="tiny">${esc(sub)}</span></div>`;
  };
  return `<div class="reread-comparison-card"><h4 class="small-title">Original vs reread #${reread.number-1}${bookTitle?' Â· '+esc(bookTitle):''}</h4>
  <div class="reread-compare-grid">${passSummary(original,'Original read')}${passSummary(reread,'Reread #'+(reread.number-1))}</div>
  <p class="tiny" style="margin-top:8px">Imported from Goodreads dates Â· log timed sessions to compare reading speed and activity methods.</p></div>`;
 }
 const comparable=original.status==='finished'&&reread.status==='finished'&&original.timeComplete&&reread.timeComplete&&original.recordedMinutes!==null&&reread.recordedMinutes!==null;
 const delta=(reread.recordedMinutes??0)-(original.recordedMinutes??0);
 const comparison=comparable?`<div class="reread-comparison-result"><strong>${delta===0?'Same recorded reading time':`${fmtTime(Math.abs(delta))} ${delta<0?'less':'more'} time on reread`}</strong> Â· ${Math.abs(delta/original.recordedMinutes*100).toFixed(1)}% ${delta<0?'less':delta>0?'more':'difference'} based on complete, finished passes</div>`:
 `<p class="tiny reread-comparison-warning">Time comparison is unavailable or provisional until both reading passes are complete and their session durations are fully recorded. Values above are recorded session time, not estimates.</p>`;
 return `<div class="reread-comparison-card"><h4 class="small-title">Original vs reread #${reread.number-1}${bookTitle?' Â· '+esc(bookTitle):''}</h4>
 <div class="reread-compare-grid">${renderComparePassColumn(original,'Original read')}${renderComparePassColumn(reread,'Reread #'+(reread.number-1))}</div>
 ${comparison}<p class="tiny" style="margin-top:9px">Read + Listen counts once. Audiobook speeds use recorded print-edition page-equivalents, never an estimate from audio time.</p></div>`;
}
function renderBookRereadComparison(book,sessions){
 const rows=readingPassMetrics(book,sessions,{today:today()});
 return rows.length>1?`<div class="card soft" style="margin-bottom:14px"><h3 class="small-title">Original vs reread · method & time</h3><p class="section-sub">Each reread is compared to your first pass using its own recorded sessions.</p>${rows.slice(1).map(row=>renderRereadComparisonCard(rows[0],row)).join('')}</div>`:'';
}

/** Insights v1.8: all reports run over the authorized profile and calendar/mode filters. */
const habitCard=(value,label)=>`<div class="habit-kpi"><strong>${value}</strong><span>${label}</span></div>`;
const habitBar=(fraction,color='#628c71')=>`<div class="habit-track"><div style="width:${Math.max(0,Math.min(100,fraction*100))}%;background:${color}"></div></div>`;
const formatRatio=value=>value==null?'—':Number(value).toFixed(1);
function renderHabitsInsights(entries,spec,speedRows=entries){
 const t=timeOfDayStats(entries),w=dayOfWeekStats(entries,{periodStart:spec.start,periodEnd:spec.end,today:today(),activeFrom:activeAccountStartDate()}),duration=sessionLengthStats(entries),dist=activityDistribution(entries),heat=weekdayTimeHeatmap(entries);
 const top=Math.max(1,...t.buckets.map(x=>x.minutes)),wmax=Math.max(1,...w.days.map(x=>x.avgMinutesPerDay)),lengthMax=Math.max(1,...duration.buckets.map(x=>x.count));
 const goalStats=dailyReadingGoalStats(viewSessions(),{targetMinutes:30,goalHistory:effectiveGoalHistory(),today:today(),periodStart:spec.start,periodEnd:spec.end,activeFrom:activeAccountStartDate()});
 const colors={reading:'#568468',audiobook:'#557fa0',read_listen:'#b28a56'};
 let position=0;
 const wedges=dist.buckets.map(b=>{const from=position;position+=b.share;return `${colors[b.id]} ${from.toFixed(4)}% ${position.toFixed(4)}%`;}).join(',');
 const pie=dist.totalMinutes?`<div class="activity-pie" role="img" aria-label="Reading activity distribution: ${dist.buckets.map(b=>`${b.label} ${b.share.toFixed(1)} percent`).join(', ')}" style="background:conic-gradient(${wedges})"></div>`:'<div class="activity-pie empty" aria-label="No logged activity yet"></div>';
 const cells=heat.rows.map(r=>`<div class="habit-heat-row"><strong>${r.name}</strong>${r.cells.map(c=>{const fraction=heat.maxMinutes?c.minutes/heat.maxMinutes:0;return `<span class="habit-heat-cell" title="${esc(r.name)} · ${esc(TIME_OF_DAY.find(x=>x.id===c.id)?.label)} · ${Math.round(c.minutes)} minutes" style="background:${c.minutes===0?'#eff1ea':`rgba(38,116,74,${(.16+fraction*.78).toFixed(2)})`}"></span>`}).join('')}</div>`).join('');
 return `<section id="insights-habits" class="insight-section"><div class="insight-section-heading"><div class="eyebrow">WHEN & HOW YOU READ</div><h2 class="section-title">Reading Habits</h2><p class="section-sub">Selected calendar period and activity/book filters · optional start times improve time-of-day charts</p></div>
 <div class="card" style="margin-top:13px"><h3 class="small-title">Reading by time of day</h3><p class="section-sub">Actual minutes distributed across time bands; speed calculated from entire sessions grouped by start time</p>
 <div class="habit-time-grid">${t.buckets.map(b=>`<div class="habit-time"><div class="habit-time-head"><strong>${b.label}</strong><span>${fmtTime(Math.round(b.minutes))}</span></div>${habitBar(b.minutes/top)}<div class="tiny">${TIME_OF_DAY.find(x=>x.id===b.id).hours} · ${b.sessions} starts · ${formatRatio(b.pagesPerHour)} pg/hr</div></div>`).join('')}</div>
 <p class="tiny">${t.unknownMinutes?`${fmtTime(Math.round(t.unknownMinutes))} across ${t.unknownSessions} session${t.unknownSessions===1?'':'s'} with unknown start time are excluded from the five time bands.`:'All logged sessions in this view have start times.'} Page speed uses exact or manually recorded page progress and excludes position-only logs. Session durations crossing periods are split for time distribution; pages are never estimated across periods.</p></div>
 <div class="card" style="margin-top:15px"><h3 class="small-title">Reading speed by time of day</h3><p class="section-sub">Weighted pages per hour by start time and method · All activity includes all three modes, independent of the mode filter</p>
 ${(()=>{
   const buckets=timeOfDaySpeedByMode(speedRows);
   const modes=[['overall','All activity','#8271a2'],['reading','Reading only',speedColors.reading],['audiobook','Audiobook only',speedColors.audiobook],['read_listen','Read + Listen',speedColors.read_listen]];
   const speedMax=Math.max(1,...buckets.flatMap(b=>modes.map(([id])=>b.speeds[id].pagesPerHour||0)));
   return `<div class="habit-speed-breakdown">${buckets.map(b=>`<section class="habit-speed-band"><div class="habit-speed-heading"><strong>${esc(b.label)}</strong><span>${esc(b.hours)}</span></div>
      ${modes.map(([id,label,color])=>{const speed=b.speeds[id].pagesPerHour;return `<div class="habit-speed-row"><span class="habit-speed-mode"><i class="speed-dot" style="background:${color}"></i>${esc(label)}</span><div class="habit-speed-track" aria-label="${esc(b.label)}, ${esc(label)}: ${speed==null?'no measured speed':speed.toFixed(1)+' pages per hour'}"><span style="width:${Math.max(0,(speed||0)/speedMax*100).toFixed(2)}%;background:${color}"></span></div><strong>${speed==null?'—':speed.toFixed(1)}<small>${speed==null?'':' pg/hr'}</small></strong></div>`}).join('')}</section>`).join('')}</div>`;
 })()}
 <p class="tiny">All activity is calculated as total recorded pages divided by total eligible reading time, not an average of the three speeds. Sessions without exact pages or recorded start time cannot produce a speed here. An entire session's page speed is assigned to its starting period; audiobook pages are explicitly recorded page-equivalents.</p></div>
 <div class="grid2" style="margin-top:15px"><div class="card"><h3 class="small-title">Reading by day of week</h3><p class="section-sub">Average minutes per calendar day, including days with zero reading</p>
 ${w.days.map(r=>`<div class="habit-compact-row"><strong>${r.name}</strong>${habitBar(r.avgMinutesPerDay/wmax)}<span>${Math.round(r.avgMinutesPerDay)}m/day</span></div>`).join('')}
 </div><div class="card"><h3 class="small-title">Weekdays vs weekends</h3><p class="section-sub">Comparison normalized by the number of calendar days</p>
 <div class="habit-kpis">${habitCard(`${Math.round(w.weekdays.avgMinutesPerDay)}m`,'Weekday daily average')}${habitCard(`${Math.round(w.weekends.avgMinutesPerDay)}m`,'Weekend daily average')}</div><p class="tiny" style="margin-top:13px">Weekdays: ${fmtTime(Math.round(w.weekdays.minutes))} across ${w.weekdays.calendarDays} days. Weekends: ${fmtTime(Math.round(w.weekends.minutes))} across ${w.weekends.calendarDays} days.</p>
 <div class="cardline"></div><h3 class="small-title">Session duration</h3><div class="habit-kpis">${habitCard(formatRatio(duration.avgMinutes)+'m','Average session')}${habitCard((duration.longestMinutes??0)+'m','Longest session')}</div><p class="tiny">Median: ${formatRatio(duration.medianMinutes)} min · ${duration.count} total sessions</p></div></div>
 <div class="grid2" style="margin-top:15px"><div class="card"><h3 class="small-title">Session length distribution</h3><p class="section-sub">Recorded session durations</p>${duration.buckets.map(b=>`<div class="habit-compact-row"><strong>${b.label}</strong>${habitBar(b.count/lengthMax)}<span>${b.count}</span></div>`).join('')}</div>
 <div class="card"><h3 class="small-title">Daily goal success & consistency</h3><p class="section-sub">Uses the original goal target for each date, independent of book and activity filters</p>
 <div class="habit-kpis">${habitCard(goalStats.percentDaysMet==null?'—':Math.round(goalStats.percentDaysMet)+'%','Calendar days meeting goal')}${habitCard(`${goalStats.daysMet}/${goalStats.evaluatedDays}`,'Days goal achieved')}${habitCard(goalStats.currentGoalStreak,'Current goal streak')}${habitCard(goalStats.longestGoalStreak,'Longest goal streak')}</div>
 <p class="tiny" style="margin-top:12px">The goal-success rate includes non-reading days and preserves historical target changes.</p></div></div>
 <div class="habits-routine-layout" style="margin-top:15px">
 <div class="card"><h3 class="small-title">Routine heatmap · Day of week × time of day</h3><p class="section-sub">Minutes by day and period · darker means more activity</p>
 <div class="habit-heat-head"><i></i>${TIME_OF_DAY.map(t=>`<span>${t.label}</span>`).join('')}</div>${cells}
 <p class="tiny" style="margin-top:13px">${heat.unknownMinutes?`${fmtTime(Math.round(heat.unknownMinutes))} with unknown start times are not assigned to a heatmap cell.`:'All recorded minutes in this period have local start times.'} Late-night sessions can span midnight; their minutes are allocated to the relevant local weekday and time period.</p></div>
 <div class="card"><h3 class="small-title">Reading vs listening distribution</h3><p class="section-sub">Share of logged time by activity · Read + Listen counted once</p><div class="activity-pie-layout">${pie}<div class="activity-pie-legend">${dist.buckets.map(b=>`<div class="habit-mode-row"><div class="habit-time-head"><strong><i class="speed-dot" style="background:${colors[b.id]}"></i> ${esc(b.label)}</strong><span>${b.share.toFixed(1)}%</span></div><div class="tiny">${fmtTime(b.minutes)} · ${b.sessions} sessions</div></div>`).join('')}</div></div></div>
 </div></section>`;
}
function catalogLibraryMatch(item,books){
 const exact=seriesKey(item.title);
 return books.find(b=>seriesKey(String(b.title).replace(/\s+\([^()]*#\d+(?:\.\d+)?\)\s*$/,''))===exact)||null;
}
function seriesBookHasFinished(book) {return book.status==='finished'||(Array.isArray(book.read_history)&&book.read_history.some(pass=>pass.status==='finished'));}
function renderSeriesOrder(result,localBooks=[]) {
 if(!result)return '';
 const rows=result.books||[];
 const counted=localBooks.filter(seriesBookHasFinished).length;
 const link=result.url&&isSeriesSourceURL(result.url)?`<a class="series-catalog-link" href="${esc(result.url)}" rel="noopener noreferrer" target="_blank">Full reading order on List Of Books ↗</a>`:'';
 return `<div class="series-catalog-head"><div><div class="eyebrow">CATALOG SERIES DETAILS</div><strong>${esc(result.title)}</strong>${result.author?`<p class="tiny">${esc(result.author)}</p>`:''}</div>
 <div class="series-catalog-total"><strong>${result.totalBooks??'—'}</strong><small>Known catalog books</small></div></div>
 <p class="tiny">${result.order==='reading'?'Suggested reading order':'Publication order'} · ${counted} finished in your library. A catalog count is not proof the author has finished writing the series.</p>
 ${rows.length?`<div class="series-catalog-list">${rows.map(item=>{const ownBook=catalogLibraryMatch(item,localBooks);
   const order=item.number??item.position;return `<div class="series-catalog-book"><span class="series-catalog-num">${order===null?'·':'#'+esc(order)}</span><div class="series-catalog-book-title"><strong>${esc(item.title)}</strong><small>${item.year??'Year unknown'}${item.role&&item.role!=='core'?' · '+esc(item.role):''}</small></div><div>${ownBook?`<button type="button" class="series-catalog-owned" data-action="open-book" data-id="${esc(ownBook.id)}">${esc(ownBook.status==='reading'&&seriesBookHasFinished(ownBook)?'Rereading':statusText[ownBook.status]||ownBook.status)}</button>`:'<span class="series-catalog-missing">Not in library</span>'}</div></div>`}).join('')}</div>`:'<p class="tiny">The catalog has not provided an itemized reading order for this series.</p>'}
 ${result.booksOmitted?`<p class="tiny">${result.booksOmitted} additional catalog entries were omitted. Visit the source for the full list.</p>`:''}
 ${link}`;
}
function renderBookSeriesCatalog(book) {
 const entry=state.seriesBookCatalog[book.id];if(!entry)return '';
 if(entry.error)return `<p class="notice warn series-lookup-error">${esc(entry.error)}</p>`;
 const result=entry.result;if(!result)return '<p class="tiny">No trustworthy series match was found. Keep using the editable fields above.</p>';
 const canUse=proposedSeriesFields(book,result);
 return `<div class="series-catalog-panel"><p class="section-sub">Suggested series data · check title, author, and installment before saving</p>
 ${renderSeriesOrder(result,viewBooks().filter(x=>seriesKey(seriesMetadata(x).series_name)===seriesKey(result.title)))}
 ${canUse&&(!book.series_total||!book.series_name||book.series_number==null)?`<button type="button" class="btn sm" style="margin-top:10px" data-action="series-book-apply" data-id="${esc(book.id)}">${ico('check',13)} Fill missing series fields (review before saving)</button>`:''}
 ${result.books.length<result.totalBooks?`<button type="button" class="btn sm" style="margin-top:10px" data-action="series-book-full" data-id="${esc(book.id)}">Load full reading order</button>`:''}</div>`;
}
function renderInsightSeriesCatalog(group) {
 const entry=state.seriesCatalog[seriesKey(group.name)];if(!entry)return '';
 if(entry.error)return `<p class="notice warn series-lookup-error">${esc(entry.error)}</p>`;
 const result=entry.result;if(!result)return '<p class="tiny">No reliable matching catalog series found.</p>';
 const local=viewBooks().filter(b=>seriesKey(seriesMetadata(b).series_name)===seriesKey(group.name));
 const canFill=local.some(b=>fillMissingSeriesFields(b,result));
 return `<div class="series-catalog-panel">${renderSeriesOrder(result,local)}
 ${canFill&&own()?`<button class="btn sm" data-action="series-apply-group" data-series="${esc(group.name)}">${ico('check',14)} Fill missing series totals in my library</button>`:''}</div>`;
}
async function enrichOneSeriesOnAdd(book){
 try {
  if(!(await isSeriesLookupConfigured()))return;
  const name=seriesMetadata(book).series_name;
  const found=await fetchSeriesLookup(name?{series:name}:{title:book.title,author:book.author});
  const updated=fillMissingSeriesFields(book,found);
  if(!updated)return;
  await repo.save('books',updated);await sync(true);
 }catch(_){/* Book add succeeds even when provider is offline or has no match. */}
}

function renderLibraryAnalytics(){
 const all=viewBooks(),lib=libraryStatistics(all,{today:today()}),eff=completionEfficiency(all,viewSessions(),{today:today(),activityMode:state.insightMode}),shown=eff.slice(0,7);
 const genreMax=Math.max(1,...lib.genres.map(x=>x.books)),maxRate=Math.max(1,...lib.ratings.map(x=>x.count));
 const primary=lib.genres.filter(g=>g.genre!=='Uncategorized').slice(0,10);
 const transitions=tbrTransitions(all),series=seriesStatistics(all,viewSessions());
 const rereads=rereadingStats(viewBooks(),viewSessions());
 const rereadCompare=rereadComparisonStats(viewBooks(),viewSessions(),{today:today()});
 return `<section id="insights-books" class="insight-section"><div class="insight-section-heading"><div class="eyebrow">FROM YOUR SHELVES</div><h2 class="section-title">Books & Library</h2><p class="section-sub">Lifetime library and per-book efficiency · not restricted to current week/month</p></div>
 <div class="card" style="margin-top:13px"><h3 class="small-title">Book completion efficiency</h3><p class="section-sub">Active reading days vs elapsed days, plus average minutes and recorded pages progressed per active day</p>
 <div class="habit-book-table"><div class="habit-book-head"><span>Book</span><span>Active / elapsed</span><span>Minutes / day</span><span>Pages / day</span></div>${shown.map(x=>`<div class="habit-book-line"><span class="habit-book-title">${esc(x.title)}<small>${x.consistency==null?'—':Math.round(x.consistency*100)+'%'} consistency · ${x.sessions} sessions</small></span><span>${x.readingDays} / ${x.elapsedDays}</span><span>${formatRatio(x.minutesPerActiveDay)}</span><span>${formatRatio(x.pagesPerActiveDay)}</span></div>`).join('')||'<p class="text-sm muted">Log sessions and start dates to calculate this metric.</p>'}</div>
 <p class="tiny">Active days count distinct dates; elapsed days run from start to finish (or today). Recorded pages include physical pages and audiobook equivalents, without inventing pages from listening time. Activity filter changes active days, not elapsed days.</p></div>
 <div class="grid2" style="margin-top:15px"><div class="card"><h3 class="small-title">Library by genre · Read vs unread</h3>
 <p class="section-sub">All assigned genres, updated after book/genre/status edits. Each book counts once per assigned genre. Read includes completed books and rereads; unread includes unfinished books.</p>
 <div class="genre-legend"><i class="genre-swatch read"></i> Read <i class="genre-swatch unread"></i> Unread</div>
 ${lib.genres.map(x=>`<div class="genre-breakdown"><button type="button" class="genre-title-button" data-action="open-insight-books" data-drill-kind="genre-all" data-value="${esc(x.genre)}" data-label="${esc(x.genre)} books"><strong>${esc(x.genre)}</strong><span>${x.books} total</span></button>
 <div class="genre-stack" role="group" aria-label="${esc(x.genre)}: ${x.read} read and ${x.unread} unread">
 ${x.read?`<button type="button" class="genre-stack-read" style="width:${(x.read/genreMax*100).toFixed(2)}%" title="Show ${x.read} read ${esc(x.genre)} books" aria-label="Show ${x.read} read ${esc(x.genre)} books" data-action="open-insight-books" data-drill-kind="genre-read" data-value="${esc(x.genre)}" data-label="Read · ${esc(x.genre)}"></button>`:''}
 ${x.unread?`<button type="button" class="genre-stack-unread" style="width:${(x.unread/genreMax*100).toFixed(2)}%" title="Show ${x.unread} unread ${esc(x.genre)} books" aria-label="Show ${x.unread} unread ${esc(x.genre)} books" data-action="open-insight-books" data-drill-kind="genre-unread" data-value="${esc(x.genre)}" data-label="Unread · ${esc(x.genre)}"></button>`:''}</div>
 <div class="genre-count-links"><button type="button" data-action="open-insight-books" data-drill-kind="genre-read" data-value="${esc(x.genre)}" data-label="Read · ${esc(x.genre)}">${x.read} read</button><button type="button" data-action="open-insight-books" data-drill-kind="genre-unread" data-value="${esc(x.genre)}" data-label="Unread · ${esc(x.genre)}">${x.unread} unread</button></div></div>`).join('')||'<p class="text-sm muted">Add genre metadata to see a breakdown.</p>'}</div>
 <div class="card"><h3 class="small-title">Your ratings by genre</h3><p class="section-sub">Average personal rating for each genre · select a bar to see its rated books</p>
 ${primary.length?primary.map(x=>`<button type="button" class="habit-compact-row insight-drill-row" data-action="open-insight-books" data-drill-kind="genre-rating" data-value="${esc(x.genre)}" data-label="Rated books · ${esc(x.genre)}" aria-label="Show ${x.rated} rated books in ${esc(x.genre)}"><strong>${esc(x.genre)}</strong>${habitBar((x.avgRating||0)/5,'#ba9558')}<span>${x.avgRating===null?'—':x.avgRating.toFixed(2)+' ★'} <small>(${x.rated})</small></span></button>`).join(''):'<p class="text-sm muted">No rated books with genres yet.</p>'}
 <p class="tiny">${lib.rated} uniquely rated books · ${lib.averageRating===null?'—':lib.averageRating.toFixed(2)+' ★'} mean rating. The personal rating distribution is shown once above.</p></div></div>
 <div class="card" style="margin-top:15px"><h3 class="small-title">Rereading statistics</h3><p class="section-sub">Explicit second and subsequent reading passes · lifetime totals</p>
 <div class="habit-kpis">${habitCard(rereads.booksReread,'Books reread')}${habitCard(rereads.rereadsStarted,'Rereads started')}${habitCard(rereads.rereadsFinished,'Rereads finished')}${habitCard(fmtTime(rereads.rereadMinutes),'Reread time')}</div>
 <p class="tiny">${rereads.currentlyRereading} currently being reread · ${rereads.rereadSessions} logged reread sessions. Each reread retains its own start and finish dates; original completions are preserved.</p>
 <div class="reread-overview-kpis">${habitCard(rereadCompare.avgFirstMinutes===null?'—':fmtTime(Math.round(rereadCompare.avgFirstMinutes)),'Avg original time')}${habitCard(rereadCompare.avgRereadMinutes===null?'—':fmtTime(Math.round(rereadCompare.avgRereadMinutes)),'Avg latest reread time')}${habitCard(rereadCompare.pairedTimeCount,'Paired, completed books')}${habitCard(rereadCompare.avgFirstSessions===null?'—':rereadCompare.avgFirstSessions.toFixed(1),'Avg first-read sessions')}${habitCard(rereadCompare.avgRereadSessions===null?'—':rereadCompare.avgRereadSessions.toFixed(1),'Avg reread sessions')}${habitCard(rereadCompare.mostCommonSwitch?`${esc(passModeLabel(rereadCompare.mostCommonSwitch.from))} → ${esc(passModeLabel(rereadCompare.mostCommonSwitch.to))}`:'—','Most common method switch')}</div>
 <p class="tiny">Comparison averages use each book’s first read and most recent finished reread and all logged sessions have timed durations (${rereadCompare.pairedTimeCount} qualifying pairs). Sessions and reading modes are compared only where recorded, never estimated from Goodreads dates.</p>
 ${rereadCompare.entries.slice(0,8).map(b=>`<div class="reread-book-report"><div class="rank-top"><strong>${esc(b.title)}</strong><span>${b.rereads.length} reread${b.rereads.length===1?'':'s'}</span></div>${renderRereadComparisonCard(b.original,b.latest)}</div>`).join('')||'<p class="text-sm muted">No rereads logged yet. Open a finished book and select “Start reread” to track another reading pass without losing the original completion.</p>'}
 <p class="tiny">Additional reread passes are compared individually in each book's Read & reread history. Older Goodreads records cannot automatically reveal earlier rereads or session time.</p></div>
 <div class="card" style="margin-top:15px"><h3 class="small-title">TBR aging</h3><p class="section-sub">Days since each book entered your Want to Read shelf</p>
 <div class="habit-kpis">${habitCard(lib.tbr.count,'Books on TBR')}${habitCard(lib.tbr.averageAgeDays===null?'—':Math.round(lib.tbr.averageAgeDays)+' days','Mean TBR age')}${habitCard(lib.tbr.distribution.medianAgeDays===null?'—':Math.round(lib.tbr.distribution.medianAgeDays)+' days','Median TBR age')}${habitCard(lib.tbr.unknown,'Unknown added date')}</div>
 <h4 class="small-title" style="margin:18px 0 6px">Distribution of days on TBR</h4><p class="section-sub">Number of books in each waiting-time range · ${lib.tbr.known} books with usable dates</p>
 <div class="tbr-age-distribution" role="group" aria-label="Distribution of days books have been on the TBR shelf">
 ${lib.tbr.distribution.buckets.map(bucket=>`<button type="button" class="tbr-age-row insight-drill-row" data-action="open-insight-books" data-drill-kind="tbr-age" data-value="${esc(bucket.id)}" data-label="TBR waiting ${esc(bucket.label)}" aria-label="See ${bucket.count} books on TBR for ${esc(bucket.label)}"><span class="tbr-age-label">${esc(bucket.label)}</span><div class="tbr-age-track"><span class="tbr-age-fill" style="width:${bucket.count/Math.max(1,...lib.tbr.distribution.buckets.map(b=>b.count))*100}%"></span></div><strong class="tbr-age-count">${bucket.count}<small>${Math.round(bucket.share*100)}%</small></strong></button>`).join('')}
 </div>
 <p class="tiny">${lib.tbr.distribution.estimated?`${lib.tbr.distribution.estimated} dated books use approximate dates from Goodreads Date Added or record creation. `:''}${lib.tbr.unknown?`${lib.tbr.unknown} undated books are excluded from the distribution. `:''}No dates or waiting times are invented.</p>
 <div class="cardline"></div><h4 class="small-title">Oldest books on TBR</h4>
 ${lib.tbr.oldest.map(x=>`<div class="rank-row"><div class="rank-top"><strong>${esc(x.title)}</strong><span>${x.ageDays} days</span></div><div class="tiny">Reference date ${esc(x.addedOn)}${x.source!=='tbr_added_on'?' · approximate':''}</div></div>`).join('')||'<p class="tiny">No dated TBR entries yet.</p>'}
 <p class="tiny">TBR added date is used when known. Otherwise a Goodreads Date Added or local record creation date is an explicitly marked proxy; neither proves the original TBR entry date.</p></div>
 <div class="card" style="margin-top:15px"><h3 class="small-title">From TBR to reading and finished</h3>
 <p class="section-sub">Wait time from the saved TBR date to first known reading start or completion. Based on historical dates, not your active reading session timer.</p>
 <div class="habit-kpis">${habitCard(transitions.overall.meanToStart===null?'—':Math.round(transitions.overall.meanToStart)+' days','Average TBR → started')}${habitCard(transitions.overall.meanToFinish===null?'—':Math.round(transitions.overall.meanToFinish)+' days','Average TBR → finished')}${habitCard(transitions.overall.toStartCount,'Books with start dates')}${habitCard(transitions.overall.toFinishCount,'Books with finish dates')}</div>
 <div class="tbr-transition-table"><div class="tbr-transition-head"><strong>Genre</strong><strong>To started</strong><strong>To finished</strong></div>
 ${transitions.byGenre.map(x=>`<div class="tbr-transition-row"><strong>${esc(x.genre)}</strong><span>${x.meanToStart===null?'—':Math.round(x.meanToStart)+'d'} <small>(${x.toStartCount})</small></span><span>${x.meanToFinish===null?'—':Math.round(x.meanToFinish)+'d'} <small>(${x.toFinishCount})</small></span></div>`).join('')||'<p class="tiny">Add TBR and first-reading/finish dates to see transitions.</p>'}</div>
 <p class="tiny">Means use only books with usable start/finish dates; ${transitions.overall.approximateCount} books use an approximate starting date. Goodreads Date Added is not always the true TBR start; unknown and negative intervals are excluded. A book tagged with multiple genres appears in each genre row but only once in the overall total.</p></div>
 <div class="card" style="margin-top:15px"><h3 class="small-title">Series progress & reading patterns</h3><p class="section-sub">Series order from Goodreads titles such as “Dune (Dune #1)” or editable Book Details metadata.</p>
 <div class="habit-kpis">${habitCard(series.fullSeries,'All known volumes read')}${habitCard(series.startedNotComplete,'Started, not confirmed complete')}${habitCard(series.tracked,'Series in library')}${habitCard(series.unverified,'Started · total unknown')}</div>
 ${series.series.map(x=>`<details class="series-card" ${state.seriesOpen===seriesKey(x.name)?'open':''}><summary><span><strong>${esc(x.name)}</strong><small>${x.finishedCount} finished · ${x.trackedCount} tracked installments${x.expectedTotal?' of '+x.expectedTotal+' known main books':' · total unknown'}${x.inconsistentTotals?' · conflicting totals':''}</small></span><span class="series-status">${x.fullyRead?'✓ Fully read':x.started?'In progress':'Not started'}</span></summary>
 <div class="series-installments">${x.rows.map(b=>`<div class="series-installment"><button type="button" data-action="open-book" data-id="${esc(b.bookId)}"><strong>#${esc(b.number)} ${esc(b.title)}</strong></button><span>${esc(statusText[b.status]||b.status)}</span><span>${b.rating===null?'Unrated':b.rating.toFixed(2)+' ★'}</span>
 <div class="series-rating-track" title="${b.rating===null?'No rating':b.rating+' stars'}"><i style="width:${(b.rating||0)/5*100}%"></i></div>
 <div class="series-mode-chart" aria-label="Reading modes by recorded minutes">${[['reading','#568468'],['audiobook','#557fa0'],['read_listen','#b28a56']].map(([mode,color])=>{const m=b.speed[mode].minutes;return m>0?`<i style="width:${b.speed.overall.minutes?m/b.speed.overall.minutes*100:0}%;background:${color}" title="${esc(activityModes[mode])}: ${Math.round(m)} measured minutes"></i>`:''}).join('')}</div>
 <small>${b.speed.overall.pagesPerHour==null?'Speed unavailable':b.speed.overall.pagesPerHour.toFixed(1)+' pg/hr'} · ${b.sessions} logs</small></div>`).join('')}</div>
 <div class="series-catalog-toolbar"><button class="btn sm" type="button" data-action="series-lookup" data-series="${esc(x.name)}" ${state.seriesLoading===seriesKey(x.name)?'disabled':''}>${ico('search',14)} ${state.seriesLoading===seriesKey(x.name)?'Looking up…':'Explore complete series'}</button>${x.sourceURL&&isSeriesSourceURL(x.sourceURL)?`<a href="${esc(x.sourceURL)}" target="_blank" rel="noopener noreferrer">Series source ↗</a>`:''}</div>
 ${renderInsightSeriesCatalog(x)}
 <p class="tiny">Rating bars show each installment's personal rating. The colored bars distinguish reading (green), audiobook (blue), and Read + Listen (amber), using only sessions with measured page progress. Speed is weighted recorded pages per hour. Missing logs do not produce invented values.</p></details>`).join('')||'<p class="tiny">No series detected yet. Series information from Goodreads export title suffixes is mapped on import; edit name, order, or known total in Book Details.</p>'}
 <p class="tiny">“All known volumes read” requires a confirmed or source-attributed installment count and completed main installments #1 through that count. It does not mean the author has declared the series finished. External lookup is optional and cannot overwrite manually entered totals.</p></div></section>`;
}
function renderInsights(){
 const spec=periodSpec(),entries=periodSessions(),mins=sum(entries,'duration_minutes'),pages=sum(entries,'pages_read'),st=streaks();
 const speedSessions=sessionsInReportingPeriod(viewSessions().filter(s=>state.insightBook==='all'||s.user_book_id===state.insightBook),{periodStart:spec.start,periodEnd:spec.end,today:today(),trackingStart:activeAccountStartDate()});
 const pageEntries=entries.filter(x=>x.pages_read!=null && modeOf(x)!=='audiobook'),pageMinutes=sum(pageEntries,'duration_minutes'),periodPageTotals=pageTotals(entries);
 const modeTotals=Object.fromEntries(Object.keys(activityModes).map(mode=>[mode,sum(entries.filter(s=>modeOf(s)===mode),'duration_minutes')]));
 const allBooks=viewBooks(),complete=completedBooksInYear(allBooks,state.insightYear);
 const goal=viewGoals().find(g=>g.year===state.insightYear)?.books_target||12,pct=Math.min(100,Math.round(complete.length/goal*100));
 // Daily goal always measures all activity modes together, even with a book/mode filter.
 const dailyTarget=targetForDate(today());
 const dailyGoal=dailyReadingGoalStats(viewSessions(),{targetMinutes:30,goalHistory:effectiveGoalHistory(),today:today(),activeFrom:activeAccountStartDate()});
 const periodDailyGoal=dailyReadingGoalStats(viewSessions(),{targetMinutes:30,goalHistory:effectiveGoalHistory(),today:today(),
  periodStart:spec.start,periodEnd:spec.end,activeFrom:activeAccountStartDate()});
 const goalPercent=Math.min(100,Math.round(100*dailyGoal.todayMinutes/dailyTarget));
 const periodBooks=[...new Set(entries.map(s=>s.user_book_id))].map(id=>bookById(id)).filter(Boolean);
 const top=allBooks.map(b=>({b,...bookActivitySummary(entries,{bookId:b.id})})).filter(x=>x.minutes>0).sort((a,b)=>b.minutes-a.minutes);
 const insightBookColors=bookChartColors(allBooks,entries);
 const rated=allBooks.filter(b=>b.rating!=null),ratings=new Map();rated.forEach(b=>ratings.set(Number(b.rating),(ratings.get(Number(b.rating))||0)+1));
 const rankMax=Math.max(1,...top.map(x=>x.minutes)),rateMax=Math.max(1,...ratings.values());
 const insightHeader=`<div class="eyebrow">YOUR READING PATTERNS</div><h1 class="heading">Reading Insights</h1><p class="subtitle">Your reading at a glance, or in full detail.</p>
 <div class="segmented insights-view-toggle" role="group" aria-label="Insights detail level"><button type="button" class="seg-btn ${state.insightsView==='summary'?'active':''}" data-insights-view="summary">Quick summary</button><button type="button" class="seg-btn ${state.insightsView==='detailed'?'active':''}" data-insights-view="detailed">Detailed insights</button></div>
 <div class="toolbar space"><div class="segmented">${[['week','This Week'],['month','This Month'],['year','This Year · Monthly']].map(([id,label])=>`<button class="seg-btn ${state.period===id?'active':''}" data-period="${id}">${label}</button>`).join('')}</div>
 <div class="inline">${state.period==='year'?`<select class="select" id="insight-year" aria-label="Year" style="width:100px">${Array.from({length:7},(_,i)=>getYear()-i).map(y=>`<option ${state.insightYear===y?'selected':''}>${y}</option>`).join('')}</select>`:''}
 <select id="insight-book" class="select" aria-label="Filter by book" style="max-width:220px"><option value="all">All books</option>${viewBooks().map(b=>`<option value="${esc(b.id)}" ${state.insightBook===b.id?'selected':''}>${esc(b.title)}</option>`).join('')}</select><select id="insight-mode" class="select" aria-label="Filter reading mode" style="max-width:175px">${modeOptions(state.insightMode)}</select></div></div>
 <p class="section-sub" style="margin:-7px 0 17px">${esc(spec.label)} · ${state.period==='year'?'12 calendar months':state.period==='week'?'Sunday to Saturday':'Daily totals for the calendar month'}${activeAccountStartDate()?` · Tracking since ${esc(fmtDate(activeAccountStartDate()))}`:''}</p>`;
 if(state.insightsView==='summary'){
   const lead=top[0],dailyGoalDays=periodDailyGoal.evaluatedDays,readDays=unique(entries,s=>s.session_date);
   return `${insightHeader}<section class="insights-quick"><div class="eyebrow">AT A GLANCE</div><h2 class="section-title">${esc(spec.label)} snapshot</h2>
     <div class="kpis summary-kpis">${metricCard(fmtTime(mins),'Reading time')}${metricCard(pages.toLocaleString(),'Pages progressed')}${metricCard(readDays,'Days with activity')}${metricCard(entries.length,'Sessions')}
     ${metricCard(`${periodDailyGoal.daysMet}/${dailyGoalDays}`,'Goal days met')}${metricCard(periodBooks.length,'Books read this period')}</div>
     <div class="grid2 summary-spotlights"><div class="card"><h3 class="small-title">Daily reading goal</h3><p class="section-sub">All reading methods count toward your goal</p>
       <div class="goal-number">${fmtTime(dailyGoal.todayMinutes)} <span>of ${dailyTarget} minutes today</span></div><div class="progress" style="margin:13px 0"><div style="width:${goalPercent}%"></div></div>
       <p class="tiny">${dailyGoal.currentGoalStreak} day current goal streak · ${periodDailyGoal.daysMet} of ${dailyGoalDays} tracked days met their goal</p></div>
     <div class="card"><h3 class="small-title">Most-read book</h3>${lead?`<div class="summary-book">${cover(lead.b,'small')}<div><strong>${esc(lead.b.title)}</strong><p class="tiny">${fmtTime(lead.minutes)} · ${lead.sessions} sessions · ${lead.readingDays} reading days</p></div></div>`:'<p class="section-sub">No reading sessions in this period yet.</p>'}
       <div class="cardline"></div><p class="tiny">${complete.length} books finished this year · ${Math.round(pct)}% of the ${goal}-book annual goal</p></div></div>
     <div class="card"><div class="cardhead"><div><h3 class="small-title">Reading activity by book</h3><p class="section-sub">${state.metric==='minutes'?'Minutes':'Pages'} per ${state.period==='year'?'month':'day'} · values shown above bars</p></div>
       <div class="segmented"><button class="seg-btn ${state.metric==='minutes'?'active':''}" data-metric="minutes">Time</button><button class="seg-btn ${state.metric==='pages'?'active':''}" data-metric="pages">Pages</button></div></div>${activityChart(entries,spec)}</div>
     <button class="btn primary summary-detail-button" data-insights-view="detailed">Explore detailed Insights ${ico('arrow',15)}</button></section>`;
 }
 return `${insightHeader}<nav class="insight-subnav" aria-label="Insights sections"><a href="#insights-overview">Overview</a><a href="#insights-habits">Habits</a><a href="#insights-performance">Performance</a><a href="#insights-books">Books &amp; Library</a></nav>
 <div id="insights-overview"></div><div class="kpis">
 ${metricCard(fmtTime(mins),'Reading time')}${metricCard(pages.toLocaleString(),'Pages progressed')}${metricCard(periodBooks.length,'Books read')}
 ${metricCard(unique(entries,s=>s.session_date),'Active days')}${metricCard(entries.length,'Reading sessions')}${metricCard(pageMinutes?(periodPageTotals.physical/(pageMinutes/60)).toFixed(1):'—','Read pages / hour')}
 ${metricCard(periodPageTotals.physical.toLocaleString(),'Physical read pages')}${metricCard(periodPageTotals.audioEquivalent.toLocaleString(),'Audiobook page-equivalents')}
 </div>
 <div class="card" style="margin-bottom:15px"><h2 class="section-title">Activity by reading mode</h2><p class="section-sub">Listening and combined sessions are labeled separately; combined minutes are counted once.</p><div class="kpis" style="margin-top:12px">${Object.entries(activityModes).map(([id,label])=>metricCard(fmtTime(modeTotals[id]),label)).join('')}</div></div>
 <div class="card"><div class="cardhead"><div><h2 class="section-title">Reading activity by book</h2><p class="section-sub">${state.period==='year'?'Monthly stacked totals':'Daily stacked totals'} for ${state.insightBook==='all'?'all titles':esc(bookById(state.insightBook)?.title||'selected book')}</p></div>
 <div class="segmented"><button class="seg-btn ${state.metric==='minutes'?'active':''}" data-metric="minutes">Time</button><button class="seg-btn ${state.metric==='pages'?'active':''}" data-metric="pages">Pages</button></div></div>
 ${activityChart(entries,spec)}</div>
 <div id="insights-performance" class="insight-section-heading"><div class="eyebrow">PACE & EFFICIENCY</div><h2 class="section-title">Reading Performance</h2></div>
 ${renderReadingSpeedInsights(speedSessions,spec)}
 ${renderBookDaysInsight()}
 <div class="card goal" style="margin-top:15px"><div class="cardhead"><div><div class="eyebrow">${state.insightYear} READING CHALLENGE</div><h2 class="section-title">Annual reading goal</h2><p class="section-sub">Distinct books finished in the selected year, including Goodreads imports and historical rereads. Tracking start only limits session-based metrics.</p></div>
 ${own()?`<div class="formfield" style="max-width:120px"><label for="annual-goal">Books target</label><input class="input" id="annual-goal" type="number" min="1" max="10000" step="1" value="${goal}"/></div>`:`<span class="status-pill">${goal} books target</span>`}</div>
 <div class="goal-number">${complete.length} <span>of ${goal} books completed</span></div><div class="progress" style="height:11px;margin:12px 0"><div style="width:${pct}%"></div></div>
 <div class="inline" style="justify-content:space-between;font-size:12px"><span>${Math.max(0,goal-complete.length)} books remaining</span><strong>${pct}% complete</strong></div>
 ${own()?`<button class="btn sm" data-action="save-goal" style="margin-top:13px">Save annual target</button>`:''}
 ${complete.length?`<div class="inline" style="margin-top:15px">${complete.map(b=>{
 const pass=readingPasses(b).find(x=>x.status==='finished'&&Number(x.finished_year||x.finished_on?.slice(0,4))===Number(state.insightYear));
 return `<span class="status-pill finished">${esc(b.title)} · ${pass?.finished_on?esc(fmtDate(pass.finished_on)):esc(String(state.insightYear))+' (year only)'}</span>`;
 }).join('')}</div>`:'<p class="tiny" style="margin-top:10px">Finished books with a completion year or date count even if they were imported before session tracking began.</p>'}
 </div>
 <div class="card daily-goal-card" style="margin-top:15px"><div class="cardhead"><div><div class="eyebrow">ALL ACTIVITY TYPES</div><h2 class="section-title">Daily reading-time goal</h2><p class="section-sub">Reading, audiobook and Read + Listen minutes count once per session</p></div>
 ${own()?`<div class="formfield daily-target-field"><label for="daily-goal-minutes">Minutes / day</label><input class="input" id="daily-goal-minutes" type="number" inputmode="numeric" min="1" max="1440" step="1" value="${dailyTarget}"/></div>`:`<span class="status-pill">${dailyTarget} min/day</span>`}</div>
 <div class="daily-goal-top"><div><div class="goal-number">${fmtTime(dailyGoal.todayMinutes)} <span>of ${dailyTarget} min today</span></div><p class="tiny">${dailyGoal.metToday?'Goal achieved today!':`${dailyGoal.remainingMinutes} minutes remaining today`}</p></div><div class="daily-goal-status">${goalPercent}%</div></div>
 <div class="progress" style="height:11px;margin:12px 0"><div style="width:${goalPercent}%"></div></div>
 <div class="daily-goal-stats"><span><strong>${periodDailyGoal.daysMet} / ${periodDailyGoal.evaluatedDays}</strong> days met goal in selected calendar period</span><span><strong>${dailyGoal.currentGoalStreak}</strong> goal streak days</span><span><strong>${dailyGoal.longestGoalStreak}</strong> best goal streak this year</span></div>
 ${own()?`<button class="btn sm" data-action="save-daily-goal" style="margin-top:13px">Save daily goal</button>`:''}
 <p class="tiny" style="margin-top:12px">Daily goal evaluation starts on your tracking start date (Settings), not account creation. The goal ignores book and activity filters. The goal streak is separate from your regular reading streak. Changing your minute target affects today and future days; historical targets stay unchanged.</p></div>
 ${goalVsActualChart(spec)}
 <div class="grid2" style="margin-top:15px"><div class="card"><h2 class="section-title">Reading streaks</h2><p class="section-sub">Consecutive days with a logged session</p><div class="inline" style="gap:40px;margin:19px 0 8px"><div><div class="kpi-num">${st.current}</div><div class="kpi-label">Current days</div></div><div><div class="kpi-num">${st.best}</div><div class="kpi-label">Longest days</div></div></div><p class="tiny">Multiple sessions on one day count as one active day.</p></div>
 <div class="card"><h2 class="section-title">Reading consistency</h2><p class="section-sub">Daily minutes across all activity types · Past 12 weeks</p>${heatmap()}</div></div>
 ${renderHabitsInsights(entries,spec,speedSessions)}
 <div class="insight-section-heading" style="margin-top:20px"><h2 class="section-title">Books &amp; Library overview</h2></div>
 <div class="grid2" style="margin-top:15px"><div class="card"><h2 class="section-title">Most-read books</h2><p class="section-sub">Ranked by reading time · sessions and distinct reading days in the selected period</p>
 ${top.length?top.slice(0,6).map(x=>`<div class="rank-row"><div class="rank-top"><strong>${esc(x.b.title)}</strong><span>${fmtTime(x.minutes)}</span></div><div class="bar-track"><div class="bar-fill" style="width:${x.minutes/rankMax*100}%;background:${insightBookColors.get(String(x.b.id))||"#7b9386"}"></div></div><div class="rank-activity"><span>${x.sessions} session${x.sessions===1?'':'s'}</span><span>${x.readingDays} reading day${x.readingDays===1?'':'s'}</span></div><div class="tiny" style="margin-top:5px">${x.pages} pages progressed · ${(()=>{const ps=entries.filter(s=>s.user_book_id===x.b.id&&s.pages_read!=null&&modeOf(s)!=='audiobook'),pm=sum(ps,'duration_minutes');return pm?(sum(ps,'pages_read')/(pm/60)).toFixed(1):'—';})()} read pages/hour</div></div>`).join(''):'<p class="text-sm muted">No activity in this period.</p>'}<p class="tiny" style="margin-top:10px">Sessions count each reading or listening log; reading days count distinct calendar dates. Both respect the period, book, and activity filters.</p></div>
 <div class="card"><h2 class="section-title">Personal rating distribution</h2><p class="section-sub">Quarter-star precision · ${rated.length} rated books · select any rating to see its books</p>
 ${[...ratings].sort((a,b)=>a[0]-b[0]).map(([rating,count])=>`<button type="button" class="rate-row insight-drill-row" data-action="open-insight-books" data-drill-kind="rating" data-value="${rating}" data-label="Books rated ${rating.toFixed(2)} stars" aria-label="Show ${count} books rated ${rating.toFixed(2)} stars"><strong style="width:55px">${rating.toFixed(2)} ★</strong><div class="rate-track"><div class="rate-fill" style="width:${count/rateMax*100}%"></div></div><strong>${count}</strong></button>`).join('')||'<p class="text-sm muted">Rate books in your library to see a distribution.</p>'}
 <div class="cardline"></div><p class="text-sm">${allBooks.filter(b=>b.favorite).length} Favorites · ${rated.length?(sum(rated,'rating')/rated.length).toFixed(2):'—'} average rating</p>
 </div></div>
 ${renderLibraryAnalytics()}
 <p class="tiny" style="margin-top:15px">Pages progressed includes separately labeled physical-reading pages and audiobook-only print-edition page-equivalents. Read pages/hour excludes audiobook-only sessions; audio-position logs have no page count. No average chapter guesses or unique-books-per-day chart.</p>`;
}
function shelfBook(book,i,prefs){
 const thickness=Math.max(9,Math.min(33,Math.round(book.thickness_mm?Number(book.thickness_mm)*.62:9+num(book.page_count)/75)));
 const height=Math.max(104,Math.min(158,Math.round(book.height_mm?Number(book.height_mm)*.62:102+Math.min(46,num(book.page_count)/23))));
 const mode=prefs.display_mode==='mix'?(i%4===2?'spines':'covers'):prefs.display_mode;
 const color=book.demo_color||hashColor(book.title);
 return `<button draggable="${own()?'true':'false'}" class="shelf-book ${mode==='spines'?'spine':''}" data-action="open-book" data-id="${esc(book.id)}" data-drag-book="${esc(book.id)}"
 style="--thick:${thickness}px;--book-color:${color};--ink-color:#f6eacf;height:${height}px" title="${esc(book.title)} · ${book.page_count||'Unknown'} pages · ${ownedModes(book.id).map(m=>activityModes[m]).join(', ')||'Unlogged'}">
 ${mode==='spines'?`<span class="spine-text">${esc(book.title)}</span>`:cover(book)}</button>`;
}
function renderShelf(){
 const prefs=viewPrefs();let list=viewBooks();const filters=[['all','All books'],['favorites','Favorites'],['tbr','TBR'],['reading','Reading'],['finished','Finished'],['dnf','DNF']];
 if(state.shelfFilter==='favorites')list=list.filter(b=>b.favorite);else if(state.shelfFilter!=='all')list=list.filter(b=>b.status===state.shelfFilter);
 if(state.shelfMode!=='all')list=list.filter(b=>ownedModes(b.id).includes(state.shelfMode));
 // Default shelves prioritize Favorites, then Currently Reading, before the rest.
 // Explicit filters still work, and each page is exactly three physical tiers.
 list.sort((a,b)=>(a.favorite?0:a.status==='reading'?1:2)-(b.favorite?0:b.status==='reading'?1:2)
   ||(a.shelf_order||0)-(b.shelf_order||0)||String(a.title).localeCompare(String(b.title)));
 const shelfPages=Math.max(1,Math.ceil(list.length/9));state.shelfPage=Math.min(Math.max(0,state.shelfPage),shelfPages-1);
 const visible=list.slice(state.shelfPage*9,(state.shelfPage+1)*9),tiers=3;
 let rows='';for(let i=0;i<tiers;i++){
   const chunk=visible.slice(i*3,i*3+3),decor=prefs.decor==='minimal'?'':prefs.decor==='plant'?'🪴':['🪴','🕯️','🖼️'][i%3];
   rows+=`<div class="shelf-tier">${chunk.map((b,j)=>shelfBook(b,i*3+j,prefs)).join('')}${decor?`<span class="shelf-decor" aria-label="Decoration">${decor}</span>`:''}</div>`;
 }
 return `<div class="eyebrow">YOUR HOME LIBRARY</div><h1 class="heading">The Bookshelf</h1><p class="subtitle">Your collection, arranged with real covers, variable book sizes, and cozy decorations.</p>
 <div class="shelf-controls"><select class="select" id="shelf-filter" style="width:auto"><option value="all">All books</option>${filters.slice(1).map(([id,label])=>`<option value="${id}" ${state.shelfFilter===id?'selected':''}>${label}</option>`).join('')}</select>
 <select class="select" id="shelf-mode-filter" aria-label="Filter shelf by reading mode" style="width:auto">${modeOptions(state.shelfMode)}</select>
 <select class="select" id="shelf-finish" aria-label="Wood finish" style="width:auto" ${!own()?'disabled':''}>${[['walnut','Walnut'],['oak','Light Oak'],['slate','Slate']].map(([id,label])=>`<option value="${id}" ${prefs.finish===id?'selected':''}>${label}</option>`).join('')}</select>
 <select class="select" id="shelf-mode" aria-label="Book display mode" style="width:auto" ${!own()?'disabled':''}>${[['mix','Mixed'],['covers','Show covers'],['spines','Show spines']].map(([id,label])=>`<option value="${id}" ${prefs.display_mode===id?'selected':''}>${label}</option>`).join('')}</select>
 <select class="select" id="shelf-decor" aria-label="Shelf decoration" style="width:auto" ${!own()?'disabled':''}>${[['cozy','Cozy decor'],['plant','Plants'],['minimal','No decor']].map(([id,label])=>`<option value="${id}" ${prefs.decor===id?'selected':''}>${label}</option>`).join('')}</select></div>
 <div class="shelf-box ${esc(prefs.finish)}">${rows}</div>
 ${shelfPages>1?`<div class="shelf-page-controls" aria-label="Bookshelf pages"><button type="button" class="btn sm" data-action="shelf-prev" ${state.shelfPage===0?'disabled':''}>${ico('left',14)} Previous</button><span>Page ${state.shelfPage+1} of ${shelfPages}</span><button type="button" class="btn sm" data-action="shelf-next" ${state.shelfPage>=shelfPages-1?'disabled':''}>Next ${ico('right',14)}</button></div>`:''}
 ${!list.length?'<p class="notice warn">This shelf has no books yet. Mark books as Favorites or choose another shelf above.</p>':''}
 <p class="tiny" style="margin:17px 0">${visible.length} of ${list.length} books shown, across three shelves per page. Favorites and Currently Reading appear first. Physical height and thickness are proportional to edition measurements when provided; otherwise the bookshelf uses approximate *visual* sizes from page counts. Reading pages are never estimated. ${own()?'Drag books to rearrange on desktop, or use Move Left / Right after selecting a book.':''}</p>
 ${own()&&list.length?`<div class="card soft"><h2 class="section-title">Arrange your collection</h2><p class="section-sub">Choose a book to shift its position on the shelf.</p><div class="toolbar" style="margin-top:12px"><select id="shelf-move-book" class="select" style="max-width:290px">${list.map(b=>`<option value="${esc(b.id)}">${esc(b.title)}</option>`).join('')}</select>
 <button class="btn sm" data-action="shelf-left">${ico('left',14)} Move left</button><button class="btn sm" data-action="shelf-right">Move right ${ico('right',14)}</button></div></div>`:''}`;
}
function renderSettings(){
 const profile=profileById(state.user?.id),me=state.user.id;
 const outgoing=(state.data.shares||[]).filter(s=>s.owner_id===me);
 const incoming=(state.data.shares||[]).filter(s=>s.viewer_id===me);
 return `<div class="eyebrow">PERSONALIZATION & SHARING</div><h1 class="heading">Settings</h1><p class="subtitle">Your personal library stays yours. Grant Full or Summary-only access to individual people.</p>
 <div class="grid2"><div class="card"><h2 class="section-title">Your account</h2><p class="section-sub">Only you can modify your books, sessions, goals and virtual bookshelf.</p>
 <div class="formfield" style="margin-top:15px"><label for="setting-name">Display name</label><input id="setting-name" class="input" value="${esc(profile.display_name)}"/></div>
 <button class="btn primary" data-action="save-profile" style="margin-top:12px">Save profile</button>
 <div class="cardline"></div><div class="formfield"><label for="setting-tracking-start">Tracking start date</label>
 <input id="setting-tracking-start" class="input" type="date" max="${today()}" value="${esc(profileTrackingStart(profile)||today())}" style="max-width:230px"/>
 <p class="tiny" style="margin-top:8px">Weekly, monthly and year-to-date reading metrics, plus daily goal progress, begin on this date. Earlier sessions and book history stay saved. This date is separate for each account.</p>
 <label for="setting-tracking-goal" style="margin-top:14px;display:block">Starting daily goal (minutes)</label>
 <input id="setting-tracking-goal" class="input" type="number" inputmode="numeric" min="1" max="1440" step="1" value="${esc(profile.tracking_start_goal_minutes??targetForDate(today()))}" style="max-width:145px"/>
 <p class="tiny" style="margin-top:7px">The daily goal in effect when tracking begins. This fixes the earlier-day gap when you move your tracking date backward. Later dated goal changes remain unchanged.</p></div>
 <button class="btn" data-action="save-tracking-start" style="margin-top:12px">Save tracking start date</button>
 ${repo.mode==='cloud'?`<div class="cardline"></div><div class="text-sm muted">Signed in as ${esc(state.user.email||'')}</div><button class="btn" data-action="signout" style="margin-top:10px">Sign out</button>`:`<div class="notice warn" style="margin-top:15px"><strong>Local demo:</strong> Changes stay in this browser and are not synchronized. Configure Supabase for real accounts.</div><button class="btn sm" data-action="demo-switch" style="margin-top:8px">Switch demo identity</button>`}</div>
 <div class="card"><h2 class="section-title">Invite another reader</h2><p class="section-sub">Each person signs up for their own account. Share your profile at the access level you choose.</p>
 <div class="formfield" style="margin-top:16px"><label for="share-invite-level">What may this person see?</label>
 <select id="share-invite-level" class="select"><option value="summary">Summary only · totals, goals and modes, no book titles</option><option value="full">Full · library, reading logs, bookshelves and Insights</option></select></div>
 <button class="btn primary" data-action="share-invite" style="margin-top:12px">Generate one-use invitation</button>
 ${state.latestShareInvite?`<div class="notice" style="margin-top:12px"><label>Copy this one-use code (valid for 7 days)</label><div class="inline"><input id="share-invite-display" class="input" readonly value="${esc(state.latestShareInvite)}"/><button class="btn sm" data-action="copy-share-invite">${ico('copy',14)} Copy</button></div></div>`:''}
 <div class="cardline"></div><div class="formfield"><label for="accept-share-code">Have someone's invite code?</label><div class="inline"><input id="accept-share-code" class="input" placeholder="Paste a one-use code"/><button class="btn" data-action="redeem-share">Join</button></div></div>
 <p class="tiny" style="margin-top:11px">Sharing is directional: accepting a code lets you view the sender at their chosen level. To let them view your profile, generate a code for them in return.</p></div></div>
 <div class="grid2" style="margin-top:15px"><div class="card"><h2 class="section-title">People who can see you</h2><p class="section-sub">Change or revoke each person's access at any time.</p>
 ${outgoing.map(sh=>`<div class="session-breakdown"><div class="inline" style="justify-content:space-between;flex-wrap:wrap"><strong>${esc(profileById(sh.viewer_id).display_name==='Reader'?'Reader '+sh.viewer_id.slice(0,8):profileById(sh.viewer_id).display_name)}</strong><select class="select" data-share-viewer="${esc(sh.viewer_id)}" aria-label="Access level" style="max-width:178px"><option value="full" ${sh.access_level==='full'?'selected':''}>Full access</option><option value="summary" ${sh.access_level==='summary'?'selected':''}>Summary only</option><option value="none">Revoke access</option></select></div></div>`).join('')||'<p class="notice">You have not shared your profile yet.</p>'}
 <p class="tiny">Revoking removes their future access; it cannot erase screenshots or exports someone previously saved.</p></div>
 <div class="card"><h2 class="section-title">Profiles shared with you</h2><p class="section-sub">Read-only access; you can never edit someone else's data.</p>
 ${incoming.map(sh=>`<div class="session-breakdown"><strong>${esc(profileById(sh.owner_id).display_name)}</strong> <span class="status-pill">${sh.access_level==='full'?'Full library':'Summary only'}</span></div>`).join('')||'<p class="notice">No one has shared a profile with you yet.</p>'}
 <p class="tiny">Only Full access includes book titles, individual ratings, activity logs, Favorites titles and bookshelf arrangements. Summary-only displays whitelisted aggregate metrics without raw records.</p></div></div>
 <div class="grid2" style="margin-top:15px"><div class="card"><h2 class="section-title">Import and backup</h2><p class="section-sub">Your own reading records are yours to export.</p>
 <div class="toolbar" style="margin-top:15px"><button class="btn" data-action="import-modal">${ico('upload',16)} Import Goodreads CSV</button><button class="btn" data-action="export-json">${ico('download',16)} Export my data</button><button class="btn" data-action="export-csv">${ico('download',16)} Export books CSV</button></div>
 <p class="tiny">Backup contains your book metadata (including reread history), labeled sessions (including audio position), exact chapters, goals and shelf settings. It does not export other people's records.</p></div>
 <div class="card"><h2 class="section-title">Install on your phones</h2><p class="section-sub">Use this single web address on any phone.</p><div class="text-sm" style="line-height:1.85;margin-top:12px"><strong>iPhone:</strong> Safari → Share → Add to Home Screen → Open as Web App.<br/><strong>Android:</strong> Chrome → Menu → Install app or Add to Home Screen.<br/><strong>Desktop:</strong> Open your site in a browser.</div>
 <p class="tiny" style="margin-top:11px">Cloud sync and book search require internet. App shell may load offline after installation.</p></div></div>
 ${repo.mode==='demo'?`<div class="card" style="margin-top:15px"><h2 class="section-title">Demo controls</h2><p class="section-sub">Reset the sample data in this browser.</p><button class="btn danger" data-action="reset-demo" style="margin-top:10px">Reset interactive demo</button></div>`:''}`;
}
function modalShell(title,body,footer=''){
 return `<div class="modal-backdrop" data-action="close-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-head"><h2>${esc(title)}</h2><button class="btn icon-only" data-action="close-modal" aria-label="Close dialog">${ico('x')}</button></div>
 <div class="modal-body">${body}</div>${footer?`<div class="modal-foot">${footer}</div>`:''}</section></div>`;
}
function renderAuth(){
 return `<div class="login-wrap"><form class="auth-card" id="auth-form"><div class="auth-head"><img src="/assets/icon.svg" alt=""/><h1>My Reading Room</h1><p>Two separate accounts. One shared place to discover, track and enjoy your books.</p></div>
 <div class="segmented" style="display:flex;margin-bottom:18px"><button class="seg-btn ${state.authMode==='signin'?'active':''}" type="button" data-authmode="signin" style="flex:1">Sign in</button><button class="seg-btn ${state.authMode==='signup'?'active':''}" type="button" data-authmode="signup" style="flex:1">Create account</button></div>
 ${state.authMode==='signup'?`<div class="formfield" style="margin-bottom:13px"><label for="auth-name">Display name</label><input id="auth-name" class="input" autocomplete="nickname" placeholder="How should your name appear?" required/></div>`:''}
 <div class="formfield" style="margin-bottom:13px"><label for="auth-email">Email</label><input id="auth-email" class="input" type="email" autocomplete="email" required/></div>
 <div class="formfield" style="margin-bottom:18px"><label for="auth-password">Password</label><input id="auth-password" class="input" type="password" minlength="6" autocomplete="${state.authMode==='signup'?'new-password':'current-password'}" required/></div>
 <button class="btn primary block" type="submit">${state.authMode==='signin'?'Sign in':'Create account'} ${ico('arrow',15)}</button>
 ${state.authMessage?`<div class="notice">${esc(state.authMessage)}</div>`:''}
 <p class="tiny" style="margin-top:19px;text-align:center">Accounts are private to your reading circle. The second person joins using an invite code after signing in.</p></form></div>`;
}
function renderSearchModal(){
 const mode=state.modal?.step||'results';
 if(mode==='add'){
  const b=state.selectedEdition;
  if(!b)return modalShell('Add book','<p class="notice error">Please select an edition first.</p>');
  return modalShell('Add to My Library',`<div class="detail-top">${cover({...b,demo_color:hashColor(b.title)},'large')}
   <div class="book-blurb"><h2 class="section-title">${esc(b.title)}</h2><p class="subtitle" style="margin-bottom:5px">${esc(b.author)}</p><p class="text-sm muted">${b.page_count?b.page_count+' pages · ':''}${b.published_year||'Year unknown'} ${b.isbn?' · ISBN '+esc(b.isbn):''}</p><p class="tiny">${b.edition_key?'Specific edition selected':'Edition data may be incomplete'}</p></div></div>
   <div class="formgrid"><div class="formfield"><label>Initial shelf</label><select class="select" id="new-book-status"><option value="tbr">Want to read</option><option value="reading">Currently reading</option><option value="finished">Finished</option><option value="dnf">Did not finish</option></select></div>
   <div class="formfield"><label>Edition page count</label><input class="input" id="new-book-pages" type="number" min="1" value="${b.page_count||''}" placeholder="Optional"/></div></div>
   <p class="notice warn">If you plan to track chapters, you'll need exact chapter page boundaries for this particular edition. We will never infer chapter lengths.</p>`,
   `<button class="btn" data-action="search-back">${ico('left',14)} Editions</button><button class="btn primary" data-action="confirm-add-book">${ico('plus',15)} Add this book</button>`);
 }
 if(mode==='editions'){
  const book=state.selectedSearch||{};
  return modalShell('Choose your edition',`<p class="text-sm muted">${esc(book.title)} · ${esc(book.author)}. Select the edition you are reading so the page count and ISBN match your copy.</p>
   ${state.searchBusy?'<div class="notice">Loading editions…</div>':''}
   ${state.editions.map((b,i)=>`<button class="result-row" data-action="select-edition" data-index="${i}">${cover({...b,demo_color:hashColor(b.title)},'small')}
   <span style="flex:1"><div class="result-title">${esc(b.title)}</div><div class="result-desc">${b.published_year||'Unknown year'} · ${b.page_count?b.page_count+' pages':'Page count unavailable'} ${b.publisher?' · '+esc(b.publisher):''}<br/>${b.isbn?'ISBN '+esc(b.isbn):'ISBN not listed'}</div></span>${ico('right',16)}</button>`).join('')||(!state.searchBusy?'<p class="notice warn">No editions returned. You can add the book manually.</p>':'')}`,
  `<button class="btn" data-action="search-back">${ico('left',14)} Search results</button><button class="btn" data-action="manual-modal">Add manually</button>`);
 }
 return modalShell('Find a book',`<p class="section-sub">Search by title, author, or ISBN. Open Library supplies the primary catalog; optional Google Books fallback is supported.</p>
 <form id="catalog-form" class="toolbar" style="margin-top:15px"><input id="catalog-query" class="input" style="flex:1;min-width:160px" value="${esc(state.searchQuery)}" placeholder="Search titles, authors or ISBNs…" required/>
 <button class="btn primary" type="submit">${ico('search',15)} Search</button>
 <button class="btn" type="button" data-action="scan-isbn" title="Scan an ISBN with your camera when supported">${ico('camera',16)} ISBN</button></form>
 <div id="camera-container"></div>
 ${state.searchBusy?'<div class="notice">Searching book catalogs…</div>':''}${state.searchError?`<div class="notice error">${esc(state.searchError)}</div>`:''}
 <div style="max-height:400px;overflow:auto">${state.catalog.map((b,i)=>`<button class="result-row" data-action="choose-search" data-index="${i}">${cover({...b,demo_color:hashColor(b.title)},'small')}
 <span style="flex:1"><span class="result-title">${esc(b.title)}</span><span class="result-desc" style="display:block">${esc(b.author)} · ${b.published_year||'Year unknown'} ${b.edition_count?' · '+b.edition_count+' editions':''}</span></span>${ico('right',16)}</button>`).join('')}
 ${!state.searchBusy&&!state.catalog.length&&!state.searchError?'<p class="tiny">Enter a book to browse matching works and select an edition.</p>':''}</div>`,
 `<button class="btn" data-action="manual-modal">${ico('edit',14)} Add book manually</button>`);
}
function renderGenrePicker(kind, assigned = []){
 if(!['edit','manual'].includes(kind))throw new Error('Invalid genre field.');
 const picked=selectedGenres(assigned);
 const chips=picked.map((genre,index)=>{
   const legacy=!STANDARD_GENRES.includes(genre);
   return `<span class="genre-chip ${index===0?'is-primary':''} ${legacy?'is-legacy':''}">
     <strong>${esc(genre)}</strong>${index===0?'<span class="genre-primary-label">Primary</span>':`<button type="button" class="genre-primary-btn" data-action="primary-book-genre" data-genre-scope="${kind}" data-genre="${esc(genre)}" title="Make ${esc(genre)} primary">Make primary</button>`}
     ${legacy?'<span class="genre-legacy-label" title="Imported or older custom label; cannot be added again">Existing label</span>':''}
     <button type="button" class="genre-remove" data-action="remove-book-genre" data-genre-scope="${kind}" data-genre="${esc(genre)}" aria-label="Remove genre ${esc(genre)}">×</button></span>`;
 }).join('');
 return `<div class="genre-picker" data-genre-picker="${kind}"><input type="hidden" id="${kind}-genres" value="${esc(picked.join(', '))}"/>
   <div class="genre-selected" role="group" aria-label="Assigned genres">${chips||'<span class="tiny">No genres selected. Add one below.</span>'}</div>
   <div class="inline genre-quick-add"><select class="select genre-choice" id="${kind}-add-genre" aria-label="Choose a standardized genre"><option value="">Select a genre…</option>${STANDARD_GENRES.map(g=>`<option value="${esc(g)}" ${picked.includes(g)?'disabled':''}>${esc(g)}</option>`).join('')}</select>
   <button class="btn sm" type="button" data-action="add-book-genre" data-genre-scope="${kind}">${ico('plus',13)} Add genre</button></div>
   <p class="tiny genre-explainer">Choose from ${STANDARD_GENRES.length} standard genres. The first listed is primary for Insights. Use “Make primary” to change it.${picked.some(g=>!STANDARD_GENRES.includes(g))?' Existing nonstandard genres are kept unless you remove them.':''}</p>
 </div>`;
}
function updateGenrePicker(kind, genres){
 const node=app.querySelector(`[data-genre-picker="${kind}"]`);
 if(node)node.outerHTML=renderGenrePicker(kind,genres);
}
function renderManualModal(){
 return modalShell('Add a book manually',`<p class="section-sub" style="margin-bottom:16px">For books missing from the catalog or custom editions.</p>
 <form id="manual-book-form"><div class="formgrid"><div class="formfield"><label>Title *</label><input class="input" id="manual-title" required placeholder="Book title"/></div><div class="formfield"><label>Author *</label><input class="input" id="manual-author" required placeholder="Author"/></div>
 <div class="formfield"><label>Total pages</label><input class="input" id="manual-pages" type="number" min="1"/></div><div class="formfield"><label>ISBN-10 / ISBN-13 (optional)</label><input class="input" id="manual-isbn" placeholder="978..."/></div>
 <div class="formfield"><label>Amazon ASIN (optional)</label><input class="input" id="manual-asin" maxlength="10" placeholder="B0..."/></div>
 <div class="formfield span2"><label>Genres (select from standardized list)</label>${renderGenrePicker('manual')}</div>
 <div class="formfield span2"><label>Custom cover URL (HTTPS)</label><input class="input" id="manual-cover-url" type="url" placeholder="https://.../cover.jpg"/></div>
 <p class="tiny span2">Saving an identifier does not contact a catalog. Open the book later and choose Look up metadata &amp; cover to search.</p>
 <div class="formfield"><label>Publication year</label><input class="input" id="manual-year" type="number" min="1400" max="2200"/></div><div class="formfield"><label>Shelf</label><select class="select" id="manual-status"><option value="tbr">Want to read</option><option value="reading">Currently reading</option><option value="finished">Finished</option><option value="dnf">Did not finish</option></select></div></div>
 <div class="toolbar" style="justify-content:flex-end;margin:15px 0 0"><button class="btn primary" type="submit">${ico('plus',14)} Add to library</button></div></form>`);
}
function hasUnsavedBookEdits(book){
 const fields={
  'edit-status':book.status,'edit-rating':book.rating??'',
  'edit-started':book.started_on||'','edit-finished':book.finished_on||'',
  'edit-pagecount':book.page_count||'','edit-current':book.current_page||0,
  'edit-isbn':book.isbn||'','edit-asin':book.asin||'',
  'edit-cover-url':book.cover_url||'','edit-publisher':book.publisher||'',
  'edit-binding':book.binding||'','edit-edition-year':book.edition_year||'',
  'edit-original-year':book.original_published_year||'',
  'edit-height':book.height_mm||'','edit-thickness':book.thickness_mm||'',
  'edit-genres':(book.genres||[]).join(', '),'edit-tbr-added':book.tbr_added_on||'',
  'edit-series':book.series_name||seriesMetadata(book).series_name||'','edit-seriesnum':book.series_number??seriesMetadata(book).series_number??'',
  'edit-seriestotal':book.series_total||'',
  'edit-notes':book.notes||''
 };
 return Object.entries(fields).some(([key,original])=>{
  const input=app.querySelector('#'+key);
  return input&&String(input.value??'')!==String(original);
 });
}
function renderBookMetadataLookup(book){
 if(!own())return '';
 const pending=state.bookLookup?.bookId===book.id?state.bookLookup:null;
 const details=pending?.metadata;
 const maybeCover=details?.cover_url&&safeImage(details.cover_url);
 return `<section class="metadata-lookup-card"><div class="cardhead"><div><h3 class="small-title">Book identifiers, genres &amp; cover</h3><p class="section-sub">Save your edits first. Lookups happen only when you press the button below.</p></div><button type="button" class="btn sm" data-action="lookup-book-metadata" data-id="${esc(book.id)}" ${state.lookupBusy?'disabled':''}>${ico('search',14)} ${state.lookupBusy?'Looking up…':'Look up metadata & cover'}</button></div>
 ${pending?`<div class="metadata-lookup-results"><div class="lookup-heading"><strong>${esc(pending.label)}</strong><span class="tiny">Suggestions only — not yet saved</span></div>
 <p class="tiny">${esc(pending.notice)}</p><div class="lookup-result-layout">${maybeCover?cover({...book,cover_url:maybeCover},'small'):''}<div>
 ${[['Publisher',details.publisher],['Binding',details.binding],['Edition year',details.edition_year],['Original year',details.original_published_year],['Pages',details.page_count],['Genres',(details.genres||[]).join(', ')],['ISBN',details.isbn]].filter(([,v])=>v).map(([k,v])=>`<div class="tiny"><strong>${esc(k)}:</strong> ${esc(v)}</div>`).join('')||'<span class="tiny">Cover or work metadata available.</span>'}
 </div></div>${maybeCover?`<label class="lookup-cover-choice"><input id="apply-lookup-cover" type="checkbox" ${!book.cover_url?'checked':''}/> Use suggested cover ${book.cover_url?'(replace my current cover)':''}</label>`:''}
 <div class="toolbar lookup-buttons"><button class="btn primary sm" data-action="apply-book-lookup" data-id="${esc(book.id)}">${ico('check',14)} Apply missing details${maybeCover?' & chosen cover':''}</button><button class="btn sm" data-action="dismiss-book-lookup">Dismiss</button></div></div>`:''}</section>`;
}
function readHistoryEditorRow(pass,index,editable){
 const status=pass.status||'reading',label=index===0?'Original read':'Reread #'+index;
 return `<section class="history-edit-row" data-read-pass-row="${index}"><div class="history-edit-heading"><strong>${label}</strong>${index>0&&editable?`<button type="button" class="btn sm danger" data-action="remove-read-pass" title="Remove an empty reread">Remove</button>`:''}</div>
 <div class="formgrid"><div class="formfield"><label>Status</label><select class="select" data-pass-field="status" ${editable?'':'disabled'}>${[['reading','Currently reading'],['finished','Finished'],['dnf','Did not finish']].map(([key,value])=>`<option value="${key}" ${status===key?'selected':''}>${value}</option>`).join('')}</select></div>
 <div class="formfield"><label>Start date (optional)</label><input class="input" type="date" data-pass-field="started_on" value="${esc(pass.started_on||'')}" ${editable?'':'disabled'}/></div>
 <div class="formfield"><label>Finished date (if known)</label><input class="input" type="date" data-pass-field="finished_on" value="${esc(pass.finished_on||'')}" ${editable?'':'disabled'}/></div>
 <div class="formfield"><label>Finished year (when exact date unknown)</label><input class="input" type="number" min="1500" max="2200" data-pass-field="finished_year" value="${pass.finished_on?'':pass.finished_year||''}" placeholder="e.g. 2022" ${editable?'':'disabled'}/></div></div></section>`;
}
function readHistoryDraftFromDOM(){
 return [...app.querySelectorAll('[data-read-pass-row]')].map(row=>{
  const read=key=>row.querySelector(`[data-pass-field="${key}"]`)?.value||'';
  return {status:read('status'),started_on:read('started_on'),finished_on:read('finished_on'),finished_year:read('finished_year')};
 });
}
function renderReadHistoryEditor(book,sessions,editable){
 const passes=readingPasses(book);
 return `<div class="card soft history-editor"><h3 class="small-title">Edit original read & rereads</h3>
 <p class="section-sub">Enter the original read (even if it was years ago), then add each reread separately. You can use just a finish year such as 2022 without inventing an exact date. Leave unknown session time and reading method unrecorded.</p>
 <div class="notice">Example: Original read → Finished → 2022; Reread #1 → Currently reading → start date in 2026. New reading sessions then belong to Reread #1, not the original.</div>
 <div id="read-history-editor-rows">${(passes.length?passes:[{number:1,status:'reading',started_on:null,finished_on:null}]).map((pass,index)=>readHistoryEditorRow(pass,index,editable)).join('')}</div>
 ${editable?`<div class="toolbar"><button type="button" class="btn" data-action="add-read-pass" data-id="${esc(book.id)}">${ico('plus',15)} Add a reread</button></div>
 <label class="history-reassign"><input type="checkbox" id="reassign-dated-sessions" checked/> Move existing sessions to the correct reread when their dates fall on or after a known reread start</label>
 <p class="tiny">The move is shown for confirmation before saving. Existing session times, pages, activity types, notes and dates are never changed. Sessions with uncertain dates are not moved.</p>
 <div class="toolbar"><button class="btn primary" data-action="save-read-history" data-id="${esc(book.id)}">${ico('check',15)} Save reading history</button><button class="btn" data-action="reassign-read-history" data-id="${esc(book.id)}">Recheck saved session assignments</button></div>`:'<p class="tiny">This reading history is view-only.</p>'}
 </div>`;
}

function readChapterDraftRows(){
 if(!state.chapterDraft)return;
 const rows=[...app.querySelectorAll('[data-chapter-candidate]')];
 if(!rows.length)return;
 state.chapterDraft.rows=rows.map((node,i)=>({
  chapter_number:i+1,
  chapter_label:node.querySelector('[data-chapter-label]')?.value||`Chapter ${i+1}`,
  start_page:node.querySelector('[data-chapter-start]')?.value||'',
  end_page:node.querySelector('[data-chapter-end]')?.value||''
 }));
}
function installChapterDraft(book,found){
 state.chapterDraftBookId=book.id;
 state.chapterDraft={...found,rows:found.rows.map((row,i)=>({...row,chapter_number:i+1}))};
 state.chapterMessage=`${found.rows.length} candidate chapters found. Check every starting and ending page against this exact edition before saving.`;
 state.bookModalTab='chapters';
}
function renderChapterSourcing(book,existingChapters){
 const validISBN=isbn13ForEdition(book.isbn);
 const draft=state.chapterDraftBookId===book.id?state.chapterDraft:null;
 const busy=state.chapterBusy;
 const options=state.chapterDraftBookId===book.id?(state.sharedChapterOptions||[]):[];
 const remarks=state.chapterDraftBookId===book.id?state.chapterMessage:'';
 return `<section class="chapter-source-panel" aria-label="Find chapter boundaries">
  <div class="chapter-source-head"><div><h3 class="small-title">Find chapter pages</h3><p class="tiny">Sources are starting points, not confirmed chapter lengths. The saved map is always specific to your print edition.</p></div></div>
  ${validISBN?`<div class="chapter-source-actions"><button class="btn sm" data-action="chapter-openlibrary" data-id="${esc(book.id)}" ${busy?'disabled':''}>${ico('search',14)} Look up Open Library</button>
  <button class="btn sm" data-action="chapter-shared-list" data-id="${esc(book.id)}" ${busy?'disabled':''}>${ico('users',14)} Find shared mappings</button></div>`:
  '<div class="notice warn">Add and save a valid ISBN under Book details to use exact-edition Open Library and community matches. You can still scan your own contents page.</div>'}
  <div class="chapter-photo"><label for="chapter-photo-file">Table of contents · one or more photos</label><input class="input" id="chapter-photo-file" type="file" accept="image/*" multiple ${busy?'disabled':''} aria-label="Choose multiple table of contents photos"/>
  <label class="btn sm chapter-camera-trigger" for="chapter-camera-file">${ico('camera',14)} Take another photo</label><input id="chapter-camera-file" class="chapter-camera-input" type="file" accept="image/*" capture="environment" ${busy?'disabled':''} aria-label="Take a table of contents photo"/></div>
  ${state.chapterPhotos.length?`<div class="chapter-photo-queue" aria-label="Selected contents photos in scanning order"><p class="tiny">${state.chapterPhotos.length} of ${MAX_CONTENTS_PHOTOS} photos · scanned from top to bottom in this order. Use the arrows to rearrange pages.</p>
    <ol class="chapter-photo-list">${state.chapterPhotos.map((x,i)=>`<li class="chapter-photo-item">${x.preview?`<img src="${esc(x.preview)}" loading="lazy" alt="Contents page ${i+1}"/>`:''}<div class="chapter-photo-name"><strong>Page photo ${i+1}</strong><span>${esc(x.file.name||'Camera photo')} · ${(x.file.size/1048576).toFixed(1)} MB</span></div>
     <div class="chapter-photo-controls"><button class="btn sm icon-only" type="button" data-action="chapter-photo-up" data-index="${i}" ${i===0||busy?'disabled':''} aria-label="Move photo ${i+1} earlier">↑</button><button class="btn sm icon-only" type="button" data-action="chapter-photo-down" data-index="${i}" ${i===state.chapterPhotos.length-1||busy?'disabled':''} aria-label="Move photo ${i+1} later">↓</button><button class="btn sm icon-only danger" type="button" data-action="chapter-photo-remove" data-index="${i}" ${busy?'disabled':''} aria-label="Remove photo ${i+1}">${ico('x',14)}</button></div></li>`).join('')}</ol></div>`:''}
  <button class="btn sm" data-action="chapter-scan-photo" data-id="${esc(book.id)}" ${busy||!state.chapterPhotos.length?'disabled':''}>${ico('search',14)} Scan ${state.chapterPhotos.length||''} ordered photo${state.chapterPhotos.length===1?'':'s'}</button>
  <p class="tiny">Add photos across multiple selections or camera shots (up to ${MAX_CONTENTS_PHOTOS}). Photos are processed in the order shown; the app combines extracted chapters into one editable map. Image recognition runs on your device and photos are not uploaded to our database. Verify missing, repeated, or misread page numbers.</p>
  <details class="chapter-paste"><summary>Or paste the table of contents</summary><textarea class="textarea" id="chapter-pasted-contents" rows="4" placeholder="Prologue .......... 1&#10;Chapter 1 .......... 12&#10;Chapter 2 .......... 28"></textarea>
  <button class="btn sm" data-action="chapter-parse-paste" data-id="${esc(book.id)}" ${busy?'disabled':''}>Read pasted contents</button></details>
  ${busy?'<div class="notice" role="status">Looking for chapters…</div>':''}
  ${remarks?`<div class="notice" role="status">${esc(remarks)}</div>`:''}
  ${options.length?`<div class="chapter-sharing-results"><h4>Matching ISBN contributions</h4><p class="tiny">Reader-submitted maps are not independently checked. Pick one to review before importing.</p>
    ${options.map((opt,i)=>`<div class="chapter-sharing-result"><span><strong>${(opt.chapters||[]).length} chapters</strong><small>${opt.page_count?esc(opt.page_count)+'-page edition · ':''}Contributed mapping</small></span><button class="btn sm" data-action="chapter-use-shared" data-index="${i}" data-id="${esc(book.id)}">Review map</button></div>`).join('')}</div>`:''}
  ${draft?`<div class="chapter-candidate-card" id="chapter-candidate-panel">
    <div class="chapter-candidate-heading"><div><h4>Review candidate map</h4><p class="tiny">Source: <strong>${esc(draft.source)}</strong>${draft.sourceTitle?' · '+esc(draft.sourceTitle):''}${draft.sourcePages?' · '+draft.sourcePages+' pages in source':''}${draft.sourceUrl?` · <a href="${esc(draft.sourceUrl)}" target="_blank" rel="noopener noreferrer">View source</a>`:''}</p></div><span class="chapter-count">${draft.rows.length} entries</span></div>
    ${draft.sourcePages&&book.page_count&&draft.sourcePages!==book.page_count?`<div class="notice warn">Catalog lists ${draft.sourcePages} pages; your edition is saved as ${book.page_count}. Confirm you have the correct printing.</div>`:''}
    ${(draft.warnings||[]).length?`<div class="notice warn">${draft.warnings.slice(0,4).map(esc).join(' ')}</div>`:''}
    <div class="notice warn">Suggested end pages are calculated from the following chapter's start and <strong>must be checked</strong>. The last chapter's end stays blank until you enter it. Remove non-chapter headings and correct any OCR errors.</div>
    <div class="chapter-draft-header" aria-hidden="true"><span>Chapter / title</span><span>First page</span><span>Last page</span><span></span></div>
    <div class="chapter-candidate-rows">${draft.rows.map((c,i)=>`<div class="chapter-candidate-row" data-chapter-candidate="${i}"><div class="chapter-draft-title"><span class="chapter-row-number">${i+1}</span><input class="input" data-chapter-label aria-label="Chapter ${i+1} title" maxlength="180" value="${esc(c.chapter_label||'Chapter '+(i+1))}"/></div>
      <input class="input" data-chapter-start aria-label="Chapter ${i+1} first page" type="number" min="1" step="1" value="${esc(c.start_page??'')}"/>
      <input class="input" data-chapter-end aria-label="Chapter ${i+1} last page" type="number" min="1" step="1" placeholder="Check" value="${esc(c.end_page??'')}"/>
      <button class="btn sm icon-only danger" data-action="chapter-remove-row" data-index="${i}" aria-label="Remove chapter ${i+1}">${ico('x',14)}</button></div>`).join('')}</div>
    <div class="chapter-draft-actions"><button class="btn sm" data-action="chapter-add-row">${ico('plus',14)} Add chapter</button><button class="btn sm" data-action="chapter-discard-draft">Discard draft</button></div>
    <label class="chapter-confirmation"><input type="checkbox" id="chapter-verified-checkbox"/><span>I've verified every chapter's starting and ending page against this exact book edition. I understand existing sessions keep the pages recorded when they were logged.</span></label>
    <button class="btn primary chapter-save-all" data-action="chapter-apply-map" data-id="${esc(book.id)}">Save verified chapter map${existingChapters.length?' (replace existing)':''}</button>
  </div>`:''}
  ${existingChapters.length&&validISBN?`<div class="chapter-share-existing"><strong>Help other readers with this ISBN</strong><p class="tiny">Share only these chapter titles and page ranges, not your profile, reading sessions or notes. Other users must review the mapping before use.</p>
  <button class="btn sm" data-action="chapter-publish" data-id="${esc(book.id)}">${ico('users',14)} Contribute my verified map</button>
  <button class="btn sm" data-action="chapter-withdraw" data-id="${esc(book.id)}">Withdraw my contribution</button></div>`:''}
 </section>`;
}

function renderBookModal(){
 const b=bookById(state.modal?.id);if(!b)return '';
 const editable=state.user?.id===b.user_id;
 const chapters=state.data.chapters.filter(c=>c.user_book_id===b.id).sort((a,c)=>a.chapter_number-c.chapter_number);
 const sessions=state.data.sessions.filter(s=>s.user_book_id===b.id);
 // Book-level current-pass consistency must not mix 2022 original sessions
 // into an active reread's 2026 elapsed-day denominator.
 const activePass=currentReadNumber(b);
 const currentPassSessions=sessions.filter(s=>Number(s.read_number||1)===activePass);
 const days=bookReadingDays(b,currentPassSessions,{today:today()});
 const daysSummary=days.elapsedDays!==null?`<div class="card soft" style="margin-bottom:14px"><h3 class="small-title">${activePass>1?'Current reread':'Current read'} · reading days vs. elapsed days</h3><div class="inline" style="gap:26px;margin:9px 0"><div><strong>${days.readingDays}</strong><div class="tiny">Active reading days</div></div><div><strong>${days.elapsedDays}</strong><div class="tiny">Total elapsed days</div></div><div><strong>${Math.round(days.consistency*100)}%</strong><div class="tiny">Consistency</div></div></div><p class="tiny">${esc(days.startDate)} through ${esc(days.endDate)} · A date counts once even with multiple reading or listening sessions.</p></div>`:'';
 const passes=readingPasses(b);
 const passesCard=passes.length?`<div class="card soft" style="margin-bottom:14px"><div class="cardhead"><div><h3 class="small-title">Read & reread history</h3><p class="section-sub">${passes.length} read-through${passes.length===1?'':'s'} tracked separately</p></div>${editable?`<button class="btn sm" data-action="edit-read-history" data-id="${esc(b.id)}">${ico('edit',14)} Edit dates & rereads</button>`:''}</div>${passes.map(p=>`<div class="read-pass-row"><strong>${p.number===1?'Original read':'Reread #'+(p.number-1)}${p.number===passes.at(-1).number&&p.status==='reading'?' · Active':''}</strong><span>${esc(statusText[p.status]||p.status)} · ${p.started_on?fmtDate(p.started_on):'Start unknown'}${p.finished_on?' → '+fmtDate(p.finished_on):p.status==='finished'&&p.finished_year?' → '+p.finished_year+' (exact date unknown)':''} · ${sessions.filter(s=>Number(s.read_number||1)===p.number).length} sessions</span></div>`).join('')}<p class="tiny">Sessions are counted under their saved read number, not merely by the book's current shelf. Correct earlier misplaced sessions in Edit dates & rereads.</p></div>`:'';
 const title=`${b.title}`;
 const footer=editable?`<button class="btn danger" data-action="delete-book" data-id="${esc(b.id)}">${ico('trash',14)} Delete</button><span style="flex:1"></span>${state.bookModalTab==='details'?`<button class="btn primary" data-action="save-book" data-id="${esc(b.id)}">${ico('check',15)} Save book</button>`:''}`:'<span class="tiny">Partner books are view-only.</span>';
 const detail=state.bookModalTab==='history'?renderReadHistoryEditor(b,sessions,editable):state.bookModalTab==='chapters'?`<h3 class="small-title">Exact chapter boundaries</h3>
 <p class="section-sub" style="margin:7px 0 15px">Boundaries are entered for this specific edition${b.isbn?' (ISBN '+esc(b.isbn)+')':''}. Only completely mapped chapter ranges can be logged. There are no page estimates.</p>
 ${editable?renderChapterSourcing(b,chapters):''}
 ${chapters.map(c=>`<div class="chapter-item"><div><strong>${esc(c.chapter_label||'Chapter '+c.chapter_number)}</strong><div class="small">Chapter ${c.chapter_number} · pp. ${c.start_page}–${c.end_page} · ${c.end_page-c.start_page+1} pages</div></div>
 ${editable?`<button class="btn sm danger" data-action="delete-chapter" data-id="${esc(c.id)}">${ico('trash',14)}</button>`:''}</div>`).join('')||'<p class="notice warn">No exact chapters mapped. Add page boundaries below to enable time + chapters logging.</p>'}
 ${editable?`<div class="divider"></div><h3 class="small-title">Add or update an exact chapter</h3>
 <div class="formgrid three" style="margin-top:12px"><div class="formfield"><label>Chapter number</label><input class="input" id="chapter-number" type="number" min="1" step="1" placeholder="1"/></div>
 <div class="formfield"><label>First page</label><input class="input" id="chapter-start" type="number" min="1" step="1" placeholder="1"/></div>
 <div class="formfield"><label>Last page</label><input class="input" id="chapter-end" type="number" min="1" step="1" placeholder="18"/></div>
 <div class="formfield span3"><label>Optional chapter title</label><input class="input" id="chapter-title" placeholder="e.g., Part One: A Beginning"/></div></div>
 <button class="btn primary" style="margin-top:13px" data-action="save-chapter" data-id="${esc(b.id)}">${ico('plus',14)} Save exact boundary</button>
 <div class="notice warn" style="margin-top:15px">Example: Chapter 1 = pages 1–18. Page ranges cannot overlap other mapped chapters. Avoid counting shared heading pages twice.</div>`:''}`:
 `<div class="detail-top">${cover(b,'large')}<div class="book-blurb"><h3 class="section-title">${esc(b.title)}</h3><p class="subtitle" style="margin-bottom:7px">${esc(b.author)}</p><div class="text-sm muted">${b.page_count?b.page_count+' pages · ':''}${b.edition_year||b.published_year||'Publication year unknown'} ${b.isbn?' · ISBN '+esc(b.isbn):''}</div><div class="tiny" style="margin-top:5px">${b.publisher?esc(b.publisher):'Publisher not recorded'}${b.binding?' · '+esc(b.binding):''}${b.original_published_year?' · First published '+b.original_published_year:''}${b.edition_key?' · Matched edition':' · Edition not verified'}</div><div style="margin-top:11px"><span class="status-pill ${esc(b.status)}">${statusText[b.status]||b.status}</span> ${b.favorite?'<span class="heart">♥ Favorite</span>':''}</div>
 <div class="tiny" style="margin-top:15px">${sessions.length} reading sessions · ${fmtTime(sum(sessions,'duration_minutes'))} total · ${sum(sessions,'pages_read')} pages progressed (${pageTotals(sessions).audioEquivalent} audiobook equivalents)${b.asin?' · ASIN '+esc(b.asin):''}</div>
 </div></div>
 ${editable?`<section class="book-status-edit" aria-label="Edit reading status"><div class="book-status-main"><label for="edit-status">Reading status</label><select class="select" id="edit-status">${Object.entries(statusText).map(([id,label])=>`<option value="${id}" ${b.status===id?'selected':''}>${label}</option>`).join('')}</select><span class="tiny">Select a status, then use <strong>Save book</strong> below to apply it.</span></div>
 ${['finished','dnf'].includes(b.status)?`<div class="book-status-reread"><button type="button" class="btn sm" data-action="start-reread" data-id="${esc(b.id)}">${ico('refresh',14)} Start reread today</button><p class="tiny">Start a new reading pass to preserve the original read and its sessions.</p></div>`:''}</section>
 ${renderBookMetadataLookup(b)}<div class="formgrid" id="book-metadata-form">
 <div class="formfield"><label>Personal rating (¼-star increments)</label><select class="select" id="edit-rating"><option value="">Unrated</option>${Array.from({length:20},(_,i)=>(i+1)/4).map(r=>`<option value="${r}" ${num(b.rating)===r?'selected':''}>${r.toFixed(2)} ★</option>`).join('')}</select></div>
 <div class="formfield"><label>Started reading</label><input class="input" type="date" id="edit-started" value="${esc(b.started_on||'')}"/></div><div class="formfield"><label>Finished reading</label><input class="input" type="date" id="edit-finished" value="${esc(b.finished_on||'')}"/></div>
 <div class="formfield"><label>Page count (exact edition)</label><input class="input" type="number" min="1" id="edit-pagecount" value="${b.page_count||''}"/></div><div class="formfield"><label>Current page</label><input class="input" type="number" min="0" id="edit-current" value="${b.current_page||0}"/></div>
 <div class="formfield"><label>ISBN-10 / ISBN-13</label><input class="input" id="edit-isbn" value="${esc(b.isbn||'')}" placeholder="978..."/></div><div class="formfield"><label>Amazon ASIN</label><input class="input" id="edit-asin" maxlength="10" value="${esc(b.asin||'')}" placeholder="B0..."/></div>
 <div class="formfield span2"><label>Cover image URL (HTTPS)</label><input class="input" id="edit-cover-url" type="url" value="${esc(b.cover_url||'')}" placeholder="https://example.com/cover.jpg"/><div class="inline cover-url-tools"><button type="button" class="btn sm" data-action="preview-cover-url">Preview URL</button><span class="tiny">Paste a direct HTTPS image address. Saving changes the displayed cover without a catalog lookup.</span></div><div id="manual-cover-preview" class="cover-url-preview" aria-live="polite"></div></div>
 <div class="formfield"><label>Publisher</label><input class="input" id="edit-publisher" value="${esc(b.publisher||'')}"/></div><div class="formfield"><label>Binding</label><input class="input" id="edit-binding" value="${esc(b.binding||'')}" placeholder="Paperback / Hardcover / Ebook"/></div>
 <div class="formfield"><label>Edition publication year</label><input class="input" type="number" min="1500" max="2099" id="edit-edition-year" value="${b.edition_year||''}"/></div><div class="formfield"><label>Original publication year</label><input class="input" type="number" min="1500" max="2099" id="edit-original-year" value="${b.original_published_year||''}"/></div>
 <div class="formfield"><label>Physical height (mm, optional)</label><input class="input" type="number" min="1" step="0.1" id="edit-height" value="${b.height_mm||''}"/></div>
 <div class="formfield"><label>Physical thickness (mm, optional)</label><input class="input" type="number" min="1" step="0.1" id="edit-thickness" value="${b.thickness_mm||''}"/></div>
 <div class="formfield span2"><label>Assigned genres (first = primary)</label>${renderGenrePicker('edit',b.genres||[])}</div>
 <div class="formfield"><label>TBR added date (optional)</label><input class="input" type="date" id="edit-tbr-added" value="${esc(b.tbr_added_on||'')}"/></div>
 <div class="formfield"><label>Series name (editable)</label><input class="input" id="edit-series" value="${esc(b.series_name||seriesMetadata(b).series_name||'')}" placeholder="e.g., Dune"/></div><div class="formfield"><label>Installment number</label><input class="input" type="number" step="0.5" min="0" id="edit-seriesnum" value="${b.series_number??seriesMetadata(b).series_number??''}"/></div>
 <div class="formfield span2"><label>Main installments published / known (editable)</label><input class="input" type="number" min="1" max="500" step="1" id="edit-seriestotal" value="${b.series_total||''}" placeholder="Set if you know the total"/><p class="tiny">Goodreads identifies series and order, but not the final series length. A connected catalog can suggest the currently known main books. You can always override the count. Completion means all currently known installments were finished—not that the author will never publish another.</p>
 ${b.series_source_url&&isSeriesSourceURL(b.series_source_url)?`<p class="tiny">Catalog source: <a href="${esc(b.series_source_url)}" target="_blank" rel="noopener noreferrer">List Of Books · series reading order</a></p>`:''}
 <div class="inline" style="margin-top:8px"><button type="button" class="btn sm" data-action="series-book-lookup" data-id="${esc(b.id)}" ${state.seriesLoading===b.id?'disabled':''}>${ico('search',14)} ${state.seriesLoading===b.id?'Looking up…':'Find series details'}</button></div>
 ${renderBookSeriesCatalog(b)}
 </div>
 <div class="formfield span2"><label>Your notes</label><textarea class="textarea" id="edit-notes">${esc(b.notes||'')}</textarea></div></div>
 <div class="toolbar" style="margin-top:13px"><button class="btn ${b.favorite?'selected':''}" data-action="toggle-favorite" data-id="${esc(b.id)}">${ico('heart',15)} ${b.favorite?'Remove from Favorites':'Add to Favorites'}</button></div>`:
 `<div class="card soft"><p class="text-sm">Personal rating: <strong>${b.rating===null?'Unrated':Number(b.rating).toFixed(2)+' ★'}</strong></p><p class="text-sm">Progress: <strong>${b.current_page||0} of ${b.page_count||'unknown'} pages</strong></p>${seriesMetadata(b).series_name?`<p class="text-sm">Series: ${esc(seriesMetadata(b).series_name)} #${esc(seriesMetadata(b).series_number??'—')}${b.series_total?' of '+b.series_total:''}</p>`:''}<p class="text-sm">Dates: ${fmtDate(b.started_on)} – ${fmtDate(b.finished_on)}</p>${b.notes?`<p class="text-sm">Notes: ${esc(b.notes)}</p>`:''}</div>`}`;
 const insightsCards=state.bookModalTab==='details'?`${passesCard}${renderBookRereadComparison(b,sessions)}${daysSummary}${renderBookSpeedInsight(sessions)}`:'';
 return modalShell(title,`<div class="segmented" style="margin-bottom:16px"><button class="seg-btn ${state.bookModalTab==='details'?'active':''}" data-booktab="details">Book details</button><button class="seg-btn ${state.bookModalTab==='chapters'?'active':''}" data-booktab="chapters">Exact chapters (${chapters.length})</button><button class="seg-btn ${state.bookModalTab==='history'?'active':''}" data-booktab="history">Read history (${passes.length})</button></div>${detail}${insightsCards}`,footer);
}
function renderImportModal(){
 const list=state.importRows||[];
 const plan=prepareGoodreadsImport(list,ownBooks());
 const sessionTitles=Object.keys(state.importSessionsByTitle||{}).length;
 const genreTitles=Object.keys(state.importGenresByTitle||{}).length;
 const rereadCount=list.filter(b=>(b.read_history?.length||0)>1||b._grReadCount>1).length;
 if(state.importProgress){
  const p=state.importProgress;
  const percent=p.total?Math.round(p.processed/p.total*100):0;
  return modalShell('Filling book metadata',`<p class="text-sm muted">${esc(p.phase)}. Please keep this browser tab open while book metadata is checked. Saved results remain in Supabase if you pause.</p>
   <div class="progress" role="progressbar" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100"><div style="width:${percent}%"></div></div>
   <p class="text-sm"><strong>${p.processed} / ${p.total}</strong> books checked · ${p.saved} updated · ${p.genreFilled} genre assignments · ${p.editionMatched} edition matches${p.seriesFilled?' · '+p.seriesFilled+' series counts filled':''}</p>
   <p class="tiny">${p.unresolved} records still missing some catalog information · ${p.errors} request/save errors. Series lookup is limited to 8 distinct series per import on the optional catalog connection; manually verified totals are never overwritten.</p>`,
   `<button class="btn" data-action="stop-import-enrichment" ${state.importAbortRequested?'disabled':''}>${state.importAbortRequested?'Pausing…':'Pause after current lookup'}</button>`);
 }
 return modalShell('Import from Goodreads',`<p class="text-sm muted">Upload <code>goodreads_library_export.csv</code>. It automatically imports Goodreads publisher, binding, edition year, original year and other available fields, then fills missing genres for ISBN books and searches for covers and editions for books without ISBNs. If the optional server-side series API is configured, the import also checks up to eight distinct named series and fills missing published-book counts. Existing books are updated only where fields are blank.</p>
 <div class="formgrid three" style="margin-top:15px">
  <div class="formfield"><label for="goodreads-file">1. Library CSV</label><input id="goodreads-file" type="file" accept=".csv,text/csv" class="input"/></div>
  <div class="formfield"><label for="goodreads-sessions-file">2. reading_sessions.json (optional)</label><input id="goodreads-sessions-file" type="file" accept=".json,application/json" class="input"/></div>
  <div class="formfield"><label for="goodreads-genres-file">3. genre_recommendation.json (optional)</label><input id="goodreads-genres-file" type="file" accept=".json,application/json" class="input"/></div>
 </div>
 ${sessionTitles||genreTitles?`<div class="notice">${sessionTitles?`Loaded ${sessionTitles} book pass histories. `:''}${genreTitles?`Loaded optional genre tags for ${genreTitles} books.`:''}</div>`:''}
 ${list.length?`<div class="notice">${list.length} rows · ${plan.additions.length} new · ${plan.existing} already in library · ${plan.updates.length} with missing CSV fields · ${plan.skipped.length} duplicate rows in export${rereadCount?` · ${rereadCount} books with rereads detected`:''}</div>
 <div style="max-height:230px;overflow:auto">${list.slice(0,10).map(b=>`<div class="session-row"><div>${cover(b,'small')}</div><div class="session-info"><div class="session-title">${esc(b.title)}</div><div class="session-meta">${esc(b.author)} · ${b.isbn?'ISBN':'No ISBN: match by book details'} · ${b.edition_year||'Edition year unknown'}${b.genres?.length?' · '+esc(b.genres.join(', ')):''}</div></div></div>`).join('')}</div><p class="tiny">Showing first 10 rows. All imported rows are saved before lookup. Missing metadata may remain blank if a trustworthy match is unavailable; catalogs can also rate-limit requests.</p>`:''}
 ${state.importSummary?`<div class="notice">${esc(state.importSummary)}</div>`:''}`,
 `<button class="btn" data-action="close-modal">Cancel</button>${(sessionTitles||genreTitles)&&ownBooks().length?`<button class="btn" data-action="apply-gr-extras">Apply dates &amp; genres to existing library</button>`:''}<button class="btn primary" data-action="confirm-import" ${!list.length?'disabled':''}>${ico('upload',15)} Import &amp; fill metadata (${list.length})</button>`);
}
function renderInsightsBookDrilldown(){
 const {kind,value,label}=state.modal||{};
 const books=insightBooks(viewBooks(),{kind,value,today:today()});
 return modalShell(label||'Books in this metric',`<p class="section-sub">${books.length} book${books.length===1?'':'s'} in this group. Select a book to view its details.</p>
 <div class="insight-drilldown-list">${books.map(b=>`<button type="button" class="insight-drilldown-book" data-action="open-book" data-id="${esc(b.id)}">
 ${cover(b,'small')}<span><strong>${esc(b.title)}</strong><small>${esc(b.author||'Unknown author')} · ${esc(statusText[b.status]||b.status)}${b.rating!=null?' · '+Number(b.rating).toFixed(2)+' ★':''}</small></span>${ico('right',16)}</button>`).join('')||'<p class="notice">No matching books in the current library.</p>'}</div>`,
 '<button class="btn" data-action="close-modal">Close</button>');
}
function renderModal(){
 if(!state.modal)return '';
 switch(state.modal.type){case 'search':return renderSearchModal();case 'manual':return renderManualModal();case 'book':return renderBookModal();case 'import':case 'enrichment':return renderImportModal();case 'insight-books':return renderInsightsBookDrilldown();default:return '';}
}
function openModal(type,props={}){
 if(type==='book' && props.id!==state.chapterDraftBookId){
  clearChapterPhotos();state.chapterDraftBookId=props.id;state.chapterDraft=null;state.sharedChapterOptions=[];state.chapterMessage='';
 }
 state.modal={type,...props};state.searchError='';state.importSummary='';state.bookLookup=null;render();
}
function closeModal(){stopCamera();clearChapterPhotos();state.modal=null;state.bookLookup=null;render();}
async function saveReadHistory(bookId,assignmentOnly=false){
 if(!own())return toast('Partner profiles are view-only.',true);
 const book=bookById(bookId);if(!book||book.user_id!==state.user.id)return;
 let updated;
 try{updated=assignmentOnly?book:editReadingHistory(book,readHistoryDraftFromDOM());}
 catch(err){return toast(err.message,true);}
 const rows=state.data.sessions.filter(s=>s.user_book_id===bookId);
 const highestAssigned=Math.max(1,...rows.map(s=>Number(s.read_number||1)));
 if(highestAssigned>readingPasses(updated).length)return toast('This book has sessions attached to a reading pass being removed. Keep that pass or move those sessions first.',true);
 const transfer=assignmentOnly||app.querySelector('#reassign-dated-sessions')?.checked;
 const corrections=transfer?rereadSessionCorrections(updated,rows):[];
 if(corrections.length){
  const preview=corrections.slice(0,3).map(x=>`${x.session.session_date}: read #${x.from} → #${x.to}`).join('\n');
  if(!confirm(`Move ${corrections.length} existing reading session${corrections.length===1?'':'s'} to the correct dated reread?\n\n${preview}${corrections.length>3?'\n...':''}\n\nOnly the reading-pass number changes; no pages, time, mode, notes or dates will be modified.`))return;
 }
 if(!assignmentOnly){
  if(!confirm(`Save ${readingPasses(updated).length} reading pass${readingPasses(updated).length===1?'':'es'} for ${book.title}? The original completion will be preserved in Read history.`))return;
 }
 await run(async()=>{
  if(!assignmentOnly)await repo.save('books',updated);
  let changed=0;
  try{for(const entry of corrections){await repo.save('sessions',{...entry.session,read_number:entry.to});changed++;}}
  catch(err){await sync(true);throw new Error(`Reading history saved but only ${changed} of ${corrections.length} session corrections completed: ${err.message}. Use Recheck saved session assignments to retry.`);}
  state.bookModalTab='history';
 },`Reading history ${assignmentOnly?'checked':'saved'}${corrections.length?`; ${corrections.length} saved session${corrections.length===1?'':'s'} moved into the appropriate reread`:''}.`);
}
async function saveLog(){
 if(!own())return toast('Partner profiles are view-only.',true);
 const book=bookById(state.logBook),minutes=Number(state.logMinutes),date=state.logDate;
 if(!book)return toast('Choose a book first.',true);
 if(!Number.isInteger(minutes)||minutes<1||!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>today())return toast('Enter valid reading minutes and a date on or before today.',true);
 let pages=null,from=null,to=null,audioStart=null,audioEnd=null,startPage=null,endPage=null;
 if(!Object.prototype.hasOwnProperty.call(activityModes,state.logMode))return toast('Select a valid reading mode.',true);
 const passNumber=state.logPass==='auto'?readNumberForDate(book,date):Number(state.logPass);
 const passIssue=sessionPassError(book,date,passNumber);if(passIssue)return toast(passIssue+' Open the book and select Read history to correct it.',true);
 const progressContext=sessionPageStart(book,viewSessions(),{date,readNumber:passNumber,currentPass:currentReadNumber(book)});
 if(state.logMethod==='pages'){
  startPage=state.logStartingPage!==''?Number(state.logStartingPage):progressContext.startPage;
  endPage=state.logEndingPage;
  const progress=pagesFromEndingPage(startPage,endPage,book.page_count,progressContext.nextStartPage);
  if(progress.error)return toast(progress.error,true);
  pages=progress.pages;endPage=Number(endPage);
 }else if(state.logMethod==='chapters'){
  const cs=chapterMap(book.id);
  from=Number(state.chapterFrom||cs[0]?.chapter_number);to=Number(state.chapterTo||cs[0]?.chapter_number);
  pages=chapterPages(book.id,from,to);
  if(pages===null)return toast('Every selected chapter must have exact page boundaries for this edition.',true);
 }else if(state.logMethod==='audio_position'){
  if(state.logMode==='reading')return toast('Audio positions apply only to listening or read + listen.',true);
  audioStart=Number(state.logAudioStart);audioEnd=Number(state.logAudioEnd);
  if(!Number.isInteger(audioStart)||!Number.isInteger(audioEnd)||audioStart<0||audioEnd<=audioStart)
   return toast('Audiobook position must have a valid start minute and a later end minute.',true);
 }else return toast('Select a valid logging method.',true);
 if(state.logStartLocalTime&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(state.logStartLocalTime))return toast('Enter a valid local start time or leave it blank.',true);
 const row={id:crypto.randomUUID(),user_id:state.user.id,user_book_id:book.id,session_date:date,
  duration_minutes:minutes,start_local_time:state.logStartLocalTime||null,activity_mode:state.logMode,log_type:state.logMethod,pages_read:pages,
  start_page:startPage,end_page:endPage,
  chapter_from:from,chapter_to:to,audio_start_minute:audioStart,audio_end_minute:audioEnd,read_number:passNumber,notes:''};
 await run(async()=>{
  await repo.save('sessions',row);
  const newPage=state.logMethod==='chapters'
    ?Math.max(num(book.current_page),...(chapterMap(book.id).filter(c=>c.chapter_number>=from&&c.chapter_number<=to).map(c=>c.end_page)))
    :state.logMethod==='pages'?endPage:num(book.current_page);
  // A backdated entry or an earlier reading pass must not move current progress.
  const isLatestPass=passNumber===currentReadNumber(book)&&!progressContext.hasLaterSessions;
  await repo.save('books',{...book,current_page:isLatestPass?newPage:book.current_page,
   status:book.status==='tbr'?'reading':book.status,
   started_on:book.status==='tbr'&&!book.started_on?date:book.started_on});
  readingClock.reset();state.logDateTouched=false;suggestNewLogTime();resetLogPageDraft();startClockTicker();
 },`Saved ${activityModes[state.logMode]}: ${minutes} min, ${pages===null?'audio position '+audioStart+'–'+audioEnd+' min':pages+(state.logMode==='audiobook'?' page-equivalents':' pages')} for ${book.title}${state.logMethod==='pages'?' (page '+endPage+')':''}.`);
}
const updatedTbrDate=b=>b.status==='tbr'?(b.tbr_added_on||b.created_at?.slice(0,10)||today()):today();
async function saveBook(id){
 const b=bookById(id);if(!b||b.user_id!==state.user.id)return;
 const q=id=>app.querySelector('#'+id)?.value;
 const status=q('edit-status'),rating=q('edit-rating')===''?null:Number(q('edit-rating'));
 if(['finished','dnf'].includes(b.status)&&status==='reading')return toast('Use Start reread to preserve the previous reading history.',true);
 const pages=q('edit-pagecount')===''?null:Number(q('edit-pagecount'));
 const current=Number(q('edit-current'));
 const height=q('edit-height')===''?null:Number(q('edit-height'));
 const thickness=q('edit-thickness')===''?null:Number(q('edit-thickness'));
 const editionYear=q('edit-edition-year')===''?null:Number(q('edit-edition-year'));
 const originalYear=q('edit-original-year')===''?null:Number(q('edit-original-year'));
 const isbn=normalizeISBN(q('edit-isbn'));
 const asin=normalizeASIN(q('edit-asin'));
 let imageURL;try{imageURL=coverURL(q('edit-cover-url'));}catch(err){return toast(err.message,true);}
 if(isbn&&!isValidISBN(isbn))return toast('Enter a valid ISBN-10 or ISBN-13 (including its check digit).',true);
 if(asin&&!isValidASIN(asin))return toast('An Amazon ASIN must contain exactly 10 letters or digits.',true);
 const changedISBN=isbn!==normalizeISBN(b.isbn);
 if(changedISBN&&chapterMap(id).length)return toast('This book has exact chapter maps. Remove/reconcile those maps before changing its ISBN so chapter page counts stay accurate.',true);
 if([editionYear,originalYear].some(y=>y!==null&&(!Number.isInteger(y)||y<1500||y>2099)))return toast('Publication years must be 1500–2099.',true);
 if(pages!==null&&(!Number.isInteger(pages)||pages<=0))return toast('Page count must be a positive whole number.',true);
 if(!Number.isInteger(current)||current<0||(pages!==null&&current>pages))return toast('Current page must be between 0 and the book page count.',true);
 const seriesTotalRaw=q('edit-seriestotal');
 if(seriesTotalRaw && (!Number.isInteger(Number(seriesTotalRaw))||Number(seriesTotalRaw)<1||Number(seriesTotalRaw)>500))return toast('Series total must be a whole number between 1 and 500.',true);
 if((height!==null&&(height<=0||!Number.isFinite(height)))||(thickness!==null&&(thickness<=0||!Number.isFinite(thickness))))return toast('Physical dimensions must be positive numbers.',true);
 let finished=q('edit-finished')||null;
 // A historical, year-only finish must not silently become today's exact date.
 if(status==='finished'&&!finished&&!readingPasses(b).at(-1)?.finished_year)finished=today();
 if(status!=='finished')finished=null;
 const proposal=state.seriesPendingApply?.bookId===b.id?state.seriesPendingApply:null;
 const catalogApplied=Boolean(proposal && isSeriesSourceURL(proposal.source_url) &&
   q('edit-series')?.trim()===proposal.series_name &&
   Number(q('edit-seriesnum'))===Number(proposal.series_number) &&
   Number(q('edit-seriestotal'))===Number(proposal.series_total) &&
   (!b.series_total || b.series_total_source==='listofbooks'));
 const unchangedSource=Boolean(q('edit-seriestotal') && Number(q('edit-seriestotal'))===Number(b.series_total) &&
   q('edit-series')?.trim()===(b.series_name||seriesMetadata(b).series_name));
 const updated={...b,status,rating,started_on:q('edit-started')||null,finished_on:finished,
  page_count:pages,current_page:status==='finished'&&pages?pages:current,
  publisher:q('edit-publisher')||null,binding:q('edit-binding')||null,
  isbn:isbn||null,asin:asin||null,cover_url:imageURL,
  edition_key:changedISBN?null:b.edition_key,work_key:changedISBN?null:b.work_key,
  edition_year:editionYear,original_published_year:originalYear,published_year:editionYear||b.published_year||originalYear||null,
  height_mm:height,thickness_mm:thickness,genres:manualGenres(q('edit-genres')),series_name:q('edit-series')?.trim()||null,
  series_number:q('edit-seriesnum')?Number(q('edit-seriesnum')):null,
  series_total:q('edit-seriestotal')?Number(q('edit-seriestotal')):null,
  series_total_source:q('edit-seriestotal')?(catalogApplied?'listofbooks':unchangedSource?(b.series_total_source||'manual'):'manual'):null,
  series_source_url:q('edit-seriestotal')?(catalogApplied?proposal.source_url:unchangedSource?b.series_source_url||null:null):null,
  notes:q('edit-notes')||'', 
  tbr_added_on:status==='tbr'?(q('edit-tbr-added')||updatedTbrDate(b)):b.tbr_added_on||null};
 await run(async()=>{await repo.save('books',updateLatestPass(b,updated));state.bookLookup=null;state.seriesPendingApply=null;},'Book details saved. You can now look up metadata for this book.');
}
async function saveChapter(bookId){
 const b=bookById(bookId),n=Number(app.querySelector('#chapter-number')?.value),start=Number(app.querySelector('#chapter-start')?.value),end=Number(app.querySelector('#chapter-end')?.value),title=app.querySelector('#chapter-title')?.value.trim();
 if(!b||b.user_id!==state.user.id)return;
 if(!Number.isInteger(n)||n<1||!Number.isInteger(start)||start<1||!Number.isInteger(end)||end<start||b.page_count&&end>b.page_count)return toast('Enter a valid chapter number and exact page range for this edition.',true);
 const existing=chapterMap(bookId).find(c=>c.chapter_number===n);
 if(chapterMap(bookId).some(c=>c.id!==existing?.id&&start<=c.end_page&&end>=c.start_page))return toast('Chapter page ranges cannot overlap.',true);
 const row={id:existing?.id||crypto.randomUUID(),user_id:state.user.id,user_book_id:b.id,
  chapter_number:n,chapter_label:title||`Chapter ${n}`,start_page:start,end_page:end};
 await run(async()=>{await repo.save('chapters',row);},`Exact page mapping saved for Chapter ${n}.`);
}
async function searchBooks(){
 const query=state.searchQuery.trim();if(!query)return toast('Enter a title, author or ISBN.',true);
 state.searchBusy=true;state.searchError='';state.catalog=[];render();
 try{
  const googleKey=window.READING_ROOM_CONFIG?.googleBooksApiKey||'';
  state.catalog=await searchCatalog(query,googleKey);
  if(!state.catalog.length)state.searchError='No matching books found. Try another search or add the book manually.';
 }catch(err){state.searchError=`Catalog unavailable: ${err.message||'Unknown error'}. You can still add books manually.`;}
 finally{state.searchBusy=false;if(state.modal?.type==='search')render();}
}
async function chooseSearch(index){
 const b=state.catalog[index];if(!b)return;
 state.selectedSearch=b;state.selectedEdition=null;
 if(b.kind==='edition'){state.selectedEdition=b;state.modal={type:'search',step:'add'};render();return;}
 state.editions=[];state.searchBusy=true;state.modal={type:'search',step:'editions'};render();
 try{state.editions=await getEditions(b);}
 catch(err){state.searchError=err.message||'Unable to find editions';toast('Could not load editions. Try adding manually.',true);}
 finally{state.searchBusy=false;if(state.modal?.type==='search'&&state.modal.step==='editions')render();}
}
// A single-book add automatically checks edition-specific sources. It never
// writes suggested boundaries without the reader's explicit verification.
async function offerChaptersAfterBookAdd(book){
 if(!isbn13ForEdition(book.isbn))return;
 let found=null,shared=[];
 try{
  const [catalog,community]=await Promise.allSettled([
   lookupOpenLibraryChapters(book.isbn,(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(6500)})),
   repo.listSharedChapterMaps(book.isbn)
  ]);
  if(catalog.status==='fulfilled')found=catalog.value;
  if(community.status==='fulfilled')shared=community.value||[];
 }catch(_){/* Chapter lookup failure never rolls back a newly saved book. */}
 if(!found&&!shared.length)return;
 state.chapterDraftBookId=book.id;state.chapterDraft=null;state.chapterMessage='';
 state.sharedChapterOptions=shared;
 if(found)installChapterDraft(book,found);
 else state.chapterMessage=`${shared.length} community chapter map(s) were found for this ISBN. Select one to review.`;
 state.bookModalTab='chapters';openModal('book',{id:book.id});
}
async function addSelectedBook(){
 if(!state.selectedEdition)return;
 const book=toLibraryBook(state.selectedEdition,state.user.id,ownBooks().length+1);
 const pg=app.querySelector('#new-book-pages')?.value;
 if(pg){if(!Number.isInteger(Number(pg))||Number(pg)<1)return toast('Page count must be a positive whole number.',true);book.page_count=Number(pg);}
 book.status=app.querySelector('#new-book-status')?.value||'tbr';book.tbr_added_on=book.status==='tbr'?today():null;
 if(book.status==='finished')book.finished_on=today();
 if(book.status==='reading')book.started_on=today();
 if(ownBooks().some(b=>sameBook(b,book)))return toast('This book appears to be in your library already.',true);
 await run(async()=>{await repo.save('books',book);state.modal=null;state.activeId=state.user.id;},`${book.title} added to your library.`);
 if(state.data?.books.some(b=>b.id===book.id)){
  await enrichOneSeriesOnAdd(book);
  await offerChaptersAfterBookAdd(book);
 }
}
const parseIsoPrefix=v=>{const m=String(v||'').trim().match(/^(\d{4}-\d{2}-\d{2})/);return m?m[1]:null;};

function parseGoodreadsReadingSessions(text){
 const raw=JSON.parse(text);
 if(!Array.isArray(raw))throw new Error('Expected a JSON array in reading_sessions.json.');
 const byTitle={};
 for(const item of raw){
  if(!item||typeof item!=='object'||!item.book)continue;
  const key=normTitle(item.book);
  const start=parseIsoPrefix(item.started_at);
  const end=parseIsoPrefix(item.ended_at);
  const st=String(item.state||'').toUpperCase();
  if(!start&&!end&&!st)continue;
  (byTitle[key]=byTitle[key]||[]).push({
   status:st==='COMPLETED'?'finished':st==='READING'?'reading':'dnf',
   started_on:start,
   finished_on:st==='COMPLETED'?end:null
  });
 }
 for(const key of Object.keys(byTitle)){
  byTitle[key].sort((a,b)=>{
   const da=a.finished_on||a.started_on||'9999-99-99';
   const db=b.finished_on||b.started_on||'9999-99-99';
   return da.localeCompare(db);
  });
 }
 return byTitle;
}

function parseGoodreadsGenreRecommendations(text){
 const raw=JSON.parse(text);
 if(!Array.isArray(raw))throw new Error('Expected a JSON array in genre_recommendation.json.');
 const map={};
 const addGenre=(title,genre)=>{
  const k=normTitle(title);
  const g=String(genre||'').trim().replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  if(!k||!g)return;
  if(!map[k])map[k]=[];
  if(!map[k].includes(g))map[k].push(g);
 };
 for(const item of raw){
  if(!item||typeof item!=='object'||!item.genre)continue;
  if(Array.isArray(item.recommended_because_you_added)){
   for(const src of item.recommended_because_you_added)addGenre(src,item.genre);
  }
  if(item.book)addGenre(item.book,item.genre);
 }
 return map;
}

function reportImportProgress(p){
 state.importProgress={...p};
 if(p.processed===0 || p.processed%5===0 || p.processed===p.total)render();
}
async function runMetadataImport(books, plan=null){
 if(state.busy)return;
 state.busy=true;state.importAbortRequested=false;
 state.importProgress={phase:'Saving Goodreads CSV rows',processed:0,total:0,saved:0,genreFilled:0,editionMatched:0,unresolved:0,errors:0};
 render();
 try {
  if(plan){
   if(plan.additions.length)await repo.saveMany('books',plan.additions);
   for(const b of plan.updates)await repo.save('books',b);
  }
  const googleKey=window.READING_ROOM_CONFIG?.googleBooksApiKey||'';
  const result=await enrichAfterGoodreadsImport(books,{
   googleKey,save:b=>repo.save('books',b),
   shouldStop:()=>state.importAbortRequested,
   onProgress:reportImportProgress
  });
  const first=plan?`Saved ${plan.additions.length} new book${plan.additions.length===1?'':'s'}; filled missing CSV fields on ${plan.updates.length} existing books. `:'';
  const summary=`${first}Catalog enrichment: ${result.saved} books updated, ${result.genreFilled} genre assignments, ${result.editionMatched} confident editions; ${result.unresolved} incomplete matches; ${result.seriesFilled} books got catalog series details${result.seriesDeferred?`, ${result.seriesDeferred} series left for later lookup`:''}${result.errors?`, ${result.errors} errors`:''}.${result.stopped?' Paused: reimport the same CSV or run Fill missing metadata to resume.':''}`;
  state.lastImportReport=summary;state.importSummary=summary;
  if(plan){state.importRows=[];state.importSessionsByTitle={};state.importGenresByTitle={};}
  state.modal=null;await sync(true);toast(result.stopped?'Enrichment paused; saved data is retained.':'Import and metadata enrichment complete.');
 } catch(err){
  // Imported rows remain in the database even if a later provider request fails.
  state.importSummary='Import interrupted: '+(err.message||'Unknown error')+'. You may safely retry.';
  await sync(true);toast(state.importSummary,true);
 } finally {
  state.busy=false;state.importProgress=null;state.importAbortRequested=false;
  render();
 }
}
async function importGoodreads(){
 const plan=prepareGoodreadsImport(state.importRows,ownBooks());
 if(!plan.all.length)return toast('Choose a Goodreads CSV first.',true);
 await runMetadataImport(plan.all,plan);
}
function downloadFile(name,content,type){
 const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),6000);
}
function exportData(){
 const ownerId=state.user.id;
 const contents={exported_at:new Date().toISOString(),profile:profileById(ownerId),
  books:state.data.books.filter(x=>x.user_id===ownerId),sessions:state.data.sessions.filter(x=>x.user_id===ownerId),
  chapters:state.data.chapters.filter(x=>x.user_id===ownerId),goals:state.data.goals.filter(x=>x.user_id===ownerId),
  shelf:state.data.shelves.find(x=>x.user_id===ownerId)||null};
 downloadFile(`reading-room-backup-${today()}.json`,JSON.stringify(contents,null,2),'application/json');
}
function exportBooksCSV(){
 const keys=['title','author','isbn','asin','status','favorite','rating','page_count','publisher','binding','edition_year','original_published_year','edition_key','genres','goodreads_added_on','tbr_added_on','started_on','finished_on','series_name','series_number','series_total','series_total_source','series_source_url','notes'];
 const rows=[keys,...ownBooks().map(b=>keys.map(k=>Array.isArray(b[k])?b[k].join('; '):b[k]??''))];
 const csv=rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');
 downloadFile(`reading-room-books-${today()}.csv`,csv,'text/csv;charset=utf-8');
}
let cameraStream=null,cameraFrame=null;
function stopCamera(){
 if(cameraFrame)cancelAnimationFrame(cameraFrame);cameraFrame=null;
 if(cameraStream){cameraStream.getTracks().forEach(t=>t.stop());cameraStream=null;}
}
async function scanISBN(){
 if(!('BarcodeDetector' in window)||!navigator.mediaDevices?.getUserMedia){
  toast('Camera barcode scanning is not supported in this browser. Enter the ISBN in the search field.',true);return;
 }
 try{
  const formats=await BarcodeDetector.getSupportedFormats();
  const usable=['ean_13','upc_a','ean_8'].filter(x=>formats.includes(x));
  if(!usable.length){toast('This browser cannot scan ISBN barcodes. Type the ISBN instead.',true);return;}
  cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
  const host=app.querySelector('#camera-container');if(!host)return stopCamera();
  host.innerHTML='<div class="notice">Point your camera at the barcode on the back of your book.</div><video id="isbn-camera" autoplay muted playsinline style="width:100%;max-height:260px;object-fit:cover;border-radius:10px"></video><button class="btn sm" data-action="stop-camera">Stop camera</button>';
  const video=host.querySelector('video');video.srcObject=cameraStream;await video.play();
  const detector=new BarcodeDetector({formats:usable});
  const tick=async()=>{
   if(!cameraStream)return;
   try{const detected=await detector.detect(video);
    const code=detected.map(x=>String(x.rawValue||'').replace(/\D/g,'')).find(x=>x.length===13&&(x.startsWith('978')||x.startsWith('979')));
    if(code){state.searchQuery=code;stopCamera();await searchBooks();return;}
   }catch(_){/* Camera can be temporarily unavailable while focusing. */}
   cameraFrame=requestAnimationFrame(tick);
  };
  cameraFrame=requestAnimationFrame(tick);
 }catch(err){stopCamera();toast('Camera unavailable: '+(err.message||'Permission denied'),true);}
}
async function reorderBooks(fromId,toId){
 if(!own()||!fromId||!toId||fromId===toId)return;
 const list=viewBooks().sort((a,b)=>(a.shelf_order||0)-(b.shelf_order||0));
 const from=list.findIndex(b=>b.id===fromId),to=list.findIndex(b=>b.id===toId);
 if(from<0||to<0)return;
 const [item]=list.splice(from,1);list.splice(to,0,item);
 await run(async()=>{
  const changed=list.filter((b,i)=>b.shelf_order!==i+1);
  for(const b of changed)await repo.save('books',{...b,shelf_order:list.indexOf(b)+1});
 },'Bookshelf order saved.');
}

app.addEventListener('click',async e=>{
 const navigation=e.target.closest('[data-tab]');
 if(navigation){e.preventDefault();const target=navigation.dataset.tab;if(target==='log'&&state.tab!=='log')suggestNewLogTime();state.tab=target;if(state.tab==='friends')state.feedLimit=30;if(state.tab==='recaps'&&own()){const p=replayPeriod(state.replayKind,today(),state.replayOffset);markReplaySeen({ownerId:state.user.id,kind:state.replayKind,end:p.end,storage:globalThis.localStorage});refreshReplayReady();}window.scrollTo({top:0,behavior:'instant'});render();return;}
 const filter=e.target.closest('[data-filter]');
 if(filter){state.filter=filter.dataset.filter;render();return;}
 const lv=e.target.closest('[data-library-view]');
 if(lv){state.libraryView=lv.dataset.libraryView==='table'?'table':'cards';render();return;}
 const ls=e.target.closest('[data-library-sort]');
 if(ls){const col=ls.dataset.librarySort;state.librarySortDir=state.librarySort===col&&state.librarySortDir==='asc'?'desc':'asc';state.librarySort=col;render();return;}
 const friendView=e.target.closest('[data-friends-view]');if(friendView){state.friendsView=friendView.dataset.friendsView==='compare'?'compare':'activity';render();return;}
 const feedFilter=e.target.closest('[data-feed-type]');if(feedFilter){state.feedType=feedFilter.dataset.feedType;state.feedLimit=30;render();return;}
 const comparePeriod=e.target.closest('[data-compare-period]');if(comparePeriod){state.comparePeriod=comparePeriod.dataset.comparePeriod;render();return;}
 const replayKind=e.target.closest('[data-replay-kind]');if(replayKind){state.replayKind=replayKind.dataset.replayKind;state.replayOffset=0;state.replaySlide=0;if(own()){const p=replayPeriod(state.replayKind,today());markReplaySeen({ownerId:state.user.id,kind:state.replayKind,end:p.end,storage:globalThis.localStorage});refreshReplayReady();}render();return;}
 const replaySlide=e.target.closest('[data-replay-slide]');if(replaySlide){state.replaySlide=Number(replaySlide.dataset.replaySlide);render();return;}
 const detail=e.target.closest('[data-insights-view]');if(detail){state.insightsView=detail.dataset.insightsView==='detailed'?'detailed':'summary';render();return;}
 const period=e.target.closest('[data-period]');if(period){state.period=period.dataset.period;render();return;}
 const metric=e.target.closest('[data-metric]');if(metric){state.metric=metric.dataset.metric;render();return;}
 const mode=e.target.closest('[data-logmethod]');if(mode){state.logMethod=mode.dataset.logmethod;render();return;}
 const tab=e.target.closest('[data-booktab]');if(tab){state.bookModalTab=tab.dataset.booktab;render();return;}
 const auth=e.target.closest('[data-authmode]');if(auth){state.authMode=auth.dataset.authmode;state.authMessage='';render();return;}
 if(e.target.classList.contains('modal-backdrop')){closeModal();return;}
 const action=e.target.closest('[data-action]');if(!action)return;
 const act=action.dataset.action,id=action.dataset.id;
 try{
 switch(act){
 case 'replay-ready-open':{
  const kind=action.dataset.replayKind,end=action.dataset.replayEnd;
  if(!own()||!['week','month','year'].includes(kind))break;
  const offset=replayOffsetForEnd(kind,today(),end);
  if(offset===null)return toast('That recap is unavailable. Open Recaps to browse completed periods.',true);
  markReplaySeen({ownerId:state.user.id,kind,end,storage:globalThis.localStorage});
  state.replayKind=kind;state.replayOffset=offset;state.replaySlide=0;state.tab='recaps';
  refreshReplayReady();window.scrollTo({top:0,behavior:'instant'});render();break;
 }
 case 'replay-ready-dismiss':dismissReplayReady();render();break;
 case 'replay-older':state.replayOffset=Math.max(-300,state.replayOffset-1);state.replaySlide=0;render();break;
 case 'replay-newer':state.replayOffset=Math.min(0,state.replayOffset+1);state.replaySlide=0;render();break;
 case 'replay-prev':state.replaySlide=Math.max(0,state.replaySlide-1);render();break;
 case 'replay-next':state.replaySlide=Math.min(readingReplaySlideCount(state.replayKind)-1,state.replaySlide+1);render();break;
 case 'replay-copy':{
  if(!own())return toast('Only the profile owner can copy their recap.',true);
  try{await navigator.clipboard.writeText(readingReplayShareText(getReplayModel()));toast('Recap summary copied. You choose if and where to share it.');}
  catch{toast('Unable to copy automatically. Try a secure browser connection.',true);}
  break;
 }
 case 'feed-more':state.feedLimit+=30;render();break;
 case 'view-friend-book':{
  const owner=action.dataset.owner,book=bookById(id);
  if(!book||book.user_id!==owner||(owner!==state.user.id&&shareLevelFor(owner)!=='full'))return toast('This book is no longer shared with you.',true);
  state.activeId=owner;state.tab='library';state.bookModalTab='details';openModal('book',{id});break;
 }
 case 'open-insight-books':{
  if(summaryOnly())return;
  const kind=action.dataset.drillKind,value=action.dataset.value,label=action.dataset.label;
  if(!['genre-all','genre-read','genre-unread','genre-rating','rating','tbr-age','series'].includes(kind))return;
  openModal('insight-books',{kind,value,label});break;
 }
 case 'series-lookup':{
  const name=action.dataset.series||'',key=seriesKey(name);
  if(!name||!key||state.seriesLoading)return;
  state.seriesLoading=key;state.seriesOpen=key;render();
  try {
    const result=await fetchSeriesLookup({series:name});
    const found=seriesStatistics(viewBooks(),viewSessions()).series.find(x=>seriesKey(x.name)===key);
    const author=viewBooks().find(b=>seriesKey(seriesMetadata(b).series_name)===key)?.author||'';
    state.seriesCatalog[key]=result&&catalogSeriesMatch(result,{seriesName:name,author})?{result}:{error:'The provider did not return an exact series/author match. No count was changed.'};
  }catch(err){state.seriesCatalog[key]={error:err.message||'Series lookup unavailable.'};}
  finally{state.seriesLoading='';render();}
  break;
 }
 case 'series-book-lookup':case 'series-book-full':{
  const book=bookById(id);if(!book||book.user_id!==state.user.id||state.seriesLoading)return;
  const key=seriesMetadata(book).series_name;
  state.seriesLoading=book.id;render();
  try {
    const details=act==='series-book-full'?await fetchSeriesLookup({series:state.seriesBookCatalog[book.id]?.result?.title||key}):
      await fetchSeriesLookup(key?{series:key}:{title:book.title,author:book.author});
    state.seriesBookCatalog[book.id]=details&&catalogSeriesMatch(details,{seriesName:key,author:book.author,title:book.title})?{result:details}:{error:'No exact matching series found. Enter the information manually instead.'};
  }catch(err){state.seriesBookCatalog[book.id]={error:err.message||'Series lookup unavailable.'};}
  finally{state.seriesLoading='';render();}
  break;
 }
 case 'series-book-apply':{
  const book=bookById(id),details=state.seriesBookCatalog[id]?.result;
  if(!book||book.user_id!==state.user.id||!details)return;
  const proposed=proposedSeriesFields(book,details);if(!proposed)return toast('Catalog series does not match this book.',true);
  const fields=[['edit-series',proposed.series_name],['edit-seriesnum',proposed.series_number],['edit-seriestotal',proposed.series_total]];
  for(const [name,value] of fields){const input=app.querySelector('#'+name);if(input&&!input.value&&value!=null)input.value=String(value);}
  state.seriesPendingApply={...proposed,bookId:book.id,source_url:details.url};
  toast('Missing series fields filled in the form. Review, then select Save book. Existing values were not changed.');break;
 }
 case 'series-apply-group':{
  const name=action.dataset.series||'',details=state.seriesCatalog[seriesKey(name)]?.result;
  if(!own()||!details)return;
  const affected=ownBooks().filter(b=>seriesKey(seriesMetadata(b).series_name)===seriesKey(name)).map(b=>fillMissingSeriesFields(b,details)).filter(Boolean);
  if(!affected.length)return toast('No missing series fields to fill.');
  await run(async()=>{for(const row of affected)await repo.save('books',row);},`Saved missing series information on ${affected.length} book${affected.length===1?'':'s'}.`);
  break;
 }
 case 'open-book':
  if(!bookById(id))return;
  state.bookModalTab=action.dataset.chapters==='yes'?'chapters':'details';openModal('book',{id});break;
 case 'toggle-log-book-scope':{
  if(!own())return;
  state.logBookScope=state.logBookScope==='reading'?'all':'reading';
  state.logBookQuery='';reconcileLogBook();render();
  if(state.logBookScope==='all')app.querySelector('#log-book-search')?.focus();
  break;
 }
 case 'search-modal':state.searchQuery='';state.catalog=[];state.editions=[];openModal('search',{step:'results'});break;
 case 'manual-modal':openModal('manual');break;
 case 'import-modal':state.importRows=[];state.importSessionsByTitle={};state.importGenresByTitle={};openModal('import');break;
 case 'enrich-books':{
  if(!own())return;
  const books=ownBooks();if(!books.length)return toast('Your library is empty.');
  state.modal={type:'enrichment'};await runMetadataImport(books);
  break;
 }
 case 'stop-import-enrichment':state.importAbortRequested=true;toast('Pausing after the current catalog request.');break;
 case 'match-editions':{
  if(!own())return;
  const books=ownBooks().filter(b=>!b.edition_key);
  if(!books.length)return toast('All your books already have an edition reference.');
  toast(`Checking possible editions for ${books.length} books. Matches require agreement on multiple edition fields; uncertain results will remain unmatched.`);
  const googleKey=window.READING_ROOM_CONFIG?.googleBooksApiKey||'';
  await run(async()=>{
   let matched=0,updated=0;
   for(const b of books){
    const enriched=await enrichBookMetadata(b,googleKey,{preserveCover:true,matchEdition:true});
    if(['cover_url','genres','isbn','work_key','edition_key','publisher','binding','page_count','edition_year','original_published_year','description'].some(k=>JSON.stringify(enriched[k]??null)!==JSON.stringify(b[k]??null))){
     await repo.save('books',enriched);updated++;
    }
    if(enriched.edition_key&&!b.edition_key)matched++;
   }
   toast(`Matched ${matched} candidate editions; updated metadata on ${updated} books. Please confirm edition details before using chapter page maps.`);
  },'');
  break;
 }
 case 'refresh-genres':{
  if(!own())return;
  const books=ownBooks();
  if(!books.length)return toast('Your library is empty.');
  toast(`Refreshing clean genres for ${books.length} books (covers untouched)â€¦`);
  const googleKey=window.READING_ROOM_CONFIG?.googleBooksApiKey||'';
  await run(async()=>{
   let updated=0;
   for(const b of books){
    const enriched=await enrichBookMetadata(b,googleKey,{preserveCover:true,forceGenres:true});
    if(enriched.genres?.length&&JSON.stringify(enriched.genres)!==JSON.stringify(b.genres||[])){
     await repo.save('books',{...b,genres:enriched.genres,work_key:enriched.work_key||b.work_key});
     updated++;
    }
   }
   toast(`Updated clean genres on ${updated} books without changing any covers.`);
  },'');
  break;
 }
 case 'apply-gr-extras':{
  if(!own())return;
  const sMap=state.importSessionsByTitle||{};
  const gMap=state.importGenresByTitle||{};
  if(!Object.keys(sMap).length&&!Object.keys(gMap).length)return toast('Upload a Goodreads JSON file first.',true);
  await run(async()=>{
   let updated=0;
   for(const b of ownBooks()){
    let changed=false;
    const patch={...b};
    if(Object.keys(sMap).length){
     const history=buildGoodreadsReadHistory(b.title,b.status,b.started_on,b.finished_on,2,sMap);
     if(history.length&&!(Array.isArray(b.read_history)&&b.read_history.length)){
      const latest=history.at(-1);
      patch.read_history=history;
      patch.started_on=latest?.started_on||b.started_on||null;
      patch.finished_on=b.status==='finished'?(latest?.finished_on||b.finished_on||null):null;
      changed=true;
     }
    }
    const grGenres=gMap[normTitle(b.title)];
    if(grGenres?.length){
     patch.genres=[...new Set([...grGenres,...(b.genres||[])])];
     changed=true;
    }
    if(changed){
     await repo.save('books',patch);
     updated++;
    }
   }
   state.modal=null;
   toast(`Updated ${updated} books with Goodreads dates & genres.`);
  },'');
  break;
 }
 case 'close-modal':closeModal();break;
 case 'scan-isbn':await scanISBN();break;
 case 'stop-camera':stopCamera();const holder=app.querySelector('#camera-container');if(holder)holder.innerHTML='';break;
 case 'choose-search':await chooseSearch(Number(action.dataset.index));break;
 case 'select-edition':state.selectedEdition=state.editions[Number(action.dataset.index)];state.modal.step='add';render();break;
 case 'search-back':state.modal.step=state.modal.step==='add'?(state.selectedSearch?.kind==='edition'?'results':'editions'):'results';render();break;
 case 'confirm-add-book':await addSelectedBook();break;
 case 'save-book':await saveBook(id);break;
 case 'preview-cover-url':{
  const holder=app.querySelector('#manual-cover-preview');
  let url;try{url=coverURL(app.querySelector('#edit-cover-url')?.value);}catch(err){return toast(err.message,true);}
  if(!url){if(holder)holder.innerHTML='<span class="tiny">No cover URL entered.</span>';return;}
  if(holder)holder.innerHTML='<span class="tiny">Checking cover image…</span>';
  const available=await checkCoverLoads(url);
  if(holder)holder.innerHTML=available?`<img src="${esc(url)}" alt="Cover URL preview" referrerpolicy="no-referrer" loading="lazy"/>`:'<span class="tiny">Unable to load this image. Check the URL or hosting restrictions.</span>';
  break;
 }
 case 'add-book-genre':{
  const kind=action.dataset.genreScope;
  if(!['edit','manual'].includes(kind))break;
  const field=app.querySelector(`#${kind}-genres`);
  const choice=app.querySelector(`#${kind}-add-genre`)?.value;
  if(!field||!choice)return toast('Select a genre from the dropdown first.',true);
  try{updateGenrePicker(kind,addSelectedGenre(field.value,choice));}
  catch(err){toast(err.message,true);}
  break;
 }
 case 'remove-book-genre':{
  const kind=action.dataset.genreScope;
  if(!['edit','manual'].includes(kind))break;
  const field=app.querySelector(`#${kind}-genres`);
  if(field)updateGenrePicker(kind,removeSelectedGenre(field.value,action.dataset.genre));
  break;
 }
 case 'primary-book-genre':{
  const kind=action.dataset.genreScope;
  if(!['edit','manual'].includes(kind))break;
  const field=app.querySelector(`#${kind}-genres`);
  if(field)try{updateGenrePicker(kind,primarySelectedGenre(field.value,action.dataset.genre));}
  catch(err){toast(err.message,true);}
  break;
 }
 case 'lookup-book-metadata':{
  const book=bookById(id);if(!book||book.user_id!==state.user.id||state.lookupBusy)return;
  // Never let an asynchronous lookup silently discard unsaved identifiers or cover edits.
  if(hasUnsavedBookEdits(book)){
    return toast('Save your book edits first, then press Look up metadata & cover. This protects unsaved notes and genres.',true);
  }
  state.lookupBusy=true;state.bookLookup=null;render();
  try{
    const found=await lookupBookOnRequest(book,window.READING_ROOM_CONFIG?.googleBooksApiKey||'');
    state.bookLookup={bookId:book.id,...found};
    toast('Catalog suggestions loaded. Review them before applying.');
  }catch(err){toast(err.message||'Catalog lookup failed.',true);}
  finally{state.lookupBusy=false;render();}
  break;
 }
 case 'dismiss-book-lookup':state.bookLookup=null;render();break;
 case 'apply-book-lookup':{
  const book=bookById(id),pending=state.bookLookup;
  if(!book||book.user_id!==state.user.id||pending?.bookId!==book.id)return;
  const useCover=Boolean(app.querySelector('#apply-lookup-cover')?.checked);
  const updated=mergeReviewedMetadata(book,pending,{useCover});
  if(normalizeISBN(updated.isbn)!==normalizeISBN(book.isbn)&&chapterMap(id).length){
    return toast('Review or remove exact chapter maps before changing an edition ISBN.',true);
  }
  await run(async()=>{await repo.save('books',updated);state.bookLookup=null;},'Reviewed metadata saved. Existing manual details were preserved.');
  break;
 }
 case 'edit-read-history':state.bookModalTab='history';render();break;
 case 'add-read-pass':{
  const book=bookById(id);if(!book||book.user_id!==state.user.id)return;
  const rows=app.querySelector('#read-history-editor-rows');if(!rows)return;
  const next=rows.querySelectorAll('[data-read-pass-row]').length;
  if(next>=9999)return toast('Maximum number of reading passes reached.',true);
  rows.insertAdjacentHTML('beforeend',readHistoryEditorRow({status:'reading',started_on:today(),finished_on:null},next,true));
  rows.lastElementChild?.scrollIntoView({block:'nearest',behavior:'smooth'});
  break;
 }
 case 'remove-read-pass':{
  const row=action.closest('[data-read-pass-row]'),rows=app.querySelector('#read-history-editor-rows');
  if(!row||!rows||row!==rows.lastElementChild||rows.children.length<2)return toast('Only the most recent reread can be removed.',true);
  const n=rows.children.length;
  const book=bookById(state.modal?.id);
  if(state.data.sessions.some(s=>s.user_book_id===book?.id&&Number(s.read_number||1)>=n))return toast('This reread contains sessions. Reassign them before removing it.',true);
  row.remove();break;
 }
 case 'save-read-history':await saveReadHistory(id,false);break;
 case 'reassign-read-history':await saveReadHistory(id,true);break;
 case 'start-reread':{
  const book=bookById(id);if(!book||book.user_id!==state.user.id)return;
  if(!['finished','dnf'].includes(book.status))return toast('Finish this book before beginning another read.',true);
  if(!confirm(`Start a new reading pass for ${book.title}? Your earlier completion dates and logs will remain saved. Current page will reset to 0.`))return;
  await run(async()=>{await repo.save('books',beginReread(book,today()));},'Reread started. Original completion preserved.');break;
 }
 case 'toggle-favorite':{
  const b=bookById(id);if(!b||b.user_id!==state.user.id)return;
  await run(()=>repo.save('books',{...b,favorite:!b.favorite}),b.favorite?'Removed from Favorites.':'Added to Favorites.');break;
 }
 case 'chapter-openlibrary':{
  const book=bookById(id);if(!book||book.user_id!==state.user.id||state.chapterBusy)return;
  state.chapterBusy=true;state.chapterMessage='';render();
  try{
   const found=await lookupOpenLibraryChapters(book.isbn);
   if(state.modal?.id===id){installChapterDraft(book,found);render();}
  }catch(err){state.chapterMessage=err.message||'Could not find chapter metadata.';render();}
  finally{state.chapterBusy=false;render();}
  break;
 }
 case 'chapter-shared-list':{
  const book=bookById(id);if(!book||book.user_id!==state.user.id||state.chapterBusy)return;
  if(!isbn13ForEdition(book.isbn))return toast('Save a valid ISBN first.',true);
  state.chapterBusy=true;state.chapterMessage='';render();
  try{
   const options=await repo.listSharedChapterMaps(book.isbn);
   if(state.modal?.id===id){state.chapterDraftBookId=id;state.sharedChapterOptions=options;state.chapterMessage=options.length?`${options.length} shared map(s) found for your ISBN. Choose one to review.`:'No community map has been contributed for this ISBN yet.';}
  }catch(err){state.chapterMessage=err.message||'Could not load community maps.';}
  finally{state.chapterBusy=false;render();}
  break;
 }
 case 'chapter-use-shared':{
  const book=bookById(id);if(!book||book.user_id!==state.user.id)return;
  const shared=state.sharedChapterOptions[Number(action.dataset.index)];
  try{
   const rows=reviewedSharedCandidate(shared,book.isbn);
   installChapterDraft(book,{source:'Reader-contributed map',sourceTitle:'',sourcePages:shared.page_count||null,sourceUrl:'',rows,warnings:['Community contributions are not independently verified; check each boundary before saving.']});
   render();
  }catch(err){toast(err.message,true);}
  break;
 }
 case 'chapter-photo-up':case 'chapter-photo-down':case 'chapter-photo-remove':{
  if(state.chapterBusy||state.modal?.type!=='book')break;
  const i=Number(action.dataset.index),photos=state.chapterPhotos;
  if(!Number.isInteger(i)||i<0||i>=photos.length)break;
  if(act==='chapter-photo-remove'){
   const [item]=photos.splice(i,1);if(item.preview&&typeof URL!=='undefined')URL.revokeObjectURL?.(item.preview);
  }else{
   const j=i+(act==='chapter-photo-up'?-1:1);
   if(j<0||j>=photos.length)break;
   [photos[i],photos[j]]=[photos[j],photos[i]];
  }
  invalidateScannedDraft();render();break;
 }
 case 'chapter-scan-photo':{
  const book=bookById(id);if(!book||book.user_id!==state.user.id||state.chapterBusy)return;
  const files=state.chapterPhotos.map(x=>x.file);
  if(!files.length)return toast('Add one or more table of contents photos first.',true);
  state.chapterBusy=true;state.chapterMessage=`Scanning ${files.length} ordered photo${files.length===1?'':'s'} on your device…`;render();
  try{
   const found=await scanContentsPhotos(files,{onProgress:(i,total)=>{
    if(state.modal?.id===id){state.chapterMessage=`Scanning photo ${i} of ${total} on this device…`;render();}
   }});
   if(state.modal?.id===id){installChapterDraft(book,found);state.chapterMessage=`Combined ${files.length} contents photo${files.length===1?'':'s'} into one draft. Check every page boundary.`;render();}
  }catch(err){state.chapterMessage=err.message||'Could not recognize the contents photos.';render();}
  finally{state.chapterBusy=false;render();}
  break;
 }
 case 'chapter-parse-paste':{
  const book=bookById(id);if(!book||book.user_id!==state.user.id)return;
  const contents=app.querySelector('#chapter-pasted-contents')?.value||'';
  try{installChapterDraft(book,draftFromContentsText(contents));render();}
  catch(err){toast(err.message,true);}
  break;
 }
 case 'chapter-add-row':{
  if(!state.chapterDraft||state.chapterDraft.rows.length>=300)return toast('Maximum of 300 chapters per mapping.',true);
  readChapterDraftRows();const index=state.chapterDraft.rows.length+1;
  state.chapterDraft.rows.push({chapter_number:index,chapter_label:`Chapter ${index}`,start_page:'',end_page:''});render();break;
 }
 case 'chapter-remove-row':{
  if(!state.chapterDraft)return;
  readChapterDraftRows();state.chapterDraft.rows.splice(Number(action.dataset.index),1);
  state.chapterDraft.rows.forEach((r,i)=>r.chapter_number=i+1);render();break;
 }
 case 'chapter-discard-draft':state.chapterDraft=null;state.chapterMessage='Candidate map discarded. Saved chapters were not changed.';render();break;
 case 'chapter-apply-map':{
  const book=bookById(id);if(!book||book.user_id!==state.user.id||!state.chapterDraft)return;
  readChapterDraftRows();
  if(!app.querySelector('#chapter-verified-checkbox')?.checked)return toast('Confirm that you checked every page boundary against this exact edition.',true);
  let checked;
  try{checked=validateVerifiedChapterMap(state.chapterDraft.rows,book);}
  catch(err){return toast(err.message,true);}
  const existing=chapterMap(id);
  if(existing.length&&!confirm(`Replace ${existing.length} saved chapter boundaries with ${checked.length} verified chapters? Previously logged sessions retain their recorded page totals.`))return;
  await run(async()=>{await repo.replaceChapterMap(id,checked);state.chapterDraft=null;state.chapterMessage='Verified page boundaries saved. Chapter logging can now calculate pages.';},`Saved ${checked.length} verified chapters.`);
  break;
 }
 case 'chapter-withdraw':{
  const book=bookById(id);if(!book||book.user_id!==state.user.id)return;
  if(!confirm('Withdraw your contributed chapter map for this ISBN? Your personal chapter map and reading sessions stay unchanged.'))return;
  await run(async()=>{await repo.withdrawChapterMap(id);state.sharedChapterOptions=[];state.chapterMessage='Your community contribution has been withdrawn. Your private chapters remain.';},'Your community map contribution was withdrawn if one existed.');
  break;
 }
 case 'chapter-publish':{
  const book=bookById(id);if(!book||book.user_id!==state.user.id)return;
  if(!isbn13ForEdition(book.isbn))return toast('Save a valid ISBN before sharing chapter maps.',true);
  if(!confirm('Contribute your current exact chapter names and page boundaries for this ISBN to other signed-in readers? No personal reading data is shared.'))return;
  await run(async()=>{await repo.publishChapterMap(id);state.chapterMessage='Your chapter map was contributed. Other readers must review it before use.';},'Your chapter map is available to readers with the matching ISBN.');
  break;
 }
 case 'save-chapter':await saveChapter(id);break;
 case 'delete-chapter':{
  if(!confirm('Delete this exact chapter mapping? Existing reading sessions will retain the pages logged at the time.'))return;
  await run(()=>repo.remove('chapters',id),'Chapter boundary deleted.');break;
 }
 case 'delete-book':{
  const b=bookById(id);if(!b||b.user_id!==state.user.id)return;
  if(!confirm(`Remove ${b.title} and all its reading sessions and chapter mappings? This cannot be undone.`))return;
  await run(async()=>{await repo.remove('books',id);state.modal=null;},'Book removed from your library.');break;
 }
 case 'toggle-log-start-page':state.logStartOverrideOpen=!state.logStartOverrideOpen;if(!state.logStartOverrideOpen)state.logStartingPage='';render();break;
 case 'save-log':await saveLog();break;
 case 'delete-session':{
  if(!own()||!confirm('Delete this reading session?'))return;
  await run(()=>repo.remove('sessions',id),'Reading session deleted. Review book progress if needed.');break;
 }
 case 'clock-toggle':{
  if(readingClock.running)readingClock.pause();else readingClock.start();
  startClockTicker();render();break;
 }
 case 'clock-reset':readingClock.reset();startClockTicker();render();break;
 case 'clock-use':{
  readingClock.pause();startClockTicker();
  const minutes=readingClock.elapsedMinutes();if(!minutes)return toast('Start the stopwatch before using its time.',true);
  state.logMinutes=String(minutes);
  const started=readingClock.firstStartedAtMs;
  if(started){state.logStartLocalTime=localClockTime(new Date(started));state.logDate=localDate(new Date(started));state.logDateTouched=true;state.logTimeManual=false;}
  render();
  toast(`${minutes} minute${minutes===1?'':'s'} transferred. Review duration, add the page you reached or exact chapters, then save.${minutes>360?' Check the duration: it exceeds six hours.':''}`);break;
 }
 case 'toggle-book-days':state.showAllBookDays=!state.showAllBookDays;render();break;
 case 'shelf-prev':state.shelfPage=Math.max(0,state.shelfPage-1);render();break;
 case 'shelf-next':state.shelfPage++;render();break;
 case 'shelf-left':case 'shelf-right':{
  const picked=app.querySelector('#shelf-move-book')?.value;
  const all=viewBooks().sort((a,b)=>(a.shelf_order||0)-(b.shelf_order||0));
  const i=all.findIndex(b=>b.id===picked),j=i+(act==='shelf-left'?-1:1);
  if(i<0||j<0||j>=all.length)return toast('That book is already at the edge of your shelf.');
  await reorderBooks(picked,all[j].id);break;
 }
 case 'save-goal':{
  if(!own())return;
  const target=Number(app.querySelector('#annual-goal')?.value);
  if(!Number.isInteger(target)||target<1||target>10000)return toast('Annual target must be a whole number between 1 and 10,000.',true);
  await run(()=>repo.save('goals',goalRecord(state.insightYear,{books_target:target})),'Annual reading goal saved.');break;
 }
 case 'save-daily-goal':{
  if(!own())return;
  const target=Number(app.querySelector('#daily-goal-minutes')?.value);
  if(!Number.isInteger(target)||target<1||target>1440)return toast('Daily goal must be a whole number from 1 to 1,440 minutes.',true);
  await run(()=>repo.save('goalHistory',{user_id:state.user.id,effective_date:today(),target_minutes:target}),
   'Daily reading-time goal saved from today forward. Earlier dates stay unchanged.');break;
 }
 case 'share-invite':{
  const level=app.querySelector('#share-invite-level')?.value||'summary';
  if(!['full','summary'].includes(level))return toast('Choose a valid share level.',true);
  await run(async()=>{state.latestShareInvite=await repo.createShareInvite(level);},'One-use sharing code generated.');break;
 }
 case 'copy-share-invite':{
  if(!state.latestShareInvite)return;
  try{await navigator.clipboard.writeText(state.latestShareInvite);toast('Share code copied.');}
  catch{toast('Copy the code shown in Settings.');}break;
 }
 case 'redeem-share':{
  const code=app.querySelector('#accept-share-code')?.value.trim();if(!code)return toast('Enter a share code.',true);
  await run(()=>repo.redeemShareInvite(code),'Shared profile linked. If you want mutual access, invite them back.');break;
 }
 case 'save-tracking-start':{
  if(!own())return toast('Only your own account can change its tracking start date.',true);
  const value=app.querySelector('#setting-tracking-start')?.value;
  if(!isTrackingDate(value)||value>today())return toast('Choose a valid tracking start date on or before today.',true);
  const initialMinutes=Number(app.querySelector('#setting-tracking-goal')?.value);
  if(!Number.isInteger(initialMinutes)||initialMinutes<1||initialMinutes>1440)return toast('Starting daily goal must be 1–1,440 whole minutes.',true);
  await run(()=>repo.save('profiles',{id:state.user.id,tracking_start_date:value,tracking_start_goal_minutes:initialMinutes}),
    'Tracking date and starting daily goal saved. Existing sessions and later goal changes remain unchanged.');break;
 }
 case 'save-profile':{
  const name=app.querySelector('#setting-name')?.value.trim();if(!name||name.length>80)return toast('Please enter a display name under 80 characters.',true);
  await run(()=>repo.save('profiles',{id:state.user.id,display_name:name}),'Display name updated.');break;
 }
 case 'create-circle':await run(()=>repo.createCircle(),'Reading circle created. Share the invitation code with your partner.');break;
 case 'join-circle':{
  const code=app.querySelector('#join-code')?.value.trim();if(!code)return toast('Enter the invite code.',true);
  await run(()=>repo.joinCircle(code),'You joined the reading circle. Your partner is now visible.');break;
 }
 case 'copy-invite':{
  const code=app.querySelector('#invite-display')?.value;if(code){try{await navigator.clipboard.writeText(code);toast('Invite code copied.');}catch{toast('Copy the invite code shown in the field.');}}break;
 }
 case 'signout':{
  if(repo.mode!=='cloud')return;
  await repo.signOut();readingClock.setOwner(null);startClockTicker();state.user=null;state.data=null;state.activeId=null;render();break;
 }
 case 'demo-switch':{
  if(repo.mode!=='demo')return;
  repo.currentUserId=repo.currentUserId==='demo-a'?'demo-b':'demo-a';
  state.user={id:repo.currentUserId,email:'demo@example.com'};state.activeId=state.user.id;
  state.logBook='';state.logBookScope='reading';state.logBookQuery='';state.logMethod='pages';resetLogPageDraft();state.filter='all';await sync(true);
  toast(`Viewing as ${profileById(state.user.id).display_name}.`);break;
 }
 case 'reset-demo':{
  if(repo.mode!=='demo'||!confirm('Reset all local demo data?'))return;
  repo.reset();state.modal=null;state.activeId=state.user.id;await sync(true);toast('Demo data reset.');break;
 }
 case 'export-json':exportData();break;
 case 'export-csv':exportBooksCSV();break;
 case 'confirm-import':await importGoodreads();break;
 }
 }catch(err){toast(err.message||'Action failed.',true);}
});

app.addEventListener('submit',async e=>{
 if(e.target.id==='catalog-form'){
  e.preventDefault();state.searchQuery=app.querySelector('#catalog-query')?.value||state.searchQuery;await searchBooks();return;
 }
 if(e.target.id==='manual-book-form'){
  e.preventDefault();const q=id=>app.querySelector('#'+id)?.value.trim()||'';
  const title=q('manual-title'),author=q('manual-author'),pages=q('manual-pages')?Number(q('manual-pages')):null;
  const isbn=normalizeISBN(q('manual-isbn'));
  const asin=normalizeASIN(q('manual-asin'));
  let imageURL;try{imageURL=coverURL(q('manual-cover-url'));}catch(err){return toast(err.message,true);}
  if(isbn&&!isValidISBN(isbn))return toast('Enter a valid ISBN-10 or ISBN-13.',true);
  if(asin&&!isValidASIN(asin))return toast('Amazon ASINs are exactly 10 letters or digits.',true);
  if(!title||!author)return toast('Title and author are required.',true);
  if(pages!==null&&(!Number.isInteger(pages)||pages<=0))return toast('Enter a valid page count.',true);
  const book=toLibraryBook({title,author,page_count:pages,isbn,asin,genres:manualGenres(q('manual-genres')),cover_url:imageURL},state.user.id,ownBooks().length+1);
  book.asin=asin||null;
  book.status=q('manual-status')||'tbr';book.tbr_added_on=book.status==='tbr'?today():null;book.published_year=q('manual-year')?Number(q('manual-year')):null;
  if(book.status==='finished')book.finished_on=today();if(book.status==='reading')book.started_on=today();
  if(ownBooks().some(b=>sameBook(b,book)))return toast('A matching book already exists.',true);
  await run(async()=>{await repo.save('books',book);state.modal=null;state.activeId=state.user.id;},`${title} added to your library.`);
  if(state.data?.books.some(b=>b.id===book.id)){await enrichOneSeriesOnAdd(book);await offerChaptersAfterBookAdd(book);}return;
 }
 if(e.target.id==='auth-form'){
  e.preventDefault();if(repo.mode!=='cloud')return;
  const email=app.querySelector('#auth-email')?.value.trim(),password=app.querySelector('#auth-password')?.value,name=app.querySelector('#auth-name')?.value.trim();
  if(!email||!password)return;
  try{
   if(state.authMode==='signup'){
    if(!name)throw new Error('Enter a display name.');
    const result=await repo.signUp(email,password,name);
    if(!result.session){state.authMode='signin';state.authMessage='Account created. Check your email for the confirmation link, then sign in.';render();return;}
    state.user=result.user;
   }else state.user=await repo.signIn(email,password);
   state.authMessage='';state.activeId=state.user.id;await sync(true);
  }catch(err){state.authMessage=err.message||'Sign-in failed.';render();}
 }
});

app.addEventListener('change',async e=>{
 const el=e.target,id=el.id,v=el.value;
 if(el.dataset?.shareViewer){
   const viewer=el.dataset.shareViewer;
   const level=v;
   if(!['full','summary','none'].includes(level))return;
   if(level==='none'&&!confirm('Revoke this person’s access to your profile?')){render();return;}
   await run(()=>repo.setShareLevel(viewer,level),level==='none'?'Access revoked.':'Access updated.');return;
 }

 switch(id){
 case 'chapter-photo-file':case 'chapter-camera-file':{
  if(state.chapterBusy||state.modal?.type!=='book')break;
  try{
   const count=queueContentsPhotos(el.files);
   if(!count)toast('Those photos are already in the list.');
   render();
  }catch(err){toast(err.message||'Unable to add contents photo.',true);}
  break;
 }
 case 'compare-friend':state.compareFriendId=v;render();break;
 case 'compare-year':state.compareYear=Number(v);render();break;
 case 'profile-picker':clearChapterPhotos();state.activeId=v;state.replayOffset=0;state.replaySlide=0;state.filter='all';state.shelfFilter='all';state.shelfPage=0;state.insightBook='all';state.tab='insights';render();break;
 case 'insight-book':state.insightBook=v;state.showAllBookDays=false;render();break;
 case 'insight-mode':state.insightMode=v;state.showAllBookDays=false;render();break;
 case 'library-mode':state.libraryMode=v;render();break;
 case 'library-genre':state.libraryGenre=v;render();break;
 case 'shelf-mode-filter':state.shelfMode=v;state.shelfPage=0;render();break;
 case 'log-view-mode':state.logViewMode=v;render();break;
 case 'log-mode':state.logMode=v;state.logMethod=(v==='reading'&&state.logMethod==='audio_position')?'pages':state.logMethod;render();break;
 case 'insight-year':state.insightYear=Number(v);render();break;
 case 'log-book':state.logBook=v;state.logPass='auto';state.chapterFrom='';state.chapterTo='';resetLogPageDraft();render();break;
 case 'log-date':case 'partner-log-date':state.logDate=v;state.logDateTouched=true;state.logPass='auto';if(!state.logTimeManual)state.logStartLocalTime=suggestedLocalSessionTime({date:v,now:new Date(),clockStartedAtMs:readingClock.firstStartedAtMs});resetLogPageDraft();render();break;
 case 'log-pass':state.logPass=v;resetLogPageDraft();render();break;

 case 'log-from':state.chapterFrom=v;render();break;
 case 'log-to':state.chapterTo=v;render();break;
 case 'shelf-filter':state.shelfFilter=v;state.shelfPage=0;render();break;
 case 'shelf-finish':case 'shelf-mode':case 'shelf-decor':{
  if(!own())return;
  const prefs={...viewPrefs(),user_id:state.user.id};
  if(id==='shelf-finish')prefs.finish=v;
  if(id==='shelf-mode')prefs.display_mode=v;
  if(id==='shelf-decor')prefs.decor=v;
  await run(()=>repo.save('shelves',prefs),'Bookshelf style saved.');break;
 }
 case 'goodreads-file':{
  const file=el.files?.[0];if(!file)return;
  if(file.size>8_000_000)return toast('CSV too large (maximum 8 MB).',true);
  try{state.importRows=parseGoodreads(await file.text(),{userId:state.user.id,existingCount:ownBooks().length,sessionsMap:state.importSessionsByTitle,genresMap:state.importGenresByTitle});state.importSummary='';render();}
  catch(err){state.importRows=[];toast('Import error: '+err.message,true);}
  break;
 }
 case 'goodreads-sessions-file':{
  const file=el.files?.[0];if(!file)return;
  if(file.size>15_000_000)return toast('JSON file too large (maximum 15 MB).',true);
  try{
   state.importSessionsByTitle=parseGoodreadsReadingSessions(await file.text());
   if(state.importRows.length){
    state.importRows=state.importRows.map(b=>{
     const history=buildGoodreadsReadHistory(b.title,b.status,b.started_on,b.finished_on,b._grReadCount,state.importSessionsByTitle);
     const latest=history.at(-1);
     return {...b,read_history:history,started_on:latest?.started_on||b.started_on,finished_on:b.status==='finished'?(latest?.finished_on||b.finished_on):null};
    });
   }
   state.importSummary='';render();
  }catch(err){state.importSessionsByTitle={};toast('JSON error: '+err.message,true);}
  break;
 }
 case 'goodreads-genres-file':{
  const file=el.files?.[0];if(!file)return;
  if(file.size>15_000_000)return toast('JSON file too large (maximum 15 MB).',true);
  try{
   state.importGenresByTitle=parseGoodreadsGenreRecommendations(await file.text());
   if(state.importRows.length){
    state.importRows=state.importRows.map(b=>{
     const g=state.importGenresByTitle[normTitle(b.title)]||[];
     return g.length?{...b,genres:[...new Set([...g,...(b.genres||[])])]}:b;
    });
   }
   state.importSummary='';render();
  }catch(err){state.importGenresByTitle={};toast('JSON error: '+err.message,true);}
  break;
 }
 }
});
app.addEventListener('input',e=>{
 const id=e.target.id,v=e.target.value;
 if(id==='library-search'){
  state.libraryQuery=v;
  // Update the results after a short pause, avoiding rerender on each keystroke.
  clearTimeout(state.librarySearchTimer);
  state.librarySearchTimer=setTimeout(()=>{if(state.tab==='library'){
    const selection=document.activeElement?.id==='library-search';const position=selection?document.activeElement.selectionStart:null;
    render();if(selection){const inp=app.querySelector('#library-search');inp?.focus();if(position!=null)inp?.setSelectionRange(position,position);}
  }},160);return;
 }
 if(id==='log-book-search'){
  state.logBookQuery=v;
  reconcileLogBook();
  clearTimeout(state.logBookSearchTimer);
  state.logBookSearchTimer=setTimeout(()=>{
   if(state.tab!=='log'||state.logBookScope!=='all')return;
   render();
   const inp=app.querySelector('#log-book-search');
   if(inp){inp.focus();inp.setSelectionRange?.(inp.value.length,inp.value.length);}
  },140);
  return;
 }
 if(id==='catalog-query')state.searchQuery=v;
 if(id==='log-minutes')state.logMinutes=v;
 if(id==='log-start-time'){state.logStartLocalTime=v;state.logTimeManual=true;}
 if(id==='log-ending-page'){state.logEndingPage=v;updateLogPagePreview();}
 if(id==='log-starting-page'){state.logStartingPage=v;updateLogPagePreview();}
 if(id==='log-audio-start')state.logAudioStart=v;
 if(id==='log-audio-end')state.logAudioEnd=v;
});
app.addEventListener('error',e=>{if(e.target instanceof HTMLImageElement&&e.target.closest('.cover'))e.target.classList.add('failed');},true);
app.addEventListener('dragstart',e=>{const b=e.target.closest('[data-drag-book]');if(!b||!own())return;
 state.dragBook=b.dataset.dragBook;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',state.dragBook);b.classList.add('dragging');});
app.addEventListener('dragover',e=>{const b=e.target.closest('[data-drag-book]');if(b&&own()){e.preventDefault();b.classList.add('drop-target');}});
app.addEventListener('dragleave',e=>{e.target.closest('[data-drag-book]')?.classList.remove('drop-target');});
app.addEventListener('drop',async e=>{const b=e.target.closest('[data-drag-book]');if(!b||!own())return;e.preventDefault();b.classList.remove('drop-target');
 const from=state.dragBook||e.dataTransfer.getData('text/plain');state.dragBook=null;await reorderBooks(from,b.dataset.dragBook);});
app.addEventListener('dragend',()=>{state.dragBook=null;app.querySelectorAll('.dragging,.drop-target').forEach(el=>el.classList.remove('dragging','drop-target'));});
window.addEventListener('focus',()=>{
 tickReadingClock();
 if(repo.mode==='cloud'&&state.user&&state.data&&!state.modal&&state.tab!=='log'&&Date.now()-foregroundRefresh>30_000){foregroundRefresh=Date.now();sync(true);}
});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')tickReadingClock();});
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.modal)closeModal();
 if(state.tab==='recaps'&&!state.modal&&!['INPUT','TEXTAREA','SELECT','BUTTON'].includes(document.activeElement?.tagName)){
  if(e.key==='ArrowRight'){state.replaySlide=Math.min(readingReplaySlideCount(state.replayKind)-1,state.replaySlide+1);render();}
  else if(e.key==='ArrowLeft'){state.replaySlide=Math.max(0,state.replaySlide-1);render();}
 }
});

(async function startup(){
 try{
  state.user=await repo.init();
  if(state.user){state.activeId=state.user.id;await sync(true);}
  else render();
  if('serviceWorker' in navigator&&location.protocol!=='file:'){
   navigator.serviceWorker.register('/service-worker.js').catch(()=>{});
  }
 }catch(err){
  app.innerHTML=`<div class="login-wrap"><div class="auth-card"><div class="auth-head"><img src="/assets/icon.svg" alt=""/><h1>Connection setup needed</h1></div><div class="notice error">${esc(err.message||'Could not initialize the cloud connection.')}</div><p class="text-sm">Check config.js and your Supabase project, or clear the two Supabase fields in config.js to try the interactive local demo.</p></div></div>`;
  console.error(err);
 }
})();

app.addEventListener('keydown', e => {
 const row=e.target.closest('.library-table tr[data-action="open-book"]');
 if(row && (e.key==='Enter' || e.key===' ')) { e.preventDefault();row.click(); }
});
