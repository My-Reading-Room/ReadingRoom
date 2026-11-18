/** Reading Replay story UI. Render from pure analytics; no data writes. */
const h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nf=n=>Math.round(Number(n)||0).toLocaleString('en-US');
const hm=n=>{const m=Math.round(Number(n)||0);return m>=60?`${Math.floor(m/60)}h ${String(m%60).padStart(2,'0')}m`:`${m}m`;};
const dayText=s=>s?new Date(s+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}):'—';
const methodLabels={reading:'Reading',audiobook:'Listening',read_listen:'Read + Listen'};
const names={week:'Weekly',month:'Monthly',year:'Annual'};
const bookCover=(book)=>{
 const src=(()=>{try{const url=new URL(book?.cover_url);return url.protocol==='https:'?url.href:null;}catch{return null}})();
 return `<div class="replay-book-cover"><span>${h(book?.title||'A good book')}</span>${src?`<img loading="lazy" decoding="async" referrerpolicy="no-referrer" src="${h(src)}" alt=""/>`:''}</div>`;
};
const fact=(number,label,note='')=>`<div class="replay-fact"><strong>${h(number)}</strong><span>${h(label)}</span>${note?`<small>${h(note)}</small>`:''}</div>`;
const unavailable='Not recorded';
const totalPages=recap=>`${nf(recap.physicalPages)} print pages${recap.audioPages?` + ${nf(recap.audioPages)} audio equivalents`:''}`;
const story=({period:p,minutes,finished,topBooks,topGenres,topClock,goal,delta,hasSessionData,hasAnyData})=>{
 if(!hasAnyData)return 'Your next chapter starts here. Log a session or add completion dates to fill this recap.';
 if(finished.length&&!hasSessionData)return `You finished ${finished.length} ${finished.length===1?'book':'books'} during this period. Session-based reading time wasn’t recorded.`;
 if(topBooks.length&&minutes>0)return `You spent the most recorded time with ${topBooks[0].book.title}${topClock?`, and ${topClock.label.toLowerCase()} was your busiest reading window`:''}.`;
 if(goal&&goal.daysMet>0)return `You hit your daily reading goal on ${goal.daysMet} ${goal.daysMet===1?'day':'days'}.`;
 return 'Every reading session adds another chapter to your story.';
};
const palettes=['aurora','ink','coral','sage','violet','gold','mint','night','aurora'];
const periodTitle=kind=>kind==='year'?'Your year in stories':kind==='month'?'Your month in pages':'Your week between the covers';
const note=recap=>`<div class="replay-source-note">${h(recap.disclaimer)}${recap.sessionNote?`<br/>${h(recap.sessionNote)}`:''}</div>`;
const displayMinutes=(recap)=>recap.hasSessionData?hm(recap.minutes):'—';
const spark=(recap)=>{
 const vals=recap.timeline||[],max=Math.max(1,...vals.map(d=>d.value)),isMonth=recap.period.kind==='month';
 return `<div class="replay-spark ${isMonth?'replay-spark-month':''}" role="img" aria-label="Reading minutes through the selected period">
 ${vals.map(d=>`<div class="replay-spark-col" title="${h(d.key)}: ${nf(d.value)} logged minutes"><span class="replay-spark-value">${d.value?nf(d.value):''}</span><div class="replay-spark-track"><i style="height:${d.future?0:Math.max(d.value?4:0,(d.value/max)*100)}%"></i></div><small>${isMonth?(Number(d.key.slice(-2))%5===1?d.label:''):d.label}</small></div>`).join('')}</div>`;
};
const modeGraph=recap=>{
 const total=recap.mode.reduce((n,x)=>n+x.minutes,0);
 return `<div class="replay-mode-rail" role="img" aria-label="Share of reading minutes by method">${recap.mode.map(m=>`<i class="replay-mode-${m.id}" style="width:${total?m.minutes/total*100:0}%" title="${h(methodLabels[m.id])}: ${hm(m.minutes)}"></i>`).join('')}</div><div class="replay-mode-list">${recap.mode.map(m=>`<div><span class="replay-mode-dot replay-mode-${m.id}"></span><strong>${h(methodLabels[m.id])}</strong><span>${total?Math.round(100*m.minutes/total)+'%':'—'}</span><small>${total?hm(m.minutes):unavailable}</small></div>`).join('')}</div>`;
};
const bookList=(recap)=>{
 const top=recap.topBooks.slice(0,3);
 if(top.length)return `<div class="replay-book-grid">${top.map((x,i)=>`<article class="replay-book"><div class="replay-book-rank">#${i+1}</div>${bookCover(x.book)}<strong>${h(x.book.title)}</strong><span>${h(x.book.author||'')}</span><small>${hm(x.minutes)} logged</small></article>`).join('')}</div>`;
 if(recap.finished.length)return `<div class="replay-book-grid">${recap.finished.slice(0,3).map(({book})=>`<article class="replay-book">${bookCover(book)}<strong>${h(book.title)}</strong><span>${h(book.author||'')}</span><small>Completed</small></article>`).join('')}</div>`;
 return `<div class="replay-empty-inner"><strong>No book activity yet</strong><p>Log reading sessions or add accurate finish dates to see your books here.</p></div>`;
};
const miniGenres=recap=>{
 const genres=recap.topGenres.slice(0,3);if(!genres.length)return '';
 const max=Math.max(1,genres[0].value);
 return `<div class="replay-mini-genres"><div class="replay-mini-heading">TOP GENRES · BY ${recap.genreBasis==='logged minutes'?'LOGGED TIME':'FINISHED BOOKS'}</div>${genres.map(g=>`<div class="replay-mini-genre-row"><strong>${h(g.genre)}</strong><span class="replay-mini-genre-track"><i style="width:${100*g.value/max}%"></i></span><small>${recap.genreBasis==='logged minutes'?hm(g.value):nf(g.value)+' books'}</small></div>`).join('')}</div>`;
};
const clockGraph=recap=>{
 if(!recap.knownClockMinutes)return `<div class="replay-empty-inner">${recap.hasSessionData?'Your session times were not recorded.':'Log sessions with start times to discover your reading rhythm.'}</div>`;
 const max=Math.max(1,...recap.clock.map(d=>d.minutes));return `<div class="replay-clock-graph">${recap.clock.map(c=>`<div class="replay-clock-row"><span>${h(c.label)}</span><div class="replay-clock-track"><i style="width:${Math.max(0,c.minutes/max*100)}%"></i></div><strong>${hm(c.minutes)}</strong></div>`).join('')}</div><p class="replay-muted">${recap.unknownClockMinutes?`${hm(recap.unknownClockMinutes)} had no start time and are excluded from this chart.`:'All recorded session start times are represented.'}</p>`;
};
const goalGraph=recap=>{
 if(!recap.goal||!recap.goal.days)return `<div class="replay-empty-inner">Goals are not evaluated before the account’s tracking start date.</div>`;
 return `<div class="replay-goal-meter"><div style="width:${Math.max(0,Math.min(100,recap.goal.daysMet/recap.goal.days*100))}%"></div></div><div class="replay-goal-labels"><span>${nf(recap.goal.daysMet)} days met</span><span>${nf(recap.goal.days)} tracked days</span></div><p class="replay-muted">Uses the goal in effect each day, across all three reading types, within this completed period.</p>`;
};
const most=(recap)=>recap.topGenres[0];
const compareMessage=(recap)=>{
 if(!recap.delta)return 'No comparable earlier tracked period.';
 const diff=recap.delta.minutes;if(!recap.previous?.sessions)return 'No recorded reading time in the comparable earlier period.';
 return diff===0?'The same recorded reading time as the comparable previous period.':`${hm(Math.abs(diff))} ${diff>0?'more':'less'} tracked reading time than the comparable previous period.`;
};
function cards(recap){
 const p=recap.period,interval=p.kind,stories=[
  {id:'opening',tag:`YOUR ${interval.toUpperCase()} REPLAY`,title:periodTitle(interval),content:`<div class="replay-hero-number">${recap.finished.length?nf(recap.finished.length):recap.hasSessionData?displayMinutes(recap):'—'}</div><p class="replay-hero-label">${recap.finished.length?'books finished':recap.hasSessionData?'tracked reading time':'no activity recorded'}</p><div class="replay-hero-rule"></div><p class="replay-hero-quote">${h(story(recap))}</p>`},
  {id:'numbers',tag:'THE BIG PICTURE',title:'Every minute adds up',content:`<div class="replay-facts">${fact(displayMinutes(recap),'Reading time')}${fact(recap.hasSessionData?nf(recap.pages):'—','Pages progressed')}${fact(recap.hasSessionData?nf(recap.activeDays):'—','Active days')}${fact(nf(recap.finished.length),'Books completed')}${fact(recap.hasSessionData?nf(recap.sessions):'—','Reading sessions')}${fact(recap.speed.overall.measuredSessions?recap.speed.overall.pagesPerHour.toFixed(1):'—','Measured pages / hour')}</div><p class="replay-muted">${h(totalPages(recap))}. Combined reading + listening counts once.</p>`},
  {id:'timeline',tag:'THE READING JOURNEY',title:interval==='year'?'Twelve chapters of a year':interval==='month'?'The days that made your month':'Your reading week, day by day',content:`${spark(recap)}<div class="replay-small-split"><div><span>${interval==='year'?'Busiest month':'Most active day'}</span><strong>${interval==='year'?(recap.peakMonth?new Date(recap.peakMonth.month+'-01T12:00:00Z').toLocaleDateString('en-US',{month:'long',timeZone:'UTC'}):'—'):(recap.peakDay?dayText(recap.peakDay.date):'—')}</strong></div><div><span>${interval==='year'?'Peak monthly time':'Peak daily time'}</span><strong>${interval==='year'?(recap.peakMonth?hm(recap.peakMonth.minutes):'—'):(recap.peakDay?hm(recap.peakDay.minutes):'—')}</strong></div></div>`},
  {id:'books',tag:'BETWEEN THE COVERS',title:recap.topBooks.length?'The books you spent time with':'The books you finished',content:`${bookList(recap)}${interval==='month'?miniGenres(recap):''}<p class="replay-muted">${recap.topBooks.length?'Ranked by logged reading time.':'Finished dates come from saved book history, including Goodreads imports.'}</p>`},
  {id:'habits',tag:'YOUR READING CLOCK',title:recap.topClock?`You read most in the ${recap.topClock.label.toLowerCase()}`:'What time is story time?',content:`${clockGraph(recap)}<div class="replay-small-split"><div><span>Longest streak in period</span><strong>${recap.hasSessionData?recap.bestStreak+' days':'—'}</strong></div><div><span>${interval==='week'?'Daily goals met':'Days you read'}</span><strong>${interval==='week'?(recap.goal?.days?recap.goal.daysMet+' / '+recap.goal.days:'—'):(recap.hasSessionData?recap.activeDays:'—')}</strong></div></div>`},
  {id:'final',tag:'UNTIL NEXT TIME',title:'The story keeps going',content:`<div class="replay-final-mark">✦</div><p class="replay-ending">${h(story(recap))}</p><p class="replay-muted">${h(compareMessage(recap))}</p>${recap.yearOnlyCount?`<p class="replay-muted">${nf(recap.yearOnlyCount)} completion(s) have a year only, not an exact finish date.</p>`:''}`}
 ];
 const modeCard={id:'modes',tag:'THREE WAYS TO READ',title:'How you spent your story time',content:`${recap.hasSessionData?modeGraph(recap):`<div class="replay-empty-inner">No activity-type time was logged in this period.</div>`}<div class="replay-small-split"><div><span>Reading speed</span><strong>${recap.speed.reading.pagesPerHour!==null?recap.speed.reading.pagesPerHour.toFixed(1)+' pg/h':'—'}</strong></div><div><span>Listening equivalents</span><strong>${recap.speed.audiobook.pagesPerHour!==null?recap.speed.audiobook.pagesPerHour.toFixed(1)+' pg/h':'—'}</strong></div></div><p class="replay-muted">Speed requires exact page progress and elapsed session minutes. Audiobook-only page equivalents are not physical pages.</p>`};
 const goalCard={id:'goals',tag:'SMALL WINS, BIG STORIES',title:'You showed up for your goal',content:`<div class="replay-goal-number">${recap.goal?.days?Math.round(100*recap.goal.daysMet/recap.goal.days)+'%':'—'}</div><div class="replay-goal-caption">daily goals achieved</div>${goalGraph(recap)}${recap.challenge?`<div class="replay-challenge"><strong>${nf(recap.challenge.done)} / ${nf(recap.challenge.target)}</strong><span>Annual books challenge</span></div>`:''}`};
 const genreCard={id:'genres',tag:'YOUR WORLD OF BOOKS',title:most(recap)?`You gravitated toward ${most(recap).genre}`:'Genres worth exploring',content:`<div class="replay-genre-list">${recap.topGenres.slice(0,4).map((x,i)=>`<div class="replay-genre-row"><span>${String(i+1).padStart(2,'0')}</span><strong>${h(x.genre)}</strong><i style="width:${(x.value/Math.max(1,recap.topGenres[0].value))*100}%"></i><small>${recap.genreBasis==='logged minutes'?hm(x.value):nf(x.value)+' completed'}</small></div>`).join('')||'<div class="replay-empty-inner">Add genres to your books to discover your favorites.</div>'}</div><p class="replay-muted">Genre ranking by ${h(recap.genreBasis)} · each book uses its primary genre only.</p>${recap.ratingCount?`<div class="replay-challenge"><strong>${recap.averageRating.toFixed(2)} ★</strong><span>Current ratings of ${nf(recap.ratingCount)} completed books</span></div>`:''}`};
 if(interval==='month')stories.splice(3,0,modeCard);
 if(interval==='year')stories.splice(3,0,modeCard);
 if(interval!=='week')stories.splice(stories.length-1,0,goalCard);
 if(interval==='year')stories.splice(stories.length-1,0,genreCard);
 return stories;
}
export function readingReplayShareText(recap){
 const p=recap.period;const lines=[`My Reading Room · ${names[p.kind]} Replay · ${p.label}`,
  `Finished books: ${recap.finished.length}`,
  `Tracked reading time: ${recap.hasSessionData?hm(recap.minutes):'not recorded'}`,
  `Tracked pages progressed: ${recap.hasSessionData?nf(recap.pages):'not recorded'}`,
  `Active days: ${recap.hasSessionData?nf(recap.activeDays):'not recorded'}`];
 if(recap.goal?.days)lines.push(`Daily goals met: ${recap.goal.daysMet} / ${recap.goal.days}`);
 if(recap.topBooks[0])lines.push(`Most-read by time: ${recap.topBooks[0].book.title}`);
 return lines.join('\n');
}
export function readingReplaySlideCount(kind){return kind==='year'?9:kind==='month'?8:6;}
export function renderReadingReplayView(recap,{slide=0,owner=true,readerName='Your'}={}){
 const set=cards(recap),index=Math.min(Math.max(0,slide),set.length-1),item=set[index],p=recap.period;
 return `<section class="replay-page" aria-label="Reading Replay">
   <div class="replay-page-head"><div><div class="eyebrow">A LITTLE STORY ABOUT YOUR STORIES</div><h1 class="heading">Reading Replay <span class="replay-sparkle">✦</span></h1><p class="subtitle">The completed chapters of your reading life, told in numbers, habits, and books.</p></div>${owner?`<button class="btn replay-copy-btn" type="button" data-action="replay-copy">Copy recap summary</button>`:''}</div>
   <div class="replay-toolbar"><div class="segmented replay-kind" role="group" aria-label="Recap timeframe">${['week','month','year'].map(k=>`<button type="button" class="seg-btn ${p.kind===k?'active':''}" aria-pressed="${p.kind===k}" data-replay-kind="${k}">${names[k]}</button>`).join('')}</div>
   <div class="replay-period-nav"><button class="btn icon-only" type="button" data-action="replay-older" aria-label="Previous ${p.kind}">‹</button><strong>${h(p.label)}</strong><button class="btn icon-only" type="button" data-action="replay-newer" aria-label="Next ${p.kind}" ${p.offset===0?'disabled':''}>›</button></div></div>
   ${!recap.hasAnyData?`<div class="replay-empty-banner">No logged activity or recorded completions in this ${p.kind}. You can still explore the recap cards or choose a different period.</div>`:''}
   <div class="replay-progress"><div class="replay-progress-caption"><span>${index+1} / ${set.length} · ${h(item.tag)}</span><span>Complete period</span></div><div class="replay-progress-rail"><i style="width:${(index+1)/set.length*100}%"></i></div></div>
   <article class="replay-story replay-theme-${palettes[index%palettes.length]}" aria-live="polite" aria-label="Recap card ${index+1} of ${set.length}">
    <div class="replay-story-decoration" aria-hidden="true">✦</div><div class="replay-story-body"><div class="replay-story-top"><span>${h(names[p.kind].toUpperCase())} REPLAY</span><span>${h(p.label)}</span></div>
     <div class="replay-slide-tag">${h(item.tag)}</div><h2 class="replay-slide-title">${h(item.title)}</h2><div class="replay-content">${item.content}</div>
     <div class="replay-watermark">MY READING ROOM <span>✧</span></div>
    </div></article>
   <div class="replay-slide-nav"><button type="button" class="btn" data-action="replay-prev" ${index===0?'disabled':''}>← Previous</button><div class="replay-dots" role="group" aria-label="Choose recap card">${set.map((s,i)=>`<button type="button" class="${i===index?'active':''}" data-replay-slide="${i}" aria-label="Card ${i+1}: ${h(s.tag)}" aria-current="${i===index?'true':'false'}"></button>`).join('')}</div><button type="button" class="btn primary" data-action="replay-next" ${index===set.length-1?'disabled':''}>Next →</button></div>
   ${note(recap)}${!owner?'<p class="replay-sharing-notice">This is a view-only recap of a Full-shared profile. Only the profile owner can copy a recap summary.</p>':''}
 </section>`;
}
