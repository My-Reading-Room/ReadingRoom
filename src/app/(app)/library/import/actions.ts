"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { fetchAllRows } from "@/data/fetch-all";
import { allowedCoverUrl } from "@/lib/cover-hosts";
import { isValidISBN, normalizeISBN } from "@/lib/book-detail-metadata";
import { prepareGoodreadsImport } from "@/lib/goodreads-import";
import { ENRICH_BATCH, IMPORT_BATCH } from "@/lib/import-limits";
import {
  ENRICH_FIELDS,
  enrichAfterGoodreadsImport,
  needsImportEnrichment,
} from "@/lib/import-enrichment";
import type { UserBook } from "@/lib/types";
import { rateLimit } from "@/utils/api/rate-limit";
import { catalogServer } from "@/utils/catalog-server";
import { requireUser } from "@/utils/supabase/server";

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullish()
  .transform((v) => v ?? null);
const text = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((v) => (v ? v.trim() || null : null));
const year = z
  .number()
  .int()
  .min(0)
  .max(2100)
  .nullish()
  .transform((v) => v ?? null);

/**
 * One parsed Goodreads row as sent by the browser. Only columns a CSV import
 * may set; ids, owner and bookkeeping are always decided on the server.
 */
const importRow = z
  .object({
    title: z.string().trim().min(1).max(500),
    author: z.string().trim().max(300).default(""),
    isbn: z
      .string()
      .max(20)
      .nullish()
      .transform((v) => {
        const n = normalizeISBN(v ?? "");
        return n && isValidISBN(n) ? n : null;
      }),
    published_year: year,
    edition_year: year,
    original_published_year: year,
    publisher: text(300),
    binding: text(80),
    page_count: z
      .number()
      .int()
      .positive()
      .max(100_000)
      .nullish()
      .transform((v) => v ?? null),
    genres: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
    series_name: text(300),
    series_number: z
      .number()
      .min(0)
      .max(10_000)
      .nullish()
      .transform((v) => v ?? null),
    status: z.enum(["tbr", "reading", "finished", "dnf"]),
    favorite: z.boolean().default(false),
    rating: z
      .number()
      .min(0.25)
      .max(5)
      .refine((r) => Number.isInteger(r * 4))
      .nullish()
      .transform((v) => v ?? null),
    tbr_added_on: date,
    goodreads_added_on: date,
    started_on: date,
    finished_on: date,
    current_page: z.number().int().min(0).max(100_000).default(0),
    read_history: z
      .array(
        z
          .object({
            number: z.number().int().min(1).max(100),
            status: z.enum(["reading", "finished", "dnf"]),
            started_on: date,
            finished_on: date,
          })
          .strip(),
      )
      .max(100)
      .default([]),
    notes: z.string().max(20_000).default(""),
    _grReadCount: z.number().int().min(0).max(1000).optional(),
  })
  .strip();

const IMPORT_COLUMNS = Object.keys(importRow.shape).filter(
  (k) => k !== "_grReadCount",
) as (keyof UserBook)[];

export type ImportBatchResult = {
  error?: string;
  added?: number;
  updated?: number;
  skipped?: number;
  existing?: number;
  /** Books in this batch, for the metadata step. */
  ids?: string[];
};

async function ownBooks() {
  const { supabase, claims } = await requireUser();
  const books = await fetchAllRows<UserBook>((from, to) =>
    supabase.from("user_books").select("*").eq("user_id", claims.sub).order("id").range(from, to),
  );
  return { supabase, userId: claims.sub, books };
}

/**
 * Save up to 200 parsed rows. New books are inserted; books already in the
 * library get only their blank fields filled (legacy mergeGoodreadsBook).
 * The duplicate check runs here against the reader's own books.
 */
