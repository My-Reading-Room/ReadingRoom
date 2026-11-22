// Server-rendered Friend Comparison (legacy friend-comparison-view.js). It
// receives only the permission-scoped output of buildFriendComparison.
import type { FriendComparison } from "@/lib/friend-comparison";

type Full = Extract<FriendComparison, { access: "full" }>;
type Summary = Extract<FriendComparison, { access: "summary" }>;
type Fmt = (n: unknown) => string;
type Row = { label: string; a: unknown; b: unknown; format?: Fmt; aText?: string; bText?: string };

const valid = (v: unknown) =>
  v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
const fmt = (n: unknown, d = 0) =>
  !valid(n)
    ? "—"
    : Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const minutes: Fmt = (m) =>
  valid(m)
    ? `${Math.floor(Number(m) / 60)}h ${String(Math.round(Number(m) % 60)).padStart(2, "0")}m`
    : "—";
const dec: Fmt = (n) => fmt(n, 1);
const rate: Fmt = (n) => (n == null ? "—" : `${fmt(n, 2)} ★`);
const speed: Fmt = (n) => (n == null ? "—" : `${dec(n)} pg/hr`);
const days: Fmt = (n) => (n == null ? "—" : `${fmt(n)} days`);
const fraction: Fmt = (n) => (n == null || !valid(n) ? "—" : `${Math.round(Number(n) * 100)}%`);
const nozero: Fmt = (n) => (n == null ? "—" : fmt(n));
const perDay: Fmt = (n) => `${dec(n)} min/day`;
const orDash = (f: Fmt) => (n: unknown) => (n == null ? "—" : f(n));

type Kind = "count" | "fraction" | "speed" | "minutes";
function chartNum(value: unknown, kind: Kind = "count") {
  if (!valid(value)) return "—";
  const n = Number(value);
  if (kind === "fraction") return `${Math.round(n * 100)}%`;
  if (kind === "speed") return fmt(n, 1);
  if (kind === "minutes") return fmt(Math.round(n));
  if (Math.abs(n) >= 10000) return `${fmt(n / 1000, 1)}k`;
  return Number.isInteger(n) ? fmt(n) : fmt(n, 1);
}

function Pairs({ title, rows, note }: { title: string; rows: Row[]; note?: string }) {
  return (
    <div className="compare-card">
      <h3 className="small-title">{title}</h3>
      {note && <p className="tiny">{note}</p>}
      <div className="compare-column-head">
        <span>Metric</span>
        <strong>You</strong>
        <strong>Friend</strong>
      </div>
      {rows.map((r) => (
        <div key={r.label} className="compare-data-row">
          <span>{r.label}</span>
          <span className="compare-number you">{r.aText ?? (r.format ?? nozero)(r.a)}</span>
          <span className="compare-number friend">{r.bText ?? (r.format ?? nozero)(r.b)}</span>
        </div>
      ))}
    </div>
  );
}

function ChartHead({ title, note, unit }: { title: string; note?: string; unit?: string }) {
  return (
    <>
      <div className="compare-chart-heading">
        <div>
          <h3 className="small-title">{title}</h3>
          {note && <p className="tiny">{note}</p>}
        </div>
        {unit && <span className="compare-unit">{unit}</span>}
      </div>
      <div className="compare-chart-legend" aria-hidden="true">
        <span>
          <i className="compare-swatch you" />
          You
        </span>
        <span>
          <i className="compare-swatch friend" />
          Friend
        </span>
      </div>
    </>
  );
}

type ChartOpts = { note?: string; kind?: Kind; unit?: string; limit?: number };

