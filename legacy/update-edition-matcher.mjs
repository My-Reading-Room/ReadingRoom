#!/usr/bin/env node
/**
 * Edition matcher patch: APPLIED to catalog.js, app.js and the Supabase migration.
 *
 * The original draft was cut off at line 380. Its complete, tested five-field
 * scoring implementation now lives in catalog.js (one source of truth).
 * Running this script is a non-destructive verification, not a database action.
 * Original draft retained in patches/update-edition-matcher-original-incomplete.txt.
 * Usage: node update-edition-matcher.mjs
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {editionMatchDetails, normalizeBinding, normalizeGenres} from './catalog.js';

assert.equal(normalizeBinding('mass-market paperback'),'mass_market');
assert.deepEqual(normalizeGenres(['Biography & Autobiography / Sports']),['Biography','Sports & Fitness']);
assert.deepEqual(normalizeGenres(['Science fiction','Desert ecology']),['Science Fiction']);
const book={title:'Dune',publisher:'Ace Books',binding:'Mass Market Paperback',page_count:412,
  edition_year:2005,original_published_year:1965};
const edition={publishers:['Ace Books'],physical_format:'Mass Market Paperback',number_of_pages:412,
  publish_date:'2005',first_publish_year:1965,isbn_13:['9780441172719']};
const match=editionMatchDetails(book,edition);
assert.equal(match.confident,true);
for(const field of ['publisher','binding','pages','edition year','original year'])assert.ok(match.evidence.includes(field),field);
const sql=readFileSync(new URL('./supabase/migrations/2026-11-17_edition_metadata.sql',import.meta.url),'utf8');
for(const field of ['binding','edition_year','original_published_year'])assert.ok(sql.includes('add column if not exists '+field));
console.log('Edition matcher patch is integrated. Five-field scoring, genre rules and database migration checks passed.');
console.log('IMPORTANT: For v2.3 on an existing v2.2 database, run UPGRADE_EXISTING_TO_V2.3.sql; if starting from v2.0, apply v2.1, v2.2 and v2.3 upgrades in order. New empty projects use schema.sql once.');
