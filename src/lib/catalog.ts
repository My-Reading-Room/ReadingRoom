// Open Library / Google Books catalog and conservative Goodreads edition matching.
// No guessed page counts: a match fills missing metadata but never overwrites known pages.
//
// SECURITY (#10): `googleKey` must only ever be supplied by server code (see
// src/utils/catalog-server.ts). Never pass it from the browser.
import type { BookInput } from "./types";

const OPEN_LIBRARY = "https://openlibrary.org";
const coverById = (id: unknown) => (id ? `https://covers.openlibrary.org/b/id/${id}-M.jpg` : "");
export const coverByISBN = (isbn: string | null | undefined) =>
  isbn
    ? `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-M.jpg?default=false`
    : "";
const digits = (value: unknown) => String(value || "").replace(/[^0-9X]/gi, "");
const cleanTitle = (title: unknown) =>
  String(title || "")
    .replace(/\s*\([^)]*#\d+[^)]*\)\s*$/, "")
    .trim();
const normWords = (value: unknown) =>
  new Set(
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !["the", "and", "for", "with", "from"].includes(word)),
  );
const STOP_PUB = new Set([
  "books",
  "book",
  "press",
  "publishing",
  "publishers",
  "publisher",
  "pub",
  "inc",
  "llc",
  "ltd",
  "company",
  "group",
  "the",
  "and",
  "services",
  "com",
  "edition",
  "editions",
]);
const pubTokens = (value: unknown) => [
  ...new Set(
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !STOP_PUB.has(word)),
  ),
];
const yearFrom = (value: unknown): number | null => {
  const match = String(value ?? "").match(/\b(?:1[5-9]\d{2}|20\d{2})\b/);
  return match ? Number(match[0]) : null;
};
const first = <T>(value: T[] | T | null | undefined): T | "" =>
  Array.isArray(value) ? value[0] || "" : value || "";

/** Raw edition/work record from Open Library or Google Books (loosely shaped). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

const isbnList = (candidate: Raw): string[] =>
  [
    ...(candidate.isbn_13 || []),
    ...(candidate.isbn_10 || []),
    ...(Array.isArray(candidate.isbn) ? candidate.isbn : [candidate.isbn]),
  ]
    .filter(Boolean)
    .map(digits);

export function normalizeBinding(value: unknown): string {
  const text = String(value || "").toLowerCase();
  if (/kindle|e-?book|digital|electronic/.test(text)) return "ebook";
  if (/mass.market/.test(text)) return "mass_market";
  if (/paperback|softcover|trade.paper/.test(text)) return "paperback";
  if (/hardcover|hardback|cloth|leather/.test(text)) return "hardcover";
  if (/audiobook|audio.book|audio cd|audio cassette/.test(text)) return "audio";
  return text.trim();
}

/** Fields a book or import row can offer as evidence when matching an edition. */
export type EditionTarget = {
  isbn?: unknown;
  publisher?: unknown;
  binding?: unknown;
  page_count?: unknown;
  edition_year?: unknown;
  published_year?: unknown;
  original_published_year?: unknown;
  kind?: string;
  title?: unknown;
  author?: unknown;
};

export type EditionMatch = {
  score: number;
  coreScore: number;
  evidence: string[];
  exactISBN: boolean;
  conflictingISBN: boolean;
  confident: boolean;
};

