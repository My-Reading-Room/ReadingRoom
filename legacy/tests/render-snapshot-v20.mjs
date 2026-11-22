// Local-only QA helper: render source dashboard into a static HTML snapshot.
import fs from 'node:fs';
const memory=new Map();
globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
const root={innerHTML:'',addEventListener(){},querySelector(){return null}};
const toast={innerHTML:''};
globalThis.document={visibilityState:'visible',addEventListener(){},querySelector:s=>s==='#app'?root:s==='#toast-root'?toast:null};
globalThis.window={READING_ROOM_CONFIG:{},addEventListener(){},scrollTo(){}};
globalThis.location={protocol:'file:'};
await import('../app.js');
await new Promise(resolve=>setTimeout(resolve,250));
// The modern default is Quick summary; full Insights are rendered when selected.
if(!root.innerHTML.includes('insights-quick')||!root.innerHTML.includes('Reading activity by book')||!root.innerHTML.includes('Detailed insights')){
 throw new Error('v2.3.5 Quick Insights cards or detailed-view control missing from rendered source app');
}
const css=fs.readFileSync(new URL('../style.css',import.meta.url),'utf8');
const path=process.env.READING_ROOM_SNAPSHOT||'/tmp/reading-room-v20-static.html';
fs.writeFileSync(path,`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><main id="app">${root.innerHTML}</main>`);
console.log('Rendered dashboard snapshot: '+path+' ('+root.innerHTML.length+' chars)');
