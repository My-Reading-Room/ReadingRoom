/** A read-only social timeline computed from already-authorized Full-share data.
 * No event is invented from a bare year or from the current book rating alone.
 * A rating printed beside a finish is explicitly the CURRENT book rating, not
 * a claim about when the reader rated it. Never include notes or private logs.
 */
import {readingPasses} from './reading-history.js';
import {isTrackingDate} from './tracking-start.js';

export function friendActivityFeed({viewerId, shares=[], profiles=[], books=[], sessions=[], today='9999-12-31', limit=30, type='all'}={}) {
  const friendIds=new Set(shares.filter(sh=>sh.viewer_id===viewerId&&sh.access_level==='full'&&sh.owner_id!==viewerId).map(sh=>sh.owner_id));
  const allowed=new Set([viewerId,...friendIds].filter(Boolean));
  const profileNames=new Map(profiles.filter(p=>allowed.has(p.id)).map(p=>[p.id,p.display_name||'Reader']));
  const visibleBooks=new Map(books.filter(b=>allowed.has(b.user_id)).map(b=>[b.id,b]));
  const events=[];
  const add=(book,date,kind,extras={})=>{
    if(!isTrackingDate(date)||date>today)return;
    events.push({id:`${kind}:${book.id}:${date}:${extras.readNumber||1}:${extras.sessionId||''}`,kind,date,
      ownerId:book.user_id,isOwn:book.user_id===viewerId,readerName:profileNames.get(book.user_id)||'Reader',bookId:book.id,
      title:book.title||'Untitled book',author:book.author||'',coverUrl:book.cover_url||'',
      bookColor:book.demo_color||'',...extras});
  };
  for(const book of visibleBooks.values()) {
    for(const pass of readingPasses(book)) {
      if(pass.started_on)add(book,pass.started_on,'started',{readNumber:pass.number});
      // Year-only dates have no known day; don't pretend that they do.
      if(pass.status==='finished'&&pass.finished_on)add(book,pass.finished_on,'finished',{
        readNumber:pass.number,rating:book.rating==null?null:Number(book.rating)
      });
    }
  }
  for(const session of sessions){
    const book=visibleBooks.get(session.user_book_id);
    if(!book||book.user_id!==session.user_id)continue;
    const minutes=Number(session.duration_minutes);
    if(!Number.isFinite(minutes)||minutes<=0)continue;
    // A recorded session start is real local time; created_at is an upload
    // timestamp and must NOT be passed off as the time reading happened.
    const raw=typeof session.start_local_time==='string'?session.start_local_time:'';
    const match=raw.match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d+)?)?$/);
    const localTime=match?`${match[1]}:${match[2]}`:null;
    add(book,session.session_date,'session',{minutes,mode:session.activity_mode||'reading',
      localTime,readNumber:Number(session.read_number)||1,sessionId:session.id||''});
  }
  const priority={finished:3,session:2,started:1};
  events.sort((a,b)=>b.date.localeCompare(a.date)
    ||Boolean(b.localTime)-Boolean(a.localTime)
    ||(b.localTime||'').localeCompare(a.localTime||'')
    ||priority[b.kind]-priority[a.kind]
    ||a.readerName.localeCompare(b.readerName)||a.id.localeCompare(b.id));
  const filtered=['started','session','finished'].includes(type)?events.filter(e=>e.kind===type):events;
  const cap=Math.max(1,Math.min(500,Math.floor(Number(limit)||30)));
  return {events:filtered.slice(0,cap),total:filtered.length,fullShareCount:friendIds.size,hasMore:filtered.length>cap};
}