// Match the five Goodreads edition fields; publication of the *work* is not,
// by itself, sufficient evidence to choose a particular edition/ISBN.
export function editionMatchDetails(target: EditionTarget = {}, candidate: Raw = {}): EditionMatch {
  let score = 0;
  const evidence: string[] = [];
  const targetIsbn = digits(target.isbn);
  const candidateIsbns = isbnList(candidate);
  const exactISBN = Boolean(targetIsbn && candidateIsbns.includes(targetIsbn));
  const conflictingISBN = Boolean(targetIsbn && candidateIsbns.length && !exactISBN);
  if (exactISBN) {
    score += 200;
    evidence.push("ISBN");
  }

  const tPub = pubTokens(target.publisher);
  const cPub = pubTokens(
    Array.isArray(candidate.publishers) ? candidate.publishers.join(" ") : candidate.publisher,
  );
  if (tPub.length && cPub.length) {
    const overlap = tPub.filter((word) => cPub.includes(word)).length;
    if (overlap) {
      score += 35 + Math.min(15, (overlap - 1) * 8);
      evidence.push("publisher");
    }
  }
  const tBind = normalizeBinding(target.binding);
  const cBind = normalizeBinding(candidate.physical_format || candidate.binding);
  if (tBind && cBind) {
    if (tBind === cBind) {
      score += 25;
      evidence.push("binding");
    } else if ([tBind, cBind].sort().join(":") === "mass_market:paperback") {
      score += 18;
      evidence.push("binding");
    }
  }
  const tPages = Number(target.page_count);
  const cPages = Number(candidate.page_count ?? candidate.number_of_pages);
  if (tPages > 0 && cPages > 0 && Number.isFinite(tPages) && Number.isFinite(cPages)) {
    const difference = Math.abs(tPages - cPages);
    if (difference <= 75) {
      score +=
        difference === 0
          ? 40
          : difference <= 5
            ? 32
            : difference <= 15
              ? 22
              : difference <= 35
                ? 12
                : 5;
      evidence.push("pages");
    }
  }
  const targetEditionYear =
    yearFrom(target.edition_year) ||
    (target.kind === "edition" ? yearFrom(target.published_year) : null);
  const candidateEditionYear =
    yearFrom(candidate.publish_date) ||
    yearFrom(candidate.edition_year) ||
    yearFrom(candidate.published_year);
  if (targetEditionYear && candidateEditionYear) {
    const difference = Math.abs(targetEditionYear - candidateEditionYear);
    if (difference <= 3) {
      score += difference === 0 ? 30 : difference === 1 ? 20 : 10;
      evidence.push("edition year");
    }
  }
  const originalYear = yearFrom(target.original_published_year);
  const candidateOriginalYear =
    yearFrom(candidate.first_publish_year) || yearFrom(candidate.original_published_year);
  if (originalYear && candidateOriginalYear) {
    const difference = Math.abs(originalYear - candidateOriginalYear);
    if (difference <= 2) {
      score += difference === 0 ? 20 : 10;
      evidence.push("original year");
    }
  }

  // Covers / ISBN availability are tie breakers, never sufficient identification.
  const coreScore = score;
  if (candidate.cover_url || candidate.cover_i || first(candidate.covers)) score += 3;
  if (candidateIsbns.length) score += 2;
  const editionEvidence = evidence.filter(
    (field) => !["original year", "ISBN"].includes(field),
  ).length;
  const confident =
    !conflictingISBN && (targetIsbn ? exactISBN : editionEvidence >= 2 && score >= 55);
  return { score, coreScore, evidence, exactISBN, conflictingISBN, confident };
}

export function scoreEditionMatch(target: EditionTarget, candidate: Raw): number {
  return editionMatchDetails(target, candidate).score;
}

function titleAuthorMatches(
  book: EditionTarget,
  candidateTitle: unknown,
  candidateAuthors: unknown,
): boolean {
  const expected = normWords(cleanTitle(book.title));
  const found = normWords(cleanTitle(candidateTitle));
  if (!expected.size || !found.size) return false;
  const aid = /\b(study guide|summary|analysis|workbook|companion|trivia)\b/i;
  if (aid.test(String(candidateTitle)) && !aid.test(String(book.title))) return false;
  let matching = 0;
  for (const word of expected) if (found.has(word)) matching++;
  if (matching / expected.size < 0.5) return false;
  const authorWords = normWords(book.author);
  const candidateAuthorWords = normWords(
    Array.isArray(candidateAuthors) ? candidateAuthors.join(" ") : candidateAuthors,
  );
  if (authorWords.size && candidateAuthorWords.size) {
    let overlap = 0;
    for (const word of authorWords) if (candidateAuthorWords.has(word)) overlap++;
    if (!overlap) return false;
  }
  return true;
}

