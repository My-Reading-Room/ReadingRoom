import { beforeAll, describe, expect, test } from "vitest";

import nextConfig from "../../../../next.config";
import { buildCsp, createNonce } from "../csp";

const directives = (csp: string) =>
  Object.fromEntries(
    csp.split("; ").map((d) => {
      const [name, ...values] = d.split(" ");
      return [name, values];
    }),
  );

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example-project.supabase.co";
});

describe("production CSP", () => {
  const nonce = "abc123==";
  let p: Record<string, string[]>;
  beforeAll(() => {
    p = directives(buildCsp(nonce, { isDev: false }));
  });

  test("scripts and style tags run only with the request nonce", () => {
    expect(p["script-src"]).toEqual(["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"]);
    expect(p["style-src"]).toEqual(["'self'", `'nonce-${nonce}'`]);
  });

  test("never allows inline or eval'd script", () => {
    const all = Object.entries(p).filter(([name]) => name !== "style-src-attr");
    for (const [name, values] of all) {
      expect(values, name).not.toContain("'unsafe-inline'");
      expect(values, name).not.toContain("'unsafe-eval'");
    }
  });

  test("blocks framing, plugins, base-tag hijacking and off-site form posts", () => {
    expect(p["frame-ancestors"]).toEqual(["'none'"]);
    expect(p["object-src"]).toEqual(["'none'"]);
    expect(p["base-uri"]).toEqual(["'self'"]);
    expect(p["form-action"]).toEqual(["'self'"]);
    expect(p["upgrade-insecure-requests"]).toEqual([]);
  });

  test("network access is limited to this origin and the Supabase project", () => {
    const supabase = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL as string);
    expect(p["connect-src"]).toEqual(["'self'", supabase.origin, `wss://${supabase.host}`]);
  });

  test("images do not allow arbitrary https hosts", () => {
    expect(p["img-src"]).not.toContain("https:");
    expect(p["img-src"]).not.toContain("*");
    expect(p["img-src"].filter((h) => h.includes("*"))).toEqual(["https://*.us.archive.org"]);
  });

  test("Open Library cover redirects (archive.org storage) are allowed", () => {
    expect(p["img-src"]).toEqual(
      expect.arrayContaining(["https://archive.org", "https://*.us.archive.org"]),
    );
  });
});

test("development only adds what React/Next dev tooling needs", () => {
  const d = directives(buildCsp("n", { isDev: true }));
  expect(d["script-src"]).toContain("'unsafe-eval'");
  expect(d["script-src"]).not.toContain("'unsafe-inline'");
  expect(d["style-src"]).toContain("'unsafe-inline'");
  expect(d["upgrade-insecure-requests"]).toBeUndefined();
});

test("nonces are random and unguessable", () => {
  const seen = new Set(Array.from({ length: 200 }, createNonce));
  expect(seen.size).toBe(200);
  expect(atob([...seen][0]).length).toBe(16);
});

test("static security headers are sent on every route", async () => {
  const rules = await nextConfig.headers!();
  const all = rules.find((r) => r.source === "/(.*)")!;
  const headers = Object.fromEntries(all.headers.map((h) => [h.key, h.value]));
  expect(headers["X-Content-Type-Options"]).toBe("nosniff");
  expect(headers["X-Frame-Options"]).toBe("DENY");
  expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["Permissions-Policy"]).toMatch(/camera=\(self\)/);
  expect(headers["Permissions-Policy"]).toMatch(/microphone=\(\)/);
  expect(nextConfig.poweredByHeader).toBe(false);
});
