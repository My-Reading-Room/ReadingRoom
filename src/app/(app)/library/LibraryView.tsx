"use client";

import { useMemo } from "react";

import { useLibraryFilters } from "@/hooks/useLibraryFilters";
import { ACTIVITY_LABELS } from "@/lib/book-display";
import { availableGenres, filterLibraryBooks } from "@/lib/library-view";
import type { LibraryBook } from "@/data/library";

import { BookCard } from "./BookCard";
import { LibraryTable } from "./LibraryTable";

const SHELVES: [id: string, label: string][] = [
  ["all", "All Books"],
  ["tbr", "TBR"],
  ["reading", "Reading"],
  ["finished", "Finished"],
  ["dnf", "DNF"],
  ["favorites", "♥ Favorites"],
];

export function LibraryView({ books }: { books: LibraryBook[] }) {
  const { filters, update, toggleSort } = useLibraryFilters();
  const genres = useMemo(() => availableGenres(books), [books]);
  // A genre in the URL that no longer exists falls back to all genres.
  const genre = ["all", "__uncategorized__", ...genres].includes(filters.genre)
    ? filters.genre
    : "all";

  const list = useMemo(
    () =>
      filterLibraryBooks(books, {
        shelf: filters.shelf,
        mode: filters.mode,
        genre,
        query: filters.query,
        modeForBook: (book) => book.modes,
        sort: filters.sort,
        sortDirection: filters.sortDirection,
      }),
    [books, filters, genre],
  );

  return (
    <>
      <div className="toolbar library-filter-toolbar">
        <input
          className="input library-search"
          type="search"
          value={filters.query}
          onChange={(e) => update({ query: e.target.value })}
          placeholder="Search your library..."
          aria-label="Search your library"
        />
        {SHELVES.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`btn sm ${filters.shelf === id ? "selected" : ""}`}
            aria-pressed={filters.shelf === id}
            onClick={() => update({ shelf: id })}
          >
            {label}
          </button>
        ))}
        <select
          className="select"
          aria-label="Filter library by reading mode"
          value={filters.mode}
          onChange={(e) => update({ mode: e.target.value })}
        >
          <option value="all">All reading modes</option>
          {Object.entries(ACTIVITY_LABELS).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <select
          className="select"
          aria-label="Filter library by genre"
          value={genre}
          onChange={(e) => update({ genre: e.target.value })}
        >
          <option value="all">All genres</option>
          <option value="__uncategorized__">Uncategorized</option>
          {genres.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>

      <div className="library-view-row">
        <span className="text-sm muted" role="status">
          Showing <strong>{list.length}</strong> of {books.length} books
          {genre !== "all" ? ` · ${genre === "__uncategorized__" ? "Uncategorized" : genre}` : ""}
        </span>
        <div className="library-view-toggle" role="group" aria-label="Library display mode">
          {(["cards", "table"] as const).map((view) => (
            <button
              key={view}
              type="button"
              className={`btn sm ${filters.view === view ? "selected" : ""}`}
              aria-pressed={filters.view === view}
              onClick={() => update({ view })}
            >
              {view === "cards" ? "Cards" : "Table"}
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="empty-state">
          <strong>No books here</strong>
          <p className="text-sm muted">Try a different genre, shelf, mode, or search term.</p>
        </div>
      ) : filters.view === "table" ? (
        <LibraryTable
          books={list}
          sort={filters.sort}
          sortDirection={filters.sortDirection}
          onSort={toggleSort}
        />
      ) : (
        <div className="book-grid">
          {list.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>
      )}
    </>
  );
}
