/** Book-level calendar-day metrics; all dates are local YYYY-MM-DD calendar dates. */
import type { ActivityMode, BookInput, GoalHistoryRow, IsoDate, SessionInput } from "./types";

type ModeFilter = ActivityMode | "all";

function dayNumber(iso: unknown): number | null {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [year, month, day] = iso.split("-").map(Number);
  const utc = Date.UTC(year, month - 1, day);
  const date = new Date(utc);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null;
  return Math.floor(utc / 86400000);
}

export function inclusiveCalendarDays(start: unknown, finish: unknown): number | null {
  const a = dayNumber(start),
    b = dayNumber(finish);
  return a === null || b === null || b < a ? null : b - a + 1;
}

export type BookReadingDays = {
  readingDays: number;
  elapsedDays: number | null;
  consistency: number | null;
  startDate: IsoDate | null;
  endDate: IsoDate | null;
};

/**
 * Count actual days with one or more logged sessions for one book and the
 * inclusive calendar interval from Started to Finished (or to today if open).
 * Missing start date falls back to the first logged session. A finished book
 * lacking a finish date uses its final logged session as the finish date.
 * The optional activityMode changes only active days, not elapsed days.
 */
export function bookReadingDays(
  book: BookInput | null | undefined,
  sessions: SessionInput[] | null | undefined,
  { today, activityMode = "all" }: { today?: IsoDate; activityMode?: ModeFilter } = {},
): BookReadingDays {
  if (!book)
    return { readingDays: 0, elapsedDays: null, consistency: null, startDate: null, endDate: null };
  const all = (sessions || []).filter(
    (s) =>
      s.user_book_id === book.id &&
      dayNumber(s.session_date) !== null &&
      (!today || (s.session_date as IsoDate) <= today),
  );
  const ordered = all.map((s) => s.session_date as IsoDate).sort();
  const firstDay = ordered[0] || null,
    lastDay = ordered.at(-1) || null;
  const startDate = dayNumber(book.started_on) !== null ? (book.started_on as IsoDate) : firstDay;
  const finished = book.status === "finished" || Boolean(book.finished_on);
  const endDate =
    (dayNumber(book.finished_on) !== null
      ? (book.finished_on as IsoDate)
      : finished
        ? lastDay
        : today) || null;
  const elapsedDays = inclusiveCalendarDays(startDate, endDate);
  const dated = all.filter(
    (s) =>
      (activityMode === "all" || (s.activity_mode || "reading") === activityMode) &&
      (elapsedDays === null ||
        ((s.session_date as IsoDate) >= (startDate as IsoDate) &&
          (s.session_date as IsoDate) <= (endDate as IsoDate))),
  );
  const readingDays = new Set(dated.map((s) => s.session_date)).size;
  return {
    readingDays,
    elapsedDays,
    consistency: elapsedDays && elapsedDays > 0 ? readingDays / elapsedDays : null,
    startDate,
    endDate,
  };
}

export type ReadingSpeedStats = {
  pages: number;
  minutes: number;
  measuredSessions: number;
  excludedSessions: number;
  excludedMinutes: number;
  pagesPerHour: number | null;
};

/** Weighted page-progress speed, independent of session-count averages.
 *
 * A reading session has a verified page quantity when pages_read was explicitly
 * entered or was calculated from an exact, edition-specific chapter map. Audio-
 * only pages are print-edition equivalents, not physically read pages.
 * Time-only/audio-position-only sessions do not influence the denominator.
 * Read + Listen sessions count a single duration and a single page quantity.
 */
export function readingSpeedStats(
  sessions: SessionInput[] | null | undefined,
  { activityMode = "all", bookId = "all" }: { activityMode?: ModeFilter; bookId?: string } = {},
): ReadingSpeedStats {
  const selected = (Array.isArray(sessions) ? sessions : []).filter((session) => {
    const mode = session.activity_mode || "reading";
    return (
      (activityMode === "all" || mode === activityMode) &&
      (bookId === "all" || session.user_book_id === bookId)
    );
  });
  let pages = 0,
    minutes = 0,
    measuredSessions = 0,
    excludedSessions = 0,
    excludedMinutes = 0;
  for (const session of selected) {
    const m = Number(session.duration_minutes);
    const raw: unknown = session.pages_read;
    const p = raw == null || raw === "" ? NaN : Number(raw);
    if (Number.isFinite(m) && m > 0 && Number.isFinite(p) && p > 0) {
      minutes += m;
      pages += p;
      measuredSessions++;
    } else {
      excludedSessions++;
      if (Number.isFinite(m) && m > 0) excludedMinutes += m;
    }
  }
  return {
    pages,
    minutes,
    measuredSessions,
    excludedSessions,
    excludedMinutes,
    pagesPerHour: minutes > 0 ? (pages * 60) / minutes : null,
  };
}

