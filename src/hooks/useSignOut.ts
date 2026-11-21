"use client";

import { useCallback, useTransition } from "react";

import { signOut } from "@/app/(app)/actions";

/**
 * Signs out, wipes anything this app stored on the device, then does a full
 * page load of /login. The hard navigation matters: Next.js keeps recently
 * visited routes mounted in the background, so a client-side redirect could
 * leave the previous user's pages in memory.
 */
export function useSignOut() {
  const [pending, startTransition] = useTransition();

  const run = useCallback(() => {
    startTransition(async () => {
      try {
        await signOut();
      } finally {
        await clearDeviceData();
        window.location.replace("/login");
      }
    });
  }, []);

  return { signOut: run, pending };
}

async function clearDeviceData() {
  try {
    window.localStorage.clear();
    window.sessionStorage.clear();
  } catch {
    // Storage can be unavailable (private mode, blocked site data).
  }

  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }

  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((r) => r.unregister()));
  }
}
