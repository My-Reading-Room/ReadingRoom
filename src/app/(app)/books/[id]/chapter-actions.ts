"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { validateSingleChapter, type ChapterRow } from "@/lib/chapter-edits";
import {
  isbn13ForEdition,
  lookupOpenLibraryChapters,
  validateVerifiedChapterMap,
  type ChapterDraft,
} from "@/lib/chapter-sourcing";
import { serverEnv } from "@/utils/server-env";
import { requireUser } from "@/utils/supabase/server";

import type { BookActionState } from "./actions";

const guid = z.guid();

async function ownBook(id: string) {
  if (!guid.safeParse(id).success) return null;
  const { supabase, claims } = await requireUser();
  const { data } = await supabase
    .from("user_books")
    .select("id,user_id,isbn,page_count")
    .eq("id", id)
    .eq("user_id", claims.sub)
    .maybeSingle();
  return data ? { supabase, userId: claims.sub, book: data } : null;
}

async function chaptersOf(
  owned: NonNullable<Awaited<ReturnType<typeof ownBook>>>,
): Promise<ChapterRow[]> {
  const { data } = await owned.supabase
    .from("chapter_boundaries")
    .select("id,chapter_number,chapter_label,start_page,end_page")
    .eq("user_book_id", owned.book.id)
    .eq("user_id", owned.userId);
  return data ?? [];
}

const done = (bookId: string, message: string): BookActionState => {
  revalidatePath(`/books/${bookId}`);
  return { message };
};

/** Add or update one exact boundary (legacy saveChapter). */
export async function saveChapter(
  id: string,
  _prev: BookActionState,
  formData: FormData,
): Promise<BookActionState> {
  const owned = await ownBook(id);
  if (!owned) return { error: "Only the owner can edit chapters." };
  const result = validateSingleChapter(
    {
      chapter_number: formData.get("chapter_number"),
      start_page: formData.get("start_page"),
      end_page: formData.get("end_page"),
      title: formData.get("title"),
    },
    owned.book,
    await chaptersOf(owned),
  );
  if ("error" in result) return { error: result.error };
  const query = result.replacesId
    ? owned.supabase
        .from("chapter_boundaries")
        .update(result.chapter)
        .eq("id", result.replacesId)
        .eq("user_id", owned.userId)
    : owned.supabase
        .from("chapter_boundaries")
        .insert({ ...result.chapter, user_id: owned.userId, user_book_id: owned.book.id });
  const { error } = await query;
  if (error) return { error: "Could not save the chapter boundary." };
  return done(
    owned.book.id,
    `Exact page mapping saved for Chapter ${result.chapter.chapter_number}.`,
  );
}

export async function deleteChapter(id: string, chapterId: string): Promise<BookActionState> {
  const owned = await ownBook(id);
  if (!owned || !guid.safeParse(chapterId).success)
    return { error: "Only the owner can edit chapters." };
  const { error } = await owned.supabase
    .from("chapter_boundaries")
    .delete()
    .eq("id", chapterId)
    .eq("user_book_id", owned.book.id)
    .eq("user_id", owned.userId);
  if (error) return { error: "Could not delete the chapter." };
  return done(owned.book.id, "Chapter boundary deleted.");
}

export type DraftResult = { draft?: ChapterDraft; error?: string };

/** Open Library table of contents for this exact ISBN, fetched by our server (identified, per #10). */
export async function findOpenLibraryChapters(id: string): Promise<DraftResult> {
  const owned = await ownBook(id);
  if (!owned) return { error: "Only the owner can look up chapters." };
  const contact = serverEnv.openLibraryContact();
  const userAgent = contact ? `MyReadingRoom (${contact})` : "MyReadingRoom";
  try {
    const draft = await lookupOpenLibraryChapters(owned.book.isbn, (url, init) =>
      fetch(url, {
        ...init,
        headers: { ...(init?.headers as Record<string, string>), "User-Agent": userAgent },
        signal: AbortSignal.timeout(8000),
      }),
    );
    return { draft };
  } catch (error) {
    return { error: (error as Error).message || "Could not find chapter metadata." };
  }
}

export type SharedMapOption = {
  id: string;
  isbn13: string;
  page_count: number | null;
  chapters: { chapter_label?: unknown; start_page?: unknown; end_page?: unknown }[];
};

/** Community maps for this ISBN. The RPC never returns who contributed them. */
export async function findSharedChapterMaps(
  id: string,
): Promise<{ options?: SharedMapOption[]; error?: string }> {
  const owned = await ownBook(id);
  if (!owned) return { error: "Only the owner can look up chapters." };
  const isbn = isbn13ForEdition(owned.book.isbn);
  if (!isbn) return { error: "Save a valid ISBN first." };
  const { data, error } = await owned.supabase.rpc("get_shared_chapter_maps", { p_isbn13: isbn });
  if (error) return { error: "Could not load community maps." };
  return { options: Array.isArray(data) ? (data as SharedMapOption[]) : [] };
}

/** Replace all boundaries with a reviewed draft. Validated here and again by the RPC. */
export async function saveChapterMap(
  id: string,
  _prev: BookActionState,
  formData: FormData,
): Promise<BookActionState> {
  const owned = await ownBook(id);
  if (!owned) return { error: "Only the owner can edit chapters." };
  if (formData.get("verified") !== "on") {
    return { error: "Confirm that you checked every page boundary against this exact edition." };
  }
  let rows: unknown;
  try {
    rows = JSON.parse(String(formData.get("rows") ?? ""));
  } catch {
    return { error: "The chapter draft could not be read. Reload and try again." };
  }
  let checked;
  try {
    checked = validateVerifiedChapterMap(Array.isArray(rows) ? rows : [], owned.book);
  } catch (error) {
    return { error: (error as Error).message };
  }
  const { error } = await owned.supabase.rpc("replace_book_chapter_map", {
    p_user_book_id: owned.book.id,
    p_chapters: checked,
  });
  if (error) return { error: error.message || "Could not save the chapter map." };
  return done(owned.book.id, `Saved ${checked.length} verified chapters.`);
}

export async function publishChapterMap(id: string): Promise<BookActionState> {
  const owned = await ownBook(id);
  if (!owned) return { error: "Only the owner can share chapter maps." };
  if (!isbn13ForEdition(owned.book.isbn))
    return { error: "Save a valid ISBN before sharing chapter maps." };
  const { error } = await owned.supabase.rpc("publish_chapter_map", {
    p_user_book_id: owned.book.id,
  });
  if (error) return { error: error.message || "Could not share the chapter map." };
  return done(
    owned.book.id,
    "Your chapter map was contributed. Other readers must review it before use.",
  );
}

export async function withdrawChapterMap(id: string): Promise<BookActionState> {
  const owned = await ownBook(id);
  if (!owned) return { error: "Only the owner can withdraw chapter maps." };
  const { error } = await owned.supabase.rpc("withdraw_chapter_map", {
    p_user_book_id: owned.book.id,
  });
  if (error) return { error: "Could not withdraw the contribution." };
  return done(
    owned.book.id,
    "Your community contribution has been withdrawn. Your private chapters remain.",
  );
}
