import type { InsightPeriod, PeriodGroup, PeriodSpec } from "@/lib/insights-period";
import type { GoalHistoryRow, IsoDate, ReadingSession, UserBook } from "@/lib/types";

export type ModeFilter = "all" | "reading" | "audiobook" | "read_listen";
export type Metric = "minutes" | "pages";

/** Everything the Insights sections derive from, computed once per filter change. */
export type InsightsContext = {
  books: UserBook[];
  /** All of the owner's sessions (goals always use these, ignoring filters). */
  sessions: ReadingSession[];
  /** Sessions in the selected period, after the book and mode filters. */
  entries: ReadingSession[];
  /** Sessions in the period with the book filter only (speed compares all modes). */
  speedRows: ReadingSession[];
  today: IsoDate;
  trackingStart: IsoDate | null;
  goalHistory: GoalHistoryRow[];
  period: InsightPeriod;
  spec: PeriodSpec;
  groups: PeriodGroup[];
  bookFilter: string;
  mode: ModeFilter;
  metric: Metric;
  targetForDate: (date: IsoDate) => number;
  dailyGoalForYear: (year: number) => number;
  bookById: Map<string, UserBook>;
  openDrill: (kind: string, value: string, label: string) => void;
  /** The signed-in reader is looking at their own data. */
  editable: boolean;
};

export const MODE_TEXT = {
  reading: "Reading only",
  audiobook: "Audiobook only",
  read_listen: "Read + Listen",
} as const;
export const SPEED_COLORS = {
  reading: "#56876c",
  audiobook: "#6488b4",
  read_listen: "#b48a56",
} as const;
export const MODE_COLORS = {
  reading: "#568468",
  audiobook: "#557fa0",
  read_listen: "#b28a56",
} as const;
export const SPEED_KEYS = ["reading", "audiobook", "read_listen"] as const;
