import { ACTIVITY_LABELS, formatDate, statusText } from "@/lib/book-display";
import { currentReadNumber, readingPasses } from "@/lib/reading-history";
import { bookReadingDays, readingSpeedByMode } from "@/lib/reading-metrics";
import type { ActivityMode, IsoDate, UserBook } from "@/lib/types";
import type { BookSession } from "@/data/books";

const MODES: ActivityMode[] = ["reading", "audiobook", "read_listen"];
const speedText = (value: number | null) => (value == null ? "—" : value.toFixed(1));

export function ReadHistoryCard({ book }: { book: UserBook }) {
  const passes = readingPasses(book);
  if (!passes.length) return null;
  const last = passes.at(-1)!;
  return (
    <section className="card soft insight-card">
      <h3 className="small-title">Read &amp; reread history</h3>
      <p className="section-sub">
        {passes.length} read-through{passes.length === 1 ? "" : "s"} tracked separately
      </p>
      {passes.map((p) => (
        <div key={p.number} className="read-pass-row">
          <strong>
            {p.number === 1 ? "Original read" : `Reread #${p.number - 1}`}
            {p.number === last.number && p.status === "reading" ? " · Active" : ""}
          </strong>
          <span>
            {statusText(p.status)} · {p.started_on ? formatDate(p.started_on) : "Start unknown"} –{" "}
            {p.finished_on
              ? formatDate(p.finished_on)
              : p.finished_year
                ? String(p.finished_year)
                : "—"}
          </span>
        </div>
      ))}
    </section>
  );
}

/** Current pass only: an active reread's elapsed days must not include the original read. */
export function ReadingDaysCard({
  book,
  sessions,
  today,
}: {
  book: UserBook;
  sessions: BookSession[];
  today: IsoDate;
}) {
  const pass = currentReadNumber(book);
  const days = bookReadingDays(
    book,
    sessions.filter((s) => Number(s.read_number || 1) === pass),
    { today },
  );
  if (days.elapsedDays === null) return null;
  return (
    <section className="card soft insight-card">
      <h3 className="small-title">
        {pass > 1 ? "Current reread" : "Current read"} · reading days vs. elapsed days
      </h3>
      <div className="inline kpi-row">
        <div>
          <strong>{days.readingDays}</strong>
          <div className="tiny">Active reading days</div>
        </div>
        <div>
          <strong>{days.elapsedDays}</strong>
          <div className="tiny">Total elapsed days</div>
        </div>
        <div>
          <strong>{Math.round((days.consistency ?? 0) * 100)}%</strong>
          <div className="tiny">Consistency</div>
        </div>
      </div>
      <p className="tiny">
        {days.startDate} through {days.endDate} · A date counts once even with multiple reading or
        listening sessions.
      </p>
    </section>
  );
}

export function SpeedCard({ sessions }: { sessions: BookSession[] }) {
  const data = readingSpeedByMode(sessions);
  return (
    <section className="card soft insight-card">
      <h3 className="small-title">Reading speed by activity type</h3>
      <p className="section-sub">For this book · pages progressed per measured hour</p>
      <div className="speed-book-detail-grid">
        {MODES.map((mode) => (
          <div key={mode} className="speed-detail">
            <span className="speed-mode-label">{ACTIVITY_LABELS[mode]}</span>
            <strong>
              {speedText(data[mode].pagesPerHour)} <small>pg/hr</small>
            </strong>
            <span className="tiny">{data[mode].measuredSessions} measured sessions</span>
          </div>
        ))}
      </div>
      <p className="tiny">
        Audiobook-only speed uses edition page-equivalents. Read + Listen is counted once. Sessions
        with no page progress are excluded.
      </p>
    </section>
  );
}
