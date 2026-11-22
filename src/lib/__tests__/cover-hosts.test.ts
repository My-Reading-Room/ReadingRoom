import { expect, test } from "vitest";

import { allowedCoverUrl } from "@/lib/cover-hosts";

test("only https covers on allowed hosts are rendered", () => {
  expect(allowedCoverUrl("https://covers.openlibrary.org/b/id/1-M.jpg")).toBe(
    "https://covers.openlibrary.org/b/id/1-M.jpg",
  );
  expect(allowedCoverUrl("https://books.google.com/books/content?id=x")).toMatch(
    /^https:\/\/books\.google\.com/,
  );
  for (const bad of [
    "http://covers.openlibrary.org/b/id/1-M.jpg", // not https
    "https://tracker.example/pixel.gif", // arbitrary host could log viewers' IPs (#9)
    "https://covers.openlibrary.org.evil.example/x.jpg",
    "https://archive.org/download/x.jpg", // redirect target only; never requested directly
    "javascript:alert(1)",
    "data:image/svg+xml,<svg/>",
    "not a url",
    "",
    null,
  ]) {
    expect(allowedCoverUrl(bad), String(bad)).toBeNull();
  }
});
