"use client";

import { useEffect, useMemo, useState } from "react";

import type { InsightsData } from "@/data/insights";
import { allowedCoverUrl } from "@/lib/cover-hosts";
import { buildReadingReplay, replayPeriod } from "@/lib/reading-replay";
import { profileTrackingStart } from "@/lib/tracking-start";
import type { IsoDate } from "@/lib/types";

type Kind = "week" | "month" | "year";
type Recap = ReturnType<typeof buildReadingReplay>;
type Card = { id: string; tag: string; title: string; content: React.ReactNode };

const NAMES: Record<Kind, string> = { week: "Weekly", month: "Monthly", year: "Annual" };
const METHOD: Record<string, string> = {
  reading: "Reading",
  audiobook: "Listening",
  read_listen: "Read + Listen",
};
const PALETTES = ["aurora", "ink", "coral", "sage", "violet", "gold", "mint", "night", "aurora"];

const nf = (n: unknown) => Math.round(Number(n) || 0).toLocaleString("en-US");
const hm = (n: unknown) => {
  const m = Math.round(Number(n) || 0);
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
};
const dayText = (s?: string | null) =>
  s
    ? new Date(`${s}T12:00:00Z`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      })
    : "—";

/** Recap for one reader, ported from legacy replayModelFor(). */
export function replayModel(data: InsightsData, today: IsoDate, kind: Kind, offset: number) {
  const goals = data.goals;
  const year = replayPeriod(kind, today, offset).year;
  const history = goals
    .filter((g) => Number(g.year) <= year && Number(g.daily_minutes_target) > 0)
    .sort((a, b) => Number(b.year) - Number(a.year));
  const startingGoal =
    Number(data.profile?.tracking_start_goal_minutes) ||
    Number(history[0]?.daily_minutes_target) ||
    30;
  const yearGoal = goals.find((g) => Number(g.year) === year)?.books_target;
  return buildReadingReplay({
    books: data.books,
    sessions: data.sessions,
    goalHistory: data.goalHistory,
    today,
    trackingStart: profileTrackingStart(data.profile),
    startingGoal,
    yearGoal: yearGoal == null ? null : Number(yearGoal),
    kind,
    offset,
  });
}

export function replayShareText(recap: Recap) {
  const p = recap.period;
  const lines = [
    `My Reading Room · ${NAMES[p.kind as Kind]} Replay · ${p.label}`,
    `Finished books: ${recap.finished.length}`,
    `Tracked reading time: ${recap.hasSessionData ? hm(recap.minutes) : "not recorded"}`,
    `Tracked pages progressed: ${recap.hasSessionData ? nf(recap.pages) : "not recorded"}`,
    `Active days: ${recap.hasSessionData ? nf(recap.activeDays) : "not recorded"}`,
  ];
  if (recap.goal?.days) lines.push(`Daily goals met: ${recap.goal.daysMet} / ${recap.goal.days}`);
  if (recap.topBooks[0]) lines.push(`Most-read by time: ${recap.topBooks[0].book.title}`);
  return lines.join("\n");
}

function story(r: Recap) {
  if (!r.hasAnyData)
    return "Your next chapter starts here. Log a session or add completion dates to fill this recap.";
  if (r.finished.length && !r.hasSessionData)
    return `You finished ${r.finished.length} ${r.finished.length === 1 ? "book" : "books"} during this period. Session-based reading time wasn’t recorded.`;
  if (r.topBooks.length && r.minutes > 0)
    return `You spent the most recorded time with ${r.topBooks[0].book.title}${r.topClock ? `, and ${r.topClock.label.toLowerCase()} was your busiest reading window` : ""}.`;
  if (r.goal && r.goal.daysMet > 0)
    return `You hit your daily reading goal on ${r.goal.daysMet} ${r.goal.daysMet === 1 ? "day" : "days"}.`;
  return "Every reading session adds another chapter to your story.";
}

