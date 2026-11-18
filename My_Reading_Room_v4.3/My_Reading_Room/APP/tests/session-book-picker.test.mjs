import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionBookChoices, selectedSessionBookId } from '../session-book-picker.js';

const books = [
  {id:'d',title:'Dune',author:'Frank Herbert',status:'reading'},
  {id:'j',title:'Jurassic Park',author:'Michael Crichton',status:'finished'},
  {id:'l',title:'Lonesome Dove',author:'Larry McMurtry',status:'tbr'},
  {id:'h',title:'The Hobbit',author:'J. R. R. Tolkien',status:'reading'},
  {id:'r',title:'The Road',author:'Cormac McCarthy',status:'dnf'},
];

test('default book picker contains only currently-reading books, including active rereads', () => {
 assert.deepEqual(sessionBookChoices(books).map(b=>b.id), ['d','h']);
 assert.equal(selectedSessionBookId(sessionBookChoices(books)), 'd');
 assert.equal(selectedSessionBookId(sessionBookChoices(books),'h'), 'h');
});

test('full-library scope makes finished, TBR, and DNF books selectable without changing their statuses', () => {
 assert.deepEqual(sessionBookChoices(books,'all').map(b=>b.id), ['d','j','l','h','r']);
 assert.equal(books.find(b=>b.id==='l').status,'tbr');
 assert.equal(books.find(b=>b.id==='j').status,'finished');
});

test('full-library search matches titles and authors case insensitively', () => {
 assert.deepEqual(sessionBookChoices(books,'all','  mccarthy ').map(b=>b.id), ['r']);
 assert.deepEqual(sessionBookChoices(books,'all','JURASSIC').map(b=>b.id), ['j']);
 assert.deepEqual(sessionBookChoices(books,'reading','dune').map(b=>b.id), ['d','h']); // search applies only to full library
});

test('selection never points at a hidden or missing book', () => {
 const active = sessionBookChoices(books);
 assert.equal(selectedSessionBookId(active,'j'),'d');
 assert.equal(selectedSessionBookId(sessionBookChoices(books,'all','Jurassic'),'d'),'j');
 assert.equal(selectedSessionBookId([],'d'),'');
 assert.deepEqual(sessionBookChoices([], 'all'), []);
 assert.deepEqual(sessionBookChoices(books,'all','Nonexistent'), []);
});

test('switching back from full-library choice restores a currently-reading selection', () => {
 const all=sessionBookChoices(books,'all','Jurassic');
 const picked=selectedSessionBookId(all,'d');
 assert.equal(picked,'j');
 assert.equal(selectedSessionBookId(sessionBookChoices(books,'reading'),picked),'d');
});