export function readingSpeedByMode(
  sessions: SessionInput[] | null | undefined,
  options: { bookId?: string } = {},
) {
  return {
    overall: readingSpeedStats(sessions, { ...options, activityMode: "all" }),
    reading: readingSpeedStats(sessions, { ...options, activityMode: "reading" }),
    audiobook: readingSpeedStats(sessions, { ...options, activityMode: "audiobook" }),
    read_listen: readingSpeedStats(sessions, { ...options, activityMode: "read_listen" }),
  };
}

/**
 * Activity summary for one book within the caller-selected calendar window.
 * Multiple sessions on the same local YYYY-MM-DD count as separate sessions,
 * but contribute only one distinct reading day. The optional mode filter
 * accepts reading, audiobook, read_listen, or all. A read+listen log is one
 * session, not two. This is independent of the book-lifetime elapsed-day metric.
 */
export function bookActivitySummary(
  sessions: SessionInput[] | null | undefined,
  { bookId = "all", activityMode = "all" }: { bookId?: string; activityMode?: ModeFilter } = {},
) {
  const selected = (Array.isArray(sessions) ? sessions : []).filter(
    (session) =>
      (bookId === "all" || session.user_book_id === bookId) &&
      (activityMode === "all" || (session.activity_mode || "reading") === activityMode),
  );
  const validDays = selected
    .map((session) => session.session_date)
    .filter((date) => dayNumber(date) !== null);
  return {
    sessions: selected.length,
    readingDays: new Set(validDays).size,
    minutes: selected.reduce((sum, session) => {
      const n = Number(session.duration_minutes);
      return sum + (Number.isFinite(n) && n > 0 ? n : 0);
    }, 0),
    pages: selected.reduce((sum, session) => {
      const n = Number(session.pages_read);
      return sum + (session.pages_read != null && Number.isFinite(n) && n > 0 ? n : 0);
    }, 0),
  };
}

/** Dated daily goal settings are effective on their local calendar date.
 * Historical dates retain their original targets after later changes.
 */
export function dailyGoalTargetAt(
  goalHistory: GoalHistoryRow[] | null | undefined,
  date: IsoDate,
  fallbackMinutes: unknown = 30,
): number {
  const fallback = Number(fallbackMinutes);
  if (!Number.isInteger(fallback) || fallback < 1 || fallback > 1440) {
    throw new RangeError("Daily goal must be 1-1440 whole minutes");
  }
  if (dayNumber(date) === null) throw new RangeError("Valid local date required");
  let latest = "",
    target = fallback;
  for (const row of Array.isArray(goalHistory) ? goalHistory : []) {
    const effective = row.effective_date;
    const value = Number(row.target_minutes);
    if (dayNumber(effective) === null || !Number.isInteger(value) || value < 1 || value > 1440)
      continue;
    if (effective <= date && effective >= latest) {
      latest = effective;
      target = value;
    }
  }
  return target;
}

export type GoalSeriesPoint = {
  key: string;
  actualMinutes: number;
  targetMinutes: number;
  days: number;
  daysMet: number;
  future: boolean;
};

type GoalOptions = {
  targetMinutes?: number;
  goalHistory?: GoalHistoryRow[];
  today: IsoDate;
  periodStart?: IsoDate;
  periodEnd?: IsoDate;
  activeFrom?: IsoDate | null;
};

/** Produce daily or monthly values for actual minutes vs the dated goal reference.
 * Month references are the SUM of the actual per-day targets, not a flat
 * current-target multiplied across history. Future dates carry no actual or
 * target totals. All reading modes count once per logged session.
 */
