"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { planShelfMove, SHELF_DECOR, SHELF_DISPLAY_MODES, SHELF_FINISHES } from "@/lib/shelf";
import { requireUser } from "@/utils/supabase/server";

export type ShelfResult = { error?: string; message?: string };

/**
 * Put one of the reader's books where another one is. Positions are worked
 * out on the server from the reader's own rows, so the browser only names
 * two book ids; both must belong to the reader.
 */
export async function moveShelfBook(fromId: string, toId: string): Promise<ShelfResult> {
  const ids = z.array(z.guid()).length(2).safeParse([fromId, toId]);
  if (!ids.success) return { error: "Choose a book to move." };
  const { supabase, claims } = await requireUser();
  const { data: books, error } = await supabase
    .from("user_books")
    .select("id,title,status,favorite,shelf_order,page_count")
    .eq("user_id", claims.sub);
  if (error || !books) return { error: "Could not load your shelf." };
  const changes = planShelfMove(books, fromId, toId);
  if (!changes.length) return {};
  const results = await Promise.all(
    changes.map((c) =>
      supabase
        .from("user_books")
        .update({ shelf_order: c.shelf_order })
        .eq("id", c.id)
        .eq("user_id", claims.sub),
    ),
  );
  if (results.some((r) => r.error)) return { error: "Could not save the new shelf order." };
  revalidatePath("/shelf");
  revalidatePath("/library");
  return { message: "Bookshelf order saved." };
}

const prefsSchema = z.object({
  finish: z.enum(SHELF_FINISHES),
  display_mode: z.enum(SHELF_DISPLAY_MODES),
  decor: z.enum(SHELF_DECOR),
});

export async function saveShelfPrefs(prefs: unknown): Promise<ShelfResult> {
  const parsed = prefsSchema.safeParse(prefs);
  if (!parsed.success) return { error: "Choose a valid bookshelf style." };
  const { supabase, claims } = await requireUser();
  const { error } = await supabase
    .from("shelf_settings")
    .upsert(
      { user_id: claims.sub, ...parsed.data, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) return { error: "Could not save the bookshelf style." };
  revalidatePath("/shelf");
  return { message: "Bookshelf style saved." };
}
