import "server-only";

import { sessionBookChoices } from "@/lib/session-book-picker";
import type { ChapterBound } from "@/lib/session-log";
import type { IsoDate, ReadingSession, UserBook } from "@/lib/types";
import { requireUser } from "@/utils/supabase/server";

import { fetchAllRows } from "./fetch-all";

export const LOG_BOOK_COLUMNS =
  "id,title,author,status,page_count,current_page,read_history,started_on,finished_on,cover_url";
export const LOG_SESSION_COLUMNS =
  "id,user_book_id,session_date,duration_minutes,pages_read,activity_mode,log_type,read_number,start_page,end_page,chapter_from,chapter_to,audio_start_minute,audio_end_minute,start_local_time,created_at";

export type LogBook = Pick<
  UserBook,
  | "id"
  | "title"
  | "author"
  | "status"
  | "page_count"
  | "current_page"
  | "read_history"
  | "started_on"
  | "finished_on"
  | "cover_url"
>;

export type LogSession = Pick<
  ReadingSession,
  | "id"
  | "user_book_id"
  | "session_date"
  | "duration_minutes"
  | "pages_read"
  | "activity_mode"
  | "log_type"
  | "read_number"
  | "start_page"
  | "end_page"
  | "chapter_from"
  | "chapter_to"
  | "audio_start_minute"
  | "audio_end_minute"
  | "start_local_time"
  | "created_at"
>;

/**
 * Everything the Log Reading page needs, for the signed-in reader only. Without
 * a requested book, the first currently-reading book is selected (as in legacy).
 */
export async function getLogData(date: IsoDate, bookId: string | null) {
  const { supabase, claims } = await requireUser();
  const userId = claims.sub;
  const books = await fetchAllRows((from, to) =>
    supabase
      .from("user_books")
      .select(LOG_BOOK_COLUMNS)
      .eq("user_id", userId)
      .order("id")
      .range(from, to)
      .overrideTypes<LogBook[], { merge: false }>(),
  );
  const selected =
    (bookId ? books.find((b) => b.id === bookId) : sessionBookChoices(books, "reading")[0]) ?? null;

  const [daySessions, bookSessions, chapters] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase
        .from("reading_sessions")
        .select(LOG_SESSION_COLUMNS)
        .eq("user_id", userId)
        .eq("session_date", date)
        .order("id")
        .range(from, to)
        .overrideTypes<LogSession[], { merge: false }>(),
    ),
    selected
      ? fetchAllRows((from, to) =>
          supabase
            .from("reading_sessions")
            .select(LOG_SESSION_COLUMNS)
            .eq("user_id", userId)
            .eq("user_book_id", selected.id)
            .order("id")
            .range(from, to)
            .overrideTypes<LogSession[], { merge: false }>(),
        )
      : Promise.resolve([] as LogSession[]),
    selected
      ? supabase
          .from("chapter_boundaries")
          .select("chapter_number,chapter_label,start_page,end_page")
          .eq("user_book_id", selected.id)
          .eq("user_id", userId)
          .order("chapter_number")
          .then((r) => (r.data ?? []) as (ChapterBound & { chapter_label: string | null })[])
      : Promise.resolve([]),
  ]);
  return { userId, books, selected, daySessions, bookSessions, chapters };
}
