// Render the real source book-history tab in local-only demo mode.
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';
const memory=new Map();
globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
const root={innerHTML:'',listeners:{},addEventListener(k,cb){this.listeners[k]=cb},querySelector(){return null}};
const toast={innerHTML:''};
globalThis.document={visibilityState:'visible',addEventListener(){},querySelector:s=>s==='#app'?root:s==='#toast-root'?toast:null};
globalThis.window={READING_ROOM_CONFIG:{},addEventListener(){},scrollTo(){}};
globalThis.location={protocol:'file:'};
await import('../app.js');await new Promise(r=>setTimeout(r,180));
const click=(selector,dataset)=>({preventDefault(){},target:{closest(s){return s===selector?{dataset}:null},classList:{contains(){return false}}}});
await root.listeners.click(click('[data-tab]',{tab:'library'}));
await root.listeners.click(click('[data-action]',{action:'open-book',id:'demo-a-b6'}));
await root.listeners.click(click('[data-booktab]',{booktab:'history'}));
assert.match(root.innerHTML,/Edit original read & rereads/);
assert.match(root.innerHTML,/data-action="add-read-pass"/);
assert.match(root.innerHTML,/data-action="save-read-history"/);
assert.match(root.innerHTML,/data-action="reassign-read-history"/);
assert.match(root.innerHTML,/data-pass-field="finished_year"/);
assert.match(root.innerHTML,/data-read-pass-row="1"/);
assert.match(root.innerHTML,/Existing session times/);
const path=process.env.READING_ROOM_HISTORY_SNAPSHOT;
if(path){
 const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
 const tokens=readFileSync(new URL('../design-tokens.css',import.meta.url),'utf8');
 writeFileSync(path,`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${tokens}\n${css}</style><div id="app">${root.innerHTML}</div></html>`);
}
await root.listeners.click(click('[data-tab]',{tab:'log'}));
assert.match(root.innerHTML,/id="log-pass"/);
assert.match(root.innerHTML,/Reread #1/);
console.log('v2.3 read-history and session-pass render smoke passed');
