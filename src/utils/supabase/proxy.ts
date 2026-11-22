import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import type { Database } from "@/types/database";

import { supabasePublishableKey, supabaseUrl } from "./env";

/** Routes reachable without a session. Everything else requires sign-in. */
const PUBLIC_PATHS = ["/login", "/signup", "/auth/"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) =>
    path.endsWith("/") ? pathname.startsWith(path) : pathname === path,
  );
}

/**
 * Refreshes the Supabase session cookie on every request and redirects
 * signed-out visitors to /login. Called from src/proxy.ts.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        // Cache-Control/Expires/Pragma from @supabase/ssr: a response that sets
        // auth cookies must never be cached by a CDN and served to someone else.
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Do not run code between createServerClient and getClaims(); it is what
  // refreshes an expired access token and writes the new cookies above.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const { pathname } = request.nextUrl;

  if (!signedIn && pathname.startsWith("/api/")) {
    // APIs answer with a status code, not an HTML redirect to the sign-in page.
    return NextResponse.json(
      { code: "unauthorized", message: "Sign in to use this API." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!signedIn && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return redirect(url, response);
  }

  if (signedIn && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return redirect(url, response);
  }

  if (signedIn) {
    // Pages with private data must not be stored by the browser or any proxy,
    // so Back after logout cannot show them (#18).
    response.headers.set("Cache-Control", "private, no-store");
  }

  return response;
}

const CACHE_HEADERS = ["cache-control", "expires", "pragma"];

/** Redirect while keeping any refreshed auth cookies and their cache headers. */
function redirect(url: URL, from: NextResponse) {
  const response = NextResponse.redirect(url);
  from.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  CACHE_HEADERS.forEach((key) => {
    const value = from.headers.get(key);
    if (value) response.headers.set(key, value);
  });
  return response;
}
