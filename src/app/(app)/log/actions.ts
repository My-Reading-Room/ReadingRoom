"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { planSessionLog, type SessionLogInput } from "@/lib/session-log";
import { fetchAllRows } from "@/data/fetch-all";
import { LOG_SESSION_COLUMNS } from "@/data/log";
import { clientToday } from "@/utils/client-date";
import { requireUser } from "@/utils/supabase/server";

export type LogActionState = { error?: string; message?: string };

const FIELDS: (keyof SessionLogInput)[] = [
  "date",
  "minutes",
  "mode",
  "method",
  "pass",
  "startTime",
  "endingPage",
  "startingPage",
  "chapterFrom",
  "chapterTo",
  "audioStart",
  "audioEnd",
];

/** Save one reading session. Planned on the server from fresh rows (legacy saveLog rules). */
export async function saveSession(
  _prev: LogActionState,
  formData: FormData,
): Promise<LogActionState> {
  const bookId = z.guid().safeParse(formData.get("bookId"));
  if (!bookId.success) return { error: "Choose a book first." };
  const { supabase, claims } = await requireUser();
  const userId = claims.sub;

  const { data: book } = await supabase
    .from("user_books")
    .select("*")
    .eq("id", bookId.data)
    .eq("user_id", userId)
    .maybeSingle();
  if (!book) return { error: "Choose one of your own books." };

  const [sessions, chapters] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase
        .from("reading_sessions")
        .select(LOG_SESSION_COLUMNS)
        .eq("user_book_id", book.id)
        .eq("user_id", userId)
        .order("id")
        .range(from, to),
    ),
    supabase
      .from("chapter_boundaries")
      .select("chapter_number,start_page,end_page")
      .eq("user_book_id", book.id)
      .eq("user_id", userId)
      .then((r) => r.data ?? []),
  ]);

  const input = Object.fromEntries(
    FIELDS.map((k) => [k, String(formData.get(k) ?? "").trim()]),
  ) as SessionLogInput;
  const plan = planSessionLog(book, sessions, chapters, input, {
    today: clientToday(formData.get("today")),
  });
  if ("error" in plan) return { error: plan.error };

  const { error } = await supabase
    .from("reading_sessions")
    .insert({ ...plan.session, user_id: userId });
  // The database also validates chapter ranges and page positions (validate_reading_session).
  if (error) return { error: error.message || "Could not save the session." };

  const { error: bookError } = await supabase
    .from("user_books")
    .update(plan.book)
    .eq("id", book.id)
    .eq("user_id", userId);
  revalidatePath("/log");
  revalidatePath(`/books/${book.id}`);
  revalidatePath("/library");
  if (bookError)
    return { error: "The session was saved, but the book's progress could not be updated." };
  return { message: plan.summary };
}

export async function deleteSession(sessionId: string): Promise<LogActionState> {
  if (!z.guid().safeParse(sessionId).success) return { error: "Unknown session." };
  const { supabase, claims } = await requireUser();
  const { data, error } = await supabase
    .from("reading_sessions")
    .delete()
    .eq("id", sessionId)
    .eq("user_id", claims.sub)
    .select("user_book_id");
  if (error || !data?.length) return { error: "Could not delete the session." };
  revalidatePath("/log");
  revalidatePath(`/books/${data[0].user_book_id}`);
  return { message: "Reading session deleted. Review book progress if needed." };
}
