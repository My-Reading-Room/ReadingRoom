"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { rateLimit } from "@/utils/api/rate-limit";
import { clientToday } from "@/utils/client-date";
import { requireUser } from "@/utils/supabase/server";

export type SettingsState = { error?: string; message?: string; code?: string };

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function saveProfile(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const name = String(formData.get("display_name") ?? "").trim();
  if (!name || name.length > 80)
    return { error: "Please enter a display name under 80 characters." };
  const { supabase, claims } = await requireUser();
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: name })
    .eq("id", claims.sub);
  if (error) return { error: "Could not save your display name." };
  revalidatePath("/", "layout");
  return { message: "Display name updated." };
}

export async function saveTrackingStart(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const value = String(formData.get("tracking_start_date") ?? "");
  const today = clientToday(formData.get("today"));
  const valid =
    ISO.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!valid || value > today)
    return { error: "Choose a valid tracking start date on or before today." };
  const minutes = Number(formData.get("tracking_start_goal_minutes"));
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
    return { error: "Starting daily goal must be 1–1,440 whole minutes." };
  }
  const { supabase, claims } = await requireUser();
  const { error } = await supabase
    .from("profiles")
    .update({ tracking_start_date: value, tracking_start_goal_minutes: minutes })
    .eq("id", claims.sub);
  if (error) return { error: "Could not save the tracking start date." };
  revalidatePath("/", "layout");
  return {
    message:
      "Tracking date and starting daily goal saved. Existing sessions and later goal changes remain unchanged.",
  };
}

const level = z.enum(["full", "summary"]);

export async function createInvite(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const parsed = level.safeParse(formData.get("level"));
  if (!parsed.success) return { error: "Choose a valid share level." };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("create_profile_share_invite", {
    p_level: parsed.data,
  });
  if (error || !data) return { error: "Could not create an invitation." };
  return { message: "One-use sharing code generated. It is valid for 7 days.", code: data };
}

/**
 * Redeem someone's invite code. Rate-limited per reader (#7) so codes can't be
 * guessed by brute force; the database also rejects expired and used codes.
 */
export async function redeemInvite(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const code = String(formData.get("code") ?? "").trim();
  if (!code || code.length > 64) return { error: "Enter a share code." };
  const { supabase, claims } = await requireUser();
  const limited = rateLimit(`redeem-invite:${claims.sub}`, { limit: 10, windowMs: 15 * 60_000 });
  if (!limited.ok)
    return {
      error: `Too many attempts. Try again in ${Math.ceil(limited.retryAfterSeconds / 60)} minutes.`,
    };
  const { error } = await supabase.rpc("redeem_profile_share_invite", { p_code: code });
  if (error) return { error: error.message || "That code didn't work." };
  revalidatePath("/settings");
  return { message: "Shared profile linked. If you want mutual access, invite them back." };
}

export async function setShareLevel(viewerId: string, value: string): Promise<SettingsState> {
  const viewer = z.guid().safeParse(viewerId);
  const parsed = z.enum(["full", "summary", "none"]).safeParse(value);
  if (!viewer.success || !parsed.success) return { error: "Choose a valid access level." };
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("set_profile_share_level", {
    p_viewer: viewer.data,
    p_level: parsed.data,
  });
  if (error) return { error: "Could not change access." };
  revalidatePath("/settings");
  return { message: parsed.data === "none" ? "Access revoked." : "Access level updated." };
}
