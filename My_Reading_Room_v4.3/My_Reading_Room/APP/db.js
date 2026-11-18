// Storage layer: local interactive demo, or Supabase with real accounts and RLS.
import { profileTrackingStart } from './tracking-start.js';
import { completedBooksInYear } from './reading-history.js';
import { isbn13ForEdition, validateVerifiedChapterMap } from './chapter-sourcing.js';
export const localDate = (date = new Date()) => {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0,10);
};
export const offsetDate = (n) => {
  const d = new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate() - n); return localDate(d);
};
const clone = value => JSON.parse(JSON.stringify(value));
const demoKey = 'my-reading-room-demo-v2';

const sampleBooks = [
  ['Dune','Frank Herbert',604,'reading',true,4.5,'#b6723f','Science fiction','9780441172719'],
  ['Project Hail Mary','Andy Weir',496,'reading',false,null,'#335d7a','Science fiction','9780593135204'],
  ['Lonesome Dove','Larry McMurtry',864,'tbr',true,null,'#456356','Western','9780671683900'],
  ['Jurassic Park','Michael Crichton',448,'finished',true,4.25,'#9b4d41','Thriller','9780345538987'],
  ['A Game of Thrones','George R. R. Martin',694,'finished',true,4.75,'#464a55','Fantasy','9780553593716'],
  ['Dungeon Crawler Carl','Matt Dinniman',446,'tbr',false,null,'#633f6e','Fantasy',null],
  ['The Hobbit','J. R. R. Tolkien',310,'finished',true,4.5,'#3c7254','Fantasy','9780547928227'],
  ["Can't Hurt Me",'David Goggins',364,'finished',false,4,'#586062','Memoir','9781544512280']
];
function makeDemoBook(row, index, userId) {
  const [title,author,page_count,status,favorite,rating,demo_color,genre,isbn]=row;
  const d = new Date(); const currentYear=d.getFullYear();
  return {
    id: `${userId}-b${index}`, user_id:userId,title,author,page_count,status,favorite,rating,
    demo_color,genres:[genre],isbn,cover_url:null,
    work_key:null,edition_key:`demo:${userId}:${index}`,description:null,published_year:null,
    publisher:null,height_mm:null,thickness_mm:null,series_name:null,series_number:null,series_total:null,series_total_source:null,series_source_url:null,
    current_page:status==='reading' ? 120+index*17 : status==='finished'?page_count:0,
    shelf_order:index,started_on:status==='reading'?offsetDate(35):null,
    finished_on:status==='finished'?`${currentYear}-${String([2,5,8,10][index%4]).padStart(2,'0')}-${String(6+(index%16)).padStart(2,'0')}`:null,
    notes:'',tbr_added_on:status==='tbr'?offsetDate(180+index*23):null,created_at:new Date().toISOString()
  };
}
function seedDemo(){
  const yearStart=`${new Date().getFullYear()}-01-01`;
  const users=[{id:'demo-a',display_name:'Your profile',tracking_start_date:yearStart},{id:'demo-b',display_name:'Reading partner',tracking_start_date:yearStart},{id:'demo-c',display_name:'Book-club friend',tracking_start_date:yearStart}];
  const own=sampleBooks.map((r,i)=>makeDemoBook(r,i,'demo-a'));
  const partnerRows=[sampleBooks[4],sampleBooks[1],sampleBooks[6],sampleBooks[2],sampleBooks[0],sampleBooks[3]];
  const other=partnerRows.map((r,i)=>makeDemoBook(r,i,'demo-b'));
  const friend=sampleBooks.slice(1,6).map((r,i)=>makeDemoBook(r,i,'demo-c'));
  const today=new Date();const sessions=[];
  for (let i=330;i>=0;i--) {
    const daysPast = i; const date=offsetDate(daysPast);
    if(i<9 || (i*11+Math.floor(i/5))%17<12){
      ['demo-a','demo-b','demo-c'].forEach((userId,k)=>{
        const bookSet=k===0?own:k===1?other:friend;
        const candidate=bookSet[(i*3+Math.floor(i/12)+k)%bookSet.length];
        sessions.push({id:`s-${userId}-${i}-1`,user_id:userId,user_book_id:candidate.id,
          session_date:date,duration_minutes:22+(i*13+k*19)%76,
          pages_read:10+(i*7+k*3)%49,log_type:'pages',chapter_from:null,chapter_to:null,notes:''});
        if(i%6===0){const another=bookSet[(i*3+Math.floor(i/12)+k+2)%bookSet.length];
          sessions.push({id:`s-${userId}-${i}-2`,user_id:userId,user_book_id:another.id,
            session_date:date,duration_minutes:15+(i*7)%33,pages_read:9+(i*9)%31,log_type:'pages',chapter_from:null,chapter_to:null,notes:''});}
      });
    }
  }
  // Demonstrate one true reread: historical first completion stays intact,
  // and the second pass has its own start date and progress.
  const sampleReread=own[6]; // The Hobbit
  const firstFinish=sampleReread.finished_on;
  const rereadStart=offsetDate(12);
  sampleReread.read_history=[
    {number:1,status:'finished',started_on:offsetDate(155),finished_on:firstFinish},
    {number:2,status:'reading',started_on:rereadStart,finished_on:null}
  ];
  sampleReread.status='reading';sampleReread.started_on=rereadStart;
  sampleReread.finished_on=null;sampleReread.current_page=84;
  // Showcase all modes in the preview without inventing audiobook page totals.
  for(const row of sessions){
    row.read_number=row.user_book_id===sampleReread.id&&row.session_date>=rereadStart?2:1;
    const ordinalForTime=Number((row.id.match(/-(\d+)-(?:1|2)$/)||[])[1]||0);
    // Demo-only timestamps provide sample habit charts; unrecorded legacy times remain unknown.
    row.start_local_time=ordinalForTime%9===0?null:`${String([7,12,16,21,10,19][ordinalForTime%6]).padStart(2,'0')}:${String((ordinalForTime*7)%60).padStart(2,'0')}`;
    const suffix=Number((row.id.match(/-(\d+)-1$/)||[])[1]);
    const ordinal=Number.isFinite(suffix)?suffix:0;
    if(ordinal%7===0){
      row.activity_mode='audiobook';
      if(ordinal%2===0){
        row.log_type='audio_position';
        row.audio_start_minute=(ordinal%200);row.audio_end_minute=row.audio_start_minute+row.duration_minutes;
        row.pages_read=null;
      }else{
        // Directly entered print-edition page-equivalent progress, not physically read pages.
        row.log_type='pages';row.audio_start_minute=null;row.audio_end_minute=null;
      }
    }else if(ordinal%5===0){row.activity_mode='read_listen';}
    else row.activity_mode='reading';
  }
  return {
    profiles:users, shares:[
      {owner_id:'demo-a',viewer_id:'demo-b',access_level:'full'},
      {owner_id:'demo-b',viewer_id:'demo-a',access_level:'full'},
      {owner_id:'demo-c',viewer_id:'demo-a',access_level:'summary'},
      {owner_id:'demo-a',viewer_id:'demo-c',access_level:'summary'}
    ], circles:[{id:'demo-circle',invite_code:'DEMO-SHARED',created_by:'demo-a'}],
    members:users.filter(u=>u.id!=='demo-c').map(u=>({circle_id:'demo-circle',user_id:u.id})),
    books:[...own,...other,...friend], sessions, sharedChapterMaps:[],
    chapters:[
      {id:'demo-ch1',user_id:'demo-a',user_book_id:'demo-a-b0',chapter_number:1,chapter_label:'Chapter 1',start_page:1,end_page:18},
      {id:'demo-ch2',user_id:'demo-a',user_book_id:'demo-a-b0',chapter_number:2,chapter_label:'Chapter 2',start_page:19,end_page:43},
      {id:'demo-ch3',user_id:'demo-a',user_book_id:'demo-a-b0',chapter_number:3,chapter_label:'Chapter 3',start_page:44,end_page:67}
    ],
    goals:users.map(u=>({user_id:u.id,year:today.getFullYear(),books_target:u.id==='demo-a'?12:20,daily_minutes_target:u.id==='demo-a'?30:45})),
    goalHistory:users.map(u=>({user_id:u.id,effective_date:`${today.getFullYear()}-01-01`,target_minutes:u.id==='demo-a'?30:45})),
    shelves:users.map(u=>({user_id:u.id,finish:u.id==='demo-a'?'walnut':'oak',display_mode:'mix',decor:'cozy'}))
  };
}
function summariesFor(data,year=new Date().getFullYear()){
  return data.profiles.map(p=>{
    const books=data.books.filter(b=>b.user_id===p.id);
    const trackedFrom=profileTrackingStart(p);
    const yearly=data.sessions.filter(s=>s.user_id===p.id&&s.session_date.startsWith(String(year))&&(!trackedFrom||s.session_date>=trackedFrom));
    const rated=books.filter(b=>b.rating!=null);
    const minutes=mode=>yearly.filter(s=>(s.activity_mode||'reading')===mode).reduce((a,s)=>a+s.duration_minutes,0);
    return {owner_id:p.id,display_name:p.display_name,year,
      books_finished:completedBooksInYear(books,year).length,
      annual_goal:data.goals.find(g=>g.user_id===p.id&&g.year===year)?.books_target||12,
      favorites_count:books.filter(b=>b.favorite).length,
      average_rating:rated.length?Number((rated.reduce((a,b)=>a+Number(b.rating),0)/rated.length).toFixed(2)):null,
      reading_minutes:minutes('reading'),audiobook_minutes:minutes('audiobook'),combined_minutes:minutes('read_listen'),
      total_minutes:yearly.reduce((a,s)=>a+s.duration_minutes,0),sessions_count:yearly.length};
  });
}
export class DemoRepo {
  constructor(){this.mode='demo';this.currentUserId='demo-a';this.data=null;}
  async init(){
    try {this.data=JSON.parse(localStorage.getItem(demoKey)) || seedDemo();}
    catch(_){this.data=seedDemo();}
    // Upgrade stored demo profiles without losing previously logged sessions.
    let migratedProfiles=false;
    for(const profile of (this.data.profiles||[])){
      if(!profile.tracking_start_date){
        profile.tracking_start_date=profileTrackingStart(profile)||`${new Date().getFullYear()}-01-01`;
        migratedProfiles=true;
      }
    }
    if(migratedProfiles)this.persist();
    if(!Array.isArray(this.data.goalHistory)){
      this.data.goalHistory=(this.data.goals||[]).map(g=>({user_id:g.user_id,effective_date:`${g.year}-01-01`,target_minutes:g.daily_minutes_target||30}));
      this.persist();
    }
    return {id:this.currentUserId,email:'demo@example.com'};
  }
  async load(){return clone({...this.data,summaries:summariesFor(this.data)});}
  async save(table,row){
    const arr=this.data[table],idKey=['goals','shelves','goalHistory'].includes(table)?'user_id':'id';
    const idx=arr.findIndex(x=>x[idKey]===row[idKey] && (table!=='goals'||x.year===row.year) && (table!=='goalHistory'||x.effective_date===row.effective_date));
    const updated={...(idx>=0?arr[idx]:{}),...clone(row)};
    if(idx>=0)arr[idx]=updated;else arr.push(updated);
    this.persist();return clone(updated);
  }
  async saveMany(table,rows){for(const row of rows)await this.save(table,row);return rows;}
  async remove(table,id){this.data[table]=this.data[table].filter(row=>row.id!==id);if(table==='books'){
    this.data.sessions=this.data.sessions.filter(s=>s.user_book_id!==id);
    this.data.chapters=this.data.chapters.filter(s=>s.user_book_id!==id);
  }this.persist();}
  persist(){localStorage.setItem(demoKey,JSON.stringify(this.data));}
  reset(){this.data=seedDemo();this.persist();}
  async createCircle(){return 'demo-circle';}
  async joinCircle(){return 'demo-circle';}
  async createShareInvite(level){if(!['full','summary'].includes(level))throw new Error('Invalid access level');return 'DEMO-'+level.toUpperCase();}
  async redeemShareInvite(code){if(!code)throw new Error('Enter an invitation code');return 'demo-a';}
  async setShareLevel(viewer,level){
    const sh=this.data.shares.find(v=>v.owner_id===this.currentUserId&&v.viewer_id===viewer);
    if(!sh)throw new Error('Share does not exist');
    if(level==='none')this.data.shares=this.data.shares.filter(v=>v!==sh);
    else if(['full','summary'].includes(level))sh.access_level=level;
    else throw new Error('Invalid level');
    this.persist();
  }
  async replaceChapterMap(bookId,chapters){
    const book=this.data.books.find(b=>b.id===bookId && b.user_id===this.currentUserId);
    if(!book)throw new Error('Only the book owner can replace chapters.');
    const validated=validateVerifiedChapterMap(chapters,book);
    this.data.chapters=this.data.chapters.filter(c=>c.user_book_id!==bookId);
    this.data.chapters.push(...validated.map(c=>({...c,id:crypto.randomUUID(),user_book_id:bookId,user_id:this.currentUserId})));
    this.persist();return validated.length;
  }
  async listSharedChapterMaps(isbn){
    const key=isbn13ForEdition(isbn);
    return clone((this.data.sharedChapterMaps||[]).filter(m=>m.isbn13===key).map(({id,isbn13,page_count,chapters,updated_at})=>({id,isbn13,page_count,chapters,updated_at})));
  }
  async withdrawChapterMap(bookId){
    const book=this.data.books.find(b=>b.id===bookId && b.user_id===this.currentUserId);
    const key=isbn13ForEdition(book?.isbn);
    if(!book||!key)throw new Error('Only the book owner can withdraw their shared chapter map.');
    const before=(this.data.sharedChapterMaps||[]).length;
    this.data.sharedChapterMaps=(this.data.sharedChapterMaps||[]).filter(m=>!(m.contributor_id===this.currentUserId&&m.isbn13===key));
    this.persist();return before-this.data.sharedChapterMaps.length;
  }
  async publishChapterMap(bookId){
    const book=this.data.books.find(b=>b.id===bookId && b.user_id===this.currentUserId);
    const key=isbn13ForEdition(book?.isbn);
    if(!book||!key)throw new Error('Only the owner of a book with a valid ISBN can publish chapters.');
    const rows=this.data.chapters.filter(c=>c.user_book_id===bookId).sort((a,b)=>a.chapter_number-b.chapter_number);
    const checked=validateVerifiedChapterMap(rows,book);
    if(checked.some((c,i)=>rows[i].chapter_number!==c.chapter_number))throw new Error('Fix chapter numbering before sharing.');
    const all=this.data.sharedChapterMaps ||= [];
    const old=all.find(m=>m.contributor_id===this.currentUserId&&m.isbn13===key);
    const published={id:old?.id||crypto.randomUUID(),contributor_id:this.currentUserId,isbn13:key,page_count:book.page_count,chapters:checked,updated_at:new Date().toISOString()};
    if(old)Object.assign(old,published);else all.push(published);
    this.persist();return published.id;
  }
}

