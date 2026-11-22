// Ported from legacy/tests/reading-history.test.mjs. Assertions unchanged.
import { test } from "vitest";
import assert from "node:assert/strict";
import {
  readingPasses,
  beginReread,
  currentReadNumber,
  readNumberForDate,
  updateLatestPass,
  completedBooksInYear,
  rereadingStats,
} from "@/lib/reading-history";
const original = {
  id: "a",
  title: "The Hobbit",
  status: "finished",
  started_on: "2025-04-01",
  finished_on: "2025-05-01",
  current_page: 310,
};
test("a second read preserves the original completion date and resets progress", () => {
  const reread = beginReread(original, "2026-11-16");
  assert.equal(reread.status, "reading");
  assert.equal(reread.current_page, 0);
  assert.equal(reread.finished_on, null);
  assert.equal(reread.read_history[0].finished_on, "2025-05-01");
  assert.equal(currentReadNumber(reread), 2);
  assert.equal(readNumberForDate(reread, "2025-04-18"), 1);
  assert.equal(readNumberForDate(reread, "2026-11-16"), 2);
  const done = updateLatestPass(reread, {
    ...reread,
    status: "finished",
    finished_on: "2026-12-01",
  });
  assert.equal(readingPasses(done)[1].finished_on, "2026-12-01");
  assert.equal(completedBooksInYear([done], 2025).length, 1);
  assert.equal(completedBooksInYear([done], 2026).length, 1);
  const stats = rereadingStats(
    [done],
    [
      { user_book_id: "a", read_number: 1, duration_minutes: 40 },
      { user_book_id: "a", read_number: 2, duration_minutes: 60 },
    ],
  );
  assert.equal(stats.booksReread, 1);
  assert.equal(stats.rereadsStarted, 1);
  assert.equal(stats.rereadsFinished, 1);
  assert.equal(stats.rereadMinutes, 60);
  assert.equal(stats.rereadSessions, 1);
});
test("legacy books are not falsely counted as rereads", () => {
  assert.equal(readingPasses(original).length, 1);
  assert.equal(rereadingStats([original], []).booksReread, 0);
  assert.throws(() => beginReread({ ...original, status: "reading" }, "2026-11-16"));
});
