"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { applyBookEdits, type BookEditForm } from "@/lib/book-edits";
import { planReadHistorySave } from "@/lib/read-history-plan";
import { beginReread } from "@/lib/reading-history";
import type { UserBook } from "@/lib/types";
import { clientToday } from "@/utils/client-date";
import { requireUser } from "@/utils/supabase/server";

export type BookActionState = { error?: string; message?: string };

// z.guid(): any 8-4-4-4-12 hex id, as Postgres accepts (z.uuid() also enforces RFC version bits).
const bookId = z.guid();

/** Columns the owner may change from Book details (never id/user_id/created_at). */
const EDITABLE_COLUMNS = [
  "status",
  "rating",
  "started_on",
  "finished_on",
  "page_count",
  "current_page",
  "publisher",
  "binding",
  "isbn",
  "asin",
  "cover_url",
  "edition_key",
  "work_key",
  "edition_year",
  "original_published_year",
  "published_year",
  "height_mm",
  "thickness_mm",
  "genres",
  "series_name",
  "series_number",
  "series_total",
  "series_total_source",
  "series_source_url",
  "notes",
  "tbr_added_on",
  "read_history",
] as const satisfies readonly (keyof UserBook)[];

const pick = (book: UserBook) =>
  Object.fromEntries(EDITABLE_COLUMNS.map((key) => [key, book[key]])) as Partial<UserBook>;

/** The signed-in reader's own book, or null. Ownership is checked here and again by RLS. */
async function ownBook(id: string) {
  const parsed = bookId.safeParse(id);
  if (!parsed.success) return null;
  const { supabase, claims } = await requireUser();
  const { data } = await supabase
    .from("user_books")
    .select("*")
    .eq("id", parsed.data)
    .eq("user_id", claims.sub)
    .maybeSingle();
  return data ? { supabase, userId: claims.sub, book: data } : null;
}

const FORM_FIELDS: (keyof BookEditForm)[] = [
  "status",
  "rating",
  "started_on",
  "finished_on",
  "page_count",
  "current_page",
  "isbn",
  "asin",
  "cover_url",
  "publisher",
  "binding",
  "edition_year",
  "original_published_year",
  "height_mm",
  "thickness_mm",
  "genres",
  "tbr_added_on",
  "series_name",
  "series_number",
  "series_total",
  "notes",
];

export async function saveBook(
  id: string,
  _prev: BookActionState,
  formData: FormData,
): Promise<BookActionState> {
  const owned = await ownBook(id);
  if (!owned) return { error: "Only the owner can edit this book." };
  const form = Object.fromEntries(
    FORM_FIELDS.map((k) => [k, String(formData.get(k) ?? "")]),
  ) as BookEditForm;

  const { count } = await owned.supabase
    .from("chapter_boundaries")
    .select("id", { count: "exact", head: true })
    .eq("user_book_id", owned.book.id);
  const result = applyBookEdits(owned.book, form, {
    today: clientToday(formData.get("today")),
    hasChapters: (count ?? 0) > 0,
  });
  if ("error" in result) return { error: result.error };

  const { error } = await owned.supabase
    .from("user_books")
    .update(pick(result.book))
    .eq("id", owned.book.id)
    .eq("user_id", owned.userId);
  if (error) return { error: "Could not save the book. Try again." };
  revalidatePath(`/books/${owned.book.id}`);
  revalidatePath("/library");
  return { message: "Book details saved." };
}

export async function toggleFavorite(id: string): Promise<BookActionState> {
  const owned = await ownBook(id);
  if (!owned) return { error: "Only the owner can change favorites." };
  const { error } = await owned.supabase
    .from("user_books")
    .update({ favorite: !owned.book.favorite })
    .eq("id", owned.book.id)
    .eq("user_id", owned.userId);
  if (error) return { error: "Could not update favorites." };
  revalidatePath(`/books/${owned.book.id}`);
  revalidatePath("/library");
  return { message: owned.book.favorite ? "Removed from Favorites." : "Added to Favorites." };
}

