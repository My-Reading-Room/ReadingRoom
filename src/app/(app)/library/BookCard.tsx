import Link from "next/link";

import { BookCover } from "@/components/BookCover";
import { ACTIVITY_LABELS, formatRating, statusText } from "@/lib/book-display";
import type { LibraryBook } from "@/data/library";

export function BookCard({ book }: { book: LibraryBook }) {
  const progress =
    book.status === "reading" && book.page_count
      ? Math.min(100, Math.round(((book.current_page || 0) / book.page_count) * 100))
      : null;
  return (
    <Link className="book-card" href={`/books/${book.id}`}>
      <BookCover title={book.title} author={book.author} coverUrl={book.cover_url} />
      <div className="book-card-body">
        <div className="book-card-title">
          {book.title}{" "}
          {book.favorite && (
            <span className="heart" aria-label="Favorite">
              ♥
            </span>
          )}
        </div>
        <div className="book-card-author">{book.author}</div>
        <div className="book-meta">
          <span className={`status-pill ${book.status}`}>{statusText(book.status)}</span>
          <br />
          {formatRating(book.rating) ?? "Unrated"}
          {book.page_count ? ` · ${book.page_count} pages` : ""}
        </div>
        {book.modes.length > 0 && (
          <div className="book-modes">
            {book.modes.map((mode) => (
              <span key={mode} className={`status-pill activity-${mode}`}>
                {ACTIVITY_LABELS[mode]}
              </span>
            ))}
          </div>
        )}
        {progress !== null && (
          <>
            <div
              className="progress"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Reading progress"
            >
              <div style={{ width: `${progress}%` }} />
            </div>
            <span className="tiny">{progress}% complete</span>
          </>
        )}
      </div>
    </Link>
  );
}
