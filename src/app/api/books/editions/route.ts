import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getEditions } from "@/lib/catalog";
import { guardApiRequest, jsonError } from "@/utils/api/route";
import { catalogServer } from "@/utils/catalog-server";

const params = z.object({
  // Only Open Library work keys, so the path we request can't be steered elsewhere.
  work: z.string().regex(/^\/works\/OL\d{1,12}W$/),
  title: z.string().trim().max(300).default(""),
  author: z.string().trim().max(300).default(""),
});

/** GET /api/books/editions?work=/works/OL…W&title=…&author=… : editions of an Open Library work. */
export async function GET(request: NextRequest) {
  const guard = await guardApiRequest({ bucket: "books-editions", limit: 30, windowMs: 60_000 });
  if ("response" in guard) return guard.response;

  const parsed = params.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success)
    return jsonError(400, "invalid_parameters", "Choose a valid Open Library work.");

  catalogServer();
  try {
    const { work, title, author } = parsed.data;
    const editions = await getEditions({ kind: "work", key: work, title, author });
    return NextResponse.json({ editions });
  } catch {
    return jsonError(502, "catalog_unavailable", "The book catalog is temporarily unavailable.");
  }
}
