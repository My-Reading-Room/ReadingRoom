import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseGoodreads} from '../goodreads-import.js';
import {completedBooksInYear} from '../reading-history.js';
import {timeOfDaySpeedByMode} from '../reading-habits.js';

const file=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('Goodreads exported read-shelf books with Date Read always count in their completion year',()=>{
 const csv='Title,Author,Exclusive Shelf,Date Read,Number of Pages,My Rating\nDune,Frank Herbert,read,2024/06/10,600,4\nOther,Writer,read,2026/02/14,234,3';
 const imported=parseGoodreads(csv,{userId:'reader',uuid:(()=>{let i=0;return()=>`book-${++i}`})()});
 assert.deepEqual(imported.map(b=>[b.status,b.finished_on]),[['finished','2024-06-10'],['finished','2026-02-14']]);
 assert.equal(completedBooksInYear(imported,2024).length,1);
 assert.equal(completedBooksInYear(imported,2026).length,1);
 assert.equal(completedBooksInYear(imported,2025).length,0);
});
test('rereads preserve historical completion, year-only passes count, no double counting',()=>{
 const items=[
  {id:'a',status:'reading',read_history:[
    {number:1,status:'finished',finished_on:'2023-05-11'},
    {number:2,status:'finished',finished_on:'2026-09-02'},
    {number:3,status:'finished',finished_on:'2026-10-17'},
    {number:4,status:'reading',started_on:'2026-11-16'}]},
  {id:'b',status:'finished',read_history:[{number:1,status:'finished',finished_year:2022,finished_on:null}]},
  {id:'c',status:'tbr'}
 ];
 assert.deepEqual(completedBooksInYear(items,2026).map(x=>x.id),['a']);
 assert.deepEqual(completedBooksInYear(items,2023).map(x=>x.id),['a']);
 assert.deepEqual(completedBooksInYear(items,2022).map(x=>x.id),['b']);
});
test('time-of-day speed overall is weighted across three methods, with missing pages excluded',()=>{
 const mk=(mode,minutes,pages,start='09:00')=>({session_date:'2026-11-16',activity_mode:mode,duration_minutes:minutes,pages_read:pages,start_local_time:start});
 const results=timeOfDaySpeedByMode([
   mk('reading',30,30),mk('audiobook',60,30),mk('read_listen',90,90),
   mk('reading',60,null),mk('reading',20,40,null)
 ]);
 const b=results.find(b=>b.id==='morning').speeds;
 assert.equal(b.reading.pagesPerHour,60);
 assert.equal(b.audiobook.pagesPerHour,30);
 assert.equal(b.read_listen.pagesPerHour,60);
 assert.equal(b.overall.pagesPerHour,50); // (30+30+90)/180 minutes *60
 assert.equal(b.overall.measuredMinutes,180);
 assert.equal(results.find(b=>b.id==='evening').speeds.overall.pagesPerHour,null);
});
test('shared-summary migration removes completion cutoff and retains session cutoff and authorized RPC',()=>{
 const sql=file('supabase/UPGRADE_EXISTING_TO_V2.3.9.sql');
 const schema=file('supabase/schema.sql');
 assert.match(sql,/create or replace function public\.get_viewable_profile_summaries/);
 assert.match(sql,/security definer set search_path = ''/i);
 assert.match(sql,/jsonb_array_elements\(b\.read_history\)/);
 assert.match(sql,/and extract\(year from b\.finished_on\)=t\.yr/);
 assert.doesNotMatch(sql,/pass->>'finished_on' >= coalesce\(pr\.tracking_start_date/);
 assert.doesNotMatch(sql,/b\.finished_on >= coalesce\(pr\.tracking_start_date/);
 assert.match(sql,/and s\.session_date >= coalesce\(pr\.tracking_start_date/);
 assert.match(sql,/sh\.viewer_id=\(select auth\.uid\(\)\)/);
 assert.match(sql,/grant execute on function public\.get_viewable_profile_summaries\(integer\) to authenticated/i);
 assert.match(schema,/A completion is a historical fact/);
});
test('Quick summary chart goal only on minutes, and friend feed has exact time handling',()=>{
 const app=file('app.js'),css=file('style.css'),feed=file('friend-feed.js');
 assert.match(app,/state\.metric==='minutes'\?dailyGoalTimeSeries\(viewSessions\(\)/);
 assert.match(app,/class="activity-goal-overlay"/);
 assert.match(app,/Daily goal · all reading modes/);
 assert.match(app,/timeOfDaySpeedByMode\(speedRows\)/);
 assert.match(app,/owner!==state\.user\.id&&shareLevelFor\(owner\)!=='full'/);
 assert.match(css,/activity-goal-hint/);
 assert.match(css,/\.habit-speed-breakdown/);
 assert.match(feed,/start_local_time/);
 assert.doesNotMatch(feed,/session\.created_at/); // does not use server event timestamp
});
