import { bookChartColors } from "@/lib/book-chart-colors";
import { addDays, formatTime, inGroup, weekStart } from "@/lib/insights-period";
import { readingSpeedStats } from "@/lib/reading-metrics";
import { dailyGoalTimeSeries } from "@/lib/reading-metrics";

import { SPEED_COLORS, SPEED_KEYS, MODE_TEXT, type InsightsContext } from "./context";

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function Bar({ fraction, color = "#628c71" }: { fraction: number; color?: string }) {
  return (
    <div className="habit-track">
      <div style={{ width: `${Math.max(0, Math.min(100, fraction * 100))}%`, background: color }} />
    </div>
  );
}

export function Kpi({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="kpi">
      <div className="kpi-num">{value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}

export function HabitKpi({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="habit-kpi">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

const goalSeries = (ctx: InsightsContext) =>
  dailyGoalTimeSeries(ctx.sessions, {
    targetMinutes: ctx.dailyGoalForYear(ctx.spec.year),
    goalHistory: ctx.goalHistory,
    today: ctx.today,
    periodStart: ctx.spec.start,
    periodEnd: ctx.spec.end,
    groupBy: ctx.period === "year" ? "month" : "day",
    activeFrom: ctx.trackingStart,
  });

/** Stacked bars per day or month, one colour per book, with the dated daily goal overlaid. */
export function ActivityChart({ ctx }: { ctx: InsightsContext }) {
  const { entries, groups, metric, period, today } = ctx;
  const colors = bookChartColors(ctx.books, entries);
  const field = metric === "minutes" ? "duration_minutes" : "pages_read";
  const mapped = groups.map((g) => {
    const totals = new Map<string, number>();
    for (const s of entries.filter((s) => inGroup(g, s.session_date))) {
      totals.set(s.user_book_id, (totals.get(s.user_book_id) ?? 0) + num(s[field]));
    }
    return { ...g, totals, total: [...totals.values()].reduce((a, b) => a + b, 0) };
  });
  // Goals are time-based: a pages chart never implies a pages/day target.
  const targets = new Map(
    metric === "minutes"
      ? goalSeries(ctx)
          .filter((x) => !x.future && x.days > 0)
          .map((x) => [x.key, x.targetMinutes] as const)
      : [],
  );
  const max = Math.max(1, ...mapped.map((g) => g.total), ...targets.values());
  const ids = ctx.books
    .filter((b) => colors.has(String(b.id)))
    .sort((a, b) => String(a.title).localeCompare(String(b.title)));
  let path = "",
    previous = false;
  mapped.forEach((g, i) => {
    const target = targets.get(g.key);
    if (target == null) return void (previous = false);
    const x = (((i + 0.5) / Math.max(1, mapped.length)) * 1000).toFixed(2);
    const y = (164 - (target / max) * 164).toFixed(2);
    path += `${previous ? " L" : " M"}${x} ${y}`;
    previous = true;
  });
  return (
    <>
      <div className="activity-chart-scroll">
        <div className={`chart-area ${period === "month" ? "chart-month" : ""}`}>
          {path && (
            <svg
              className="activity-goal-overlay"
              viewBox="0 0 1000 164"
              preserveAspectRatio="none"
              role="img"
              aria-label="Daily goal by calendar date"
            >
              <path
                d={path}
                fill="none"
                stroke="#b67b39"
                strokeWidth="2.2"
                strokeDasharray="7 8"
                strokeLinecap="round"
                strokeOpacity=".77"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          )}
          {mapped.map((g) => {
            const height = g.total ? Math.max(3, Math.round((g.total / max) * 164)) : 0;
            const value = g.total ? Number(g.total.toFixed(1)).toLocaleString("en-US") : "";
            const showLabel =
              period !== "month" || Number(g.key.slice(-2)) % 5 === 1 || g.key === today;
            return (
              <div key={g.key} className="chart-column" title={`${g.label}: ${g.total} ${metric}`}>
                <span className="chart-value">{value}</span>
                <div className="chart-stack" style={{ height }}>
                  {ids.map((b) => {
                    const v = g.totals.get(b.id) ?? 0;
                    return v ? (
                      <i
                        key={b.id}
                        className="chart-book-segment"
                        style={{
                          height: (v / g.total) * height,
                          background: colors.get(String(b.id)),
                        }}
                        title={`${b.title}: ${v} ${metric}`}
                      />
                    ) : null;
                  })}
                </div>
                <span className="chart-label">{showLabel ? g.label : ""}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="legend book-chart-legend">
        {ids.length ? (
          ids.map((b) => (
            <span key={b.id}>
              <i className="dot" style={{ background: colors.get(String(b.id)) }} />
              {b.title}
            </span>
          ))
        ) : (
          <span>No reading activity in this period</span>
        )}
      </div>
      {path && (
        <div className="activity-goal-hint">
          <i className="legend-line" /> Daily goal · all reading modes
          {ctx.bookFilter !== "all" || ctx.mode !== "all" ? " (goal is for your full day)" : ""}
        </div>
      )}
    </>
  );
}

/** Actual minutes per day (or month) against that date's saved goal. */
export function GoalVsActualChart({ ctx }: { ctx: InsightsContext }) {
  const { period, spec } = ctx;
  const all = goalSeries(ctx);
  const items = all.filter((r) => !r.future);
  const actual = items.reduce((a, x) => a + x.actualMinutes, 0),
    reference = items.reduce((a, x) => a + x.targetMinutes, 0);
  const max = Math.max(30, ...items.flatMap((r) => [r.actualMinutes, r.targetMinutes])) * 1.12;
  const width = period === "month" ? Math.max(550, all.length * 26) : period === "year" ? 430 : 425;
  const h = 244,
    left = 39,
    right = 12,
    top = 20,
    bottom = 40;
  const plotW = width - left - right,
    plotH = h - top - bottom;
  const x = (i: number) => left + ((i + 0.5) * plotW) / Math.max(1, all.length);
  const y = (v: number) => top + plotH * (1 - v / max);
  const barWidth = Math.max(7, Math.min(30, (plotW / Math.max(1, all.length)) * 0.49));
  let path = "",
    last: number | null = null;
  all.forEach((r, i) => {
    if (r.future) return;
    const cx = x(i);
    path +=
      last === null
        ? `M${cx.toFixed(1)},${y(r.targetMinutes).toFixed(1)}`
        : ` H${((last + cx) / 2).toFixed(1)} V${y(r.targetMinutes).toFixed(1)} H${cx.toFixed(1)}`;
    last = cx;
  });
  const label = (key: string) =>
    period === "year"
      ? new Date(`${key}-01T12:00:00Z`).toLocaleDateString("en-US", {
          month: "short",
          timeZone: "UTC",
        })
      : period === "week"
        ? new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", {
            weekday: "short",
            timeZone: "UTC",
          })
        : String(Number(key.slice(-2)));
  return (
    <div className="card goal-reference-card settings-row">
      <h2 className="section-title">Reading time vs goal</h2>
      <p className="section-sub">
        {period === "year"
          ? "Monthly total vs sum of each day's goal"
          : "Daily reading minutes vs that day's goal"}{" "}
        · {spec.label} · all activity types
      </p>
      <div className="goal-reference-summary">
        <span>
          <strong>{formatTime(actual)}</strong> logged
        </span>
        <span>
          <strong>{formatTime(reference)}</strong> daily goal through today
        </span>
      </div>
      <div
        className={`goal-reference-scroll ${period === "month" ? "" : "goal-reference-compact"}`}
      >
        <svg
          className="goal-reference-svg"
          viewBox={`0 0 ${width} ${h}`}
          width={width}
          height={h}
          role="img"
          aria-label={`Reading time versus dated daily goal for ${spec.label}`}
        >
          {[0, 1, 2, 3, 4].map((i) => {
            const v = (max * i) / 4,
              yy = y(v);
            return (
              <g key={i}>
                <line x1={left} x2={width - right} y1={yy} y2={yy} stroke="#e7ebe4" />
                <text x={left - 6} y={yy + 4} textAnchor="end" fontSize="10" fill="#809082">
                  {Math.round(v)}
                </text>
              </g>
            );
          })}
          {path && (
            <path
              d={path}
              fill="none"
              stroke="#b67b39"
              strokeWidth="1.35"
              strokeDasharray="5 6"
              strokeOpacity="0.68"
            />
          )}
          {all.map((r, i) => {
            const cx = x(i),
              yy = y(r.actualMinutes);
            const showLabel = period !== "month" || i % 3 === 0 || i === all.length - 1;
            return (
              <g key={r.key}>
                {!r.future && (
                  <rect
                    x={cx - barWidth / 2}
                    y={yy}
                    width={barWidth}
                    height={Math.max(0, top + plotH - yy)}
                    rx="2"
                    fill="#618b72"
                  >
                    <title>{`${r.key}: ${Math.round(r.actualMinutes)} actual minutes; ${Math.round(r.targetMinutes)} goal minutes (${r.daysMet}/${r.days} goal days)`}</title>
                  </rect>
                )}
                {!r.future && r.actualMinutes > 0 && (
                  <text
                    x={cx}
                    y={Math.max(11, yy - 6)}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="700"
                    fill="#28583b"
                  >
                    {Math.round(r.actualMinutes)}
                  </text>
                )}
                {showLabel && (
                  <text x={cx} y={h - 16} textAnchor="middle" fontSize="10" fill="#7c8e81">
                    {label(r.key)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="goal-reference-legend">
        <span>
          <i className="legend-square actual" /> Actual reading minutes
        </span>
        <span>
          <i className="legend-line" /> Daily goal
        </span>
      </div>
      <p className="tiny">
        Daily goal and progress begin on the tracking start date. Past targets stay fixed; a new
        goal applies from the date you set it. Future days are not counted as missed. All reading
        and listening time counts once.
      </p>
    </div>
  );
}

/** Pages per hour per reading method over the period; gaps stay gaps. */
export function SpeedTrend({ ctx }: { ctx: InsightsContext }) {
  const { groups, speedRows, period, spec } = ctx;
  const points = groups.map((g) => {
    const rows = speedRows.filter((s) => inGroup(g, s.session_date));
    return Object.fromEntries(
      SPEED_KEYS.map((k) => [k, readingSpeedStats(rows, { activityMode: k }).pagesPerHour]),
    ) as Record<(typeof SPEED_KEYS)[number], number | null>;
  });
  const values = points.flatMap((p) =>
    SPEED_KEYS.map((k) => p[k]).filter((v): v is number => v != null),
  );
  const yMax = Math.max(20, Math.ceil(Math.max(1, ...values) / 20) * 20);
  const L = 40,
    R = 600,
    T = 12,
    B = 150,
    H = B - T,
    W = R - L;
  const at = (i: number, v: number) =>
    [
      L + (groups.length === 1 ? W / 2 : (i * W) / (groups.length - 1)),
      B - (v / yMax) * H,
    ] as const;
  return (
    <div
      className="speed-trend"
      role="img"
      aria-label={`Reading speed over ${spec.label}, in pages per hour by reading method`}
    >
      <svg viewBox="0 0 615 180" preserveAspectRatio="xMidYMid meet">
        <text x="3" y="12" fill="#809487" fontSize="10">
          pg/hr
        </text>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={L} y1={B - H * f} x2={R} y2={B - H * f} stroke="#e2e9e0" />
            <text x={L - 7} y={B - H * f + 4} textAnchor="end" fill="#83978a" fontSize="10">
              {Math.round(yMax * f)}
            </text>
          </g>
        ))}
        {SPEED_KEYS.map((k) =>
          points.map((p, i) => {
            const v = p[k];
            if (v == null) return null;
            const [x, y] = at(i, v);
            const prev = i > 0 ? points[i - 1][k] : null;
            const showValue =
              period === "week" ||
              (period === "year" && i % 2 === 0) ||
              (period === "month" && i % 7 === 0);
            return (
              <g key={`${k}-${i}`}>
                {prev != null && (
                  <line
                    x1={at(i - 1, prev)[0]}
                    y1={at(i - 1, prev)[1]}
                    x2={x}
                    y2={y}
                    stroke={SPEED_COLORS[k]}
                    strokeWidth="2.6"
                    strokeLinecap="round"
                  />
                )}
                <circle cx={x} cy={y} r="3.6" fill={SPEED_COLORS[k]}>
                  <title>{`${MODE_TEXT[k]} · ${groups[i].label} · ${v.toFixed(1)} pages/hr`}</title>
                </circle>
                {showValue && (
                  <text
                    x={x}
                    y={Math.max(
                      11,
                      y + (k === "read_listen" ? 15 : -8 - (k === "audiobook" ? 10 : 0)),
                    )}
                    textAnchor="middle"
                    fill={SPEED_COLORS[k]}
                    fontSize="9"
                    fontWeight="700"
                  >
                    {v.toFixed(1)}
                  </text>
                )}
              </g>
            );
          }),
        )}
        {groups.map((g, i) =>
          i === 0 ||
          i === groups.length - 1 ||
          period === "year" ||
          (period === "month" && i % 5 === 0) ? (
            <text
              key={g.key}
              x={at(i, 0)[0]}
              y="171"
              fill="#87978b"
              fontSize="10"
              textAnchor="middle"
            >
              {g.label}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}

/** The last 12 weeks of daily minutes (all modes), with a gold outline where the goal was met. */
export function Heatmap({ ctx }: { ctx: InsightsContext }) {
  const { today, trackingStart } = ctx;
  const first = weekStart(addDays(today, -77));
  const days = Array.from({ length: 84 }, (_, i) => addDays(first, i));
  const totals = new Map<string, number>();
  for (const s of ctx.sessions) {
    const m = Number(s.duration_minutes);
    if (Number.isFinite(m) && m > 0 && s.session_date <= today)
      totals.set(s.session_date, (totals.get(s.session_date) ?? 0) + m);
  }
  return (
    <>
      <div className="heatmap">
        {days.map((d) => {
          const pre = Boolean(trackingStart && d < trackingStart);
          const m = pre ? 0 : (totals.get(d) ?? 0),
            target = ctx.targetForDate(d);
          const future = d > today || pre;
          const level = future || m === 0 ? 0 : m < 30 ? 1 : m < 60 ? 2 : m < 105 ? 3 : 4;
          const met = !future && m >= target;
          const label = pre
            ? `${d}: before tracking start date`
            : `${d}: ${m} of ${target} goal minutes${met ? " - goal met" : ""}`;
          return (
            <div
              key={d}
              className={`heat-cell ${level ? `lv${level}` : ""} ${met ? "goal-met" : ""}`}
              title={label}
              aria-label={label}
            />
          );
        })}
      </div>
      <div className="tiny heatmap-legend">
        <span>12 weeks ago</span>
        <span>
          <i className="goal-key" /> Gold outline = daily goal met
        </span>
      </div>
    </>
  );
}
