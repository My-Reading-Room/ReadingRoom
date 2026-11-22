// Server proxy for List Of Books series lookups: the third-party API key stays
// on the server. Ported from legacy/api/series-lookup.js, now sign-in only and
// rate limited per user (the legacy endpoint was open to anyone).
// The free List Of Books plan requires a visible source link for each result.
import { type NextRequest, NextResponse } from "next/server";

import { guardApiRequest, jsonError } from "@/utils/api/route";
import { allowed, clean, safeResult } from "@/utils/series-lookup";
import { serverEnv } from "@/utils/server-env";

const API = "https://www.listofbooks.net/api/public/v1";

/** GET /api/series-lookup?mode=status|series|book&series=…&title=…&author=… */
export async function GET(request: NextRequest) {
  // The provider's free plan is small; the legacy client paced lookups ~6.5 s apart.
  const guard = await guardApiRequest({ bucket: "series-lookup", limit: 10, windowMs: 60_000 });
  if ("response" in guard) return guard.response;

  const query = request.nextUrl.searchParams;
  const mode = clean(query.get("mode"));
  const key = serverEnv.listOfBooksApiKey();
  if (mode === "status") return NextResponse.json({ configured: Boolean(key) });
  if (!["book", "series"].includes(mode))
    return jsonError(400, "invalid_parameters", "Invalid lookup mode");
  if (!key) return jsonError(503, "not_configured", "Series catalog lookup is not configured.");

  const series = clean(query.get("series")),
    title = clean(query.get("title")),
    author = clean(query.get("author"));
  if (
    mode === "series" ? !allowed(series) || series.length < 3 : !allowed(title) || !allowed(author)
  ) {
    return jsonError(
      400,
      "invalid_parameters",
      "Enter a valid series name, or a book title and author.",
    );
  }
  const path = mode === "series" ? "get-reading-order" : "find-series-for-book";
  const params = new URLSearchParams(mode === "series" ? { series } : { title, author });

  let response: Response;
  try {
    response = await fetch(`${API}/${path}?${params}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(8500),
    });
  } catch {
    return jsonError(503, "provider_unavailable", "Series catalog is temporarily unavailable.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code: string = data?.error?.code || "provider_error";
    const message =
      code === "rate_limited" || code === "page_limit_reached"
        ? "Series lookup limit reached. Try again later."
        : "Series catalog lookup failed.";
    return jsonError(response.status === 429 ? 429 : 503, code, message);
  }
  const results = Array.isArray(data.results) ? data.results : [];
  return NextResponse.json({
    result: safeResult(results[0]),
    source: "List Of Books",
    withheld: Number(data.withheld) || 0,
  });
}
