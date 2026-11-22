import "server-only";

import { DEFAULT_SHELF_PREFS, type ShelfPrefs } from "@/lib/shelf";
import { requireUser } from "@/utils/supabase/server";

import { getLibrary } from "./library";

/** Books plus the owner's shelf style (defaults when none saved yet). */
export async function getShelfData(ownerId?: string) {
  const { supabase, claims } = await requireUser();
  const owner = ownerId ?? claims.sub;
  const [{ books, editable }, { data: prefs }] = await Promise.all([
    getLibrary(owner),
    supabase
      .from("shelf_settings")
      .select("finish,display_mode,decor")
      .eq("user_id", owner)
      .maybeSingle(),
  ]);
  return { books, editable, prefs: (prefs ?? DEFAULT_SHELF_PREFS) as ShelfPrefs };
}
