"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

export type LibraryFilters = {
  shelf: string;
  mode: string;
  genre: string;
  query: string;
  sort: string;
  sortDirection: "asc" | "desc";
  view: "cards" | "table";
};

const DEFAULTS: LibraryFilters = {
  shelf: "all",
  mode: "all",
  genre: "all",
  query: "",
  sort: "shelf_order",
  sortDirection: "asc",
  view: "cards",
};

const KEYS: Record<keyof LibraryFilters, string> = {
  shelf: "shelf",
  mode: "mode",
  genre: "genre",
  query: "q",
  sort: "sort",
  sortDirection: "dir",
  view: "view",
};

/**
 * Library filter state kept in the URL, so Back/Forward, refresh and shared
 * links restore the same view. Defaults are omitted to keep URLs short.
 */
export function useLibraryFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters = useMemo<LibraryFilters>(() => {
    const read = <K extends keyof LibraryFilters>(key: K) =>
      (params.get(KEYS[key]) ?? DEFAULTS[key]) as LibraryFilters[K];
    return {
      shelf: read("shelf"),
      mode: read("mode"),
      genre: read("genre"),
      query: read("query"),
      sort: read("sort"),
      sortDirection: read("sortDirection") === "desc" ? "desc" : "asc",
      view: read("view") === "table" ? "table" : "cards",
    };
  }, [params]);

  const update = useCallback(
    (changes: Partial<LibraryFilters>) => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(changes) as [keyof LibraryFilters, string][]) {
        if (value === DEFAULTS[key] || value === "") next.delete(KEYS[key]);
        else next.set(KEYS[key], value);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  /** Clicking the active column flips direction; a new column starts ascending. */
  const toggleSort = useCallback(
    (column: string) =>
      update({
        sort: column,
        sortDirection: filters.sort === column && filters.sortDirection === "asc" ? "desc" : "asc",
      }),
    [filters.sort, filters.sortDirection, update],
  );

  return { filters, update, toggleSort };
}
