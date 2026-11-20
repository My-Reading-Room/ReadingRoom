import type { IsoDate } from "./types";

/** Calendar date in the device's local time zone, as YYYY-MM-DD (never a UTC date). */
export const localDate = (date: Date = new Date()): IsoDate => {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 10);
};

/** Local calendar date `n` days before today (noon-anchored, so DST can't skip a day). */
export const offsetDate = (n: number): IsoDate => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return localDate(d);
};
