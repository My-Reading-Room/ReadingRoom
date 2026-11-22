/**
 * Hosts book covers may load from. Shared by the CSP img-src (#8) and the
 * cover component, so a cover we render is never one the browser will block.
 * Arbitrary user-entered cover URLs wait for the cover proxy (#9).
 */
export const COVER_HOSTS = [
  "https://covers.openlibrary.org",
  "https://books.google.com",
  "https://books.googleusercontent.com",
] as const;

/**
 * Hosts covers are redirected to. Open Library serves most covers as
 * covers.openlibrary.org → archive.org → iaNNNNNN.us.archive.org, and the CSP
 * checks every redirect hop. The app never starts a request at these hosts.
 */
export const COVER_REDIRECT_HOSTS = ["https://archive.org", "https://*.us.archive.org"] as const;

/** The cover URL if it is https on an allowed host, otherwise null (render the fallback tile). */
export function allowedCoverUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (COVER_HOSTS as readonly string[]).includes(url.origin)
      ? url.href
      : null;
  } catch {
    return null;
  }
}
