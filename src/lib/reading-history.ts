/** Explicit per-book reading passes (initial read + rereads).
 * user_books.read_history is private library metadata, subject to existing RLS.
 * Legacy books contribute a single implicit pass; do not infer earlier rereads.
 */
import { inclusiveCalendarDays, readingSpeedStats } from "./reading-metrics";
import type { ActivityMode, BookInput, IsoDate, PassStatus, ReadPass, SessionInput } from "./types";

const VALID = /^\d{4}-\d{2}-\d{2}$/;
const date = (d: unknown): IsoDate | null => (typeof d === "string" && VALID.test(d) ? d : null);
const isFinished = (p: ReadPass) =>
  p.status === "finished" && (!!date(p.finished_on) || Number.isInteger(p.finished_year));

type RawPass = Partial<Record<keyof ReadPass, unknown>>;

/** A book returned with its explicit, canonical reading passes. */
export type WithPasses<B> = Omit<B, "read_history"> & { read_history: ReadPass[] };

export function readingPasses(book: BookInput | null | undefined): ReadPass[] {
  if (Array.isArray(book?.read_history) && book.read_history.length) {
    return (book.read_history as RawPass[])
      .filter((p) => p && Number.isInteger(p.number) && (p.number as number) >= 1)
      .map((p) => ({
        number: p.number as number,
        status: (p.status || "reading") as PassStatus,
        started_on: date(p.started_on),
        finished_on: date(p.finished_on),
        finished_year:
          p.status === "finished"
            ? date(p.finished_on)
              ? Number((p.finished_on as string).slice(0, 4))
              : Number.isInteger(Number(p.finished_year))
                ? Number(p.finished_year)
                : null
            : null,
      }))
      .sort((a, b) => a.number - b.number);
  }
  if (
    !book ||
    (!["reading", "finished", "dnf"].includes(book.status as string) &&
      !book.started_on &&
      !book.finished_on)
  ) {
    return [];
  }
  return [
    {
      number: 1,
      status: book.status === "finished" ? "finished" : book.status === "dnf" ? "dnf" : "reading",
      started_on: date(book.started_on),
      finished_on: book.status === "finished" ? date(book.finished_on) : null,
      finished_year:
        book.status === "finished" && date(book.finished_on)
          ? Number((book.finished_on as string).slice(0, 4))
          : null,
    },
  ];
}

export function currentReadNumber(book: BookInput | null | undefined): number {
  return readingPasses(book).at(-1)?.number || 1;
}

/** Backdated sessions are linked to the pass active on their recorded date.
 * Do not change the active reread's current-page progress for an older pass. */
export function readNumberForDate(
  book: BookInput | null | undefined,
  sessionDate: unknown,
): number {
  const list = readingPasses(book),
    day = date(sessionDate);
  if (!list.length || !day) return 1;
  // If a newer pass was entered without an exact start date, current sessions
  // belong to that active pass. Historical logs can still be assigned explicitly.
  const last = list.at(-1)!;
  if (list.length > 1 && last.status === "reading" && !last.started_on) return last.number;
  return (
    [...list].reverse().find((p) => p.started_on && p.started_on <= day)?.number || list[0].number
  );
}

export function beginReread<B extends BookInput>(book: B, localDate: unknown): WithPasses<B> {
  const day = date(localDate);
  if (!book || !["finished", "dnf"].includes(book.status as string) || !day) {
    throw new RangeError("Finish or DNF a book before starting a reread");
  }
  const history = readingPasses(book);
  if (!history.length) throw new RangeError("An initial read must exist");
  const last = history.at(-1)!;
  if (last.status === "reading") throw new RangeError("A reading pass is already active");
  const number = last.number + 1;
  return {
    ...book,
    read_history: [
      ...history,
      { number, status: "reading", started_on: day, finished_on: null, finished_year: null },
    ],
    status: "reading",
    started_on: day,
    finished_on: null,
    current_page: 0,
  };
}

