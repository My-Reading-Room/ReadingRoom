/**
 * Lets tests swap the global fetch for a stub returning plain objects
 * ({ ok, json }) without a full Response type.
 */
export const stubbable = globalThis as unknown as { fetch: unknown };
