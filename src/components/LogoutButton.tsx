"use client";

import { useSignOut } from "@/hooks/useSignOut";

export function LogoutButton() {
  const { signOut, pending } = useSignOut();

  return (
    <button type="button" className="btn sm" onClick={signOut} disabled={pending}>
      {pending ? "Logging out…" : "Log out"}
    </button>
  );
}
