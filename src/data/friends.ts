import "server-only";

import type { GoalHistoryRow, GoalInput, ReadingSession, UserBook } from "@/lib/types";
import { requireUser } from "@/utils/supabase/server";

import { fetchAllRows } from "./fetch-all";

/**
 * Everything the Friends page compares, for the signed-in reader plus everyone
 * who shared a *Full* profile with them. Summary-only friends contribute just
 * the whitelisted aggregates from get_viewable_profile_summaries; their books
 * and sessions are never queried. RLS enforces the same independently.
 * This stays on the server: pages render from it and send only the result.
 */
export async function getFriendsData(year: number) {
  const { supabase, claims } = await requireUser();
  const me = claims.sub;
  const { data: shareRows } = await supabase
    .from("profile_shares")
    .select("owner_id,viewer_id,access_level")
    .or(`owner_id.eq.${me},viewer_id.eq.${me}`);
  const shares = shareRows ?? [];
  const incoming = shares.filter((s) => s.viewer_id === me && s.owner_id !== me);
  const fullIds = incoming.filter((s) => s.access_level === "full").map((s) => s.owner_id);
  const readers = [me, ...fullIds];
  const people = [...new Set([me, ...incoming.map((s) => s.owner_id)])];

  const [profiles, books, sessions, goals, goalHistory, summaries] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,display_name,created_at,tracking_start_date,tracking_start_goal_minutes")
      .in("id", people)
      .then((r) => r.data ?? []),
    fetchAllRows<UserBook>((from, to) =>
      supabase.from("user_books").select("*").in("user_id", readers).order("id").range(from, to),
    ),
    fetchAllRows<ReadingSession>((from, to) =>
      supabase
        .from("reading_sessions")
        .select("*")
        .in("user_id", readers)
        .order("id")
        .range(from, to),
    ),
    supabase
      .from("reading_goals")
      .select("*")
      .in("user_id", readers)
      .then((r) => (r.data ?? []) as GoalInput[]),
    supabase
      .from("reading_goal_history")
      .select("user_id,effective_date,target_minutes")
      .in("user_id", readers)
      .then((r) => (r.data ?? []) as GoalHistoryRow[]),
    supabase.rpc("get_viewable_profile_summaries", { p_year: year }).then((r) => r.data ?? []),
  ]);
  return { me, shares, incoming, profiles, books, sessions, goals, goalHistory, summaries };
}
