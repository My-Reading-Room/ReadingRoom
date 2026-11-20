import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildReadingReplay,replayPeriod} from '../reading-replay.js';
import {renderReadingReplayView,readingReplaySlideCount,readingReplayShareText} from '../reading-replay-view.js';

const book=(id,props={})=>({id,title:`Title ${id}`,author:'Writer',genres:['Fiction'],status:'reading',...props});
const session=(id,date,minutes,pages,mode='reading',time='07:30')=>({user_book_id:id,session_date:date,duration_minutes:minutes,pages_read:pages,activity_mode:mode,start_local_time:time});
const model=(extra={})=>buildReadingReplay({today:'2026-11-22',trackingStart:'2026-11-15',startingGoal:60,
 books:[book('a',{status:'finished',finished_on:'2024-07-13',rating:4.5}),book('b')],sessions:[session('b','2026-11-15',60,30),session('b','2026-11-16',45,22)],kind:'week',...extra});

test('Sunday-first weekly and month/year browsing use real inclusive calendar dates',()=>{
 assert.deepEqual([replayPeriod('week','2026-11-18').start,replayPeriod('week','2026-11-18').end],['2026-11-08','2026-11-14']);
 assert.equal(replayPeriod('week','2026-11-18',-1).start,'2026-11-01');
 assert.equal(replayPeriod('month','2026-11-18',-1).end,'2026-09-30');
 assert.equal(replayPeriod('year','2026-11-18',-1).start,'2024-01-01');
 assert.equal(replayPeriod('month','2024-03-15',-1).end,'2024-01-31');
 assert.equal(replayPeriod('month','2024-03-15').end,'2024-02-29');
 assert.equal(replayPeriod('month','2026-11-18').previousVisibleEnd,'2026-09-30');
 assert.equal(replayPeriod('week','2026-11-18').previousVisibleEnd,'2026-11-07');
 assert.equal(replayPeriod('year','2026-11-18').year,2025);
 assert.throws(()=>replayPeriod('week','2026-11-18',1),/Invalid/);
});

test('Historical Goodreads completions appear annually independent of tracking, without invented minutes',()=>{
 const r=model({kind:'year',offset:-1});
 assert.equal(r.period.year,2024);assert.equal(r.finished.length,1);assert.equal(r.minutes,0);
 assert.equal(r.hasSessionData,false);assert.equal(r.hasAnyData,true);
 assert.equal(r.topBooks.length,0);assert.equal(r.goal,null);
 assert.match(renderReadingReplayView(r,{slide:4}),/Title a/);assert.match(renderReadingReplayView(r),/session-based/i);
 assert.doesNotMatch(readingReplayShareText(r),/105m/);
});

test('Year-only reread counts in annual year but not a monthly or weekly recap',()=>{
 const books=[book('a',{status:'reading',read_history:[
  {number:1,status:'finished',finished_on:'2022-06-10'},
  {number:2,status:'finished',finished_year:2026,finished_on:null},
  {number:3,status:'reading',started_on:'2026-11-01'}]})];
 const annual=model({books,sessions:[],kind:'year',today:'2027-01-05'}),month=model({books,sessions:[],kind:'month'});
 assert.equal(annual.finished.length,1);assert.equal(annual.rereads,1);assert.equal(annual.yearOnlyCount,1);
 assert.equal(month.finished.length,0);
});

test('Same book reread twice in a year counts as one finished book and two rereads',()=>{
 const r=model({kind:'year',today:'2027-01-05',books:[book('b',{status:'finished',read_history:[
  {number:1,status:'finished',finished_on:'2021-02-10'},
  {number:2,status:'finished',finished_on:'2026-03-11'},
  {number:3,status:'finished',finished_on:'2026-08-12'}]})],sessions:[]});
 assert.equal(r.finished.length,1);assert.equal(r.rereads,2);
});

test('Session boundary, unknown pages and audio equivalents preserve honest metrics',()=>{
 const r=model({books:[book('b',{genres:['Fantasy','Sci Fi']})],sessions:[
  session('b','2026-11-14',100,35), // before tracking
  session('b','2026-11-15',60,30),
  session('b','2026-11-15',30,null,'audiobook',null),
  session('b','2026-11-16',30,20,'audiobook','12:00'),
  session('b','2026-11-17',60,40,'read_listen','21:00'),
  session('other','2026-11-16',300,999) // inaccessible book
 ]});
 assert.equal(r.minutes,180);assert.equal(r.pages,90);assert.equal(r.physicalPages,70);assert.equal(r.audioPages,20);
 assert.equal(r.mode.reduce((a,x)=>a+x.minutes,0),180);
 assert.equal(r.clock.reduce((a,x)=>a+x.minutes,0),150);
 assert.equal(r.unknownClockMinutes,30);
 assert.equal(r.speed.overall.measuredSessions,3);
 assert.equal(r.speed.overall.pagesPerHour,(90*60)/150);
 assert.equal(r.topGenres[0].genre,'Fantasy');
 assert.equal(r.peakMonth.month,'2026-11');
 assert.match(renderReadingReplayView({...r,period:{...r.period,kind:'month'}},{slide:4}),/TOP GENRES/);
 assert.match(renderReadingReplayView(r,{slide:4}),/Daily goals met/);
});

test('Goals honor dated history, tracking boundary, and full completed weeks',()=>{
 const r=model({sessions:[session('b','2026-11-15',60,10),session('b','2026-11-16',35,11)],goalHistory:[
 {effective_date:'2026-11-15',target_minutes:60},{effective_date:'2026-11-16',target_minutes:30}]});
 assert.deepEqual({days:r.goal.days,met:r.goal.daysMet,targets:r.goal.targets},{days:7,met:2,targets:240});
 assert.equal(r.delta,null); // previous week before tracking start
 assert.equal(r.period.full,true);
});

test('When tracking spans both windows, sealed weeks compare complete seven-day periods',()=>{
 const r=model({trackingStart:'2026-01-01',sessions:[session('b','2026-11-08',60,10),session('b','2026-11-15',90,12)]});
 assert.equal(r.previous.minutes,60);assert.equal(r.minutes,90);
 assert.equal(r.delta.minutes,30);assert.equal(r.delta.percent,50);
});

test('Recap cards have correct navigation count and safe rendering of untrusted titles',()=>{
 const r=model({books:[book('b',{title:'<img src=x onerror=alert(1)>"'})]});
 assert.equal(readingReplaySlideCount('week'),6);assert.equal(readingReplaySlideCount('month'),8);assert.equal(readingReplaySlideCount('year'),9);
 const rendered=renderReadingReplayView(r,{slide:3,owner:true});
 assert.match(rendered,/data-replay-slide="5"/);assert.match(rendered,/Reading Replay/);
 assert.doesNotMatch(rendered,/<img src=x onerror/);
 assert.match(rendered,/&lt;img src=x onerror/);
 assert.doesNotMatch(renderReadingReplayView(r,{owner:false}),/data-action="replay-copy"/);
});

test('Replay uses no new tables, sync mutations, or third-party APIs',()=>{
 const a=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const worker=readFileSync(new URL('../service-worker.js',import.meta.url),'utf8');
 const index=readFileSync(new URL('../reading-replay.js',import.meta.url),'utf8');
 assert.match(a,/case 'recaps':return renderRecaps\(\)/);
 assert.match(worker,/\/reading-replay\.js/);assert.match(worker,/\/reading-replay-view\.js/);assert.match(worker,/\/replay-ready\.js/);
 assert.doesNotMatch(index,/fetch\(|localStorage|createRepo\(|\.save\(/);
});
