import { expect, test } from "vitest";

import { planReadHistorySave } from "@/lib/read-history-plan";

const book = {
  id: "dune",
  status: "finished",
  started_on: "2022-01-01",
  finished_on: "2022-02-01",
  read_history: [
    { number: 1, status: "finished", started_on: "2022-01-01", finished_on: "2022-02-01" },
  ],
};
const session = (id: string, session_date: string, read_number = 1) => ({
  id,
  user_book_id: "dune",
  session_date,
  read_number,
  duration_minutes: 30,
});
const original = { status: "finished", started_on: "2022-01-01", finished_on: "2022-02-01" };

test("adding a dated reread moves later sessions into it, and only changes read_number", () => {
  const sessions = [
    session("a", "2022-01-15"),
    session("b", "2026-10-02"),
    session("c", "2026-10-09"),
  ];
  const plan = planReadHistorySave(
    book,
    sessions,
    [original, { status: "reading", started_on: "2026-10-01" }],
    { reassign: true },
  );
  if ("error" in plan) throw new Error(plan.error);
  expect(plan.passCount).toBe(2);
  expect(plan.corrections.map((c) => [c.session.id, c.from, c.to])).toEqual([
    ["b", 1, 2],
    ["c", 1, 2],
  ]);
  expect(plan.book.status).toBe("reading");
});

test("without reassignment no sessions move", () => {
  const plan = planReadHistorySave(
    book,
    [session("b", "2026-10-02")],
    [original, { status: "reading", started_on: "2026-10-01" }],
    { reassign: false },
  );
  expect("corrections" in plan && plan.corrections).toEqual([]);
});

test("a pass that still has sessions cannot be removed", () => {
  const twoPasses = {
    ...book,
    read_history: [
      ...book.read_history,
      { number: 2, status: "reading", started_on: "2026-10-01" },
    ],
  };
  const plan = planReadHistorySave(twoPasses, [session("b", "2026-10-02", 2)], [original], {
    reassign: true,
  });
  expect("error" in plan && plan.error).toMatch(/being removed/);
});

test("invalid histories are rejected with the legacy messages", () => {
  const plan = planReadHistorySave(
    book,
    [],
    [{ status: "reading" }, { status: "finished", finished_year: "2022" }],
    { reassign: true },
  );
  expect("error" in plan && plan.error).toMatch(/most recent read-through may be in progress/);
});

test("recheck-only keeps the saved passes and just plans moves", () => {
  const twoPasses = {
    ...book,
    status: "reading",
    read_history: [
      ...book.read_history,
      { number: 2, status: "reading", started_on: "2026-10-01" },
    ],
  };
  const plan = planReadHistorySave(twoPasses, [session("b", "2026-10-05", 1)], null, {
    reassign: false,
    assignmentOnly: true,
  });
  if ("error" in plan) throw new Error(plan.error);
  expect(plan.book).toBe(twoPasses);
  expect(plan.corrections.map((c) => c.to)).toEqual([2]);
});
