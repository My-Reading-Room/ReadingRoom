import "server-only";

import { cookies } from "next/headers";

import type { IsoDate } from "@/lib/types";

export const TIME_ZONE_COOKIE = "rr_tz";

/** Today's date in a time zone, or null if the zone isn't a valid IANA name. */
export function dateInZone(timeZone: string, now = new Date()): IsoDate | null {
  try {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return null;
  }
}

/**
 * The reader's local calendar date on the server, from the time zone their
 * browser records (TimeZoneCookie). Falls back to UTC.
 */
export async function localToday(now = new Date()): Promise<IsoDate> {
  const zone = (await cookies()).get(TIME_ZONE_COOKIE)?.value;
  return (zone && zone.length <= 64 && dateInZone(zone, now)) || now.toISOString().slice(0, 10);
}
