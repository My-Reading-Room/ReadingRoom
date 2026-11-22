import "server-only";

import type { ActivityMode } from "@/lib/types";
import { requireUser } from "@/utils/supabase/server";

import { fetchAllRows } from "./fetch-all";

const BOOK_COLUMNS =
  "id,title,author,genres,status,rating,favorite,page_count,current_page,isbn,asin,publisher,binding," +
  "edition_year,original_published_year,goodreads_added_on,tbr_added_on,started_on,finished_on," +
  "shelf_order,cover_url,series_name,height_mm,thickness_mm";

export type LibraryBook = {
  id: string;
  title: string;
  author: string;
  genres: string[];
  status: string;
  rating: number | null;
  favorite: boolean;
  page_count: number | null;
  current_page: number;
  isbn: string | null;
  asin: string | null;
  publisher: string | null;
  binding: string | null;
  edition_year: number | null;
  original_published_year: number | null;
  goodreads_added_on: string | null;
  tbr_added_on: string | null;
  started_on: string | null;
  finished_on: string | null;
  shelf_order: number;
  cover_url: string | null;
  series_name: string | null;
  height_mm: number | null;
  thickness_mm: number | null;
  /** Activity modes the owner has logged for this book. */
  modes: ActivityMode[];
};

/** The signed-in reader's own library. */
export async function getOwnLibrary(): Promise<LibraryBook[]> {
  return (await getLibrary()).books;
}

/**
 * One reader's library: the signed-in reader by default, or someone who shared
 * a full profile with them. Filtering by user_id narrows to that reader's rows;
 * RLS independently guarantees nobody else's private rows come back.
 */
export async function getLibrary(
  ownerId?: string,
): Promise<{ books: LibraryBook[]; editable: boolean }> {
  const { supabase, claims } = await requireUser();
  const userId = ownerId ?? claims.sub;

  const [books, sessions] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase
        .from("user_books")
        .select(BOOK_COLUMNS)
        .eq("user_id", userId)
        .order("shelf_order")
        .order("id")
        .range(from, to)
        .overrideTypes<Omit<LibraryBook, "modes">[], { merge: false }>(),
    ),
    fetchAllRows((from, to) =>
      supabase
        .from("reading_sessions")
        .select("user_book_id,activity_mode")
        .eq("user_id", userId)
        .order("id")
        .range(from, to),
    ),
  ]);

  const modes = new Map<string, Set<ActivityMode>>();
  for (const s of sessions) {
    if (!modes.has(s.user_book_id)) modes.set(s.user_book_id, new Set());
    modes.get(s.user_book_id)!.add((s.activity_mode || "reading") as ActivityMode);
  }
  return {
    books: books.map((b) => ({
      ...b,
      genres: b.genres ?? [],
      modes: [...(modes.get(b.id) ?? [])],
    })),
    editable: userId === claims.sub,
  };
}
