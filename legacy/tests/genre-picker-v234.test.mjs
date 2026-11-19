import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {STANDARD_GENRES,normalizeGenres} from '../catalog.js';
import {selectedGenres,addSelectedGenre,removeSelectedGenre,primarySelectedGenre} from '../book-detail-metadata.js';

const appSource=readFileSync(new URL('../app.js',import.meta.url),'utf8');

test('manual and edit pickers share one canonical genre taxonomy with catalog enrichment',()=>{
  assert.equal(STANDARD_GENRES.length,26);
  assert.equal(new Set(STANDARD_GENRES).size,STANDARD_GENRES.length);
  assert.deepEqual(STANDARD_GENRES,[...STANDARD_GENRES].sort((a,b)=>a.localeCompare(b)));
  assert.ok(STANDARD_GENRES.includes('Science Fiction'));
  assert.ok(STANDARD_GENRES.includes('Fantasy'));
  assert.ok(STANDARD_GENRES.includes('Business & Finance'));
  for(const canonical of STANDARD_GENRES) assert.deepEqual(normalizeGenres([canonical]),[canonical]);
  assert.match(appSource,/function renderGenrePicker\(kind, assigned/);
  assert.match(appSource,/id="\$\{kind\}-genres"/);
  assert.match(appSource,/renderGenrePicker\('manual'\)/);
  assert.match(appSource,/renderGenrePicker\('edit',b\.genres\|\|\[\]\)/);
  assert.match(appSource,/data-action="remove-book-genre"/);
  assert.match(appSource,/data-action="primary-book-genre"/);
  assert.match(appSource,/Select a genre…/);
});

test('new genres must be selected from catalog standardized options',()=>{
  assert.deepEqual(addSelectedGenre([], 'Science Fiction'),['Science Fiction']);
  assert.deepEqual(addSelectedGenre(['Fantasy'], 'science fiction'),['Fantasy','Science Fiction']);
  assert.deepEqual(addSelectedGenre(['Science Fiction'], 'Science Fiction'),['Science Fiction']);
  assert.throws(()=>addSelectedGenre([], 'Fantasy, Random'),/standardized dropdown/);
  assert.throws(()=>addSelectedGenre([], 'custom whatever'),/standardized dropdown/);
  assert.throws(()=>addSelectedGenre([], ''),/standardized dropdown/);
});

test('first selected genre remains primary for insights and can be explicitly reordered',()=>{
  const genres=addSelectedGenre(['Science Fiction'],'Adventure');
  assert.deepEqual(genres,['Science Fiction','Adventure']);
  assert.deepEqual(primarySelectedGenre(genres,'Adventure'),['Adventure','Science Fiction']);
  assert.deepEqual(removeSelectedGenre(genres,'Science Fiction'),['Adventure']);
  assert.throws(()=>primarySelectedGenre(genres,'Western'),/not assigned/);
});

test('existing nonstandard imported genres are not erased by editing unrelated book fields',()=>{
  const old=['Speculative Fiction','Fantasy','speculative fiction'];
  assert.deepEqual(selectedGenres(old),['Speculative Fiction','Fantasy']);
  const withGenre=addSelectedGenre(old,'Adventure');
  assert.deepEqual(withGenre,['Speculative Fiction','Fantasy','Adventure']);
  assert.deepEqual(removeSelectedGenre(withGenre,'Speculative Fiction'),['Fantasy','Adventure']);
});

test('case variants of standard genres display as canonical categories, while legacy custom labels survive',()=>{
 assert.deepEqual(selectedGenres(['Science fiction','SCIENCE FICTION','My personal tag']),['Science Fiction','My personal tag']);
 assert.deepEqual(addSelectedGenre(['science fiction'],'Science Fiction'),['Science Fiction']);
});
