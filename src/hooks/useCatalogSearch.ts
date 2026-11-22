"use client";

import { useCallback, useState } from "react";

import type { CatalogBook } from "@/lib/catalog";

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "The book catalog is temporarily unavailable.");
  return data as T;
}

/** Catalog search through our sign-in-only API (the browser never calls the catalogs). */
export function useCatalogSearch() {
  const [results, setResults] = useState<CatalogBook[]>([]);
  const [editions, setEditions] = useState<CatalogBook[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async <T>(task: () => Promise<T>) => {
    setBusy(true);
    setError(null);
    try {
      return await task();
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const search = useCallback(
    (query: string) =>
      run(async () => {
        const { results } = await getJSON<{ results: CatalogBook[] }>(
          `/api/books/search?q=${encodeURIComponent(query)}`,
        );
        setResults(results);
        if (!results.length)
          setError("No matching books found. Try another search or add it manually.");
        return results;
      }),
    [run],
  );

  const loadEditions = useCallback(
    (work: CatalogBook) =>
      run(async () => {
        const q = new URLSearchParams({ work: work.key, title: work.title, author: work.author });
        const { editions } = await getJSON<{ editions: CatalogBook[] }>(`/api/books/editions?${q}`);
        setEditions(editions);
        return editions;
      }),
    [run],
  );

  return { results, editions, busy, error, search, loadEditions };
}
