import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dailyGoalTargetAt, dailyGoalTimeSeries, dailyReadingGoalStats } from '../reading-metrics.js';
import { DemoRepo } from '../db.js';

const history = [
  {effective_date:'2026-01-01',target_minutes:20},
  {effective_date:'2026-11-14',target_minutes:45}
];
const entries = [
  {session_date:'2026-11-12',duration_minutes:20,activity_mode:'reading'},
  {session_date:'2026-11-13',duration_minutes:17,activity_mode:'audiobook'},
  {session_date:'2026-11-13',duration_minutes:3,activity_mode:'read_listen'},
  {session_date:'2026-11-14',duration_minutes:40,activity_mode:'audiobook'},
  {session_date:'2026-11-15',duration_minutes:45,activity_mode:'read_listen'},
  {session_date:'2026-11-16',duration_minutes:30,activity_mode:'reading'},
  {session_date:'2026-11-17',duration_minutes:300,activity_mode:'reading'}, // future
];

test('historical targets are immutable by date even when the current goal changes',()=>{
 assert.equal(dailyGoalTargetAt(history,'2026-11-13'),20);
 assert.equal(dailyGoalTargetAt(history,'2026-11-14'),45);
 assert.equal(dailyGoalTargetAt(history,'2026-11-16'),45);
 const modified=[...history,{effective_date:'2026-11-16',target_minutes:60}];
 assert.equal(dailyGoalTargetAt(modified,'2026-11-13'),20);
 assert.equal(dailyGoalTargetAt(modified,'2026-11-14'),45);
 assert.equal(dailyGoalTargetAt(modified,'2026-11-16'),60);
 assert.equal(dailyGoalTargetAt([], '2026-11-13', 30),30);
});

test('week plot preserves old goals while new days use new targets',()=>{
 const series=dailyGoalTimeSeries(entries,{goalHistory:history,today:'2026-11-16',periodStart:'2026-11-09',periodEnd:'2026-11-22'});
 assert.equal(series.length,14);
 assert.equal(series.find(x=>x.key==='2026-11-13').targetMinutes,20);
 assert.equal(series.find(x=>x.key==='2026-11-13').actualMinutes,20); // audio and combined counted once each
 assert.equal(series.find(x=>x.key==='2026-11-14').targetMinutes,45);
 assert.equal(series.find(x=>x.key==='2026-11-14').actualMinutes,40);
 assert.equal(series.find(x=>x.key==='2026-11-15').actualMinutes,45);
 assert.equal(series.find(x=>x.key==='2026-11-17').future,true);
 assert.equal(series.find(x=>x.key==='2026-11-17').targetMinutes,0);
});

test('monthly year chart sums historical daily targets, not current goal times total days',()=>{
 const rows=dailyGoalTimeSeries(entries,{goalHistory:history,today:'2026-11-16',periodStart:'2026-11-01',periodEnd:'2026-12-31',groupBy:'month'});
 assert.deepEqual(rows.map(x=>x.key),['2026-11','2026-12']);
 assert.equal(rows[0].days,16);
 assert.equal(rows[0].targetMinutes,13*20+3*45); // Nov 1-13 at 20, Nov 14-16 at 45
 assert.equal(rows[0].actualMinutes,155);
 assert.equal(rows[0].daysMet,3); // Nov 12,13,15
 assert.equal(rows[1].future,true);
 assert.equal(rows[1].targetMinutes,0);
});

test('goal-based streaks and heatmap markers use the target from each day',()=>{
 const stat=dailyReadingGoalStats(entries,{targetMinutes:30,goalHistory:history,today:'2026-11-16',periodStart:'2026-11-12',periodEnd:'2026-11-16'});
 assert.equal(stat.targetMinutes,45);
 assert.equal(stat.daysMet,3);
 assert.equal(stat.evaluatedDays,5);
 assert.equal(stat.longestGoalStreak,2);
 assert.equal(stat.currentGoalStreak,1); // yesterday met; today unfinished
 assert.equal(stat.remainingMinutes,15);
});

test('same-day demo edits replace that date only and persist across reload',async()=>{
 const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
 const repo=new DemoRepo();await repo.init();
 const baseline=(await repo.load()).goalHistory.find(x=>x.user_id==='demo-a');
 const date='2026-11-16';
 await repo.save('goalHistory',{user_id:'demo-a',effective_date:date,target_minutes:45});
 await repo.save('goalHistory',{user_id:'demo-a',effective_date:date,target_minutes:60});
 const reload=new DemoRepo();await reload.init();
 const rows=(await reload.load()).goalHistory.filter(x=>x.user_id==='demo-a');
 assert.equal(rows.filter(x=>x.effective_date===date).length,1);
 assert.equal(rows.find(x=>x.effective_date===date).target_minutes,60);
 assert.equal(dailyGoalTargetAt(rows,'2026-11-15',baseline.target_minutes),baseline.target_minutes);
});

test('cloud migration enforces full-view read and owner-only today writes',()=>{
 const migration=readFileSync(new URL('../supabase/migrations/2026-11-16_versioned_daily_goal_history.sql',import.meta.url),'utf8');
 const schema=readFileSync(new URL('../supabase/schema.sql',import.meta.url),'utf8');
 assert.match(migration,/create table if not exists public.reading_goal_history/);
 assert.match(migration,/can_view_full\(user_id\)/);
 assert.match(migration,/effective_date = current_date/);
 assert.match(migration,/on conflict\(user_id,effective_date\) do nothing/);
 assert.match(schema,/reading_goal_history/);
});
