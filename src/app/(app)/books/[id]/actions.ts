"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { applyBookEdits, type BookEditForm } from "@/lib/book-edits";
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
