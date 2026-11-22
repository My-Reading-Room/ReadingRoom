"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js in production builds only: in development it would cache
 * hot-reloaded assets. See public/sw.js for what is (and isn't) cached.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Installation is optional; the app works without it.
    });
  }, []);
  return null;
}
