import { COVER_HOSTS, COVER_REDIRECT_HOSTS } from "@/lib/cover-hosts";

/**
 * Content Security Policy for every HTML response (#8).
 *
 * Scripts and <style> tags only run with the per-request nonce that Next.js
 * attaches to its own tags; 'strict-dynamic' lets those load their chunks.
 * Anything injected into the page (XSS) has no nonce and is blocked, which
 * matters because @supabase/ssr auth cookies are readable from JavaScript.
 */

export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export function buildCsp(
  nonce: string,
  { isDev = process.env.NODE_ENV === "development" } = {},
): string {
  const supabase = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL as string);
  const supabaseWs = `wss://${supabase.host}`;
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // React only needs eval in development (server error stack reconstruction).
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    // The dev server injects <style> tags without a nonce (Next.js CSP guide).
    "style-src": ["'self'", isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`],
    // React style={{...}} attributes. These cannot run script; tags still need the nonce.
    "style-src-attr": ["'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...COVER_HOSTS, ...COVER_REDIRECT_HOSTS],
    "font-src": ["'self'"],
    "connect-src": ["'self'", supabase.origin, supabaseWs],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "frame-src": ["'none'"],
    "manifest-src": ["'self'"],
    "worker-src": ["'self'", "blob:"],
  };
  const policy = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  if (!isDev) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}

/** CSP_REPORT_ONLY=true sends the policy as Report-Only, for a first production rollout. */
export const cspHeaderName = () =>
  process.env.CSP_REPORT_ONLY === "true"
    ? "Content-Security-Policy-Report-Only"
    : "Content-Security-Policy";
