import "server-only";

import { configureCatalog } from "@/lib/catalog";

import { serverEnv } from "./server-env";

let configuredFor: string | null | undefined; // contact the catalog was configured with

/**
 * Configure the shared catalog client for server use (again if the contact changes) and
 * return the server-held Google Books key. All users share this server's IP, so
 * Open Library sees one client: identify it, pace it, and cache responses.
 */
export function catalogServer(): { googleKey: string } {
  const contact = serverEnv.openLibraryContact();
  if (configuredFor !== contact) {
    configureCatalog({
      userAgent: contact ? `MyReadingRoom (${contact})` : "MyReadingRoom",
      // Open Library allows 3 req/s for identified clients and 1 req/s otherwise.
      minIntervalMs: contact ? 350 : 1050,
      cacheTtlMs: 6 * 60 * 60 * 1000,
    });
    configuredFor = contact;
  }
  return { googleKey: serverEnv.googleBooksApiKey() ?? "" };
}

/** Test helper: forget the server configuration and clear the catalog cache. */
export function resetCatalogServer(): void {
  configuredFor = undefined;
  configureCatalog(null);
}
