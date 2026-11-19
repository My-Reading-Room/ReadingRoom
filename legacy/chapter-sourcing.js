// Edition-specific chapter sourcing. These are *candidates*, never verified page maps.
// Page-based metrics remain unavailable until the reader checks all boundaries.
import { normalizeISBN, isValidISBN } from './book-detail-metadata.js';

export const MAX_CHAPTERS = 300;
export const MAX_CONTENTS_PHOTOS = 20;
const MAX_CONTENTS_IMAGE_BYTES = 12_000_000;
const MAX_CONTENTS_BATCH_BYTES = 80_000_000;

export function isbn13ForEdition(input) {
  const isbn = normalizeISBN(input);
  if (!isValidISBN(isbn)) return '';
  if (isbn.length === 13) return isbn;
  const first12 = `978${isbn.slice(0, 9)}`;
  const total = [...first12].reduce((sum, digit, i) => sum + Number(digit) * (i % 2 ? 3 : 1), 0);
  return first12 + ((10 - total % 10) % 10);
}
export function sameEditionISBN(a, b) {
  const left = isbn13ForEdition(a), right = isbn13ForEdition(b);
  return Boolean(left && left === right);
}

const cleanTitle = title => String(title || '').replace(/\s+/g, ' ').trim().slice(0, 180);
function validPage(page) {
  const value = String(page ?? '').trim().replace(/[,\s]/g, '');
  return /^\d{1,5}$/.test(value) && Number(value) > 0 && Number(value) <= 99999 ? Number(value) : null;
}

// A contents list gives *starts*. Except for the last chapter, the suggested
// end is the page before the next start; the user must verify every suggestion.
export function draftFromStarts(entries) {
  const filtered = [];
  const warnings = [];
  for (const entry of (entries || []).slice(0, 1000)) {
    const page = validPage(entry?.page ?? entry?.start_page);
    const label = cleanTitle(entry?.title ?? entry?.chapter_label ?? entry?.label);
    if (page === null || !label) { warnings.push('Skipped an item without a title or Arabic-numeral page number.'); continue; }
    if (filtered.length && page <= filtered.at(-1).start_page) {
      warnings.push(`Skipped ${label}: chapter starting pages must increase (duplicates and nested headings need manual review).`);
      continue;
    }
    if (filtered.length >= MAX_CHAPTERS) { warnings.push(`Only the first ${MAX_CHAPTERS} usable entries were included.`); break; }
    filtered.push({chapter_number:filtered.length + 1,chapter_label:label,start_page:page,end_page:''});
  }
  for (let i=0;i<filtered.length-1;i++) filtered[i].end_page = filtered[i+1].start_page - 1;
  return {rows:filtered,warnings:[...new Set(warnings)]};
}

export function draftFromOpenLibraryEdition(edition, requestedISBN) {
  if (!isbn13ForEdition(requestedISBN)) throw new Error('Save a valid ISBN for this print edition first.');
  if (!edition || typeof edition !== 'object') throw new Error('Open Library did not return an edition.');
  const identifiers=[...(edition.isbn_13||[]),...(edition.isbn_10||[])];
  if (identifiers.length && !identifiers.some(v=>sameEditionISBN(v,requestedISBN))) {
    throw new Error('Open Library returned a different edition ISBN. No mapping was imported.');
  }
  const entries = Array.isArray(edition.table_of_contents) ? edition.table_of_contents : [];
  const draft = draftFromStarts(entries.map(e=>({title:e?.title,page:e?.pagenum ?? e?.page ?? e?.page_number})));
  if (!draft.rows.length) throw new Error('This edition has no usable numbered table of contents in Open Library. Try a contents-page photo.');
  if (!identifiers.length) draft.warnings.push('Open Library did not list an ISBN in the returned record. Check the book title and edition carefully.');
  return {source:'Open Library',sourceTitle:cleanTitle(edition.title),sourcePages:Number(edition.number_of_pages)||null,
    sourceUrl:edition.key && /^\/books\/OL\d+M$/.test(edition.key)?`https://openlibrary.org${edition.key}`:'',
    ...draft};
}
export async function lookupOpenLibraryChapters(isbn, fetchImpl = fetch) {
  if (!isbn13ForEdition(isbn)) throw new Error('Save a valid ISBN for this edition before looking up chapters.');
  const response=await fetchImpl(`https://openlibrary.org/isbn/${encodeURIComponent(normalizeISBN(isbn))}.json`, {headers:{Accept:'application/json'}});
  if (!response.ok) throw new Error(response.status === 404 ? 'No Open Library edition record was found for this ISBN.' : `Open Library request failed (${response.status}).`);
  return draftFromOpenLibraryEdition(await response.json(), isbn);
}

// OCR can misread numbers/columns; every extracted entry remains editable.
export function draftFromContentsText(text) {
  const raw=String(text||'').slice(0,50000);
  const entries=[];
  let skipped=0;
  for (const original of raw.split(/\r?\n/)) {
    const line=original.trim().replace(/[\u2022\u00b7]/g,'.');
    if (!line || /^(?:contents|table of contents|page|pages|chapter\s+page)$/i.test(line)) continue;
    const match=line.match(/^(.{1,180}?)\s*(?:[.\-_\s]{2,}|\s+)(\d{1,5})\s*$/);
    if (!match) { skipped++; continue; }
    const label=cleanTitle(match[1].replace(/[.\-_\s]+$/g,''));
    if (!label || /^\d+$/.test(label)) { skipped++; continue; }
    entries.push({title:label,page:match[2]});
  }
  const draft=draftFromStarts(entries);
  if (skipped) draft.warnings.push(`${skipped} lines could not be interpreted as title + page; check the original contents page.`);
  if (!draft.rows.length) throw new Error('No chapter/page pairs recognized. Paste rows like "Chapter 1 ........ 12" or enter chapters manually.');
  return {source:'Scanned / pasted contents',sourceTitle:'',sourcePages:null,sourceUrl:'',...draft};
}

