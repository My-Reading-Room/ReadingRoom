import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeISBN,isValidISBN,normalizeASIN,isValidASIN,coverURL,manualGenres,mergeReviewedMetadata,lookupBookOnRequest} from '../book-detail-metadata.js';
import {lookupISBNMetadata} from '../catalog.js';

const example={id:'one',title:'Dune',author:'Frank Herbert',isbn:'9780441172719',asin:'B0XYZ12345',genres:['My personal genre'],cover_url:'https://example.com/my-art.png',page_count:412,publisher:'My publisher',binding:null,edition_year:null,original_published_year:null,edition_key:null,description:null};
const candidate={isbn:'9780441172719',genres:['Science Fiction'],cover_url:'https://covers.openlibrary.org/b/id/1234-M.jpg',page_count:600,publisher:'Ace Books',binding:'mass_market',edition_year:2005,original_published_year:1965,description:'An original description',edition_key:'/books/OL42M',work_key:'/works/OL42W'};

test('ISBN-10/13 normalization and check digit validation',()=>{
 assert.equal(normalizeISBN(' 978-0-441-17271-9 '),'9780441172719');
 assert.equal(isValidISBN('978-0-441-17271-9'),true);
 assert.equal(isValidISBN('0-8044-2957-X'),true);
 assert.equal(isValidISBN('9780441172710'),false);
 assert.equal(isValidISBN('1234'),false);
 assert.equal(isValidISBN('B012345678'),false);
});
test('ASIN is preserved distinctly from ISBN and validated',()=>{
 assert.equal(normalizeASIN(' b0abc12345 '),'B0ABC12345');
 assert.equal(isValidASIN('B0ABC12345'),true);
 assert.equal(isValidASIN('B0-ABC12345'),false);
 assert.equal(isValidASIN('01234'),false);
});
test('cover URL must be an absolute HTTPS URL without embedded credentials',()=>{
 assert.equal(coverURL('https://example.com/a cover.jpg'),'https://example.com/a%20cover.jpg');
 assert.equal(coverURL('  '),null);
 assert.throws(()=>coverURL('javascript:alert(1)'),/HTTPS/);
 assert.throws(()=>coverURL('http://example.com/img.jpg'),/HTTPS/);
 assert.throws(()=>coverURL('https://a:b@example.com/img.jpg'),/password/);
});
test('manual genres retain user names and order without duplicated values',()=>{
 assert.deepEqual(manualGenres('Fantasy, Science Fiction, fantasy, Romance,  '),['Fantasy','Science Fiction','Romance']);
});
test('reviewed metadata fills blanks only, preserving user ISBN, genre, publisher and cover by default',()=>{
 const reviewed={metadata:candidate,matchLevel:'isbn'};
 const merged=mergeReviewedMetadata(example,reviewed);
 assert.equal(merged.isbn,example.isbn);
 assert.equal(merged.asin,example.asin);
 assert.deepEqual(merged.genres,example.genres);
 assert.equal(merged.publisher,example.publisher);
 assert.equal(merged.page_count,412);
 assert.equal(merged.cover_url,example.cover_url);
 assert.equal(merged.binding,'mass_market');
 assert.equal(merged.edition_year,2005);
 assert.equal(merged.edition_key,'/books/OL42M');
 assert.equal(mergeReviewedMetadata(example,reviewed,{useCover:true}).cover_url,candidate.cover_url);
});
test('work-level lookup never applies an unverified edition ISBN or page count',()=>{
 const book={...example,isbn:null,genres:[],page_count:null,publisher:null};
 const merged=mergeReviewedMetadata(book,{metadata:candidate,matchLevel:'work'},{useCover:true});
 assert.equal(merged.isbn,null);
 assert.equal(merged.edition_key,null);
 assert.equal(merged.page_count,null);
 assert.equal(merged.publisher,null);
 assert.deepEqual(merged.genres,['Science Fiction']);
 assert.equal(merged.cover_url,candidate.cover_url);
});
test('explicit ISBN lookup fetches exact Open Library edition and its linked work genres',async()=>{
 const old=globalThis.fetch;const urls=[];
 globalThis.fetch=async url=>{
   urls.push(String(url));
   if(String(url).includes('/isbn/'))return {ok:true,json:async()=>({key:'/books/OL42M',title:'Dune',publish_date:'2005',publishers:['Ace Books'],number_of_pages:412,works:[{key:'/works/OL42W'}],covers:[1234],isbn_13:['9780441172719']})};
   if(String(url).includes('/works/OL42W.json'))return {ok:true,json:async()=>({subjects:['Science Fiction','Desert ecology'],first_publish_date:'1965'})};
   throw Error('Unexpected '+url);
 };
 try{
  const found=await lookupBookOnRequest(example);
  assert.equal(found.matchLevel,'isbn');
  assert.equal(found.metadata.edition_key,'/books/OL42M');
  assert.deepEqual(found.metadata.genres,['Science Fiction']);
  assert.equal(found.metadata.original_published_year,1965);
  assert.ok(urls.some(u=>u.includes('/isbn/9780441172719.json')));
 }finally{globalThis.fetch=old;}
});
test('ISBN lookup does not accept an unrelated Google Books result',async()=>{
 const old=globalThis.fetch;
 globalThis.fetch=async url=>{
  if(String(url).includes('/isbn/'))return {ok:false,status:404};
  if(String(url).includes('googleapis.com'))return {ok:true,json:async()=>({items:[{id:'wrong',volumeInfo:{title:'Other',industryIdentifiers:[{type:'ISBN_13',identifier:'9780000000000'}]}}]})};
  throw Error('Unexpected '+url);
 };
 try{
  assert.equal(await lookupISBNMetadata('9780441172719'),null);
  await assert.rejects(lookupBookOnRequest(example),/No exact ISBN match/);
 }finally{globalThis.fetch=old;}
});
test('identifier-only ASIN cannot be passed to ISBN endpoint without validation',async()=>{
 const old=globalThis.fetch;const calls=[];
 globalThis.fetch=async url=>{calls.push(String(url));if(String(url).includes('/search.json'))return {ok:true,json:async()=>({docs:[]})};if(String(url).includes('googleapis.com'))return {ok:true,json:async()=>({items:[]})};throw Error('unexpected '+url);};
 try{
  await assert.rejects(lookupBookOnRequest({...example,isbn:null,asin:'B0XYZ12345',cover_url:null}),/No usable catalog match/);
  assert.ok(calls.every(url=>!url.includes('/isbn/')));
 }finally{globalThis.fetch=old;}
});
