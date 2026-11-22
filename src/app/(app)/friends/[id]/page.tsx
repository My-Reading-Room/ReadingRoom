import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { getInsightsData } from "@/data/insights";
import { getShelfData } from "@/data/shelf";
import { formatTime } from "@/lib/insights-period";
import { localToday } from "@/utils/local-today";
import { requireUser } from "@/utils/supabase/server";

import { InsightsView } from "../../insights/InsightsView";
import { LibraryView } from "../../library/LibraryView";
import { ReplayView } from "../../recaps/ReplayView";
import { ShelfView } from "../../shelf/ShelfView";

export const metadata: Metadata = { title: "Shared profile" };

const TABS = [
  ["insights", "Insights"],
  ["replay", "Replay"],
  ["library", "Library"],
  ["shelf", "Bookshelf"],
] as const;
const MODES = {
  reading: "Reading only",
  audiobook: "Audiobook only",
  read_listen: "Read + Listen",
} as const;

/**
 * Someone who shared their profile with you (legacy profile picker), read-only.
 * Summary-only shares show whitelisted yearly aggregates and nothing else;
 * Full shares reuse Insights, Replay, Library and Bookshelf without editing.
 */
export default async function FriendProfilePage({
  params,
  searchParams,
}: PageProps<"/friends/[id]">) {
  const parsed = z.guid().safeParse((await params).id);
  if (!parsed.success) notFound();
  const ownerId = parsed.data;
  const { supabase, claims } = await requireUser();
  if (ownerId === claims.sub) redirect("/insights");

  const [{ data: share }, { data: profile }] = await Promise.all([
    supabase
      .from("profile_shares")
      .select("access_level")
      .eq("owner_id", ownerId)
      .eq("viewer_id", claims.sub)
      .maybeSingle(),
    supabase.from("profiles").select("display_name").eq("id", ownerId).maybeSingle(),
  ]);
  // Not shared with you looks the same as not existing.
  if (!share || !["full", "summary"].includes(share.access_level)) notFound();
  const name = profile?.display_name || "Reader";
  const today = await localToday();

  if (share.access_level === "summary") {
    const year = Number(today.slice(0, 4));
    const { data } = await supabase.rpc("get_viewable_profile_summaries", { p_year: year });
    const r = (data ?? []).find((s) => s.owner_id === ownerId);
    if (!r) {
      return (
        <div className="card">
          <h1 className="heading">{name}&apos;s profile</h1>
          <p className="notice warn">
            Summary-only access is enabled, but the summary is not available right now.
          </p>
        </div>
      );
    }
    const goal = Number(r.annual_goal || 12),
      done = Number(r.books_finished || 0);
    return (
      <>
        <div className="eyebrow">Shared profile · Summary only</div>
        <h1 className="heading">{name}&apos;s reading year</h1>
        <p className="subtitle">
          {r.year || year} highlights. {name} shares only high-level statistics with you.
        </p>
        <div className="kpis">
          {(
            [
              [done, "Books completed"],
              [goal, "Annual books goal"],
              [formatTime(r.total_minutes), "Total activity"],
              [Number(r.favorites_count || 0), "Favorites count"],
              [
                r.average_rating == null ? "—" : `${Number(r.average_rating).toFixed(2)} ★`,
                "Average rating",
              ],
              [Number(r.sessions_count || 0), "Sessions"],
            ] as const
          ).map(([value, label]) => (
            <div key={label} className="kpi">
              <div className="kpi-num">{value}</div>
              <div className="kpi-label">{label}</div>
            </div>
          ))}
        </div>
        <div className="card goal">
          <h2 className="section-title">Annual progress</h2>
          <div className="goal-number">
            {done}
            <span> of {goal} finished</span>
          </div>
          <div className="progress">
            <div style={{ width: `${Math.min(100, (done / Math.max(1, goal)) * 100)}%` }} />
          </div>
        </div>
        <div className="card settings-row">
          <h2 className="section-title">Reading modes · {r.year || year}</h2>
          <p className="section-sub">High-level time totals only</p>
          {(
            [
              ["reading", r.reading_minutes],
              ["audiobook", r.audiobook_minutes],
              ["read_listen", r.combined_minutes],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="rank-row">
              <div className="rank-top">
                <strong>{MODES[k]}</strong>
                <span>{formatTime(v || 0)}</span>
              </div>
            </div>
          ))}
          <div className="notice">
            {name} has not shared book titles, individual ratings, reading sessions, chapter maps,
            Favorites titles, notes, or their bookshelf. To see those, they must grant Full access.
          </div>
        </div>
      </>
    );
  }

  const requested = (await searchParams).tab;
  const tab = TABS.find(([id]) => id === requested)?.[0] ?? "insights";
  const nav = (
    <>
      <div className="eyebrow">Shared profile · Full access · read-only</div>
      <nav className="segmented book-tabs" aria-label={`${name}'s profile`}>
        {TABS.map(([id, label]) => (
          <Link
            key={id}
            href={`/friends/${ownerId}?tab=${id}`}
            className={`seg-btn ${tab === id ? "active" : ""}`}
            aria-current={tab === id ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
    </>
  );

  if (tab === "library" || tab === "shelf") {
    const { books, prefs } = await getShelfData(ownerId);
    return (
      <>
        {nav}
        <h1 className="heading">
          {name}&apos;s {tab === "shelf" ? "bookshelf" : "library"}
        </h1>
        {tab === "shelf" ? (
          <ShelfView books={books} prefs={prefs} editable={false} />
        ) : (
          <LibraryView books={books} />
        )}
      </>
    );
  }
  const data = await getInsightsData(ownerId);
  return (
    <>
      {nav}
      {tab === "replay" ? (
        <ReplayView data={data} today={today} readerName={name} />
      ) : (
        <>
          <h1 className="heading">{name}&apos;s Reading Insights</h1>
          <InsightsView data={data} today={today} />
        </>
      )}
    </>
  );
}
