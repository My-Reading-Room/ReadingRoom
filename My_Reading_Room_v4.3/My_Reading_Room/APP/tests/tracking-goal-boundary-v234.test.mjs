import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {anchoredGoalHistory} from '../tracking-start.js';
import {dailyGoalTargetAt,dailyGoalTimeSeries} from '../reading-metrics.js';
const history=[{effective_date:'2026-01-01',target_minutes:30},{effective_date:'2026-11-16',target_minutes:60}];
test('moving tracking start back from Nov 16 to Nov 15 uses the 60 minute initial target',()=>{
 const rows=anchoredGoalHistory(history,'2026-11-15',60);
 assert.equal(dailyGoalTargetAt(rows,'2026-11-15'),60);
 assert.equal(dailyGoalTargetAt(rows,'2026-11-16'),60);
 assert.equal(dailyGoalTargetAt(rows,'2026-11-14'),30);
 assert.equal(history.length,2);
 const data=dailyGoalTimeSeries([],{goalHistory:rows,today:'2026-11-17',periodStart:'2026-11-15',periodEnd:'2026-11-17',activeFrom:'2026-11-15'});
 assert.deepEqual(data.map(x=>x.targetMinutes),[60,60,60]);
});
test('later real goal changes remain historical, same-day versions win',()=>{
 const rows=anchoredGoalHistory([...history,{effective_date:'2026-11-17',target_minutes:45}],'2026-11-15',60);
 assert.equal(dailyGoalTargetAt(rows,'2026-11-17'),45);
 const exact=anchoredGoalHistory([{effective_date:'2026-11-15',target_minutes:25}],'2026-11-15',60);
 assert.equal(dailyGoalTargetAt(exact,'2026-11-15'),25);
 assert.equal(exact.length,1);
});
test('invalid settings cannot fabricate a goal-history version',()=>{
 assert.equal(anchoredGoalHistory(history,'2026-11-15',0),history);
 assert.equal(anchoredGoalHistory(history,'broken',60),history);
});
test('Supabase upgrade includes one per-account baseline field and no new content table',()=>{
 const sql=readFileSync(new URL('../supabase/UPGRADE_EXISTING_TO_V2.3.4.sql',import.meta.url),'utf8');
 assert.match(sql,/add column if not exists tracking_start_goal_minutes integer/i);
 assert.match(sql,/reading_goal_history/i);
 assert.match(sql,/notify pgrst, 'reload schema'/i);
});
