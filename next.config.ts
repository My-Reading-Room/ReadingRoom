import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Static security headers for every response (#8). The Content-Security-Policy
 * needs a per-request nonce, so it is set in src/proxy.ts instead.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Legacy equivalent of CSP frame-ancestors 'none'.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Camera stays available to this origin for the ISBN barcode scanner.
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()",
  },
  // HSTS only over real HTTPS; on localhost it would pin http://localhost to HTTPS.
  ...(isDev
    ? []
    : [
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      ]),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Cache Components / Partial Prerendering stay off: prerendered static shells
  // cannot carry the per-request CSP nonce, so their scripts would be blocked
  // (see src/utils/security/csp.ts). Every page here is per-user anyway.
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      {
        // The service worker (#13): always revalidated, so fixes ship at once,
        // and limited to same-origin script.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
      {
        // Static offline fallback: no scripts at all.
        source: "/offline.html",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; frame-ancestors 'none'",
          },
        ],
      },
      {
        // The self-hosted OCR worker (#8) skips the page proxy, so give it its own
        // strict policy: code, WebAssembly and data only from this origin.
        source: "/tesseract/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
