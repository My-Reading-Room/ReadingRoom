import type { Metadata } from "next";
import Link from "next/link";

import { BookCover } from "@/components/BookCover";
import { getLogData, type LogSession } from "@/data/log";
import { ACTIVITY_LABELS, formatDate } from "@/lib/book-display";
import type { ActivityMode } from "@/lib/types";
import { localToday } from "@/utils/local-today";

import { DeleteSessionButton } from "./DeleteSessionButton";
import { LogForm } from "./LogForm";

export const metadata: Metadata = { title: "Log Reading" };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const modeOf = (s: LogSession) => (s.activity_mode || "reading") as ActivityMode;
const positive = (n: number | null) => (n && n > 0 ? n : 0);
const fmtTime = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);

function detail(s: LogSession) {
  const method =
    s.log_type === "chapters"
      ? `Chapters ${s.chapter_from}–${s.chapter_to}`
      : s.log_type === "audio_position"
        ? `Audio ${s.audio_start_minute}–${s.audio_end_minute} min`
        : "Pages";
  const pages =
    s.pages_read == null
      ? s.log_type === "audio_position"
        ? "no page count"
        : "Pages not recorded"
      : `${s.pages_read} ${modeOf(s) === "audiobook" ? "page-equivalents" : "pages"}${
          s.log_type === "pages" && s.end_page != null ? ` · stopped on p. ${s.end_page}` : ""
        }`;
  return `${method} · ${s.duration_minutes}m · ${pages}`;
}

export default async function LogPage({ searchParams }: PageProps<"/log">) {
  const params = await searchParams;
  const today = await localToday();
  const requested = typeof params.date === "string" && ISO.test(params.date) ? params.date : today;
  const date = requested > today ? today : requested;
  const show =
    typeof params.show === "string" && params.show in ACTIVITY_LABELS ? params.show : "all";

  const { userId, books, selected, daySessions, bookSessions, chapters } = await getLogData(
    date,
    typeof params.book === "string" ? params.book : null,
  );

  const shown = daySessions.filter((s) => show === "all" || modeOf(s) === show);
  const minutes = shown.reduce((n, s) => n + positive(s.duration_minutes), 0);
  const physical = shown
    .filter((s) => modeOf(s) !== "audiobook")
    .reduce((n, s) => n + positive(s.pages_read), 0);
  const audio = shown
    .filter((s) => modeOf(s) === "audiobook")
    .reduce((n, s) => n + positive(s.pages_read), 0);
  const bookIds = [...new Set(shown.map((s) => s.user_book_id))];
  const titleOf = new Map(books.map((b) => [b.id, b]));
  const showHref = (mode: string) => {
    const q = new URLSearchParams({
      date,
      ...(selected ? { book: selected.id } : {}),
      ...(mode !== "all" ? { show: mode } : {}),
    });
    return `/log?${q}`;
  };

  return (
    <>
      <div className="eyebrow">Reading journal</div>
      <h1 className="heading">Log Reading</h1>
      <p className="subtitle">
        Label each session as Reading Only, Audiobook Only, or Read + Listen. Enter the page you
        stopped on, or use exact mapped chapters. Pages are never estimated.
      </p>
      <div className="grid2 log-grid">
        <LogForm
          key={`${selected?.id ?? "none"}-${date}`}
          userId={userId}
          books={books}
          selected={selected}
          bookSessions={bookSessions}
          chapters={chapters}
          date={date}
          today={today}
        />
        <section className="card">
          <h2 className="section-title">{formatDate(date)}</h2>
          <p className="section-sub">
            Your daily reading breakdown ·{" "}
            {show === "all" ? "all activity types" : ACTIVITY_LABELS[show as ActivityMode]}
          </p>
          <div className="kpis log-kpis">
            <div className="kpi">
              <div className="kpi-num">{fmtTime(minutes)}</div>
              <div className="kpi-label">Reading time</div>
            </div>
            <div className="kpi">
              <div className="kpi-num">{physical + audio}</div>
              <div className="kpi-label">Total pages progressed</div>
            </div>
          </div>
          <p className="tiny">
            {physical} physical pages · {audio} audiobook page-equivalents
          </p>
          <nav className="toolbar log-filter" aria-label="Filter sessions by reading mode">
            <span className="tiny">
              {bookIds.length} books · {shown.length} sessions
            </span>
            {(["all", ...Object.keys(ACTIVITY_LABELS)] as string[]).map((mode) => (
              <Link
                key={mode}
                href={showHref(mode)}
                replace
                scroll={false}
                className={`btn sm ${show === mode ? "selected" : ""}`}
                aria-current={show === mode ? "page" : undefined}
              >
                {mode === "all" ? "All" : ACTIVITY_LABELS[mode as ActivityMode]}
              </Link>
            ))}
          </nav>
          {bookIds.length === 0 ? (
            <div className="notice warn">No reading activity has been logged for this day.</div>
          ) : (
            bookIds.map((id) => {
              const book = titleOf.get(id);
              const records = shown.filter((s) => s.user_book_id === id);
              if (!book) return null;
              return (
                <div key={id} className="session-breakdown">
                  <div className="inline session-book">
                    <BookCover
                      title={book.title}
                      author={book.author}
                      coverUrl={book.cover_url}
                      size="small"
                    />
                    <div>
                      <Link href={`/books/${book.id}`}>
                        <strong>{book.title}</strong>
                      </Link>
                      <div className="tiny">
                        {fmtTime(records.reduce((n, s) => n + positive(s.duration_minutes), 0))} ·{" "}
                        {records.reduce((n, s) => n + positive(s.pages_read), 0)} pages progressed
                      </div>
                      {records.map((s) => (
                        <div key={s.id} className="inline session-line">
                          <span className={`status-pill activity-${modeOf(s)}`}>
                            {ACTIVITY_LABELS[modeOf(s)]}
                          </span>
                          <span>
                            {s.start_local_time ? `${s.start_local_time.slice(0, 5)} · ` : ""}
                            {s.read_number > 1 ? `Reread #${s.read_number - 1} · ` : ""}
                            {detail(s)}
                          </span>
                          <DeleteSessionButton sessionId={s.id} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </section>
      </div>
    </>
  );
}
