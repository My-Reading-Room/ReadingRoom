"use client";

import { useActionState, useState, useTransition } from "react";

import { useLocalToday } from "@/hooks/useLocalToday";

import { deleteBook, startReread, toggleFavorite, type BookActionState } from "./actions";

type Props = { bookId: string; title: string; favorite: boolean; canReread: boolean };

/** Favorite, reread and delete. Irreversible actions ask in the page, not with confirm(). */
export function BookActions({ bookId, title, favorite, canReread }: Props) {
  const today = useLocalToday();
  const [result, setResult] = useState<BookActionState>({});
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<"reread" | "delete" | null>(null);
  const [rereadState, rereadAction, rereadPending] = useActionState<BookActionState, FormData>(
    startReread.bind(null, bookId),
    {},
  );
  const message = confirming
    ? null
    : (rereadState.error ?? rereadState.message ?? result.error ?? result.message);

  return (
    <section className="book-actions" aria-label="Book actions">
      <div className="toolbar">
        <button
          type="button"
          className={`btn ${favorite ? "selected" : ""}`}
          aria-pressed={favorite}
          disabled={pending}
          onClick={() => startTransition(async () => setResult(await toggleFavorite(bookId)))}
        >
          ♥ {favorite ? "Remove from Favorites" : "Add to Favorites"}
        </button>
        {canReread && (
          <button type="button" className="btn" onClick={() => setConfirming("reread")}>
            ↻ Start reread today
          </button>
        )}
        <span className="toolbar-spacer" />
        <button type="button" className="btn danger" onClick={() => setConfirming("delete")}>
          Delete book
        </button>
      </div>

      {confirming === "reread" && (
        <form
          action={rereadAction}
          className="notice warn confirm-box"
          onSubmit={() => setConfirming(null)}
        >
          <input type="hidden" name="today" value={today} />
          <p>
            Start a new reading pass for <strong>{title}</strong>? Earlier completion dates and logs
            stay saved. Current page resets to 0.
          </p>
          <div className="toolbar">
            <button className="btn primary sm" type="submit" disabled={rereadPending}>
              Start reread
            </button>
            <button className="btn sm" type="button" onClick={() => setConfirming(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {confirming === "delete" && (
        <div className="notice error confirm-box" role="alertdialog" aria-label="Confirm delete">
          <p>
            Remove <strong>{title}</strong> and all its reading sessions and chapter mappings? This
            cannot be undone.
          </p>
          <div className="toolbar">
            <button
              className="btn danger sm"
              type="button"
              disabled={pending}
              onClick={() => startTransition(async () => setResult(await deleteBook(bookId)))}
            >
              {pending ? "Deleting…" : "Yes, delete permanently"}
            </button>
            <button className="btn sm" type="button" onClick={() => setConfirming(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {message && (
        <p className="tiny" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
