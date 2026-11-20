// Sanitizes List Of Books responses before they reach the browser (series lookups, #10).
// Only https://(www.)listofbooks.net/series/… links are passed through, and every
// string and number is bounded.
export const clean = (value: unknown) =>
  String((Array.isArray(value) ? value[0] : value) || "").trim();
export const allowed = (value: string) => value.length <= 200 && /^[\p{L}\p{N}]/u.test(value);
const safeLink = (url: unknown): string => {
  try {
    const u = new URL(String(url));
    return u.protocol === "https:" &&
      ["listofbooks.net", "www.listofbooks.net"].includes(u.hostname) &&
      u.pathname.startsWith("/series/")
      ? String(url)
      : "";
  } catch {
    return "";
  }
};

type RawBook = {
  title?: unknown;
  position?: unknown;
  number?: unknown;
  role?: unknown;
  year?: unknown;
};
type RawSeries = RawBook & {
  author?: unknown;
  url?: unknown;
  totalBooks?: unknown;
  order?: unknown;
  booksOmitted?: unknown;
  books?: unknown;
};

export function safeResult(raw: RawSeries | null | undefined) {
  if (!raw || !raw.title || !safeLink(raw.url)) return null;
  const total = Number(raw.totalBooks);
  return {
    title: clean(raw.title).slice(0, 200),
    author: clean(raw.author).slice(0, 200),
    url: safeLink(raw.url),
    totalBooks: Number.isInteger(total) && total > 0 && total <= 500 ? total : null,
    position: Number.isFinite(Number(raw.position)) ? Number(raw.position) : null,
    order: raw.order === "reading" ? "reading" : "publication",
    booksOmitted: Number(raw.booksOmitted) || 0,
    books: (Array.isArray(raw.books) ? (raw.books as RawBook[]) : [])
      .slice(0, 200)
      .map((b) => ({
        title: clean(b.title).slice(0, 220),
        position: Number.isFinite(Number(b.position)) ? Number(b.position) : null,
        number: Number.isFinite(Number(b.number)) ? Number(b.number) : null,
        role: clean(b.role || "core").slice(0, 30),
        year: Number.isInteger(Number(b.year)) ? Number(b.year) : null,
      }))
      .filter((b) => b.title),
  };
}
