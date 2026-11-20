"use client";

import { useRouter } from "next/navigation";

import { formatDate, formatRating, statusText } from "@/lib/book-display";
import type { LibraryBook } from "@/data/library";

const COLUMNS: [key: string, label: string, cell: (b: LibraryBook) => React.ReactNode][] = [
  [
    "title",
    "Title",
    (b) => (
      <>
        <strong>{b.title}</strong>
        {b.favorite && <span className="heart"> ♥</span>}
      </>
    ),
  ],
  ["author", "Author", (b) => b.author || "—"],
  ["genre", "Assigned genres", (b) => b.genres.join(", ") || "Uncategorized"],
  ["status", "Shelf", (b) => statusText(b.status)],
  ["rating", "Rating", (b) => formatRating(b.rating) ?? "—"],
  ["page_count", "Pages", (b) => b.page_count ?? "—"],
  ["isbn", "ISBN", (b) => b.isbn || "—"],
  ["asin", "ASIN", (b) => b.asin || "—"],
  ["publisher", "Publisher", (b) => b.publisher || "—"],
  ["binding", "Binding", (b) => b.binding || "—"],
  ["edition_year", "Edition year", (b) => b.edition_year ?? "—"],
  ["original_published_year", "Original year", (b) => b.original_published_year ?? "—"],
  ["goodreads_added_on", "Goodreads added", (b) => formatDate(b.goodreads_added_on)],
  ["tbr_added_on", "TBR added", (b) => formatDate(b.tbr_added_on)],
  ["started_on", "Started", (b) => formatDate(b.started_on)],
  ["finished_on", "Finished", (b) => formatDate(b.finished_on)],
];

type Props = {
  books: LibraryBook[];
  sort: string;
  sortDirection: "asc" | "desc";
  onSort: (column: string) => void;
};

export function LibraryTable({ books, sort, sortDirection, onSort }: Props) {
  const router = useRouter();
  const open = (id: string) => router.push(`/books/${id}`);
  return (
    <>
      <div
        className="library-table-wrap"
        role="region"
        aria-label="Full library table"
        tabIndex={0}
      >
        <table className="library-table">
          <thead>
            <tr>
              {COLUMNS.map(([key, label]) => (
                <th
                  key={key}
                  scope="col"
                  aria-sort={
                    sort === key ? (sortDirection === "asc" ? "ascending" : "descending") : "none"
                  }
                >
                  <button type="button" onClick={() => onSort(key)}>
                    {label}
                    {sort === key ? (sortDirection === "asc" ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {books.map((book) => (
              <tr
                key={book.id}
                tabIndex={0}
                aria-label={`Open details for ${book.title}`}
                onClick={() => open(book.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    open(book.id);
                  }
                }}
              >
                {COLUMNS.map(([key, , cell], i) => (
                  <td key={key} className={i === 0 ? "title-cell" : undefined}>
                    {cell(book)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tiny table-hint">
        Select a row to view or edit details. Click a column heading to sort. Swipe sideways on a
        phone to see every field.
      </p>
    </>
  );
}
