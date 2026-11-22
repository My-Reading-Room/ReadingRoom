"use client";

import Link from "next/link";
import { useCallback } from "react";

import type { InsightsData } from "@/data/insights";
import { useReplayReady } from "@/hooks/useReplayReady";
import type { ReplayKind } from "@/lib/reading-replay";
import type { IsoDate } from "@/lib/types";

import { replayModel } from "../recaps/ReplayView";

const NAMES: Record<ReplayKind, string> = { week: "Weekly", month: "Monthly", year: "Annual" };

/** "Your Reading Replay is ready" for recently completed periods with activity (owner only). */
export function ReplayReadyBanner({
  data,
  today,
  ownerId,
}: {
  data: InsightsData;
  today: IsoDate;
  ownerId: string;
}) {
  const hasData = useCallback(
    (kind: ReplayKind) => replayModel(data, today, kind, 0).hasAnyData,
    [data, today],
  );
  const { items, markSeen } = useReplayReady(ownerId, today, hasData);
  if (!items.length) return null;
  return (
    <aside className="replay-ready-banner" aria-label="New completed reading recaps" role="status">
      <div className="replay-ready-stars" aria-hidden="true">
        ✦ ✨ ✦
      </div>
      <div className="replay-ready-content">
        <div className="eyebrow">Your Reading Replay is ready</div>
        <h2>{items.length === 1 ? "A new recap is ready!" : "Your new recaps are ready!"}</h2>
        <p>
          Celebrate the chapters you completed. These are finished periods — live progress stays in
          Insights.
        </p>
        <div className="replay-ready-actions">
          {items.map((item) => (
            <Link
              key={item.key}
              className="btn primary"
              href={`/recaps?kind=${item.kind}&end=${item.period.end}`}
              onClick={() => markSeen([item])}
            >
              {NAMES[item.kind]}: {item.period.label} →
            </Link>
          ))}
          <button className="btn" type="button" onClick={() => markSeen(items)}>
            Not now
          </button>
        </div>
      </div>
    </aside>
  );
}
