// Ported from legacy/tests/tracking-goal-boundary-v234.test.mjs. Assertions unchanged.
// Legacy source-text checks not ported (they inspected app.js, the service worker or legacy SQL):
//   - Supabase upgrade includes one per-account baseline field and no new content table
import { test } from "vitest";
import assert from "node:assert/strict";
import { anchoredGoalHistory } from "@/lib/tracking-start";
import { dailyGoalTargetAt, dailyGoalTimeSeries } from "@/lib/reading-metrics";
const history = [
  { effective_date: "2026-01-01", target_minutes: 30 },
  { effective_date: "2026-11-16", target_minutes: 60 },
];
test("moving tracking start back from Nov 16 to Nov 15 uses the 60 minute initial target", () => {
  const rows = anchoredGoalHistory(history, "2026-11-15", 60);
  assert.equal(dailyGoalTargetAt(rows, "2026-11-15"), 60);
  assert.equal(dailyGoalTargetAt(rows, "2026-11-16"), 60);
  assert.equal(dailyGoalTargetAt(rows, "2026-11-14"), 30);
  assert.equal(history.length, 2);
  const data = dailyGoalTimeSeries([], {
    goalHistory: rows,
    today: "2026-11-17",
    periodStart: "2026-11-15",
    periodEnd: "2026-11-17",
    activeFrom: "2026-11-15",
  });
  assert.deepEqual(
    data.map((x) => x.targetMinutes),
    [60, 60, 60],
  );
});
test("later real goal changes remain historical, same-day versions win", () => {
  const rows = anchoredGoalHistory(
    [...history, { effective_date: "2026-11-17", target_minutes: 45 }],
    "2026-11-15",
    60,
  );
  assert.equal(dailyGoalTargetAt(rows, "2026-11-17"), 45);
  const exact = anchoredGoalHistory(
    [{ effective_date: "2026-11-15", target_minutes: 25 }],
    "2026-11-15",
    60,
  );
  assert.equal(dailyGoalTargetAt(exact, "2026-11-15"), 25);
  assert.equal(exact.length, 1);
});
test("invalid settings cannot fabricate a goal-history version", () => {
  assert.equal(anchoredGoalHistory(history, "2026-11-15", 0), history);
  assert.equal(anchoredGoalHistory(history, "broken", 60), history);
});
