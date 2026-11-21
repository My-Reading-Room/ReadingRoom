"use client";

import { useState } from "react";

import { allowedCoverUrl } from "@/lib/cover-hosts";

type Preview = { kind: "empty" | "blocked" | "checking" | "failed" } | { kind: "ok"; src: string };

/**
 * "Preview cover" for the cover URL field (legacy preview-cover-url). Only
 * allow-listed cover hosts can display at all (CSP img-src), so other hosts
 * are explained instead of showing a broken image.
 */
export function CoverPreview({ field = "cover_url" }: { field?: string }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  return (
    <div className="cover-preview">
      <button
        type="button"
        className="btn sm"
        onClick={(e) => {
          const input = e.currentTarget.form?.elements.namedItem(field) as HTMLInputElement | null;
          const value = input?.value.trim() ?? "";
          if (!value) return setPreview({ kind: "empty" });
          const src = allowedCoverUrl(value);
          if (!src) return setPreview({ kind: "blocked" });
          setPreview({ kind: "checking" });
          const img = new Image();
          img.referrerPolicy = "no-referrer";
          img.onload = () => setPreview({ kind: "ok", src });
          img.onerror = () => setPreview({ kind: "failed" });
          img.src = src;
        }}
      >
        Preview cover
      </button>
      {preview?.kind === "ok" ? (
        // eslint-disable-next-line @next/next/no-img-element -- allow-listed remote cover, as BookCover
        <img src={preview.src} alt="Cover URL preview" referrerPolicy="no-referrer" />
      ) : preview ? (
        <span className="tiny" role="status">
          {
            {
              empty: "No cover URL entered.",
              blocked:
                "Covers can come from Open Library or Google Books (HTTPS). Other hosts can't be shown.",
              checking: "Checking cover image…",
              failed: "Unable to load this image. Check the URL.",
            }[preview.kind]
          }
        </span>
      ) : null}
    </div>
  );
}
