"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { BookCover } from "@/components/BookCover";
import { Modal } from "@/components/Modal";
import { bookChartColors } from "@/lib/book-chart-colors";
import { STATUS_TEXT } from "@/lib/book-display";
import {
  dailyGoalForYear,
  formatTime,
  modeOf,
  pageTotals,
  periodGroups,
  periodSpec,
  shortDate,
  streaks,
  sumOf,
  type InsightPeriod,
} from "@/lib/insights-period";
import { insightBooks } from "@/lib/library-drilldown";
import { completedBooksInYear, readingPasses } from "@/lib/reading-history";
import {
  bookActivitySummary,
  dailyGoalTargetAt,
  dailyReadingGoalStats,
} from "@/lib/reading-metrics";
import {
  anchoredGoalHistory,
  profileTrackingStart,
  sessionsInReportingPeriod,
} from "@/lib/tracking-start";
import type { IsoDate } from "@/lib/types";
import type { InsightsData } from "@/data/insights";

import { ActivityChart, GoalVsActualChart, Heatmap, Kpi } from "./charts";
import {
  MODE_TEXT,
  SPEED_KEYS,
  type InsightsContext,
  type Metric,
  type ModeFilter,
} from "./context";
import { AnnualGoalForm, DailyGoalForm } from "./GoalForms";
import { BookDaysCard, HabitsSection, LibrarySection, SpeedPanel } from "./sections";

type Drill = { kind: string; value: string; label: string };

