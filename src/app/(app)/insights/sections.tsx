import Link from "next/link";

import { RereadComparisonCard } from "@/components/RereadComparisonCard";
import { STATUS_TEXT } from "@/lib/book-display";
import { formatRatio, formatTime } from "@/lib/insights-period";
import {
  activityDistribution,
  completionEfficiency,
  dayOfWeekStats,
  genreSpeedStats,
  libraryStatistics,
  sessionLengthStats,
  TIME_OF_DAY,
  timeOfDaySpeedByMode,
  timeOfDayStats,
  weekdayTimeHeatmap,
} from "@/lib/reading-habits";
import {
  currentReadNumber,
  passModeLabel,
  rereadComparisonStats,
  rereadingStats,
} from "@/lib/reading-history";
import { bookReadingDays, dailyReadingGoalStats, readingSpeedByMode } from "@/lib/reading-metrics";
import { seriesStatistics } from "@/lib/series-insights";
import { tbrTransitions } from "@/lib/tbr-transitions";

import { Bar, HabitKpi, SpeedTrend } from "./charts";
import { FillSeriesButton } from "./FillSeriesButton";
import { MODE_COLORS, MODE_TEXT, SPEED_COLORS, SPEED_KEYS, type InsightsContext } from "./context";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function SpeedPanel({ ctx }: { ctx: InsightsContext }) {
  const { speedRows, spec, mode } = ctx;
  const stats = readingSpeedByMode(speedRows);
  const max = Math.max(1, ...SPEED_KEYS.map((k) => stats[k].pagesPerHour || 0));
  const bookRows = [...new Set(speedRows.map((s) => s.user_book_id))]
    .map((id) => ({
      book: ctx.bookById.get(id),
      values: readingSpeedByMode(speedRows.filter((s) => s.user_book_id === id)),
    }))
    .filter((x) => x.book && x.values.overall.measuredSessions > 0)
    .sort((a, b) => b.values.overall.minutes - a.values.overall.minutes);
  const byGenre = genreSpeedStats(
    ctx.books,
    speedRows.filter((s) => mode === "all" || (s.activity_mode || "reading") === mode),
  );
  const genreMax = Math.max(1, ...byGenre.map((g) => g.pagesPerHour || 0));
  const skipped = stats.overall.excludedSessions;
  return (
    <div className="card speed-panel settings-row">
      <h2 className="section-title">Reading speed by activity type</h2>
      <p className="section-sub">Weighted pages progressed per measured hour · {spec.label}</p>
      <div className="speed-summary-grid">
        {(
          [["overall", "All activity"], ...SPEED_KEYS.map((k) => [k, MODE_TEXT[k]])] as [
            keyof typeof stats,
            string,
          ][]
        ).map(([k, label]) => (
          <div key={k} className={`speed-summary ${k}`}>
            <span className="speed-mode-label">{label}</span>
            <strong className="speed-value">
              {formatRatio(stats[k].pagesPerHour)} <small>pages/hr</small>
            </strong>
            <span className="tiny">{plural(stats[k].measuredSessions, "measured session")}</span>
          </div>
        ))}
      </div>
      <div className="speed-comparison">
        {SPEED_KEYS.map((k) => (
          <div key={k} className="speed-row">
            <div className="rank-top">
              <strong>
                <i className="speed-dot" style={{ background: SPEED_COLORS[k] }} />
                {MODE_TEXT[k]}
              </strong>
              <span>
                {stats[k].pagesPerHour == null
                  ? "No measured pages"
                  : `${formatRatio(stats[k].pagesPerHour)} pages/hr`}
              </span>
            </div>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{
                  width: `${((stats[k].pagesPerHour || 0) / max) * 100}%`,
                  background: SPEED_COLORS[k],
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="cardline" />
      <h3 className="small-title">Speed trends by reading method</h3>
      <p className="section-sub">
        Daily rates this week/month; monthly rates for the year. Days with no measured pages are
        left blank.
      </p>
      <SpeedTrend ctx={ctx} />
      <div className="cardline" />
      <h3 className="small-title">Speed by individual book</h3>
      <p className="section-sub">Same calendar period and book selection · values in pages/hour</p>
      {bookRows.length ? (
        <div
          className="speed-book-table"
          role="table"
          aria-label="Reading speed per book and activity type"
        >
          <div className="speed-book-header" role="row">
            <span role="columnheader">Book</span>
            {SPEED_KEYS.map((k) => (
              <span key={k} role="columnheader">
                {MODE_TEXT[k]}
              </span>
            ))}
          </div>
          {bookRows.slice(0, 8).map(({ book, values }) => (
            <div key={book!.id} className="speed-book-line" role="row">
              <span role="cell" className="speed-book-name">
                {book!.title}
                <small>{formatRatio(values.overall.pagesPerHour)} overall</small>
              </span>
              {SPEED_KEYS.map((k) => (
                <span key={k} role="cell">
                  {formatRatio(values[k].pagesPerHour)}
                </span>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm muted">
          No sessions with recorded pages for this period and book selection.
        </p>
      )}
      <div className="cardline" />
      <h3 className="small-title">Reading speed by genre</h3>
      <p className="section-sub">
        Weighted pages/hour · {mode === "all" ? "All activity types" : MODE_TEXT[mode]} · primary
        genre only
      </p>
      <div className="speed-comparison">
        {byGenre.length ? (
          byGenre.slice(0, 10).map((g) => (
            <div key={g.genre} className="speed-row">
              <div className="rank-top">
                <strong>{g.genre}</strong>
                <span>
                  {formatRatio(g.pagesPerHour)} pg/hr · {g.measuredSessions} sessions
                </span>
              </div>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{
                    width: `${(100 * (g.pagesPerHour || 0)) / genreMax}%`,
                    background: "#8472a4",
                  }}
                />
              </div>
              <div className="tiny">
                {plural(g.bookCount, "book")} · {formatTime(g.minutes)} measured
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm muted">
            No eligible genre-labeled sessions with page progress in this period.
          </p>
        )}
      </div>
      <p className="tiny speed-note">
        Physical reading uses actual pages, audiobook-only uses print-edition page-equivalents, and
        Read + Listen counts progress and time once. Pages are never estimated from chapter averages
        or listening time.{" "}
        {skipped
          ? `${plural(skipped, "session")} excluded because time and page progress were not both recorded.`
          : ""}
      </p>
    </div>
  );
}

export function BookDaysCard({
  ctx,
  showAll,
  onToggle,
}: {
  ctx: InsightsContext;
  showAll: boolean;
  onToggle: () => void;
}) {
  const books = ctx.books.filter((b) => ctx.bookFilter === "all" || b.id === ctx.bookFilter);
  const data = books
    .map((book) => ({
      book,
      ...bookReadingDays(
        book,
        ctx.sessions.filter(
          (s) =>
            s.user_book_id === book.id && Number(s.read_number || 1) === currentReadNumber(book),
        ),
        { today: ctx.today, activityMode: ctx.mode },
      ),
    }))
    .filter((x) => x.elapsedDays !== null)
    .sort((a, b) => b.readingDays - a.readingDays || (b.elapsedDays ?? 0) - (a.elapsedDays ?? 0));
  const shown = showAll ? data : data.slice(0, 8);
  return (
    <div className="card settings-row">
      <h2 className="section-title">Reading days by book</h2>
      <p className="section-sub">
        Days in the latest reading pass for each book, independent of the chart range. Active days =
        distinct dates with sessions{ctx.mode === "all" ? "" : ` for ${MODE_TEXT[ctx.mode]}`}.
        Elapsed days = start through finish (or today).
      </p>
      {data.length ? (
        <div
          className="book-days-table"
          role="table"
          aria-label="Reading days and calendar days by book"
        >
          <div className="days-row header" role="row">
            <span role="columnheader">Book</span>
            <span role="columnheader">Reading days</span>
            <span role="columnheader">Elapsed days</span>
            <span role="columnheader">Consistency</span>
          </div>
          {shown.map((x) => (
            <div key={x.book.id} className="days-row" role="row">
              <span className="days-book" role="cell">
                <strong>{x.book.title}</strong>
                <small>
                  {x.startDate} – {x.endDate}
                </small>
              </span>
              <span role="cell">{x.readingDays}</span>
              <span role="cell">{x.elapsedDays}</span>
              <span role="cell">
                <strong>{Math.round((x.consistency ?? 0) * 100)}%</strong>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="notice">No books have a start date or dated reading sessions yet.</p>
      )}
      {data.length > 8 && (
        <button className="btn sm form-footer" type="button" onClick={onToggle}>
          {showAll ? "Show fewer books" : `Show all ${data.length} books`}
        </button>
      )}
      <p className="tiny">
        Several sessions on one day count as one active day. Unlogged days remain part of elapsed
        time.
      </p>
    </div>
  );
}

export function HabitsSection({ ctx }: { ctx: InsightsContext }) {
  const { entries, spec } = ctx;
  const t = timeOfDayStats(entries);
  const w = dayOfWeekStats(entries, {
    periodStart: spec.start,
    periodEnd: spec.end,
    today: ctx.today,
    activeFrom: ctx.trackingStart,
  });
  const duration = sessionLengthStats(entries);
  const dist = activityDistribution(entries);
  const heat = weekdayTimeHeatmap(entries);
  const goal = dailyReadingGoalStats(ctx.sessions, {
    targetMinutes: 30,
    goalHistory: ctx.goalHistory,
    today: ctx.today,
    periodStart: spec.start,
    periodEnd: spec.end,
    activeFrom: ctx.trackingStart,
  });
  const top = Math.max(1, ...t.buckets.map((x) => x.minutes));
  const wmax = Math.max(1, ...w.days.map((x) => x.avgMinutesPerDay));
  const lengthMax = Math.max(1, ...duration.buckets.map((x) => x.count));
  const speedBands = timeOfDaySpeedByMode(ctx.speedRows);
  const speedModes = [
    ["overall", "All activity", "#8271a2"],
    ...SPEED_KEYS.map((k) => [k, MODE_TEXT[k], SPEED_COLORS[k]]),
  ] as ["overall" | (typeof SPEED_KEYS)[number], string, string][];
  const speedMax = Math.max(
    1,
    ...speedBands.flatMap((b) => speedModes.map(([id]) => b.speeds[id].pagesPerHour || 0)),
  );
  // Conic-gradient stops: each mode's slice starts where the previous ended.
  const wedges = dist.buckets
    .map((b, i) => {
      const from = dist.buckets.slice(0, i).reduce((a, x) => a + x.share, 0);
      return `${MODE_COLORS[b.id as keyof typeof MODE_COLORS]} ${from.toFixed(4)}% ${(from + b.share).toFixed(4)}%`;
    })
    .join(",");
  return (
    <section id="insights-habits" className="insight-section">
      <div className="insight-section-heading">
        <div className="eyebrow">When &amp; how you read</div>
        <h2 className="section-title">Reading Habits</h2>
        <p className="section-sub">
          Selected period and activity/book filters · optional start times improve time-of-day
          charts
        </p>
      </div>
      <div className="card settings-row">
        <h3 className="small-title">Reading by time of day</h3>
        <p className="section-sub">
          Minutes across time bands; speed from entire sessions grouped by start time
        </p>
        <div className="habit-time-grid">
          {t.buckets.map((b) => (
            <div key={b.id} className="habit-time">
              <div className="habit-time-head">
                <strong>{b.label}</strong>
                <span>{formatTime(Math.round(b.minutes))}</span>
              </div>
              <Bar fraction={b.minutes / top} />
              <div className="tiny">
                {TIME_OF_DAY.find((x) => x.id === b.id)?.hours} · {b.sessions} starts ·{" "}
                {formatRatio(b.pagesPerHour)} pg/hr
              </div>
            </div>
          ))}
        </div>
        <p className="tiny">
          {t.unknownMinutes
            ? `${formatTime(Math.round(t.unknownMinutes))} across ${plural(t.unknownSessions, "session")} with unknown start time are excluded from the five time bands.`
            : "All logged sessions in this view have start times."}
        </p>
      </div>
      <div className="card settings-row">
        <h3 className="small-title">Reading speed by time of day</h3>
        <p className="section-sub">Weighted pages per hour by start time and method</p>
        <div className="habit-speed-breakdown">
          {speedBands.map((b) => (
            <section key={b.id} className="habit-speed-band">
              <div className="habit-speed-heading">
                <strong>{b.label}</strong>
                <span>{b.hours}</span>
              </div>
              {speedModes.map(([id, label, color]) => {
                const speed = b.speeds[id].pagesPerHour;
                return (
                  <div key={id} className="habit-speed-row">
                    <span className="habit-speed-mode">
                      <i className="speed-dot" style={{ background: color }} />
                      {label}
                    </span>
                    <div
                      className="habit-speed-track"
                      aria-label={`${b.label}, ${label}: ${speed == null ? "no measured speed" : `${speed.toFixed(1)} pages per hour`}`}
                    >
                      <span
                        style={{
                          width: `${Math.max(0, ((speed || 0) / speedMax) * 100)}%`,
                          background: color,
                        }}
                      />
                    </div>
                    <strong className="habit-speed-value">{formatRatio(speed)}</strong>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
        <p className="tiny">
          All activity is total recorded pages divided by total eligible time, not an average of the
          three speeds.
        </p>
      </div>
      <div className="grid2 settings-row">
        <div className="card">
          <h3 className="small-title">Reading by day of week</h3>
          <p className="section-sub">
            Average minutes per calendar day, including days with zero reading
          </p>
          {w.days.map((r) => (
            <div key={r.id} className="habit-compact-row">
              <strong>{r.name}</strong>
              <Bar fraction={r.avgMinutesPerDay / wmax} />
              <span>{Math.round(r.avgMinutesPerDay)}m/day</span>
            </div>
          ))}
        </div>
        <div className="card">
          <h3 className="small-title">Weekdays vs weekends</h3>
          <p className="section-sub">Normalized by the number of calendar days</p>
          <div className="habit-kpis">
            <HabitKpi
              value={`${Math.round(w.weekdays.avgMinutesPerDay)}m`}
              label="Weekday daily average"
            />
            <HabitKpi
              value={`${Math.round(w.weekends.avgMinutesPerDay)}m`}
              label="Weekend daily average"
            />
          </div>
          <div className="cardline" />
          <h3 className="small-title">Session duration</h3>
          <div className="habit-kpis">
            <HabitKpi value={`${formatRatio(duration.avgMinutes)}m`} label="Average session" />
            <HabitKpi value={`${duration.longestMinutes ?? 0}m`} label="Longest session" />
          </div>
          <p className="tiny">
            Median: {formatRatio(duration.medianMinutes)} min · {duration.count} total sessions
          </p>
        </div>
      </div>
      <div className="grid2 settings-row">
        <div className="card">
          <h3 className="small-title">Session length distribution</h3>
          <p className="section-sub">Recorded session durations</p>
          {duration.buckets.map((b) => (
            <div key={b.label} className="habit-compact-row">
              <strong>{b.label}</strong>
              <Bar fraction={b.count / lengthMax} />
              <span>{b.count}</span>
            </div>
          ))}
        </div>
        <div className="card">
          <h3 className="small-title">Daily goal success &amp; consistency</h3>
          <p className="section-sub">
            Each date&apos;s original target, independent of book and activity filters
          </p>
          <div className="habit-kpis">
            <HabitKpi
              value={goal.percentDaysMet == null ? "—" : `${Math.round(goal.percentDaysMet)}%`}
              label="Calendar days meeting goal"
            />
            <HabitKpi value={`${goal.daysMet}/${goal.evaluatedDays}`} label="Days goal achieved" />
            <HabitKpi value={goal.currentGoalStreak} label="Current goal streak" />
            <HabitKpi value={goal.longestGoalStreak} label="Longest goal streak" />
          </div>
        </div>
      </div>
      <div className="habits-routine-layout settings-row">
        <div className="card">
          <h3 className="small-title">Routine heatmap · Day of week × time of day</h3>
          <p className="section-sub">Minutes by day and period · darker means more activity</p>
          <div className="habit-heat-head">
            <i />
            {TIME_OF_DAY.map((x) => (
              <span key={x.id}>{x.label}</span>
            ))}
          </div>
          {heat.rows.map((r) => (
            <div key={r.name} className="habit-heat-row">
              <strong>{r.name}</strong>
              {r.cells.map((c) => {
                const f = heat.maxMinutes ? c.minutes / heat.maxMinutes : 0;
                return (
                  <span
                    key={c.id}
                    className="habit-heat-cell"
                    title={`${r.name} · ${TIME_OF_DAY.find((x) => x.id === c.id)?.label} · ${Math.round(c.minutes)} minutes`}
                    style={{
                      background:
                        c.minutes === 0
                          ? "#eff1ea"
                          : `rgba(38,116,74,${(0.16 + f * 0.78).toFixed(2)})`,
                    }}
                  />
                );
              })}
            </div>
          ))}
          <p className="tiny">
            {heat.unknownMinutes
              ? `${formatTime(Math.round(heat.unknownMinutes))} with unknown start times are not assigned to a cell.`
              : "All recorded minutes in this period have local start times."}
          </p>
        </div>
        <div className="card">
          <h3 className="small-title">Reading vs listening distribution</h3>
          <p className="section-sub">
            Share of logged time by activity · Read + Listen counted once
          </p>
          <div className="activity-pie-layout">
            {dist.totalMinutes ? (
              <div
                className="activity-pie"
                role="img"
                aria-label={`Reading activity distribution: ${dist.buckets.map((b) => `${b.label} ${b.share.toFixed(1)} percent`).join(", ")}`}
                style={{ background: `conic-gradient(${wedges})` }}
              />
            ) : (
              <div className="activity-pie empty" aria-label="No logged activity yet" />
            )}
            <div className="activity-pie-legend">
              {dist.buckets.map((b) => (
                <div key={b.id} className="habit-mode-row">
                  <div className="habit-time-head">
                    <strong>
                      <i
                        className="speed-dot"
                        style={{ background: MODE_COLORS[b.id as keyof typeof MODE_COLORS] }}
                      />{" "}
                      {b.label}
                    </strong>
                    <span>{b.share.toFixed(1)}%</span>
                  </div>
                  <span className="tiny">{formatTime(Math.round(b.minutes))}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function LibrarySection({ ctx }: { ctx: InsightsContext }) {
  const all = ctx.books;
  const lib = libraryStatistics(all, { today: ctx.today });
  const eff = completionEfficiency(all, ctx.sessions, {
    today: ctx.today,
    activityMode: ctx.mode,
  }).slice(0, 7);
  const genreMax = Math.max(1, ...lib.genres.map((x) => x.books));
  const primary = lib.genres.filter((g) => g.genre !== "Uncategorized").slice(0, 10);
  const transitions = tbrTransitions(all);
  const series = seriesStatistics(all, ctx.sessions);
  const rereads = rereadingStats(all, ctx.sessions);
  const compare = rereadComparisonStats(all, ctx.sessions, { today: ctx.today });
  const tbrMax = Math.max(1, ...lib.tbr.distribution.buckets.map((b) => b.count));
  const drill = ctx.openDrill;
  return (
    <section id="insights-books" className="insight-section">
      <div className="insight-section-heading">
        <div className="eyebrow">From your shelves</div>
        <h2 className="section-title">Books &amp; Library</h2>
        <p className="section-sub">
          Lifetime library and per-book efficiency · not restricted to the selected period
        </p>
      </div>
      <div className="card settings-row">
        <h3 className="small-title">Book completion efficiency</h3>
        <p className="section-sub">
          Active reading days vs elapsed days, plus average minutes and pages per active day
        </p>
        <div className="habit-book-table">
          <div className="habit-book-head">
            <span>Book</span>
            <span>Active / elapsed</span>
            <span>Minutes / day</span>
            <span>Pages / day</span>
          </div>
          {eff.length ? (
            eff.map((x, i) => (
              <div key={`${x.title}-${i}`} className="habit-book-line">
                <span className="habit-book-title">
                  {x.title}
                  <small>
                    {x.consistency == null ? "—" : `${Math.round(x.consistency * 100)}%`}{" "}
                    consistency · {x.sessions} sessions
                  </small>
                </span>
                <span>
                  {x.readingDays} / {x.elapsedDays}
                </span>
                <span>{formatRatio(x.minutesPerActiveDay)}</span>
                <span>{formatRatio(x.pagesPerActiveDay)}</span>
              </div>
            ))
          ) : (
            <p className="text-sm muted">Log sessions and start dates to calculate this metric.</p>
          )}
        </div>
      </div>
      <div className="grid2 settings-row">
        <div className="card">
          <h3 className="small-title">Library by genre · Read vs unread</h3>
          <p className="section-sub">
            Each book counts once per assigned genre. Read includes completed books and rereads.
          </p>
          <div className="genre-legend">
            <i className="genre-swatch read" /> Read <i className="genre-swatch unread" /> Unread
          </div>
          {lib.genres.length ? (
            lib.genres.map((x) => (
              <div key={x.genre} className="genre-breakdown">
                <button
                  type="button"
                  className="genre-title-button"
                  onClick={() => drill("genre-all", x.genre, `${x.genre} books`)}
                >
                  <strong>{x.genre}</strong>
                  <span>{x.books} total</span>
                </button>
                <div
                  className="genre-stack"
                  role="group"
                  aria-label={`${x.genre}: ${x.read} read and ${x.unread} unread`}
                >
                  {x.read > 0 && (
                    <button
                      type="button"
                      className="genre-stack-read"
                      style={{ width: `${((x.read / genreMax) * 100).toFixed(2)}%` }}
                      aria-label={`Show ${x.read} read ${x.genre} books`}
                      onClick={() => drill("genre-read", x.genre, `Read · ${x.genre}`)}
                    />
                  )}
                  {x.unread > 0 && (
                    <button
                      type="button"
                      className="genre-stack-unread"
                      style={{ width: `${((x.unread / genreMax) * 100).toFixed(2)}%` }}
                      aria-label={`Show ${x.unread} unread ${x.genre} books`}
                      onClick={() => drill("genre-unread", x.genre, `Unread · ${x.genre}`)}
                    />
                  )}
                </div>
                <div className="genre-count-links">
                  <button
                    type="button"
                    onClick={() => drill("genre-read", x.genre, `Read · ${x.genre}`)}
                  >
                    {x.read} read
                  </button>
                  <button
                    type="button"
                    onClick={() => drill("genre-unread", x.genre, `Unread · ${x.genre}`)}
                  >
                    {x.unread} unread
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm muted">Add genre metadata to see a breakdown.</p>
          )}
        </div>
        <div className="card">
          <h3 className="small-title">Your ratings by genre</h3>
          <p className="section-sub">
            Average personal rating for each genre · select a bar to see its rated books
          </p>
          {primary.length ? (
            primary.map((x) => (
              <button
                key={x.genre}
                type="button"
                className="habit-compact-row insight-drill-row"
                aria-label={`Show ${x.rated} rated books in ${x.genre}`}
                onClick={() => drill("genre-rating", x.genre, `Rated books · ${x.genre}`)}
              >
                <strong>{x.genre}</strong>
                <Bar fraction={(x.avgRating || 0) / 5} color="#ba9558" />
                <span>
                  {x.avgRating === null ? "—" : `${x.avgRating.toFixed(2)} ★`}{" "}
                  <small>({x.rated})</small>
                </span>
              </button>
            ))
          ) : (
            <p className="text-sm muted">No rated books with genres yet.</p>
          )}
          <p className="tiny">
            {lib.rated} rated books ·{" "}
            {lib.averageRating === null ? "—" : `${lib.averageRating.toFixed(2)} ★`} mean rating.
          </p>
        </div>
      </div>

      <div className="card settings-row">
        <h3 className="small-title">Rereading statistics</h3>
        <p className="section-sub">Explicit second and later reading passes · lifetime totals</p>
        <div className="habit-kpis">
          <HabitKpi value={rereads.booksReread} label="Books reread" />
          <HabitKpi value={rereads.rereadsStarted} label="Rereads started" />
          <HabitKpi value={rereads.rereadsFinished} label="Rereads finished" />
          <HabitKpi value={formatTime(rereads.rereadMinutes)} label="Reread time" />
        </div>
        <p className="tiny">
          {rereads.currentlyRereading} currently being reread · {rereads.rereadSessions} logged
          reread sessions.
        </p>
        <div className="reread-overview-kpis">
          <HabitKpi
            value={
              compare.avgFirstMinutes === null
                ? "—"
                : formatTime(Math.round(compare.avgFirstMinutes))
            }
            label="Avg original time"
          />
          <HabitKpi
            value={
              compare.avgRereadMinutes === null
                ? "—"
                : formatTime(Math.round(compare.avgRereadMinutes))
            }
            label="Avg latest reread time"
          />
          <HabitKpi value={compare.pairedTimeCount} label="Paired, completed books" />
          <HabitKpi
            value={compare.avgFirstSessions === null ? "—" : compare.avgFirstSessions.toFixed(1)}
            label="Avg first-read sessions"
          />
          <HabitKpi
            value={compare.avgRereadSessions === null ? "—" : compare.avgRereadSessions.toFixed(1)}
            label="Avg reread sessions"
          />
          <HabitKpi
            value={
              compare.mostCommonSwitch
                ? `${passModeLabel(compare.mostCommonSwitch.from)} → ${passModeLabel(compare.mostCommonSwitch.to)}`
                : "—"
            }
            label="Most common method switch"
          />
        </div>
        {compare.entries.length ? (
          compare.entries.slice(0, 8).map((b) => (
            <div key={b.bookId ?? b.title} className="reread-book-report">
              <div className="rank-top">
                <strong>{b.title}</strong>
                <span>{plural(b.rereads.length, "reread")}</span>
              </div>
              <RereadComparisonCard original={b.original} reread={b.latest} />
            </div>
          ))
        ) : (
          <p className="text-sm muted">
            No rereads logged yet. Open a finished book and choose “Start reread” to track another
            pass without losing the original completion.
          </p>
        )}
      </div>

      <div className="card settings-row">
        <h3 className="small-title">TBR aging</h3>
        <p className="section-sub">Days since each book entered your Want to Read shelf</p>
        <div className="habit-kpis">
          <HabitKpi value={lib.tbr.count} label="Books on TBR" />
          <HabitKpi
            value={
              lib.tbr.averageAgeDays === null ? "—" : `${Math.round(lib.tbr.averageAgeDays)} days`
            }
            label="Mean TBR age"
          />
          <HabitKpi
            value={
              lib.tbr.distribution.medianAgeDays === null
                ? "—"
                : `${Math.round(lib.tbr.distribution.medianAgeDays)} days`
            }
            label="Median TBR age"
          />
          <HabitKpi value={lib.tbr.unknown} label="Unknown added date" />
        </div>
        <h4 className="small-title tbr-subhead">Distribution of days on TBR</h4>
        <p className="section-sub">
          Books in each waiting-time range · {lib.tbr.known} books with usable dates
        </p>
        <div
          className="tbr-age-distribution"
          role="group"
          aria-label="Distribution of days books have been on the TBR shelf"
        >
          {lib.tbr.distribution.buckets.map((b) => (
            <button
              key={b.id}
              type="button"
              className="tbr-age-row insight-drill-row"
              aria-label={`See ${b.count} books on TBR for ${b.label}`}
              onClick={() => drill("tbr-age", b.id, `TBR waiting ${b.label}`)}
            >
              <span className="tbr-age-label">{b.label}</span>
              <div className="tbr-age-track">
                <span className="tbr-age-fill" style={{ width: `${(b.count / tbrMax) * 100}%` }} />
              </div>
              <strong className="tbr-age-count">
                {b.count}
                <small>{Math.round(b.share * 100)}%</small>
              </strong>
            </button>
          ))}
        </div>
        <p className="tiny">
          {lib.tbr.distribution.estimated
            ? `${lib.tbr.distribution.estimated} books use approximate dates from Goodreads Date Added or record creation. `
            : ""}
          {lib.tbr.unknown ? `${lib.tbr.unknown} undated books are excluded. ` : ""}No dates or
          waiting times are invented.
        </p>
        <div className="cardline" />
        <h4 className="small-title">Oldest books on TBR</h4>
        {lib.tbr.oldest.length ? (
          lib.tbr.oldest.map((x) => (
            <div key={`${x.title}-${x.addedOn}`} className="rank-row">
              <div className="rank-top">
                <strong>{x.title}</strong>
                <span>{x.ageDays} days</span>
              </div>
              <div className="tiny">
                Reference date {x.addedOn}
                {x.source !== "tbr_added_on" ? " · approximate" : ""}
              </div>
            </div>
          ))
        ) : (
          <p className="tiny">No dated TBR entries yet.</p>
        )}
      </div>

      <div className="card settings-row">
        <h3 className="small-title">From TBR to reading and finished</h3>
        <p className="section-sub">
          Wait from the saved TBR date to the first known start or completion
        </p>
        <div className="habit-kpis">
          <HabitKpi
            value={
              transitions.overall.meanToStart === null
                ? "—"
                : `${Math.round(transitions.overall.meanToStart)} days`
            }
            label="Average TBR → started"
          />
          <HabitKpi
            value={
              transitions.overall.meanToFinish === null
                ? "—"
                : `${Math.round(transitions.overall.meanToFinish)} days`
            }
            label="Average TBR → finished"
          />
          <HabitKpi value={transitions.overall.toStartCount} label="Books with start dates" />
          <HabitKpi value={transitions.overall.toFinishCount} label="Books with finish dates" />
        </div>
        <div className="tbr-transition-table">
          <div className="tbr-transition-head">
            <strong>Genre</strong>
            <strong>To started</strong>
            <strong>To finished</strong>
          </div>
          {transitions.byGenre.length ? (
            transitions.byGenre.map((x) => (
              <div key={x.genre} className="tbr-transition-row">
                <strong>{x.genre}</strong>
                <span>
                  {x.meanToStart === null ? "—" : `${Math.round(x.meanToStart)}d`}{" "}
                  <small>({x.toStartCount})</small>
                </span>
                <span>
                  {x.meanToFinish === null ? "—" : `${Math.round(x.meanToFinish)}d`}{" "}
                  <small>({x.toFinishCount})</small>
                </span>
              </div>
            ))
          ) : (
            <p className="tiny">Add TBR and first-reading/finish dates to see transitions.</p>
          )}
        </div>
        <p className="tiny">
          Means use only books with usable dates; {transitions.overall.approximateCount} use an
          approximate starting date. Unknown and negative intervals are excluded.
        </p>
      </div>

      <div className="card settings-row">
        <h3 className="small-title">Series progress &amp; reading patterns</h3>
        <p className="section-sub">
          Series order from Goodreads titles such as “Dune (Dune #1)” or Book Details metadata.
        </p>
        <div className="habit-kpis">
          <HabitKpi value={series.fullSeries} label="All known volumes read" />
          <HabitKpi value={series.startedNotComplete} label="Started, not confirmed complete" />
          <HabitKpi value={series.tracked} label="Series in library" />
          <HabitKpi value={series.unverified} label="Started · total unknown" />
        </div>
        {series.series.length ? (
          series.series.map((x) => (
            <details key={x.name} className="series-card">
              <summary>
                <span>
                  <strong>{x.name}</strong>
                  <small>
                    {x.finishedCount} finished · {x.trackedCount} tracked installments
                    {x.expectedTotal
                      ? ` of ${x.expectedTotal} known main books`
                      : " · total unknown"}
                    {x.inconsistentTotals ? " · conflicting totals" : ""}
                  </small>
                </span>
                <span className="series-status">
                  {x.fullyRead ? "✓ Fully read" : x.started ? "In progress" : "Not started"}
                </span>
              </summary>
              <div className="series-installments">
                {x.rows.map((b) => (
                  <div key={b.bookId} className="series-installment">
                    <Link href={`/books/${b.bookId}`}>
                      <strong>
                        #{b.number} {b.title}
                      </strong>
                    </Link>
                    <span>{STATUS_TEXT[b.status as keyof typeof STATUS_TEXT] ?? b.status}</span>
                    <span>{b.rating === null ? "Unrated" : `${b.rating.toFixed(2)} ★`}</span>
                    <div
                      className="series-rating-track"
                      title={b.rating === null ? "No rating" : `${b.rating} stars`}
                    >
                      <i style={{ width: `${((b.rating || 0) / 5) * 100}%` }} />
                    </div>
                    <div
                      className="series-mode-chart"
                      aria-label="Reading modes by recorded minutes"
                    >
                      {SPEED_KEYS.map((mode) => {
                        const m = b.speed[mode].minutes;
                        return m > 0 ? (
                          <i
                            key={mode}
                            style={{
                              width: `${b.speed.overall.minutes ? (m / b.speed.overall.minutes) * 100 : 0}%`,
                              background: MODE_COLORS[mode],
                            }}
                            title={`${MODE_TEXT[mode]}: ${Math.round(m)} measured minutes`}
                          />
                        ) : null;
                      })}
                    </div>
                    <small>
                      {b.speed.overall.pagesPerHour == null
                        ? "Speed unavailable"
                        : `${b.speed.overall.pagesPerHour.toFixed(1)} pg/hr`}{" "}
                      · {b.sessions} logs
                    </small>
                  </div>
                ))}
              </div>
              {ctx.editable && <FillSeriesButton name={x.name} />}
              <p className="tiny">
                Totals are only filled where blank; manually entered totals are never overwritten.
              </p>
            </details>
          ))
        ) : (
          <p className="tiny">
            No series detected yet. Edit name, order or known total in Book Details.
          </p>
        )}
      </div>
    </section>
  );
}
