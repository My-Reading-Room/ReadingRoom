"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";

import {
  newCatalogBook,
  newManualBook,
  type AddResult,
  type ManualBookInput,
} from "@/lib/book-add";
import { seriesMetadata } from "@/lib/series-insights";
import { clientToday } from "@/utils/client-date";
import { lookupSeriesOnServer, seriesChanges } from "@/utils/series-catalog-server";
import { requireUser } from "@/utils/supabase/server";

export type AddState = { error?: string };

/** A catalog result chosen in the browser: only bibliographic fields, bounded. */
const catalogEdition = z
  .object({
    kind: z.enum(["work", "edition"]),
    source: z.enum(["openlibrary", "googlebooks"]).optional(),
    key: z.string().max(80),
    edition_key: z
      .string()
      .regex(/^(\/books\/OL\d+M|google:[\w-]{1,40})$/)
      .optional()
      .or(z.literal("")),
    work_key: z
      .string()
      .regex(/^\/works\/OL\d+W$/)
      .optional()
      .or(z.literal("")),
    title: z.string().trim().min(1).max(500),
    author: z.string().max(300).default(""),
    isbn: z.string().max(20).optional(),
    description: z.string().max(10_000).optional(),
    publisher: z.string().max(300).optional(),
    binding: z.string().max(80).nullish(),
    page_count: z.number().int().positive().max(100_000).nullish(),
    published_year: z.number().int().min(1000).max(2100).nullish(),
    edition_year: z.number().int().min(1000).max(2100).nullish(),
    original_published_year: z.number().int().min(1000).max(2100).nullish(),
    cover_url: z.string().max(2048).optional(),
    genres: z.array(z.string().max(60)).max(20).optional(),
  })
  .strip();

async function context() {
  const { supabase, claims } = await requireUser();
  const { data, count } = await supabase
    .from("user_books")
    .select("title,author,isbn", { count: "exact" })
    .eq("user_id", claims.sub);
  return { supabase, userId: claims.sub, existing: data ?? [], order: (count ?? 0) + 1 };
}

async function insertAndOpen(
  ctx: Awaited<ReturnType<typeof context>>,
  result: AddResult,
): Promise<AddState> {
  if ("error" in result) return { error: result.error };
  // user_id always comes from the session (set by toLibraryBook from ctx.userId).
  const { error } = await ctx.supabase.from("user_books").insert(result.book);
  if (error) return { error: "Could not add the book. Try again." };
  revalidatePath("/library");
  // Legacy enrichOneSeriesOnAdd: once the response is sent, fill blank series
  // fields from List Of Books (when configured). Adding never waits on it.
  const { id } = result.book;
  after(async () => {
    try {
      const { data: book } = await ctx.supabase
        .from("user_books")
        .select("*")
        .eq("id", id)
        .eq("user_id", ctx.userId)
        .single();
      if (!book) return;
      const name = seriesMetadata(book).series_name;
      const details = await lookupSeriesOnServer(
        name ? { series: name } : { title: book.title, author: book.author },
      );
      if (!details || details === "unconfigured") return;
      const changes = seriesChanges(book, details);
      if (changes)
        await ctx.supabase
          .from("user_books")
          .update(changes)
          .eq("id", id)
          .eq("user_id", ctx.userId);
    } catch {
      // The book is already added; series details can be looked up later.
    }
  });
  redirect(`/books/${id}?added=1`);
}

export async function addCatalogBook(_prev: AddState, formData: FormData): Promise<AddState> {
  let edition;
  try {
    edition = catalogEdition.safeParse(JSON.parse(String(formData.get("edition") ?? "")));
  } catch {
    return { error: "Choose a book from the search results." };
  }
  if (!edition.success)
    return {
      error: "That catalog result couldn't be used. Try another edition or add it manually.",
    };
  const ctx = await context();
  const result = newCatalogBook(
    edition.data,
    {
      status: String(formData.get("status") ?? "tbr"),
      pages: String(formData.get("pages") ?? "").trim(),
    },
    {
      userId: ctx.userId,
      today: clientToday(formData.get("today")),
      existing: ctx.existing,
      order: ctx.order,
    },
  );
  return insertAndOpen(ctx, result);
}

const MANUAL_FIELDS: (keyof ManualBookInput)[] = [
  "title",
  "author",
  "pages",
  "isbn",
  "asin",
  "genres",
  "coverUrl",
  "year",
  "status",
];

export async function addManualBook(_prev: AddState, formData: FormData): Promise<AddState> {
  const ctx = await context();
  const input = Object.fromEntries(
    MANUAL_FIELDS.map((k) => [k, String(formData.get(k) ?? "")]),
  ) as ManualBookInput;
  const result = newManualBook(input, {
    userId: ctx.userId,
    today: clientToday(formData.get("today")),
    existing: ctx.existing,
    order: ctx.order,
  });
  return insertAndOpen(ctx, result);
}