function ColumnChart({
  title,
  rows,
  note,
  kind = "count",
  unit = "",
  limit = 40,
}: { title: string; rows: Row[] } & ChartOpts) {
  const shown = rows.slice(0, limit);
  const values = shown
    .flatMap((r) => [r.a, r.b])
    .filter(valid)
    .map(Number);
  const max = kind === "fraction" ? 1 : Math.max(1, ...values);
  const bar = (value: unknown, who: "you" | "friend", label: string) => {
    const text = chartNum(value, kind);
    const height =
      valid(value) && Number(value) > 0
        ? Math.max(1.5, Math.min(100, (Number(value) / max) * 100))
        : 0;
    return (
      <div
        className={`compare-graph-bar ${who}${valid(value) ? "" : " is-missing"}`}
        style={{ height: `${height.toFixed(2)}%` }}
        title={`${label} · ${who === "you" ? "You" : "Friend"}: ${text} ${unit}`}
      >
        <span className="compare-graph-value">{text === "—" ? "—" : height ? text : ""}</span>
      </div>
    );
  };
  return (
    <section className="compare-card compare-viz">
      <ChartHead title={title} note={note} unit={unit} />
      {values.some((v) => v > 0) ? (
        <>
          <div
            className="compare-graph-scroll"
            tabIndex={0}
            aria-label={`${title}; scroll sideways for additional dates`}
          >
            <div
              className="compare-column-plot"
              style={{ minWidth: Math.max(335, shown.length * 62) }}
            >
              {shown.map((r) => (
                <div
                  key={r.label}
                  className="compare-graph-group"
                  aria-label={`${r.label}: you ${chartNum(r.a, kind)}, friend ${chartNum(r.b, kind)}`}
                >
                  <div className="compare-graph-bars">
                    {bar(r.a, "you", r.label)}
                    {bar(r.b, "friend", r.label)}
                  </div>
                  <span className="compare-graph-label" title={r.label}>
                    {r.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
          {shown.length > 10 && (
            <p className="compare-scroll-hint">Scroll sideways to explore all dates.</p>
          )}
        </>
      ) : (
        <p className="compare-chart-empty">No chartable activity in this period.</p>
      )}
    </section>
  );
}

function BarChart({
  title,
  rows,
  note,
  kind = "count",
  unit = "",
  limit = 20,
}: { title: string; rows: Row[] } & ChartOpts) {
  const shown = rows.slice(0, limit);
  const values = shown
    .flatMap((r) => [r.a, r.b])
    .filter(valid)
    .map(Number);
  const max = kind === "fraction" ? 1 : Math.max(1, ...values);
  const track = (v: unknown, who: string) => (
    <div className={`compare-hbar-track ${who}`}>
      <i
        style={{
          width: `${(valid(v) && Number(v) > 0 ? Math.min(100, (Number(v) / max) * 100) : 0).toFixed(2)}%`,
        }}
      />
    </div>
  );
  return (
    <section className="compare-card compare-viz">
      <ChartHead title={title} note={note} unit={unit} />
      {values.some((v) => v > 0) ? (
        <div
          className="compare-hbar-rows"
          role="img"
          aria-label={`${title}: paired bars for You and Friend`}
        >
          {shown.map((r) => (
            <div key={r.label} className="compare-hbar-row">
              <span className="compare-hbar-title">{r.label}</span>
              <div className="compare-hbar-stacks">
                {track(r.a, "you")}
                {track(r.b, "friend")}
              </div>
              <div className="compare-hbar-values">
                <span>{chartNum(r.a, kind)}</span>
                <span>{chartNum(r.b, kind)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="compare-chart-empty">No chartable activity in this period.</p>
      )}
    </section>
  );
}

function Group({
  id,
  name,
  description,
  open,
  children,
}: {
  id: string;
  name: string;
  description: string;
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="compare-group card" open={open} id={id}>
      <summary>
        <span>
          <strong>{name}</strong>
          <small>{description}</small>
        </span>
        <span className="compare-caret" aria-hidden="true">
          ⌄
        </span>
      </summary>
      <div className="compare-body">{children}</div>
    </details>
  );
}

const Two = ({ children }: { children: React.ReactNode }) => (
  <div className="compare-two">{children}</div>
);

type Keyed = {
  id?: unknown;
  key?: unknown;
  genre?: unknown;
  rating?: unknown;
  label?: unknown;
} & Record<string, unknown>;
function mapRows(a: Keyed[], b: Keyed[], value: string, format: Fmt): Row[] {
  const key = (x: Keyed) => String(x.id ?? x.key ?? x.genre ?? x.rating ?? x.label);
  const am = new Map(a.map((x) => [key(x), x])),
    bm = new Map(b.map((x) => [key(x), x]));
  return [...new Set([...am.keys(), ...bm.keys()])].map((id) => {
    const first = am.get(id),
      last = bm.get(id);
    return {
      label: String((first ?? last)?.label ?? id),
      a: first ? first[value] : 0,
      b: last ? last[value] : 0,
      format,
    };
  });
}

function HeatPanel({ label, heat }: { label: string; heat: Full["mine"]["heatmap"] }) {
  const max = Math.max(1, heat.maxMinutes);
  const bands = ["Morning", "Midday", "Afternoon", "Evening", "Night"];
  return (
    <div className="compare-heat-box">
      <h4>{label}</h4>
      <div className="compare-heat-head">
        <span />
        {bands.map((s) => (
          <span key={s}>{s.slice(0, 3)}</span>
        ))}
      </div>
      {heat.rows.map((row) => (
        <div key={row.name} className="compare-heat-line">
          <strong>{row.name.slice(0, 3)}</strong>
          {row.cells.map((cell, i) => (
            <span
              key={i}
              title={`${row.name} · ${bands[i]} · ${dec(cell.minutes)} minutes`}
              aria-label={`${row.name} ${bands[i]}: ${fmt(cell.minutes)} minutes`}
              style={{
                background: cell.minutes
                  ? `rgba(48,126,80,${(0.16 + (cell.minutes / max) * 0.75).toFixed(2)})`
                  : "#eef1e9",
              }}
            />
          ))}
        </div>
      ))}
      <p className="tiny">{minutes(heat.unknownMinutes)} unassigned (missing start times)</p>
    </div>
  );
}

function BookList({
  items,
  empty,
  render,
}: {
  items: unknown[];
  empty: string;
  render: (x: never) => React.ReactNode;
}) {
  return (
    <ul className="compare-efficiency">
      {items.length ? items.map((x, i) => <li key={i}>{render(x as never)}</li>) : <li>{empty}</li>}
    </ul>
  );
}

function SummaryView({ d }: { d: Summary }) {
  if (!d.own || !d.other)
    return (
      <div className="notice warn">A summary is not yet available for one of these accounts.</div>
    );
  const a = d.own,
    b = d.other;
  const fields: [string, keyof typeof a, Fmt][] = [
    ["Books finished", "books_finished", nozero],
    ["Annual books goal", "annual_goal", nozero],
    ["Total reading time", "total_minutes", minutes],
    ["Reading Only", "reading_minutes", minutes],
    ["Audiobook Only", "audiobook_minutes", minutes],
    ["Read + Listen", "combined_minutes", minutes],
    ["Sessions", "sessions_count", nozero],
    ["Favorites count", "favorites_count", nozero],
    ["Mean rating", "average_rating", rate],
  ];
  return (
    <>
      <div className="notice">
        Summary-only sharing: comparison is limited to the permitted annual aggregates for{" "}
        <strong>{b.year || a.year || "the current year"}</strong>. More detailed metrics require the
        friend to grant Full access.
      </div>
      <BarChart
        title="Reading time by method"
        kind="minutes"
        unit="minutes"
        rows={[
          { label: "Reading Only", a: a.reading_minutes, b: b.reading_minutes },
          { label: "Audiobook Only", a: a.audiobook_minutes, b: b.audiobook_minutes },
          { label: "Read + Listen", a: a.combined_minutes, b: b.combined_minutes },
        ]}
      />
      <Pairs
        title="Shared annual summary"
        rows={fields.map(([label, key, format]) => ({ label, a: a[key], b: b[key], format }))}
      />
    </>
  );
}

function FullView({ d }: { d: Full }) {
  const a = d.mine,
    b = d.theirs,
    c = d.interests;
  const name = d.friend.display_name || "Friend";
  const year = String(d.period.year);
  const lib = (p: typeof a) => p.library;
  const genre = (key: "books" | "avgRating", f: Fmt): Row[] => {
    const left = new Map(lib(a).genres.map((x) => [x.genre, x])),
      right = new Map(lib(b).genres.map((x) => [x.genre, x]));
    const total = (k: string) => (left.get(k)?.books || 0) + (right.get(k)?.books || 0);
    return [...new Set([...left.keys(), ...right.keys()])]
      .sort((x, y) => total(y) - total(x))
      .slice(0, 14)
      .map((k) => ({
        label: k,
        a: left.get(k)?.[key] ?? (key === "avgRating" ? null : 0),
        b: right.get(k)?.[key] ?? (key === "avgRating" ? null : 0),
        format: f,
      }));
  };
  const ratings = [...new Set([...lib(a).ratings, ...lib(b).ratings].map((x) => x.rating))]
    .sort((x, y) => x - y)
    .map((r) => ({
      label: `${fmt(r, 2)} ★`,
      a: lib(a).ratings.find((x) => x.rating === r)?.count || 0,
      b: lib(b).ratings.find((x) => x.rating === r)?.count || 0,
    }));
  const speedModes = (
    [
      ["Overall", "overall"],
      ["Reading Only", "reading"],
      ["Audiobook Only", "audiobook"],
      ["Read + Listen", "read_listen"],
    ] as const
  ).map(([label, key]) => ({ label, a: a.speed[key].pagesPerHour, b: b.speed[key].pagesPerHour }));
  const ga = new Map(a.genresSpeed.map((x) => [x.genre, x])),
    gb = new Map(b.genresSpeed.map((x) => [x.genre, x]));
  const speedGenre = [...new Set([...ga.keys(), ...gb.keys()])].slice(0, 12).map((k) => ({
    label: k,
    a: ga.get(k)?.pagesPerHour ?? null,
    b: gb.get(k)?.pagesPerHour ?? null,
  }));
  const goalKey = (k: string) => k.slice(5);
  const topBooks = (p: typeof a) => (
    <BookList
      items={p.perBook.slice(0, 8)}
      empty="No reading activity in this period."
      render={(x: (typeof a.perBook)[number]) => (
        <>
          <strong>{x.book.title}</strong>
          <small>
            {x.book.author || ""} · {minutes(x.minutes)} · {fmt(x.pages)} pages · {x.sessions}{" "}
            sessions · {x.readingDays} active days
          </small>
        </>
      )}
    />
  );
  const bySpeed = (p: typeof a) => (
    <BookList
      items={p.perBook.filter((x) => x.speed.overall.measuredSessions > 0).slice(0, 8)}
      empty="No measured speed for books in this period."
      render={(x: (typeof a.perBook)[number]) => (
        <>
          <strong>{x.book.title}</strong>
          <small>
            {speed(x.speed.overall.pagesPerHour)} · {x.speed.overall.measuredSessions} measured
            sessions
          </small>
        </>
      )}
    />
  );
  const efficiency = (p: typeof a) => (
    <BookList
      items={p.efficiency.slice(0, 6)}
      empty="No dated reading passes."
      render={(e: (typeof a.efficiency)[number]) => (
        <>
          <strong>{e.title}</strong>
          <small>
            {e.readingDays}/{e.elapsedDays} active/elapsed days ·{" "}
            {e.minutesPerActiveDay == null ? "—" : `${dec(e.minutesPerActiveDay)}m`} per active day
            · {e.pagesPerActiveDay == null ? "—" : `${dec(e.pagesPerActiveDay)}p`} per active day ·{" "}
            {fraction(e.consistency)} consistency
          </small>
        </>
      )}
    />
  );
  const tags = (list: string[], empty: string) => (
    <div className="compare-tags">
      {list.length ? (
        list.map((g) => (
          <span key={g} className="compare-tag">
            {g}
          </span>
        ))
      ) : (
        <span className="tiny">{empty}</span>
      )}
    </div>
  );
  const shortList = (list: { title?: string | null; author?: string | null }[]) =>
    list.length ? (
      <>
        <ul className="compare-book-list">
          {list.slice(0, 8).map((x, i) => (
            <li key={i}>
              <strong>{x.title}</strong>
              <small>{x.author || "Author not recorded"}</small>
            </li>
          ))}
        </ul>
        {list.length > 8 && <p className="tiny">+ {list.length - 8} more books</p>}
      </>
    ) : (
      <p className="tiny">None recorded</p>
    );
  const switchText = (p: typeof a) =>
    p.rereadPairs.mostCommonSwitch
      ? `${p.rereadPairs.mostCommonSwitch.from} → ${p.rereadPairs.mostCommonSwitch.to}`
      : "—";

  return (
    <>
      <div className="compare-explanation">
        {d.period.label} · You: tracking since {a.cutoff || "unknown"} · {name}: tracking since{" "}
        {b.cutoff || "unknown"}. Each account&apos;s own cutoff applies; comparisons may cover
        different numbers of tracked days. {c.shared.length} title{c.shared.length === 1 ? "" : "s"}{" "}
        in common.
      </div>
      <div className="compare-highlights">
        {(
          [
            ["Reading time", minutes(a.minutes), minutes(b.minutes)],
            ["Pages progressed", nozero(a.pages), nozero(b.pages)],
            ["Reading sessions", nozero(a.sessionCount), nozero(b.sessionCount)],
            ["Active days", nozero(a.activeDays), nozero(b.activeDays)],
          ] as const
        ).map(([title, left, right]) => (
          <div key={title} className="compare-highlight">
            <span className="compare-highlight-title">{title}</span>
            <div className="compare-highlight-pair">
              <span>
                <small>You</small>
                <strong>{left}</strong>
              </span>
              <span>
                <small>Friend</small>
                <strong>{right}</strong>
              </span>
            </div>
          </div>
        ))}
      </div>

      <Group
        id="compare-overview"
        name="Overview and activity"
        description="Reading time, page progress, sessions, active days and activity charts"
        open
      >
        <ColumnChart
          title="Reading activity over time"
          note="Calendar dates or months in the selected period. No sessions are double counted."
          kind="minutes"
          unit="minutes"
          rows={a.periods.map((g, i) => ({
            label: g.label,
            a: g.minutes,
            b: b.periods[i]?.minutes || 0,
          }))}
        />
        <ColumnChart
          title="Pages progressed over time"
          unit="pages"
          rows={a.periods.map((p, i) => ({
            label: p.label,
            a: p.pages,
            b: b.periods[i]?.pages ?? 0,
          }))}
        />
        <details className="compare-detail-disclosure">
          <summary>View all activity metrics</summary>
          <Pairs
            title="Additional activity metrics"
            rows={[
              { label: "Reading time", a: a.minutes, b: b.minutes, format: minutes },
              { label: "Pages progressed", a: a.pages, b: b.pages },
              { label: "Physical-reading pages", a: a.physicalPages, b: b.physicalPages },
              {
                label: "Audiobook page-equivalents",
                a: a.audiobookEquivalents,
                b: b.audiobookEquivalents,
              },
              { label: "Reading sessions", a: a.sessionCount, b: b.sessionCount },
              { label: "Books read in period", a: a.distinctBooks, b: b.distinctBooks },
              { label: "Active reading days", a: a.activeDays, b: b.activeDays },
              {
                label: "Current reading-day streak",
                a: a.streak.current,
                b: b.streak.current,
                format: days,
              },
              {
                label: "Longest reading-day streak",
                a: a.streak.longest,
                b: b.streak.longest,
                format: days,
              },
            ]}
          />
        </details>
        <Two>
          <div className="compare-card">
            <h3 className="small-title">Your most-read books</h3>
            {topBooks(a)}
          </div>
          <div className="compare-card">
            <h3 className="small-title">{name}&apos;s most-read books</h3>
            {topBooks(b)}
          </div>
        </Two>
      </Group>

      <Group
        id="compare-goals"
        name="Goals and consistency"
        description="Annual completion, daily goal progress, goal reference and streaks"
      >
        <Pairs
          title="Annual and daily goals"
          rows={[
            { label: `Books finished in ${year}`, a: a.completions, b: b.completions },
            { label: "Annual books target", a: a.annualGoal, b: b.annualGoal },
            {
              label: "Annual goal progress",
              a: a.completions / Number(a.annualGoal),
              b: b.completions / Number(b.annualGoal),
              format: fraction,
            },
            {
              label: "Daily minutes target today",
              a: a.goal.targetMinutes,
              b: b.goal.targetMinutes,
              format: (n) => `${fmt(n)} min`,
            },
            {
              label: "Minutes logged today",
              a: a.goal.todayMinutes,
              b: b.goal.todayMinutes,
              format: minutes,
            },
            { label: "Days meeting goal", a: a.goal.daysMet, b: b.goal.daysMet },
            { label: "Tracked calendar days", a: a.goal.evaluatedDays, b: b.goal.evaluatedDays },
            {
              label: "Goal success rate",
              a: a.goal.percentDaysMet,
              b: b.goal.percentDaysMet,
              format: fraction,
            },
            {
              label: "Current goal streak",
              a: a.goal.currentGoalStreak,
              b: b.goal.currentGoalStreak,
              format: days,
            },
            {
              label: "Longest goal streak",
              a: a.goal.longestGoalStreak,
              b: b.goal.longestGoalStreak,
              format: days,
            },
          ]}
        />
        <ColumnChart
          title="Daily goal completion by period"
          note="Share of tracked days meeting each reader’s goal for that date."
          kind="fraction"
          unit="goal days met"
          rows={a.goalSeries.map((g, i) => {
            const o = b.goalSeries[i];
            return {
              label: goalKey(g.key),
              a: g.days ? g.daysMet / g.days : null,
              b: o?.days ? o.daysMet / o.days : null,
            };
          })}
        />
        <ColumnChart
          title="Logged reading time by day / month"
          kind="minutes"
          unit="minutes"
          rows={a.goalSeries.map((g, i) => ({
            label: goalKey(g.key),
            a: g.actualMinutes,
            b: b.goalSeries[i]?.actualMinutes ?? 0,
          }))}
        />
      </Group>

      <Group
        id="compare-speed"
        name="Speed and reading performance"
        description="Weighted page speed by activity mode, genre, book and calendar period"
      >
        <BarChart
          title="Reading speed · pages per hour"
          note="Only sessions with known page progress and time are included."
          kind="speed"
          unit="pages/hour"
          rows={speedModes}
        />
        <Pairs
          title="Measured and unmeasured speed data"
          rows={[
            {
              label: "Sessions with measured page speed",
              a: a.speed.overall.measuredSessions,
              b: b.speed.overall.measuredSessions,
            },
            {
              label: "Sessions with no measurable page speed",
              a: a.speed.overall.excludedSessions,
              b: b.speed.overall.excludedSessions,
            },
            {
              label: "Measured reading time",
              a: a.speed.overall.minutes,
              b: b.speed.overall.minutes,
              format: minutes,
            },
          ]}
        />
        <ColumnChart
          title="Speed over time · Overall"
          note="Measured pages divided by measured session hours; missing readings are not estimated."
          kind="speed"
          unit="pages/hour"
          rows={a.periods.map((p, i) => ({
            label: p.label,
            a: p.speed,
            b: b.periods[i]?.speed ?? null,
          }))}
        />
        {(["reading", "audiobook", "read_listen"] as const).map((k, i) => {
          const rows = a.periods
            .map((p, j) => ({
              label: p.label,
              a: p.modeSpeed[k].pagesPerHour,
              b: b.periods[j]?.modeSpeed[k].pagesPerHour ?? null,
            }))
            .filter((r) => r.a !== null || r.b !== null);
          return (
            <ColumnChart
              key={k}
              title={`Speed trends · ${["Reading Only", "Audiobook Only", "Read + Listen"][i]}`}
              kind="speed"
              unit="pages/hour"
              rows={rows.length ? rows : [{ label: "No measured sessions", a: null, b: null }]}
            />
          );
        })}
        <BarChart
          title="Reading speed by primary genre"
          kind="speed"
          unit="pages/hour"
          rows={speedGenre}
        />
        <Two>
          <div className="compare-card">
            <h3 className="small-title">Your speed by book</h3>
            {bySpeed(a)}
          </div>
          <div className="compare-card">
            <h3 className="small-title">{name}: speed by book</h3>
            {bySpeed(b)}
          </div>
        </Two>
      </Group>

      <Group
        id="compare-habits"
        name="Time of day and reading habits"
        description="Five local time bands, day of week, heatmaps, length and method distribution"
      >
        <BarChart
          title="Reading time by time of day"
          note="Local start times; minutes crossing a band boundary are split."
          kind="minutes"
          unit="minutes"
          rows={mapRows(a.clock.buckets, b.clock.buckets, "minutes", minutes)}
        />
        <BarChart
          title="Weighted reading speed by time of day"
          kind="speed"
          unit="pages/hour"
          rows={mapRows(a.clock.buckets, b.clock.buckets, "pagesPerHour", speed)}
        />
        <BarChart
          title="Reading by day of week · Sunday first"
          note="Average minutes per tracked calendar weekday, including zero-session days."
          kind="minutes"
          unit="minutes/day"
          rows={a.weekday.days.map((x, i) => ({
            label: x.name,
            a: x.avgMinutesPerDay,
            b: b.weekday.days[i]?.avgMinutesPerDay,
          }))}
        />
        <Pairs
          title="Weekdays vs weekends"
          rows={[
            {
              label: "Weekday reading time",
              a: a.weekday.weekdays.minutes,
              b: b.weekday.weekdays.minutes,
              format: minutes,
            },
            {
              label: "Weekend reading time",
              a: a.weekday.weekends.minutes,
              b: b.weekday.weekends.minutes,
              format: minutes,
            },
            {
              label: "Weekday average",
              a: a.weekday.weekdays.avgMinutesPerDay,
              b: b.weekday.weekdays.avgMinutesPerDay,
              format: perDay,
            },
            {
              label: "Weekend average",
              a: a.weekday.weekends.avgMinutesPerDay,
              b: b.weekday.weekends.avgMinutesPerDay,
              format: perDay,
            },
          ]}
        />
        <div className="compare-heat-duo">
          <HeatPanel label="You" heat={a.heatmap} />
          <HeatPanel label={name} heat={b.heatmap} />
        </div>
        <Pairs
          title="Session length"
          rows={[
            {
              label: "Average session",
              a: a.sessionsByLength.avgMinutes,
              b: b.sessionsByLength.avgMinutes,
              format: orDash((n) => `${dec(n)} min`),
            },
            {
              label: "Median session",
              a: a.sessionsByLength.medianMinutes,
              b: b.sessionsByLength.medianMinutes,
              format: orDash((n) => `${dec(n)} min`),
            },
            {
              label: "Longest session",
              a: a.sessionsByLength.longestMinutes,
              b: b.sessionsByLength.longestMinutes,
              format: orDash((n) => `${fmt(n)} min`),
            },
          ]}
        />
        <BarChart
          title="Session duration distribution"
          unit="sessions"
          rows={mapRows(a.sessionsByLength.buckets, b.sessionsByLength.buckets, "count", nozero)}
        />
        <BarChart
          title="Reading method · logged time"
          kind="minutes"
          unit="minutes"
          rows={mapRows(a.activity.buckets, b.activity.buckets, "minutes", minutes)}
        />
        <BarChart
          title="Reading method · share of time"
          unit="% of time"
          rows={mapRows(a.activity.buckets, b.activity.buckets, "share", (n) => `${dec(n)}%`)}
        />
      </Group>

      <Group
        id="compare-interests"
        name="Shared books and interests"
        description="Overlapping books, rating differences, similar and distinct genres"
      >
        <Pairs
          title="Your libraries"
          rows={[
            { label: "Books in library", a: a.libraryCount, b: b.libraryCount },
            { label: "Books both of you have", a: c.shared.length, b: c.shared.length },
            { label: "Unique to each library", a: c.mineOnly.length, b: c.theirsOnly.length },
            { label: "Favorites", a: a.favorites, b: b.favorites },
            { label: "Rated books", a: a.rated, b: b.rated },
            {
              label: "Mean personal rating",
              a: lib(a).averageRating,
              b: lib(b).averageRating,
              format: rate,
            },
          ]}
        />
        <div className="compare-card">
          <h3 className="small-title">Books you both have</h3>
          {c.shared.length ? (
            <ul className="compare-shared-list">
              {c.shared.slice(0, 16).map((x, i) => (
                <li key={i}>
                  <span>
                    <strong>{x.mine.title}</strong>
                    <small>{x.mine.author}</small>
                  </span>
                  <span className="compare-book-rating">
                    You: {rate(x.mine.rating)}
                    <small>
                      {name}: {rate(x.theirs.rating)}
                      {x.ratingGap === null ? "" : ` · Difference ${dec(Math.abs(x.ratingGap))} ★`}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="tiny">
              No overlapping books identified by matching title and author yet.
            </p>
          )}
        </div>
        <Two>
          <div className="compare-card">
            <h3 className="small-title">Only in your library</h3>
            {shortList(c.mineOnly)}
          </div>
          <div className="compare-card">
            <h3 className="small-title">Only in {name}&apos;s library</h3>
            {shortList(c.theirsOnly)}
          </div>
        </Two>
        <div className="compare-card">
          <h3 className="small-title">Genre similarities</h3>
          <p className="compare-tag-label">Shared interests</p>
          {tags(c.sharedGenres, "No matching genre tags yet")}
          <Two>
            <div>
              <p className="compare-tag-label">Unique to you</p>
              {tags(c.mineGenres, "None")}
            </div>
            <div>
              <p className="compare-tag-label">Unique to {name}</p>
              {tags(c.theirsGenres, "None")}
            </div>
          </Two>
        </div>
        <BarChart
          title="Library by genre (primary genre)"
          unit="books"
          rows={genre("books", nozero)}
        />
        <BarChart
          title="Average personal rating by genre"
          kind="speed"
          unit="stars"
          rows={genre("avgRating", rate)}
        />
        <BarChart title="Quarter-star rating distribution" unit="books" rows={ratings} />
        <Pairs
          title="Reading status / shelf"
          rows={[
            { label: "Currently reading", a: a.statuses.reading, b: b.statuses.reading },
            { label: "Want to read", a: a.statuses.tbr, b: b.statuses.tbr },
            { label: "Finished", a: a.statuses.finished, b: b.statuses.finished },
            { label: "Did not finish", a: a.statuses.dnf, b: b.statuses.dnf },
          ]}
        />
      </Group>

      <Group
        id="compare-library"
        name="TBR, completion efficiency and rereads"
        description="Aging, active vs elapsed days and original-vs-reread metrics"
      >
        <Pairs
          title="TBR aging"
          rows={[
            { label: "Books on Want to Read", a: lib(a).tbr.count, b: lib(b).tbr.count },
            {
              label: "Average TBR age",
              a: lib(a).tbr.averageAgeDays,
              b: lib(b).tbr.averageAgeDays,
              format: orDash((n) => `${fmt(n)} days`),
            },
            {
              label: "Median TBR age",
              a: lib(a).tbr.distribution.medianAgeDays,
              b: lib(b).tbr.distribution.medianAgeDays,
              format: orDash((n) => `${fmt(n)} days`),
            },
            { label: "Unknown TBR added date", a: lib(a).tbr.unknown, b: lib(b).tbr.unknown },
          ]}
        />
        <BarChart
          title="Distribution of days on TBR"
          unit="books"
          rows={lib(a).tbr.distribution.buckets.map((r, i) => ({
            label: r.label,
            a: r.count,
            b: lib(b).tbr.distribution.buckets[i]?.count,
          }))}
        />
        <Two>
          <div className="compare-card">
            <h3 className="small-title">Your most-active books</h3>
            {efficiency(a)}
          </div>
          <div className="compare-card">
            <h3 className="small-title">{name}: most-active books</h3>
            {efficiency(b)}
          </div>
        </Two>
        <Pairs
          title="Reread history · lifetime"
          rows={[
            { label: "Books reread", a: a.rereads.booksReread, b: b.rereads.booksReread },
            { label: "Rereads started", a: a.rereads.rereadsStarted, b: b.rereads.rereadsStarted },
            {
              label: "Rereads finished",
              a: a.rereads.rereadsFinished,
              b: b.rereads.rereadsFinished,
            },
            {
              label: "Currently rereading",
              a: a.rereads.currentlyRereading,
              b: b.rereads.currentlyRereading,
            },
            { label: "Reread sessions", a: a.rereads.rereadSessions, b: b.rereads.rereadSessions },
            {
              label: "Reread minutes",
              a: a.rereads.rereadMinutes,
              b: b.rereads.rereadMinutes,
              format: minutes,
            },
            {
              label: "Average original read time",
              a: a.rereadPairs.avgFirstMinutes,
              b: b.rereadPairs.avgFirstMinutes,
              format: minutes,
            },
            {
              label: "Average completed reread time",
              a: a.rereadPairs.avgRereadMinutes,
              b: b.rereadPairs.avgRereadMinutes,
              format: minutes,
            },
            {
              label: "Most common method switch",
              a: null,
              b: null,
              aText: switchText(a),
              bText: switchText(b),
            },
          ]}
        />
      </Group>
      <p className="tiny compare-footer-note">
        Only information this friend explicitly shared with Full access is included. They can revoke
        or reduce access in Settings at any time.
      </p>
    </>
  );
}

export function ComparisonBody({ result }: { result: FriendComparison }) {
  if (result.access === "none")
    return <div className="notice warn">This reader has not shared a profile with you.</div>;
  return result.access === "summary" ? <SummaryView d={result} /> : <FullView d={result} />;
}
