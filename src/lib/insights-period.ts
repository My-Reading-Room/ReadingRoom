// Calendar periods and small aggregates for Insights, ported from legacy
// periodSpec()/periodGroups()/streaks()/dailyGoalForYear()/pageTotals().
// Labels use a fixed locale and UTC so server and browser render identically.
import { weekEndSaturday, weekStartSunday } from "./calendar-week";
import type { GoalInput, IsoDate, SessionInput } from "./types";

export type InsightPeriod = "week" | "month" | "year";
export type PeriodSpec = { start: IsoDate; end: IsoDate; label: string; year: number };
export type PeriodGroup = { key: string; label: string; month: boolean };

const utc = (date: string) => new Date(`${date}T12:00:00Z`);
const fmt = (date: string, options: Intl.DateTimeFormatOptions) =>
  utc(date).toLocaleDateString("en-US", { timeZone: "UTC", ...options });

export const addDays = (date: IsoDate, n: number): IsoDate => {
  const d = utc(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Sunday on or before the date. */
export const weekStart = (date: IsoDate) => weekStartSunday(date);

export function datesBetween(start: IsoDate, end: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  for (let d = start; d <= end && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

export const shortDate = (date: IsoDate) =>
  fmt(date, { month: "short", day: "numeric", year: "numeric" });

export function periodSpec(period: InsightPeriod, today: IsoDate, year: number): PeriodSpec {
  if (period === "week") {
    const start = weekStartSunday(today),
      end = weekEndSaturday(today);
    return { start, end, label: `${shortDate(start)} – ${shortDate(end)}`, year };
  }
  if (period === "month") {
    const start = `${today.slice(0, 7)}-01`;
    const next = utc(start);
    next.setUTCMonth(next.getUTCMonth() + 1, 0);
    return {
      start,
      end: next.toISOString().slice(0, 10),
      label: fmt(start, { month: "long", year: "numeric" }),
      year,
    };
  }
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
    label: `January – December ${year}`,
    year,
  };
}

export function periodGroups(period: InsightPeriod, spec: PeriodSpec): PeriodGroup[] {
  if (period === "year") {
    return Array.from({ length: 12 }, (_, i) => {
      const key = `${spec.year}-${String(i + 1).padStart(2, "0")}`;
      return { key, label: fmt(`${key}-01`, { month: "short" }), month: true };
    });
  }
  return datesBetween(spec.start, spec.end).map((d) => ({
    key: d,
    label: period === "week" ? fmt(d, { weekday: "short" }) : String(Number(d.slice(-2))),
    month: false,
  }));
}

export const inGroup = (group: PeriodGroup, date: string | null | undefined) =>
  !!date && (group.month ? date.startsWith(group.key) : date === group.key);

/** Current and best run of consecutive days with a session, from the tracking start. */
export function streaks(sessions: SessionInput[], today: IsoDate, trackingStart: IsoDate | null) {
  const days = new Set(
    sessions
      .map((s) => s.session_date as IsoDate)
      .filter((d) => d && d <= today && (!trackingStart || d >= trackingStart)),
  );
  let cursor = days.has(today) ? today : addDays(today, -1),
    current = 0;
  while (days.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  let best = 0,
    run = 0,
    prev: IsoDate | null = null;
  for (const d of [...days].sort()) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return { current, best };
}

/** The year's saved daily target, carrying forward the latest earlier year; 30 by default. */
export function dailyGoalForYear(goals: GoalInput[], year: number): number {
  const valid = goals
    .filter(
      (g) =>
        Number(g.year) <= year &&
        Number.isInteger(Number(g.daily_minutes_target)) &&
        Number(g.daily_minutes_target) > 0,
    )
    .sort((a, b) => Number(b.year) - Number(a.year));
  return Number(valid[0]?.daily_minutes_target) || 30;
}

export const modeOf = (s: SessionInput) => s.activity_mode || "reading";
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
export const sumOf = (rows: SessionInput[], key: "duration_minutes" | "pages_read") =>
  rows.reduce((a, s) => a + num(s[key]), 0);

/** Audiobook-only pages are print-edition equivalents, never physical pages read. */
export const pageTotals = (rows: SessionInput[]) => ({
  physical: sumOf(
    rows.filter((s) => modeOf(s) !== "audiobook"),
    "pages_read",
  ),
  audioEquivalent: sumOf(
    rows.filter((s) => modeOf(s) === "audiobook"),
    "pages_read",
  ),
});

export const formatTime = (minutes: unknown) =>
  `${Math.floor(num(minutes) / 60)}h ${String(Math.round(num(minutes) % 60)).padStart(2, "0")}m`;
export const formatRatio = (v: number | null | undefined) =>
  v == null ? "—" : Number(v).toFixed(1);
