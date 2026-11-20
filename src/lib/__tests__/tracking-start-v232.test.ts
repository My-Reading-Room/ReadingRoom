// Ported from legacy/tests/tracking-start-v232.test.mjs. Assertions unchanged.
// Not ported: legacy source-text checks (app.js, service worker, legacy SQL, DemoRepo)
// and HTML-string view tests, which move to React component tests (#12):
//   - tracking dates are independent, persisted profile preferences in demo storage
//   - cloud settings PATCH only chosen profile fields and RLS still owns updates
//   - live app settings, year and month cutoffs are wired without changing the calendar average method
import { test } from "vitest";
import assert from "node:assert/strict";
import {
  isTrackingDate,
  profileTrackingStart,
  reportingStartDate,
  sessionsInReportingPeriod,
} from "@/lib/tracking-start";
import { dayOfWeekStats } from "@/lib/reading-habits";
import { dailyReadingGoalStats, dailyGoalTimeSeries } from "@/lib/reading-metrics";
import { completedBooksInYear } from "@/lib/reading-history";

const session = (date, minutes, book = "dune") => ({
  session_date: date,
  duration_minutes: minutes,
  user_book_id: book,
  activity_mode: "reading",
});

test("date selection is ISO local date, includes leap day, and cannot confuse two readers", () => {
  for (const x of ["2026-02-29", "2026-13-01", "11/17/2026", "2026-11-17T00:00:00Z", "", null])
    assert.equal(isTrackingDate(x), false);
  assert.equal(isTrackingDate("2024-02-29"), true);
  assert.equal(
    profileTrackingStart({ tracking_start_date: "2026-11-13", created_at: "2020-07-15T00:00:00Z" }),
    "2026-11-13",
  );
  assert.equal(profileTrackingStart({ created_at: "2020-07-15T00:00:00Z" }), "2020-07-15");
  assert.equal(profileTrackingStart({}), null);
  assert.equal(reportingStartDate("2026-11-15", "2026-11-17"), "2026-11-17");
  assert.equal(reportingStartDate("2026-11-15", "2026-11-01"), "2026-11-15");
});

test("Monday average has one eligible Monday, not three zeros from before tracking", () => {
  const sessions = [
    session("2026-11-02", 0),
    session("2026-11-09", 0),
    session("2026-11-16", 18),
    session("2026-11-18", 900),
  ];
  const baseline = dayOfWeekStats(sessions, {
    periodStart: "2026-11-01",
    periodEnd: "2026-11-30",
    today: "2026-11-17",
  });
  assert.equal(baseline.days[1].daysInPeriod, 3);
  assert.equal(baseline.days[1].avgMinutesPerDay, 6);
  const tracked = dayOfWeekStats(sessions, {
    periodStart: "2026-11-01",
    periodEnd: "2026-11-30",
    today: "2026-11-17",
    activeFrom: "2026-11-16",
  });
  assert.equal(tracked.days[1].daysInPeriod, 1);
  assert.equal(tracked.days[1].minutes, 18);
  assert.equal(tracked.days[1].avgMinutesPerDay, 18);
  assert.equal(tracked.days[0].daysInPeriod, 0);
  assert.equal(
    tracked.days.reduce((n, r) => n + r.daysInPeriod, 0),
    2,
  );
  // Changing the cutoff never mutates the raw historical records.
  assert.equal(sessions.length, 4);
});

test("Sunday-start week straddling tracking boundary skips the old days", () => {
  const sessions = [
    session("2026-11-15", 35),
    session("2026-11-16", 18),
    session("2026-11-17", 22),
    session("2026-11-21", 60),
  ];
  const filtered = sessionsInReportingPeriod(sessions, {
    periodStart: "2026-11-15",
    periodEnd: "2026-11-21",
    today: "2026-11-17",
    trackingStart: "2026-11-16",
  });
  assert.deepEqual(
    filtered.map((s) => s.session_date),
    ["2026-11-16", "2026-11-17"],
  );
  const week = dayOfWeekStats(filtered, {
    periodStart: "2026-11-15",
    periodEnd: "2026-11-21",
    today: "2026-11-17",
    activeFrom: "2026-11-16",
  });
  assert.equal(week.days[0].daysInPeriod, 0);
  assert.equal(week.days[1].minutes, 18);
  assert.equal(week.days[2].minutes, 22);
  assert.equal(week.weekdays.calendarDays, 2);
});

