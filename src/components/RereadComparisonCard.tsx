import { STATUS_TEXT } from "@/lib/book-display";
import { formatTime } from "@/lib/insights-period";
import { passModeLabel, readingPassMetrics } from "@/lib/reading-history";

type PassMetrics = ReturnType<typeof readingPassMetrics>[number];

const statusText = (s: string) => STATUS_TEXT[s as keyof typeof STATUS_TEXT] ?? s;

function PassColumn({ pass, label }: { pass: PassMetrics; label: string }) {
  return (
    <div className="reread-pass-panel">
      <div className="reread-pass-eyebrow">
        {label} · {statusText(pass.status)}
      </div>
      <strong className="reread-time">
        {pass.recordedMinutes === null ? "Not recorded" : formatTime(pass.recordedMinutes)}
      </strong>
      <span className="tiny">
        {pass.recordedMinutes === null
          ? "Reading time unavailable"
          : pass.timeComplete
            ? "Recorded reading time"
            : "Recorded time · incomplete logs"}
      </span>
      <div className="reread-pass-method">
        <span className="tiny">Primary method (by logged time)</span>
        <strong>{passModeLabel(pass.primaryMode)}</strong>
      </div>
      <div className="reread-detail-rows">
        <span>Sessions</span>
        <strong>{pass.sessionCount || "Not recorded"}</strong>
        <span>Active days</span>
        <strong>{pass.activeDays || "Not recorded"}</strong>
        <span>Elapsed days</span>
        <strong>{pass.elapsedDays ?? "Unknown"}</strong>
        <span>Pages / active day</span>
        <strong>{pass.pagesPerActiveDay === null ? "—" : pass.pagesPerActiveDay.toFixed(1)}</strong>
        <span>Recorded speed</span>
        <strong>
          {pass.pagesPerHour === null ? "—" : `${pass.pagesPerHour.toFixed(1)} pg/hr`}
        </strong>
      </div>
      <p className="tiny">
        {pass.started_on || "Start date unknown"}
        {pass.finished_on
          ? ` → ${pass.finished_on}`
          : pass.status === "finished" && pass.finished_year
            ? ` → ${pass.finished_year} (exact date unknown)`
            : " · no finish date"}
      </p>
    </div>
  );
}

/** A book's first read against one reread, from recorded sessions only (legacy renderRereadComparisonCard). */
export function RereadComparisonCard({
  original,
  reread,
  title,
}: {
  original: PassMetrics;
  reread: PassMetrics;
  title?: string;
}) {
  const heading = `Original vs reread #${reread.number - 1}${title ? ` · ${title}` : ""}`;
  const comparable =
    original.status === "finished" &&
    reread.status === "finished" &&
    original.timeComplete &&
    reread.timeComplete &&
    original.recordedMinutes !== null &&
    reread.recordedMinutes !== null;
  const delta = (reread.recordedMinutes ?? 0) - (original.recordedMinutes ?? 0);
  return (
    <div className="reread-comparison-card">
      <h4 className="small-title">{heading}</h4>
      <div className="reread-compare-grid">
        <PassColumn pass={original} label="Original read" />
        <PassColumn pass={reread} label={`Reread #${reread.number - 1}`} />
      </div>
      {comparable ? (
        <div className="reread-comparison-result">
          <strong>
            {delta === 0
              ? "Same recorded reading time"
              : `${formatTime(Math.abs(delta))} ${delta < 0 ? "less" : "more"} time on reread`}
          </strong>{" "}
          · {Math.abs((delta / original.recordedMinutes!) * 100).toFixed(1)}%{" "}
          {delta < 0 ? "less" : delta > 0 ? "more" : "difference"} based on complete, finished
          passes
        </div>
      ) : (
        <p className="tiny reread-comparison-warning">
          Time comparison is unavailable until both passes are finished and every session has a
          recorded duration.
        </p>
      )}
    </div>
  );
}
