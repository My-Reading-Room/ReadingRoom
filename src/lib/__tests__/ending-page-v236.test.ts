// Ported from legacy/tests/ending-page-v236.test.mjs. Assertions unchanged.
// Legacy source-text checks not ported (they inspected app.js, the service worker or legacy SQL):
//   - cloud schema migration adds nullable page snapshots and validates the delta without disturbing RLS
import { test } from "vitest";
import assert from "node:assert/strict";
import { sessionPageStart, pagesFromEndingPage } from "@/lib/session-page-progress";

const book = { id: "dune", current_page: 120, page_count: 604 };
const rows = [
  {
    id: "old",
    user_book_id: "dune",
    read_number: 1,
    session_date: "2026-11-15",
    pages_read: 12,
    log_type: "pages",
  },
];

test("normal session uses the book details current page and records the exact difference", () => {
  const context = sessionPageStart(book, rows, {
    date: "2026-11-17",
    readNumber: 1,
    currentPass: 1,
  });
  assert.equal(context.startPage, 120);
  assert.equal(context.source, "book");
  assert.deepEqual(pagesFromEndingPage(context.startPage, 154, book.page_count), {
    pages: 34,
    error: null,
  });
  assert.equal(rows[0].pages_read, 12); // No retroactive rewrite of old sessions.
});

test("ending-page input rejects empty, repeated, backwards, fractional or beyond-edition pages", () => {
  for (const ending of ["", 120, 119, 120.5, 605, -4, "oops"]) {
    assert.match(pagesFromEndingPage(120, ending, 604).error!, /page|whole-number|edition/i);
  }
  assert.match(pagesFromEndingPage(null, 150, 604).error!, /Starting page is unknown/);
  assert.deepEqual(pagesFromEndingPage(0, "1", null), { pages: 1, error: null });
  assert.deepEqual(pagesFromEndingPage(125, "160", null), { pages: 35, error: null });
});

test("backdated entries use the previous saved ending page, never today's position", () => {
  const recorded = [
    {
      user_book_id: "dune",
      read_number: 1,
      session_date: "2026-11-12",
      start_page: 0,
      end_page: 35,
    },
    {
      user_book_id: "dune",
      read_number: 1,
      session_date: "2026-11-18",
      start_page: 70,
      end_page: 85,
    },
  ];
  const context = sessionPageStart(book, recorded, {
    date: "2026-11-15",
    readNumber: 1,
    currentPass: 1,
  });
  assert.equal(context.startPage, 35);
  assert.equal(context.source, "previous-session");
  assert.equal(context.hasLaterSessions, true);
  assert.equal(context.nextStartPage, 70);
  assert.equal(pagesFromEndingPage(35, 60, 604, context.nextStartPage).pages, 25);
  assert.match(pagesFromEndingPage(35, 72, 604, context.nextStartPage).error!, /overlap/);
});

test("unknown historical positions are never fabricated from legacy pages_read", () => {
  const context = sessionPageStart(book, rows, {
    date: "2026-11-16",
    readNumber: 1,
    currentPass: 2,
  });
  assert.equal(context.startPage, null);
  assert.equal(context.source, "unknown");
  assert.ok(pagesFromEndingPage(context.startPage, 130, 604).error);
  assert.equal(pagesFromEndingPage(15, 130, 604).pages, 115); // User can provide baseline.
});

test("reread resets the starting position, independent of the first read", () => {
  const context = sessionPageStart({ ...book, current_page: 0 }, rows, {
    date: "2026-11-17",
    readNumber: 2,
    currentPass: 2,
  });
  assert.equal(context.startPage, 0);
  assert.equal(pagesFromEndingPage(context.startPage, 40, 604).pages, 40);
  const oldPass = sessionPageStart({ ...book, current_page: 40 }, rows, {
    date: "2026-11-13",
    readNumber: 1,
    currentPass: 2,
  });
  assert.equal(oldPass.startPage, 0); // Before the first dated session in the original pass.
});

test("within one date, the last logged ending page is used on a past reading pass", () => {
  const sessions = [
    {
      user_book_id: "dune",
      read_number: 1,
      session_date: "2025-01-10",
      start_page: 0,
      end_page: 30,
      created_at: "2025-01-10T09:00:00Z",
    },
    {
      user_book_id: "dune",
      read_number: 1,
      session_date: "2025-01-10",
      start_page: 30,
      end_page: 55,
      created_at: "2025-01-10T18:00:00Z",
    },
  ];
  const context = sessionPageStart(book, sessions, {
    date: "2025-01-10",
    readNumber: 1,
    currentPass: 2,
  });
  assert.equal(context.startPage, 55);
});