test("YTD and daily goal both start on tracking date, historical daily targets remain dated", () => {
  const rows = [session("2026-09-30", 45), session("2026-10-01", 18), session("2026-11-16", 30)];
  const goalHistory = [
    { effective_date: "2026-01-01", target_minutes: 20 },
    { effective_date: "2026-11-10", target_minutes: 30 },
  ];
  const selected = sessionsInReportingPeriod(rows, {
    periodStart: "2026-01-01",
    periodEnd: "2026-12-31",
    today: "2026-11-17",
    trackingStart: "2026-10-01",
  });
  assert.equal(selected.length, 2);
  const goals = dailyReadingGoalStats(rows, {
    targetMinutes: 20,
    goalHistory,
    today: "2026-11-17",
    periodStart: "2026-09-01",
    periodEnd: "2026-10-02",
    activeFrom: "2026-10-01",
  });
  assert.equal(goals.evaluatedDays, 2);
  assert.equal(goals.daysMet, 0);
  const series = dailyGoalTimeSeries(rows, {
    targetMinutes: 20,
    goalHistory,
    today: "2026-11-17",
    periodStart: "2026-09-29",
    periodEnd: "2026-10-02",
    activeFrom: "2026-10-01",
  });
  assert.deepEqual(
    series.map((d) => [d.days, d.actualMinutes, d.targetMinutes]),
    [
      [0, 0, 0],
      [0, 0, 0],
      [1, 18, 20],
      [1, 0, 20],
    ],
  );
  const later = dailyReadingGoalStats(rows, {
    targetMinutes: 20,
    goalHistory,
    today: "2026-11-17",
    periodStart: "2026-11-01",
    periodEnd: "2026-11-17",
    activeFrom: "2026-11-16",
  });
  assert.equal(later.evaluatedDays, 2);
  assert.equal(later.daysMet, 1);
  assert.equal(later.longestGoalStreak, 1);
});

test("a tracking date after the selected year results in zero evaluated days, without errors", () => {
  const w = dayOfWeekStats([], {
    periodStart: "2025-01-01",
    periodEnd: "2025-12-31",
    today: "2026-11-17",
    activeFrom: "2026-11-01",
  });
  assert.equal(
    w.days.reduce((n, x) => n + x.daysInPeriod, 0),
    0,
  );
  const g = dailyReadingGoalStats([], {
    today: "2026-11-17",
    periodStart: "2025-01-01",
    periodEnd: "2025-12-31",
    activeFrom: "2026-11-01",
  });
  assert.equal(g.evaluatedDays, 0);
});

test("historic completions remain counted even when session tracking begins later", () => {
  const books = [
    {
      title: "Dune",
      status: "finished",
      read_history: [
        { number: 1, status: "finished", finished_year: 2022, finished_on: null },
        { number: 2, status: "finished", finished_on: "2026-10-15" },
      ],
    },
    {
      title: "One more",
      status: "finished",
      read_history: [{ number: 1, status: "finished", finished_year: 2026, finished_on: null }],
    },
    {
      title: "Early year",
      status: "finished",
      read_history: [{ number: 1, status: "finished", finished_on: "2026-03-10" }],
    },
  ];
  assert.equal(completedBooksInYear(books, 2022).length, 1);
  // Legacy passed a tracking date as a third argument to show it is ignored;
  // completions are independent of the session-tracking start by design.
  assert.equal(completedBooksInYear(books, 2026).length, 3);
  assert.equal(completedBooksInYear(books, 2022).length, 1);
});
