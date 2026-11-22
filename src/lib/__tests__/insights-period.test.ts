import { expect, test } from "vitest";

import {
  addDays,
  dailyGoalForYear,
  formatTime,
  pageTotals,
  periodGroups,
  periodSpec,
  streaks,
} from "@/lib/insights-period";

test("week runs Sunday to Saturday; month covers the calendar month", () => {
  expect(periodSpec("week", "2026-11-20", 2026)).toMatchObject({
    start: "2026-11-15",
    end: "2026-11-21",
  });
  expect(periodSpec("month", "2026-02-10", 2026)).toMatchObject({
    start: "2026-02-01",
    end: "2026-02-28",
    label: "February 2026",
  });
  expect(periodSpec("month", "2028-02-10", 2028).end).toBe("2028-02-29");
  expect(periodSpec("year", "2026-11-20", 2024)).toMatchObject({
    start: "2024-01-01",
    end: "2024-12-31",
  });
});

test("groups: 7 weekdays, every day of the month, 12 months", () => {
  const week = periodGroups("week", periodSpec("week", "2026-11-20", 2026));
  expect(week.map((g) => g.label)).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  expect(periodGroups("month", periodSpec("month", "2026-11-20", 2026))).toHaveLength(30);
  const year = periodGroups("year", periodSpec("year", "2026-11-20", 2026));
  expect(year[0]).toEqual({ key: "2026-01", label: "Jan", month: true });
});

test("addDays crosses month, year and DST boundaries", () => {
  expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
  expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
});

test("streaks count from today or yesterday and respect the tracking start", () => {
  const s = (d: string) => ({ session_date: d });
  const rows = ["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-18", "2026-11-19"].map(s);
  expect(streaks(rows, "2026-11-20", null)).toEqual({ current: 2, best: 3 });
  expect(streaks(rows, "2026-11-21", null).current).toBe(0);
  expect(streaks(rows, "2026-11-20", "2026-11-11")).toEqual({ current: 2, best: 2 });
  expect(streaks([s("2026-11-25")], "2026-11-20", null)).toEqual({ current: 0, best: 0 });
});

test("daily goal carries forward the latest earlier year", () => {
  const goals = [
    { year: 2024, daily_minutes_target: 20 },
    { year: 2025, daily_minutes_target: 45 },
  ];
  expect(dailyGoalForYear(goals, 2026)).toBe(45);
  expect(dailyGoalForYear(goals, 2024)).toBe(20);
  expect(dailyGoalForYear(goals, 2023)).toBe(30);
});

test("audiobook pages are equivalents, not physical pages", () => {
  const t = pageTotals([
    { activity_mode: "reading", pages_read: 30 },
    { activity_mode: "audiobook", pages_read: 50 },
    { activity_mode: "read_listen", pages_read: 10 },
    { pages_read: 5 },
  ]);
  expect(t).toEqual({ physical: 45, audioEquivalent: 50 });
  expect(formatTime(125)).toBe("2h 05m");
});
