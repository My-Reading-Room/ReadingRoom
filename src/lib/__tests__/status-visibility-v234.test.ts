// Ported from legacy/tests/status-visibility-v234.test.mjs. Assertions unchanged,
// except assertions on app.js/style.css source text, which move to #12:
//   - reading status selector is prominent before metadata lookup, exactly once
//   - the app.js guard that blocks resuming a finished book without a reread
import { test } from "vitest";
import assert from "node:assert/strict";
import { updateLatestPass, beginReread } from "@/lib/reading-history";

test("finished books must use a new reread to resume instead of rewriting original", () => {
  const finished = {
    id: "dune",
    status: "finished",
    started_on: "2022-03-01",
    finished_on: "2022-06-01",
    read_history: [
      { number: 1, status: "finished", started_on: "2022-03-01", finished_on: "2022-06-01" },
    ],
  };
  const rerun = beginReread(finished, "2026-11-17");
  assert.equal(rerun.read_history.length, 2);
  assert.equal(rerun.read_history[0].finished_on, "2022-06-01");
  assert.equal(rerun.read_history[1].status, "reading");
  const updated = updateLatestPass(rerun, {
    ...rerun,
    status: "finished",
    finished_on: "2026-12-01",
  });
  assert.equal(updated.read_history[0].finished_on, "2022-06-01");
  assert.equal(updated.read_history[1].finished_on, "2026-12-01");
});
