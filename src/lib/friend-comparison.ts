/** Side-by-side, permission-scoped Insights for two readers.
 * Full-profile shares only: the caller must not expose detailed rows under
 * Summary-only. The Supabase RLS policy independently enforces this boundary.
 * Metrics reuse the same pure calculations as the owner's Insights screen.
 */
import {
  TIME_OF_DAY,
  WEEKDAYS,
  activityDistribution,
  completionEfficiency,
  dayOfWeekStats,
  genreSpeedStats,
  libraryStatistics,
  sessionLengthStats,
  timeOfDayStats,
  weekdayTimeHeatmap,
} from "./reading-habits";
import { completedBooksInYear, rereadComparisonStats, rereadingStats } from "./reading-history";
import {
  bookActivitySummary,
  dailyGoalTimeSeries,
  dailyReadingGoalStats,
  readingSpeedByMode,
} from "./reading-metrics";
import {
  anchoredGoalHistory,
  profileTrackingStart,
  sessionsInReportingPeriod,
} from "./tracking-start";
import type {
  BookInput,
  GoalHistoryRow,
  GoalInput,
  IsoDate,
  ProfileInput,
  ProfileSummary,
  SessionInput,
  ShareInput,
} from "./types";

export type ComparisonPeriod = {
  start: IsoDate;
  end: IsoDate;
  today: IsoDate;
  year?: number | string;
  mode?: "week" | "month" | "year";
};

type Dataset = {
  books?: BookInput[];
  sessions?: SessionInput[];
  profiles?: ProfileInput[];
  goals?: GoalInput[];
  goalHistory?: GoalHistoryRow[];
};

