import "server-only";

/**
 * Server-only configuration. Nothing here may be prefixed NEXT_PUBLIC_, and
 * importing this module from a Client Component fails the build.
 * Read at call time so tests and deployments can change the environment.
 */
const optional = (value: string | undefined) => value?.trim() || null;

export const serverEnv = {
  /** Optional. Raises Google Books quota for catalog fallback lookups. */
  googleBooksApiKey: () => optional(process.env.GOOGLE_BOOKS_API_KEY),
  /** Optional. Enables series reading-order lookups (List Of Books). */
  listOfBooksApiKey: () => optional(process.env.LOB_API_KEY),
  /** Optional contact email sent to Open Library, which triples its rate limit. */
  openLibraryContact: () => optional(process.env.OPEN_LIBRARY_CONTACT),
};
