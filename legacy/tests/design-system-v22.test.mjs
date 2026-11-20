import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=(name)=>readFileSync(new URL(name,import.meta.url),'utf8');
test('app loads and caches design tokens before component CSS',()=>{
 const html=read('../index.html'),sw=read('../service-worker.js'),tokens=read('../design-tokens.css');
 assert.ok(html.indexOf('/design-tokens.css')>0);
 assert.ok(html.indexOf('/style.css')>html.indexOf('/design-tokens.css'));
 assert.match(sw,/\/'design-tokens\.css'|\/design-tokens\.css/);
 assert.match(tokens,/--color-primary:\s*#2d5941/i);
 assert.match(tokens,/--color-chart-tbr:\s*#628c71/i);
});
test('visual preview contains the nine TBR ages and editable metadata screen',()=>{
 const html=read('../../docs/design/preview-site/index.html');
 for(const text of ['2–3 years','3–4 years','4–5 years','5+ years','book_detail_meta','mockBookMetadataEditor','Look up metadata &amp; cover'])assert.ok(html.includes(text),text);
});
test('shareable design guide lists exact TBR boundaries and authoritative files',()=>{
 const md=read('../../docs/DESIGN_SYSTEM.md');
 for(const name of ['APP/design-tokens.css','APP/style.css','PREVIEW_SITE/index.html','DESIGN_REFERENCE.pdf','1826+','--color-primary','--color-chart-tbr'])assert.ok(md.includes(name),name);
});
