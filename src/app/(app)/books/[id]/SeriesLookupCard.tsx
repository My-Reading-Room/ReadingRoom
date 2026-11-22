"use client";

import { useState, useTransition } from "react";

import { catalogSeriesMatch, fetchSeriesLookup, type SeriesLookup } from "@/lib/series-catalog";
import { seriesMetadata } from "@/lib/series-insights";
import type { UserBook } from "@/lib/types";

import { applySeriesDetails } from "./lookup-actions";

/** Series reading order from List Of Books, with the source link its free plan requires. */
export function SeriesLookupCard({ book }: { book: UserBook }) {
  const [result, setResult] = useState<SeriesLookup | null>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, startTransition] = useTransition();
  const name = seriesMetadata(book).series_name;

  return (
    <section className="card soft">
      <div className="cardhead">
        <div>
          <h3 className="small-title">Series details</h3>
          <p className="section-sub">
            {name ? `Series: ${name}` : "No series recorded."} Catalog totals never assume the
            newest book is the last.
          </p>
        </div>
        <button
          type="button"
          className="btn sm"
          disabled={busy}
          onClick={() =>
            startTransition(async () => {
              setNotice(null);
              try {
                const details = await fetchSeriesLookup(
                  name ? { series: name } : { title: book.title, author: book.author },
                );
                const match = catalogSeriesMatch(details, {
                  seriesName: name,
                  author: book.author,
                  title: book.title,
                });
                setResult(match ? details : null);
                if (!match)
                  setNotice({
                    text: "No exact matching series found. Enter the information manually instead.",
                  });
              } catch (e) {
                setResult(null);
                setNotice({
                  text: (e as Error).message || "Series lookup unavailable.",
                  error: true,
                });
              }
            })
          }
        >
          {busy ? "Looking up…" : "Find series details"}
        </button>
      </div>
      {result && (
        <div className="series-order">
          <p className="tiny">
            <strong>{result.title}</strong>
            {result.totalBooks ? ` · ${result.totalBooks} main books known` : ""} · Source:{" "}
            <a href={result.url} target="_blank" rel="noopener noreferrer">
              List Of Books
            </a>
          </p>
          <ol className="tiny">
            {result.books.slice(0, 30).map((b, i) => (
              <li key={`${b.title}-${i}`}>
                {b.title}
                {b.year ? ` (${b.year})` : ""}
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="btn primary sm"
            disabled={busy}
            onClick={() =>
              startTransition(async () => {
                const r = await applySeriesDetails(book.id);
                setNotice({ text: r.error ?? r.message ?? "", error: Boolean(r.error) });
                if (!r.error) setResult(null);
              })
            }
          >
            Fill missing series fields
          </button>
        </div>
      )}
      {notice?.text && (
        <div
          className={`notice ${notice.error ? "error" : ""}`}
          role={notice.error ? "alert" : "status"}
        >
          {notice.text}
        </div>
      )}
    </section>
  );
}
