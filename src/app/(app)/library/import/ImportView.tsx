"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { BookCover } from "@/components/BookCover";
import { MetadataFillStatus } from "@/components/MetadataFillStatus";
import type { LibraryBook } from "@/data/library";
import { useMetadataFill } from "@/hooks/useMetadataFill";
import {
  parseGoodreads,
  parseGoodreadsGenreRecommendations,
  parseGoodreadsReadingSessions,
  prepareGoodreadsImport,
} from "@/lib/goodreads-import";

import { IMPORT_BATCH } from "@/lib/import-limits";

import { booksNeedingMetadata, importGoodreadsBatch } from "./actions";

const MB = 1_000_000;

async function readFile(file: File | undefined, maxBytes: number): Promise<string | null> {
  if (!file) return null;
  if (file.size > maxBytes)
    throw new Error(`That file is too large (maximum ${maxBytes / MB} MB).`);
  return file.text();
}

/**
 * Goodreads import (legacy renderImportModal). Files are read and previewed
 * in this browser; only parsed rows go to the server, in batches, where they
 * are validated again and matched against your library.
 */
export function ImportView({ existing, userId }: { existing: LibraryBook[]; userId: string }) {
  const [csv, setCsv] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Record<string, never[]>>({});
  const [genres, setGenres] = useState<Record<string, string[]>>({});
  const [fileError, setFileError] = useState("");
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState("");
  const fill = useMetadataFill();

  const parsed = useMemo(() => {
    if (!csv) return { rows: [], error: "" };
    try {
      return {
        rows: parseGoodreads(csv, {
          // Only for the preview: the server always saves rows as the signed-in reader.
          userId,
          existingCount: existing.length,
          sessionsMap: sessions,
          genresMap: genres,
        }),
        error: "",
      };
    } catch (error) {
      return { rows: [], error: `Import error: ${(error as Error).message}` };
    }
  }, [csv, sessions, genres, existing.length, userId]);
  const rows = parsed.rows;
  const plan = useMemo(() => prepareGoodreadsImport(rows, existing), [rows, existing]);
  const rereads = rows.filter(
    (b) => (b.read_history?.length || 0) > 1 || b._grReadCount > 1,
  ).length;

  const pick =
    (kind: "csv" | "sessions" | "genres") => async (e: React.ChangeEvent<HTMLInputElement>) => {
      setFileError("");
      setReport("");
      try {
        const text = await readFile(e.target.files?.[0], kind === "csv" ? 8 * MB : 15 * MB);
        if (kind === "csv") setCsv(text);
        else if (kind === "sessions")
          setSessions(text ? (parseGoodreadsReadingSessions(text) as Record<string, never[]>) : {});
        else setGenres(text ? parseGoodreadsGenreRecommendations(text) : {});
      } catch (error) {
        setFileError(`${kind === "csv" ? "CSV" : "JSON"} error: ${(error as Error).message}`);
      }
    };

  const runImport = async () => {
    setSaving(true);
    setReport("");
    let added = 0,
      updated = 0,
      skipped = 0;
    const ids: string[] = [];
    try {
      for (let i = 0; i < rows.length; i += IMPORT_BATCH) {
        const result = await importGoodreadsBatch(rows.slice(i, i + IMPORT_BATCH));
        if (result.error) {
          setReport(
            `Import stopped after ${added} new books: ${result.error} You can safely retry; saved books are kept.`,
          );
          return;
        }
        added += result.added ?? 0;
        updated += result.updated ?? 0;
        skipped += result.skipped ?? 0;
        ids.push(...(result.ids ?? []));
      }
    } catch {
      setReport(
        `Import interrupted after ${added} new books. You can safely retry; saved books are kept.`,
      );
      return;
    } finally {
      setSaving(false);
    }
    setReport(
      `Saved ${added} new book${added === 1 ? "" : "s"}; filled missing CSV fields on ${updated} existing books${skipped ? `; skipped ${skipped} duplicate rows` : ""}. Now looking up missing covers, genres and editions…`,
    );
    setCsv(null);
    const imported = new Set(ids);
    const needing = (await booksNeedingMetadata()).filter((id) => imported.has(id));
    await fill.start(needing);
  };

  return (
    <>
      <section className="card">
        <p className="text-sm muted">
          Upload <code>goodreads_library_export.csv</code>. Publisher, binding, edition year,
          original year and other available fields come across, then missing genres, covers and
          editions are looked up. Existing books are only updated where fields are blank.
        </p>
        <div className="formgrid three form-footer">
          <div className="formfield">
            <label htmlFor="goodreads-file">1. Library CSV</label>
            <input
              id="goodreads-file"
              type="file"
              accept=".csv,text/csv"
              className="input"
              onChange={pick("csv")}
              disabled={saving || fill.progress.running}
            />
          </div>
          <div className="formfield">
            <label htmlFor="goodreads-sessions-file">2. reading_sessions.json (optional)</label>
            <input
              id="goodreads-sessions-file"
              type="file"
              accept=".json,application/json"
              className="input"
              onChange={pick("sessions")}
            />
          </div>
          <div className="formfield">
            <label htmlFor="goodreads-genres-file">3. genre_recommendation.json (optional)</label>
            <input
              id="goodreads-genres-file"
              type="file"
              accept=".json,application/json"
              className="input"
              onChange={pick("genres")}
            />
          </div>
        </div>
        {(fileError || parsed.error) && (
          <div className="notice error" role="alert">
            {fileError || parsed.error}
          </div>
        )}
        {(Object.keys(sessions).length > 0 || Object.keys(genres).length > 0) && (
          <div className="notice">
            {Object.keys(sessions).length
              ? `Loaded ${Object.keys(sessions).length} book pass histories. `
              : ""}
            {Object.keys(genres).length
              ? `Loaded optional genre tags for ${Object.keys(genres).length} books.`
              : ""}
          </div>
        )}
        {rows.length > 0 && (
          <>
            <div className="notice">
              {rows.length} rows · {plan.additions.length} new · {plan.existing} already in library
              · {plan.updates.length} with missing CSV fields · {plan.skipped.length} duplicate rows
              in export{rereads ? ` · ${rereads} books with rereads detected` : ""}
            </div>
            <div className="import-preview">
              {rows.slice(0, 10).map((b, i) => (
                <div key={i} className="session-row">
                  <div>
                    <BookCover title={b.title} author={b.author} size="small" />
                  </div>
                  <div className="session-info">
                    <div className="session-title">{b.title}</div>
                    <div className="session-meta">
                      {b.author} · {b.isbn ? "ISBN" : "No ISBN: match by book details"} ·{" "}
                      {b.edition_year || "Edition year unknown"}
                      {b.genres?.length ? ` · ${b.genres.join(", ")}` : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="tiny">
              Showing the first 10 rows. All rows are saved before any catalog lookup.
            </p>
          </>
        )}
        <div className="toolbar form-footer">
          <Link className="btn" href="/library">
            Back to library
          </Link>
          <button
            className="btn primary"
            type="button"
            disabled={!rows.length || saving || fill.progress.running}
            onClick={runImport}
          >
            {saving ? "Saving…" : `⇧ Import & fill metadata (${rows.length})`}
          </button>
        </div>
        {report && (
          <div className="notice" role="status">
            {report}
          </div>
        )}
      </section>
      <MetadataFillStatus progress={fill.progress} onPause={fill.pause} />
    </>
  );
}
