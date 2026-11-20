import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DemoRepo, CloudRepo} from '../db.js';
import {
 isbn13ForEdition,sameEditionISBN,draftFromStarts,draftFromContentsText,
 draftFromOpenLibraryEdition,lookupOpenLibraryChapters,validateVerifiedChapterMap,
 reviewedSharedCandidate
} from '../chapter-sourcing.js';

const isbn='9780441172719';
const book={page_count:604,isbn,title:'Dune'};
const checked=[
 {chapter_number:1,chapter_label:'Chapter One',start_page:1,end_page:18},
 {chapter_number:2,chapter_label:'Chapter Two',start_page:19,end_page:45}
];

test('ISBN-10 and ISBN-13 are canonicalized to matching edition identifiers',()=>{
 assert.equal(isbn13ForEdition('0-451-52493-4'),'9780451524935');
 assert.ok(sameEditionISBN('0451524934','9780451524935'));
 assert.equal(isbn13ForEdition('9780441172710'),'');
 assert.equal(isbn13ForEdition('not-a-book'),'');
});

test('Open Library exact ISBN table of contents only becomes an editable draft',()=>{
 const edition={key:'/books/OL1234M',title:'Dune',number_of_pages:604,isbn_13:[isbn],
  table_of_contents:[{title:'Book One',pagenum:1},{title:'Book Two',pagenum:50},{title:'Book Three',pagenum:113}]};
 const draft=draftFromOpenLibraryEdition(edition,isbn);
 assert.deepEqual(draft.rows.map(c=>[c.start_page,c.end_page]),[[1,49],[50,112],[113,'']]);
 assert.equal(draft.sourceUrl,'https://openlibrary.org/books/OL1234M');
 assert.throws(()=>validateVerifiedChapterMap(draft.rows,book),/confirm both/);
 assert.throws(()=>draftFromOpenLibraryEdition({...edition,isbn_13:['9780451524935']},isbn),/different edition/);
 assert.throws(()=>draftFromOpenLibraryEdition({...edition,table_of_contents:[]},isbn),/no usable numbered/);
});

test('Open Library network request uses an exact ISBN endpoint and handles 404',async()=>{
 const urls=[];
 const mock=async(url,options)=>{
  urls.push(url);assert.equal(options.headers.Accept,'application/json');
  return {ok:true,json:async()=>({title:'Dune',isbn_13:[isbn],table_of_contents:[{title:'Ch. 1',pagenum:1}]})};
 };
 const draft=await lookupOpenLibraryChapters(isbn,mock);
 assert.equal(urls[0],`https://openlibrary.org/isbn/${isbn}.json`);
 assert.equal(draft.rows[0].end_page,'');
 await assert.rejects(lookupOpenLibraryChapters(isbn,async()=>({ok:false,status:404})),/No Open Library edition/);
});

test('OCR and pasted contents parse Arabic page numbers, flag noise and leave the last end blank',()=>{
 const draft=draftFromContentsText('TABLE OF CONTENTS\nIntro ...... ix\nPrologue .......... 1\nChapter 1 .......... 12\nChapter 2 .......... 30\nAppendix .......... 250');
 assert.deepEqual(draft.rows.map(c=>[c.chapter_label,c.start_page,c.end_page]),[
  ['Prologue',1,11],['Chapter 1',12,29],['Chapter 2',30,249],['Appendix',250,'']]);
 assert.match(draft.warnings.join(' '),/could not be interpreted/);
 const dup=draftFromStarts([{title:'one',page:1},{title:'heading',page:1},{title:'two',page:8}]);
 assert.deepEqual(dup.rows.map(x=>x.chapter_label),['one','two']);
 assert.match(dup.warnings[0],/Skipped heading/);
});

