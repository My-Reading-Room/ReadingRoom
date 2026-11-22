import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {replayPeriod,buildReadingReplay} from '../reading-replay.js';
import {replaySeenKey,latestUnseenReplays,markReplaySeen} from '../replay-ready.js';

const memo=()=>{const map=new Map();return {getItem:key=>map.get(key)||null,setItem:(key,val)=>map.set(key,val),map};};

test('only completed calendar periods are selectable; current week/month/year remain in Insights',()=>{
 const day='2026-11-18';
 for(const [kind,start,end] of [['week','2026-11-08','2026-11-14'],['month','2026-10-01','2026-10-31'],['year','2025-01-01','2025-12-31']]){
  const p=replayPeriod(kind,day);
  assert.deepEqual([p.start,p.end,p.visibleEnd,p.full],[start,end,end,true]);
  assert.ok(p.end<day);assert.ok(p.previousVisibleEnd<p.start);
  assert.throws(()=>replayPeriod(kind,day,1),/Invalid/);
 }
 const week=replayPeriod('week','2026-11-15');
 assert.deepEqual([week.start,week.end],['2026-11-08','2026-11-14']);
 const month=replayPeriod('month','2026-12-01');
 assert.deepEqual([month.start,month.end],['2026-11-01','2026-11-30']);
 const year=replayPeriod('year','2027-01-01');
 assert.deepEqual([year.start,year.end],['2026-01-01','2026-12-31']);
});

test('an incomplete current period is never included in a sealed recap',()=>{
 const book={id:'b',title:'Book',status:'reading',read_history:[]};
 const rows=[{user_book_id:'b',session_date:'2026-11-12',duration_minutes:45,pages_read:20},
  {user_book_id:'b',session_date:'2026-11-16',duration_minutes:80,pages_read:32}];
 const closed=buildReadingReplay({books:[book],sessions:rows,today:'2026-11-18',trackingStart:'2026-01-01',kind:'week'});
 assert.equal(closed.period.end,'2026-11-14');assert.equal(closed.minutes,45);assert.equal(closed.pages,20);
 assert.equal(closed.previous.minutes,0);
});

test('recent completion celebrates only owned periods with recorded data; a seen recap does not repeat',()=>{
 const storage=memo(),user='owner-one',today='2027-01-01';
 let seen=latestUnseenReplays({ownerId:user,today,storage,hasData:()=>true});
 assert.deepEqual(seen.map(x=>x.kind),['week','month','year']);
 assert.deepEqual(seen.map(x=>x.period.end),['2026-12-26','2026-12-31','2026-12-31']);
 markReplaySeen({ownerId:user,kind:'week',end:seen[0].period.end,storage});
 seen=latestUnseenReplays({ownerId:user,today,storage,hasData:()=>true});
 assert.deepEqual(seen.map(x=>x.kind),['month','year']);
 assert.deepEqual(latestUnseenReplays({ownerId:user,today,storage,hasData:(kind)=>kind==='year'}).map(x=>x.kind),['year']);
 assert.equal(latestUnseenReplays({ownerId:'other-user',today,storage,hasData:()=>true}).length,3);
 assert.equal(latestUnseenReplays({ownerId:null,today,storage}).length,0);
 assert.notEqual(replaySeenKey(user,'year','2026-12-31'),replaySeenKey('other-user','year','2026-12-31'));
});

test('the celebration only appears soon after a period ends, never for old historical recaps',()=>{
 const storage=memo();
 assert.deepEqual(latestUnseenReplays({ownerId:'a',today:'2026-11-18',storage,hasData:()=>true}).map(x=>x.kind),['week','month']);
 assert.equal(latestUnseenReplays({ownerId:'a',today:'2026-11-18',storage,hasData:()=>false}).length,0);
 assert.throws(()=>replaySeenKey('a','whatever','2026-11-14'),/Invalid/);
});

test('app shows one dismissed, private celebration panel, linking each recap to the sealed period',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const worker=readFileSync(new URL('../service-worker.js',import.meta.url),'utf8');
 assert.match(app,/renderReplayReadyBanner\(\)/);
 assert.match(app,/if\(!own\(\)\|\|!state\.replayReady\.length/);
 assert.match(app,/case 'replay-ready-open'/);
 assert.match(app,/case 'replay-ready-dismiss'/);
 assert.match(app,/markReplaySeen/);
 assert.match(app,/state\.replayOffset=0/);
 assert.match(worker,/\/replay-ready\.js/);
});
