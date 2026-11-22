"use client";

import { useState, useTransition } from "react";

import { BookCover } from "@/components/BookCover";
import { useActionForm } from "@/hooks/useActionForm";
import type { MetadataLookup } from "@/lib/book-detail-metadata";
import type { UserBook } from "@/lib/types";

import type { BookActionState } from "./actions";
import { applyMetadata, lookupMetadata } from "./lookup-actions";

const FIELDS: [label: string, key: string][] = [
  ["Publisher", "publisher"],
  ["Binding", "binding"],
  ["Edition year", "edition_year"],
  ["Original year", "original_published_year"],
  ["Pages", "page_count"],
  ["ISBN", "isbn"],
];

/** Catalog suggestions for a saved book. Applying only fills blank fields. */
export function MetadataLookupCard({ book }: { book: UserBook }) {
  const [lookup, setLookup] = useState<MetadataLookup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const apply = useActionForm<BookActionState>(applyMetadata.bind(null, book.id), {});
  const metadata = (lookup?.metadata ?? {}) as Record<string, unknown>;
  const cover = typeof metadata.cover_url === "string" ? metadata.cover_url : null;
  const genres = Array.isArray(metadata.genres) ? (metadata.genres as string[]) : [];

  return (
    <section className="metadata-lookup-card card soft">
      <div className="cardhead">
        <div>
          <h3 className="small-title">Book identifiers, genres &amp; cover</h3>
          <p className="section-sub">
            Save your edits first. Lookups happen only when you press the button.
          </p>
        </div>
        <button
          type="button"
          className="btn sm"
          disabled={busy}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const r = await lookupMetadata(book.id);
              setLookup(r.lookup ?? null);
              if (r.error) setError(r.error);
            })
          }
        >
          {busy ? "Looking up…" : "Look up metadata & cover"}
        </button>
      </div>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {lookup && (
        <form
          className="metadata-lookup-results"
          onSubmit={(e) => {
            apply.onSubmit(e);
            setLookup(null);
          }}
        >
          <input
            type="hidden"
            name="lookup"
            value={JSON.stringify({ matchLevel: lookup.matchLevel, metadata })}
          />
          <div className="lookup-heading">
            <strong>{lookup.label}</strong>{" "}
            <span className="tiny">Suggestions only — not yet saved</span>
          </div>
          <p className="tiny">{lookup.notice}</p>
          <div className="lookup-result-layout">
            {cover && (
              <BookCover title={book.title} author={book.author} coverUrl={cover} size="small" />
            )}
            <div>
              {FIELDS.filter(([, key]) => metadata[key]).map(([label, key]) => (
                <div key={key} className="tiny">
                  <strong>{label}:</strong> {String(metadata[key])}
                </div>
              ))}
              {genres.length > 0 && (
                <div className="tiny">
                  <strong>Genres:</strong> {genres.join(", ")}
                </div>
              )}
            </div>
          </div>
          {cover && (
            <label className="lookup-cover-choice">
              <input type="checkbox" name="useCover" defaultChecked={!book.cover_url} /> Use
              suggested cover
              {book.cover_url ? " (replace my current cover)" : ""}
            </label>
          )}
          <div className="toolbar lookup-buttons">
            <button className="btn primary sm" type="submit" disabled={apply.pending}>
              Apply missing details{cover ? " & chosen cover" : ""}
            </button>
            <button className="btn sm" type="button" onClick={() => setLookup(null)}>
              Dismiss
            </button>
          </div>
        </form>
      )}
      {!lookup && (apply.state.error || apply.state.message) && (
        <div
          className={`notice ${apply.state.error ? "error" : ""}`}
          role={apply.state.error ? "alert" : "status"}
        >
          {apply.state.error ?? apply.state.message}
        </div>
      )}
    </section>
  );
}
