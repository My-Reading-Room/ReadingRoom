import "server-only";

import { notFound } from "next/navigation";

import type { ReadingSession, UserBook } from "@/lib/types";
import { requireUser } from "@/utils/supabase/server";

import { fetchAllRows } from "./fetch-all";

export type BookSession = Pick<
  ReadingSession,
  | "id"
  | "user_book_id"
  | "session_date"
  | "duration_minutes"
  | "pages_read"
  | "activity_mode"
  | "read_number"
  | "log_type"
  | "start_page"
  | "end_page"
  | "created_at"
>;

export type BookDetail = {
  book: UserBook;
  /** Only the owner edits; a partner with a full share sees it read-only. */
  editable: boolean;
  sessions: BookSession[];
  chapterCount: number;
};

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/**
 * One book plus its sessions. RLS decides visibility: the owner, or a reader
 * the owner shared a full profile with. Anything else is a 404, so the page
 * doesn't reveal whether a book id exists.
 */
export async function getBookDetail(id: string): Promise<BookDetail> {
  if (!isUuid(id)) notFound();
  const { supabase, claims } = await requireUser();

  const { data: book, error } = await supabase
    .from("user_books")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!book) notFound();

  const [sessions, chapters] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase
        .from("reading_sessions")
        .select(
          "id,user_book_id,session_date,duration_minutes,pages_read,activity_mode,read_number,log_type,start_page,end_page,created_at",
        )
        .eq("user_book_id", id)
        .order("id")
        .range(from, to),
    ),
    supabase
      .from("chapter_boundaries")
      .select("id", { count: "exact", head: true })
      .eq("user_book_id", id),
  ]);
  if (chapters.error) throw new Error(chapters.error.message);

  return {
    book,
    editable: book.user_id === claims.sub,
    sessions,
    chapterCount: chapters.count ?? 0,
  };
}
