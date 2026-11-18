# My Reading Room v2.3.9 — Release notes

Prepared November 18, 2026. This is a **source-code handoff**, not a production deployment. The user's live version remains v2.3.3 until independently deployed.

## Changes implemented

1. **Goodreads completion counts restored.** A finished reading pass with an exact finish date or year is included in its historical year for annual goals even when the account's tracking start date is later. Imported finished books do not require reading sessions. Each distinct book is counted at most once per calendar year; rereads preserve their own finish dates. Reading-time/session/page/goal statistics still respect tracking start. Applies to local Insights, friend comparison and shared-profile summaries.
2. **Quick Summary goal reference.** On minutes-based Reading activity by book, a thin dashed amber Daily goal guide appears behind the stacked columns, using the actual dated goal history for the complete day. It is hidden in Pages view. Detailed Reading time vs goal gets the same amber rather than gray guide. No goal is invented for pages.
3. **Time-of-day reading speed.** All activity, Reading Only, Audiobook Only and Read + Listen are now separately visualized in each of five time bands. Overall uses weighted total pages / measured minutes. Missing source page totals or session start times show an unavailable metric, not a guess.
4. **Friends Activity feed.** Includes the signed-in user's own events and Full-share friends. Genuine recorded local start times are shown beside dates for sessions; book-start and finish events without a clock stay date-only. Summary-only friends are excluded from book-level feed data.
5. **Illustrative preview and handoff updated.** Existing v2.3.8 chapter sourcing, OCR and community chapter features remain included. A proposed future Reading Replay design is documented but is **not an implemented feature in this release**.

## Deployment from v2.3.3

Back up the current Supabase database. Run these existing/upgraded SQL files **in order** using the existing project's SQL editor:

1. `APP/supabase/UPGRADE_EXISTING_TO_V2.3.4.sql`
2. `APP/supabase/UPGRADE_EXISTING_TO_V2.3.6.sql`
3. `APP/supabase/UPGRADE_EXISTING_TO_V2.3.8.sql`
4. `APP/supabase/UPGRADE_EXISTING_TO_V2.3.9.sql` (new: restores imported historical finish dates in summary-only shared profiles)

Then deploy **only the current `APP/` files** to the existing Vercel project, preserving the account configuration, and refresh/reopen the PWA to update its cache. You do not have to separately deploy v2.3.4 through v2.3.8. **Never apply full `schema.sql` to a populated instance**.

If earlier baseline migrations are unexpectedly absent, reconcile the database schema first rather than blindly continuing. Verify counts for a book completed before tracking began, compare an account with different goal history, and test own/Full-share/Summary-share feed views using distinct accounts in staging. The shared RPC migration is designed to preserve authentication and share scoping, but production permissions have **not** been tested.

## Validation and limitations

- **168 Node automated tests passed, 0 failed** (`npm test` in `APP/`).
- Real application Node render smoke passed, including changes to Time/Pages goal overlay and own feed visibility.
- JavaScript modules and illustrative preview inline script passed syntax checks.
- Attempted headless Chromium screen render stalled in this environment; visual QA on actual browser/phone remains open.
- Live Supabase migration, real GoodReads accounts, real user data and deployed Vercel behavior have not been tested, and **nothing was deployed**.

## Future feature proposal — Reading Replay (not yet built)

A unified **Recaps** area with Week / Month / Year selector and shareable opt-in story cards. Weekly: minutes, pages, active days, goal successes, top book and comparison to prior week. Monthly: habits, time-of-day distribution, methods, genre highlights and biggest reading days. Annual: immersive reading journey (finished books, top titles, ratings, year timeline, streaks, favorites, rereads, change from prior year). Historical Goodreads finish dates can support finished-book milestones but not invented historical session time, pages, speed, habit or daily-goal data. For shared cards or friend comparisons, enforce existing Full/Summary permissions and explicit reader opt-in.
