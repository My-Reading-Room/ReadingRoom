"use client";

import { useState } from "react";

import { MetadataFillStatus } from "@/components/MetadataFillStatus";
import { useMetadataFill } from "@/hooks/useMetadataFill";

import { booksForBulk, booksNeedingMetadata, bulkCatalogUpdate } from "./import/actions";

/**
 * Bulk catalog tools for the whole library (legacy library toolbar): fill
 * blank metadata, match editions, refresh genres. All run on the server in
 * small batches; refreshing genres replaces genres, so it asks first.
 */
export function FillMetadataButton() {
  const fill = useMetadataFill();
  const [message, setMessage] = useState("");
  const [confirmGenres, setConfirmGenres] = useState(false);
  const busy = fill.progress.running;

  const run = async (kind: "fill" | "editions" | "genres") => {
    setMessage("");
    setConfirmGenres(false);
    const ids = kind === "fill" ? await booksNeedingMetadata() : await booksForBulk(kind);
    if (!ids.length) {
      return setMessage(
        kind === "editions"
          ? "All your books already have an edition reference."
          : "Every book already has its catalog details.",
      );
    }
    if (kind === "editions") {
      setMessage(
        `Checking possible editions for ${ids.length} books. Matches need several edition fields to agree; uncertain results stay unmatched.`,
      );
    }
    await fill.start(ids, kind === "fill" ? undefined : (batch) => bulkCatalogUpdate(batch, kind));
  };

  return (
    <>
      <button className="btn" type="button" disabled={busy} onClick={() => run("fill")}>
        Fill missing metadata
      </button>
      <button className="btn" type="button" disabled={busy} onClick={() => run("editions")}>
        Match editions
      </button>
      <button className="btn" type="button" disabled={busy} onClick={() => setConfirmGenres(true)}>
        Refresh genres
      </button>
      {confirmGenres && (
        <div className="notice warn confirm-box fill-status">
          <p>
            Replace every book&apos;s genres with the catalogs&apos; standardized genres? Covers and
            other details are untouched.
          </p>
          <button className="btn sm" type="button" onClick={() => run("genres")}>
            Refresh genres
          </button>{" "}
          <button className="btn sm" type="button" onClick={() => setConfirmGenres(false)}>
            Cancel
          </button>
        </div>
      )}
      {message && (
        <p className="text-sm muted fill-status" role="status">
          {message}
        </p>
      )}
      <div className="fill-status">
        <MetadataFillStatus progress={fill.progress} onPause={fill.pause} />
      </div>
    </>
  );
}
