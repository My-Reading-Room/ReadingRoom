"use client";

import { useSyncExternalStore } from "react";

import { localDate } from "@/lib/local-date";

const subscribe = () => () => {};

/**
 * Today's date in the reader's own time zone (YYYY-MM-DD). Empty during
 * server rendering; forms send it so the server can use the reader's date.
 */
export function useLocalToday(): string {
  return useSyncExternalStore(
    subscribe,
    () => localDate(),
    () => "",
  );
}
