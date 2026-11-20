import type { NextRequest } from "next/server";

import { buildCsp, createNonce, cspHeaderName } from "@/utils/security/csp";
import { updateSession } from "@/utils/supabase/proxy";

export async function proxy(request: NextRequest) {
  // Next.js reads the nonce from the request's CSP header while rendering and
  // stamps it on its own <script>/<style> tags, so set it before building the
  // response (updateSession forwards these request headers).
  const nonce = createNonce();
  const csp = buildCsp(nonce);
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", csp);

  const response = await updateSession(request);
  response.headers.set(cspHeaderName(), csp);
  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and image optimization.
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|icon-192.png|icon-512.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