export function InsightsView({ data, today }: { data: InsightsData; today: IsoDate }) {
  const thisYear = Number(today.slice(0, 4));
  const [view, setView] = useState<"summary" | "detailed">("summary");
  const [period, setPeriod] = useState<InsightPeriod>("week");
  const [year, setYear] = useState(thisYear);
  const [bookFilter, setBookFilter] = useState("all");
  const [mode, setMode] = useState<ModeFilter>("all");
  const [metric, setMetric] = useState<Metric>("minutes");
  const [showAllBookDays, setShowAllBookDays] = useState(false);
  const [drill, setDrill] = useState<Drill | null>(null);

  const ctx = useMemo<InsightsContext>(() => {
    const trackingStart = profileTrackingStart(data.profile);
    const goalHistory = anchoredGoalHistory(
      data.goalHistory,
      trackingStart,
      data.profile?.tracking_start_goal_minutes,
    );
    const goalForYear = (y: number) => dailyGoalForYear(data.goals, y);
    const spec = periodSpec(period, today, year);
    const filtered = data.sessions.filter(
      (s) =>
        (mode === "all" || modeOf(s) === mode) &&
        (bookFilter === "all" || s.user_book_id === bookFilter),
    );
    const window = { periodStart: spec.start, periodEnd: spec.end, today, trackingStart };
    return {
      books: data.books,
      sessions: data.sessions,
      entries: sessionsInReportingPeriod(filtered, window),
      speedRows: sessionsInReportingPeriod(
        data.sessions.filter((s) => bookFilter === "all" || s.user_book_id === bookFilter),
        window,
      ),
      today,
      trackingStart,
      goalHistory,
      period,
      spec,
      groups: periodGroups(period, spec),
      bookFilter,
      mode,
      metric,
      targetForDate: (date) =>
        dailyGoalTargetAt(goalHistory, date, goalForYear(Number(date.slice(0, 4)))),
      dailyGoalForYear: goalForYear,
      bookById: new Map(data.books.map((b) => [b.id, b])),
      openDrill: (kind, value, label) => setDrill({ kind, value, label }),
    };
  }, [data, today, period, year, bookFilter, mode, metric]);

  const { entries, spec } = ctx;
  const minutes = sumOf(entries, "duration_minutes"),
    pages = sumOf(entries, "pages_read");
  const pageEntries = entries.filter((s) => s.pages_read != null && modeOf(s) !== "audiobook");
  const pageMinutes = sumOf(pageEntries, "duration_minutes");
  const totals = pageTotals(entries);
  const activeDays = new Set(entries.map((s) => s.session_date)).size;
  const streak = streaks(
    data.sessions.filter(
      (s) =>
        (mode === "all" || modeOf(s) === mode) &&
        (bookFilter === "all" || s.user_book_id === bookFilter),
    ),
    today,
    ctx.trackingStart,
  );
  const complete = completedBooksInYear(data.books, year);
  const goal = Number(data.goals.find((g) => Number(g.year) === year)?.books_target) || 12;
  const pct = Math.min(100, Math.round((complete.length / goal) * 100));
  const dailyTarget = ctx.targetForDate(today);
  const goalOptions = {
    targetMinutes: 30,
    goalHistory: ctx.goalHistory,
    today,
    activeFrom: ctx.trackingStart,
  };
  const dailyGoal = dailyReadingGoalStats(data.sessions, goalOptions);
  const periodGoal = dailyReadingGoalStats(data.sessions, {
    ...goalOptions,
    periodStart: spec.start,
    periodEnd: spec.end,
  });
  const goalPercent = Math.min(100, Math.round((100 * dailyGoal.todayMinutes) / dailyTarget));
  const periodBooks = new Set(entries.map((s) => s.user_book_id)).size;
  const top = data.books
    .map((b) => ({ b, ...bookActivitySummary(entries, { bookId: b.id }) }))
    .filter((x) => x.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);
  const colors = bookChartColors(data.books, entries);
  const rated = data.books.filter((b) => b.rating != null);
  const ratings = new Map<number, number>();
  rated.forEach((b) => ratings.set(Number(b.rating), (ratings.get(Number(b.rating)) ?? 0) + 1));
  const rankMax = Math.max(1, ...top.map((x) => x.minutes)),
    rateMax = Math.max(1, ...ratings.values());
  const drillBooks = drill
    ? insightBooks(data.books, { kind: drill.kind, value: drill.value, today })
    : [];

  const metricToggle = (
    <div className="segmented">
      {(["minutes", "pages"] as const).map((m) => (
        <button
          key={m}
          type="button"
          className={`seg-btn ${metric === m ? "active" : ""}`}
          aria-pressed={metric === m}
          onClick={() => setMetric(m)}
        >
          {m === "minutes" ? "Time" : "Pages"}
        </button>
      ))}
    </div>
  );

  const header = (
    <>
      <div
        className="segmented insights-view-toggle"
        role="group"
        aria-label="Insights detail level"
      >
        {(["summary", "detailed"] as const).map((v) => (
          <button
            key={v}
            type="button"
            className={`seg-btn ${view === v ? "active" : ""}`}
            aria-pressed={view === v}
            onClick={() => setView(v)}
          >
            {v === "summary" ? "Quick summary" : "Detailed Insights"}
          </button>
        ))}
      </div>
      <div className="toolbar space">
        <div className="segmented">
          {(
            [
              ["week", "This Week"],
              ["month", "This Month"],
              ["year", "This Year · Monthly"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`seg-btn ${period === id ? "active" : ""}`}
              aria-pressed={period === id}
              onClick={() => setPeriod(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="inline">
          {period === "year" && (
            <select
              className="select insight-year"
              aria-label="Year"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {Array.from({ length: 7 }, (_, i) => thisYear - i).map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          )}
          <select
            className="select insight-book"
            aria-label="Filter by book"
            value={bookFilter}
            onChange={(e) => setBookFilter(e.target.value)}
          >
            <option value="all">All books</option>
            {[...data.books]
              .sort((a, b) => a.title.localeCompare(b.title))
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
          </select>
          <select
            className="select insight-book"
            aria-label="Filter by reading mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as ModeFilter)}
          >
            <option value="all">All reading modes</option>
            {SPEED_KEYS.map((k) => (
              <option key={k} value={k}>
                {MODE_TEXT[k]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="section-sub period-caption">
        {spec.label} ·{" "}
        {period === "year"
          ? "12 calendar months"
          : period === "week"
            ? "Sunday to Saturday"
            : "Daily totals for the calendar month"}
        {ctx.trackingStart ? ` · Tracking since ${shortDate(ctx.trackingStart)}` : ""}
      </p>
    </>
  );

  const activityCard = (
    <div className="card">
      <div className="cardhead">
        <div>
          <h2 className="section-title">Reading activity by book</h2>
          <p className="section-sub">
            {metric === "minutes" ? "Minutes" : "Pages"} per {period === "year" ? "month" : "day"} ·
            values shown above bars
          </p>
        </div>
        {metricToggle}
      </div>
      <ActivityChart ctx={ctx} />
    </div>
  );

  const drillModal = drill && (
    <Modal title={drill.label} onClose={() => setDrill(null)}>
      <p className="section-sub">
        {drillBooks.length} book{drillBooks.length === 1 ? "" : "s"} in this group. Select a book to
        view its details.
      </p>
      <div className="insight-drilldown-list">
        {drillBooks.length ? (
          drillBooks.map((b) => (
            <Link key={b.id} href={`/books/${b.id}`} className="insight-drilldown-book">
              <BookCover title={b.title} author={b.author} coverUrl={b.cover_url} size="small" />
              <span>
                <strong>{b.title}</strong>
                <small>
                  {b.author || "Unknown author"} ·{" "}
                  {STATUS_TEXT[b.status as keyof typeof STATUS_TEXT] ?? b.status}
                  {b.rating != null ? ` · ${Number(b.rating).toFixed(2)} ★` : ""}
                </small>
              </span>
              <span aria-hidden="true">›</span>
            </Link>
          ))
        ) : (
          <p className="notice">No matching books in the current library.</p>
        )}
      </div>
    </Modal>
  );

  if (view === "summary") {
    const lead = top[0];
    return (
      <>
        {header}
        <section className="insights-quick">
          <div className="eyebrow">At a glance</div>
          <h2 className="section-title">{spec.label} snapshot</h2>
          <div className="kpis summary-kpis">
            <Kpi value={formatTime(minutes)} label="Reading time" />
            <Kpi value={pages.toLocaleString("en-US")} label="Pages progressed" />
            <Kpi value={activeDays} label="Days with activity" />
            <Kpi value={entries.length} label="Sessions" />
            <Kpi
              value={`${periodGoal.daysMet}/${periodGoal.evaluatedDays}`}
              label="Goal days met"
            />
            <Kpi value={periodBooks} label="Books read this period" />
          </div>
          <div className="grid2 summary-spotlights">
            <div className="card">
              <h3 className="small-title">Daily reading goal</h3>
              <p className="section-sub">All reading methods count toward your goal</p>
              <div className="goal-number">
                {formatTime(dailyGoal.todayMinutes)} <span>of {dailyTarget} minutes today</span>
              </div>
              <div className="progress goal-progress">
                <div style={{ width: `${goalPercent}%` }} />
              </div>
              <p className="tiny">
                {dailyGoal.currentGoalStreak} day current goal streak · {periodGoal.daysMet} of{" "}
                {periodGoal.evaluatedDays} tracked days met their goal
              </p>
            </div>
            <div className="card">
              <h3 className="small-title">Most-read book</h3>
              {lead ? (
                <div className="summary-book">
                  <BookCover
                    title={lead.b.title}
                    author={lead.b.author}
                    coverUrl={lead.b.cover_url}
                    size="small"
                  />
                  <div>
                    <strong>{lead.b.title}</strong>
                    <p className="tiny">
                      {formatTime(lead.minutes)} · {lead.sessions} sessions · {lead.readingDays}{" "}
                      reading days
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm muted">No reading logged in this period yet.</p>
              )}
              <div className="cardline" />
              <p className="tiny">
                {complete.length} books finished in {year} · {pct}% of the {goal}-book annual goal
              </p>
            </div>
          </div>
          {activityCard}
          <button
            className="btn primary summary-detail-button"
            type="button"
            onClick={() => setView("detailed")}
          >
            Explore detailed Insights →
          </button>
        </section>
        {drillModal}
      </>
    );
  }

  return (
    <>
      {header}
      <nav className="insight-subnav" aria-label="Insights sections">
        <a href="#insights-overview">Overview</a>
        <a href="#insights-habits">Habits</a>
        <a href="#insights-performance">Performance</a>
        <a href="#insights-books">Books &amp; Library</a>
      </nav>
      <div id="insights-overview" />
      <div className="kpis">
        <Kpi value={formatTime(minutes)} label="Reading time" />
        <Kpi value={pages.toLocaleString("en-US")} label="Pages progressed" />
        <Kpi value={periodBooks} label="Books read" />
        <Kpi value={activeDays} label="Active days" />
        <Kpi value={entries.length} label="Reading sessions" />
        <Kpi
          value={pageMinutes ? (totals.physical / (pageMinutes / 60)).toFixed(1) : "—"}
          label="Read pages / hour"
        />
        <Kpi value={totals.physical.toLocaleString("en-US")} label="Physical read pages" />
        <Kpi
          value={totals.audioEquivalent.toLocaleString("en-US")}
          label="Audiobook page-equivalents"
        />
      </div>
      <div className="card settings-row">
        <h2 className="section-title">Activity by reading mode</h2>
        <p className="section-sub">
          Listening and combined sessions are labeled separately; combined minutes are counted once.
        </p>
        <div className="kpis">
          {SPEED_KEYS.map((k) => (
            <Kpi
              key={k}
              value={formatTime(
                sumOf(
                  entries.filter((s) => modeOf(s) === k),
                  "duration_minutes",
                ),
              )}
              label={MODE_TEXT[k]}
            />
          ))}
        </div>
      </div>
      <div className="settings-row">{activityCard}</div>

      <div id="insights-performance" className="insight-section-heading">
        <div className="eyebrow">Pace &amp; efficiency</div>
        <h2 className="section-title">Reading Performance</h2>
      </div>
      <SpeedPanel ctx={ctx} />
      <BookDaysCard
        ctx={ctx}
        showAll={showAllBookDays}
        onToggle={() => setShowAllBookDays((v) => !v)}
      />

      <div className="card goal settings-row">
        <div className="cardhead">
          <div>
            <div className="eyebrow">{year} reading challenge</div>
            <h2 className="section-title">Annual reading goal</h2>
            <p className="section-sub">
              Distinct books finished in the selected year, including imported completions.
            </p>
          </div>
          {data.editable ? (
            <AnnualGoalForm year={year} target={goal} />
          ) : (
            <span className="status-pill">{goal} books target</span>
          )}
        </div>
        <div className="goal-number">
          {complete.length} <span>of {goal} books completed</span>
        </div>
        <div className="progress goal-progress">
          <div style={{ width: `${pct}%` }} />
        </div>
        <div className="inline goal-remaining">
          <span>{Math.max(0, goal - complete.length)} books remaining</span>
          <strong>{pct}% complete</strong>
        </div>
        {complete.length ? (
          <div className="inline form-footer">
            {complete.map((b) => {
              const pass = readingPasses(b).find(
                (x) =>
                  x.status === "finished" &&
                  Number(x.finished_year || x.finished_on?.slice(0, 4)) === year,
              );
              return (
                <span key={b.id} className="status-pill finished">
                  {b.title} ·{" "}
                  {pass?.finished_on ? shortDate(pass.finished_on) : `${year} (year only)`}
                </span>
              );
            })}
          </div>
        ) : (
          <p className="tiny">
            Finished books with a completion year or date count even if imported before tracking
            began.
          </p>
        )}
      </div>

      <div className="card daily-goal-card settings-row">
        <div className="cardhead">
          <div>
            <div className="eyebrow">All activity types</div>
            <h2 className="section-title">Daily reading-time goal</h2>
            <p className="section-sub">
              Reading, audiobook and Read + Listen minutes count once each.
            </p>
          </div>
          {data.editable ? (
            <DailyGoalForm target={dailyTarget} />
          ) : (
            <span className="status-pill">{dailyTarget} min/day</span>
          )}
        </div>
        <div className="goal-number">
          {formatTime(dailyGoal.todayMinutes)} <span>of {dailyTarget} min today</span>
        </div>
        <p className="tiny">
          {dailyGoal.metToday
            ? "Goal achieved today!"
            : `${dailyGoal.remainingMinutes} minutes remaining today`}
        </p>
        <div className="progress goal-progress">
          <div style={{ width: `${goalPercent}%` }} />
        </div>
        <div className="daily-goal-stats">
          <span>
            <strong>
              {periodGoal.daysMet} / {periodGoal.evaluatedDays}
            </strong>{" "}
            days met goal in selected period
          </span>
          <span>
            <strong>{dailyGoal.currentGoalStreak}</strong> goal streak days
          </span>
          <span>
            <strong>{dailyGoal.longestGoalStreak}</strong> longest goal streak
          </span>
        </div>
        <p className="tiny">
          Daily goal evaluation starts on your tracking start date (Settings). The goal ignores book
          and activity filters. Changing your target applies from today forward; earlier days keep
          theirs.
        </p>
      </div>
      <GoalVsActualChart ctx={ctx} />

      <div className="grid2 settings-row">
        <div className="card">
          <h2 className="section-title">Reading streaks</h2>
          <p className="section-sub">Consecutive days with a logged session</p>
          <div className="inline streak-row">
            <div>
              <div className="kpi-num">{streak.current}</div>
              <div className="kpi-label">Current streak</div>
            </div>
            <div>
              <div className="kpi-num">{streak.best}</div>
              <div className="kpi-label">Best streak</div>
            </div>
          </div>
        </div>
        <div className="card">
          <h2 className="section-title">Reading consistency</h2>
          <p className="section-sub">Daily minutes across all activity types · Past 12 weeks</p>
          <Heatmap ctx={ctx} />
        </div>
      </div>

      <HabitsSection ctx={ctx} />

      <div className="grid2 settings-row">
        <div className="card">
          <h2 className="section-title">Most-read books</h2>
          <p className="section-sub">Ranked by reading time in the selected period</p>
          {top.length ? (
            top.slice(0, 6).map((x) => (
              <div key={x.b.id} className="rank-row">
                <div className="rank-top">
                  <strong>{x.b.title}</strong>
                  <span>{formatTime(x.minutes)}</span>
                </div>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{
                      width: `${(x.minutes / rankMax) * 100}%`,
                      background: colors.get(String(x.b.id)),
                    }}
                  />
                </div>
                <div className="tiny">
                  {x.sessions} sessions · {x.readingDays} reading days
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm muted">No reading logged in this period.</p>
          )}
        </div>
        <div className="card">
          <h2 className="section-title">Personal rating distribution</h2>
          <p className="section-sub">
            Quarter-star precision · {rated.length} rated books · select a rating to see its books
          </p>
          {[...ratings]
            .sort((a, b) => a[0] - b[0])
            .map(([rating, count]) => (
              <button
                key={rating}
                type="button"
                className="rate-row insight-drill-row"
                aria-label={`Show ${count} books rated ${rating.toFixed(2)} stars`}
                onClick={() =>
                  setDrill({
                    kind: "rating",
                    value: String(rating),
                    label: `Books rated ${rating.toFixed(2)} stars`,
                  })
                }
              >
                <span>{rating.toFixed(2)} ★</span>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{ width: `${(count / rateMax) * 100}%`, background: "#ba9558" }}
                  />
                </div>
                <span>{count}</span>
              </button>
            ))}
          <div className="cardline" />
          <p className="text-sm">
            {data.books.filter((b) => b.favorite).length} Favorites ·{" "}
            {rated.length
              ? (rated.reduce((a, b) => a + Number(b.rating), 0) / rated.length).toFixed(2)
              : "—"}{" "}
            average rating
          </p>
        </div>
      </div>

      <LibrarySection ctx={ctx} />
      <p className="tiny settings-row">
        Pages progressed includes physical-reading pages and audiobook-only print-edition
        page-equivalents, labeled separately. Read pages/hour excludes audiobook-only sessions.
        Nothing is estimated.
      </p>
      {drillModal}
    </>
  );
}
