// Ported from legacy/tests/local-start-time-v241.test.mjs. Assertions unchanged.
// Legacy source-text checks not ported (they inspected app.js, the service worker or legacy SQL):
//   - start-time remains an editable field, saves local time and never invents older times
import { test } from "vitest";
import assert from "node:assert/strict";
import {
  wallClockHHMM,
  wallClockDay,
  suggestedLocalSessionTime,
} from "@/lib/session-start-suggestion";

test("opening a new log suggests local device start time, not a UTC clock time", () => {
  const local = new Date(2026, 10, 18, 19, 7, 22);
  assert.equal(wallClockDay(local), "2026-11-18");
  assert.equal(wallClockHHMM(local), "19:07");
  assert.equal(suggestedLocalSessionTime({ date: "2026-11-18", now: local }), "19:07");
  assert.equal(suggestedLocalSessionTime({ date: "2026-11-17", now: local }), "");
});

test("timer start time is suggested when its start belongs to today, otherwise use the opening time", () => {
  const now = new Date(2026, 10, 18, 20, 10),
    earlier = new Date(2026, 10, 18, 19, 15);
  const yesterday = new Date(2026, 10, 17, 19, 15);
  assert.equal(
    suggestedLocalSessionTime({ date: "2026-11-18", now, clockStartedAtMs: earlier.getTime() }),
    "19:15",
  );
  assert.equal(
    suggestedLocalSessionTime({ date: "2026-11-18", now, clockStartedAtMs: yesterday.getTime() }),
    "20:10",
  );
  assert.equal(
    suggestedLocalSessionTime({ date: "2026-11-17", now, clockStartedAtMs: earlier.getTime() }),
    "",
  );
});
