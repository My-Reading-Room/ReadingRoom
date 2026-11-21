"use client";

import { useCallback, useRef, useState } from "react";

import { enrichBooks, type EnrichResult } from "@/app/(app)/library/import/actions";
import { ENRICH_BATCH } from "@/lib/import-limits";

export type FillProgress = {
  total: number;
  processed: number;
  saved: number;
  genreFilled: number;
  editionMatched: number;
  unresolved: number;
  errors: number;
  running: boolean;
  paused: boolean;
  error?: string;
};

const EMPTY: FillProgress = {
  total: 0,
  processed: 0,
  saved: 0,
  genreFilled: 0,
  editionMatched: 0,
  unresolved: 0,
  errors: 0,
  running: false,
  paused: false,
};

/**
 * Fill missing catalog metadata a few books at a time through the server
 * (legacy runMetadataImport). Each batch is saved as it finishes, so pausing
 * or closing the tab keeps everything done so far.
 */
export function useMetadataFill() {
  const [progress, setProgress] = useState<FillProgress>(EMPTY);
  const stop = useRef(false);

  const start = useCallback(async (ids: string[]) => {
    stop.current = false;
    let state: FillProgress = { ...EMPTY, total: ids.length, running: true };
    setProgress(state);
    for (let i = 0; i < ids.length; i += ENRICH_BATCH) {
      if (stop.current) {
        state = { ...state, paused: true };
        break;
      }
      const batch = ids.slice(i, i + ENRICH_BATCH);
      let result: EnrichResult;
      try {
        result = await enrichBooks(batch);
      } catch {
        result = {
          error:
            "The metadata lookup was interrupted. Everything saved so far is kept; you can retry.",
        };
      }
      if (result.error) {
        state = { ...state, error: result.error };
        break;
      }
      state = {
        ...state,
        processed: Math.min(ids.length, i + batch.length),
        saved: state.saved + (result.saved ?? 0),
        genreFilled: state.genreFilled + (result.genreFilled ?? 0),
        editionMatched: state.editionMatched + (result.editionMatched ?? 0),
        unresolved: state.unresolved + (result.unresolved ?? 0),
        errors: state.errors + (result.errors ?? 0),
      };
      setProgress(state);
    }
    setProgress({ ...state, running: false });
    return state;
  }, []);

  const pause = useCallback(() => {
    stop.current = true;
  }, []);

  return { progress, start, pause };
}
