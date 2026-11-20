// Ported from legacy/tests/reading-habits.test.mjs. Assertions unchanged.
// Not ported: legacy source-text checks (app.js, service worker, legacy SQL, DemoRepo)
// and HTML-string view tests, which move to React component tests (#12):
//   - v1.8 SQL keeps all new fields inside owner/full-share RLS tables
import { test } from "vitest";
import assert from "node:assert/strict";
import {
  TIME_OF_DAY,
  timeOfDayStats,
  splitTimedSession,
  dayOfWeekStats,
  weekdayTimeHeatmap,
  WEEKDAYS,
  sessionLengthStats,
  activityDistribution,
  completionEfficiency,
  libraryStatistics,
  genreSpeedStats,
} from "@/lib/reading-habits";

const row = (d, m, clock = "07:00", mode = "reading", pages = 20, book = "a") => ({
  user_book_id: book,
  session_date: d,
  duration_minutes: m,
  start_local_time: clock,
  activity_mode: mode,
  pages_read: pages,
});

test("five exclusive 24-hour time buckets split at 11:00, 13:00, 17:00 and 20:00", () => {
  const chunks = splitTimedSession(row("2026-11-16", 60, "10:30"));
  assert.deepEqual(
    chunks.map((x) => [x.bucket, x.minutes]),
    [
      ["morning", 30],
      ["midday", 30],
    ],
  );
  const data = timeOfDayStats([
    row("2026-11-16", 60, "10:30"),
    row("2026-11-16", 25, null, "audiobook", null),
  ]);
  assert.equal(data.knownMinutes, 60);
  assert.equal(data.unknownMinutes, 25);
  assert.equal(data.buckets.find((b) => b.id === "morning").minutes, 30);
  assert.equal(data.buckets.find((b) => b.id === "midday").minutes, 30);
  assert.equal(data.buckets.find((b) => b.id === "morning").pagesPerHour, 20); // Session assigned to start band for speed
  assert.equal(data.buckets.find((b) => b.id === "midday").pagesPerHour, null);
});
test("night spans midnight into next day and preserves full duration", () => {
  const chunks = splitTimedSession(row("2026-11-15", 120, "23:30"));
  assert.deepEqual(
    chunks.map((x) => [x.date, x.bucket, x.minutes]),
    [
      ["2026-11-15", "night", 30],
      ["2026-11-16", "night", 90],
    ],
  );
  assert.equal(
    chunks.reduce((a, b) => a + b.minutes, 0),
    120,
  );
});
test("session time data stays unknown unless actual HH:MM start provided", () => {
  const entries = [
    row("2026-11-16", 50, "", "reading", 15),
    row("2026-11-16", 30, null, "audiobook", null),
    row("2026-11-16", 20, "invalid", "read_listen", 25),
  ];
  const x = timeOfDayStats(entries);
  assert.equal(x.unknownMinutes, 100);
  assert.equal(x.knownMinutes, 0);
  assert.equal(weekdayTimeHeatmap(entries).unknownMinutes, 100);
});
test("time-of-day heatmap maps days and split periods", () => {
  const h = weekdayTimeHeatmap([row("2026-11-16", 90, "10:30")]); // Monday
  assert.equal(h.rows[1].cells.find((x) => x.id === "morning").minutes, 30);
  assert.equal(h.rows[1].cells.find((x) => x.id === "midday").minutes, 60);
  assert.equal(
    h.rows[0].cells.reduce((a, x) => a + x.minutes, 0),
    0,
  );
});
test("weekday and weekend averages include all calendar days, not only days with sessions", () => {
  const entries = [row("2026-11-14", 60), row("2026-11-16", 20), row("2026-11-16", 10)];
  const x = dayOfWeekStats(entries, {
    periodStart: "2026-11-09",
    periodEnd: "2026-11-16",
    today: "2026-11-16",
  });
  assert.equal(x.weekdays.calendarDays, 6);
  assert.equal(x.weekends.calendarDays, 2);
  assert.equal(x.weekdays.minutes, 30);
  assert.equal(x.weekends.minutes, 60);
  assert.equal(x.weekdays.avgMinutesPerDay, 5);
  assert.equal(x.weekends.avgMinutesPerDay, 30);
  assert.equal(x.days[1].activeDays, 1);
  assert.equal(x.days[1].sessions, 2);
});
test("session length percentiles and mode distribution do not double count combined", () => {
  const entries = [
    row("2026-11-16", 10, "07:00", "reading"),
    row("2026-11-16", 20, "12:00", "audiobook"),
    row("2026-11-16", 40, "18:00", "read_listen"),
  ];
  const a = sessionLengthStats(entries);
  assert.equal(a.avgMinutes, 70 / 3);
  assert.equal(a.medianMinutes, 20);
  assert.equal(a.longestMinutes, 40);
  assert.deepEqual(
    a.buckets.map((x) => x.count),
    [1, 1, 1, 0, 0],
  );
  const dist = activityDistribution(entries);
  assert.equal(dist.totalMinutes, 70);
  assert.equal(dist.totalSessions, 3);
  assert.equal(dist.buckets.find((x) => x.id === "read_listen").minutes, 40);
});
test("efficiency uses distinct dates and actual logged pages only", () => {
  const books = [
    {
      id: "a",
      title: "A",
      status: "finished",
      started_on: "2026-01-01",
      finished_on: "2026-01-07",
    },
  ];
  const entries = [
    row("2026-01-01", 60, "07:00", "reading", 30),
    row("2026-01-01", 30, "19:00", "read_listen", 20),
    row("2026-01-04", 60, "14:00", "audiobook", null),
  ];
  const x = completionEfficiency(books, entries, { today: "2026-01-07" })[0];
  assert.equal(x.readingDays, 2);
  assert.equal(x.elapsedDays, 7);
  assert.equal(x.sessions, 3);
  assert.equal(x.minutesPerActiveDay, 75);
  assert.equal(x.pagesPerActiveDay, 25);
});
test("genre ratings use quarter stars; TBR aging prefers documented date and tracks unknown", () => {
  const books = [
    {
      id: "a",
      status: "tbr",
      title: "First",
      genres: ["Fantasy", "Adventure"],
      rating: 4.25,
      tbr_added_on: "2026-11-06",
      created_at: "2020-01-01T12:00:00Z",
    },
    {
      id: "b",
      status: "tbr",
      title: "Second",
      genres: ["Fantasy"],
      rating: 4.75,
      created_at: "2026-11-01T00:00:00Z",
    },
    { id: "c", status: "tbr", title: "Third", genres: [], rating: null },
    { id: "d", status: "finished", title: "Fourth", genres: ["Science fiction"], rating: 3.25 },
  ];
  const r = libraryStatistics(books, { today: "2026-11-16" });
  assert.equal(r.genres.find((x) => x.genre === "Fantasy").books, 2);
  assert.equal(r.genres.find((x) => x.genre === "Fantasy").avgRating, 4.5);
  assert.equal(r.averageRating, (4.25 + 4.75 + 3.25) / 3);
  assert.equal(r.tbr.known, 2);
  assert.equal(r.tbr.unknown, 1);
  assert.equal(r.tbr.oldest[0].title, "Second");
  assert.equal(r.tbr.averageAgeDays, 12.5);
});