const GENRE_RULES: [RegExp, string][] = [
  [/science[-\s]?fiction|sci[-\s]?fi|space opera|cyberpunk|dystop/i, "Science Fiction"],
  [/fantasy|sword and sorcery|epic fantasy|urban fantasy|magic/i, "Fantasy"],
  [/thriller|suspense|espionage|spy/i, "Thriller"],
  [/mystery|detective|whodunit|crime fiction/i, "Mystery"],
  [/horror|ghost|vampire|zombie|supernatural/i, "Horror"],
  [/historical fiction/i, "Historical Fiction"],
  [/romance|love stor/i, "Romance"],
  [/western/i, "Western"],
  [/classic|literature/i, "Classics"],
  [/adventure|survival/i, "Adventure"],
  [/biograph|autobiograph/i, "Biography"],
  [/\bmemoir\b/i, "Memoir"],
  [/true crime/i, "True Crime"],
  [/psycholog|mental health|cognitive|behavioral/i, "Psychology"],
  [/self[-\s]?help|personal growth|habit|productivity|motivation|leadership/i, "Self-Help"],
  [/business|economics|finance|investing|management|entrepreneur/i, "Business & Finance"],
  [/history|world war|civil war|ancient|military/i, "History"],
  [
    /sport|athlet|basketball|football|baseball|running|cycling|fitness|strength training|exercise/i,
    "Sports & Fitness",
  ],
  [/health|nutrition|medicine|medical|sleep|longevity|neuroscience/i, "Health & Science"],
  [/\b(science|physics|biology|astronomy|chemistry|mathematics)\b/i, "Science"],
  [/philosoph|stoic|ethics/i, "Philosophy"],
  [/politic|government|sociology|social science/i, "Politics & Society"],
  [/graphic novel|comic|manga/i, "Graphic Novels"],
  [/poetry|poems/i, "Poetry"],
  [/non[-\s]?fiction/i, "Nonfiction"],
  [/^fiction$/i, "Fiction"],
];

export const STANDARD_GENRES: readonly string[] = Object.freeze(
  [...new Set(GENRE_RULES.map(([, label]) => label))].sort((a, b) => a.localeCompare(b)),
);

export function normalizeGenres(rawList: unknown): string[] {
  if (!Array.isArray(rawList)) return [];
  const genres: string[] = [];
  const seen = new Set<string>();
  for (const raw of rawList) {
    if (typeof raw !== "string") continue;
    for (const part of raw.split(/[/,;]+/)) {
      const cleaned = part.trim();
      if (!cleaned || cleaned.length > 45) continue;
      for (const [pattern, genre] of GENRE_RULES) {
        if (pattern.test(cleaned) && !seen.has(genre)) {
          seen.add(genre);
          genres.push(genre);
          break;
        }
      }
    }
  }
  const filtered =
    genres.length > 1 && genres.includes("Fiction")
      ? genres.filter((genre) => genre !== "Fiction")
      : genres;
  return filtered.slice(0, 4);
}

// Open Library requests during a large import are serialized to honor its
// default one-request-per-second public API limit. Ordinary searches remain fast.
let catalogPaceMs = 0;
let nextOpenLibraryAt = 0;
let openLibraryQueue: Promise<void> = Promise.resolve();

export function setBulkCatalogPacing(milliseconds: number | string = 0): void {
  catalogPaceMs = Math.max(0, Number(milliseconds) || 0);
  // Keep the next slot when the server's own pacing (configureCatalog) still
  // applies; otherwise one reader's import ending would let a burst through.
  if (!catalogPaceMs && !config.minIntervalMs) nextOpenLibraryAt = 0;
}

/**
 * Server-side settings (#10). On our server every user shares one IP, so Open
 * Library's per-IP limit applies to everyone: identify the app with a
 * User-Agent (3 req/s instead of 1), pace every request, and cache responses
 * as their usage guidelines ask. All off by default (plain browser/test use).
 */
export type CatalogConfig = {
  /** e.g. "MyReadingRoom (contact@example.org)"; sent to Open Library only. */
  userAgent: string | null;
  /** Minimum gap between Open Library requests, for every caller. */
  minIntervalMs: number;
  /** How long successful JSON responses are reused; 0 disables the cache. */
  cacheTtlMs: number;
  cacheMaxEntries: number;
};

const DEFAULT_CONFIG: CatalogConfig = {
  userAgent: null,
  minIntervalMs: 0,
  cacheTtlMs: 0,
  cacheMaxEntries: 500,
};
let config: CatalogConfig = { ...DEFAULT_CONFIG };
const responseCache = new Map<string, { expires: number; data: Raw }>();

export function configureCatalog(next: Partial<CatalogConfig> | null): void {
  config = next ? { ...config, ...next } : { ...DEFAULT_CONFIG };
  responseCache.clear();
}

const isOpenLibrary = (url: string) => String(url).startsWith(OPEN_LIBRARY + "/");

