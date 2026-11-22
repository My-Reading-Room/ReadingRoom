import type { Metadata } from "next";
import Link from "next/link";

import { SelectNav } from "@/components/SelectNav";
import { getFriendsData } from "@/data/friends";
import { buildFriendComparison } from "@/lib/friend-comparison";
import { friendActivityFeed, type FeedEventKind } from "@/lib/friend-feed";
import { periodSpec } from "@/lib/insights-period";
import { localToday } from "@/utils/local-today";

import { ComparisonBody } from "./ComparisonView";
import { FeedView } from "./FeedView";

export const metadata: Metadata = { title: "Friends" };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
const TYPES = ["all", "started", "session", "finished"] as const;
const PERIODS = ["week", "month", "year"] as const;

/**
 * Activity feed and side-by-side comparison. Everything is computed here on
 * the server; friends' raw books and sessions never reach the browser.
 * Filters live in the URL: ?view=compare&friend=&period=&year=, ?type=&limit=.
 */
export default async function FriendsPage({ searchParams }: PageProps<"/friends">) {
  const params = await searchParams;
  const today = await localToday();
  const thisYear = Number(today.slice(0, 4));
  const view = one(params.view) === "compare" ? "compare" : "activity";
  const data = await getFriendsData(thisYear);

  const toggle = (
    <div className="segmented friends-view-toggle" role="group" aria-label="Friends sections">
      <Link
        href="/friends"
        className={`seg-btn ${view === "activity" ? "active" : ""}`}
        aria-current={view === "activity" ? "page" : undefined}
      >
        Activity feed
      </Link>
      <Link
        href="/friends?view=compare"
        className={`seg-btn ${view === "compare" ? "active" : ""}`}
        aria-current={view === "compare" ? "page" : undefined}
      >
        Compare friends
      </Link>
    </div>
  );

  if (view === "activity") {
    const type = TYPES.find((t) => t === one(params.type)) ?? "all";
    const limit = Math.min(600, Math.max(30, Math.floor(Number(one(params.limit)) || 30)));
    const feed = friendActivityFeed({
      viewerId: data.me,
      shares: data.shares,
      profiles: data.profiles,
      books: data.books,
      sessions: data.sessions,
      today,
      limit,
      type: type as FeedEventKind | "all",
    });
    // Only the covers of books that appear in this page of the feed.
    const ids = new Set(feed.events.map((e) => e.bookId));
    const books = new Map(
      data.books
        .filter((b) => ids.has(b.id))
        .map((b) => [b.id, { id: b.id, title: b.title, author: b.author, cover_url: b.cover_url }]),
    );
    return (
      <>
        {toggle}
        <FeedView feed={feed} books={books} type={type} limit={limit} />
      </>
    );
  }

  const friends = [
    ...new Map(
      data.incoming
        .filter((s) => ["full", "summary"].includes(s.access_level))
        .map((s) => [s.owner_id, s]),
    ).values(),
  ];
  const nameOf = (id: string) => data.profiles.find((p) => p.id === id)?.display_name || "Reader";
  if (!friends.length) {
    return (
      <>
        {toggle}
        <div className="eyebrow">Reading together</div>
        <h1 className="heading">Compare friends</h1>
        <p className="subtitle">Compare what you read, how you read, and your reading habits.</p>
        <div className="card feed-empty">
          <strong>No shared profiles yet</strong>
          <p>
            Ask a friend to share their profile with you in Settings, then compare your reading
            here.
          </p>
        </div>
      </>
    );
  }
  const friendId =
    friends.find((s) => s.owner_id === one(params.friend))?.owner_id ?? friends[0].owner_id;
  const access = friends.find((s) => s.owner_id === friendId)?.access_level;
  const periodKind = PERIODS.find((p) => p === one(params.period)) ?? "year";
  const yearParam = Math.floor(Number(one(params.year)));
  const year = yearParam >= thisYear - 6 && yearParam <= thisYear ? yearParam : thisYear;
  const spec = periodSpec(periodKind, today, periodKind === "year" ? year : thisYear);
  const comparison = buildFriendComparison({
    viewerId: data.me,
    friendId,
    shares: data.shares,
    profiles: data.profiles,
    books: data.books,
    sessions: data.sessions,
    goals: data.goals,
    goalHistory: data.goalHistory,
    summaries: data.summaries,
    period: {
      mode: periodKind,
      start: spec.start,
      end: spec.end,
      today,
      year: spec.year,
      label: spec.label,
    },
  });
  const href = (over: Record<string, string | number>) => {
    const q = new URLSearchParams({
      view: "compare",
      friend: friendId,
      period: periodKind,
      year: String(year),
    });
    for (const [k, v] of Object.entries(over)) q.set(k, String(v));
    return `/friends?${q}`;
  };
  const friendName =
    comparison.access === "none" ? "Friend" : comparison.friend.display_name || "Friend";

  return (
    <>
      {toggle}
      <div className="eyebrow">Reading together</div>
      <h1 className="heading">Friend Comparison</h1>
      <p className="subtitle">
        Your library, reading speed, daily routines, ratings and book interests — compared side by
        side.
      </p>
      <div className="card compare-filters">
        <div className="formfield">
          <label htmlFor="compare-friend">Compare yourself with</label>
          <SelectNav
            id="compare-friend"
            value={href({ friend: friendId })}
            options={friends.map((s) => ({
              href: href({ friend: s.owner_id }),
              text: `${nameOf(s.owner_id)} · ${s.access_level === "full" ? "Full access" : "Summary only"}`,
            }))}
          />
        </div>
        <div className="formfield">
          <label>Time period</label>
          {access === "summary" ? (
            <p className="tiny">Current-year summary only (no dated activity is shared).</p>
          ) : (
            <div className="segmented compare-period-toggle">
              {(
                [
                  ["week", "This week"],
                  ["month", "This month"],
                  ["year", "This year"],
                ] as const
              ).map(([id, label]) => (
                <Link
                  key={id}
                  href={href({ period: id })}
                  className={`seg-btn ${periodKind === id ? "active" : ""}`}
                  scroll={false}
                >
                  {label}
                </Link>
              ))}
            </div>
          )}
        </div>
        {access === "full" && periodKind === "year" && (
          <div className="formfield">
            <label htmlFor="compare-year">Year</label>
            <SelectNav
              id="compare-year"
              value={href({ year })}
              options={Array.from({ length: 7 }, (_, i) => thisYear - i).map((y) => ({
                href: href({ year: y }),
                text: String(y),
              }))}
            />
          </div>
        )}
      </div>
      <div className="compare-names">
        <span>
          <i className="compare-person you" />
          You
        </span>
        <span>
          <i className="compare-person friend" />
          {friendName}
        </span>
        <span className="compare-access">
          {access === "full" ? "Full comparison" : "Summary-only access"}
        </span>
        <Link className="btn sm" href={`/friends/${friendId}`}>
          Open {friendName}&apos;s profile →
        </Link>
      </div>
      <ComparisonBody result={comparison} />
    </>
  );
}
