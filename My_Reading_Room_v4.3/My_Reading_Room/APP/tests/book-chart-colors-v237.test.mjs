import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOOK_CHART_PALETTE, bookChartColors } from '../book-chart-colors.js';

const books = [
  { id: 'a', title: 'Dune', author: 'Frank Herbert', demo_color: '#456456' },
  { id: 'b', title: 'Project Hail Mary', author: 'Andy Weir', demo_color: '#456456' },
  { id: 'c', title: 'Jurassic Park', author: 'Michael Crichton', demo_color: '#456456' }
];
const sessions = [{user_book_id: 'a'}, {user_book_id: 'b'}, {user_book_id: 'a'}];

test('two active books with identical cover colors receive clearly different chart colors', () => {
  const result = bookChartColors(books, sessions);
  assert.equal(result.size, 2);
  assert.equal(result.get('a'), BOOK_CHART_PALETTE[0]);
  assert.equal(result.get('b'), BOOK_CHART_PALETTE[1]);
  assert.notEqual(result.get('a'), result.get('b'));
  assert.notEqual(result.get('a'), books[0].demo_color);
  assert.equal(result.has('c'), false);
});

test('chart colors are predictable even when book/session ordering changes', () => {
  const before = bookChartColors(books, sessions);
  const after = bookChartColors([...books].reverse(), [...sessions].reverse());
  assert.deepEqual([...before], [...after]);
});

test('more than sixteen active book series get distinct categorical colors', () => {
  assert.equal(new Set(BOOK_CHART_PALETTE).size, 16);
  const lots = Array.from({length: 32}, (_, i) => ({id: `id-${i}`, title: `Book ${i}`}));
  const colors = bookChartColors(lots, lots.map(b => ({user_book_id: b.id})));
  assert.equal(new Set(colors.values()).size, 32);
});

test('both Insights book charts and their legends use one map, separate from cover colors', () => {
  const js = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(js, /import\s*\{\s*bookChartColors\s*\}\s*from\s*'\.\/book-chart-colors\.js'/);
  assert.match(js, /bookChartColors\(books,\s*data\)/);
  assert.match(js, /chartColors\.get\(String\(b\.id\)\)/);
  assert.match(js, /bookChartColors\(allBooks,\s*entries\)/);
  assert.doesNotMatch(js.slice(js.indexOf('function activityChart('), js.indexOf('function heatmap(')), /demo_color|hashColor/);
});