export class CloudRepo {
  constructor(url,key){this.url=url;this.key=key;this.mode='cloud';this.client=null;}
  async init(){
    // This CDN import is only needed for the hosted cloud app, not the local demo.
    const module = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    this.client=module.createClient(this.url,this.key,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true}});
    const {data,error}=await this.client.auth.getSession(); if(error)throw error;
    return data.session?.user || null;
  }
  async signUp(email,password,name){
    const {data,error}=await this.client.auth.signUp({email,password,options:{data:{display_name:name},emailRedirectTo:location.origin}});
    if(error)throw error;return data;
  }
  async signIn(email,password){
    const {data,error}=await this.client.auth.signInWithPassword({email,password});
    if(error)throw error;return data.user;
  }
  async signOut(){const {error}=await this.client.auth.signOut();if(error)throw error;}
  async currentUser(){const {data,error}=await this.client.auth.getUser();if(error)throw error;return data.user;}
  async load(){
    const queries={
      profiles:this.client.from('profiles').select('*'),
      circles:this.client.from('reading_circles').select('*'),
      members:this.client.from('circle_members').select('*'),
      books:this.client.from('user_books').select('*').order('shelf_order',{ascending:true}),
      sessions:this.client.from('reading_sessions').select('*').order('session_date',{ascending:false}),
      chapters:this.client.from('chapter_boundaries').select('*').order('chapter_number',{ascending:true}),
      goals:this.client.from('reading_goals').select('*'),
      goalHistory:this.client.from('reading_goal_history').select('*').order('effective_date',{ascending:true}),
      shelves:this.client.from('shelf_settings').select('*'),
      shares:this.client.from('profile_shares').select('*'),
      summaries:this.client.rpc('get_viewable_profile_summaries',{p_year:new Date().getFullYear()})
    };
    const pairs=await Promise.all(Object.entries(queries).map(async([k,p])=>[k,await p]));
    const result={};
    for(const [k,r] of pairs){if(r.error)throw new Error(`${k}: ${r.error.message}`);result[k]=r.data||[];}
    return result;
  }
  async save(table,row){
    const sqlTable={books:'user_books',sessions:'reading_sessions',chapters:'chapter_boundaries',goals:'reading_goals',goalHistory:'reading_goal_history',shelves:'shelf_settings',profiles:'profiles'}[table];
    if(!sqlTable)throw new Error('Invalid table');
    if(table==='profiles'){
      const changes={};
      if(Object.hasOwn(row,'display_name'))changes.display_name=row.display_name;
      if(Object.hasOwn(row,'tracking_start_date'))changes.tracking_start_date=row.tracking_start_date;
      if(Object.hasOwn(row,'tracking_start_goal_minutes'))changes.tracking_start_goal_minutes=row.tracking_start_goal_minutes;
      if(!Object.keys(changes).length)throw new Error('No profile fields to update');
      const {data,error}=await this.client.from('profiles').update(changes).eq('id',row.id).select().single();
      if(error)throw error;return data;
    }
    const conflict=table==='goals'?'user_id,year':table==='goalHistory'?'user_id,effective_date':table==='shelves'?'user_id':undefined;
    const {data,error}=await this.client.from(sqlTable).upsert(row, conflict?{onConflict:conflict}:{}).select().single();
    if(error)throw error;return data;
  }
  async saveMany(table,rows){
    if(table!=='books')throw new Error('Batch insert only supported for books');
    const result=[];
    for(let i=0;i<rows.length;i+=75){
      const {data,error}=await this.client.from('user_books').insert(rows.slice(i,i+75)).select();
      if(error)throw error;result.push(...data);
    }
    return result;
  }
  async remove(table,id){
    const sqlTable={books:'user_books',sessions:'reading_sessions',chapters:'chapter_boundaries'}[table];
    if(!sqlTable)throw new Error('Invalid deletion');
    const {error}=await this.client.from(sqlTable).delete().eq('id',id);
    if(error)throw error;
  }
  async createCircle(){const {data,error}=await this.client.rpc('create_reading_circle');if(error)throw error;return data;}
  async joinCircle(code){const {data,error}=await this.client.rpc('join_reading_circle',{p_invite_code:code});if(error)throw error;return data;}
  async createShareInvite(level){
    const {data,error}=await this.client.rpc('create_profile_share_invite',{p_level:level});
    if(error)throw error;return data;
  }
  async redeemShareInvite(code){
    const {data,error}=await this.client.rpc('redeem_profile_share_invite',{p_code:code});
    if(error)throw error;return data;
  }
  async setShareLevel(viewer,level){
    const {error}=await this.client.rpc('set_profile_share_level',{p_viewer:viewer,p_level:level});
    if(error)throw error;
  }
  async replaceChapterMap(bookId,chapters){
    const {data,error}=await this.client.rpc('replace_book_chapter_map',{p_user_book_id:bookId,p_chapters:chapters});
    if(error)throw error;return data;
  }
  async listSharedChapterMaps(isbn){
    const {data,error}=await this.client.rpc('get_shared_chapter_maps',{p_isbn13:isbn13ForEdition(isbn)});
    if(error)throw error;return data||[];
  }
  async withdrawChapterMap(bookId){
    const {data,error}=await this.client.rpc('withdraw_chapter_map',{p_user_book_id:bookId});
    if(error)throw error;return data;
  }
  async publishChapterMap(bookId){
    const {data,error}=await this.client.rpc('publish_chapter_map',{p_user_book_id:bookId});
    if(error)throw error;return data;
  }
}

export function createRepo(){
  const c=window.READING_ROOM_CONFIG || {};
  if(c.supabaseUrl?.trim() && c.supabaseAnonKey?.trim())return new CloudRepo(c.supabaseUrl.trim(),c.supabaseAnonKey.trim());
  return new DemoRepo();
}
