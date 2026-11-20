"use client";

import { useEffect } from "react";

/**
 * Records the browser's IANA time zone (e.g. "America/Los_Angeles") so the
 * server can work out the reader's local "today". Not sensitive; no identifiers.
 */
export function TimeZoneCookie() {
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone || document.cookie.includes(`rr_tz=${encodeURIComponent(zone)}`)) return;
    document.cookie = `rr_tz=${encodeURIComponent(zone)}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }, []);
  return null;
}
