import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseGoodreads,goodreadsISBN,mergeGoodreadsBook,prepareGoodreadsImport} from '../goodreads-import.js';
import {filterLibraryBooks,availableGenres} from '../library-view.js';
import {enrichAfterGoodreadsImport, applyTrustedMetadata} from '../import-enrichment.js';
import {genresForISBNBatch} from '../catalog.js';

const csvCols=['Book Id','Title','Author','ISBN','ISBN13','My Rating','Publisher','Binding','Number of Pages','Year Published','Original Publication Year','Date Read','Date Added','Bookshelves','Exclusive Shelf','My Review','Read Count'];
const rows=[
 ['1','Fictional Space Book','A Author','=""','="9781234567897"','4','Ace Books','Paperback','410','2015','1970','2025/09/11','2025/06/02','favorites','read','Loved it','1'],
 ['2','Fictional Mystery','B Author','=""','=""','0','Example Publishing','Hardcover','300','2021','2007','','2026/10/02','','to-read','','0']
];
const csv=[csvCols,...rows].map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n');
const imported=parseGoodreads(csv,{userId:'user1',existingCount:6,uuid:(()=>{let i=0;return()=>`book${++i}`;})()});

test('Goodreads CSV export quotes, ISBN wrappers and edition fields are parsed correctly',()=>{
 assert.equal(goodreadsISBN('=""'),null);
 assert.equal(goodreadsISBN('="9781234567897"'),'9781234567897');
 assert.equal(imported.length,2);
 assert.equal(imported[0].isbn,'9781234567897');
 assert.equal(imported[0].edition_year,2015);
 assert.equal(imported[0].original_published_year,1970);
 assert.equal(imported[0].goodreads_added_on,'2025-06-02');
 assert.equal(imported[1].isbn,null);
 assert.equal(imported[1].publisher,'Example Publishing');
 assert.equal(imported[1].binding,'Hardcover');
 assert.equal(imported[1].page_count,300);
 assert.equal(imported[1].goodreads_added_on,'2026-10-02');
 assert.equal(imported[0].rating,4);
 assert.equal(imported[0].favorite,true);
});

test('reimport updates missing bibliographic fields but preserves personal edits',()=>{
 const previous={...imported[1],id:'original',user_id:'user1',rating:4.75,notes:'My edited notes',page_count:null,edition_year:null,genres:['Mystery'],finished_on:'2025-01-01',read_history:[{number:1,status:'finished',finished_on:'2025-01-01'}]};
 const merged=mergeGoodreadsBook(previous,{...imported[1],isbn:'9781234567897',genres:['Horror'],rating:2,notes:'Overwrite?',read_history:[{number:2}]});
 assert.equal(merged.id,'original');
 assert.equal(merged.edition_year,2021);
 assert.equal(merged.page_count,300);
 assert.equal(merged.isbn,'9781234567897');
 assert.deepEqual(merged.genres,['Mystery']);
 assert.equal(merged.rating,4.75);
 assert.equal(merged.notes,'My edited notes');
 assert.equal(merged.finished_on,'2025-01-01');
 assert.deepEqual(merged.read_history,previous.read_history);
 const plan=prepareGoodreadsImport(imported,[previous]);
 assert.equal(plan.additions.length,1);
 assert.equal(plan.updates.length,1);
 assert.equal(plan.all.length,2);
 assert.equal(plan.all[1].id,'original');
});

test('ISBN books receive ONLY genres; no-ISBN books can receive covers and confident editions',async()=>{
 const books=imported.map(b=>({...b,genres:[]}));
 const saved=[];
 const progress=[];
 const result=await enrichAfterGoodreadsImport(books,{
  pacingMs:0,
  save:async b=>saved.push(b),onProgress:p=>progress.push(p),
  isbnBatchLookup:async ids=>{assert.deepEqual(ids,['9781234567897']);return new Map([['9781234567897',['Science Fiction']]]);},
  googleGenreLookup:async()=>{throw Error('Unnecessary fallback');},
  fullBookLookup:async b=>({...b,isbn:'9789876543210',cover_url:'https://covers.openlibrary.org/b/id/42-M.jpg',genres:['Mystery'],edition_key:'/books/OL42M',work_key:'/works/OLW',description:'Catalog description'})
 });
 assert.equal(result.total,2);
 assert.equal(result.saved,2);
 assert.equal(result.genreFilled,2);
 assert.equal(result.editionMatched,1);
 assert.deepEqual(saved[0].genres,['Science Fiction']);
 for(const key of ['isbn','publisher','binding','page_count','edition_year','cover_url'])assert.equal(saved[0][key],books[0][key],key);
 assert.equal(saved[1].edition_key,'/books/OL42M');
 assert.equal(saved[1].isbn,'9789876543210');
 assert.equal(saved[1].cover_url,'https://covers.openlibrary.org/b/id/42-M.jpg');
 assert.equal(progress.at(-1).phase,'Complete');
});

