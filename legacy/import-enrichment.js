// Goodreads post-import metadata completion. The CSV is saved first; lookups
// then fill only missing provider-supplied metadata and can be safely retried.
import { enrichBookMetadata, genresForISBNBatch, googleGenresByISBN, setBulkCatalogPacing } from './catalog.js';
import { goodreadsISBN } from './goodreads-import.js';
import { seriesMetadata } from './series-insights.js';
import { seriesKey, fetchSeriesLookup, isSeriesLookupConfigured, fillMissingSeriesFields } from './series-catalog.js';

export const ENRICH_FIELDS = ['isbn','cover_url','work_key','edition_key','description','publisher','binding','page_count','published_year','edition_year','original_published_year','genres'];
export function applyTrustedMetadata(before, after) {
  const result={...before};
  for(const field of ENRICH_FIELDS) {
    const current=before[field],candidate=after[field];
    const empty=current==null || current==='' || (Array.isArray(current)&&!current.length);
    const provided=candidate!=null && candidate!=='' && (!Array.isArray(candidate)||candidate.length);
    if(empty && provided) result[field]=candidate;
  }
  return result;
}
export const metadataChanged = (before, after) => ENRICH_FIELDS.some(k => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null));

export function needsImportEnrichment(book) {
  if (goodreadsISBN(book.isbn)) return !(Array.isArray(book.genres) && book.genres.length);
  // A work-level cover may be available even if the specific edition is unresolved.
  return !book.cover_url || !book.genres?.length || !book.edition_key || !book.edition_year || !book.original_published_year;
}

export async function enrichAfterGoodreadsImport(books, {
  googleKey = '', save,
  onProgress = () => {}, shouldStop = () => false,
  isbnBatchLookup = genresForISBNBatch,
  googleGenreLookup = googleGenresByISBN,
  fullBookLookup = enrichBookMetadata,
  pacingMs = 1100, seriesLookup = fetchSeriesLookup, seriesConfigured = isSeriesLookupConfigured, maxSeriesLookups = 8, seriesPacingMs = 6500
} = {}) {
  if (typeof save !== 'function') throw new Error('A save callback is required.');
  const targeted = books.filter(needsImportEnrichment);
  const result = {total:targeted.length,processed:0,saved:0,genreFilled:0,editionMatched:0,unresolved:0,errors:0,stopped:false,phase:'Starting',seriesChecked:0,seriesFilled:0,seriesDeferred:0};
  const send = () => onProgress({...result});
  send();
  const isbnBooks = targeted.filter(b => goodreadsISBN(b.isbn));
  const otherBooks = targeted.filter(b => !goodreadsISBN(b.isbn));
  setBulkCatalogPacing(pacingMs);
  try {
    for(let i=0;i<isbnBooks.length && !shouldStop();i+=20) {
      const group=isbnBooks.slice(i,i+20);
      result.phase='Genres for ISBN books';send();
      let found=new Map();
      try { found=await isbnBatchLookup(group.map(b=>goodreadsISBN(b.isbn))); }
      catch (_) { result.errors++; }
      for (const book of group) {
        if (shouldStop()) break;
        try {
          const isbn = goodreadsISBN(book.isbn);
          let genres = found.get(isbn) || [];
          // Google Books is a fallback for ISBNs the batch source cannot classify;
          // never adopt a publisher, cover, ISBN, page count or edition from it.
          if (!genres.length) {
            try { genres=await googleGenreLookup(isbn,googleKey); }
            catch (_) { /* Missing Google metadata is not a reason to alter an edition. */ }
          }
          if (genres.length) {
            const updated = {...book,genres};
            await save(updated);
            Object.assign(book, updated);
            result.saved++;result.genreFilled++;
          } else result.unresolved++;
        } catch (_) {result.errors++;}
        result.processed++;send();
      }
    }
    for(const book of otherBooks) {
      if(shouldStop()) break;
      result.phase='Matching books without ISBNs';send();
      try {
        const lookup=await fullBookLookup(book,googleKey,{preserveCover:true,forceGenres:false,matchEdition:true});
        const updated=applyTrustedMetadata(book,lookup);
        if(metadataChanged(book,updated)) {
          await save(updated);
          if(!book.genres?.length && updated.genres?.length) result.genreFilled++;
          if(!book.edition_key && updated.edition_key) result.editionMatched++;
          Object.assign(book,updated);
          result.saved++;
        }
        if(!updated.edition_key || !updated.genres?.length || !updated.cover_url) result.unresolved++;
      } catch (_) {result.errors++;}
      result.processed++;send();
    }
    // One lookup per distinct recognized series (not per book). Respect the
    // provider's free-plan limits and never bulk harvest its catalog.
    const groups=new Map();
    for(const book of books) {
      const info=seriesMetadata(book);
      if(!info.series_name || book.series_total != null)continue;
      const key=seriesKey(info.series_name);
      if(key && !groups.has(key))groups.set(key,[]);
      if(key)groups.get(key).push(book);
    }
    if(groups.size && !shouldStop()) {
      const configured=await seriesConfigured().catch(()=>false);
      if(configured){
        const batch=[...groups.values()].slice(0,Math.max(0,Math.min(8,maxSeriesLookups)));
        result.seriesDeferred=Math.max(0,groups.size-batch.length);
        for(let groupIndex=0;groupIndex<batch.length;groupIndex++) {
          const group=batch[groupIndex];
          if(shouldStop())break;
          if(groupIndex>0&&seriesPacingMs>0)await new Promise(resolve=>setTimeout(resolve,seriesPacingMs));
          result.phase='Checking series reading orders';send();
          try {
            const details=await seriesLookup({series:seriesMetadata(group[0]).series_name});
            result.seriesChecked++;
            for(const book of group){
              const updated=fillMissingSeriesFields(book,details);
              if(!updated)continue;
              await save(updated);Object.assign(book,updated);
              result.saved++;result.seriesFilled++;
            }
          }catch(_){result.errors++;}
          send();
        }
      }else result.seriesDeferred=groups.size;
    }
    result.stopped=Boolean(shouldStop());
    result.phase=result.stopped?'Paused':'Complete';send();
    return result;
  } finally {
    setBulkCatalogPacing(0);
  }
}
