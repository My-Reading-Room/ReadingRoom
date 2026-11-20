"use server";

import { revalidatePath } from "next/cache";

import { dailyGoalForYear } from "@/lib/insights-period";
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
