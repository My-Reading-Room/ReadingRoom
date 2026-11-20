import type { Metadata } from "next";
import Link from "next/link";

import { BookCover } from "@/components/BookCover";
import { getBookDetail } from "@/data/books";
import { formatDate, formatRating, statusText } from "@/lib/book-display";
import { seriesMetadata } from "@/lib/series-insights";

import { BookActions } from "./BookActions";
import { BookEditForm } from "./BookEditForm";
import { ChaptersTab } from "./ChaptersTab";
import { MetadataLookupCard } from "./MetadataLookupCard";
import { SeriesLookupCard } from "./SeriesLookupCard";
import { ReadHistoryCard, ReadingDaysCard, SpeedCard } from "./BookInsights";
import { ReadHistoryEditor } from "./ReadHistoryEditor";
import { readingPasses } from "@/lib/reading-history";

export async function generateMetadata({ params }: PageProps<"/books/[id]">): Promise<Metadata> {
  const { book } = await getBookDetail((await params).id);
  return { title: book.title };
}

const formatMinutes = (minutes: number) =>
  minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;

const TABS = ["details", "chapters", "history"] as const;
type Tab = (typeof TABS)[number];

export default async function BookPage({ params, searchParams }: PageProps<"/books/[id]">) {
  const { book, editable, sessions, chapters } = await getBookDetail((await params).id);
  const requested = (await searchParams).tab;
  const tab: Tab = TABS.includes(requested as Tab) ? (requested as Tab) : "details";
  const passCount = readingPasses(book).length;
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

      <nav className="segmented book-tabs" aria-label="Book sections">
        {TABS.map((id) => (
          <Link
            key={id}
            href={id === "details" ? `/books/${book.id}` : `/books/${book.id}?tab=${id}`}
            className={`seg-btn ${tab === id ? "active" : ""}`}
            aria-current={tab === id ? "page" : undefined}
            replace
            scroll={false}
          >
            {id === "details"
              ? "Book details"
              : id === "chapters"
                ? `Exact chapters (${chapters.length})`
                : `Read history (${passCount})`}
          </Link>
        ))}
      </nav>

      {tab === "chapters" ? (
        <ChaptersTab book={book} chapters={chapters} editable={editable} />
      ) : tab === "history" ? (
        <ReadHistoryEditor
          key={book.updated_at}
          book={book}
          sessions={sessions}
          editable={editable}
        />
      ) : editable ? (
        <>
          <BookActions
            bookId={book.id}
            title={book.title}
            favorite={book.favorite}
            canReread={["finished", "dnf"].includes(book.status)}
          />
          <div className="book-insights">
            <MetadataLookupCard book={book} />
            <SeriesLookupCard book={book} />
          </div>
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

      {tab === "details" && (
        <div className="book-insights">
          <ReadHistoryCard book={book} />
          <ReadingDaysCard book={book} sessions={sessions} today={today} />
          <SpeedCard sessions={sessions} />
        </div>
      )}
    </article>
  );
}
