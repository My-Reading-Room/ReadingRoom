// Route handler tests (#10). Supabase auth is mocked; outbound fetch is stubbed.
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { resetRateLimits } from "@/utils/api/rate-limit";
import { resetCatalogServer } from "@/utils/catalog-server";

import { GET as editions } from "../books/editions/route";
import { GET as isbnLookup } from "../books/isbn/[isbn]/route";
import { GET as search } from "../books/search/route";
import { GET as seriesLookup } from "../series-lookup/route";

let claims: { sub: string } | null = { sub: "user-1" };
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: claims ? { claims } : null }) },
  }),
}));

const req = (path: string) => new NextRequest(new URL(path, "http://localhost:3000"));
const fetchCalls: { url: string; init?: RequestInit }[] = [];
const stubFetch = (respond: (url: string) => unknown, ok = true, status = 200) => {
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    fetchCalls.push({ url: String(url), init });
    return { ok, status, json: async () => respond(String(url)) };
  });
};

const provider = {
  title: "Dune",
  author: "Frank Herbert",
  url: "https://www.listofbooks.net/series/dune?utm_source=api",
  order: "publication",
  totalBooks: 6,
  books: [{ title: "Dune", position: 1, number: 1, role: "core", year: 1965 }],
};

beforeEach(() => {
  claims = { sub: "user-1" };
  fetchCalls.length = 0;
  resetRateLimits();
  vi.unstubAllEnvs();
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetCatalogServer();
});

describe("every route requires a verified signed-in user", () => {
  test.each([
    ["search", () => search(req("/api/books/search?q=dune"))],
    [
      "isbn",
      () =>
        isbnLookup(req("/api/books/isbn/9780441172719"), {
          params: Promise.resolve({ isbn: "9780441172719" }),
        }),
    ],
    ["editions", () => editions(req("/api/books/editions?work=/works/OL1W"))],
    ["series", () => seriesLookup(req("/api/series-lookup?mode=status"))],
  ])("%s → 401 without claims, and no outbound request", async (_name, call) => {
    claims = null;
    stubFetch(() => ({}));
    const res = await call();
    expect(res.status).toBe(401);
    expect(fetchCalls).toHaveLength(0);
  });
});

describe("/api/books/search", () => {
  test("validates the query", async () => {
    stubFetch(() => ({ docs: [] }));
    expect((await search(req("/api/books/search?q="))).status).toBe(400);
    expect((await search(req(`/api/books/search?q=${"x".repeat(201)}`))).status).toBe(400);
    expect(fetchCalls).toHaveLength(0);
  });

  test("returns normalized results and identifies the app to Open Library", async () => {
    vi.stubEnv("OPEN_LIBRARY_CONTACT", "team@example.org");
    stubFetch(() => ({
      docs: [{ key: "/works/OL1W", title: "Dune", author_name: ["Frank Herbert"] }],
    }));
    const res = await search(req("/api/books/search?q=dune"));
    expect(res.status).toBe(200);
    expect((await res.json()).results[0]).toMatchObject({ kind: "work", title: "Dune" });
    const ua = (fetchCalls[0].init?.headers as Record<string, string>)["User-Agent"];
    expect(ua).toBe("MyReadingRoom (team@example.org)");
  });

  test("the Google Books key is used server-side and never returned to the browser", async () => {
    vi.stubEnv("GOOGLE_BOOKS_API_KEY", "server-secret-key");
    stubFetch((url) =>
      url.includes("openlibrary")
        ? { docs: [] }
        : { items: [{ id: "g1", volumeInfo: { title: "Dune" } }] },
    );
    const res = await search(req("/api/books/search?q=dune"));
    const body = JSON.stringify(await res.json());
    expect(
      fetchCalls.some(
        (c) => c.url.includes("googleapis.com") && c.url.includes("key=server-secret-key"),
      ),
    ).toBe(true);
    expect(body).not.toContain("server-secret-key");
  });

  test("rate limits each user separately", async () => {
    stubFetch(() => ({ docs: [] }));
    for (let i = 0; i < 60; i++)
      expect((await search(req("/api/books/search?q=a"))).status).toBe(200);
    const limited = await search(req("/api/books/search?q=a"));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
    claims = { sub: "user-2" };
    expect((await search(req("/api/books/search?q=a"))).status).toBe(200);
  });
});

test("Open Library calls are identified, cached and never send the Google key", async () => {
  vi.stubEnv("GOOGLE_BOOKS_API_KEY", "server-secret-key");
  stubFetch(() => ({
    docs: [{ key: "/works/OL1W", title: "Dune", author_name: ["Frank Herbert"] }],
  }));
  await search(req("/api/books/search?q=dune"));
  await search(req("/api/books/search?q=dune"));
  expect(fetchCalls).toHaveLength(1); // second identical lookup served from cache
  const ol = fetchCalls[0];
  expect(ol.url).toMatch(/^https:\/\/openlibrary\.org\//);
  expect(ol.url).not.toContain("server-secret-key");
  expect((ol.init?.headers as Record<string, string>)["User-Agent"]).toBe("MyReadingRoom");
});

test("/api/books/isbn rejects invalid ISBNs before any request", async () => {
  stubFetch(() => ({}));
  const res = await isbnLookup(req("/api/books/isbn/123"), {
    params: Promise.resolve({ isbn: "123" }),
  });
  expect(res.status).toBe(400);
  expect(fetchCalls).toHaveLength(0);
});

test("/api/books/editions only accepts Open Library work keys", async () => {
  stubFetch(() => ({ entries: [] }));
  for (const work of [
    "/books/OL1M",
    "/works/OL1W/../../people",
    "https://evil.example/works/OL1W",
    "",
  ]) {
    const res = await editions(req(`/api/books/editions?work=${encodeURIComponent(work)}`));
    expect(res.status, work).toBe(400);
  }
  expect(fetchCalls).toHaveLength(0);
  expect((await editions(req("/api/books/editions?work=/works/OL893415W"))).status).toBe(200);
  expect(fetchCalls[0].url).toBe("https://openlibrary.org/works/OL893415W/editions.json?limit=50");
});

// Ported from the legacy series-lookup handler test (legacy/tests/series-catalog-v243.test.mjs).
test("/api/series-lookup keeps the provider key on the server and sanitizes results", async () => {
  let res = await seriesLookup(req("/api/series-lookup?mode=status"));
  expect((await res.json()).configured).toBe(false);
  res = await seriesLookup(req("/api/series-lookup?mode=series&series=Dune"));
  expect(res.status).toBe(503);

  vi.stubEnv("LOB_API_KEY", "private-test-token");
  stubFetch(() => ({ results: [provider] }));
  res = await seriesLookup(req("/api/series-lookup?mode=series&series=Dune"));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.result.totalBooks).toBe(6);
  expect(body.result.url).toMatch(/listofbooks.net/);
  expect(JSON.stringify(body)).not.toContain("private-test-token");
  expect(fetchCalls[0].url).toMatch(/get-reading-order\?series=Dune/);
  expect((fetchCalls[0].init?.headers as Record<string, string>).Authorization).toBe(
    "Bearer private-test-token",
  );

  res = await seriesLookup(req("/api/series-lookup?mode=series&series=!"));
  expect(res.status).toBe(400);

  stubFetch(() => ({ results: [{ ...provider, url: "javascript:alert(1)" }] }));
  res = await seriesLookup(req("/api/series-lookup?mode=series&series=Dune"));
  expect((await res.json()).result).toBeNull();
});
