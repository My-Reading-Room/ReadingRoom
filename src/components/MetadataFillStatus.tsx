"use client";

import type { FillProgress } from "@/hooks/useMetadataFill";

/** Progress and results of a metadata fill run. */
export function MetadataFillStatus({
  progress,
  onPause,
}: {
  progress: FillProgress;
  onPause: () => void;
}) {
  if (!progress.total && !progress.error) return null;
  const percent = progress.total ? Math.round((progress.processed / progress.total) * 100) : 0;
  return (
    <div className="notice" role="status">
      <strong>
        {progress.running
          ? "Filling book metadata…"
          : progress.paused
            ? "Paused."
            : progress.error
              ? "Stopped."
              : "Metadata fill complete."}
      </strong>
      <div
        className="progress fill-progress"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div style={{ width: `${percent}%` }} />
      </div>
      <p className="text-sm">
        <strong>
          {progress.processed} / {progress.total}
        </strong>{" "}
        books checked · {progress.saved} updated · {progress.genreFilled} genre assignments ·{" "}
        {progress.editionMatched} edition matches
      </p>
      <p className="tiny">
        {progress.unresolved} still missing some catalog information · {progress.errors} request
        errors. Only blank fields are filled; nothing you entered is overwritten. Missing details
        stay blank when no trustworthy match exists.
      </p>
      {progress.error && <p className="notice error">{progress.error}</p>}
      {progress.running && (
        <button className="btn sm" type="button" onClick={onPause}>
          Pause after current lookup
        </button>
      )}
    </div>
  );
}
