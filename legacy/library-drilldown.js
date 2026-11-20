// Shared filtering for clickable Insights charts. Never accesses another reader's books:
// caller supplies only the already-authorized viewBooks() subset.
import {libraryStatistics,TBR_AGE_BINS} from './reading-habits.js';
import {seriesMetadata} from './series-insights.js';
export const bookGenres=book=>{
 const gs=[...new Set((Array.isArray(book.genres)?book.genres:[]).filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim()))];
 return gs.length?gs:['Uncategorized'];
};
export const hasFinished=book=>book.status==='finished'||(Array.isArray(book.read_history)&&book.read_history.some(x=>x.status==='finished'));
export function insightBooks(books,{kind,value,today}={}){
 const rows=Array.isArray(books)?books:[];
 const genre=b=>bookGenres(b).includes(value);
 if(kind==='genre-all')return rows.filter(genre);
 if(kind==='genre-read')return rows.filter(b=>genre(b)&&hasFinished(b));
 if(kind==='genre-unread')return rows.filter(b=>genre(b)&&!hasFinished(b));
 if(kind==='genre-rating')return rows.filter(b=>genre(b)&&b.rating!=null&&Number(b.rating)>=.25&&Number(b.rating)<=5);
 if(kind==='rating')return rows.filter(b=>b.rating!=null&&Number(b.rating)===Number(value));
 if(kind==='series')return rows.filter(b=>seriesMetadata(b).series_name?.toLowerCase()===String(value||'').toLowerCase());
 if(kind==='tbr-age'){
  const bucket=TBR_AGE_BINS.find(x=>x.id===value);if(!bucket)return [];
  const ids=new Set(libraryStatistics(rows,{today}).tbr.aged.filter(x=>x.ageDays>=bucket.min&&x.ageDays<=bucket.max).map(x=>String(x.bookId)));
  return rows.filter(b=>ids.has(String(b.id)));
 }
 return [];
}
