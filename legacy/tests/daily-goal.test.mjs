import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyReadingGoalStats } from '../reading-metrics.js';
import { DemoRepo } from '../db.js';

const entries=[
  {session_date:'2026-11-11',activity_mode:'reading',duration_minutes:15,pages_read:10},
  {session_date:'2026-11-11',activity_mode:'audiobook',duration_minutes:15,pages_read:null,log_type:'audio_position'},
  {session_date:'2026-11-12',activity_mode:'read_listen',duration_minutes:40,pages_read:28},
  {session_date:'2026-11-13',activity_mode:'reading',duration_minutes:10,pages_read:5},
  {session_date:'2026-11-13',activity_mode:'read_listen',duration_minutes:20,pages_read:18},
  {session_date:'2026-11-14',activity_mode:'audiobook',duration_minutes:20,pages_read:null},
  {session_date:'2026-11-15',activity_mode:'audiobook',duration_minutes:8,pages_read:null},
  {session_date:'2026-11-15',activity_mode:'read_listen',duration_minutes:22,pages_read:19},
  {session_date:'2026-11-17',activity_mode:'reading',duration_minutes:900,pages_read:100}, // future, ignore
  {session_date:'2026-11-15',activity_mode:'reading',duration_minutes:-40,pages_read:0}, // invalid, ignore
];

test('daily minutes add reading, audio with no pages and combined sessions just once',()=>{
 const d=dailyReadingGoalStats(entries,{targetMinutes:30,today:'2026-11-15',periodStart:'2026-11-09',periodEnd:'2026-11-15'});
 assert.equal(d.todayMinutes,30);
 assert.equal(d.daysMet,4);
 assert.equal(d.evaluatedDays,7);
 assert.equal(d.currentGoalStreak,1);
 assert.equal(d.remainingMinutes,0);
 assert.equal(d.metToday,true);
 assert.equal(d.longestGoalStreak,3); // Nov 11, 12, 13
});

test('goal streak is not broken midday before the goal can be reached',()=>{
 const d=dailyReadingGoalStats(entries,{targetMinutes:30,today:'2026-11-14',periodStart:'2026-11-11',periodEnd:'2026-11-14'});
 assert.equal(d.todayMinutes,20);
 assert.equal(d.currentGoalStreak,3);
 assert.equal(d.daysMet,3);
 assert.equal(d.evaluatedDays,4);
 assert.equal(d.remainingMinutes,10);
});

test('period counts include zero-minute calendar days but never future days',()=>{
 const d=dailyReadingGoalStats(entries,{targetMinutes:30,today:'2026-11-15',periodStart:'2026-11-01',periodEnd:'2026-11-30'});
 assert.equal(d.evaluatedDays,15);
 assert.equal(d.daysMet,4);
 const empty=dailyReadingGoalStats([],{targetMinutes:30,today:'2026-11-15',periodStart:'2026-11-20',periodEnd:'2026-11-30'});
 assert.equal(empty.evaluatedDays,0);
 assert.equal(empty.percentDaysMet,null);
});

test('invalid daily targets are rejected',()=>{
 for(const bad of [0,-1,12.5,1441,NaN]) assert.throws(()=>dailyReadingGoalStats(entries,{targetMinutes:bad,today:'2026-11-15'}),RangeError);
});

test('daily goal persists per profile and preserves annual books target in demo storage',async()=>{
 const mem=new Map();
 globalThis.localStorage={getItem(k){return mem.get(k)||null;},setItem(k,v){mem.set(k,v);}};
 const r=new DemoRepo();await r.init();
 const before=(await r.load()).goals.find(x=>x.user_id==='demo-a');
 await r.save('goals',{...before,daily_minutes_target:45});
 const again=new DemoRepo();await again.init();
 const after=(await again.load()).goals.find(x=>x.user_id==='demo-a');
 assert.equal(after.daily_minutes_target,45);
 assert.equal(after.books_target,before.books_target);
});

test('cloud upgrade adds owner-scoped daily goal field without changing RLS',async()=>{
 const {readFileSync}=await import('node:fs');
 const sql=readFileSync(new URL('../supabase/migrations/2026-11-16_daily_minutes_goal.sql',import.meta.url),'utf8');
 assert.match(sql,/add column if not exists daily_minutes_target/);
 assert.match(sql,/between 1 and 1440/);
 const schema=readFileSync(new URL('../supabase/schema.sql',import.meta.url),'utf8');
 assert.match(schema,/daily_minutes_target integer not null default 30/);
 assert.match(schema,/"Read own or full-share goals"/);
});
