// Ported from legacy/tests/chapter-multiple-photos-v241.test.mjs. Assertions unchanged.
// Not ported: legacy source-text checks (app.js, service worker, legacy SQL, DemoRepo)
// and HTML-string view tests, which move to React component tests (#12):
//   - UI supports multiple selection, mobile camera, photo ordering and one draft review
import { test } from "vitest";
import assert from "node:assert/strict";
import {
  MAX_CONTENTS_PHOTOS,
  validateContentsPhotos,
  draftFromContentsPages,
  scanContentsPhotos,
  validateVerifiedChapterMap,
} from "@/lib/chapter-sourcing";
const file = (name, size = 1000) => ({ name, type: "image/jpeg", size });

test("multi-page contents text combines exact chapter starts in photo order", () => {
  const result = draftFromContentsPages([
    "Contents\nChapter 1 ........ 3\nChapter 2 ........ 14",
    "Chapter 3 ........ 29\nChapter 4 ........ 60",
  ]);
  assert.equal(result.source, "Scanned contents (2 photos)");
  assert.deepEqual(
    result.rows.map((x) => [x.chapter_label, x.start_page, x.end_page]),
    [
      ["Chapter 1", 3, 13],
      ["Chapter 2", 14, 28],
      ["Chapter 3", 29, 59],
      ["Chapter 4", 60, ""],
    ],
  );
  assert.throws(() => validateVerifiedChapterMap(result.rows, { page_count: 100 }), /confirm both/);
});

test("repeated or out-of-order photo starts are warned, not counted twice", () => {
  const result = draftFromContentsPages([
    "Chapter 1 ........ 3\nChapter 2 ........ 14",
    "Chapter 2 ........ 14\nChapter 3 ........ 29",
  ]);
  assert.deepEqual(
    result.rows.map((x) => x.start_page),
    [3, 14, 29],
  );
  assert.match(result.warnings.join(" "), /Skipped Chapter 2/);
  const empty = draftFromContentsPages(["Chapter 1 ........ 1", "    ", "Chapter 2 ........ 20"]);
  assert.match(empty.warnings.join(" "), /photo 2/);
});

test("photo batch enforces type, per-photo size, total size, and max page count", () => {
  assert.equal(validateContentsPhotos([file("one.jpg"), file("two.jpg")]).length, 2);
  assert.throws(() => validateContentsPhotos([]), /one or more/);
  assert.throws(
    () =>
      validateContentsPhotos(
        Array.from({ length: MAX_CONTENTS_PHOTOS + 1 }, (_, i) => file(String(i))),
      ),
    /at most/,
  );
  assert.throws(
    () => validateContentsPhotos([{ type: "application/pdf", size: 10 }]),
    /not an image/,
  );
  assert.throws(() => validateContentsPhotos([file("big", 12_000_001)]), /smaller than 12 MB/);
  assert.throws(
    () => validateContentsPhotos(Array.from({ length: 8 }, (_, i) => file(String(i), 11_000_000))),
    /smaller than 80 MB/,
  );
});

test("sequential OCR uses one worker and returns cross-photo page boundaries", async () => {
  const progress = [],
    calls = [];
  let terminated = 0;
  const files = [file("first"), file("second"), file("third")];
  const pages = [
    "Intro .......... 1\nChapter 1 ......... 8",
    "Chapter 2 ......... 22\nChapter 3 ......... 35",
    "Chapter 4 ......... 50\nEpilogue ......... 80",
  ];
  const result = await scanContentsPhotos(files, {
    createWorker: async () => ({
      recognize: async (x) => {
        calls.push(x.name);
        return { data: { text: pages[files.indexOf(x)] } };
      },
      terminate: async () => {
        terminated++;
      },
    }),
    onProgress: (i, n) => progress.push([i, n]),
  });
  assert.deepEqual(calls, ["first", "second", "third"]);
  assert.deepEqual(progress, [
    [1, 3],
    [2, 3],
    [3, 3],
  ]);
  assert.equal(terminated, 1);
  assert.deepEqual(
    result.rows.map((x) => x.start_page),
    [1, 8, 22, 35, 50, 80],
  );
  assert.equal(result.rows[1].end_page, 21);
  assert.equal(result.rows.at(-1).end_page, "");
});

test("photo scanning error includes the failed photo and always tears down the OCR worker", async () => {
  let terminated = 0;
  await assert.rejects(
    scanContentsPhotos([file("a"), file("b")], {
      createWorker: async () => ({
        recognize: async (f) => {
          if (f.name === "b") throw new Error("unreadable format");
          return { data: { text: "Chapter 1 ...... 1" } };
        },
        terminate: async () => {
          terminated++;
        },
      }),
    }),
    /photo 2 of 2/,
  );
  assert.equal(terminated, 1);
});