const numeric = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const validMinutes = (row: SessionInput | null | undefined) => {
  const n = Number(row?.duration_minutes);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const validPages = (row: SessionInput | null | undefined) =>
  row?.pages_read != null && Number.isFinite(Number(row.pages_read)) && Number(row.pages_read) > 0
    ? Number(row.pages_read)
    : 0;
const modeOf = (s: SessionInput) =>
  ["audiobook", "read_listen"].includes(s.activity_mode as string) ? s.activity_mode : "reading";

export const comparableBookKey = (b: BookInput | null | undefined): string | null => {
  const normalize = (v: unknown) =>
    String(v || "")
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const title = normalize(b?.title),
    author = normalize(b?.author);
  return title && author ? title + "|" + author : null;
};

const daysBetween = (date: IsoDate, days: number) =>
  new Date((Date.parse(date + "T00:00:00Z") / 86400000 + days) * 86400000)
    .toISOString()
    .slice(0, 10);

function daysOfPeriod(start: IsoDate, end: IsoDate, period: ComparisonPeriod["mode"]) {
  if (period === "year") {
    return Array.from({ length: 12 }, (_, i) => {
      const k = `${start.slice(0, 4)}-${String(i + 1).padStart(2, "0")}`;
      return {
        key: k,
        label: new Date(`${k}-01T00:00:00Z`).toLocaleDateString("en-US", {
          month: "short",
          timeZone: "UTC",
        }),
        month: true,
      };
    });
  }
  const list = [];
  for (let d = start; d <= end; d = daysBetween(d, 1)) {
    list.push({
      key: d,
      label:
        period === "week"
          ? new Date(d + "T00:00:00Z").toLocaleDateString("en-US", {
              weekday: "short",
              timeZone: "UTC",
            })
          : d.slice(8),
      month: false,
    });
  }
  return list;
}

function dailyStreak(sessions: SessionInput[], today: IsoDate, start: IsoDate | null) {
  const dates = new Set(
    sessions
      .filter(
        (s) =>
          (s.session_date as IsoDate) <= today &&
          (!start || (s.session_date as IsoDate) >= start) &&
          validMinutes(s) > 0,
      )
      .map((s) => s.session_date as IsoDate),
  );
  let cursor = dates.has(today) ? today : daysBetween(today, -1),
    current = 0;
  while (dates.has(cursor) && (!start || cursor >= start)) {
    current++;
    cursor = daysBetween(cursor, -1);
  }
  let longest = 0,
    run = 0,
    previous: IsoDate | null = null;
  for (const date of [...dates].sort()) {
    run = previous && daysBetween(previous, 1) === date ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = date;
  }
  return { current, longest };
}

function metricsForOwner(data: Dataset, owner: string, period: ComparisonPeriod) {
  const { books = [], sessions = [], profiles = [], goals = [], goalHistory = [] } = data;
  const profile: ProfileInput = profiles.find((p) => p.id === owner) || { id: owner };
  const cutoff = profileTrackingStart(profile);
  const ownedBooks = books.filter((b) => b.user_id === owner);
  const ids = new Set(ownedBooks.map((b) => b.id));
  const allSessions = sessions.filter((s) => s.user_id === owner && ids.has(s.user_book_id));
  const rows = sessionsInReportingPeriod(allSessions, {
    periodStart: period.start,
    periodEnd: period.end,
    today: period.today,
    trackingStart: cutoff,
  });
  const bookIndex = new Map(ownedBooks.map((b) => [b.id, b]));
  const perBook = [...new Set(rows.map((s) => s.user_book_id))]
    .map((id) => {
      const book = bookIndex.get(id),
        summary = bookActivitySummary(rows, { bookId: id as string });
      return book
        ? { book, ...summary, speed: readingSpeedByMode(rows.filter((s) => s.user_book_id === id)) }
        : null;
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .sort(
      (a, b) => b.minutes - a.minutes || String(a.book.title).localeCompare(String(b.book.title)),
    );
  const minutes = rows.reduce((a, s) => a + validMinutes(s), 0),
    pages = rows.reduce((a, s) => a + validPages(s), 0);
  const physicalPages = rows
    .filter((s) => modeOf(s) !== "audiobook")
    .reduce((a, s) => a + validPages(s), 0);
  const audiobookEquivalents = rows
    .filter((s) => modeOf(s) === "audiobook")
    .reduce((a, s) => a + validPages(s), 0);
  const distinctDates = new Set(rows.filter((s) => validMinutes(s) > 0).map((s) => s.session_date));
  const y = Number(period.year),
    completions = completedBooksInYear(ownedBooks, y).length;
  const annualGoal =
    goals.find((g) => g.user_id === owner && Number(g.year) === y)?.books_target || 12;
  const versions = anchoredGoalHistory(
    goalHistory.filter((g) => g.user_id === owner),
    cutoff,
    profile.tracking_start_goal_minutes,
  );
  const fallback =
    Number(
      goals
        .filter((g) => g.user_id === owner && Number(g.year) <= y)
        .sort((a, b) => Number(b.year) - Number(a.year))[0]?.daily_minutes_target,
    ) || 30;
  const goal = dailyReadingGoalStats(allSessions, {
    targetMinutes: fallback,
    goalHistory: versions,
    today: period.today,
    periodStart: period.start,
    periodEnd: period.end,
    activeFrom: cutoff,
  });
  const goalSeries = dailyGoalTimeSeries(allSessions, {
    targetMinutes: fallback,
    goalHistory: versions,
    today: period.today,
    periodStart: period.start,
    periodEnd: period.end,
    groupBy: period.mode === "year" ? "month" : "day",
    activeFrom: cutoff,
  });
  const periods = daysOfPeriod(period.start, period.end, period.mode).map((g) => {
    const sessionsFor = rows.filter((s) =>
      g.month ? String(s.session_date).startsWith(g.key) : s.session_date === g.key,
    );
    const byMode = readingSpeedByMode(sessionsFor);
    return {
      ...g,
      modeSpeed: byMode,
      minutes: sessionsFor.reduce((a, s) => a + validMinutes(s), 0),
      pages: sessionsFor.reduce((a, s) => a + validPages(s), 0),
      sessions: sessionsFor.length,
      speed: byMode.overall.pagesPerHour,
    };
  });
  const speed = readingSpeedByMode(rows),
    clock = timeOfDayStats(rows);
  const weekday = dayOfWeekStats(rows, {
    periodStart: period.start,
    periodEnd: period.end,
    today: period.today,
    activeFrom: cutoff,
  });
  const sessionsByLength = sessionLengthStats(rows),
    activity = activityDistribution(rows),
    heatmap = weekdayTimeHeatmap(rows);
  const library = libraryStatistics(ownedBooks, { today: period.today }),
    genresSpeed = genreSpeedStats(ownedBooks, rows);
  const rereads = rereadingStats(ownedBooks, allSessions),
    rereadPairs = rereadComparisonStats(ownedBooks, allSessions, { today: period.today });
  const efficiency = completionEfficiency(ownedBooks, allSessions, { today: period.today });
  const statuses = Object.fromEntries(
    ["tbr", "reading", "finished", "dnf"].map((k) => [
      k,
      ownedBooks.filter((b) => b.status === k).length,
    ]),
  );
  return {
    owner,
    profile,
    cutoff,
    books: ownedBooks,
    rows,
    allSessions,
    minutes,
    pages,
    physicalPages,
    audiobookEquivalents,
    distinctBooks: perBook.length,
    activeDays: distinctDates.size,
    sessionCount: rows.length,
    completions,
    annualGoal,
    goal,
    goalSeries,
    streak: dailyStreak(allSessions, period.today, cutoff),
    speed,
    clock,
    weekday,
    sessionsByLength,
    activity,
    heatmap,
    library,
    genresSpeed,
    rereads,
    rereadPairs,
    efficiency,
    perBook,
    periods,
    statuses,
    favorites: ownedBooks.filter((b) => b.favorite).length,
    rated: ownedBooks.filter((b) => b.rating != null).length,
    libraryCount: ownedBooks.length,
  };
}

export type OwnerMetrics = ReturnType<typeof metricsForOwner>;

function interests(a: OwnerMetrics, b: OwnerMetrics) {
  const index = (books: BookInput[]) =>
    new Map(
      books
        .map((x) => [comparableBookKey(x), x] as const)
        .filter((entry): entry is readonly [string, BookInput] => Boolean(entry[0])),
    );
  const aIndex = index(a.books),
    bIndex = index(b.books);
  const shared = [...aIndex.keys()]
    .filter((k) => bIndex.has(k))
    .map((k) => {
      const mine = aIndex.get(k)!,
        theirs = bIndex.get(k)!;
      return {
        key: k,
        mine,
        theirs,
        ratingGap:
          mine.rating != null && theirs.rating != null
            ? numeric(mine.rating) - numeric(theirs.rating)
            : null,
      };
    });
  const mineOnly = [...aIndex.keys()].filter((k) => !bIndex.has(k)).map((k) => aIndex.get(k)!);
  const theirsOnly = [...bIndex.keys()].filter((k) => !aIndex.has(k)).map((k) => bIndex.get(k)!);
  const genresOf = (books: BookInput[]) =>
    new Set(
      books.flatMap((book) => (Array.isArray(book.genres) ? book.genres : [])).filter(Boolean),
    );
  const aGenres = genresOf(a.books),
    bGenres = genresOf(b.books);
  return {
    shared,
    mineOnly,
    theirsOnly,
    sharedGenres: [...aGenres].filter((g) => bGenres.has(g)).sort(),
    mineGenres: [...aGenres].filter((g) => !bGenres.has(g)).sort(),
    theirsGenres: [...bGenres].filter((g) => !aGenres.has(g)).sort(),
  };
}

export type FriendComparison =
  | { access: "none" }
  | {
      access: "summary";
      friend: ProfileInput;
      own: Partial<ProfileSummary> | null;
      other: Partial<ProfileSummary> | null;
    }
  | {
      access: "full";
      friend: ProfileInput;
      mine: OwnerMetrics;
      theirs: OwnerMetrics;
      interests: ReturnType<typeof interests>;
      period: ComparisonPeriod;
      bands: { id: string; label: string; hours: string }[];
      weekdays: readonly string[];
    };

/** Explicitly permission-check raw data at the aggregation boundary. */
export function buildFriendComparison({
  viewerId,
  friendId,
  shares = [],
  profiles = [],
  books = [],
  sessions = [],
  goals = [],
  goalHistory = [],
  summaries = [],
  period,
}: Dataset & {
  viewerId?: string | null;
  friendId?: string | null;
  shares?: ShareInput[];
  summaries?: Partial<ProfileSummary>[];
  period?: ComparisonPeriod;
} = {}): FriendComparison {
  if (!viewerId || !friendId || viewerId === friendId) return { access: "none" };
  const share = shares.find((sh) => sh.owner_id === friendId && sh.viewer_id === viewerId);
  if (!share || !["full", "summary"].includes(share.access_level as string))
    return { access: "none" };
  const friend = profiles.find((p) => p.id === friendId) || {
    id: friendId,
    display_name: "Reader",
  };
  if (share.access_level === "summary") {
    const own = summaries.find((s) => s.owner_id === viewerId),
      other = summaries.find((s) => s.owner_id === friendId);
    // Nothing from books or sessions is even inspected in this branch.
    return { access: "summary", friend, own: own || null, other: other || null };
  }
  if (!period || !period.start || !period.end || !period.today) {
    throw new Error("Comparison requires a calendar period");
  }
  const dataset = { books, sessions, profiles, goals, goalHistory };
  const mine = metricsForOwner(dataset, viewerId, period),
    theirs = metricsForOwner(dataset, friendId, period);
  return {
    access: "full",
    friend,
    mine,
    theirs,
    interests: interests(mine, theirs),
    period,
    bands: TIME_OF_DAY.map((x) => ({ id: x.id, label: x.label, hours: x.hours })),
    weekdays: WEEKDAYS,
  };
}
