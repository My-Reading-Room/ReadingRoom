"use client";

import { useState } from "react";

import { MetadataFillStatus } from "@/components/MetadataFillStatus";
import { useMetadataFill } from "@/hooks/useMetadataFill";

import { booksNeedingMetadata } from "./import/actions";

/** Look up missing covers, genres and editions for the whole library (legacy "enrich-books"). */
export function FillMetadataButton() {
  const fill = useMetadataFill();
  const [message, setMessage] = useState("");
  return (
    <>
      <button
        className="btn"
        type="button"
        disabled={fill.progress.running}
        onClick={async () => {
          setMessage("");
          const ids = await booksNeedingMetadata();
          if (!ids.length) return setMessage("Every book already has its catalog details.");
          await fill.start(ids);
        }}
      >
        Fill missing metadata
      </button>
      {message && (
        <span className="text-sm muted" role="status">
          {message}
        </span>
      )}
      <div className="fill-status">
        <MetadataFillStatus progress={fill.progress} onPause={fill.pause} />
      </div>
    </>
  );
}
