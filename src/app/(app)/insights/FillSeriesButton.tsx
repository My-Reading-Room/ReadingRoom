"use client";

import { useState, useTransition } from "react";

import { fillSeriesGroup, type GoalState } from "./actions";

/** Owner-only: look up a series and fill blank totals on its books. */
export function FillSeriesButton({ name }: { name: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<GoalState>({});
  return (
    <div className="series-catalog-toolbar">
      <button
        className="btn sm"
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => setResult(await fillSeriesGroup(name)))}
      >
        {pending ? "Looking up…" : "Fill missing series totals"}
      </button>
      {(result.error || result.message) && (
        <span className={`tiny ${result.error ? "series-lookup-error" : ""}`} role="status">
          {result.error ?? result.message}
        </span>
      )}
    </div>
  );
}
