import "server-only";

import { requireUser } from "@/utils/supabase/server";

export type ShareRow = { owner_id: string; viewer_id: string; access_level: string };

/** The signed-in reader's profile plus shares in both directions, with names. */
export async function getSettingsData() {
  const { supabase, claims } = await requireUser();
  const me = claims.sub;
  const [{ data: profile }, { data: shares }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,display_name,tracking_start_date,tracking_start_goal_minutes")
      .eq("id", me)
      .single(),
    supabase
      .from("profile_shares")
      .select("owner_id,viewer_id,access_level")
      .or(`owner_id.eq.${me},viewer_id.eq.${me}`),
  ]);
  const others = [
    ...new Set((shares ?? []).flatMap((s) => [s.owner_id, s.viewer_id]).filter((id) => id !== me)),
  ];
  // RLS lets you see the names of people you share with in either direction.
  const { data: people } = others.length
    ? await supabase.from("profiles").select("id,display_name").in("id", others)
    : { data: [] };
  const names = new Map((people ?? []).map((p) => [p.id, p.display_name]));
  const nameOf = (id: string) => {
    const name = names.get(id);
    return !name || name === "Reader" ? `Reader ${id.slice(0, 8)}` : name;
  };
  return {
    email: typeof claims.email === "string" ? claims.email : "",
    profile: profile!,
    outgoing: (shares ?? [])
      .filter((s) => s.owner_id === me)
      .map((s) => ({ ...s, name: nameOf(s.viewer_id) })),
    incoming: (shares ?? [])
      .filter((s) => s.viewer_id === me)
      .map((s) => ({ ...s, name: nameOf(s.owner_id) })),
  };
}
