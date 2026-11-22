import Link from "next/link";

import { BookCover } from "@/components/BookCover";
import { formatDate } from "@/lib/book-display";
import type { friendActivityFeed } from "@/lib/friend-feed";

type Feed = ReturnType<typeof friendActivityFeed>;
type Book = { id: string; title: string; author: string | null; cover_url: string | null };

const FILTERS = [
  ["all", "All activity"],
  ["started", "Started"],
  ["session", "Sessions"],
  ["finished", "Finished"],
] as const;
const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
const clock = (hhmm?: string | null) =>
  hhmm
    ? new Date(`2000-01-01T${hhmm}:00Z`).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC",
      })
    : null;

/** Newest-first activity from you and Full-share friends (legacy renderFriendsFeed). */
export function FeedView({
  feed,
  books,
  type,
  limit,
}: {
  feed: Feed;
  books: Map<string, Book>;
  type: string;
  limit: number;
}) {
  return (
    <>
      <div className="eyebrow">Your reading community</div>
      <h1 className="heading">Reading Activity</h1>
      <p className="subtitle">
        Your reading updates and those of friends sharing Full profiles, together in one feed.
      </p>
      <div className="friends-feed-wrap">
        <div className="feed-intro">
          <div>
            <h2 className="section-title">You &amp; your friends</h2>
            <p className="section-sub">
              Newest activity first · Includes your own books and Full-shared friends
            </p>
          </div>
          <div className="feed-counts">
            <span>
              <strong>{feed.fullShareCount}</strong> Friends
            </span>
            <span>
              <strong>{feed.total}</strong> {type === "all" ? "Activities" : "Matches"}
            </span>
          </div>
        </div>
        <div className="feed-filter-tabs" role="group" aria-label="Filter friend activity">
          {FILTERS.map(([value, label]) => (
            <Link
              key={value}
              href={`/friends?type=${value}`}
              className={`feed-filter ${type === value ? "active" : ""}`}
              aria-current={type === value ? "true" : undefined}
              scroll={false}
            >
              {label}
            </Link>
          ))}
        </div>
        {feed.total ? (
          <>
            <div className="feed-events">
              {feed.events.map((e, i) => {
                const word =
                  e.kind === "started" ? "started" : e.kind === "finished" ? "finished" : "session";
                const kindName =
                  e.kind === "started"
                    ? "Started a book"
                    : e.kind === "finished"
                      ? "Finished a book"
                      : "Reading session";
                const reread = (e.readNumber ?? 1) > 1;
                const minutes = Math.round(e.minutes ?? 0);
                const detail =
                  e.kind === "started" ? (
                    reread ? (
                      "started rereading"
                    ) : (
                      "started reading"
                    )
                  ) : e.kind === "finished" ? (
                    reread ? (
                      "finished a reread of"
                    ) : (
                      "finished reading"
                    )
                  ) : (
                    <>
                      {e.mode === "audiobook"
                        ? "listened"
                        : e.mode === "read_listen"
                          ? "read & listened"
                          : "read"}{" "}
                      for <strong>{minutes} minutes</strong>
                    </>
                  );
                const dayBreak = i === 0 || e.date !== feed.events[i - 1].date;
                const book = e.bookId ? books.get(e.bookId) : undefined;
                const time = clock(e.localTime);
                return (
                  <div key={`${e.kind}-${e.bookId}-${e.date}-${i}`}>
                    {dayBreak && (
                      <h3 className="feed-day-heading">
                        <span>{formatDate(e.date)}</span>
                      </h3>
                    )}
                    <article
                      className={`feed-event feed-post kind-${word} ${e.isOwn ? "feed-self" : ""}`}
                    >
                      <header className="feed-post-header">
                        <span className="feed-avatar" aria-hidden="true">
                          {initials(e.readerName)}
                        </span>
                        <div className="feed-post-byline">
                          <strong>
                            {e.readerName}
                            {e.isOwn && <span className="feed-you-tag"> You</span>}
                          </strong>
                          <span>{detail}</span>
                        </div>
                        <time dateTime={e.date + (e.localTime ? `T${e.localTime}` : "")}>
                          {formatDate(e.date)}
                          {time && <span className="feed-clock">{time}</span>}
                        </time>
                      </header>
                      <Link
                        href={`/books/${e.bookId}`}
                        className="feed-book"
                        aria-label={`View ${e.title} in ${e.readerName}'s library`}
                      >
                        {book && (
                          <BookCover
                            title={book.title}
                            author={book.author}
                            coverUrl={book.cover_url}
                            size="small"
                          />
                        )}
                        <span className="feed-book-info">
                          <small className="feed-book-eyebrow">{kindName}</small>
                          <strong>{e.title}</strong>
                          <small>{e.author || "Author not recorded"}</small>
                        </span>
                        <span className="feed-open" aria-hidden="true">
                          ›
                        </span>
                      </Link>
                      <footer className="feed-post-footer">
                        <span className={`feed-kind-pill ${word}`}>{kindName}</span>
                        {reread && (
                          <span className="feed-pass">Reread #{(e.readNumber ?? 1) - 1}</span>
                        )}
                        {e.kind === "finished" && Number.isFinite(e.rating) && (
                          <span className="feed-post-rating">
                            Current rating: <strong>{Number(e.rating).toFixed(2)} ★</strong>
                          </span>
                        )}
                      </footer>
                    </article>
                  </div>
                );
              })}
            </div>
            {feed.hasMore && (
              <Link
                className="btn block feed-more"
                href={`/friends?type=${type}&limit=${limit + 30}`}
                scroll={false}
              >
                Show older activity ({feed.total - feed.events.length} more)
              </Link>
            )}
          </>
        ) : (
          <div className="feed-empty">
            <strong>
              {type === "all" ? "No shared reading activity yet" : "No events match this filter"}
            </strong>
            <p>
              {feed.fullShareCount
                ? "Try a different filter, or log a new reading session."
                : "Log a reading session or invite a friend to share a Full profile in Settings."}
            </p>
          </div>
        )}
        <p className="feed-privacy">
          Friends&apos; notes and private logs are never shown. Ratings next to finished books are
          the current rating, not necessarily the rating when the book was finished.
        </p>
      </div>
    </>
  );
}
