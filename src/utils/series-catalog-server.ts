import "server-only";

import {
  fillMissingSeriesFields,
  normalizeSeriesResult,
  type SeriesLookup,
} from "@/lib/series-catalog";
import type { UserBook } from "@/lib/types";

import { serverEnv } from "./server-env";

/**
 * Ask List Of Books for a series (by name) or for the series a book belongs to.
 * Server-only: the API key never leaves the server. Returns null when the
 * service isn't configured or doesn't answer.
 */
export async function lookupSeriesOnServer(
  query: { series: string } | { title: string; author: string },
): Promise<SeriesLookup | null | "unconfigured"> {
  const key = serverEnv.listOfBooksApiKey();
  if (!key) return "unconfigured";
  const path = "series" in query ? "get-reading-order" : "find-series-for-book";
  const res = await fetch(
    `https://www.listofbooks.net/api/public/v1/${path}?${new URLSearchParams(query)}`,
    {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(8500),
    },
  ).catch(() => null);
  if (!res?.ok) return null;
  const data = await res.json().catch(() => ({}));
  return normalizeSeriesResult(data?.results?.[0]);
}

/** Column values to save when a lookup fills a book's blank series fields. */
export function seriesChanges(
  book: UserBook,
  details: SeriesLookup | null,
): Partial<UserBook> | null {
  const updated = fillMissingSeriesFields(book, details);
  if (!updated) return null;
  return {
    series_name: updated.series_name,
    series_number: updated.series_number,
    series_total: updated.series_total,
    series_total_source: updated.series_total_source,
    series_source_url: updated.series_source_url,
  } as Partial<UserBook>;
}
