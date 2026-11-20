// Download the signed-in reader's own data (#16): ?format=json (full backup) or csv (books).
import { NextResponse, type NextRequest } from "next/server";

import { fetchAllRows } from "@/data/fetch-all";
import { booksToCsv } from "@/lib/export";
import { guardApiRequest, jsonError } from "@/utils/api/route";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: NextRequest) {
  const guard = await guardApiRequest({ bucket: "export", limit: 10, windowMs: 60_000 });
  if ("response" in guard) return guard.response;
  const format = request.nextUrl.searchParams.get("format");
  if (format !== "json" && format !== "csv")
    return jsonError(400, "invalid_parameters", "Choose json or csv.");

  const supabase = await createClient();
  const me = guard.userId;
  // Every query is scoped to the reader's own rows: never other people's records.
  const all = <T>(table: "user_books" | "reading_sessions" | "chapter_boundaries") =>
    fetchAllRows<T>(
      (from, to) =>
        supabase.from(table).select("*").eq("user_id", me).order("id").range(from, to) as never,
    );
  const today = new Date().toISOString().slice(0, 10);
  const headers = (name: string, type: string) => ({
    "Content-Type": type,
    "Content-Disposition": `attachment; filename="${name}"`,
    "Cache-Control": "private, no-store",
  });

  const books = await all<Record<string, unknown>>("user_books");
  if (format === "csv") {
    return new NextResponse(booksToCsv(books), {
      headers: headers(`reading-room-books-${today}.csv`, "text/csv; charset=utf-8"),
    });
  }
  const [sessions, chapters, profile, goals, goalHistory, shelf] = await Promise.all([
    all("reading_sessions"),
    all("chapter_boundaries"),
    supabase
      .from("profiles")
      .select("*")
      .eq("id", me)
      .single()
      .then((r) => r.data),
    supabase
      .from("reading_goals")
      .select("*")
      .eq("user_id", me)
      .then((r) => r.data ?? []),
    supabase
      .from("reading_goal_history")
      .select("*")
      .eq("user_id", me)
      .then((r) => r.data ?? []),
    supabase
      .from("shelf_settings")
      .select("*")
      .eq("user_id", me)
      .maybeSingle()
      .then((r) => r.data),
  ]);
  const backup = {
    exported_at: new Date().toISOString(),
    profile,
    books,
    sessions,
    chapters,
    goals,
    goalHistory,
    shelf,
  };
  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: headers(`reading-room-backup-${today}.json`, "application/json"),
  });
}
