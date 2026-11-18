import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {weekStartSunday,weekEndSaturday,weekDatesSundayFirst,WEEKDAY_NAMES} from '../calendar-week.js';
import {dailyGoalTimeSeries} from '../reading-metrics.js';

const entry=(d,m)=>({user_book_id:'dune',session_date:d,duration_minutes:m,activity_mode:'reading',pages_read:10});

test('Sunday through Saturday is the calendar week, without losing dates',()=>{
 assert.deepEqual(WEEKDAY_NAMES,['Sun','Mon','Tue','Wed','Thu','Fri','Sat']);
 assert.equal(weekStartSunday('2026-11-15'),'2026-11-15');
 assert.equal(weekStartSunday('2026-11-17'),'2026-11-15');
 assert.equal(weekStartSunday('2026-11-21'),'2026-11-15');
 assert.equal(weekStartSunday('2026-11-22'),'2026-11-22');
 assert.equal(weekEndSaturday('2026-11-17'),'2026-11-21');
 assert.deepEqual(weekDatesSundayFirst('2026-11-17'),[
   '2026-11-15','2026-11-16','2026-11-17','2026-11-18','2026-11-19','2026-11-20','2026-11-21']);
});

test('Sunday week boundaries cross year and daylight saving dates safely',()=>{
 assert.equal(weekStartSunday('2027-01-01'),'2026-12-27');
 assert.equal(weekEndSaturday('2027-01-01'),'2027-01-02');
 assert.equal(weekStartSunday('2026-03-08'),'2026-03-08');
 assert.equal(weekEndSaturday('2026-03-08'),'2026-03-14');
 assert.equal(weekStartSunday('2026-11-01'),'2026-11-01');
 for(const value of ['2026-02-29','nope','2026-13-01',''])assert.throws(()=>weekStartSunday(value),RangeError);
});

test('Sunday and Saturday sessions are included in this week; neighboring week excluded',()=>{
 const rows=[entry('2026-11-14',99),entry('2026-11-15',15),entry('2026-11-16',30),entry('2026-11-21',45),entry('2026-11-22',88)];
 const week=weekDatesSundayFirst('2026-11-17');
 const included=rows.filter(r=>r.session_date>=week[0]&&r.session_date<=week[6]);
 assert.deepEqual(included.map(x=>x.session_date),['2026-11-15','2026-11-16','2026-11-21']);
 const data=dailyGoalTimeSeries(included,{goalHistory:[{effective_date:'2026-11-01',target_minutes:30}],targetMinutes:30,today:'2026-11-21',periodStart:week[0],periodEnd:week[6]});
 assert.deepEqual(data.map(x=>x.key),week);
 assert.deepEqual(data.map(x=>x.actualMinutes),[15,30,0,0,0,0,45]);
 assert.equal(data.reduce((n,x)=>n+x.actualMinutes,0),90);
});

test('app and preview both use Sunday first and a PWA cache bump',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const habits=readFileSync(new URL('../reading-habits.js',import.meta.url),'utf8');
 const preview=readFileSync(new URL('../../PREVIEW_SITE/index.html',import.meta.url),'utf8');
 const worker=readFileSync(new URL('../service-worker.js',import.meta.url),'utf8');
 assert.match(app,/weekStartSunday\(date\)/);
 assert.match(app,/weekStartSunday\(addDays\(today\(\),-77\)\)/);
 assert.match(app,/Sunday to Saturday/);
 assert.match(habits,/aggregate\(\[0,6\]\)/);
 assert.match(preview,/Sun–Sat, Nov 8–14/);
 assert.match(preview,/current Sunday–Saturday/);
 assert.match(preview,/\['Sun','Mon','Tue','Wed','Thu','Fri','Sat'\]/);
 assert.match(worker,/reading-room-v2\.[0-9]+\.[0-9]+-[a-z0-9-]+/);
 assert.match(worker,/\/calendar-week\.js/);
 assert.doesNotMatch(app,/mondayOf|Monday to Sunday/);
});
