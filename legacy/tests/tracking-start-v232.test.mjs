import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isTrackingDate,profileTrackingStart,reportingStartDate,sessionsInReportingPeriod} from '../tracking-start.js';
import {dayOfWeekStats} from '../reading-habits.js';
import {dailyReadingGoalStats,dailyGoalTimeSeries} from '../reading-metrics.js';
import {completedBooksInYear} from '../reading-history.js';
import {DemoRepo,CloudRepo} from '../db.js';

const session=(date,minutes,book='dune')=>({session_date:date,duration_minutes:minutes,user_book_id:book,activity_mode:'reading'});

test('date selection is ISO local date, includes leap day, and cannot confuse two readers',()=>{
 for(const x of ['2026-02-29','2026-13-01','11/17/2026','2026-11-17T00:00:00Z','',null])assert.equal(isTrackingDate(x),false);
 assert.equal(isTrackingDate('2024-02-29'),true);
 assert.equal(profileTrackingStart({tracking_start_date:'2026-11-13',created_at:'2020-07-15T00:00:00Z'}),'2026-11-13');
 assert.equal(profileTrackingStart({created_at:'2020-07-15T00:00:00Z'}),'2020-07-15');
 assert.equal(profileTrackingStart({} ),null);
 assert.equal(reportingStartDate('2026-11-15','2026-11-17'),'2026-11-17');
 assert.equal(reportingStartDate('2026-11-15','2026-11-01'),'2026-11-15');
});

test('Monday average has one eligible Monday, not three zeros from before tracking',()=>{
 const sessions=[session('2026-11-02',0),session('2026-11-09',0),session('2026-11-16',18),session('2026-11-18',900)];
 const baseline=dayOfWeekStats(sessions,{periodStart:'2026-11-01',periodEnd:'2026-11-30',today:'2026-11-17'});
 assert.equal(baseline.days[1].daysInPeriod,3);
 assert.equal(baseline.days[1].avgMinutesPerDay,6);
 const tracked=dayOfWeekStats(sessions,{periodStart:'2026-11-01',periodEnd:'2026-11-30',today:'2026-11-17',activeFrom:'2026-11-16'});
 assert.equal(tracked.days[1].daysInPeriod,1);
 assert.equal(tracked.days[1].minutes,18);
 assert.equal(tracked.days[1].avgMinutesPerDay,18);
 assert.equal(tracked.days[0].daysInPeriod,0);
 assert.equal(tracked.days.reduce((n,r)=>n+r.daysInPeriod,0),2);
 // Changing the cutoff never mutates the raw historical records.
 assert.equal(sessions.length,4);
});

test('Sunday-start week straddling tracking boundary skips the old days',()=>{
 const sessions=[session('2026-11-15',35),session('2026-11-16',18),session('2026-11-17',22),session('2026-11-21',60)];
 const filtered=sessionsInReportingPeriod(sessions,{periodStart:'2026-11-15',periodEnd:'2026-11-21',today:'2026-11-17',trackingStart:'2026-11-16'});
 assert.deepEqual(filtered.map(s=>s.session_date),['2026-11-16','2026-11-17']);
 const week=dayOfWeekStats(filtered,{periodStart:'2026-11-15',periodEnd:'2026-11-21',today:'2026-11-17',activeFrom:'2026-11-16'});
 assert.equal(week.days[0].daysInPeriod,0);
 assert.equal(week.days[1].minutes,18);
 assert.equal(week.days[2].minutes,22);
 assert.equal(week.weekdays.calendarDays,2);
});

test('YTD and daily goal both start on tracking date, historical daily targets remain dated',()=>{
 const rows=[session('2026-09-30',45),session('2026-10-01',18),session('2026-11-16',30)];
 const goalHistory=[{effective_date:'2026-01-01',target_minutes:20},{effective_date:'2026-11-10',target_minutes:30}];
 const selected=sessionsInReportingPeriod(rows,{periodStart:'2026-01-01',periodEnd:'2026-12-31',today:'2026-11-17',trackingStart:'2026-10-01'});
 assert.equal(selected.length,2);
 const goals=dailyReadingGoalStats(rows,{targetMinutes:20,goalHistory,today:'2026-11-17',periodStart:'2026-09-01',periodEnd:'2026-10-02',activeFrom:'2026-10-01'});
 assert.equal(goals.evaluatedDays,2);
 assert.equal(goals.daysMet,0);
 const series=dailyGoalTimeSeries(rows,{targetMinutes:20,goalHistory,today:'2026-11-17',periodStart:'2026-09-29',periodEnd:'2026-10-02',activeFrom:'2026-10-01'});
 assert.deepEqual(series.map(d=>[d.days,d.actualMinutes,d.targetMinutes]),[[0,0,0],[0,0,0],[1,18,20],[1,0,20]]);
 const later=dailyReadingGoalStats(rows,{targetMinutes:20,goalHistory,today:'2026-11-17',periodStart:'2026-11-01',periodEnd:'2026-11-17',activeFrom:'2026-11-16'});
 assert.equal(later.evaluatedDays,2);
 assert.equal(later.daysMet,1);
 assert.equal(later.longestGoalStreak,1);
});

