// TBR transition times use dated milestones only. Goodreads Date Added and local
// creation date are explicitly treated as proxies for actual TBR-shelf entry.
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
const day=d=>Math.floor(Date.parse(d+'T12:00:00Z')/86400000);
const average=arr=>arr.length?arr.reduce((n,x)=>n+x,0)/arr.length:null;
const median=arr=>{if(!arr.length)return null;const s=[...arr].sort((a,b)=>a-b);return (s[Math.floor((s.length-1)/2)]+s[Math.floor(s.length/2)])/2;};
export function tbrStart(book){
 if(validDate(book.tbr_added_on))return {date:book.tbr_added_on,source:'tbr_added_on',approximate:false};
 if(validDate(book.goodreads_added_on))return {date:book.goodreads_added_on,source:'goodreads_added_on',approximate:true};
 const created=String(book.created_at||'').slice(0,10);
 if(validDate(created))return {date:created,source:'created_at',approximate:true};
 return null;
}
export function tbrTransitions(books=[]){
 const rows=[];
 for(const book of books){
   const base=tbrStart(book);if(!base)continue;
   const history=Array.isArray(book.read_history)?book.read_history:[];
   const starts=[book.started_on,...history.map(p=>p.started_on)].filter(validDate).sort();
   const finishes=[book.finished_on,...history.filter(p=>p.status==='finished').map(p=>p.finished_on)].filter(validDate).sort();
   const started=starts.find(d=>d>=base.date)||null;
   const finished=finishes.find(d=>d>=base.date)||null;
   if(!started&&!finished)continue;
   const genres=[...new Set((Array.isArray(book.genres)?book.genres:[]).filter(g=>typeof g==='string'&&g.trim()).map(g=>g.trim()))];
   rows.push({bookId:book.id,title:book.title,genres:genres.length?genres:['Uncategorized'],...base,
     started,finished,toStart:started?day(started)-day(base.date):null,toFinish:finished?day(finished)-day(base.date):null});
 }
 const summarize=entries=>{
   const read=entries.map(x=>x.toStart).filter(x=>x!==null),finished=entries.map(x=>x.toFinish).filter(x=>x!==null);
   return {toStartCount:read.length,toFinishCount:finished.length,meanToStart:average(read),medianToStart:median(read),
     meanToFinish:average(finished),medianToFinish:median(finished),approximateCount:entries.filter(x=>x.approximate).length};
 };
 const grouped=new Map();for(const row of rows)for(const genre of row.genres){
   if(!grouped.has(genre))grouped.set(genre,[]);grouped.get(genre).push(row);
 }
 return {rows,overall:summarize(rows),byGenre:[...grouped].map(([genre,entries])=>({genre,...summarize(entries)}))
   .sort((a,b)=>b.toStartCount+b.toFinishCount-a.toStartCount-a.toFinishCount||a.genre.localeCompare(b.genre)),
  note:'Goodreads added date and local creation date may be later than actual TBR entry; undated and negative intervals are excluded.'};
}
