import { expect, test } from "vitest";

import {
  normTitle,
  parseGoodreadsGenreRecommendations,
  parseGoodreadsReadingSessions,
} from "@/lib/goodreads-import";

test("reading sessions become sorted passes per title", () => {
  const map = parseGoodreadsReadingSessions(
    JSON.stringify([
      {
        book: "Dune",
        state: "COMPLETED",
        started_at: "2024-03-01T10:00:00Z",
        ended_at: "2024-03-20T10:00:00Z",
      },
      { book: "Dune", state: "COMPLETED", started_at: "2020-01-01", ended_at: "2020-02-01" },
      { book: "Dune", state: "READING", started_at: "2026-11-01" },
      { book: "Emma", state: "ABANDONED", started_at: "2025-05-05" },
      { book: "", state: "READING" },
      null,
    ]),
  );
  expect(map[normTitle("Dune")]).toEqual([
    { status: "finished", started_on: "2020-01-01", finished_on: "2020-02-01" },
    { status: "finished", started_on: "2024-03-01", finished_on: "2024-03-20" },
    { status: "reading", started_on: "2026-11-01", finished_on: null },
  ]);
  expect(map[normTitle("Emma")]).toEqual([
    { status: "dnf", started_on: "2025-05-05", finished_on: null },
  ]);
});

test("genre recommendations are title-cased and de-duplicated", () => {
  const map = parseGoodreadsGenreRecommendations(
    JSON.stringify([
      { genre: "science-fiction", recommended_because_you_added: ["Dune", "Hyperion"] },
      { genre: "science-fiction", book: "Dune" },
      { genre: "classics", book: "Dune" },
      { book: "No genre" },
    ]),
  );
  expect(map[normTitle("Dune")]).toEqual(["Science Fiction", "Classics"]);
  expect(map[normTitle("Hyperion")]).toEqual(["Science Fiction"]);
});

test("non-array JSON is rejected with a clear message", () => {
  expect(() => parseGoodreadsReadingSessions("{}")).toThrow(/JSON array/);
  expect(() => parseGoodreadsGenreRecommendations('"x"')).toThrow(/JSON array/);
});
