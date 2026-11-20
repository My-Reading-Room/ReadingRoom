import type { Metadata } from "next";
import Link from "next/link";

import { BookCover } from "@/components/BookCover";
import { getBookDetail } from "@/data/books";
import { formatDate, formatRating, statusText } from "@/lib/book-display";
import { seriesMetadata } from "@/lib/series-insights";

import { BookActions } from "./BookActions";
import { BookEditForm } from "./BookEditForm";
import { ReadHistoryCard, ReadingDaysCard, SpeedCard } from "./BookInsights";

export async function generateMetadata({ params }: PageProps<"/books/[id]">): Promise<Metadata> {
  const { book } = await getBookDetail((await params).id);
  return { title: book.title };
}

const formatMinutes = (minutes: number) =>
  minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;

export default async function BookPage({ params }: PageProps<"/books/[id]">) {
  const { book, editable, sessions } = await getBookDetail((await params).id);
  const today = new Date().toISOString().slice(0, 10);
  const minutes = sessions.reduce(
    (n, s) => n + (s.duration_minutes > 0 ? s.duration_minutes : 0),
    0,
  );
  const pages = sessions.reduce(
    (n, s) => n + (s.pages_read && s.pages_read > 0 ? s.pages_read : 0),
    0,
  );
  const audioPages = sessions
    .filter((s) => s.activity_mode === "audiobook")
    .reduce((n, s) => n + (s.pages_read && s.pages_read > 0 ? s.pages_read : 0), 0);
  const series = seriesMetadata(book);

  return (
    <article className="book-detail">
      <Link href="/library" className="back-link">
        ← My Library
      </Link>
      <div className="detail-top">
        <BookCover title={book.title} author={book.author} coverUrl={book.cover_url} size="large" />
        <div className="book-blurb">
          <h1 className="heading">{book.title}</h1>
          <p className="subtitle">{book.author}</p>
          <div className="text-sm muted">
            {book.page_count ? `${book.page_count} pages · ` : ""}
            {book.edition_year || book.published_year || "Publication year unknown"}
            {book.isbn ? ` · ISBN ${book.isbn}` : ""}
          </div>
          <div className="tiny">
            {book.publisher || "Publisher not recorded"}
            {book.binding ? ` · ${book.binding}` : ""}
            {book.original_published_year
              ? ` · First published ${book.original_published_year}`
              : ""}
            {book.edition_key ? " · Matched edition" : " · Edition not verified"}
          </div>
          <div className="detail-pills">
            <span className={`status-pill ${book.status}`}>{statusText(book.status)}</span>
            {book.favorite && <span className="heart"> ♥</span>}
          </div>
          <div className="tiny">
            {sessions.length} reading sessions · {formatMinutes(minutes)} total · {pages} pages
            progressed ({audioPages} audiobook equivalents){book.asin ? ` · ASIN ${book.asin}` : ""}
          </div>
        </div>
      </div>

      {editable ? (
        <>
          <BookActions
            bookId={book.id}
            title={book.title}
            favorite={book.favorite}
            canReread={["finished", "dnf"].includes(book.status)}
          />
          <BookEditForm key={book.updated_at} book={book} />
        </>
      ) : (
        <section className="card soft">
          <p className="text-sm">
            Personal rating: <strong>{formatRating(book.rating) ?? "Unrated"}</strong>
          </p>
          <p className="text-sm">
            Progress:{" "}
            <strong>
              {book.current_page || 0} of {book.page_count || "unknown"} pages
            </strong>
          </p>
          {series.series_name && (
            <p className="text-sm">
              Series: {series.series_name} #{series.series_number ?? "—"}
              {book.series_total ? ` of ${book.series_total}` : ""}
            </p>
          )}
          <p className="text-sm">
            Dates: {formatDate(book.started_on)} – {formatDate(book.finished_on)}
          </p>
          {book.notes && <p className="text-sm">Notes: {book.notes}</p>}
          <p className="tiny">Partner books are view-only.</p>
        </section>
      )}

      <div className="book-insights">
        <ReadHistoryCard book={book} />
        <ReadingDaysCard book={book} sessions={sessions} today={today} />
        <SpeedCard sessions={sessions} />
      </div>
    </article>
  );
}
