"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  MAX_CONTENTS_PHOTOS,
  scanContentsPhotos,
  validateContentsPhotos,
  type ChapterDraft,
  type OcrWorker,
} from "@/lib/chapter-sourcing";

export type QueuedPhoto = { id: number; file: File; preview: string };

/** Self-hosted engine files (copied by scripts/copy-tesseract.mjs); nothing loads from a CDN. */
async function createSelfHostedWorker(): Promise<OcrWorker<File>> {
  const { createWorker } = await import("tesseract.js");
  return createWorker("eng", 1, {
    workerPath: "/tesseract/worker.min.js",
    corePath: "/tesseract/core",
    langPath: "/tesseract/lang",
    workerBlobURL: false,
    gzip: true,
  });
}

/**
 * Ordered table-of-contents photos for on-device OCR. Images never leave the
 * browser; the result is a candidate draft the reader must review.
 */
export function useContentsScanner() {
  const [photos, setPhotos] = useState<QueuedPhoto[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const nextId = useRef(0);
  // Latest photos for event handlers and unmount cleanup.
  const live = useRef(photos);
  useEffect(() => {
    live.current = photos;
  }, [photos]);

  useEffect(() => () => live.current.forEach((p) => URL.revokeObjectURL(p.preview)), []);

  /** Add photos; returns an error message if the selection isn't allowed. */
  const add = useCallback((files: FileList | File[] | null): string | null => {
    const incoming = Array.from(files ?? []);
    if (!incoming.length) return null;
    try {
      validateContentsPhotos([...live.current.map((p) => p.file), ...incoming]);
    } catch (e) {
      return (e as Error).message;
    }
    setPhotos((list) => [
      ...list,
      ...incoming.map((file) => ({
        id: nextId.current++,
        file,
        preview: URL.createObjectURL(file),
      })),
    ]);
    return null;
  }, []);

  const move = useCallback((index: number, delta: -1 | 1) => {
    setPhotos((list) => {
      const target = index + delta;
      if (target < 0 || target >= list.length) return list;
      const next = [...list];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const remove = useCallback((id: number) => {
    setPhotos((list) => {
      const gone = list.find((p) => p.id === id);
      if (gone) URL.revokeObjectURL(gone.preview);
      return list.filter((p) => p.id !== id);
    });
  }, []);

  const scan = useCallback(async (): Promise<ChapterDraft> => {
    setProgress("Starting the text recognizer…");
    try {
      return await scanContentsPhotos(
        live.current.map((p) => p.file),
        {
          createWorker: createSelfHostedWorker,
          onProgress: (current, total) => setProgress(`Reading photo ${current} of ${total}…`),
        },
      );
    } finally {
      setProgress(null);
    }
  }, []);

  return { photos, progress, add, move, remove, scan, max: MAX_CONTENTS_PHOTOS };
}