test('a tracking date after the selected year results in zero evaluated days, without errors',()=>{
 const w=dayOfWeekStats([],{periodStart:'2025-01-01',periodEnd:'2025-12-31',today:'2026-11-17',activeFrom:'2026-11-01'});
 assert.equal(w.days.reduce((n,x)=>n+x.daysInPeriod,0),0);
 const g=dailyReadingGoalStats([],{today:'2026-11-17',periodStart:'2025-01-01',periodEnd:'2025-12-31',activeFrom:'2026-11-01'});
 assert.equal(g.evaluatedDays,0);
});

test('historic completions remain counted even when session tracking begins later',()=>{
 const books=[
  {title:'Dune',status:'finished',read_history:[{number:1,status:'finished',finished_year:2022,finished_on:null},{number:2,status:'finished',finished_on:'2026-10-15'}]},
  {title:'One more',status:'finished',read_history:[{number:1,status:'finished',finished_year:2026,finished_on:null}]},
  {title:'Early year',status:'finished',read_history:[{number:1,status:'finished',finished_on:'2026-03-10'}]},
 ];
 assert.equal(completedBooksInYear(books,2022).length,1);
 assert.equal(completedBooksInYear(books,2026,'2026-10-01').length,3);
 assert.equal(completedBooksInYear(books,2026,'2026-01-01').length,3);
 assert.equal(completedBooksInYear(books,2022,'2026-10-01').length,1);
});

test('tracking dates are independent, persisted profile preferences in demo storage',async()=>{
 const stored=new Map();globalThis.localStorage={getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)};
 const db=new DemoRepo();await db.init();
 const before=(await db.load()).sessions.length;
 await db.save('profiles',{id:'demo-a',tracking_start_date:'2026-11-15'});
 await db.save('profiles',{id:'demo-b',tracking_start_date:'2026-10-01'});
 const loaded=new DemoRepo();await loaded.init();
 const data=await loaded.load();
 assert.equal(data.profiles.find(p=>p.id==='demo-a').tracking_start_date,'2026-11-15');
 assert.equal(data.profiles.find(p=>p.id==='demo-b').tracking_start_date,'2026-10-01');
 assert.equal(data.sessions.length,before);
});

test('cloud settings PATCH only chosen profile fields and RLS still owns updates',async()=>{
 const calls=[];
 const cloud=new CloudRepo('https://example.invalid','public');
 cloud.client={from(table){assert.equal(table,'profiles');return{update(fields){calls.push(fields);return{eq(column,id){assert.equal(column,'id');assert.equal(id,'reader-a');return{select(){return{single:async()=>({data:{id,...fields},error:null})};}};}};}};}};
 await cloud.save('profiles',{id:'reader-a',tracking_start_date:'2026-11-12'});
 await cloud.save('profiles',{id:'reader-a',display_name:'Reader A'});
 assert.deepEqual(calls,[{tracking_start_date:'2026-11-12'},{display_name:'Reader A'}]);
 const sql=readFileSync(new URL('../supabase/UPGRADE_EXISTING_TO_V2.3.2.sql',import.meta.url),'utf8');
 const schema=readFileSync(new URL('../supabase/schema.sql',import.meta.url),'utf8');
 assert.match(sql,/add column if not exists tracking_start_date date/);
 assert.match(sql,/created_at at time zone 'UTC'/);
 assert.match(sql,/alter column tracking_start_date set not null/);
 assert.match(sql,/NOTIFY pgrst, 'reload schema'/);
 assert.match(sql,/and s\.session_date >= coalesce\(pr\.tracking_start_date/);
 assert.match(sql,/pass->>'finished_on'/);
 assert.match(schema,/tracking_start_date date not null default current_date/);
 assert.match(schema,/create policy "Edit own profile"/);
 assert.match(schema,/id=\(select auth\.uid\(\)\)/);
 assert.doesNotMatch(sql,/delete from public\.reading_sessions/i);
});

test('live app settings, year and month cutoffs are wired without changing the calendar average method',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const worker=readFileSync(new URL('../service-worker.js',import.meta.url),'utf8');
 assert.match(app,/id="setting-tracking-start"/);
 assert.match(app,/case 'save-tracking-start'/);
 assert.match(app,/sessionsInReportingPeriod\(filteredSessions\(\)/);
 assert.match(app,/dayOfWeekStats\(entries,\{periodStart:spec.start,periodEnd:spec.end,today:today\(\),activeFrom:activeAccountStartDate\(\)\}/);
 assert.match(app,/completedBooksInYear\(allBooks,state.insightYear\)/);
 assert.match(worker,/\/tracking-start\.js/);
});
