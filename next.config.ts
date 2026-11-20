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
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
