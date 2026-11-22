import { expect, test } from "vitest";

import { BOOK_CSV_COLUMNS, booksToCsv, csvCell } from "@/lib/export";

test("cells are quoted and inner quotes doubled", () => {
  expect(csvCell('Say "hi"')).toBe('"Say ""hi"""');
  expect(csvCell(null)).toBe('""');
  expect(csvCell(["Fantasy", "Poetry"])).toBe('"Fantasy; Poetry"');
  expect(csvCell(4.5)).toBe('"4.5"');
});

test("formula-like text is neutralised (CSV injection)", () => {
  for (const evil of [
    '=HYPERLINK("http://evil.example","x")',
    "+1+1",
    "-2+3",
    "@SUM(A1)",
    "\tcmd",
  ]) {
    expect(csvCell(evil).startsWith(`"'`), evil).toBe(true);
  }
  expect(csvCell("Dune")).toBe('"Dune"');
});

test("header plus one row per book, in legacy column order", () => {
  const csv = booksToCsv([
    { title: "Dune", author: "Frank Herbert", genres: ["Science Fiction"], notes: "=cmd" },
  ]);
  const [header, row] = csv.split("\r\n");
  expect(header.split(",").length).toBe(BOOK_CSV_COLUMNS.length);
  expect(row).toContain('"Dune","Frank Herbert"');
  expect(row).toContain(`"'=cmd"`);
});
