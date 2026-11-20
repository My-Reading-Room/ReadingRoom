import { expect, test } from "vitest";

import {
  planShelfMove,
  shelfBookSize,
  shelfDisplayOrder,
  shelfNeighbour,
  showsSpine,
} from "@/lib/shelf";

const book = (id: string, shelf_order: number, extra = {}) => ({
  id,
  title: id,
  status: "tbr",
  favorite: false,
  shelf_order,
  page_count: 300,
  ...extra,
});

test("favorites, then currently reading, then saved order", () => {
  const list = shelfDisplayOrder([
    book("a", 1),
    book("b", 2, { status: "reading" }),
    book("c", 3, { favorite: true }),
    book("d", 0),
  ]);
  expect(list.map((b) => b.id)).toEqual(["c", "b", "d", "a"]);
});

test("visual size uses measurements, else page count, within bounds", () => {
  expect(shelfBookSize(book("a", 1, { page_count: 0 }))).toEqual({ thickness: 9, height: 104 });
  expect(shelfBookSize(book("a", 1, { page_count: 3000 }))).toEqual({ thickness: 33, height: 148 });
  expect(shelfBookSize(book("a", 1, { thickness_mm: 30, height_mm: 200 }))).toEqual({
    thickness: 19,
    height: 124,
  });
});

test("moving a book renumbers only the rows that change", () => {
  const books = [book("a", 1), book("b", 2), book("c", 3), book("d", 4)];
  expect(planShelfMove(books, "d", "b")).toEqual([
    { id: "d", shelf_order: 2 },
    { id: "b", shelf_order: 3 },
    { id: "c", shelf_order: 4 },
  ]);
  expect(planShelfMove(books, "a", "b")).toEqual([
    { id: "b", shelf_order: 1 },
    { id: "a", shelf_order: 2 },
  ]);
  expect(planShelfMove(books, "a", "a")).toEqual([]);
  expect(planShelfMove(books, "a", "zzz")).toEqual([]);
});

test("gaps and duplicates in saved order are normalised", () => {
  const books = [book("a", 5), book("b", 5), book("c", 9)];
  expect(planShelfMove(books, "c", "a").map((x) => x.id)).toEqual(["c", "a", "b"]);
});

test("neighbours stop at the shelf edges; mix shows every fourth as a spine", () => {
  const books = [book("a", 1), book("b", 2)];
  expect(shelfNeighbour(books, "a", -1)).toBeNull();
  expect(shelfNeighbour(books, "a", 1)).toBe("b");
  expect([0, 1, 2, 3, 6].map((i) => showsSpine("mix", i))).toEqual([
    false,
    false,
    true,
    false,
    true,
  ]);
  expect(showsSpine("spines", 0)).toBe(true);
});
