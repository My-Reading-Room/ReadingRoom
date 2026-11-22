// Read history editor save plan, ported from legacy app.js saveReadHistory().
// The browser runs it for the confirmation preview; the server runs it again on
// fresh database rows before writing, so a client-supplied plan is never trusted.
import {
  editReadingHistory,
  readingPasses,
  rereadSessionCorrections,
  type ReadPassInput,
  type WithPasses,
} from "./reading-history";
import type { BookInput, SessionInput } from "./types";

export type ReadHistoryPlanOptions = {
  /** Move sessions dated on/after a known reread start into that reread. */
  reassign: boolean;
  /** Only recheck session assignments; leave the passes as saved. */
  assignmentOnly?: boolean;
};

export type SessionMove<S> = { session: S; from: number; to: number };

export type ReadHistoryPlan<B, S> =
  | { ok: true; book: B | WithPasses<B>; passCount: number; corrections: SessionMove<S>[] }
  | { ok: false; error: string };

export function planReadHistorySave<B extends BookInput, S extends SessionInput>(
  book: B,
  sessions: S[],
  entries: ReadPassInput[] | null,
  { reassign, assignmentOnly = false }: ReadHistoryPlanOptions,
): ReadHistoryPlan<B, S> {
  let updated: B | WithPasses<B>;
  try {
    updated = assignmentOnly ? book : editReadingHistory(book, entries ?? []);
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
  const rows = sessions.filter((s) => s.user_book_id === book.id);
  const passCount = readingPasses(updated).length;
  const highestAssigned = Math.max(1, ...rows.map((s) => Number(s.read_number || 1)));
  if (highestAssigned > passCount) {
    return {
      ok: false,
      error:
        "This book has sessions attached to a reading pass being removed. Keep that pass or move those sessions first.",
    };
  }
  const corrections = assignmentOnly || reassign ? rereadSessionCorrections(updated, rows) : [];
  return { ok: true, book: updated, passCount, corrections };
}
