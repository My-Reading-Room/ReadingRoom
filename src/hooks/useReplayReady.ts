"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

import type { ReplayKind, ReplayPeriod } from "@/lib/reading-replay";
import { latestUnseenReplays, markReplaySeen, type ReplayStorage } from "@/lib/replay-ready";
import type { IsoDate } from "@/lib/types";

function deviceStorage(): ReplayStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null; // blocked storage: every recap simply counts as unseen
  }
}

const listeners = new Set<() => void>();
let version = 0;
const bump = () => {
  version++;
  listeners.forEach((l) => l());
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  window.addEventListener("storage", bump);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener("storage", bump);
  };
};

/**
 * Recently completed recap periods this reader hasn't opened or dismissed on
 * this device (legacy refreshReplayReady). The "seen" markers live in local
 * storage per reader, are never sent anywhere, and are cleared on logout.
 * Nothing shows during server render, so markup always hydrates cleanly.
 */
export function useReplayReady(
  ownerId: string,
  today: IsoDate,
  hasData: (kind: ReplayKind, period: ReplayPeriod) => boolean,
) {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => version,
    () => -1,
  );
  const items = useMemo(
    () =>
      snapshot < 0
        ? []
        : latestUnseenReplays({ ownerId, today, storage: deviceStorage(), hasData }),
    [snapshot, ownerId, today, hasData],
  );
  const markSeen = useCallback(
    (list: { kind: ReplayKind; period: ReplayPeriod }[]) => {
      for (const item of list)
        markReplaySeen({
          ownerId,
          kind: item.kind,
          end: item.period.end,
          storage: deviceStorage(),
        });
      bump();
    },
    [ownerId],
  );
  return { items, markSeen };
}
