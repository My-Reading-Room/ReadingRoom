import type { Metadata } from "next";

import { getInsightsData } from "@/data/insights";
import { replayOffsetForEnd } from "@/lib/reading-replay";
import { localToday } from "@/utils/local-today";

import { ReplayView } from "./ReplayView";

export const metadata: Metadata = { title: "Reading Replay" };

const KINDS = ["week", "month", "year"] as const;

/** ?kind=week|month|year&end=YYYY-MM-DD opens a specific completed period (from the "replay ready" banner). */
export default async function RecapsPage({ searchParams }: PageProps<"/recaps">) {
  const [data, today, params] = await Promise.all([getInsightsData(), localToday(), searchParams]);
  const kind = KINDS.find((k) => k === params.kind) ?? "week";
  const end =
    typeof params.end === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.end) ? params.end : null;
  const found = end ? replayOffsetForEnd(kind, today, end) : null;
  const offset = found == null ? 0 : Math.max(-300, Math.min(0, found));
  return (
    <ReplayView
      key={`${kind}-${offset}`}
      data={data}
      today={today}
      initialKind={kind}
      initialOffset={offset}
    />
  );
}
