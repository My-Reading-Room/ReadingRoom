"use client";

import { useMemo, useSyncExternalStore } from "react";

import { ReadingClock, type ClockStorage } from "@/lib/session-clock";

function deviceStorage(): ClockStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null; // private mode / blocked storage: the clock still works, unsaved
  }
}

/** Snapshot: the moment the clock was last read; changes on actions and each running second. */
type ClockSnapshot = { now: number };
const SERVER_SNAPSHOT: ClockSnapshot = { now: -1 };

/** The stopwatch as an external store, so rendering stays pure (no Date.now in render). */
function createClockStore(userId: string) {
  const clock = new ReadingClock(deviceStorage());
  clock.setOwner(userId);
  let snapshot: ClockSnapshot = { now: Date.now() };
  let timer: ReturnType<typeof setInterval> | undefined;
  const listeners = new Set<() => void>();
  const emit = () => {
    snapshot = { now: Date.now() };
    listeners.forEach((listener) => listener());
  };
  return {
    clock,
    emit,
    subscribe(listener: () => void) {
      listeners.add(listener);
      timer ??= setInterval(() => clock.running && emit(), 1000);
      queueMicrotask(emit); // pick up a stopwatch saved on this device
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          clearInterval(timer);
          timer = undefined;
        }
      };
    },
    getSnapshot: () => snapshot,
    /** Server render and hydration show a fresh stopwatch; the saved one follows. */
    getServerSnapshot: () => SERVER_SNAPSHOT,
  };
}

/**
 * Optional reading stopwatch. Elapsed time comes from timestamps, so it stays
 * right if the tab sleeps; the draft is kept per reader on this device and is
 * cleared on logout (useSignOut clears local storage).
 */
export function useReadingClock(userId: string) {
  const store = useMemo(() => createClockStore(userId), [userId]);
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  const { clock, emit } = store;
  const live = snapshot !== SERVER_SNAPSHOT;
  const { now } = snapshot;
  const elapsed = live ? clock.elapsedMs(now) : 0;
  // Stable per reader, so callers can use them in effect dependencies.
  const actions = useMemo(
    () => ({
      toggle: () => {
        if (clock.running) clock.pause();
        else clock.start();
        emit();
      },
      /** Pause and return whole minutes (rounded up), for the minutes field. */
      stopAndUse: () => {
        clock.pause();
        const minutes = clock.elapsedMinutes();
        emit();
        return minutes;
      },
      reset: () => {
        clock.reset();
        emit();
      },
    }),
    [clock, emit],
  );

  return {
    running: live && clock.running,
    display: live ? clock.display(now) : "00:00:00",
    hasTime: elapsed > 0,
    firstStartedAtMs: live ? clock.firstStartedAtMs : null,
    ...actions,
  };
}
