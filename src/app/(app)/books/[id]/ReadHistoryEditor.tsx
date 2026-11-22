"use client";

import { useActionState, useState } from "react";

import { useLocalToday } from "@/hooks/useLocalToday";
import { useReadPassRows } from "@/hooks/useReadPassRows";
import { planReadHistorySave } from "@/lib/read-history-plan";
import { readingPasses } from "@/lib/reading-history";
import type { UserBook } from "@/lib/types";
import type { BookSession } from "@/data/books";

import { saveReadHistory, type BookActionState } from "./actions";

const STATUSES: [string, string][] = [
  ["reading", "Currently reading"],
  ["finished", "Finished"],
  ["dnf", "Did not finish"],
];

type Props = { book: UserBook; sessions: BookSession[]; editable: boolean };

export function ReadHistoryEditor({ book, sessions, editable }: Props) {
  const today = useLocalToday();
  const { rows, entries, update, addReread, removeLast } = useReadPassRows(
    readingPasses(book),
    today,
  );
  const [reassign, setReassign] = useState(true);
  const [review, setReview] = useState<"save" | "recheck" | null>(null);
  const [state, action, pending] = useActionState<BookActionState, FormData>(
    saveReadHistory.bind(null, book.id),
    {},
  );

  const lastHasSessions = sessions.some((s) => Number(s.read_number || 1) >= rows.length);
  const plan = review
    ? planReadHistorySave(book, sessions, review === "recheck" ? null : entries, {
        reassign,
        assignmentOnly: review === "recheck",
      })
    : null;

  return (
    <section className="card soft history-editor">
      <h3 className="small-title">Edit original read &amp; rereads</h3>
      <p className="section-sub">
        Enter the original read (even if it was years ago), then add each reread separately. You can
        use just a finish year such as 2022 without inventing an exact date.
      </p>
      <div className="notice">
        Example: Original read → Finished → 2022; Reread #1 → Currently reading → start date in
        2026. New reading sessions then belong to Reread #1, not the original.
      </div>

      {rows.map((row, index) => (
        <section key={row.key} className="history-edit-row">
          <div className="history-edit-heading">
            <strong>{index === 0 ? "Original read" : `Reread #${index}`}</strong>
            {editable && index > 0 && index === rows.length - 1 && (
              <button
                type="button"
                className="btn sm danger"
                disabled={lastHasSessions}
                title={
                  lastHasSessions
                    ? "This reread has sessions. Reassign them first."
                    : "Remove this reread"
                }
                onClick={removeLast}
              >
                Remove
              </button>
            )}
          </div>
          <div className="formgrid">
            <div className="formfield">
              <label htmlFor={`pass-${row.key}-status`}>Status</label>
              <select
                id={`pass-${row.key}-status`}
                className="select"
                value={row.status}
                disabled={!editable}
                onChange={(e) => update(row.key, "status", e.target.value)}
              >
                {STATUSES.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="formfield">
              <label htmlFor={`pass-${row.key}-start`}>Start date (optional)</label>
              <input
                id={`pass-${row.key}-start`}
                className="input"
                type="date"
                value={row.started_on}
                disabled={!editable}
                onChange={(e) => update(row.key, "started_on", e.target.value)}
              />
            </div>
            <div className="formfield">
              <label htmlFor={`pass-${row.key}-finish`}>Finished date (if known)</label>
              <input
                id={`pass-${row.key}-finish`}
                className="input"
                type="date"
                value={row.finished_on}
                disabled={!editable}
                onChange={(e) => update(row.key, "finished_on", e.target.value)}
              />
            </div>
            <div className="formfield">
              <label htmlFor={`pass-${row.key}-year`}>
                Finished year (when exact date unknown)
              </label>
              <input
                id={`pass-${row.key}-year`}
                className="input"
                type="number"
                min={1500}
                max={2200}
                placeholder="e.g. 2022"
                value={row.finished_year}
                disabled={!editable}
                onChange={(e) => update(row.key, "finished_year", e.target.value)}
              />
            </div>
          </div>
        </section>
      ))}

      {!editable ? (
        <p className="tiny">This reading history is view-only.</p>
      ) : (
        <>
          <div className="toolbar">
            <button type="button" className="btn" onClick={addReread}>
              + Add a reread
            </button>
          </div>
          <label className="history-reassign">
            <input
              type="checkbox"
              checked={reassign}
              onChange={(e) => setReassign(e.target.checked)}
            />{" "}
            Move existing sessions to the correct reread when their dates fall on or after a known
            reread start
          </label>
          <p className="tiny">
            Moves are shown for confirmation before saving. Session times, pages, activity types,
            notes and dates are never changed. Sessions with uncertain dates are not moved.
          </p>

          {plan && "error" in plan && (
            <div className="notice error" role="alert">
              {plan.error}
            </div>
          )}
          {plan && "corrections" in plan ? (
            <form
              action={action}
              className="notice warn confirm-box"
              onSubmit={() => setReview(null)}
            >
              <input type="hidden" name="mode" value={review ?? "save"} />
              <input type="hidden" name="entries" value={JSON.stringify(entries)} />
              {reassign && <input type="hidden" name="reassign" value="on" />}
              {review === "save" && (
                <p>
                  Save {plan.passCount} reading pass{plan.passCount === 1 ? "" : "es"} for{" "}
                  <strong>{book.title}</strong>? The original completion is preserved.
                </p>
              )}
              {plan.corrections.length > 0 ? (
                <>
                  <p>
                    Move {plan.corrections.length} existing session
                    {plan.corrections.length === 1 ? "" : "s"} to the correct dated reread. Only the
                    reading-pass number changes:
                  </p>
                  <ul className="tiny">
                    {[...plan.corrections]
                      .sort((a, b) =>
                        String(a.session.session_date).localeCompare(
                          String(b.session.session_date),
                        ),
                      )
                      .slice(0, 5)
                      .map((c) => (
                        <li key={String(c.session.id)}>
                          {c.session.session_date}: read #{c.from} → #{c.to}
                        </li>
                      ))}
                    {plan.corrections.length > 5 && (
                      <li>…and {plan.corrections.length - 5} more</li>
                    )}
                  </ul>
                </>
              ) : (
                review === "recheck" && (
                  <p>All saved sessions are already on the right reading pass.</p>
                )
              )}
              <div className="toolbar">
                {(review === "save" || plan.corrections.length > 0) && (
                  <button className="btn primary sm" type="submit" disabled={pending}>
                    {review === "save" ? "Save reading history" : "Move sessions"}
                  </button>
                )}
                <button className="btn sm" type="button" onClick={() => setReview(null)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="toolbar">
              <button className="btn primary" type="button" onClick={() => setReview("save")}>
                Review &amp; save reading history
              </button>
              <button className="btn" type="button" onClick={() => setReview("recheck")}>
                Recheck saved session assignments
              </button>
            </div>
          )}
          {!review && (state.error || state.message) && (
            <div
              className={`notice ${state.error ? "error" : ""}`}
              role={state.error ? "alert" : "status"}
            >
              {state.error ?? state.message}
            </div>
          )}
        </>
      )}
    </section>
  );
}