test("five time bands use 24-hour HH:MM boundaries and handle evening to night", () => {
  assert.equal(TIME_OF_DAY.length, 5);
  assert.deepEqual(
    TIME_OF_DAY.map((t) => t.hours),
    ["05:00–10:59", "11:00–12:59", "13:00–16:59", "17:00–19:59", "20:00–04:59"],
  );
  assert.deepEqual(
    splitTimedSession(row("2026-11-16", 180, "16:30")).map((p) => [p.bucket, p.minutes]),
    [
      ["afternoon", 30],
      ["evening", 150],
    ],
  );
});
test("genre speed is a weighted, non-duplicative primary-genre rate by mode", () => {
  const books = [
    { id: "a", genres: ["Fantasy", "Adventure"] },
    { id: "b", genres: ["Fantasy", "Adventure"] },
    { id: "c", genres: ["Thriller"] },
  ];
  const s = [
    row("2026-11-16", 60, "10:00", "reading", 30, "a"),
    row("2026-11-16", 30, "12:00", "reading", 30, "b"),
    row("2026-11-16", 30, "13:00", "audiobook", 40, "a"),
    row("2026-11-16", 45, "19:00", "audiobook", null, "c"),
  ];
  const all = genreSpeedStats(books, s),
    fantasy = all.find((x) => x.genre === "Fantasy");
  assert.equal(fantasy.bookCount, 2);
  assert.equal(fantasy.pagesPerHour, 50);
  assert.equal(fantasy.measuredSessions, 3);
  assert.equal(
    all.some((x) => x.genre === "Adventure"),
    false,
  );
  assert.equal(genreSpeedStats(books, s, { activityMode: "reading" })[0].pagesPerHour, 40);
  assert.equal(genreSpeedStats(books, s, { activityMode: "audiobook" })[0].pagesPerHour, 80);
  assert.throws(() => genreSpeedStats(books, s, { activityMode: "banana" }));
});

test("Sunday is index zero in weekday charts and cross-midnight routine heatmap", () => {
  assert.deepEqual(WEEKDAYS, ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  const sunday = row("2026-11-15", 25, "08:00");
  const saturday = row("2026-11-21", 20, "21:00");
  const monday = row("2026-11-16", 30, "09:00");
  const day = dayOfWeekStats([sunday, saturday, monday], {
    periodStart: "2026-11-15",
    periodEnd: "2026-11-21",
    today: "2026-11-21",
  });
  assert.deepEqual(
    day.days.map((x) => x.name),
    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  );
  assert.deepEqual(
    day.days.map((x) => x.daysInPeriod),
    [1, 1, 1, 1, 1, 1, 1],
  );
  assert.deepEqual(
    day.days.map((x) => x.minutes),
    [25, 30, 0, 0, 0, 0, 20],
  );
  assert.equal(day.weekdays.calendarDays, 5);
  assert.equal(day.weekends.calendarDays, 2);
  assert.equal(day.weekends.minutes, 45);
  assert.equal(day.weekdays.minutes, 30);
  const heat = weekdayTimeHeatmap([row("2026-11-14", 120, "23:30")]);
  assert.equal(heat.rows[6].cells.find((x) => x.id === "night").minutes, 30);
  assert.equal(heat.rows[0].cells.find((x) => x.id === "night").minutes, 90);
});
