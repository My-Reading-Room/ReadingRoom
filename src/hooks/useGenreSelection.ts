"use client";

import { useCallback, useState } from "react";

import {
  addSelectedGenre,
  primarySelectedGenre,
  removeSelectedGenre,
  selectedGenres,
} from "@/lib/book-detail-metadata";

/**
 * Genre chips for a book: add from the standard list, remove, or make one
 * primary (first = primary for Insights). Existing nonstandard labels survive
 * unrelated edits but can't be newly added.
 */
export function useGenreSelection(initial: string[]) {
  const [genres, setGenres] = useState(() => selectedGenres(initial));
  const [error, setError] = useState<string | null>(null);

  const run = useCallback((change: (current: string[]) => string[]) => {
    setGenres((current) => {
      try {
        setError(null);
        return change(current);
      } catch (e) {
        setError((e as Error).message);
        return current;
      }
    });
  }, []);

  return {
    genres,
    error,
    add: (genre: string) => run((g) => addSelectedGenre(g, genre)),
    remove: (genre: string) => run((g) => removeSelectedGenre(g, genre)),
    makePrimary: (genre: string) => run((g) => primarySelectedGenre(g, genre)),
  };
}