/** Parse multiple pages in the supplied visual order. Page boundaries are
 * derived only from recognized start pages; all candidates require review.
 */
export function draftFromContentsPages(texts) {
  const pages=Array.from(texts||[]).map(text=>String(text||''));
  if (!pages.length) throw new Error('Choose at least one contents photo.');
  const unreadable=pages.flatMap((text,i)=>/\S/.test(text)?[]:[i+1]);
  const draft=draftFromContentsText(pages.join('\n'));
  draft.source=pages.length===1?'Scanned contents photo':`Scanned contents (${pages.length} photos)`;
  if (unreadable.length) draft.warnings.push(`No recognizable text in photo ${unreadable.join(', ')}. Inspect and manually enter any missing chapters.`);
  return draft;
}

export function validateContentsPhotos(files) {
  const list=Array.from(files||[]);
  if(!list.length)throw new Error('Choose one or more photos of the book’s contents pages.');
  if(list.length>MAX_CONTENTS_PHOTOS)throw new Error(`Choose at most ${MAX_CONTENTS_PHOTOS} contents photos.`);
  let bytes=0;
  for(const [i,file] of list.entries()){
    if(!file||!String(file.type||'').startsWith('image/'))throw new Error(`Photo ${i+1} is not an image.`);
    if(!Number.isFinite(file.size)||file.size<=0||file.size>MAX_CONTENTS_IMAGE_BYTES)throw new Error(`Photo ${i+1} must be smaller than 12 MB.`);
    bytes+=file.size;
  }
  if(bytes>MAX_CONTENTS_BATCH_BYTES)throw new Error('Combined photos must be smaller than 80 MB. Scan the contents in smaller batches.');
  return list;
}

export function validateVerifiedChapterMap(draft, book) {
  if (!Array.isArray(draft) || !draft.length || draft.length>MAX_CHAPTERS)
    throw new Error(`Enter between 1 and ${MAX_CHAPTERS} chapters with exact page ranges.`);
  const lastPage=Number(book?.page_count);
  let previousEnd=0;
  return draft.map((row,i)=>{
    const number=i+1;
    const label=cleanTitle(row.chapter_label)||`Chapter ${number}`;
    const start=validPage(row.start_page), end=validPage(row.end_page);
    if (start===null || end===null || end<start) throw new Error(`Chapter ${number}: confirm both the starting and ending pages.`);
    if (start<=previousEnd) throw new Error(`Chapter ${number}: page ranges overlap or are out of order.`);
    if (lastPage>0 && end>lastPage) throw new Error(`Chapter ${number} ends after the saved ${lastPage}-page edition. Check Book details.`);
    previousEnd=end;
    return {chapter_number:number,chapter_label:label,start_page:start,end_page:end};
  });
}

export function reviewedSharedCandidate(candidate, isbn) {
  if (!candidate || !Array.isArray(candidate.chapters)) throw new Error('Invalid community chapter mapping.');
  if (!sameEditionISBN(candidate.isbn13, isbn)) throw new Error('This shared mapping belongs to another ISBN.');
  return candidate.chapters.map((row,i)=>({chapter_number:i+1,chapter_label:cleanTitle(row.chapter_label),start_page:row.start_page,end_page:row.end_page}));
}

// Client-side OCR: image bytes never leave the device. A worker and English
// language data are downloaded from Tesseract's CDN on the first scan only.
let tesseractLoader=null;
async function browserTesseract() {
  if (typeof window === 'undefined' || typeof document === 'undefined') throw new Error('Photo scanning is supported in a browser only.');
  if (window.Tesseract?.createWorker) return window.Tesseract;
  if (!tesseractLoader) tesseractLoader = new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
    script.async=true;
    script.onload=()=>window.Tesseract?.createWorker?resolve(window.Tesseract):reject(new Error('The OCR library could not start.'));
    script.onerror=()=>reject(new Error('The OCR library could not be downloaded. Paste the contents text instead.'));
    document.head.appendChild(script);
  }).catch(err=>{tesseractLoader=null;throw err;});
  return tesseractLoader;
}
/** Sequential OCR on one worker. Each ordered photo contributes chapter starts.
 * Images stay in the browser and are never sent to Supabase.
 * createWorkerOverride is solely an injection point for automated tests.
 */
export async function scanContentsPhotos(files,{onProgress=()=>{},createWorkerOverride=null}={}){
  const list=validateContentsPhotos(files);
  const Tesseract=createWorkerOverride?null:await browserTesseract();
  const worker=await (createWorkerOverride||(()=>Tesseract.createWorker('eng')))();
  try{
    const text=[];
    for(const [i,file] of list.entries()){
      onProgress(i+1,list.length);
      try{
        const result=await worker.recognize(file);
        text.push(result?.data?.text||'');
      }catch(error){
        throw new Error(`Could not scan photo ${i+1} of ${list.length}: ${error?.message||'image unreadable'}`);
      }
    }
    return draftFromContentsPages(text);
  } finally {await worker.terminate();}
}
export async function scanContentsPhoto(file){return scanContentsPhotos([file]);}