/** Reflect a book's status/date edits in its explicit latest pass without
 * replacing dates of earlier completed passes. */
export function updateLatestPass<B extends BookInput>(
  previous: BookInput | null | undefined,
  updated: B,
): B | WithPasses<B> {
  if (!Array.isArray(previous?.read_history) || !previous.read_history.length) return updated;
  const history = readingPasses(previous);
  const last = history.at(-1)!;
  history[history.length - 1] = {
    ...last,
    status: updated.status as PassStatus,
    started_on: date(updated.started_on) || last.started_on,
    finished_on: updated.status === "finished" ? date(updated.finished_on) : null,
    finished_year:
      updated.status === "finished"
        ? date(updated.finished_on)
          ? Number((updated.finished_on as string).slice(0, 4))
          : last.finished_year
        : null,
  };
  return { ...updated, read_history: history };
}

export type ReadPassInput = {
  status?: unknown;
  started_on?: string | null;
  finished_on?: string | null;
  finished_year?: number | string | null;
};

function isCalendarDate(value: unknown): value is IsoDate {
  if (!date(value)) return false;
  const [y, m, d] = (value as string).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Convert owner-entered dated reading passes to canonical, ordered book metadata.
 * A year-only historical completion is stored as a year, never an invented day.
 * The latest pass determines the book's current shelf status and dates.
 * Does not rewrite or invent session duration, progress or activity types.
 */
export function editReadingHistory<B extends BookInput>(
  book: B,
  entries: ReadPassInput[],
): WithPasses<B> {
  if (!book || !Array.isArray(entries) || !entries.length || entries.length > 9999) {
    throw new RangeError("Add at least one reading pass.");
  }
  const normalized: ReadPass[] = entries.map((input, index) => {
    const status = String(input.status || "");
    if (!["reading", "finished", "dnf"].includes(status)) {
      throw new RangeError("Choose a valid status for each read-through.");
    }
    const start = input.started_on || null,
      finish = input.finished_on || null;
    if (start && !isCalendarDate(start))
      throw new RangeError("Enter a valid start date for read #" + (index + 1) + ".");
    if (finish && !isCalendarDate(finish))
      throw new RangeError("Enter a valid finish date for read #" + (index + 1) + ".");
    if (status !== "finished" && finish)
      throw new RangeError("Only finished read-throughs can have a finish date.");
    let finishedYear: number | null = null;
    if (status === "finished") {
      if (finish) finishedYear = Number(finish.slice(0, 4));
      else if (
        input.finished_year !== null &&
        input.finished_year !== "" &&
        input.finished_year !== undefined
      ) {
        finishedYear = Number(input.finished_year);
        if (!Number.isInteger(finishedYear) || finishedYear < 1500 || finishedYear > 2200) {
          throw new RangeError("Enter a valid four-digit completion year.");
        }
      }
      if (!finish && !finishedYear) {
        throw new RangeError(
          "Provide a finish date or year for finished read #" + (index + 1) + ".",
        );
      }
    }
    if (start && finish && start > finish)
      throw new RangeError("A read-through cannot finish before it starts.");
    if (start && finishedYear && Number(start.slice(0, 4)) > finishedYear) {
      throw new RangeError("Completion year cannot precede the start date.");
    }
    if (index < entries.length - 1 && status === "reading") {
      throw new RangeError("Only the most recent read-through may be in progress.");
    }
    return {
      number: index + 1,
      status: status as PassStatus,
      started_on: start,
      finished_on: status === "finished" ? finish : null,
      finished_year: finishedYear,
    };
  });
  for (let i = 1; i < normalized.length; i++) {
    const prev = normalized[i - 1],
      current = normalized[i];
    if (prev.started_on && current.started_on && current.started_on <= prev.started_on) {
      throw new RangeError("Each reread must start after the previous reading start.");
    }
    if (prev.finished_on && current.started_on && current.started_on <= prev.finished_on) {
      throw new RangeError("A reread must start after the previous finish date.");
    }
    if (
      prev.finished_year &&
      current.started_on &&
      Number(current.started_on.slice(0, 4)) < prev.finished_year
    ) {
      throw new RangeError("A reread cannot start before the original completion year.");
    }
    if (prev.finished_on && current.finished_on && current.finished_on <= prev.finished_on) {
      throw new RangeError("Reading passes must finish in chronological order.");
    }
    // A final in-progress pass without a start date is allowed: the user may
    // only know the old completion year; new logs go to the active pass.
  }
  const latest = normalized.at(-1)!;
  return {
    ...book,
    read_history: normalized,
    status: latest.status,
    started_on: latest.started_on,
    finished_on: latest.status === "finished" ? latest.finished_on : null,
  };
}

/** Plan explicit, optional corrections to already-saved sessions after a user
 * supplies known reread start dates. Unknown dates are never guessed. Only
 * sessions falling on or after a known reread start are proposed for change. */
export function rereadSessionCorrections<S extends SessionInput>(
  editedBook: BookInput,
  sessions: S[] = [],
) {
  const history = readingPasses(editedBook).filter((p) => p.number > 1 && p.started_on);
  if (!history.length) return [];
  return sessions
    .filter((s) => s.user_book_id === editedBook.id && date(s.session_date))
    .flatMap((s) => {
      const day = s.session_date as IsoDate;
      const target = [...history]
        .reverse()
        .find(
          (p) =>
            (p.started_on as IsoDate) <= day &&
            (!p.finished_on || day <= p.finished_on) &&
            (!p.finished_year || Number(day.slice(0, 4)) <= p.finished_year),
        );
      const existing = Number(s.read_number) || 1;
      return target && target.number !== existing
        ? [{ session: s, from: existing, to: target.number }]
        : [];
    });
}

/** Prevent a completed book from silently absorbing brand-new sessions into
 * its historical original read. An explicit reread is needed first. */
export function sessionPassError(
  book: BookInput,
  sessionDate: IsoDate,
  number: number,
): string | null {
  const pass = readingPasses(book).find((p) => p.number === number);
  if (!pass) return "Choose a valid reading pass.";
  if (pass.started_on && sessionDate < pass.started_on) {
    return "Session is earlier than the selected reading pass. Check its date.";
  }
  if (pass.finished_on && sessionDate > pass.finished_on) {
    return "This pass already finished. Add or choose a reread for newer sessions.";
  }
  if (
    !pass.finished_on &&
    pass.status === "finished" &&
    pass.finished_year &&
    Number(sessionDate.slice(0, 4)) > pass.finished_year
  ) {
    return "This read finished in an earlier year. Add a reread to log newer sessions.";
  }
  return null;
}

/** Goodreads and other historic completions count in their actual finish
 * year, independent of the date reliable SESSION logging began. The annual
 * challenge counts distinct titles (one per book), not individual rereads.
 * This deliberately does not fabricate reading sessions or elapsed time.
 */
export function completedBooksInYear<B extends BookInput>(books: B[], year: number | string): B[] {
  return books.filter((book) =>
    readingPasses(book).some(
      (p) =>
        isFinished(p) && Number(p.finished_year || p.finished_on?.slice(0, 4)) === Number(year),
    ),
  );
}

const positiveMinutes = (s: SessionInput) =>
  Number(s.duration_minutes) > 0 ? Number(s.duration_minutes) : 0;

export function rereadingStats(books: BookInput[] = [], sessions: SessionInput[] = []) {
  const entries = [];
  for (const book of books) {
    const passes = readingPasses(book),
      completed = passes.filter((p) => p.status === "finished");
    const rereads = passes.filter((p) => p.number > 1),
      finishedRereads = rereads.filter((p) => p.status === "finished");
    const logs = sessions.filter(
      (s) => s.user_book_id === book.id && Number(s.read_number || 1) > 1,
    );
    if (!rereads.length) continue;
    const last = passes.at(-1);
    entries.push({
      bookId: book.id,
      title: book.title as string,
      passes: passes.length,
      restarts: rereads.length,
      completedRereads: finishedRereads.length,
      currentlyRereading: last?.status === "reading" && (last?.number ?? 0) > 1,
      rereadMinutes: logs.reduce((n, s) => n + positiveMinutes(s), 0),
      rereadSessions: logs.length,
      firstFinish: completed[0]?.finished_on || completed[0]?.finished_year || null,
      lastFinish: completed.at(-1)?.finished_on || completed.at(-1)?.finished_year || null,
    });
  }
  entries.sort(
    (a, b) =>
      b.restarts - a.restarts ||
      b.rereadMinutes - a.rereadMinutes ||
      a.title.localeCompare(b.title),
  );
  const replay = sessions.filter(
    (s) => Number(s.read_number || 1) > 1 && books.some((b) => b.id === s.user_book_id),
  );
  return {
    booksReread: entries.length,
    rereadsStarted: entries.reduce((n, x) => n + x.restarts, 0),
    rereadsFinished: entries.reduce((n, x) => n + x.completedRereads, 0),
    currentlyRereading: entries.filter((x) => x.currentlyRereading).length,
    rereadMinutes: replay.reduce((n, s) => n + positiveMinutes(s), 0),
    rereadSessions: replay.length,
    entries,
  };
}

/** Actual, pass-specific comparisons. No data is inferred from book
 * length, audio runtime or Goodreads completion dates. The backend already
 * stores per-session read_number and per-book read_history; no new tables.
 */
const PASS_MODES: ActivityMode[] = ["reading", "audiobook", "read_listen"];
const PASS_LABELS: Record<ActivityMode, string> = {
  reading: "Reading Only",
  audiobook: "Audiobook Only",
  read_listen: "Read + Listen",
};
const safeMinutes = (s: SessionInput | null | undefined) => {
  const n = Number(s?.duration_minutes);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const safePages = (s: SessionInput | null | undefined) => {
  const raw: unknown = s?.pages_read;
  if (raw == null || raw === "") return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const passNumber = (s: SessionInput | null | undefined) => {
  const n = Number(s?.read_number);
  return Number.isInteger(n) && n > 0 ? n : 1;
};

export type PassPrimaryMode = ActivityMode | "mixed" | null;

export function readingPassMetrics(
  book: BookInput | null | undefined,
  sessions: SessionInput[] = [],
  { today }: { today?: IsoDate } = {},
) {
  const passes = readingPasses(book);
  const rows = Array.isArray(sessions) ? sessions.filter((s) => s.user_book_id === book?.id) : [];
  return passes.map((pass) => {
    const logs = rows.filter((s) => passNumber(s) === pass.number);
    const timed = logs.filter((s) => safeMinutes(s) > 0);
    const minutes = timed.reduce((n, s) => n + safeMinutes(s), 0);
    const pages = logs.reduce((n, s) => n + safePages(s), 0);
    const activity = PASS_MODES.map((id) => ({
      id,
      label: PASS_LABELS[id],
      minutes: timed
        .filter((s) => (s.activity_mode || "reading") === id)
        .reduce((n, s) => n + safeMinutes(s), 0),
    }));
    const strongest = Math.max(...activity.map((a) => a.minutes));
    // Tied leading modes are Mixed, rather than an arbitrary winner.
    const leaders = activity.filter((a) => a.minutes === strongest);
    const primaryMode: PassPrimaryMode =
      strongest === 0 ? null : leaders.length > 1 ? "mixed" : leaders[0].id;
    const modeShares = activity.map((a) => ({
      ...a,
      percent: minutes ? (100 * a.minutes) / minutes : 0,
    }));
    const days = [...new Set(logs.map((s) => s.session_date).filter((d) => date(d)))].sort();
    const until = pass.finished_on || (pass.status === "reading" && date(today) ? today : null);
    const elapsedDays = inclusiveCalendarDays(pass.started_on, until);
    const speed = readingSpeedStats(logs);
    return {
      ...pass,
      sessionCount: logs.length,
      activeDays: days.length,
      recordedMinutes: timed.length ? minutes : null,
      timedSessions: timed.length,
      timeComplete: logs.length > 0 && timed.length === logs.length,
      recordedPages: logs.some((s) => safePages(s) > 0) ? pages : null,
      primaryMode,
      modeShares,
      elapsedDays,
      minutesPerActiveDay: days.length && timed.length ? minutes / days.length : null,
      pagesPerActiveDay: days.length && pages ? pages / days.length : null,
      pagesPerHour: speed.pagesPerHour,
      measuredSpeedSessions: speed.measuredSessions,
    };
  });
}

export type PassMetrics = ReturnType<typeof readingPassMetrics>[number];

/** Compare EACH reread with the first read. Overall averages include only
 * completed pairs with full timed-session coverage for both passes.
 * The latest completed reread is used for averages when a newer pass is active. */
export function rereadComparisonStats(
  books: BookInput[] = [],
  sessions: SessionInput[] = [],
  { today }: { today?: IsoDate } = {},
) {
  const entries = [];
  for (const book of books) {
    const passes = readingPassMetrics(book, sessions, { today });
    if (passes.length < 2) continue;
    const original = passes[0],
      rereads = passes.slice(1);
    entries.push({
      bookId: book.id,
      title: book.title,
      original,
      rereads,
      latest: rereads.at(-1)!,
    });
  }
  const pairs = entries.map((e) => ({
    original: e.original,
    reread: e.latest,
    bookId: e.bookId,
    title: e.title,
  }));
  const completedPairs = entries
    .map((e) => ({
      original: e.original,
      reread: [...e.rereads].reverse().find((p) => p.status === "finished"),
      bookId: e.bookId,
      title: e.title,
    }))
    .filter((p): p is typeof p & { reread: PassMetrics } => Boolean(p.reread));
  const timedPairs = completedPairs.filter(
    (p) =>
      p.original.status === "finished" &&
      p.reread.status === "finished" &&
      p.original.timeComplete &&
      p.reread.timeComplete &&
      p.original.recordedMinutes !== null &&
      p.reread.recordedMinutes !== null,
  );
  const average = (values: number[]) =>
    values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const modePairs = pairs.filter(
    (p) =>
      p.original.primaryMode &&
      p.reread.primaryMode &&
      p.original.primaryMode !== "mixed" &&
      p.reread.primaryMode !== "mixed",
  );
  const switches = new Map<string, number>();
  for (const p of modePairs) {
    if (p.original.primaryMode === p.reread.primaryMode) continue;
    const key = p.original.primaryMode + ">" + p.reread.primaryMode;
    switches.set(key, (switches.get(key) || 0) + 1);
  }
  const mostCommonSwitch =
    [...switches].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || null;
  return {
    entries,
    pairs,
    pairedTimeCount: timedPairs.length,
    avgFirstMinutes: average(timedPairs.map((p) => p.original.recordedMinutes as number)),
    avgRereadMinutes: average(timedPairs.map((p) => p.reread.recordedMinutes as number)),
    avgFirstSessions: average(timedPairs.map((p) => p.original.sessionCount)),
    avgRereadSessions: average(timedPairs.map((p) => p.reread.sessionCount)),
    knownMethodPairs: modePairs.length,
    methodChanges: modePairs.filter((p) => p.original.primaryMode !== p.reread.primaryMode).length,
    mostCommonSwitch: mostCommonSwitch
      ? {
          from: mostCommonSwitch[0].split(">")[0],
          to: mostCommonSwitch[0].split(">")[1],
          count: mostCommonSwitch[1],
        }
      : null,
  };
}

export const passModeLabel = (mode: PassPrimaryMode | string | null | undefined): string =>
  mode === "mixed" ? "Mixed methods" : PASS_LABELS[mode as ActivityMode] || "Not recorded";
