# My Reading Room v2.4.1 — Completed Recaps and Multiple Contents Photos

Release handoff: November 18, 2026. **No live deployment or database change has been performed.** This ZIP includes everything from v2.4.0 and earlier.

## New in this release

1. **Only completed weekly, monthly and annual Reading Replay.** Incomplete current periods never appear in Recaps; use Insights for live progress. Default Recaps views open the immediately preceding completed Sunday–Saturday week, preceding full calendar month, and preceding full calendar year. Older completed periods remain browseable.
2. **Newly completed Recap celebration.** A subtle in-app celebratory banner appears to the signed-in profile owner only if the newly finished recap actually contains activity. Button opens that recap. Dismiss/open stores a seen marker once per account, period type and period end in **that browser's localStorage**. Not a push/email notification; local seen state is not synced across devices. Limited to recent closed periods (weeks: 14 days, months: 40, years: 90 days) to avoid surprise celebrations for old backfilled data.
3. **Editable local start time on new logs.** Today's new-session form suggests your device's current local time on entry. Changing that field overrides the suggestion; backdated entries with no explicit start-time leave the time blank rather than pretend an old clock time is known. Stopwatch time remains supported.
4. **Many table of contents photos.** Up to 20 ordered images via multi-select or repeated phone camera shots; thumbnail list with reorder/remove. Single scan merges recognized chapter starts into one editable verified map. Image recognition runs in the browser with the existing lazy-loaded Tesseract.js dependency; exact end pages are never assumed verified. Maximum 12 MB/photo, 80 MB total. Verify chapter ordering, ISBN and start/end page boundaries before saving.

## Changed code

- `APP/reading-replay.js`, `APP/reading-replay-view.js`, `APP/replay-ready.js`
- `APP/session-start-suggestion.js`, `APP/chapter-sourcing.js`
- `APP/app.js`, `APP/style.css`, `APP/service-worker.js`, `APP/package.json`
- New 2.4.1 tests plus updated 2.4.0 replay tests
- Updated preview/README/design handoff and `RECAP_MOCKUPS.pdf`

## Deployment from your last known live v2.3.3

1. Back up Supabase and confirm the currently applied database migrations.
2. Run from `APP/supabase/` in order, skipping only verified previously applied versions: `UPGRADE_EXISTING_TO_V2.3.4.sql`, `UPGRADE_EXISTING_TO_V2.3.6.sql`, `UPGRADE_EXISTING_TO_V2.3.8.sql`, `UPGRADE_EXISTING_TO_V2.3.9.sql`.
3. No separate v2.4.0 or v2.4.1 SQL upgrade exists or is required; **do not run `schema.sql` on an existing database**.
4. Deploy **`APP/` from this package** to the existing Vercel project. Intermediate UI versions are not required. Reopen/refresh the installed app to pick up `reading-room-v2.4.1-sealed-replays`.
5. Validate authenticated Supabase/RLS with at least two user accounts, completed-period boundary dates, old Goodreads completions, photo OCR for multi-page TOCs, sharing controls and reading-session time data on actual devices.

## Verification status

- `npm test`: **191/191 passed** (including 2.4.1 period selection, unread celebrations, local-time suggestions, multi-photo scanning, validation and source wiring).
- Real application module/DOM smoke navigation: passed. The live site could not be loaded in Chromium due to test environment browser access restrictions.
- Standalone fictional HTML interactive preview: desktop 1280px, mobile 390px, small mobile 320px tested in Chromium, no JS errors or page-level overflow.
- Not verified: production Supabase, live authenticated sharing/RLS, actual OCR accuracy on a phone and Vercel service-worker transition.

## Privacy and data integrity

- Recap metrics are computed from known finished dates and logged sessions; historical Goodreads data do not fabricate time, pages, or pace. Summary-only shared profiles never expose individual data.
- Photo OCR happens on device, not stored in Supabase. Public Tesseract.js assets are requested from its CDN on first use, subject to internet availability; photographs themselves are not intentionally uploaded by the OCR workflow.
- No chapter may be logged without verified exact page boundaries.
- Celebration markers remain on the browser/device, not shared to Supabase.