test('missing/empty catalog fields do not erase existing CSV values',()=>{
 const before={isbn:null,genres:[],edition_year:2021,publisher:'CSV publisher',cover_url:null};
 const merged=applyTrustedMetadata(before,{isbn:'',genres:[],edition_year:null,publisher:'',cover_url:'https://covers.openlibrary.org/b/id/123-M.jpg'});
 assert.equal(merged.isbn,null);
 assert.equal(merged.edition_year,2021);
 assert.equal(merged.publisher,'CSV publisher');
 assert.equal(merged.cover_url,'https://covers.openlibrary.org/b/id/123-M.jpg');
});

test('ISBN genre lookup batches multiple ISBNs into one Open Library API call',async()=>{
 const old=globalThis.fetch;
 let calls=0;
 globalThis.fetch=async url=>{
  calls++;
  assert.match(String(url),/\/api\/books\?/);
  assert.match(decodeURIComponent(String(url)),/ISBN:9780000000001,ISBN:9780000000002/);
  return {ok:true,json:async()=>({
   'ISBN:9780000000001':{subjects:[{name:'Science Fiction'},{name:'Desert ecology'}]},
   'ISBN:9780000000002':{subjects:[{name:'Fantasy'}]}
  })};
 };
 try{
  const map=await genresForISBNBatch(['9780000000001','9780000000002']);
  assert.deepEqual(map.get('9780000000001'),['Science Fiction']);
  assert.deepEqual(map.get('9780000000002'),['Fantasy']);
  assert.equal(calls,1);
 }finally{globalThis.fetch=old;}
});

test('cover/table use the same shelf, search, activity and genre filters',()=>{
 const books=[
  {title:'A',author:'Sam',genres:['Science Fiction','Adventure'],status:'finished',favorite:true,shelf_order:1,rating:5,id:'a'},
  {title:'B',author:'Jo',genres:['Fantasy'],status:'tbr',favorite:false,shelf_order:2,id:'b'},
  {title:'C',author:'Leo',genres:[],status:'finished',favorite:false,shelf_order:3,id:'c'}
 ];
 assert.deepEqual(availableGenres(books),['Adventure','Fantasy','Science Fiction']);
 assert.deepEqual(filterLibraryBooks(books,{shelf:'finished',genre:'Adventure',mode:'reading',modeForBook:b=>b.id==='a'?['reading']:[]}).map(b=>b.id),['a']);
 assert.deepEqual(filterLibraryBooks(books,{genre:'__uncategorized__'}).map(b=>b.id),['c']);
 assert.deepEqual(filterLibraryBooks(books,{query:'jo'}).map(b=>b.id),['b']);
 assert.deepEqual(filterLibraryBooks(books,{sort:'title',sortDirection:'desc'}).map(b=>b.id),['c','b','a']);
});

test('additive schema migration stores Goodreads Date Added on all shelves',()=>{
 const schema=readFileSync(new URL('../supabase/schema.sql',import.meta.url),'utf8');
 const migration=readFileSync(new URL('../supabase/migrations/2026-11-17_goodreads_added_date.sql',import.meta.url),'utf8');
 assert.match(schema,/goodreads_added_on date/);
 assert.match(migration,/add column if not exists goodreads_added_on date/);
});


test('ISBN Google genre fallback still runs when the Open Library batch request fails',async()=>{
 const books=[{...imported[0],genres:[]}], saved=[];
 const result=await enrichAfterGoodreadsImport(books,{
  pacingMs:0,save:async b=>saved.push(b),
  isbnBatchLookup:async()=>{throw Error('provider unavailable');},
  googleGenreLookup:async id=>{assert.equal(id,'9781234567897');return ['Science Fiction'];},
  fullBookLookup:async()=>{throw Error('ISBN books must not run full enrichment');}
 });
 assert.equal(result.genreFilled,1);
 assert.equal(result.saved,1);
 assert.deepEqual(saved[0].genres,['Science Fiction']);
 assert.equal(saved[0].isbn,books[0].isbn);
 assert.equal(saved[0].edition_year,books[0].edition_year);
});

test('one consolidated existing-database upgrade includes new source dates and edition metadata',()=>{
 const sql=readFileSync(new URL('../supabase/UPGRADE_EXISTING_TO_V2.1.sql',import.meta.url),'utf8');
 for(const col of ['goodreads_added_on','edition_year','original_published_year','binding'])
  assert.match(sql,new RegExp(`ADD COLUMN IF NOT EXISTS ${col}`,'i'));
});
