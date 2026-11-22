import { afterEach, expect, test, vi } from "vitest";

import { configureCatalog, genresForISBNBatch, setBulkCatalogPacing } from "@/lib/catalog";

afterEach(() => {
  configureCatalog(null);
  setBulkCatalogPacing(0);
  vi.unstubAllGlobals();
});

test("ending a bulk import keeps the server's Open Library pacing", async () => {
  configureCatalog({ minIntervalMs: 120, cacheTtlMs: 0 });
  const times: number[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      times.push(Date.now());
      return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
    }),
  );
  await genresForISBNBatch(["9780441172719"]);
  setBulkCatalogPacing(0); // what every enrichment run does in its finally
  await genresForISBNBatch(["9780553293357"]);
  expect(times).toHaveLength(2);
  expect(times[1] - times[0]).toBeGreaterThanOrEqual(110);
});
