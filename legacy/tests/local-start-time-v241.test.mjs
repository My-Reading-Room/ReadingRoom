import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {wallClockHHMM,wallClockDay,suggestedLocalSessionTime} from '../session-start-suggestion.js';

test('opening a new log suggests local device start time, not a UTC clock time',()=>{
 const local=new Date(2026,10,18,19,7,22);
 assert.equal(wallClockDay(local),'2026-11-18');
 assert.equal(wallClockHHMM(local),'19:07');
 assert.equal(suggestedLocalSessionTime({date:'2026-11-18',now:local}),'19:07');
 assert.equal(suggestedLocalSessionTime({date:'2026-11-17',now:local}),'');
});

test('timer start time is suggested when its start belongs to today, otherwise use the opening time',()=>{
 const now=new Date(2026,10,18,20,10),earlier=new Date(2026,10,18,19,15);
 const yesterday=new Date(2026,10,17,19,15);
 assert.equal(suggestedLocalSessionTime({date:'2026-11-18',now,clockStartedAtMs:earlier.getTime()}),'19:15');
 assert.equal(suggestedLocalSessionTime({date:'2026-11-18',now,clockStartedAtMs:yesterday.getTime()}),'20:10');
 assert.equal(suggestedLocalSessionTime({date:'2026-11-17',now,clockStartedAtMs:earlier.getTime()}),'');
});

test('start-time remains an editable field, saves local time and never invents older times',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/suggestNewLogTime\(\)/);
 assert.match(app,/if\(target==='log'&&state\.tab!=='log'\)suggestNewLogTime/);
 assert.match(app,/logTimeManual:true|state\.logTimeManual=true/);
 assert.match(app,/if\(!state\.logTimeManual\)state\.logStartLocalTime=suggestedLocalSessionTime/);
 assert.match(app,/start_local_time:state\.logStartLocalTime\|\|null/);
 assert.match(app,/id="log-start-time"/);
});