export function dailyGoalTimeSeries(
  sessions: SessionInput[] | null | undefined,
  {
    targetMinutes = 30,
    goalHistory = [],
    today,
    periodStart,
    periodEnd,
    groupBy = "day",
    activeFrom = null,
  }: GoalOptions & { groupBy?: "day" | "month" },
): GoalSeriesPoint[] {
  if (!["day", "month"].includes(groupBy)) throw new RangeError("groupBy must be day or month");
  const now = dayNumber(today),
    start = dayNumber(periodStart),
    end = dayNumber(periodEnd);
  const minDay = dayNumber(activeFrom);
  if (now === null || start === null || end === null || end < start || end - start > 366) {
    throw new RangeError("Invalid calendar range");
  }
  const minutesByDay = new Map<IsoDate, number>();
  for (const session of Array.isArray(sessions) ? sessions : []) {
    const date = session.session_date,
      mins = Number(session.duration_minutes);
    if (
      dayNumber(date) === null ||
      (date as IsoDate) > today ||
      !Number.isFinite(mins) ||
      mins <= 0
    )
      continue;
    minutesByDay.set(date as IsoDate, (minutesByDay.get(date as IsoDate) || 0) + mins);
  }
  const results: GoalSeriesPoint[] = [],
    keyed = new Map<string, GoalSeriesPoint>();
  for (let day = start; day <= end; day++) {
    const date = new Date(day * 86400000).toISOString().slice(0, 10);
    const key = groupBy === "month" ? date.slice(0, 7) : date;
    if (!keyed.has(key)) {
      const point = { key, actualMinutes: 0, targetMinutes: 0, days: 0, daysMet: 0, future: true };
      keyed.set(key, point);
      results.push(point);
    }
    const row = keyed.get(key)!;
    if (day > now || (minDay !== null && day < minDay)) continue;
    const target = dailyGoalTargetAt(goalHistory, date, targetMinutes),
      actual = minutesByDay.get(date) || 0;
    row.future = false;
    row.days++;
    row.actualMinutes += actual;
    row.targetMinutes += target;
    if (actual >= target) row.daysMet++;
  }
  return results;
}

/** Calendar-day goal completion and streaks, using each date's original target.
 * A goal change affects the effective date and subsequent days, never older days.
 * A partially completed current day does not prematurely break yesterday's streak.
 */
export function dailyReadingGoalStats(
  sessions: SessionInput[] | null | undefined,
  {
    targetMinutes = 30,
    goalHistory = [],
    today,
    periodStart,
    periodEnd,
    activeFrom = null,
  }: GoalOptions,
) {
  const fallback = Number(targetMinutes);
  if (!Number.isInteger(fallback) || fallback < 1 || fallback > 1440) {
    throw new RangeError("Daily goal must be 1-1440 whole minutes");
  }
  const todayN = dayNumber(today);
  if (todayN === null) throw new RangeError("Valid today date required");
  const minDay = dayNumber(activeFrom);
  const byDay = new Map<IsoDate, number>();
  for (const entry of Array.isArray(sessions) ? sessions : []) {
    const day = dayNumber(entry.session_date),
      minutes = Number(entry.duration_minutes);
    if (day === null || day > todayN || !Number.isFinite(minutes) || minutes <= 0) continue;
    const date = entry.session_date as IsoDate;
    byDay.set(date, (byDay.get(date) || 0) + minutes);
  }
  const getDate = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10);
  const meets = (n: number) => {
    const d = getDate(n);
    return (byDay.get(d) || 0) >= dailyGoalTargetAt(goalHistory, d, fallback);
  };
  const rawFirst = dayNumber(periodStart) ?? (dayNumber(today.slice(0, 4) + "-01-01") as number);
  const first = minDay !== null ? Math.max(rawFirst, minDay) : rawFirst;
  const last = Math.min(todayN, dayNumber(periodEnd) ?? todayN);
  let daysMet = 0,
    evaluatedDays = 0;
  if (first <= last) {
    for (let d = first; d <= last; d++) {
      evaluatedDays++;
      if (meets(d)) daysMet++;
    }
  }
  const todayTarget = dailyGoalTargetAt(goalHistory, today, fallback),
    todayMinutes = byDay.get(today) || 0;
  const rawYearStart = dayNumber(today.slice(0, 4) + "-01-01") as number;
  const yearStart = minDay !== null ? Math.max(rawYearStart, minDay) : rawYearStart;
  let cursor = meets(todayN) ? todayN : todayN - 1,
    currentGoalStreak = 0;
  while (cursor >= yearStart && meets(cursor)) {
    currentGoalStreak++;
    cursor--;
  }
  let longestGoalStreak = 0,
    run = 0;
  for (let d = yearStart; d <= todayN; d++) {
    run = meets(d) ? run + 1 : 0;
    longestGoalStreak = Math.max(longestGoalStreak, run);
  }
  return {
    targetMinutes: todayTarget,
    todayMinutes,
    remainingMinutes: Math.max(0, todayTarget - todayMinutes),
    metToday: todayMinutes >= todayTarget,
    daysMet,
    evaluatedDays,
    percentDaysMet: evaluatedDays ? daysMet / evaluatedDays : null,
    currentGoalStreak,
    longestGoalStreak,
  };
}
