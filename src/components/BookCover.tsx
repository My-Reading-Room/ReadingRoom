"use client";

import { useState } from "react";

import { coverColor } from "@/lib/book-display";
import { allowedCoverUrl } from "@/lib/cover-hosts";

type Props = {
  title: string;
  author?: string | null;
  coverUrl?: string | null;
  size?: "small" | "large";
};

/**
 * A typographic placeholder cover, with the real image layered on top when it
 * comes from an allowed host (the CSP would block any other). If the image
 * fails to load, the placeholder stays visible.
 */
export function BookCover({ title, author, coverUrl, size }: Props) {
  const [failed, setFailed] = useState(false);
  const src = allowedCoverUrl(coverUrl);
  return (
    <div
      className={size ? `cover ${size}` : "cover"}
      style={{ "--cover": coverColor(title), "--cover-ink": "#f6eacd" } as React.CSSProperties}
      aria-hidden="true"
    >
      <span className="cover-title">{title}</span>
      <span className="cover-mark">✦</span>
      <span className="cover-author">{author}</span>
      {src && !failed && (
        // A plain <img>: covers come straight from the allowed hosts, which
        // avoids running every cover through the image optimizer.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
