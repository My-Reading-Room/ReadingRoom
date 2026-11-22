import { NextResponse, type NextRequest } from "next/server";

import { isValidISBN, normalizeISBN } from "@/lib/book-detail-metadata";
import { lookupISBNMetadata } from "@/lib/catalog";
import { guardApiRequest, jsonError } from "@/utils/api/route";
import { catalogServer } from "@/utils/catalog-server";

/** GET /api/books/isbn/:isbn : exact edition lookup; never a fuzzy match. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/books/isbn/[isbn]">) {
  const guard = await guardApiRequest({ bucket: "books-isbn", limit: 60, windowMs: 60_000 });
  if ("response" in guard) return guard.response;

  const isbn = normalizeISBN((await ctx.params).isbn);
  if (!isValidISBN(isbn))
    return jsonError(400, "invalid_isbn", "Enter a valid ISBN-10 or ISBN-13.");

  const result = await lookupISBNMetadata(isbn, catalogServer().googleKey);
  if (!result) return jsonError(404, "not_found", "No edition was found for this ISBN.");
  return NextResponse.json({ result });
}
