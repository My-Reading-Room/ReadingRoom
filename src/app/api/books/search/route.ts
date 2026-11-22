import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { searchCatalog } from "@/lib/catalog";
import { guardApiRequest, jsonError } from "@/utils/api/route";
import { catalogServer } from "@/utils/catalog-server";

const query = z.string().trim().min(1).max(200);

/** GET /api/books/search?q=… : Open Library search with a server-held Google Books fallback. */
export async function GET(request: NextRequest) {
  const guard = await guardApiRequest({ bucket: "books-search", limit: 60, windowMs: 60_000 });
  if ("response" in guard) return guard.response;

  const q = query.safeParse(request.nextUrl.searchParams.get("q"));
  if (!q.success) return jsonError(400, "invalid_parameters", "Enter 1–200 characters to search.");

  try {
    const results = await searchCatalog(q.data, catalogServer().googleKey);
    return NextResponse.json({ results });
  } catch {
    return jsonError(502, "catalog_unavailable", "The book catalog is temporarily unavailable.");
  }
}
