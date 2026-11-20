import type { IsoDate } from "@/lib/types";

const DAY = 86_400_000;

/**
 * The reader's local calendar date, as sent by their browser. Reading dates are
 * local (legacy used the device date), but a server in UTC can be a day off,
 * so accept the client's value only within ±1 day of the server's UTC date,
 * which covers every time zone; otherwise fall back to the server date.
 */
export function clientToday(value: FormDataEntryValue | null, now = new Date()): IsoDate {
  const server = now.toISOString().slice(0, 10);
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return server;
  const t = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== value) return server;
  return Math.abs(t - Date.parse(`${server}T00:00:00Z`)) <= DAY ? value : server;
}
