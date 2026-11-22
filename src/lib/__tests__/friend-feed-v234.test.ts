// Ported from legacy/tests/friend-feed-v234.test.mjs. Assertions unchanged.
import { test } from "vitest";
import assert from "node:assert/strict";
import { friendActivityFeed } from "@/lib/friend-feed";
const shares = [
  { owner_id: "bob", viewer_id: "me", access_level: "full" },
  { owner_id: "sue", viewer_id: "me", access_level: "summary" },
  { owner_id: "me", viewer_id: "sue", access_level: "full" },
];
const books = [
  {
    id: "b",
    user_id: "bob",
    title: "Dune",
    author: "Herbert",
    rating: 4.25,
    status: "finished",
    read_history: [
      { number: 1, status: "finished", started_on: "2022-08-01", finished_on: "2022-09-12" },
      { number: 2, status: "finished", started_on: "2026-11-11", finished_on: "2026-11-16" },
    ],
  },
  { id: "s", user_id: "sue", title: "Private Title", status: "reading", started_on: "2026-11-15" },
  { id: "m", user_id: "me", title: "My book", status: "reading", started_on: "2026-11-15" },
  {
    id: "by",
    user_id: "bob",
    title: "Year only",
    status: "finished",
    read_history: [{ number: 1, status: "finished", finished_year: 2021 }],
  },
];
const sessions = [
  {
    id: "ss",
    user_id: "bob",
    user_book_id: "b",
    session_date: "2026-11-15",
    duration_minutes: 30,
    activity_mode: "reading",
    read_number: 2,
    start_local_time: "07:45:00",
    notes: "private",
  },
  { id: "sp", user_id: "sue", user_book_id: "s", session_date: "2026-11-15", duration_minutes: 40 },
  { id: "sr", user_id: "bob", user_book_id: "s", session_date: "2026-11-15", duration_minutes: 40 },
  {
    id: "m",
    user_id: "me",
    user_book_id: "m",
    session_date: "2026-11-15",
    duration_minutes: 30,
    start_local_time: "19:30",
  },
  {
    id: "future",
    user_id: "bob",
    user_book_id: "b",
    session_date: "2026-11-25",
    duration_minutes: 90,
  },
];
const options = {
  viewerId: "me",
  shares,
  books,
  sessions,
  profiles: [
    { id: "me", display_name: "Me" },
    { id: "bob", display_name: "Bob" },
    { id: "sue", display_name: "Sue" },
  ],
  today: "2026-11-17",
};
test("only own and inbound Full shares appear; notes and summary-only books never appear", () => {
  const feed = friendActivityFeed(options);
  assert.equal(feed.fullShareCount, 1);
  assert.ok(feed.events.length >= 6);
  assert.deepEqual([...new Set(feed.events.map((e) => e.ownerId))].sort(), ["bob", "me"]);
  assert.ok(!JSON.stringify(feed).includes("Private Title"));
  assert.ok(!JSON.stringify(feed).includes("private"));
  assert.ok(feed.events.every((e) => e.date <= "2026-11-17"));
  assert.ok(!feed.events.some((e) => e.title === "Year only"));
  assert.ok(feed.events.some((e) => e.isOwn));
});
test("started/reread/session/finish events preserve dates, known local times, and current rating", () => {
  const feed = friendActivityFeed(options);
  const bob = feed.events.filter((e) => e.ownerId === "bob" && e.date.startsWith("2026"));
  assert.deepEqual(
    bob.map((e) => e.kind),
    ["finished", "session", "started"],
  );
  assert.equal(bob.find((e) => e.kind === "session").localTime, "07:45");
  assert.equal(bob.find((e) => e.kind === "session").minutes, 30);
  assert.equal(bob.find((e) => e.kind === "finished").localTime, undefined); // Don't invent a finish time
  assert.equal(bob.find((e) => e.kind === "finished").rating, 4.25);
  assert.equal(bob.find((e) => e.kind === "finished").readNumber, 2);
  const mine = feed.events.find((e) => e.sessionId === "m");
  assert.equal(mine.localTime, "19:30");
  assert.equal(mine.isOwn, true);
});
test("revoke and summary downgrade immediately remove only the friend, not own activity", () => {
  const downgraded = friendActivityFeed({
    ...options,
    shares: [{ owner_id: "bob", viewer_id: "me", access_level: "summary" }],
  });
  assert.ok(downgraded.events.every((e) => e.ownerId === "me"));
  assert.equal(downgraded.fullShareCount, 0);
  const revoked = friendActivityFeed({ ...options, shares: [] });
  assert.ok(revoked.events.every((e) => e.ownerId === "me"));
  assert.ok(revoked.total > 0);
});
test("timeline is limited, with a reliable load more signal", () => {
  const first = friendActivityFeed({ ...options, limit: 2 });
  assert.equal(first.events.length, 2);
  assert.equal(first.hasMore, true);
  assert.ok(first.total > 2);
  const full = friendActivityFeed({ ...options, limit: 100 });
  assert.equal(full.hasMore, false);
});