async function waitForOpenLibrary(url: string): Promise<void> {
  const pace = Math.max(catalogPaceMs, config.minIntervalMs);
  if (!pace || !isOpenLibrary(url)) return;
  const turn = openLibraryQueue.then(async () => {
    const delay = Math.max(0, nextOpenLibraryAt - Date.now());
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    nextOpenLibraryAt = Date.now() + pace;
  });
  openLibraryQueue = turn.catch(() => {});
  await turn;
}

function cached(url: string): Raw | undefined {
  if (!config.cacheTtlMs) return undefined;
  const hit = responseCache.get(url);
  if (!hit) return undefined;
  responseCache.delete(url);
  if (hit.expires <= Date.now()) return undefined;
  responseCache.set(url, hit); // most recently used last
  return hit.data;
}

function remember(url: string, data: Raw): void {
  if (!config.cacheTtlMs) return;
  responseCache.set(url, { expires: Date.now() + config.cacheTtlMs, data });
  while (responseCache.size > config.cacheMaxEntries) {
    responseCache.delete(responseCache.keys().next().value as string);
  }
}

async function getJSON(url: string, timeout = 12000): Promise<Raw> {
  const hit = cached(url);
  if (hit !== undefined) return hit;
  await waitForOpenLibrary(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const headers =
      config.userAgent && isOpenLibrary(url) ? { "User-Agent": config.userAgent } : undefined;
    const response = await fetch(url, { signal: controller.signal, headers });
    if (!response.ok) throw new Error(`Catalog lookup failed (${response.status})`);
    const data = await response.json();
    remember(url, data);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export async function genresForISBNBatch(
  isbns: unknown[] | null | undefined,
): Promise<Map<string, string[]>> {
  const ids = [
    ...new Set((isbns || []).map(digits).filter((id) => id.length === 10 || id.length === 13)),
  ];
  if (!ids.length) return new Map();
  // One multi-ISBN catalog request replaces up to 20 individual requests.
  const keys = ids.map((id) => `ISBN:${id}`);
  const params = new URLSearchParams({ bibkeys: keys.join(","), jscmd: "data", format: "json" });
  const data = await getJSON(`${OPEN_LIBRARY}/api/books?${params}`);
  const result = new Map<string, string[]>();
  for (const isbn of ids) {
    const book = data?.[`ISBN:${isbn}`];
    const subjects = (book?.subjects || book?.details?.subjects || [])
      .map((s: unknown) => (typeof s === "string" ? s : (s as Raw | null)?.name))
      .filter(Boolean);
    result.set(isbn, normalizeGenres(subjects));
  }
  return result;
}

export async function googleGenresByISBN(isbn: unknown, googleKey = ""): Promise<string[]> {
  const value = digits(isbn);
  if (!(value.length === 10 || value.length === 13)) return [];
  const params = new URLSearchParams({ q: `isbn:${value}`, maxResults: "5" });
  if (googleKey) params.set("key", googleKey);
  const data = await getJSON(`https://www.googleapis.com/books/v1/volumes?${params}`);
  for (const item of data?.items || []) {
    const ids = (item.volumeInfo?.industryIdentifiers || []).map((x: Raw) => digits(x.identifier));
    if (!ids.includes(value)) continue;
    const genres = normalizeGenres(item.volumeInfo?.categories);
    if (genres.length) return genres;
  }
  return [];
}

/** A search result or looked-up edition, normalized across catalog sources. */
export type CatalogBook = {
  kind: "work" | "edition";
  source: "openlibrary" | "googlebooks";
  key: string;
  edition_key?: string;
  work_key?: string;
  title: string;
  author: string;
  published_year: number | null;
  original_published_year: number | null;
  edition_year: number | null;
  binding: string | null;
  cover_url: string;
  page_count: number | null;
  description: string;
  publisher?: string;
  isbn: string;
  genres: string[];
  edition_count: number | null;
};

function OLwork(doc: Raw): CatalogBook {
  return {
    kind: "work",
    source: "openlibrary",
    key: doc.key,
    title: doc.title || "Untitled",
    author: (doc.author_name || []).join(", ") || "Unknown author",
    published_year: doc.first_publish_year || null,
    original_published_year: doc.first_publish_year || null,
    edition_year: null,
    binding: null,
    cover_url: coverById(doc.cover_i),
    page_count: doc.number_of_pages_median || null,
    description: "",
    isbn: first(doc.isbn) || "",
    genres: normalizeGenres(doc.subject),
    edition_count: doc.edition_count || null,
  };
}

type EditionFallback = Partial<
  Pick<
    CatalogBook,
    | "isbn"
    | "work_key"
    | "title"
    | "author"
    | "published_year"
    | "original_published_year"
    | "binding"
    | "description"
    | "cover_url"
    | "genres"
  >
> & { original_published_year?: number | null };

function OLedition(doc: Raw, fallback: EditionFallback = {}): CatalogBook {
  const isbn = first(doc.isbn_13) || first(doc.isbn_10) || fallback.isbn || "";
  const work_key = doc.works?.[0]?.key || fallback.work_key || "";
  const description =
    typeof doc.description === "string" ? doc.description : doc.description?.value;
  const editionYear = yearFrom(doc.publish_date);
  const genres = normalizeGenres(doc.subjects);
  return {
    kind: "edition",
    source: "openlibrary",
    key: doc.key || "",
    edition_key: doc.key || "",
    work_key,
    title: doc.title || fallback.title || "Untitled",
    author: fallback.author || "Unknown author",
    published_year: editionYear || fallback.published_year || null,
    edition_year: editionYear,
    original_published_year: fallback.original_published_year || null,
    page_count: doc.number_of_pages || null,
    publisher: (doc.publishers || []).join(", "),
    binding: doc.physical_format || fallback.binding || "",
    isbn,
    description: description || fallback.description || "",
    cover_url: coverById(first(doc.covers)) || coverByISBN(isbn) || fallback.cover_url || "",
    genres: genres.length ? genres : fallback.genres || [],
    edition_count: 1,
  };
}

/**
 * Google Books descriptions are HTML. Keep only the text, then drop any stray
 * angle brackets so no tag fragment (e.g. from nested "<<b>script>") survives.
 */
export function plainTextDescription(html: unknown): string {
  return String(html || "")
    .replace(/<[^>]+>/g, "")
    .replace(/[<>]/g, "");
}

function googleVolume(item: Raw): CatalogBook {
  const vol = item.volumeInfo || {};
  const ids: Raw[] = vol.industryIdentifiers || [];
  const isbn =
    ids.find((entry) => entry.type === "ISBN_13")?.identifier || ids[0]?.identifier || "";
  const year = yearFrom(vol.publishedDate);
  return {
    kind: "edition",
    source: "googlebooks",
    key: item.id,
    edition_key: `google:${item.id}`,
    work_key: "",
    isbn,
    title: vol.title || "Untitled",
    author: (vol.authors || []).join(", ") || "Unknown author",
    description: plainTextDescription(vol.description),
    published_year: year,
    edition_year: year,
    original_published_year: null,
    page_count: vol.pageCount || null,
    publisher: vol.publisher || "",
    binding: item.saleInfo?.isEbook ? "ebook" : "",
    genres: normalizeGenres(vol.categories),
    cover_url: (vol.imageLinks?.thumbnail || vol.imageLinks?.smallThumbnail || "").replace(
      /^http:/,
      "https:",
    ),
    edition_count: 1,
  };
}

// Exact ISBN metadata lookup for the user-invoked per-book action. Unlike a
// general catalog search, this never treats an unrelated work as an ISBN match.
export async function lookupISBNMetadata(
  isbn: unknown,
  googleKey = "",
): Promise<CatalogBook | null> {
  const value = digits(isbn);
  if (value.length !== 10 && value.length !== 13) return null;
  try {
    const edition = await getJSON(`${OPEN_LIBRARY}/isbn/${encodeURIComponent(value)}.json`);
    const result = OLedition(edition, { isbn: value });
    // Pull work-level subjects only when linked to this *exact* ISBN edition.
    if (result.work_key && !result.genres.length) {
      try {
        const work = await getJSON(`${OPEN_LIBRARY}${result.work_key}.json`);
        result.genres = normalizeGenres(work.subjects || work.subject || []);
        if (!result.original_published_year)
          result.original_published_year = yearFrom(work.first_publish_date);
      } catch {
        // Preserve the exact edition data if work details are missing.
      }
    }
    return result;
  } catch {
    // The ISBN may still exist at Google Books.
  }
  try {
    const params = new URLSearchParams({ q: `isbn:${value}`, maxResults: "10" });
    if (googleKey) params.set("key", googleKey);
    const data = await getJSON(`https://www.googleapis.com/books/v1/volumes?${params}`);
    const item = (data.items || []).find((entry: Raw) =>
      (entry.volumeInfo?.industryIdentifiers || []).some(
        (id: Raw) => digits(id.identifier) === value,
      ),
    );
    return item ? googleVolume(item) : null;
  } catch {
    return null;
  }
}

export async function searchCatalog(query: unknown, googleKey = ""): Promise<CatalogBook[]> {
  const q = String(query || "").trim();
  if (!q) return [];
  const isbn = digits(q);
  if ((isbn.length === 10 || isbn.length === 13) && isbn === q.replace(/[-\s]/g, "")) {
    try {
      return [
        OLedition(await getJSON(`${OPEN_LIBRARY}/isbn/${encodeURIComponent(isbn)}.json`), { isbn }),
      ];
    } catch {
      // Search by text or Google Books if the exact edition is missing.
    }
  }
  try {
    const params = new URLSearchParams({
      q,
      limit: "15",
      fields:
        "key,title,author_name,first_publish_year,cover_i,isbn,subject,edition_count,number_of_pages_median",
    });
    const data = await getJSON(`${OPEN_LIBRARY}/search.json?${params}`);
    const entries = (data.docs || []).filter((doc: Raw) => doc.key && doc.title).map(OLwork);
    if (entries.length) return entries;
  } catch (error) {
    if (!googleKey) throw error;
  }
  if (!googleKey) return [];
  const params = new URLSearchParams({
    q: isbn.length === 10 || isbn.length === 13 ? `isbn:${isbn}` : q,
    maxResults: "15",
    key: googleKey,
  });
  return ((await getJSON(`https://www.googleapis.com/books/v1/volumes?${params}`)).items || []).map(
    googleVolume,
  );
}

export async function getEditions(
  work: Pick<CatalogBook, "kind" | "key" | "title" | "author"> & Partial<CatalogBook>,
): Promise<CatalogBook[]> {
  if (work.kind === "edition") return [work as CatalogBook];
  const data = await getJSON(`${OPEN_LIBRARY}${work.key}/editions.json?limit=50`);
  const editions = (data.entries || []).map((entry: Raw) =>
    OLedition(entry, {
      work_key: work.key,
      title: work.title,
      author: work.author,
      published_year: work.published_year,
      original_published_year: work.original_published_year || work.published_year,
      cover_url: work.cover_url,
      genres: work.genres || [],
    }),
  );
  return editions.sort(
    (a: CatalogBook, b: CatalogBook) =>
      Number(Boolean(b.page_count)) - Number(Boolean(a.page_count)) ||
      (b.edition_year || 0) - (a.edition_year || 0),
  );
}

type EnrichState = {
  isbn: string;
  cover_url: string;
  genres: string[];
  work_key: string | null;
  edition_key: string | null;
  description: string | null;
  publisher: string | null;
  binding: string | null;
  page_count: number | null;
  published_year: number | null;
  edition_year: number | null;
  original_published_year: number | null;
};

function applyEditionIfConfident(
  state: EnrichState,
  edition: CatalogBook | null | undefined,
  match: { confident: boolean } | null | undefined,
): boolean {
  if (!match?.confident || !edition) return false;
  if (!state.edition_key && edition.edition_key) state.edition_key = edition.edition_key;
  if (!state.isbn && edition.isbn) state.isbn = digits(edition.isbn);
  if (!state.publisher && edition.publisher) state.publisher = edition.publisher;
  if (!state.binding && edition.binding) state.binding = edition.binding;
  if (!state.page_count && edition.page_count) state.page_count = edition.page_count;
  if (!state.edition_year && edition.edition_year) state.edition_year = edition.edition_year;
  if (!state.published_year && edition.published_year)
    state.published_year = edition.published_year;
  if (!state.description && edition.description) state.description = edition.description;
  if (!state.cover_url && edition.cover_url) state.cover_url = edition.cover_url;
  if (!state.genres.length && edition.genres?.length) state.genres = edition.genres;
  return true;
}

export type EnrichOptions = {
  preserveCover?: boolean;
  forceGenres?: boolean;
  matchEdition?: boolean;
};

export async function enrichBookMetadata<B extends BookInput>(
  book: B,
  googleKey = "",
  { preserveCover = true, forceGenres = false, matchEdition = false }: EnrichOptions = {},
): Promise<B & Omit<EnrichState, "cover_url"> & { cover_url: string | null }> {
  const state: EnrichState = {
    isbn: digits(book.isbn),
    cover_url: preserveCover && book.cover_url ? book.cover_url : "",
    genres: !forceGenres && Array.isArray(book.genres) ? book.genres : [],
    work_key: book.work_key || null,
    edition_key: book.edition_key || null,
    description: book.description || null,
    publisher: book.publisher || null,
    binding: book.binding || null,
    page_count: (book.page_count as number) || null,
    published_year: (book.published_year as number) || null,
    edition_year: (book.edition_year as number) || null,
    original_published_year: (book.original_published_year as number) || null,
  };
  const target = book as EditionTarget;
  const title = cleanTitle(book.title);
  // Exact ISBN lookup is the strongest possible identification; it never changes an existing ISBN.
  if (
    state.isbn &&
    (matchEdition || !state.cover_url || !state.genres.length || !state.description)
  ) {
    try {
      const data = await getJSON(`${OPEN_LIBRARY}/isbn/${encodeURIComponent(state.isbn)}.json`);
      const edition = OLedition(data, {
        isbn: state.isbn,
        author: book.author ?? undefined,
        original_published_year: state.original_published_year,
      });
      if (!state.work_key && edition.work_key) state.work_key = edition.work_key;
      applyEditionIfConfident(state, edition, { confident: true });
      // An exact ISBN may have a cover even if the other metadata is sparse.
    } catch {
      // Fall back to title and author lookup.
    }
  }

  const needsSearch = Boolean(
    title &&
    (matchEdition || !state.isbn || !state.cover_url || !state.genres.length || !state.description),
  );
  if (needsSearch) {
    try {
      const params = new URLSearchParams({
        title,
        limit: "8",
        fields:
          "key,title,author_name,first_publish_year,cover_i,subject,publisher,number_of_pages_median,isbn",
      });
      if (book.author) params.set("author", book.author);
      const data = await getJSON(`${OPEN_LIBRARY}/search.json?${params}`);
      const works: Raw[] = (data.docs || [])
        .filter((doc: Raw) => doc.key && titleAuthorMatches(target, doc.title, doc.author_name))
        .sort(
          (a: Raw, b: Raw) =>
            scoreEditionMatch(target, {
              publisher: first(b.publisher),
              page_count: b.number_of_pages_median,
              first_publish_year: b.first_publish_year,
              cover_i: b.cover_i,
            }) -
            scoreEditionMatch(target, {
              publisher: first(a.publisher),
              page_count: a.number_of_pages_median,
              first_publish_year: a.first_publish_year,
              cover_i: a.cover_i,
            }),
        );
      const bestWork = works[0];
      if (bestWork) {
        if (!state.work_key) state.work_key = bestWork.key;
        if (!state.original_published_year && bestWork.first_publish_year) {
          state.original_published_year = bestWork.first_publish_year;
        }
        if (!state.genres.length) {
          const hit = works.find((doc) => normalizeGenres(doc.subject).length);
          if (hit) state.genres = normalizeGenres(hit.subject);
        }
        // Limit extra requests. Never select an edition by cover presence alone.
        const candidates: {
          match: EditionMatch;
          raw: Raw;
          edition: CatalogBook;
          work_key: string;
        }[] = [];
        const workChoices = state.work_key
          ? works.filter((doc) => doc.key === state.work_key).slice(0, 1)
          : works.slice(0, 2);
        for (const work of workChoices.length ? workChoices : works.slice(0, 1)) {
          try {
            const editionsData = await getJSON(`${OPEN_LIBRARY}${work.key}/editions.json?limit=50`);
            for (const raw of editionsData.entries || []) {
              const match = editionMatchDetails(target, {
                ...raw,
                first_publish_year: work.first_publish_year,
              });
              if (match.confident) {
                candidates.push({
                  match,
                  raw,
                  edition: OLedition(raw, {
                    title: work.title,
                    author: book.author ?? undefined,
                    work_key: work.key,
                    original_published_year: work.first_publish_year,
                    cover_url: coverById(work.cover_i),
                    genres: state.genres,
                  }),
                  work_key: work.key,
                });
              }
            }
          } catch {
            // A missing edition list should not block other metadata.
          }
        }
        candidates.sort((a, b) => b.match.score - a.match.score);
        // Avoid falsely claiming an exact edition when two similarly plausible editions tie.
        if (
          candidates.length &&
          (candidates[0].match.exactISBN ||
            !candidates[1] ||
            candidates[0].match.coreScore > candidates[1].match.coreScore)
        ) {
          const chosen = candidates[0];
          if (!state.work_key) state.work_key = chosen.work_key;
          applyEditionIfConfident(state, chosen.edition, chosen.match);
        }
        if (!state.cover_url) {
          const cover = works.find((doc) => doc.cover_i);
          if (cover) state.cover_url = coverById(cover.cover_i); // Work cover, not a verified edition cover.
        }
      }
    } catch {
      // Fall back to Google Books.
    }
  }

  if (
    (matchEdition ||
      !state.cover_url ||
      !state.genres.length ||
      !state.isbn ||
      !state.description) &&
    (state.isbn || title)
  ) {
    try {
      const queries: string[] = [];
      if (state.isbn) queries.push(`isbn:${state.isbn}`);
      if (title) queries.push(`intitle:${title}${book.author ? ` inauthor:${book.author}` : ""}`);
      for (const q of queries) {
        if (
          state.cover_url &&
          state.genres.length &&
          state.isbn &&
          state.description &&
          !matchEdition
        )
          break;
        const params = new URLSearchParams({ q, maxResults: "8" });
        if (googleKey) params.set("key", googleKey);
        const data = await getJSON(`https://www.googleapis.com/books/v1/volumes?${params}`);
        const candidates = (data.items || [])
          .map((item: Raw) => {
            const edition = googleVolume(item);
            const identifiers: Raw[] = item.volumeInfo?.industryIdentifiers || [];
            const raw = {
              publisher: edition.publisher,
              page_count: edition.page_count,
              edition_year: edition.edition_year,
              binding: edition.binding,
              cover_url: edition.cover_url,
              isbn: identifiers.map((id) => id.identifier),
            };
            return {
              edition,
              match: editionMatchDetails(target, raw),
              identifiers: identifiers.map((id) => digits(id.identifier)),
            };
          })
          .filter((item: { edition: CatalogBook; identifiers: string[] }) => {
            const sameISBN = state.isbn && item.identifiers.includes(state.isbn);
            return (
              sameISBN ||
              (!state.isbn && titleAuthorMatches(target, item.edition.title, item.edition.author))
            );
          })
          .sort(
            (a: { match: EditionMatch }, b: { match: EditionMatch }) =>
              b.match.score - a.match.score,
          );
        for (const { edition, match } of candidates as {
          edition: CatalogBook;
          match: EditionMatch;
        }[]) {
          if (!state.cover_url && edition.cover_url) state.cover_url = edition.cover_url;
          if (!state.genres.length && edition.genres.length) state.genres = edition.genres;
          applyEditionIfConfident(state, edition, match);
          if (state.cover_url && state.genres.length && state.edition_key && !matchEdition) break;
        }
      }
    } catch {
      // External API may be rate-limited; keep existing data.
    }
  }
  return {
    ...book,
    ...state,
    cover_url: state.cover_url || null,
    genres: state.genres.length ? state.genres : book.genres || [],
  };
}

export function toLibraryBook(book: Partial<CatalogBook> & BookInput, userId: string, order = 0) {
  return {
    id: crypto.randomUUID(),
    user_id: userId,
    title: book.title as string,
    author: book.author || "",
    work_key: book.work_key || (book.kind === "work" ? book.key : null),
    edition_key: book.edition_key || (book.kind === "edition" ? book.key : null),
    isbn: book.isbn || null,
    description: book.description || null,
    published_year: book.published_year || null,
    edition_year: book.kind === "edition" ? book.edition_year || null : null,
    original_published_year:
      book.original_published_year || (book.kind === "work" ? book.published_year || null : null),
    publisher: book.publisher || null,
    binding: book.binding || null,
    page_count: book.page_count || null,
    height_mm: null,
    thickness_mm: null,
    cover_url: book.cover_url || null,
    genres: book.genres || [],
    series_name: null,
    series_number: null,
    status: "tbr",
    favorite: false,
    rating: null,
    started_on: null,
    finished_on: null,
    current_page: 0,
    shelf_order: order,
    notes: "",
  };
}
