// Ported from legacy/tests/reading-days-clock.test.mjs. Assertions unchanged.
import { test } from "vitest";
import assert from "node:assert/strict";
import { bookReadingDays, inclusiveCalendarDays } from "@/lib/reading-metrics";
import { ReadingClock, formatClock } from "@/lib/session-clock";

class Storage {
  map = new Map<string, string>();
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  getItem(key: string) {
    return this.map.get(key) || null;
  }
}

test("inclusive calendar days use local dates, including leap days", () => {
  assert.equal(inclusiveCalendarDays("2026-01-01", "2026-01-07"), 7);
  assert.equal(inclusiveCalendarDays("2024-02-28", "2024-03-01"), 3);
  assert.equal(inclusiveCalendarDays("2026-01-07", "2026-01-01"), null);
  assert.equal(inclusiveCalendarDays("2026-02-29", "2026-03-01"), null);
});

test("five reading days across seven elapsed days, repeated sessions count once", () => {
  const book = {
    id: "dune",
    status: "finished",
    started_on: "2026-01-01",
    finished_on: "2026-01-07",
  };
  const sessions = [
    { user_book_id: "dune", session_date: "2026-01-01", activity_mode: "reading" },
    { user_book_id: "dune", session_date: "2026-01-01", activity_mode: "audiobook" },
    { user_book_id: "dune", session_date: "2026-01-02", activity_mode: "reading" },
    { user_book_id: "dune", session_date: "2026-01-04", activity_mode: "read_listen" },
    { user_book_id: "dune", session_date: "2026-01-05", activity_mode: "audiobook" },
    { user_book_id: "dune", session_date: "2026-01-07", activity_mode: "reading" },
    { user_book_id: "different", session_date: "2026-01-03", activity_mode: "reading" },
  ];
  const all = bookReadingDays(book, sessions, { today: "2026-01-10" });
  assert.equal(all.readingDays, 5);
  assert.equal(all.elapsedDays, 7);
  assert.equal(Math.round(all.consistency! * 1000) / 10, 71.4);
  const audio = bookReadingDays(book, sessions, { today: "2026-01-10", activityMode: "audiobook" });
  assert.equal(audio.readingDays, 2);
  assert.equal(audio.elapsedDays, 7);
});

test("currently reading counts to today, no sessions counts zero reading days", () => {
  const book = { id: "a", status: "reading", started_on: "2026-01-01", finished_on: null };
  const answer = bookReadingDays(book, [], { today: "2026-01-07" });
  assert.equal(answer.elapsedDays, 7);
  assert.equal(answer.readingDays, 0);
  const notStarted = bookReadingDays({ id: "b", status: "tbr" }, [], { today: "2026-01-07" });
  assert.equal(notStarted.elapsedDays, null);
});

test("date fallback uses first and last sessions for completed books without dates", () => {
  const sessions = [
    { user_book_id: "x", session_date: "2026-01-01" },
    { user_book_id: "x", session_date: "2026-01-07" },
  ];
  const result = bookReadingDays({ id: "x", status: "finished" }, sessions, {
    today: "2026-07-01",
  });
  assert.equal(result.startDate, "2026-01-01");
  assert.equal(result.endDate, "2026-01-07");
  assert.equal(result.elapsedDays, 7);
  assert.equal(result.readingDays, 2);
});

test("wall-clock stopwatch survives pauses, background gaps and reloads", () => {
  const storage = new Storage(),
    a = new ReadingClock(storage);
  a.setOwner("reader-a");
  a.start(100000);
  assert.equal(a.elapsedMs(130000), 30000);
  a.pause(160000);
  assert.equal(a.elapsedMinutes(160000), 1);
  a.start(170000);
  const b = new ReadingClock(storage);
  b.setOwner("reader-a");
  assert.equal(b.elapsedMs(210000), 100000);
  assert.equal(b.elapsedMinutes(210000), 2);
  b.pause(210000);
  assert.equal(b.running, false);
  b.setOwner("reader-b");
  assert.equal(b.elapsedMinutes(210000), 0);
  b.setOwner("reader-a");
  assert.equal(b.elapsedMs(210000), 100000);
});

test("stopwatch formats elapsed time and resets cleanly", () => {
  const c = new ReadingClock(new Storage());
  c.setOwner("reader");
  c.start(100000);
  assert.equal(c.display(161000), "00:01:01");
  c.pause(161000);
  assert.equal(c.elapsedMinutes(161000), 2);
  c.reset();
  assert.equal(c.display(), "00:00:00");
  assert.equal(formatClock(61000), "00:01:01");
});
