import "server-only";

import { NextResponse } from "next/server";

import { createClient } from "@/utils/supabase/server";

import { rateLimit } from "./rate-limit";

export function jsonError(status: number, code: string, message: string, headers?: HeadersInit) {
  return NextResponse.json({ code, message }, { status, headers });
}

type Guard = { limit: number; windowMs: number; bucket: string };

/**
 * Shared guard for API routes: a verified signed-in user (getClaims checks the
 * JWT signature; the proxy also rejects signed-out /api calls) plus a per-user
 * rate limit. Returns the user id, or the error response to send.
 */
export async function guardApiRequest({
  limit,
  windowMs,
  bucket,
}: Guard): Promise<{ userId: string } | { response: NextResponse }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return { response: jsonError(401, "unauthorized", "Sign in to use this API.") };
  const limited = rateLimit(`${bucket}:${userId}`, { limit, windowMs });
  if (!limited.ok) {
    return {
      response: jsonError(429, "rate_limited", "Too many requests. Try again shortly.", {
        "Retry-After": String(limited.retryAfterSeconds),
      }),
    };
  }
  return { userId };
}
