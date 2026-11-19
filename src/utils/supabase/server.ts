import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import type { Database } from "@/types/database";

import { supabasePublishableKey, supabaseUrl } from "./env";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Create a new client per request; never cache or share one between users.
 */
export async function createClient() {
  // Per-user data is never prerendered. Also needed because auth checks read
  // Date.now(), which Cache Components rejects in its runtime prefetch pass.
  await connection();
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, which cannot set cookies.
          // Safe to ignore: src/proxy.ts refreshes the session on every request.
        }
      },
    },
  });
}

/**
 * Returns the verified JWT claims of the signed-in user, or redirects to /login.
 *
 * getClaims() verifies the token signature; never use getSession() to make
 * authorization decisions on the server, because it trusts the cookie as-is.
 */
export async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/login");
  }

  return { supabase, claims: data.claims };
}
