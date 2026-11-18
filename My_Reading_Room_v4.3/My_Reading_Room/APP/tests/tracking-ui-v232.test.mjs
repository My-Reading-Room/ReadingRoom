import test from 'node:test';
import assert from 'node:assert/strict';
import {localDate} from '../db.js';

const storage = new Map();
globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v))};
const app={innerHTML:'',listeners:{},querySelector(selector){return selector==='#setting-tracking-start'?{value:chosenStart}:selector==='#setting-tracking-goal'?{value:'60'}:null;},addEventListener(event,listener){this.listeners[event]=listener;}};
const toast={innerHTML:''};
globalThis.document={visibilityState:'visible',querySelector:id=>id==='#app'?app:id==='#toast-root'?toast:null,addEventListener(){}};
globalThis.window={READING_ROOM_CONFIG:{},addEventListener(){},scrollTo(){}};
globalThis.location={protocol:'file:'};
const chosenStart=localDate(new Date(Date.now()-86400000));
const fakeClick=(selector,dataset)=>({preventDefault(){},target:{closest(s){return s===selector?{dataset}:null;},classList:{contains(){return false}}}});

await import('../app.js');
await new Promise(resolve=>setTimeout(resolve,100));

test('tracking start can be edited in Settings, saved to owner, and applies to Insights on return',async()=>{
 assert.match(app.innerHTML,/Reading Insights/);
 await app.listeners.click(fakeClick('[data-tab]',{tab:'settings'}));
 assert.match(app.innerHTML,/id="setting-tracking-start"/);
 await app.listeners.click(fakeClick('[data-action]',{action:'save-tracking-start'}));
 const db=JSON.parse(storage.get('my-reading-room-demo-v2'));
 assert.equal(db.profiles.find(p=>p.id==='demo-a').tracking_start_date,chosenStart);
 assert.equal(db.profiles.find(p=>p.id==='demo-a').tracking_start_goal_minutes,60);
 assert.notEqual(db.profiles.find(p=>p.id==='demo-b').tracking_start_date,chosenStart);
 await app.listeners.click(fakeClick('[data-tab]',{tab:'insights'}));
 assert.match(app.innerHTML,/Tracking since/);
 await app.listeners.click(fakeClick('[data-insights-view]',{insightsView:'detailed'}));
 assert.match(app.innerHTML,/Daily goal evaluation starts on your tracking start date/);
 assert.match(app.innerHTML,/Sunday to Saturday|Daily totals for the calendar month/);
 await app.listeners.change({target:{id:'profile-picker',value:'demo-b',dataset:{}}});
 assert.match(app.innerHTML,/Tracking since/);
 assert.doesNotMatch(app.innerHTML,new RegExp('Tracking since '+new Date(chosenStart+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})));
 await app.listeners.change({target:{id:'profile-picker',value:'demo-a',dataset:{}}});
 assert.match(app.innerHTML,/Tracking since/);
});
