import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';
const memory=new Map();
globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
const app={innerHTML:'',listeners:{},addEventListener(k,h){this.listeners[k]=h},querySelector(s){
 if(s==='#chapter-pasted-contents')return {value:'Prologue .......... 1\nChapter 1 .......... 12\nChapter 2 .......... 29\nChapter 3 .......... 54'};
 return null;
}};
const toast={innerHTML:''};
globalThis.document={visibilityState:'visible',addEventListener(){},querySelector(s){return s==='#app'?app:s==='#toast-root'?toast:null;}};
globalThis.window={READING_ROOM_CONFIG:{},addEventListener(){},scrollTo(){}};
globalThis.location={protocol:'file:'};
await import('../app.js');await new Promise(r=>setTimeout(r,150));
const click=async (selector,dataset)=>await app.listeners.click({preventDefault(){},target:{closest(s){return s===selector?{dataset}:null},classList:{contains(){return false}}}});
await click('[data-tab]',{tab:'library'});
await click('[data-action]',{action:'open-book',id:'demo-a-b0'});
await click('[data-booktab]',{booktab:'chapters'});
assert.match(app.innerHTML,/Find chapter pages/);
assert.match(app.innerHTML,/chapter-openlibrary/);
assert.match(app.innerHTML,/chapter-shared-list/);
assert.match(app.innerHTML,/chapter-photo-file/);
assert.match(app.innerHTML,/chapter-pasted-contents/);
assert.match(app.innerHTML,/Contribute my verified map/);
await click('[data-action]',{action:'chapter-parse-paste',id:'demo-a-b0'});
assert.match(app.innerHTML,/Review candidate map/);
assert.match(app.innerHTML,/Chapter 3/);
assert.match(app.innerHTML,/data-chapter-candidate="3"/);
assert.match(app.innerHTML,/chapter-verified-checkbox/);
assert.match(app.innerHTML,/chapter-apply-map/);
assert.match(app.innerHTML,/Suggested end pages are calculated/);
console.log('Chapter sourcing and candidate editor rendered:',app.innerHTML.length,'HTML characters');
const file=process.env.READING_ROOM_CHAPTER_SNAPSHOT;
if(file){
 const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
 const tokens=readFileSync(new URL('../design-tokens.css',import.meta.url),'utf8');
 writeFileSync(file,`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${tokens}\n${css}</style><div id="app">${app.innerHTML}</div></html>`);
}
