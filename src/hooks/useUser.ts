"use client";

import type { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

import { useSupabase } from "./useSupabase";

type UseUserResult = { user: User | null; loading: boolean };

/**
 * Current user for display purposes in Client Components, kept in sync with
 * sign-in/sign-out in other tabs. Not an authorization check: the server
 * (requireUser / RLS) is the only source of truth for access.
 */
export function useUser(): UseUserResult {
  const supabase = useSupabase();
  const [state, setState] = useState<UseUserResult>({ user: null, loading: true });

  useEffect(() => {
    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (active) setState({ user: data.user, loading: false });
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setState({ user: session?.user ?? null, loading: false });
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  return state;
}
