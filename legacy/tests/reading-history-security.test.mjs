import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/2026-11-16_reread_history_and_session_rounds.sql',import.meta.url),'utf8');
const schema=readFileSync(new URL('../supabase/schema.sql',import.meta.url),'utf8');
test('reread fields use existing RLS-owned books and sessions, not an unprotected new table',()=>{
 assert.match(sql,/alter table public.user_books add column if not exists read_history jsonb/);
 assert.match(sql,/alter table public.reading_sessions add column if not exists read_number integer/);
 assert.match(schema,/create policy "Read own or full-share libraries"/);
 assert.match(schema,/create policy "Read own or full-share sessions"/);
 assert.doesNotMatch(sql,/create table/i);
 assert.match(sql,/b\.read_history='\[\]'::jsonb and b\.status='finished'/);
 assert.match(sql,/jsonb_array_elements\(b\.read_history\)/);
 assert.match(sql,/profile_shares sh/);
});
test('service worker includes new reread analytics module',()=>{
 const source=readFileSync(new URL('../service-worker.js',import.meta.url),'utf8');
 assert.match(source,/reading-history\.js/);assert.match(source,/reading-room-v2\.(3|4)/);assert.match(source,/book-detail-metadata\.js/);
});
