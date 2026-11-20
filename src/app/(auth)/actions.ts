"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { safeRedirectPath } from "@/utils/safe-redirect";
import { siteUrl } from "@/utils/supabase/env";
import { createClient } from "@/utils/supabase/server";

export type AuthFormState = {
  error?: string;
  message?: string;
  /** Non-secret values to refill after a failed submit (never passwords). */
  values?: Record<string, string>;
};

function keep(formData: FormData, ...names: string[]): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, String(formData.get(name) ?? "")]));
}

const signInSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(256),
  next: z.string().optional(),
});

const signUpSchema = z.object({
  displayName: z.string().trim().min(1, "Enter a display name.").max(60),
  email: z.email("Enter a valid email address.").max(320),
  password: z
    .string()
    .min(8, "Use at least 8 characters.")
    .max(256, "Use at most 256 characters."),
});

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Enter your email and password.", values: keep(formData, "email") };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  // Same message for unknown email and wrong password, so the form can't be
  // used to discover which addresses have accounts.
  if (error) {
    return {
      error: "Incorrect email or password, or the email isn't confirmed yet.",
      values: keep(formData, "email"),
    };
  }

  redirect(safeRedirectPath(parsed.data.next));
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Check the form.",
      values: keep(formData, "displayName", "email"),
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: `${siteUrl}/auth/confirm`,
    },
  });

  if (error) {
    return {
      error: "Could not create the account. Try again in a moment.",
      values: keep(formData, "displayName", "email"),
    };
  }
  if (data.session) redirect("/");

  return { message: "Check your email for a link to confirm your account." };
}
