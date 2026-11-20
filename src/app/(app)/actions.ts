"use server";

import { createClient } from "@/utils/supabase/server";

/**
 * Ends this device's session and clears the auth cookies in the response.
 * scope "local" leaves the user's other devices signed in; "log out
 * everywhere" (scope "global") is tracked in #18.
 */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
}
