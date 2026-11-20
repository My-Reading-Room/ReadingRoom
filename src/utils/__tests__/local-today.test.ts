import { expect, test } from "vitest";

import { dateInZone } from "../local-today";

test("local date follows the reader's time zone, not UTC", () => {
  const lateEveningInCalifornia = new Date("2026-11-21T05:30:00Z"); // 21:30 on Nov 20 in Los Angeles
  expect(dateInZone("America/Los_Angeles", lateEveningInCalifornia)).toBe("2026-11-20");
  expect(dateInZone("UTC", lateEveningInCalifornia)).toBe("2026-11-21");
  expect(dateInZone("Pacific/Kiritimati", new Date("2026-11-20T12:00:00Z"))).toBe("2026-11-21");
});

test("an invalid zone is rejected rather than trusted", () => {
  expect(dateInZone("Not/AZone")).toBeNull();
  expect(dateInZone("'; DROP TABLE")).toBeNull();
});
