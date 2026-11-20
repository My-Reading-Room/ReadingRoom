import "server-only";

import type {
  GoalHistoryRow,
  GoalInput,
  ProfileInput,
  ReadingSession,
  UserBook,
} from "@/lib/types";
import { requireUser } from "@/utils/supabase/server";

import { fetchAllRows } from "./fetch-all";

export type InsightsData = {
  books: UserBook[];
  sessions: ReadingSession[];
  goals: GoalInput[];
  goalHistory: GoalHistoryRow[];
  profile: ProfileInput | null;
  /** Only the owner may change goals. */
  editable: boolean;
  ownerId: string;
};

/**
 * Everything Insights needs for one reader: the signed-in reader by default, or
 * someone who shared a full profile with them (RLS returns nothing otherwise).
 */
export async function getInsightsData(ownerId?: string): Promise<InsightsData> {
  const { supabase, claims } = await requireUser();
  const owner = ownerId ?? claims.sub;
  const [books, sessions, goals, history, profile] = await Promise.all([
    fetchAllRows<UserBook>((from, to) =>
      supabase.from("user_books").select("*").eq("user_id", owner).order("id").range(from, to),
    ),
    fetchAllRows<ReadingSession>((from, to) =>
      supabase
        .from("reading_sessions")
        .select("*")
        .eq("user_id", owner)
        .order("id")
        .range(from, to),
    ),
    supabase.from("reading_goals").select("*").eq("user_id", owner),
    supabase
      .from("reading_goal_history")
      .select("effective_date,target_minutes")
      .eq("user_id", owner),
    supabase
      .from("profiles")
      .select("id,display_name,created_at,tracking_start_date,tracking_start_goal_minutes")
      .eq("id", owner)
      .maybeSingle(),
  ]);
  return {
    books,
    sessions,
    goals: goals.data ?? [],
    goalHistory: history.data ?? [],
    profile: profile.data,
    editable: owner === claims.sub,
    ownerId: owner,
  };
}
