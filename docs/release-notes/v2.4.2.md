# My Reading Room v2.4.2 — Book insights, drilldowns, series and shelf refresh

Release handoff: November 18, 2026. **Not deployed to Vercel or Supabase.** Incorporates the entire v2.4.1 application and all earlier changes.

## Implemented improvements

1. **Library by genre — read versus unread.** Each genre shows stacked read and unread counts rather than only total/rating metrics. A book assigned to multiple genres appears once in each relevant genre; category totals therefore should not be added together to calculate unique library size. A book is read if it has a finished current pass or historical completed pass, even if presently being reread. The chart, genre average ratings, and personal ratings recalculate from current library data after books, genres, statuses, or ratings are saved. Same-session saves reload via the existing `run()` → `sync()` path.
2. **Clickable book-level drilldowns.** Select a personal-rating bucket, any genre's read or unread segment, a genre rating row, a TBR age bucket, or a series book to see the underlying book records. All lists are filtered to the currently accessible profile only; summary-only friend profiles never reveal raw titles. The personal rating distribution is now rendered **once**, not twice.
3. **Aligned daily-goal history.** The Quick Summary's Daily goal overlay derives dated targets from the same series as detailed Insights and then aligns its SVG line to actual visible bar centers, correcting the apparent one-day shift on November 15. Daily goals remain time-based and are not overlaid on pages-only charts.
4. **Correct recap notification destination.** The celebration button now selects its exact completed week/month/year before switching to Recaps. An October 2026 notification opens the October 2026 recap, not Insights or the latest period by default.
5. **TBR conversion times.** Shows mean and sample size for days from TBR entry to first recorded start and finish, overall and by **all** assigned genres. These are observed calendar intervals, not reading durations. Known TBR entry dates are preferred; Goodreads Date Added and record creation date are labeled approximate proxies. Undated and negative timelines are excluded. Historical Goodreads exports may lack start dates; unavailable values remain blank instead of being estimated.
6. **Series analytics.** For Goodreads titles like `Dune (Dune #1)` and `The Well of Ascension (Mistborn, #2)`, the parser extracts the series name and numeric installment order while **preserving the original Goodreads title**. All three fields (`Series`, `Series order`, optional `Known total main installments`) are editable in Book Details. Existing records with series-title suffixes are also recognized without reimporting. Insights shows started-but-not-confirmed-complete series, fully read series whose **total installment count has been supplied and whose complete #1…#N set is in the library**, per-installment ratings, recorded reading-method mix, and measured pages/hour. Unknown series size never implies full completion. No page/time/speed metrics are fabricated for Goodreads-only imports.
7. **Three-tier bookshelf.** Exactly three visible shelves per page (up to nine books); Favorites are prioritized, then Currently Reading, then others. Previous/Next pagination exposes the rest of the library without hiding books. Existing shelf filters, decor controls, finishes, and per-book actions remain.

## Database upgrade from last-known live v2.3.3

**Backup your existing Supabase database first.** Verify which prior migrations really exist, then apply these in order, skipping only those confirmed already applied:

1. `APP/supabase/UPGRADE_EXISTING_TO_V2.3.4.sql`
2. `APP/supabase/UPGRADE_EXISTING_TO_V2.3.6.sql`
3. `APP/supabase/UPGRADE_EXISTING_TO_V2.3.8.sql`
4. `APP/supabase/UPGRADE_EXISTING_TO_V2.3.9.sql`
5. **NEW** `APP/supabase/UPGRADE_EXISTING_TO_V2.4.2.sql`

The final SQL adds one nullable, range-constrained `series_total` column; it does not overwrite existing titles, classifications, ratings, dates, or reading sessions. There are no separate v2.3.5, v2.3.7, v2.4.0, or v2.4.1 migrations. **Never run new-install `schema.sql` on an existing populated database.** After SQL migration, deploy the new `APP/` directory to the existing Vercel project and reopen the PWA to refresh its service-worker app shell. No intermediate UI releases need deployment.

## Local validation and limitations

- All **199 automated Node tests** pass, including eight new v2.4.2 regression tests for the requested features.
- Source syntax checked. A Node-based real-app render produced actual dashboard and bookshelf HTML, viewed in Chromium as local snapshots at desktop (1280px), mobile (390px) and small mobile (320px); no document-level horizontal overflow was observed.
- The environment's managed Chromium policy blocks navigation to web URLs, so a full interactive in-browser authenticated smoke test was not possible here. Generated screenshots validate rendered output, not live event handlers or Supabase persistence. Live RLS and multi-user testing remain necessary.
- Series completion needs a verified total main-installment count supplied by the reader. Series name/order inference from title is conservative and may miss unconventional Goodreads titles. Edits are preserved on future Goodreads imports.
- TBR source-date availability and seasonality depend on source imports. Goodreads Date Added may reflect when an item was added to Goodreads, not to TBR; labels distinguish proxies.
- Changes have **not** been applied to production or to the user's accounts. Verify historical Goodreads counts, goal starts, celebration links, genre edits and series analytics on staging before rollout.

## Preview

Open `PREVIEW_SITE/v2.4.2_insights_series_preview.html` (also distributed as a standalone HTML download) to experiment with mock chart drilldowns, live sample genre edits, expandable series and a three-tier paged shelf. **It uses fictional data and is not wired to production.** `PREVIEW_SITE/index.html` and `RECAP_MOCKUPS.pdf` remain the older v2.4.1 recap preview and reference.

## Key files

`APP/series-insights.js`, `APP/tbr-transitions.js`, `APP/library-drilldown.js`, `APP/reading-habits.js`, `APP/goodreads-import.js`, `APP/reading-replay.js`, `APP/app.js`, `APP/style.css`, `APP/service-worker.js`, `APP/tests/upgrade-v242.test.mjs`, `APP/supabase/UPGRADE_EXISTING_TO_V2.4.2.sql`.
