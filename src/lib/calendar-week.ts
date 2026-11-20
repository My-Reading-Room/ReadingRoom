/** Local calendar date (YYYY-MM-DD) week boundaries. Weeks run Sunday–Saturday.
 * Calculate by UTC calendar arithmetic, rather than UTC instants for local
 * sessions, so daylight saving transitions cannot shift the selected day.
 */
import type { IsoDate } from "./types";

export const WEEKDAY_NAMES = Object.freeze(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);

function dateAtUtcNoon(isoDate: unknown): Date {
  if (typeof isoDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    throw new RangeError("Expected a local YYYY-MM-DD date");
  }
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== isoDate) {
    throw new RangeError("Expected a valid local YYYY-MM-DD date");
  }
  return d;
}

export function weekStartSunday(isoDate: IsoDate): IsoDate {
  const d = dateAtUtcNoon(isoDate);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

export function weekEndSaturday(isoDate: IsoDate): IsoDate {
  const d = dateAtUtcNoon(weekStartSunday(isoDate));
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

export function weekDatesSundayFirst(isoDate: IsoDate): IsoDate[] {
  const first = dateAtUtcNoon(weekStartSunday(isoDate));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(first);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}