export async function importGoodreadsBatch(rows: unknown): Promise<ImportBatchResult> {
  const parsed = z.array(importRow).min(1).max(IMPORT_BATCH).safeParse(rows);
  if (!parsed.success)
    return {
      error: "Some rows in this file could not be read. Check that it is a Goodreads export.",
    };
  const { supabase, userId, books } = await ownBooks();
  const limited = rateLimit(`goodreads-import:${userId}`, { limit: 60, windowMs: 60 * 60_000 });
  if (!limited.ok) return { error: "Too many imports in a short time. Try again later." };

  const plan = prepareGoodreadsImport(parsed.data, books);
  let order = books.reduce((max, b) => Math.max(max, b.shelf_order || 0), 0);
  const inserts = plan.additions.map((row) => ({
    ...Object.fromEntries(IMPORT_COLUMNS.map((k) => [k, (row as Record<string, unknown>)[k]])),
    user_id: userId,
    shelf_order: ++order,
  }));
  const ids: string[] = [];
  if (inserts.length) {
    const { data, error } = await supabase
      .from("user_books")
      .insert(inserts as never)
      .select("id");
    if (error) return { error: "Could not save the imported books." };
    ids.push(...(data ?? []).map((r) => r.id));
  }
  for (const merged of plan.updates) {
    const before = books.find((b) => b.id === merged.id)!;
    const changes = Object.fromEntries(
      IMPORT_COLUMNS.filter(
        (k) => JSON.stringify(merged[k] ?? null) !== JSON.stringify(before[k] ?? null),
      ).map((k) => [k, merged[k]]),
    );
    const { error } = await supabase
      .from("user_books")
      .update(changes as Partial<UserBook>)
      .eq("id", before.id)
      .eq("user_id", userId);
    if (error) return { error: "Could not update an existing book." };
  }
  ids.push(
    ...plan.all
      .map((b) => (b as { id?: string }).id)
      .filter((id): id is string => !!id && books.some((x) => x.id === id)),
  );
  revalidatePath("/library");
  return {
    added: inserts.length,
    updated: plan.updates.length,
    skipped: plan.skipped.length,
    existing: plan.existing,
    ids: [...new Set(ids)],
  };
}

/** The reader's books that are still missing catalog metadata (legacy "Fill missing metadata"). */
export async function booksNeedingMetadata(): Promise<string[]> {
  const { books } = await ownBooks();
  return books.filter(needsImportEnrichment).map((b) => b.id);
}

export type EnrichResult = {
  error?: string;
  saved?: number;
  genreFilled?: number;
  editionMatched?: number;
  unresolved?: number;
  errors?: number;
};

/**
 * Fill blank catalog fields on a few of the reader's books. Runs on the server
 * so the Google key stays here and Open Library sees one paced client.
 * Only ENRICH_FIELDS that were blank can change; covers must be allow-listed.
 */
export async function enrichBooks(ids: unknown): Promise<EnrichResult> {
  const parsed = z.array(z.guid()).min(1).max(ENRICH_BATCH).safeParse(ids);
  if (!parsed.success) return { error: "Choose books to look up." };
  const { supabase, claims } = await requireUser();
  const limited = rateLimit(`enrich:${claims.sub}`, { limit: 150, windowMs: 60 * 60_000 });
  if (!limited.ok)
    return {
      error:
        "Metadata lookups are paused for a while to respect the catalogs’ limits. Try again later.",
    };
  const { data: books } = await supabase
    .from("user_books")
    .select("*")
    .eq("user_id", claims.sub)
    .in("id", parsed.data);
  if (!books?.length)
    return { saved: 0, genreFilled: 0, editionMatched: 0, unresolved: 0, errors: 0 };
  const result = await enrichAfterGoodreadsImport(books, {
    googleKey: catalogServer().googleKey,
    // The server's catalog client already paces Open Library for everyone.
    pacingMs: 0,
    // Series totals stay a per-book lookup on the book page.
    seriesConfigured: async () => false,
    save: async (book) => {
      const changes = Object.fromEntries(ENRICH_FIELDS.map((k) => [k, book[k] ?? null]));
      changes.cover_url = allowedCoverUrl(changes.cover_url as string | null) ?? null;
      const { error } = await supabase
        .from("user_books")
        .update(changes as Partial<UserBook>)
        .eq("id", book.id)
        .eq("user_id", claims.sub);
      if (error) throw new Error(error.message);
    },
  });
  revalidatePath("/library");
  return {
    saved: result.saved,
    genreFilled: result.genreFilled,
    editionMatched: result.editionMatched,
    unresolved: result.unresolved,
    errors: result.errors,
  };
}
