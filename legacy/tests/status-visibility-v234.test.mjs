import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {updateLatestPass,beginReread} from '../reading-history.js';
const src=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');

test('reading status selector is prominent before metadata lookup, exactly once',()=>{
  const visible=src.indexOf('class="book-status-edit"');
  const lookup=src.indexOf('renderBookMetadataLookup(b)}<div class="formgrid"');
  assert.ok(visible>=0 && lookup>visible);
  assert.equal((src.match(/id="edit-status"/g)||[]).length,1);
  assert.match(src, /<label for="edit-status">Reading status<\/label>/);
  assert.match(src,/data-action="start-reread"/);
  assert.match(src, /Select a status, then use <strong>Save book<\/strong>/);
  assert.match(css,/\.book-status-edit/);
});

test('finished books must use a new reread to resume instead of rewriting original',()=>{
  assert.match(src,/if\(\['finished','dnf'\]\.includes\(b\.status\)&&status==='reading'\)return toast/);
  const finished={id:'dune',status:'finished',started_on:'2022-03-01',finished_on:'2022-06-01',read_history:[{number:1,status:'finished',started_on:'2022-03-01',finished_on:'2022-06-01'}]};
  const rerun=beginReread(finished,'2026-11-17');
  assert.equal(rerun.read_history.length,2);
  assert.equal(rerun.read_history[0].finished_on,'2022-06-01');
  assert.equal(rerun.read_history[1].status,'reading');
  const updated=updateLatestPass(rerun,{...rerun,status:'finished',finished_on:'2026-12-01'});
  assert.equal(updated.read_history[0].finished_on,'2022-06-01');
  assert.equal(updated.read_history[1].finished_on,'2026-12-01');
});
