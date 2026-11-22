// Ported from legacy/tests/goal-history.test.mjs. Assertions unchanged.
// Legacy source-text checks not ported (they inspected app.js, the service worker or legacy SQL):
//   - same-day demo edits replace that date only and persist across reload
//   - cloud migration enforces full-view read and owner-only today writes
import { test } from "vitest";
import assert from "node:assert/strict";
import {
  dailyGoalTargetAt,
  dailyGoalTimeSeries,
  dailyReadingGoalStats,
} from "@/lib/reading-metrics";

const history = [
  { effective_date: "2026-01-01", target_minutes: 20 },
  { effective_date: "2026-11-14", target_minutes: 45 },
];
const entries = [
  { session_date: "2026-11-12", duration_minutes: 20, activity_mode: "reading" },
  { session_date: "2026-11-13", duration_minutes: 17, activity_mode: "audiobook" },
  { session_date: "2026-11-13", duration_minutes: 3, activity_mode: "read_listen" },
  { session_date: "2026-11-14", duration_minutes: 40, activity_mode: "audiobook" },
  { session_date: "2026-11-15", duration_minutes: 45, activity_mode: "read_listen" },
  { session_date: "2026-11-16", duration_minutes: 30, activity_mode: "reading" },
  { session_date: "2026-11-17", duration_minutes: 300, activity_mode: "reading" }, // future
];

test("historical targets are immutable by date even when the current goal changes", () => {
  assert.equal(dailyGoalTargetAt(history, "2026-11-13"), 20);
  assert.equal(dailyGoalTargetAt(history, "2026-11-14"), 45);
  assert.equal(dailyGoalTargetAt(history, "2026-11-16"), 45);
  const modified = [...history, { effective_date: "2026-11-16", target_minutes: 60 }];
  assert.equal(dailyGoalTargetAt(modified, "2026-11-13"), 20);
  assert.equal(dailyGoalTargetAt(modified, "2026-11-14"), 45);
  assert.equal(dailyGoalTargetAt(modified, "2026-11-16"), 60);
  assert.equal(dailyGoalTargetAt([], "2026-11-13", 30), 30);
});

test("week plot preserves old goals while new days use new targets", () => {
  const series = dailyGoalTimeSeries(entries, {
    goalHistory: history,
    today: "2026-11-16",
    periodStart: "2026-11-09",
    periodEnd: "2026-11-22",
  });
  assert.equal(series.length, 14);
  assert.equal(series.find((x) => x.key === "2026-11-13")!.targetMinutes, 20);
  assert.equal(series.find((x) => x.key === "2026-11-13")!.actualMinutes, 20); // audio and combined counted once each
  assert.equal(series.find((x) => x.key === "2026-11-14")!.targetMinutes, 45);
  assert.equal(series.find((x) => x.key === "2026-11-14")!.actualMinutes, 40);
  assert.equal(series.find((x) => x.key === "2026-11-15")!.actualMinutes, 45);
  assert.equal(series.find((x) => x.key === "2026-11-17")!.future, true);
  assert.equal(series.find((x) => x.key === "2026-11-17")!.targetMinutes, 0);
});

test("monthly year chart sums historical daily targets, not current goal times total days", () => {
  const rows = dailyGoalTimeSeries(entries, {
    goalHistory: history,
    today: "2026-11-16",
    periodStart: "2026-11-01",
    periodEnd: "2026-12-31",
    groupBy: "month",
  });
  assert.deepEqual(
    rows.map((x) => x.key),
    ["2026-11", "2026-12"],
  );
  assert.equal(rows[0].days, 16);
  assert.equal(rows[0].targetMinutes, 13 * 20 + 3 * 45); // Nov 1-13 at 20, Nov 14-16 at 45
  assert.equal(rows[0].actualMinutes, 155);
  assert.equal(rows[0].daysMet, 3); // Nov 12,13,15
  assert.equal(rows[1].future, true);
  assert.equal(rows[1].targetMinutes, 0);
});

test("goal-based streaks and heatmap markers use the target from each day", () => {
  const stat = dailyReadingGoalStats(entries, {
    targetMinutes: 30,
    goalHistory: history,
    today: "2026-11-16",
    periodStart: "2026-11-12",
    periodEnd: "2026-11-16",
  });
  assert.equal(stat.targetMinutes, 45);
  assert.equal(stat.daysMet, 3);
  assert.equal(stat.evaluatedDays, 5);
  assert.equal(stat.longestGoalStreak, 2);
  assert.equal(stat.currentGoalStreak, 1); // yesterday met; today unfinished
  assert.equal(stat.remainingMinutes, 15);
});
