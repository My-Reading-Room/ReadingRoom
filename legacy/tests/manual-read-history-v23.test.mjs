import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  readingPasses,editReadingHistory,rereadSessionCorrections,readNumberForDate,
  currentReadNumber,sessionPassError,completedBooksInYear,readingPassMetrics,rereadComparisonStats
} from '../reading-history.js';

const dune={id:'dune',user_id:'me',title:'Dune',status:'reading',started_on:'2026-11-05',finished_on:null,current_page:125};
const asEdited=()=>editReadingHistory(dune,[
  {status:'finished',started_on:'',finished_on:'',finished_year:'2022'},
  {status:'reading',started_on:'2026-10-15',finished_on:'',finished_year:''}
]);

test('an original read completed in 2022 and a present reread retain distinct passes',()=>{
 const b=asEdited();
 assert.equal(b.status,'reading');assert.equal(b.started_on,'2026-10-15');assert.equal(b.finished_on,null);
 assert.equal(b.current_page,125);
 assert.equal(b.read_history[0].finished_year,2022);
 assert.equal(b.read_history[0].finished_on,null); // never invent a day
 assert.equal(b.read_history[1].number,2);
 assert.equal(currentReadNumber(b),2);
 assert.equal(readNumberForDate(b,'2026-11-16'),2);
 assert.equal(readNumberForDate(b,'2022-04-07'),1);
 assert.equal(completedBooksInYear([b],2022).length,1);
 assert.equal(completedBooksInYear([b],2026).length,0);
});

test('misassigned newer sessions are offered reassignment without modifying dates/time/pages/mode',()=>{
 const b=asEdited();
 const logs=[
  {id:'original',user_book_id:'dune',session_date:'2022-07-10',read_number:1,duration_minutes:30,pages_read:10,activity_mode:'reading'},
  {id:'wrong',user_book_id:'dune',session_date:'2026-11-16',read_number:1,duration_minutes:90,pages_read:22,activity_mode:'audiobook'},
  {id:'right',user_book_id:'dune',session_date:'2026-11-17',read_number:2,duration_minutes:35,pages_read:16,activity_mode:'read_listen'}
 ];
 const plan=rereadSessionCorrections(b,logs);
 assert.deepEqual(plan.map(p=>[p.session.id,p.from,p.to]),[['wrong',1,2]]);
 const updated=logs.map(s=>({...s,read_number:plan.find(p=>p.session.id===s.id)?.to||s.read_number}));
 assert.deepEqual(logs[1],{id:'wrong',user_book_id:'dune',session_date:'2026-11-16',read_number:1,duration_minutes:90,pages_read:22,activity_mode:'audiobook'});
 const perPass=readingPassMetrics(b,updated,{today:'2026-11-17'});
 assert.equal(perPass[0].sessionCount,1);assert.equal(perPass[1].sessionCount,2);
 assert.equal(perPass[0].recordedMinutes,30);assert.equal(perPass[1].recordedMinutes,125);
 assert.equal(rereadComparisonStats([b],updated,{today:'2026-11-17'}).entries[0].latest.number,2);
 assert.equal(rereadSessionCorrections(b,updated).length,0); // retry-safe
});

test('finished pass cannot silently receive sessions after its completion',()=>{
 const onlyOriginal=editReadingHistory(dune,[{status:'finished',started_on:'',finished_year:'2022'}]);
 assert.match(sessionPassError(onlyOriginal,'2026-11-17',1),/Add a reread/);
 assert.equal(sessionPassError(onlyOriginal,'2022-02-11',1),null);
 const b=asEdited();
 assert.equal(sessionPassError(b,'2026-11-17',2),null);
 assert.match(sessionPassError(b,'2026-01-01',2),/earlier/);
});

test('date-only historical original and multiple dated rereads preserve correct boundaries',()=>{
 const b=editReadingHistory(dune,[
  {status:'finished',started_on:'2022-01-01',finished_on:'2022-02-01'},
  {status:'finished',started_on:'2024-03-01',finished_on:'2024-04-30'},
  {status:'reading',started_on:'2026-10-01'}
 ]);
 assert.equal(readNumberForDate(b,'2024-04-10'),2);
 assert.equal(readNumberForDate(b,'2026-10-10'),3);
 const old=[{id:'a',user_book_id:'dune',session_date:'2025-01-01',read_number:1},
   {id:'b',user_book_id:'dune',session_date:'2024-03-30',read_number:1},
   {id:'c',user_book_id:'dune',session_date:'2026-11-01',read_number:1}];
 assert.deepEqual(rereadSessionCorrections(b,old).map(x=>x.to),[2,3]);
});

test('invalid manual history is blocked rather than corrupting an active reread',()=>{
 const reject=entries=>assert.throws(()=>editReadingHistory(dune,entries),RangeError);
 reject([{status:'finished',finished_year:'2022',started_on:'2026-01-01'}]);
 reject([{status:'finished',finished_on:'2022-02-30'}]);
 reject([{status:'reading',started_on:'2022-01-01'},{status:'reading',started_on:'2026-01-01'}]);
 reject([{status:'finished',finished_on:'2024-01-04'},{status:'reading',started_on:'2024-01-02'}]);
 reject([{status:'finished',finished_year:'2022'},{status:'reading',started_on:'2020-01-01'}]);
 reject([{status:'finished'}]);
});

test('current reread with missing exact start date still receives new sessions by default',()=>{
 const b=editReadingHistory(dune,[{status:'finished',finished_year:'2022'},{status:'reading'}]);
 assert.equal(readNumberForDate(b,'2026-11-17'),2);
 assert.equal(rereadSessionCorrections(b,[{user_book_id:'dune',session_date:'2026-11-17',read_number:1}]).length,0);
});

test('year-only dates are supported in the summary-only SQL without revealing raw histories',()=>{
 const schema=readFileSync(new URL('../supabase/UPGRADE_EXISTING_TO_V2.3.sql',import.meta.url),'utf8');
 assert.match(schema,/coalesce\(substring\(pass->>'finished_on' from 1 for 4\), pass->>'finished_year'\)/);
 assert.match(schema,/security definer set search_path = ''/);
 assert.match(schema,/revoke all on function public.get_viewable_profile_summaries/);
});
