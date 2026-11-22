"use server";

import { revalidatePath } from "next/cache";

import { dailyGoalForYear } from "@/lib/insights-period";
import { catalogSeriesMatch, seriesKey } from "@/lib/series-catalog";
import { seriesMetadata } from "@/lib/series-insights";
import { rateLimit } from "@/utils/api/rate-limit";
import { lookupSeriesOnServer, seriesChanges } from "@/utils/series-catalog-server";
import { clientToday } from "@/utils/client-date";
import { requireUser } from "@/utils/supabase/server";

export type GoalState = { error?: string; message?: string };

const wholeNumber = (value: FormDataEntryValue | null, max: number) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= max ? n : null;
};

/** Books target for one year; keeps that year's daily minutes as they were. */
export async function saveAnnualGoal(_prev: GoalState, formData: FormData): Promise<GoalState> {
  const target = wholeNumber(formData.get("books_target"), 10_000);
  if (!target) return { error: "Annual target must be a whole number between 1 and 10,000." };
  const year = wholeNumber(formData.get("year"), 9999);
  if (!year || year < 1900) return { error: "Choose a valid year." };
  const { supabase, claims } = await requireUser();
  const { data: goals } = await supabase
    .from("reading_goals")
    .select("year,daily_minutes_target")
    .eq("user_id", claims.sub);
  const { error } = await supabase.from("reading_goals").upsert(
    {
      user_id: claims.sub,
      year,
      books_target: target,
      daily_minutes_target: dailyGoalForYear(goals ?? [], year),
    },
    { onConflict: "user_id,year" },
  );
  if (error) return { error: "Could not save the annual goal." };
  revalidatePath("/insights");
  return { message: "Annual reading goal saved." };
}

/**
 * New daily minutes target from the reader's local today forward. Goal history
 * is dated: earlier days keep the target they had.
 */
export async function saveDailyGoal(_prev: GoalState, formData: FormData): Promise<GoalState> {
  const target = wholeNumber(formData.get("target_minutes"), 1440);
  if (!target) return { error: "Daily goal must be a whole number from 1 to 1,440 minutes." };
  const today = clientToday(formData.get("today"));
  const { supabase, claims } = await requireUser();
  const { error } = await supabase
    .from("reading_goal_history")
    .upsert(
      { user_id: claims.sub, effective_date: today, target_minutes: target },
      { onConflict: "user_id,effective_date" },
    );
  if (error) return { error: "Could not save the daily goal." };
  revalidatePath("/insights");
  return {
    message: "Daily reading-time goal saved from today forward. Earlier dates stay unchanged.",
  };
}

/**
 * Fill blank series totals for every book in one of the reader's series
 * (legacy "Fill missing series totals in my library"). The lookup runs here;
 * the result must match the series name and author before anything changes.
 */
export async function fillSeriesGroup(name: string): Promise<GoalState> {
  const seriesName = String(name ?? "").trim();
  if (!seriesName || seriesName.length > 200) return { error: "Choose a series." };
  const { supabase, claims } = await requireUser();
  const limited = rateLimit(`series-group:${claims.sub}`, { limit: 20, windowMs: 60 * 60_000 });
  if (!limited.ok) return { error: "Too many series lookups. Try again later." };
  const { data: books } = await supabase.from("user_books").select("*").eq("user_id", claims.sub);
  const members = (books ?? []).filter(
    (b) => seriesKey(seriesMetadata(b).series_name) === seriesKey(seriesName),
  );
  if (!members.length) return { error: "That series isn't in your library." };
  const details = await lookupSeriesOnServer({ series: seriesName });
  if (details === "unconfigured") return { error: "Series catalog lookup is not configured yet." };
  if (!details || !catalogSeriesMatch(details, { seriesName, author: members[0].author })) {
    return {
      error: "The catalog did not return an exact series and author match. Nothing was changed.",
    };
  }
  let saved = 0;
  for (const book of members) {
    const changes = seriesChanges(book, details);
    if (!changes) continue;
    const { error } = await supabase
      .from("user_books")
      .update(changes)
      .eq("id", book.id)
      .eq("user_id", claims.sub);
    if (!error) saved++;
  }
  revalidatePath("/insights");
  return {
    message: saved
      ? `Saved missing series information on ${saved} book${saved === 1 ? "" : "s"}.`
      : "No missing series fields to fill.",
  };
}