test('exact mapping checks all chapters, overlap, edition limits, and page boundaries',()=>{
 assert.deepEqual(validateVerifiedChapterMap(checked,book),checked);
 assert.throws(()=>validateVerifiedChapterMap([{chapter_label:'C1',start_page:1,end_page:''}],book),/confirm both/);
 assert.throws(()=>validateVerifiedChapterMap([{chapter_label:'C1',start_page:1,end_page:40},{chapter_label:'C2',start_page:20,end_page:60}],book),/overlap/);
 assert.throws(()=>validateVerifiedChapterMap([{chapter_label:'C1',start_page:1,end_page:605}],book),/after the saved/);
 assert.throws(()=>validateVerifiedChapterMap([],book),/between 1/);
});

test('shared maps cannot be applied across ISBNs',()=>{
 assert.deepEqual(reviewedSharedCandidate({isbn13:isbn,chapters:checked},isbn),checked);
 assert.throws(()=>reviewedSharedCandidate({isbn13:'9780451524935',chapters:checked},isbn),/another ISBN/);
});

test('demo persists reviewed mappings and opt-in sharing without modifying sessions',async()=>{
 const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
 const repo=new DemoRepo();await repo.init();
 const original=await repo.load(),logs=original.sessions.length;
 await repo.replaceChapterMap('demo-a-b0',checked);
 const saved=await repo.load();
 assert.equal(saved.chapters.filter(c=>c.user_book_id==='demo-a-b0').length,2);
 assert.equal(saved.sessions.length,logs);
 assert.equal((await repo.listSharedChapterMaps(isbn)).length,0);
 await repo.publishChapterMap('demo-a-b0');
 const candidates=await repo.listSharedChapterMaps(isbn);
 assert.equal(candidates.length,1);
 assert.deepEqual(candidates[0].chapters,checked);
 assert.equal((await repo.listSharedChapterMaps('9780451524935')).length,0);
 await repo.publishChapterMap('demo-a-b0');
 assert.equal((await repo.listSharedChapterMaps(isbn)).length,1); // same contributor + ISBN upsert
 assert.equal(await repo.withdrawChapterMap('demo-a-b0'),1);
 assert.equal((await repo.listSharedChapterMaps(isbn)).length,0); // withdrawal leaves private data intact
 assert.equal((await repo.load()).chapters.filter(c=>c.user_book_id==='demo-a-b0').length,2);
 await repo.publishChapterMap('demo-a-b0');
 assert.equal((await repo.listSharedChapterMaps(isbn)).length,1);
 await assert.rejects(repo.replaceChapterMap('demo-b-b0',checked),/Only the book owner/);
});

test('cloud chapter operations use narrowly scoped RPCs rather than public write table access',async()=>{
 const calls=[];
 const repo=new CloudRepo('https://example.supabase.co','anon');
 repo.client={rpc:async(name,args)=>{calls.push([name,args]);return {data:name==='get_shared_chapter_maps'?[]:1,error:null};}};
 await repo.replaceChapterMap('book1',checked);
 await repo.listSharedChapterMaps('0451524934');
 await repo.publishChapterMap('book1');
 await repo.withdrawChapterMap('book1');
 assert.deepEqual(calls.map(c=>c[0]),['replace_book_chapter_map','get_shared_chapter_maps','publish_chapter_map','withdraw_chapter_map']);
 assert.equal(calls[1][1].p_isbn13,'9780451524935');
});

test('migration isolates community mappings behind authenticated owner-verified RPCs',()=>{
 const sql=readFileSync(new URL('../supabase/UPGRADE_EXISTING_TO_V2.3.8.sql',import.meta.url),'utf8');
 assert.match(sql,/ALTER TABLE public.shared_chapter_maps ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/REVOKE ALL ON public.shared_chapter_maps FROM PUBLIC, anon, authenticated/);
 assert.match(sql,/v_owner IS DISTINCT FROM v_user/);
 assert.match(sql,/FROM public.user_books\s+WHERE id=p_user_book_id FOR UPDATE/);
 assert.match(sql,/ON CONFLICT \(contributor_id,isbn13\)/);
 assert.match(sql,/LIMIT 8/);
 assert.match(sql,/FUNCTION public.withdraw_chapter_map\(p_user_book_id uuid\)/);
 assert.doesNotMatch(sql,/GRANT SELECT ON public.shared_chapter_maps TO authenticated/i);
});
