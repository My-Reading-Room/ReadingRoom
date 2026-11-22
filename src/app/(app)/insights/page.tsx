import type { Metadata } from "next";

import { getInsightsData } from "@/data/insights";
import { localToday } from "@/utils/local-today";

import { InsightsView } from "./InsightsView";
import { ReplayReadyBanner } from "./ReplayReadyBanner";

export const metadata: Metadata = { title: "Insights" };

export default async function InsightsPage() {
  const [data, today] = await Promise.all([getInsightsData(), localToday()]);
  return (
    <>
      {data.editable && <ReplayReadyBanner data={data} today={today} ownerId={data.ownerId} />}
      <div className="eyebrow">Your reading patterns</div>
      <h1 className="heading">Reading Insights</h1>
      <p className="subtitle">Your reading at a glance, or in full detail.</p>
      <InsightsView data={data} today={today} />
    </>
  );
}
