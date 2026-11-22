import type { ActivityMode, BookStatus } from "./types";

export const STATUS_TEXT: Record<BookStatus, string> = {
  tbr: "Want to read",
  reading: "Currently reading",
  finished: "Finished",
  dnf: "Did not finish",
};

export const ACTIVITY_LABELS: Record<ActivityMode, string> = {
  reading: "Reading only",
  audiobook: "Audiobook only",
  read_listen: "Read + Listen",
};

export const statusText = (status: string | null | undefined) =>
  STATUS_TEXT[status as BookStatus] ?? STATUS_TEXT.tbr;

/** Deterministic placeholder cover colour from the title (legacy hashColor). */
export function coverColor(title: string | null | undefined): string {
  let h = 0;
  for (const c of String(title ?? "")) h = (h * 31 + c.charCodeAt(0)) | 0;
  return `hsl(${(Math.abs(h) % 310) + 25} 28% 35%)`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "—";
  return new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export const formatRating = (rating: number | null | undefined) =>
  rating == null ? null : `${Number(rating).toFixed(2)} ★`;
