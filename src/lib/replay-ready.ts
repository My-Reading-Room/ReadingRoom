/** Celebration availability for recently completed periods, per owner/device.
 * Only completed periods with recorded activity are eligible. There is no server
 * polling, new data table, push notification permission, or shared-profile leak.
 */
import { replayPeriod, type ReplayKind, type ReplayPeriod } from "./reading-replay";
import type { IsoDate } from "./types";

export const REPLAY_KINDS: ReplayKind[] = ["week", "month", "year"];
const RECENT_DAYS: Record<ReplayKind, number> = { week: 14, month: 40, year: 90 };
const asDay = (day: IsoDate) => new Date(`${day}T12:00:00Z`).getTime();

/** The subset of the Web Storage API used to remember seen recaps. */
export type ReplayStorage = Pick<Storage, "getItem" | "setItem">;

export function replaySeenKey(ownerId: unknown, kind: unknown, end: unknown): string {
  if (
    !ownerId ||
    !REPLAY_KINDS.includes(kind as ReplayKind) ||
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(end as string)
  ) {
    throw new RangeError("Invalid replay marker");
  }
  return `reading-room-replay-seen-v1:${encodeURIComponent(String(ownerId))}:${kind}:${end}`;
}

export function latestUnseenReplays({
  ownerId,
  today,
  storage,
  hasData = () => true,
}: {
  ownerId?: string | null;
  today?: IsoDate;
  storage?: ReplayStorage | null;
  hasData?: (kind: ReplayKind, period: ReplayPeriod) => boolean;
} = {}) {
  if (!ownerId) return [];
  const results: { kind: ReplayKind; period: ReplayPeriod; key: string }[] = [];
  for (const kind of REPLAY_KINDS) {
    const period = replayPeriod(kind, today);
    const age = Math.round((asDay(today as IsoDate) - asDay(period.end)) / 86400000);
    if (age < 1 || age > RECENT_DAYS[kind]) continue;
    const key = replaySeenKey(ownerId, kind, period.end);
    let seen = false;
    try {
      seen = storage?.getItem(key) === "seen";
    } catch {
      // private-mode storage
    }
    if (!seen && hasData(kind, period)) results.push({ kind, period, key });
  }
  return results;
}

export function markReplaySeen({
  ownerId,
  kind,
  end,
  storage,
}: {
  ownerId?: string | null;
  kind?: ReplayKind;
  end?: IsoDate;
  storage?: ReplayStorage | null;
} = {}): boolean {
  const key = replaySeenKey(ownerId, kind, end);
  try {
    storage?.setItem(key, "seen");
    return true;
  } catch {
    return false;
  }
}
