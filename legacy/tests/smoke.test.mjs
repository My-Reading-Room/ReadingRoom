import test from 'node:test';
import assert from 'node:assert/strict';
import { DemoRepo,localDate,offsetDate } from '../db.js';
import { searchCatalog,getEditions,toLibraryBook } from '../catalog.js';

class MemoryStorage {
  constructor(){this.map=new Map();}
  getItem(k){return this.map.get(k)||null;}
  setItem(k,v){this.map.set(k,v);}
  removeItem(k){this.map.delete(k);}
}

globalThis.localStorage=new MemoryStorage();
globalThis.window={READING_ROOM_CONFIG:{},addEventListener() {},scrollTo() {}};

test('separate libraries, linked partner profiles and local persistence',async()=>{
  const r=new DemoRepo();const user=await r.init();const data=await r.load();
  assert.equal(user.id,'demo-a');
  assert.equal(data.profiles.length,3);
  assert.equal(data.members.length,2);
  assert.ok(data.books.filter(x=>x.user_id==='demo-a').length>5);
  assert.ok(data.books.filter(x=>x.user_id==='demo-b').length>4);
  const book=data.books.find(b=>b.user_id==='demo-a');
  await r.save('books',{...book,rating:4.25,favorite:true});
  const reload=new DemoRepo();await reload.init();
  assert.equal((await reload.load()).books.find(x=>x.id===book.id).rating,4.25);
});

test('exact chapter mappings are stored with each individual book',async()=>{
  const r=new DemoRepo();await r.init();let data=await r.load();
  const c=data.chapters.find(x=>x.user_book_id==='demo-a-b0');
  assert.equal(c.end_page-c.start_page+1,18);
  const c2={id:'test-boundary',user_id:'demo-a',user_book_id:'demo-a-b0',chapter_number:4,start_page:68,end_page:88,chapter_label:'Chapter 4'};
  await r.save('chapters',c2);
  data=await r.load();assert.ok(data.chapters.find(x=>x.id===c2.id));
});

test('Open Library search normalizes a work record',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async url=>{
    if(String(url).includes('/search.json'))return {ok:true,json:async()=>({docs:[{key:'/works/OL1W',title:'Example Story',author_name:['A. Writer'],first_publish_year:2001,cover_i:123,edition_count:3}]})};
    throw new Error('Unexpected URL: '+url);
  };
  try{
    const result=await searchCatalog('Example Story');
    assert.equal(result.length,1);
    assert.equal(result[0].key,'/works/OL1W');
    assert.equal(result[0].edition_count,3);
    assert.ok(result[0].cover_url.includes('123-M.jpg'));
  }finally{globalThis.fetch=original;}
});

test('Open Library editions keep exact edition ISBN and page count',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async url=>{
    assert.ok(String(url).includes('/works/OL1W/editions.json'));
    return{ok:true,json:async()=>({entries:[{key:'/books/OL55M',title:'Example Story',number_of_pages:464,isbn_13:['9780000000000'],publish_date:'2014',covers:[55]}]})};
  };
  try{
    const editions=await getEditions({kind:'work',key:'/works/OL1W',title:'Example Story',author:'A. Writer'});
    assert.equal(editions[0].page_count,464);
    assert.equal(editions[0].isbn,'9780000000000');
    const row=toLibraryBook(editions[0],'example-user',1);
    assert.equal(row.page_count,464);
    assert.equal(row.status,'tbr');
    assert.equal(row.rating,null);
  }finally{globalThis.fetch=original;}
});

test('date helpers return ISO dates',()=>{
  assert.match(localDate(),/^\d{4}-\d{2}-\d{2}$/);
  assert.match(offsetDate(7),/^\d{4}-\d{2}-\d{2}$/);
});


test('reading modes include audiobook page-equivalents and position-only sessions',async()=>{
  const r=new DemoRepo();await r.init();const d=await r.load();
  assert.ok(d.sessions.some(s=>s.activity_mode==='reading'));
  const audio=d.sessions.filter(s=>s.activity_mode==='audiobook');
  assert.ok(audio.some(s=>s.log_type==='audio_position'&&s.pages_read===null));
  assert.ok(audio.some(s=>s.log_type==='pages'&&s.pages_read>0));
  assert.ok(audio.every(s=>s.duration_minutes>0));
  assert.ok(d.sessions.filter(s=>s.activity_mode==='read_listen').every(s=>s.duration_minutes>0));
});

test('sharing levels are per owner/viewer and summary uses only aggregates',async()=>{
 const r=new DemoRepo();await r.init();const d=await r.load();
 assert.equal(d.shares.find(s=>s.owner_id==='demo-b'&&s.viewer_id==='demo-a').access_level,'full');
 assert.equal(d.shares.find(s=>s.owner_id==='demo-c'&&s.viewer_id==='demo-a').access_level,'summary');
 const summary=d.summaries.find(s=>s.owner_id==='demo-c');
 assert.ok(summary && summary.total_minutes>0);
 assert.equal('books' in summary,false);
 await r.setShareLevel('demo-c','full');
 assert.equal((await r.load()).shares.find(s=>s.owner_id==='demo-a'&&s.viewer_id==='demo-c').access_level,'full');
 await r.setShareLevel('demo-c','none');
 assert.ok(!(await r.load()).shares.some(s=>s.owner_id==='demo-a'&&s.viewer_id==='demo-c'));
});


test('SQL migration removes circle-wide raw-table policies and creates scoped summaries',async()=>{
  const {readFileSync}=await import('node:fs');
  const sql=readFileSync(new URL('../supabase/migrations/2026-11-13_modes_and_profile_sharing.sql',import.meta.url),'utf8');
  assert.match(sql,/drop policy if exists "Read shared libraries"/);
  assert.match(sql,/drop policy if exists "Read shared sessions"/);
  assert.match(sql,/public\.can_view_full\(user_id\)/);
  assert.match(sql,/create or replace function public\.get_viewable_profile_summaries/);
  assert.match(sql,/redeem_profile_share_invite/);
  assert.match(sql,/read_listen/);
  assert.match(sql,/audio_position/);
});


test('v1.2 SQL upgrade explicitly permits audiobook pages with exact chapter enforcement retained',async()=>{
  const {readFileSync}=await import('node:fs');
  const mig=readFileSync(new URL('../supabase/migrations/2026-11-13_audio_page_equivalents.sql',import.meta.url),'utf8');
  const schema=readFileSync(new URL('../supabase/schema.sql',import.meta.url),'utf8');
  assert.match(mig,/log_type='pages'\s+and pages_read > 0/);
  assert.doesNotMatch(mig,/log_type='pages' and activity_mode <> 'audiobook'/);
  assert.match(mig,/log_type='chapters'/);
  assert.match(mig,/log_type='audio_position'/);
  assert.match(schema,/v1\.2: Allow Time \+ Pages in Audiobook Only/);
  assert.match(schema,/Exact page boundaries are required for every chapter/);
});
