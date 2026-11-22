"use client";

import { useState } from "react";

import { useContentsScanner } from "@/hooks/useContentsScanner";
import type { ChapterDraft } from "@/lib/chapter-sourcing";

type Props = { onDraft: (draft: ChapterDraft) => void; onError: (message: string) => void };

/** Contents-page photos → on-device OCR → a candidate draft for review. */
export function ContentsPhotoScanner({ onDraft, onError }: Props) {
  const { photos, progress, add, move, remove, scan, max } = useContentsScanner();
  const [inputKey, setInputKey] = useState(0);
  const busy = progress !== null;

  const pick = (files: FileList | null) => {
    const error = add(files);
    if (error) onError(error);
    setInputKey((k) => k + 1); // allow re-selecting the same file
  };

  return (
    <div className="chapter-photo">
      <label htmlFor="chapter-photo-file">Table of contents · one or more photos</label>
      <input
        key={`files-${inputKey}`}
        className="input"
        id="chapter-photo-file"
        type="file"
        accept="image/*"
        multiple
        disabled={busy}
        onChange={(e) => pick(e.target.files)}
      />
      <label className="btn sm chapter-camera-trigger" htmlFor="chapter-camera-file">
        📷 Take a photo
      </label>
      <input
        key={`camera-${inputKey}`}
        id="chapter-camera-file"
        className="chapter-camera-input"
        type="file"
        accept="image/*"
        capture="environment"
        disabled={busy}
        onChange={(e) => pick(e.target.files)}
      />

      {photos.length > 0 && (
        <div
          className="chapter-photo-queue"
          aria-label="Selected contents photos in scanning order"
        >
          <p className="tiny">
            {photos.length} of {max} photos · scanned from top to bottom in this order.
          </p>
          <ol className="chapter-photo-list">
            {photos.map((photo, i) => (
              <li key={photo.id} className="chapter-photo-item">
                {/* eslint-disable-next-line @next/next/no-img-element -- local blob: preview */}
                <img src={photo.preview} alt={`Contents page ${i + 1}`} loading="lazy" />
                <div className="chapter-photo-name">
                  <strong>Page photo {i + 1}</strong>
                  <span>
                    {photo.file.name || "Camera photo"} · {(photo.file.size / 1048576).toFixed(1)}{" "}
                    MB
                  </span>
                </div>
                <div className="chapter-photo-controls">
                  <button
                    type="button"
                    className="btn sm icon-only"
                    disabled={i === 0 || busy}
                    aria-label={`Move photo ${i + 1} earlier`}
                    onClick={() => move(i, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn sm icon-only"
                    disabled={i === photos.length - 1 || busy}
                    aria-label={`Move photo ${i + 1} later`}
                    onClick={() => move(i, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn sm icon-only danger"
                    disabled={busy}
                    aria-label={`Remove photo ${i + 1}`}
                    onClick={() => remove(photo.id)}
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      <button
        type="button"
        className="btn sm"
        disabled={busy || photos.length === 0}
        onClick={async () => {
          try {
            onDraft(await scan());
          } catch (e) {
            onError((e as Error).message || "Could not read the photos.");
          }
        }}
      >
        {busy
          ? progress
          : `Scan ${photos.length || ""} ordered photo${photos.length === 1 ? "" : "s"}`}
      </button>
      <p className="tiny">
        Add up to {max} photos. Text recognition runs on your device; photos are never uploaded.
        Check for missing, repeated or misread page numbers.
      </p>
    </div>
  );
}
