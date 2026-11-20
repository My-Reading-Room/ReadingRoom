"use client";

import { useMemo } from "react";

import { createClient } from "@/utils/supabase/client";

/** Browser Supabase client for Client Components. */
export function useSupabase() {
  return useMemo(() => createClient(), []);
}
