import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';
const memory=new Map();
globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
const app={innerHTML:'',listeners:{},addEventListener(k,h){this.listeners[k]=h},querySelector(){return null}};
const toast={innerHTML:''};
globalThis.document={visibilityState:'visible',addEventListener(){},querySelector(s){return s==='#app'?app:s==='#toast-root'?toast:null;}};
globalThis.window={READING_ROOM_CONFIG:{},addEventListener(){},scrollTo(){}};
globalThis.location={protocol:'file:'};
await import('../app.js');await new Promise(r=>setTimeout(r,150));
const fakeClick=(selector,dataset)=>({preventDefault(){},target:{closest(s){return s===selector?{dataset}:null},classList:{contains(){return false}}}});
await app.listeners.click(fakeClick('[data-tab]',{tab:'library'}));
await app.listeners.click(fakeClick('[data-action]',{action:'open-book',id:'demo-a-b0'}));
assert.match(app.innerHTML,/Book identifiers, genres &amp; cover/);
assert.match(app.innerHTML,/id="edit-isbn"/);
assert.match(app.innerHTML,/id="edit-asin"/);
assert.match(app.innerHTML,/id="edit-cover-url"/);
assert.match(app.innerHTML,/id="edit-genres"/);
assert.match(app.innerHTML,/data-action="add-book-genre"/);
assert.match(app.innerHTML,/data-action="lookup-book-metadata"/);
assert.match(app.innerHTML,/data-action="preview-cover-url"/);
console.log('Per-book edit modal generated',app.innerHTML.length,'chars');
const out=process.env.READING_ROOM_DETAIL_SNAPSHOT;
if(out){
 const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
 writeFileSync(out,`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><div id="app">${app.innerHTML}</div></html>`);
}
