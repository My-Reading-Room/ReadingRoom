"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  lookupBookOnRequest,
  mergeReviewedMetadata,
  type MetadataLookup,
} from "@/lib/book-detail-metadata";
import { fillMissingSeriesFields, normalizeSeriesResult } from "@/lib/series-catalog";
import { seriesMetadata } from "@/lib/series-insights";
import type { UserBook } from "@/lib/types";
import { catalogServer } from "@/utils/catalog-server";
import { serverEnv } from "@/utils/server-env";
import { requireUser } from "@/utils/supabase/server";

import type { BookActionState } from "./actions";

async function ownBook(id: string) {
  if (!z.guid().safeParse(id).success) return null;
  const { supabase, claims } = await requireUser();
  const { data } = await supabase
    .from("user_books")
    .select("*")
    .eq("id", id)
    .eq("user_id", claims.sub)
    .maybeSingle();
  return data ? { supabase, userId: claims.sub, book: data } : null;
}

/** Only bibliographic fields a lookup may suggest, with sane bounds. */
const suggestion = z.object({
  matchLevel: z.enum(["isbn", "edition", "work"]),
  metadata: z
    .object({
      genres: z.array(z.string().max(60)).max(20).optional(),
      description: z.string().max(10_000).nullish(),
      publisher: z.string().max(300).nullish(),
      binding: z.string().max(80).nullish(),
      page_count: z.number().int().positive().max(100_000).nullish(),
      published_year: z.number().int().min(1000).max(2100).nullish(),
      edition_year: z.number().int().min(1000).max(2100).nullish(),
      original_published_year: z.number().int().min(1000).max(2100).nullish(),
      work_key: z
        .string()
        .regex(/^\/works\/OL\d+W$/)
        .nullish()
        .or(z.literal("")),
      edition_key: z
        .string()
        .regex(/^(\/books\/OL\d+M|google:[\w-]{1,40})$/)
        .nullish()
        .or(z.literal("")),
      isbn: z.string().max(20).nullish(),
      cover_url: z.string().max(2048).nullish(),
    })
    .strip(),
});

const LOOKUP_COLUMNS = [
  "genres",
  "description",
  "publisher",
  "binding",
  "page_count",
  "published_year",
  "edition_year",
  "original_published_year",
  "work_key",
  "edition_key",
  "isbn",
  "cover_url",
] as const;

export type LookupResult = { lookup?: MetadataLookup; error?: string };

/** Ask the catalogs about this saved book (server-side; the Google key stays here). */
export async function lookupMetadata(id: string): Promise<LookupResult> {
  const owned = await ownBook(id);
  if (!owned) return { error: "Only the owner can look up metadata." };
  try {
    return { lookup: await lookupBookOnRequest(owned.book, catalogServer().googleKey) };
  } catch (error) {
    return { error: (error as Error).message || "Catalog lookup failed." };
  }
}

/** Fill blank fields from reviewed suggestions; optionally use the suggested cover. */
export async function applyMetadata(
  id: string,
  _prev: BookActionState,
  formData: FormData,
): Promise<BookActionState> {
  const owned = await ownBook(id);
  if (!owned) return { error: "Only the owner can apply metadata." };
  let parsed;
  try {
    parsed = suggestion.safeParse(JSON.parse(String(formData.get("lookup") ?? "")));
  } catch {
    return { error: "The suggestions could not be read. Look up again." };
  }
  if (!parsed.success) return { error: "The suggestions were not valid. Look up again." };
  let merged: UserBook;
  try {
    merged = mergeReviewedMetadata(owned.book, parsed.data, {
      useCover: formData.get("useCover") === "on",
    });
  } catch (error) {
    return { error: (error as Error).message };
  }
  const changes = Object.fromEntries(
    LOOKUP_COLUMNS.map((k) => [k, merged[k]]),
  ) as Partial<UserBook>;
  const { error } = await owned.supabase
    .from("user_books")
    .update(changes)
    .eq("id", owned.book.id)
    .eq("user_id", owned.userId);
  if (error) return { error: "Could not save the suggestions." };
  revalidatePath(`/books/${owned.book.id}`);
  revalidatePath("/library");
  return { message: "Missing details applied. Your existing values were kept." };
}

/**
 * Fill missing series name/number/total from List Of Books. The server repeats
 * the lookup with its own key instead of trusting a result sent by the browser.
 */
export async function applySeriesDetails(id: string): Promise<BookActionState> {
  const owned = await ownBook(id);
  if (!owned) return { error: "Only the owner can edit series details." };
  const key = serverEnv.listOfBooksApiKey();
  if (!key) return { error: "Series catalog lookup is not configured." };
  const name = seriesMetadata(owned.book).series_name;
  const params = new URLSearchParams(
    name ? { series: name } : { title: owned.book.title, author: owned.book.author },
  );
  const path = name ? "get-reading-order" : "find-series-for-book";
  const res = await fetch(`https://www.listofbooks.net/api/public/v1/${path}?${params}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(8500),
  }).catch(() => null);
  if (!res?.ok) return { error: "Series catalog is temporarily unavailable." };
  const data = await res.json().catch(() => ({}));
  const updated = fillMissingSeriesFields(owned.book, normalizeSeriesResult(data?.results?.[0]));
  if (!updated) return { message: "No missing series fields to fill." };
  const { error } = await owned.supabase
    .from("user_books")
    .update({
      series_name: updated.series_name,
      series_number: updated.series_number,
      series_total: updated.series_total,
      series_total_source: updated.series_total_source,
      series_source_url: updated.series_source_url,
    })
    .eq("id", owned.book.id)
    .eq("user_id", owned.userId);
  if (error) return { error: "Could not save series details." };
  revalidatePath(`/books/${owned.book.id}`);
  return { message: "Saved missing series details from List Of Books." };
}
