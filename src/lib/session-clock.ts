/** Optional reading stopwatch. Timestamp-based duration, never timer ticks. */
export function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

type ClockData = {
  accumulatedMs: number;
  startedAtMs: number | null;
  firstStartedAtMs: number | null;
  running: boolean;
};

/** The subset of the Web Storage API the clock needs (localStorage in the browser). */
export type ClockStorage = Pick<Storage, "getItem" | "setItem">;

const fresh = (): ClockData => ({
  accumulatedMs: 0,
  startedAtMs: null,
  firstStartedAtMs: null,
  running: false,
});

export class ReadingClock {
  private owner: string | null = null;
  private data: ClockData = fresh();

  constructor(
    private readonly storage: ClockStorage | null = null,
    private readonly prefix = "my-reading-room-stopwatch-v1.3:",
  ) {}

  key(): string | null {
    return this.owner ? this.prefix + this.owner : null;
  }

  save(): void {
    const key = this.key();
    if (!key || !this.storage) return;
    try {
      this.storage.setItem(key, JSON.stringify(this.data));
    } catch {
      // storage unavailable
    }
  }

  setOwner(id: string | number | null | undefined): void {
    const owner = id ? String(id) : null;
    if (this.owner === owner) return;
    this.owner = owner;
    this.data = fresh();
    const key = this.key();
    if (!key || !this.storage) return;
    try {
      const row = JSON.parse(this.storage.getItem(key) as string);
      if (
        row &&
        Number.isFinite(row.accumulatedMs) &&
        row.accumulatedMs >= 0 &&
        typeof row.running === "boolean" &&
        (!row.running || (Number.isFinite(row.startedAtMs) && row.startedAtMs > 0))
      ) {
        this.data = {
          accumulatedMs: row.accumulatedMs,
          startedAtMs: row.running ? row.startedAtMs : null,
          firstStartedAtMs: Number.isFinite(row.firstStartedAtMs) ? row.firstStartedAtMs : null,
          running: row.running,
        };
      }
    } catch {
      // invalid saved draft
    }
  }

  get running(): boolean {
    return this.data.running;
  }

  get firstStartedAtMs(): number | null {
    return this.data.firstStartedAtMs;
  }

  elapsedMs(now = Date.now()): number {
    return (
      this.data.accumulatedMs +
      (this.data.running ? Math.max(0, now - (this.data.startedAtMs as number)) : 0)
    );
  }

  display(now = Date.now()): string {
    return formatClock(this.elapsedMs(now));
  }

  elapsedMinutes(now = Date.now()): number {
    const ms = this.elapsedMs(now);
    return ms > 0 ? Math.ceil(ms / 60000) : 0;
  }

  start(now = Date.now()): boolean {
    if (this.data.running) return false;
    if (!this.data.accumulatedMs && !this.data.firstStartedAtMs) this.data.firstStartedAtMs = now;
    this.data.startedAtMs = now;
    this.data.running = true;
    this.save();
    return true;
  }

  pause(now = Date.now()): boolean {
    if (!this.data.running) return false;
    this.data.accumulatedMs = this.elapsedMs(now);
    this.data.startedAtMs = null;
    this.data.running = false;
    this.save();
    return true;
  }

  reset(): void {
    this.data = fresh();
    this.save();
  }
}