function compareMessage(r: Recap) {
  if (!r.delta) return "No comparable earlier tracked period.";
  if (!r.previous?.sessions) return "No recorded reading time in the comparable earlier period.";
  const diff = r.delta.minutes;
  return diff === 0
    ? "The same recorded reading time as the comparable previous period."
    : `${hm(Math.abs(diff))} ${diff > 0 ? "more" : "less"} tracked reading time than the comparable previous period.`;
}

function Fact({ number, label }: { number: React.ReactNode; label: string }) {
  return (
    <div className="replay-fact">
      <strong>{number}</strong>
      <span>{label}</span>
    </div>
  );
}

function ReplayCover({ book }: { book: { title?: string | null; cover_url?: string | null } }) {
  const src = allowedCoverUrl(book.cover_url);
  return (
    <div className="replay-book-cover">
      <span>{book.title || "A good book"}</span>
      {/* eslint-disable-next-line @next/next/no-img-element -- allow-listed remote covers, as BookCover */}
      {src && <img loading="lazy" decoding="async" referrerPolicy="no-referrer" src={src} alt="" />}
    </div>
  );
}

function Split({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <div className="replay-small-split">
      {items.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function cards(r: Recap): Card[] {
  const kind = r.period.kind as Kind;
  const minutesText = r.hasSessionData ? hm(r.minutes) : "—";
  const timeline = r.timeline || [];
  const sparkMax = Math.max(1, ...timeline.map((d) => d.value));
  const modeTotal = r.mode.reduce((n, x) => n + x.minutes, 0);
  const genreMax = Math.max(1, r.topGenres[0]?.value ?? 1);
  const byTime = r.genreBasis === "logged minutes";
  const clockMax = Math.max(1, ...r.clock.map((d) => d.minutes));

  const books = r.topBooks.length ? (
    <div className="replay-book-grid">
      {r.topBooks.slice(0, 3).map((x, i) => (
        <article key={x.book.id ?? i} className="replay-book">
          <div className="replay-book-rank">#{i + 1}</div>
          <ReplayCover book={x.book} />
          <strong>{x.book.title}</strong>
          <span>{x.book.author || ""}</span>
          <small>{hm(x.minutes)} logged</small>
        </article>
      ))}
    </div>
  ) : r.finished.length ? (
    <div className="replay-book-grid">
      {r.finished.slice(0, 3).map(({ book }, i) => (
        <article key={book.id ?? i} className="replay-book">
          <ReplayCover book={book} />
          <strong>{book.title}</strong>
          <span>{book.author || ""}</span>
          <small>Completed</small>
        </article>
      ))}
    </div>
  ) : (
    <div className="replay-empty-inner">
      <strong>No book activity yet</strong>
      <p>Log reading sessions or add accurate finish dates to see your books here.</p>
    </div>
  );

  const list: Card[] = [
    {
      id: "opening",
      tag: `YOUR ${kind.toUpperCase()} REPLAY`,
      title:
        kind === "year"
          ? "Your year in stories"
          : kind === "month"
            ? "Your month in pages"
            : "Your week between the covers",
      content: (
        <>
          <div className="replay-hero-number">
            {r.finished.length ? nf(r.finished.length) : r.hasSessionData ? minutesText : "—"}
          </div>
          <p className="replay-hero-label">
            {r.finished.length
              ? "books finished"
              : r.hasSessionData
                ? "tracked reading time"
                : "no activity recorded"}
          </p>
          <div className="replay-hero-rule" />
          <p className="replay-hero-quote">{story(r)}</p>
        </>
      ),
    },
    {
      id: "numbers",
      tag: "THE BIG PICTURE",
      title: "Every minute adds up",
      content: (
        <>
          <div className="replay-facts">
            <Fact number={minutesText} label="Reading time" />
            <Fact number={r.hasSessionData ? nf(r.pages) : "—"} label="Pages progressed" />
            <Fact number={r.hasSessionData ? nf(r.activeDays) : "—"} label="Active days" />
            <Fact number={nf(r.finished.length)} label="Books completed" />
            <Fact number={r.hasSessionData ? nf(r.sessions) : "—"} label="Reading sessions" />
            <Fact
              number={
                r.speed.overall.measuredSessions
                  ? (r.speed.overall.pagesPerHour ?? 0).toFixed(1)
                  : "—"
              }
              label="Measured pages / hour"
            />
          </div>
          <p className="replay-muted">
            {nf(r.physicalPages)} print pages
            {r.audioPages ? ` + ${nf(r.audioPages)} audio equivalents` : ""}. Combined reading +
            listening counts once.
          </p>
        </>
      ),
    },
    {
      id: "timeline",
      tag: "THE READING JOURNEY",
      title:
        kind === "year"
          ? "Twelve chapters of a year"
          : kind === "month"
            ? "The days that made your month"
            : "Your reading week, day by day",
      content: (
        <>
          <div
            className={`replay-spark ${kind === "month" ? "replay-spark-month" : ""}`}
            role="img"
            aria-label="Reading minutes through the selected period"
          >
            {timeline.map((d) => (
              <div
                key={d.key}
                className="replay-spark-col"
                title={`${d.key}: ${nf(d.value)} logged minutes`}
              >
                <span className="replay-spark-value">{d.value ? nf(d.value) : ""}</span>
                <div className="replay-spark-track">
                  <i
                    style={{
                      height: `${d.future ? 0 : Math.max(d.value ? 4 : 0, (d.value / sparkMax) * 100)}%`,
                    }}
                  />
                </div>
                <small>
                  {kind === "month" ? (Number(d.key.slice(-2)) % 5 === 1 ? d.label : "") : d.label}
                </small>
              </div>
            ))}
          </div>
          <Split
            items={
              kind === "year"
                ? [
                    [
                      "Busiest month",
                      r.peakMonth
                        ? new Date(`${r.peakMonth.month}-01T12:00:00Z`).toLocaleDateString(
                            "en-US",
                            { month: "long", timeZone: "UTC" },
                          )
                        : "—",
                    ],
                    ["Peak monthly time", r.peakMonth ? hm(r.peakMonth.minutes) : "—"],
                  ]
                : [
                    ["Most active day", r.peakDay ? dayText(r.peakDay.date) : "—"],
                    ["Peak daily time", r.peakDay ? hm(r.peakDay.minutes) : "—"],
                  ]
            }
          />
        </>
      ),
    },
    {
      id: "books",
      tag: "BETWEEN THE COVERS",
      title: r.topBooks.length ? "The books you spent time with" : "The books you finished",
      content: (
        <>
          {books}
          {kind === "month" && r.topGenres.length > 0 && (
            <div className="replay-mini-genres">
              <div className="replay-mini-heading">
                TOP GENRES · BY {byTime ? "LOGGED TIME" : "FINISHED BOOKS"}
              </div>
              {r.topGenres.slice(0, 3).map((g) => (
                <div key={g.genre} className="replay-mini-genre-row">
                  <strong>{g.genre}</strong>
                  <span className="replay-mini-genre-track">
                    <i style={{ width: `${(100 * g.value) / genreMax}%` }} />
                  </span>
                  <small>{byTime ? hm(g.value) : `${nf(g.value)} books`}</small>
                </div>
              ))}
            </div>
          )}
          <p className="replay-muted">
            {r.topBooks.length
              ? "Ranked by logged reading time."
              : "Finished dates come from saved book history, including Goodreads imports."}
          </p>
        </>
      ),
    },
    {
      id: "habits",
      tag: "YOUR READING CLOCK",
      title: r.topClock
        ? `You read most in the ${r.topClock.label.toLowerCase()}`
        : "What time is story time?",
      content: (
        <>
          {r.knownClockMinutes ? (
            <>
              <div className="replay-clock-graph">
                {r.clock.map((c) => (
                  <div key={c.label} className="replay-clock-row">
                    <span>{c.label}</span>
                    <div className="replay-clock-track">
                      <i style={{ width: `${Math.max(0, (c.minutes / clockMax) * 100)}%` }} />
                    </div>
                    <strong>{hm(c.minutes)}</strong>
                  </div>
                ))}
              </div>
              <p className="replay-muted">
                {r.unknownClockMinutes
                  ? `${hm(r.unknownClockMinutes)} had no start time and are excluded from this chart.`
                  : "All recorded session start times are represented."}
              </p>
            </>
          ) : (
            <div className="replay-empty-inner">
              {r.hasSessionData
                ? "Your session times were not recorded."
                : "Log sessions with start times to discover your reading rhythm."}
            </div>
          )}
          <Split
            items={[
              ["Longest streak in period", r.hasSessionData ? `${r.bestStreak} days` : "—"],
              kind === "week"
                ? ["Daily goals met", r.goal?.days ? `${r.goal.daysMet} / ${r.goal.days}` : "—"]
                : ["Days you read", r.hasSessionData ? r.activeDays : "—"],
            ]}
          />
        </>
      ),
    },
    {
      id: "final",
      tag: "UNTIL NEXT TIME",
      title: "The story keeps going",
      content: (
        <>
          <div className="replay-final-mark">✦</div>
          <p className="replay-ending">{story(r)}</p>
          <p className="replay-muted">{compareMessage(r)}</p>
          {r.yearOnlyCount > 0 && (
            <p className="replay-muted">
              {nf(r.yearOnlyCount)} completion(s) have a year only, not an exact finish date.
            </p>
          )}
        </>
      ),
    },
  ];

  const modeCard: Card = {
    id: "modes",
    tag: "THREE WAYS TO READ",
    title: "How you spent your story time",
    content: (
      <>
        {r.hasSessionData ? (
          <>
            <div
              className="replay-mode-rail"
              role="img"
              aria-label="Share of reading minutes by method"
            >
              {r.mode.map((m) => (
                <i
                  key={m.id}
                  className={`replay-mode-${m.id}`}
                  style={{ width: `${modeTotal ? (m.minutes / modeTotal) * 100 : 0}%` }}
                  title={`${METHOD[m.id]}: ${hm(m.minutes)}`}
                />
              ))}
            </div>
            <div className="replay-mode-list">
              {r.mode.map((m) => (
                <div key={m.id}>
                  <span className={`replay-mode-dot replay-mode-${m.id}`} />
                  <strong>{METHOD[m.id]}</strong>
                  <span>{modeTotal ? `${Math.round((100 * m.minutes) / modeTotal)}%` : "—"}</span>
                  <small>{modeTotal ? hm(m.minutes) : "Not recorded"}</small>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="replay-empty-inner">No activity-type time was logged in this period.</div>
        )}
        <Split
          items={[
            [
              "Reading speed",
              r.speed.reading.pagesPerHour !== null
                ? `${r.speed.reading.pagesPerHour.toFixed(1)} pg/h`
                : "—",
            ],
            [
              "Listening equivalents",
              r.speed.audiobook.pagesPerHour !== null
                ? `${r.speed.audiobook.pagesPerHour.toFixed(1)} pg/h`
                : "—",
            ],
          ]}
        />
        <p className="replay-muted">
          Speed requires exact page progress and session minutes. Audiobook page equivalents are not
          physical pages.
        </p>
      </>
    ),
  };
  const goalCard: Card = {
    id: "goals",
    tag: "SMALL WINS, BIG STORIES",
    title: "You showed up for your goal",
    content: (
      <>
        <div className="replay-goal-number">
          {r.goal?.days ? `${Math.round((100 * r.goal.daysMet) / r.goal.days)}%` : "—"}
        </div>
        <div className="replay-goal-caption">daily goals achieved</div>
        {r.goal?.days ? (
          <>
            <div className="replay-goal-meter">
              <div
                style={{
                  width: `${Math.max(0, Math.min(100, (r.goal.daysMet / r.goal.days) * 100))}%`,
                }}
              />
            </div>
            <div className="replay-goal-labels">
              <span>{nf(r.goal.daysMet)} days met</span>
              <span>{nf(r.goal.days)} tracked days</span>
            </div>
            <p className="replay-muted">
              Uses the goal in effect each day, across all three reading types.
            </p>
          </>
        ) : (
          <div className="replay-empty-inner">
            Goals are not evaluated before the account’s tracking start date.
          </div>
        )}
        {r.challenge && (
          <div className="replay-challenge">
            <strong>
              {nf(r.challenge.done)} / {nf(r.challenge.target)}
            </strong>
            <span>Annual books challenge</span>
          </div>
        )}
      </>
    ),
  };
  const genreCard: Card = {
    id: "genres",
    tag: "YOUR WORLD OF BOOKS",
    title: r.topGenres[0]
      ? `You gravitated toward ${r.topGenres[0].genre}`
      : "Genres worth exploring",
    content: (
      <>
        <div className="replay-genre-list">
          {r.topGenres.length ? (
            r.topGenres.slice(0, 4).map((x, i) => (
              <div key={x.genre} className="replay-genre-row">
                <span>{String(i + 1).padStart(2, "0")}</span>
                <strong>{x.genre}</strong>
                <i style={{ width: `${(x.value / genreMax) * 100}%` }} />
                <small>{byTime ? hm(x.value) : `${nf(x.value)} completed`}</small>
              </div>
            ))
          ) : (
            <div className="replay-empty-inner">
              Add genres to your books to discover your favorites.
            </div>
          )}
        </div>
        <p className="replay-muted">
          Genre ranking by {r.genreBasis} · each book uses its primary genre only.
        </p>
        {r.ratingCount > 0 && r.averageRating != null && (
          <div className="replay-challenge">
            <strong>{r.averageRating.toFixed(2)} ★</strong>
            <span>Current ratings of {nf(r.ratingCount)} completed books</span>
          </div>
        )}
      </>
    ),
  };
  if (kind !== "week") list.splice(3, 0, modeCard);
  if (kind !== "week") list.splice(list.length - 1, 0, goalCard);
  if (kind === "year") list.splice(list.length - 1, 0, genreCard);
  return list;
}

export function ReplayView({
  data,
  today,
  initialKind = "week",
  initialOffset = 0,
  readerName,
}: {
  data: InsightsData;
  today: IsoDate;
  initialKind?: Kind;
  initialOffset?: number;
  readerName?: string;
}) {
  const [kind, setKind] = useState<Kind>(initialKind);
  const [offset, setOffset] = useState(initialOffset);
  const [slide, setSlide] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  const recap = useMemo(() => replayModel(data, today, kind, offset), [data, today, kind, offset]);
  const set = cards(recap);
  const index = Math.min(slide, set.length - 1);
  const item = set[index];
  const p = recap.period;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Arrow keys belong to form fields while typing.
      if (e.target instanceof Element && e.target.closest("input,select,textarea")) return;
      if (e.key === "ArrowRight") setSlide((s) => Math.min(set.length - 1, s + 1));
      else if (e.key === "ArrowLeft") setSlide((s) => Math.max(0, s - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [set.length]);

  const go = (next: Partial<{ kind: Kind; offset: number }>) => {
    if (next.kind) setKind(next.kind);
    if (next.offset !== undefined) setOffset(next.offset);
    setSlide(0);
  };

  return (
    <section className="replay-page" aria-label="Reading Replay">
      <div className="replay-page-head">
        <div>
          <div className="eyebrow">
            A little story about {readerName ? `${readerName}'s` : "your"} stories
          </div>
          <h1 className="heading">
            Reading Replay <span className="replay-sparkle">✦</span>
          </h1>
          <p className="subtitle">
            The completed chapters of a reading life, told in numbers, habits, and books.
          </p>
        </div>
        {data.editable && (
          <button
            className="btn replay-copy-btn"
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(replayShareText(recap));
                setCopied("Recap summary copied. You choose if and where to share it.");
              } catch {
                setCopied("Unable to copy automatically. Try a secure browser connection.");
              }
            }}
          >
            Copy recap summary
          </button>
        )}
      </div>
      {copied && (
        <div className="notice" role="status">
          {copied}
        </div>
      )}
      <div className="replay-toolbar">
        <div className="segmented replay-kind" role="group" aria-label="Recap timeframe">
          {(["week", "month", "year"] as const).map((k) => (
            <button
              key={k}
              type="button"
              className={`seg-btn ${kind === k ? "active" : ""}`}
              aria-pressed={kind === k}
              onClick={() => go({ kind: k, offset: 0 })}
            >
              {NAMES[k]}
            </button>
          ))}
        </div>
        <div className="replay-period-nav">
          <button
            className="btn icon-only"
            type="button"
            aria-label={`Previous ${kind}`}
            onClick={() => go({ offset: Math.max(-300, offset - 1) })}
          >
            ‹
          </button>
          <strong>{p.label}</strong>
          <button
            className="btn icon-only"
            type="button"
            aria-label={`Next ${kind}`}
            disabled={offset === 0}
            onClick={() => go({ offset: Math.min(0, offset + 1) })}
          >
            ›
          </button>
        </div>
      </div>
      {!recap.hasAnyData && (
        <div className="replay-empty-banner">
          No logged activity or recorded completions in this {kind}. You can still explore the recap
          cards or choose a different period.
        </div>
      )}
      <div className="replay-progress">
        <div className="replay-progress-caption">
          <span>
            {index + 1} / {set.length} · {item.tag}
          </span>
          <span>Complete period</span>
        </div>
        <div className="replay-progress-rail">
          <i style={{ width: `${((index + 1) / set.length) * 100}%` }} />
        </div>
      </div>
      <article
        className={`replay-story replay-theme-${PALETTES[index % PALETTES.length]}`}
        aria-live="polite"
        aria-label={`Recap card ${index + 1} of ${set.length}`}
      >
        <div className="replay-story-decoration" aria-hidden="true">
          ✦
        </div>
        <div className="replay-story-body">
          <div className="replay-story-top">
            <span>{NAMES[kind].toUpperCase()} REPLAY</span>
            <span>{p.label}</span>
          </div>
          <div className="replay-slide-tag">{item.tag}</div>
          <h2 className="replay-slide-title">{item.title}</h2>
          <div className="replay-content">{item.content}</div>
          <div className="replay-watermark">
            MY READING ROOM <span>✧</span>
          </div>
        </div>
      </article>
      <div className="replay-slide-nav">
        <button
          type="button"
          className="btn"
          disabled={index === 0}
          onClick={() => setSlide(index - 1)}
        >
          ← Previous
        </button>
        <div className="replay-dots" role="group" aria-label="Choose recap card">
          {set.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={i === index ? "active" : ""}
              aria-label={`Card ${i + 1}: ${s.tag}`}
              aria-current={i === index ? "true" : "false"}
              onClick={() => setSlide(i)}
            />
          ))}
        </div>
        <button
          type="button"
          className="btn primary"
          disabled={index === set.length - 1}
          onClick={() => setSlide(index + 1)}
        >
          Next →
        </button>
      </div>
      <div className="replay-source-note">
        {recap.disclaimer}
        {recap.sessionNote && (
          <>
            <br />
            {recap.sessionNote}
          </>
        )}
      </div>
      {!data.editable && (
        <p className="replay-sharing-notice">
          This is a view-only recap of a Full-shared profile. Only the profile owner can copy a
          recap summary.
        </p>
      )}
    </section>
  );
}