export async function startReread(
  id: string,
  _prev: BookActionState,
  formData: FormData,
): Promise<BookActionState> {
  const owned = await ownBook(id);
  if (!owned) return { error: "Only the owner can start a reread." };
  if (!["finished", "dnf"].includes(owned.book.status)) {
    return { error: "Finish this book before beginning another read." };
  }
  const reread = beginReread(owned.book, clientToday(formData.get("today")));
  const { error } = await owned.supabase
    .from("user_books")
    .update(pick(reread as UserBook))
    .eq("id", owned.book.id)
    .eq("user_id", owned.userId);
  if (error) return { error: "Could not start the reread." };
  revalidatePath(`/books/${owned.book.id}`);
  revalidatePath("/library");
  return { message: "Reread started. Original completion preserved." };
}

export async function deleteBook(id: string): Promise<BookActionState> {
  const owned = await ownBook(id);
  if (!owned) return { error: "Only the owner can delete this book." };
  // Sessions and chapter boundaries are removed by ON DELETE CASCADE.
  const { error } = await owned.supabase
    .from("user_books")
    .delete()
    .eq("id", owned.book.id)
    .eq("user_id", owned.userId);
  if (error) return { error: "Could not delete the book." };
  revalidatePath("/library");
  redirect("/library");
}

const passEntries = z
  .array(
    z.object({
      status: z.enum(["reading", "finished", "dnf"]),
      started_on: z.string().max(10).default(""),
      finished_on: z.string().max(10).default(""),
      finished_year: z.string().max(4).default(""),
    }),
  )
  .min(1)
  .max(500);

/**
 * Save edited read-throughs (or only recheck session assignments). The plan is
 * recomputed here from fresh rows; the browser's preview is never trusted.
 */
export async function saveReadHistory(
  id: string,
  _prev: BookActionState,
  formData: FormData,
): Promise<BookActionState> {
  const owned = await ownBook(id);
  if (!owned) return { error: "Only the owner can edit reading history." };
  const assignmentOnly = formData.get("mode") === "recheck";
  let entries = null;
  if (!assignmentOnly) {
    let raw: unknown;
    try {
      raw = JSON.parse(String(formData.get("entries") ?? ""));
    } catch {
      return { error: "Reading history could not be read. Reload and try again." };
    }
    const parsed = passEntries.safeParse(raw);
    if (!parsed.success) return { error: "Check the status and dates of each read-through." };
    entries = parsed.data;
  }

  const { data: sessions, error: sessionsError } = await owned.supabase
    .from("reading_sessions")
    .select("id,user_book_id,session_date,read_number")
    .eq("user_book_id", owned.book.id)
    .eq("user_id", owned.userId);
  if (sessionsError) return { error: "Could not load this book's sessions." };

  const plan = planReadHistorySave(owned.book, sessions ?? [], entries, {
    reassign: formData.get("reassign") === "on",
    assignmentOnly,
  });
  if ("error" in plan) return { error: plan.error };

  if (!assignmentOnly) {
    const { error } = await owned.supabase
      .from("user_books")
      .update(pick(plan.book as UserBook))
      .eq("id", owned.book.id)
      .eq("user_id", owned.userId);
    if (error) return { error: "Could not save reading history." };
  }
  let moved = 0;
  for (const move of plan.corrections) {
    // Only the pass number changes; time, pages, mode, notes and dates stay as logged.
    const { error } = await owned.supabase
      .from("reading_sessions")
      .update({ read_number: move.to })
      .eq("id", move.session.id)
      .eq("user_id", owned.userId);
    if (error) {
      revalidatePath(`/books/${owned.book.id}`);
      return {
        error: `Reading history saved but only ${moved} of ${plan.corrections.length} session moves completed. Use "Recheck saved session assignments" to retry.`,
      };
    }
    moved++;
  }
  revalidatePath(`/books/${owned.book.id}`);
  revalidatePath("/library");
  const verb = assignmentOnly ? "checked" : "saved";
  return {
    message: `Reading history ${verb}${moved ? `; ${moved} saved session${moved === 1 ? "" : "s"} moved into the appropriate reread` : ""}.`,
  };
}
