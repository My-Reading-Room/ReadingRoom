import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildFriendComparison,comparableBookKey} from '../friend-comparison.js';
import {renderFriendComparisonBody} from '../friend-comparison-view.js';

const here = new URL('../',import.meta.url);
const code = file => fs.readFileSync(new URL(file,here),'utf8');
const date='2026-11-17';
const profiles=[
 {id:'me',display_name:'Me',tracking_start_date:'2026-11-15',tracking_start_goal_minutes:60},
 {id:'bob',display_name:'Bob',tracking_start_date:'2026-11-16',tracking_start_goal_minutes:45},
 {id:'eve',display_name:'Eve',tracking_start_date:'2026-11-16'}
];
const books=[
 {id:'a1',user_id:'me',title:'Dune',author:'Frank Herbert',status:'reading',genres:['Science Fiction','Fantasy'],rating:4.5,started_on:'2026-11-15'},
 {id:'a2',user_id:'me',title:'The Hobbit',author:'J.R.R. Tolkien',status:'finished',genres:['Fantasy'],rating:4,finished_on:'2026-01-08'},
 {id:'b1',user_id:'bob',title:'DUNE',author:'Frank Herbert',status:'finished',genres:['Science Fiction'],rating:5,finished_on:'2026-11-17',read_history:[{number:1,status:'finished',finished_on:'2026-11-17'}]},
 {id:'b2',user_id:'bob',title:'The Martian',author:'Andy Weir',status:'tbr',genres:['Science Fiction'],rating:null,tbr_added_on:'2021-01-01'},
 {id:'e1',user_id:'eve',title:'PRIVATE TITLE SECRET',author:'X',status:'finished',genres:['Private Genre'],rating:5,finished_on:date}
];
const sessions=[
 {id:'x',user_id:'me',user_book_id:'a1',session_date:'2026-11-15',duration_minutes:60,pages_read:40,activity_mode:'reading',start_local_time:'09:00'},
 {id:'y',user_id:'me',user_book_id:'a1',session_date:'2026-11-17',duration_minutes:30,pages_read:null,activity_mode:'audiobook',start_local_time:null},
 {id:'w',user_id:'bob',user_book_id:'b1',session_date:'2026-11-15',duration_minutes:999,pages_read:999,activity_mode:'reading',start_local_time:'09:00'},
 {id:'z',user_id:'bob',user_book_id:'b1',session_date:'2026-11-16',duration_minutes:45,pages_read:30,activity_mode:'read_listen',start_local_time:'22:15'},
 {id:'forbidden',user_id:'eve',user_book_id:'e1',session_date:date,duration_minutes:987,pages_read:987,start_local_time:'08:00'}
];
const opts={viewerId:'me',friendId:'bob',profiles,books,sessions,goals:[
 {user_id:'me',year:2026,books_target:12,daily_minutes_target:60},
 {user_id:'bob',year:2026,books_target:20,daily_minutes_target:45}],
 goalHistory:[],shares:[{owner_id:'bob',viewer_id:'me',access_level:'full'}],
 summaries:[{owner_id:'me',year:2026,total_minutes:500},{owner_id:'bob',year:2026,total_minutes:300}],
 period:{mode:'week',start:'2026-11-15',end:'2026-11-21',today:date,year:2026,label:'Nov 15–21'}
};

test('full profile comparison uses two individual tracking cutoffs and all major Insights calculations',()=>{
 const d=buildFriendComparison(opts);
 assert.equal(d.access,'full');
 assert.equal(d.mine.minutes,90);
 assert.equal(d.theirs.minutes,45); // Bob's Nov 15 reading excluded by HIS tracking date
 assert.equal(d.mine.speed.reading.pagesPerHour,40);
 assert.equal(d.theirs.speed.read_listen.pagesPerHour,40);
 assert.equal(d.mine.speed.audiobook.pagesPerHour,null); // No guesses from audiobook-position logs
 assert.equal(d.mine.clock.unknownMinutes,30);
 assert.equal(d.theirs.clock.buckets.find(x=>x.id==='night').minutes,45);
 assert.equal(d.mine.weekday.days[0].minutes,60); // Sunday first
 assert.equal(d.theirs.weekday.days[1].minutes,45);
 assert.equal(d.mine.goal.targetMinutes,60);
 assert.equal(d.theirs.goal.targetMinutes,45);
 assert.equal(d.interests.shared.length,1);
 assert.equal(d.interests.shared[0].mine.title,'Dune');
 assert.equal(d.interests.shared[0].ratingGap,-0.5);
 assert.equal(d.interests.theirsOnly[0].title,'The Martian');
 assert.equal(d.theirs.library.tbr.distribution.buckets.at(-1).count,1); // 5+ years
 assert.equal(d.mine.rereads.booksReread,0);
 assert.ok(d.theirs.heatmap.rows.length===7);
 assert.ok(d.mine.sessionsByLength.buckets.length===5);
 const html=renderFriendComparisonBody(d);
 assert.match(html,/Time of day and reading habits/);
 assert.match(html,/Weighted reading speed by time of day/);
 assert.match(html,/Reading speed by primary genre/);
 assert.match(html,/Speed over time/);
 assert.match(html,/Books you both have/);
 assert.match(html,/Distribution of days on TBR/);
 assert.match(html,/Goal success rate/);
 assert.doesNotMatch(html,/PRIVATE TITLE SECRET/);
});

test('rendered full comparison never includes books from unshared readers',()=>{
 const d=buildFriendComparison(opts);
 const html=renderFriendComparisonBody(d);
 assert.doesNotMatch(html,/PRIVATE TITLE SECRET|Private Genre|987/);
 assert.match(html,/The Martian/);
});

test('summary-only shares expose only whitelisted annual metrics, not session or book data',()=>{
 const d=buildFriendComparison({...opts,shares:[{owner_id:'bob',viewer_id:'me',access_level:'summary'}]});
 assert.equal(d.access,'summary');
 assert.equal('mine' in d,false);
 assert.equal('interests' in d,false);
 const html=renderFriendComparisonBody(d);
 assert.match(html,/Summary-only sharing/);
 assert.match(html,/Total reading time/);
 assert.doesNotMatch(html,/Dune|The Martian|PRIVATE TITLE|Reading speed by time of day|09:00|30 pg/);
});

test('revoked shares and unrelated shares deny comparison',()=>{
 assert.equal(buildFriendComparison({...opts,shares:[]}).access,'none');
 assert.equal(buildFriendComparison({...opts,shares:[{owner_id:'me',viewer_id:'bob',access_level:'full'}]}).access,'none');
 assert.equal(buildFriendComparison({...opts,friendId:'me'}).access,'none');
});

test('book overlap is by title and author, not edition ISBN',()=>{
 assert.equal(comparableBookKey({title:'DUNE! (1965)',author:'Frank Herbert'}), 'dune 1965|frank herbert');
 assert.equal(comparableBookKey({title:'Dune',author:'Frank Herbert'}),comparableBookKey({title:' DUNE ',author:'Frank Herbert'}));
});

test('the Friends comparison UI is wired and cached for offline shell use',()=>{
 const app=code('app.js'),style=code('style.css'),worker=code('service-worker.js');
 assert.match(app,/renderFriendComparison\(\)/);
 assert.match(app,/data-friends-view="compare"/);
 assert.match(app,/data-compare-period/);
 assert.match(app,/case 'compare-friend'/);
 assert.match(style,/\.compare-heat-duo/);
 assert.match(worker,/friend-comparison\.js/);
 assert.match(worker,/friend-comparison-view\.js/);
});
