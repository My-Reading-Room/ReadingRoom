import type { Database, Tables } from "@/types/database";

/** Local calendar date, YYYY-MM-DD. Never a UTC instant. */
export type IsoDate = string;

export type UserBook = Tables<"user_books">;
export type ReadingSession = Tables<"reading_sessions">;
export type Profile = Tables<"profiles">;
export type ProfileShare = Tables<"profile_shares">;
export type ReadingGoal = Tables<"reading_goals">;
export type ProfileSummary =
  Database["public"]["Functions"]["get_viewable_profile_summaries"]["Returns"][number];

/**
 * Domain functions validate every field at runtime: form values arrive as
 * strings, and imported or legacy rows can have missing or null fields. Inputs
 * are therefore loose (optional, nullable, numbers may be numeric strings),
 * and real database rows are always assignable to them.
 */
type Loose<T> = {
  [K in keyof T]?: NonNullable<T[K]> extends number ? T[K] | string | null : T[K] | null;
};

export type BookInput = Loose<UserBook> & {
  /** Placeholder cover colour used by the legacy local demo; not a database column. */
  demo_color?: string | null;
};
export type SessionInput = Loose<ReadingSession>;
export type ProfileInput = Loose<Profile>;
export type ShareInput = Loose<ProfileShare>;
export type GoalInput = Loose<ReadingGoal>;

export type BookStatus = "tbr" | "reading" | "finished" | "dnf";
export type ActivityMode = "reading" | "audiobook" | "read_listen";

export type GoalHistoryRow = {
  user_id?: string;
  effective_date: IsoDate;
  target_minutes: number;
  tracking_baseline?: boolean;
};

export type PassStatus = "reading" | "finished" | "dnf";

/** One entry of user_books.read_history (an explicit reading pass). */
export type ReadPass = {
  number: number;
  status: PassStatus;
  started_on: IsoDate | null;
  finished_on: IsoDate | null;
  finished_year: number | null;
};
