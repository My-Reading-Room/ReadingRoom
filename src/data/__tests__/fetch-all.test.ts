import { expect, test } from "vitest";

import { fetchAllRows } from "../fetch-all";

const table = Array.from({ length: 2345 }, (_, i) => ({ id: i }));
const pager = (rows: { id: number }[], pageSize: number) => {
  const calls: [number, number][] = [];
  const page = async (from: number, to: number) => {
    calls.push([from, to]);
    return { data: rows.slice(from, Math.min(to + 1, from + pageSize)), error: null };
  };
  return { page, calls };
};

test("reads past the 1000-row PostgREST cap without gaps or duplicates", async () => {
  const { page, calls } = pager(table, 1000);
  const rows = await fetchAllRows(page);
  expect(rows).toHaveLength(2345);
  expect(new Set(rows.map((r) => r.id)).size).toBe(2345);
  expect(calls).toEqual([
    [0, 999],
    [1000, 1999],
    [2000, 2999],
  ]);
});

test("stops after an exactly-full last page with one empty request", async () => {
  const { page, calls } = pager(table.slice(0, 2000), 1000);
  expect(await fetchAllRows(page)).toHaveLength(2000);
  expect(calls).toHaveLength(3);
});

test("surfaces database errors instead of returning partial data", async () => {
  await expect(
    fetchAllRows(async () => ({ data: null, error: { message: "permission denied" } })),
  ).rejects.toThrow("permission denied");
});
