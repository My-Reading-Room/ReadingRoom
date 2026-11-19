import { createBrowserClient } from "@supabase/ssr";

import { supabasePublishableKey, supabaseUrl } from "./env";

/**
 * Supabase client for Client Components. createBrowserClient returns a
 * singleton in the browser, so calling this repeatedly is cheap.
 * Prefer the useSupabase() hook inside components.
 */
export function createClient() {
  return createBrowserClient(supabaseUrl, supabasePublishableKey);
}
