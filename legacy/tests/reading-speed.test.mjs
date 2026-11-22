import test from 'node:test';
import assert from 'node:assert/strict';
import { readingSpeedStats, readingSpeedByMode } from '../reading-metrics.js';

const sample = [
  {user_book_id:'a', activity_mode:'reading', duration_minutes:60, pages_read:42, log_type:'pages'},
  {user_book_id:'a', activity_mode:'reading', duration_minutes:30, pages_read:21, log_type:'chapters'},
  {user_book_id:'a', activity_mode:'audiobook', duration_minutes:60, pages_read:65, log_type:'chapters'},
  {user_book_id:'a', activity_mode:'read_listen', duration_minutes:60, pages_read:51, log_type:'pages'},
  {user_book_id:'a', activity_mode:'audiobook', duration_minutes:55, pages_read:null, log_type:'audio_position'},
  {user_book_id:'b', duration_minutes:60, pages_read:30, log_type:'pages'}, // Legacy default: reading
];

test('speed is a duration-weighted rate, not the arithmetic mean of per-session rates',()=>{
 const result=readingSpeedStats(sample,{bookId:'a',activityMode:'reading'});
 assert.equal(result.pages,63);
 assert.equal(result.minutes,90);
 assert.equal(result.measuredSessions,2);
 assert.equal(result.pagesPerHour,42);
});

test('audiobook page-equivalents and read+listen each have their own speed',()=>{
 const result=readingSpeedByMode(sample,{bookId:'a'});
 assert.equal(result.audiobook.pagesPerHour,65);
 assert.equal(result.audiobook.excludedSessions,1);
 assert.equal(result.audiobook.excludedMinutes,55);
 assert.equal(result.read_listen.pagesPerHour,51);
 assert.equal(result.read_listen.minutes,60); // Not 120 minutes for the combined mode
 assert.equal(result.overall.pages,179);
 assert.equal(result.overall.minutes,210);
 assert.ok(Math.abs(result.overall.pagesPerHour - (179*60/210))<1e-10);
});

test('book filter and legacy sessions work correctly',()=>{
 assert.equal(readingSpeedStats(sample,{bookId:'b',activityMode:'reading'}).pagesPerHour,30);
 assert.equal(readingSpeedStats(sample,{bookId:'b',activityMode:'audiobook'}).pagesPerHour,null);
 assert.equal(readingSpeedStats(sample,{bookId:'a'}).measuredSessions,4);
});

test('missing/invalid page counts or durations never contaminate the speed calculation',()=>{
 const data=[
  {duration_minutes:60,pages_read:30,activity_mode:'reading'},
  {duration_minutes:60,pages_read:null,activity_mode:'reading'},
  {duration_minutes:60,pages_read:'',activity_mode:'reading'},
  {duration_minutes:0,pages_read:24,activity_mode:'reading'},
  {duration_minutes:-2,pages_read:24,activity_mode:'reading'},
  {duration_minutes:30,pages_read:'not a number',activity_mode:'reading'},
 ];
 const result=readingSpeedStats(data);
 assert.equal(result.pages,30);
 assert.equal(result.minutes,60);
 assert.equal(result.pagesPerHour,30);
 assert.equal(result.excludedSessions,5);
 assert.equal(result.excludedMinutes,150);
});

test('speed gaps remain null when a mode has no measurable progress',()=>{
 const data=[{duration_minutes:40,pages_read:null,activity_mode:'audiobook',log_type:'audio_position'}];
 const a=readingSpeedByMode(data);
 assert.equal(a.audiobook.pagesPerHour,null);
 assert.equal(a.overall.pagesPerHour,null);
 assert.equal(a.audiobook.excludedSessions,1);
});
