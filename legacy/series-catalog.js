// Best-effort, source-attributed series lookups. Never infer that a highest
// observed installment number is the final book in an open-ended series.
import { seriesMetadata, parseSeriesFromTitle } from './series-insights.js';

export const seriesKey = value => String(value || '').normalize('NFKD').toLowerCase()
  .replace(/[\u0300-\u036f]/g, '').replace(/&/g,'and').replace(/[^a-z0-9]+/g,' ').trim();
const validNumber = value => value!==null && value!==undefined && value!=='' && Number.isInteger(Number(value)) && Number(value)>0 && Number(value)<=500;
const clean = value => String(value||'').trim();
export function isSeriesSourceURL(url) {
  try { const u=new URL(url);return u.protocol==='https:' && (u.hostname==='www.listofbooks.net'||u.hostname==='listofbooks.net') && u.pathname.startsWith('/series/'); }
  catch { return false; }
}
export function normalizeSeriesResult(raw) {
  if(!raw||typeof raw!=='object')return null;
  const title=clean(raw.title);if(!title || !isSeriesSourceURL(raw.url))return null;
  const books=(Array.isArray(raw.books)?raw.books:[]).slice(0,200).map(book=>({
    position:Number.isFinite(Number(book?.position))?Number(book.position):null,
    number:Number.isFinite(Number(book?.number))?Number(book.number):null,
    role:clean(book?.role||'core').toLowerCase(),
    title:clean(book?.title).slice(0,220),year:Number.isInteger(Number(book?.year))&&Number(book.year)>=1000&&Number(book.year)<=2100?Number(book.year):null
  })).filter(book=>book.title);
  const total=validNumber(raw.totalBooks)?Number(raw.totalBooks):null;
  return {title,author:clean(raw.author),url:isSeriesSourceURL(raw.url)?raw.url:'',order:raw.order==='reading'?'reading':'publication',
    totalBooks:total,books,booksOmitted:Math.max(0,Number(raw.booksOmitted)||0),
    position:Number.isFinite(Number(raw.position))?Number(raw.position):null,source:'List Of Books'};
}
export function catalogSeriesMatch(result, {seriesName='',author='',title=''}={}) {
  if(!result)return false;
  const wanted=seriesKey(seriesName);
  if(wanted && wanted!==seriesKey(result.title)) return false;
  const bookTitle=seriesKey(parseSeriesFromTitle(title)?.title||title);
  // Never trust a fuzzy series hit with a different name, and match author when present.
  const a=seriesKey(author),b=seriesKey(result.author);
  if(a && b && a!==b && !a.includes(b) && !b.includes(a))return false;
  if(!wanted && bookTitle && !result.books.some(item=>seriesKey(item.title)===bookTitle) && !Number.isFinite(result.position))return false;
  return true;
}
export function proposedSeriesFields(book, lookup) {
  const current=seriesMetadata(book);
  if(!catalogSeriesMatch(lookup,{seriesName:current.series_name,author:book.author,title:book.title}))return null;
  const ownTitle=seriesKey(parseSeriesFromTitle(book.title)?.title||book.title);
  const sourceBook=lookup.books.find(b=>seriesKey(b.title)===ownTitle);
  const number=current.series_number ?? (sourceBook?.number??sourceBook?.position??lookup.position??null);
  if(number!==null && (!Number.isFinite(number)||number<0||number>500))return null;
  return {series_name:current.series_name||lookup.title,series_number:number,
    series_total:(number!=null&&lookup.totalBooks!=null&&Number(number)>lookup.totalBooks)?null:lookup.totalBooks,
    series_total_source:lookup.totalBooks?'listofbooks':null,
    series_source_url:lookup.url||null};
}
export function fillMissingSeriesFields(book, lookup) {
  const proposed=proposedSeriesFields(book,lookup);
  if(!proposed)return null;
  const updated={...book};let changed=false;
  for(const key of ['series_name','series_number','series_total']) {
    if((updated[key]===null||updated[key]===undefined||updated[key]==='') && proposed[key]!==null && proposed[key]!==undefined){updated[key]=proposed[key];changed=true;}
  }
  // Keep provenance for any source-provided count, but do not overwrite a manually verified total.
  if(!book.series_total && updated.series_total===proposed.series_total && proposed.series_total && proposed.series_source_url){
    updated.series_total_source='listofbooks';updated.series_source_url=proposed.series_source_url;changed=true;
  }
  return changed?updated:null;
}
export async function fetchSeriesLookup({series='',title='',author='',fetcher=fetch}={}) {
  const mode=clean(series)?'series':'book';
  if(mode==='book'&&(!clean(title)||!clean(author)))return null;
  const qs=new URLSearchParams({mode});
  if(mode==='series')qs.set('series',clean(series)); else {qs.set('title',clean(title));qs.set('author',clean(author));}
  const res=await fetcher('/api/series-lookup?'+qs.toString(),{headers:{'Accept':'application/json'}});
  const data=await res.json().catch(()=>({}));
  if(!res.ok){const error=new Error(data.message||'Series lookup unavailable.');error.code=data.code||'unavailable';throw error;}
  return normalizeSeriesResult(data.result);
}
export async function isSeriesLookupConfigured(fetcher=fetch) {
  try { const response=await fetcher('/api/series-lookup?mode=status',{headers:{Accept:'application/json'}});const data=await response.json();return response.ok&&data.configured===true; }
  catch {return false;}
}
