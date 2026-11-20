# MY READING ROOM — ONE-PACKAGE PROJECT HANDOFF

**Application version:** v2.4.2 (2026-11-18; updated read/unread genre analytics, clickable Insights drilldowns, series mapping and metrics, TBR transitions, three-shelf bookshelf, recap notification fixes; includes all v2.4.1 and earlier features)  |  **Handoff packaging:** one ZIP with app, complete SQL migration chain, automated tests, standalone interactive HTML preview and updated `RECAP_MOCKUPS.pdf`  |  **Status:** 199 automated tests and Node DOM render checks passed; actual output snapshots inspected at desktop, 390px and 320px; live browser navigation and production database/Auth/RLS unverified.

> **For a new ChatGPT conversation or developer:** Upload **this one ZIP**. Extract it, read this `START_HERE.md` first, then inspect `APP/`. Do not treat the interactive design preview as the live app. Preserve all established features and calculation/security rules when making changes.

## New in v2.4.2 — Genre metrics, series and TBR transitions

See **`RELEASE_NOTES_v2.4.2.md`** for all implementation details, limitations, and upgrade instructions. Most importantly, Goodreads titles such as `Dune (Dune #1)` now automatically supply a series and installment number while remaining editable; unknown total series size is never assumed. Read/unread charts are based on all assigned genres and update on the next save/reload. Detailed Insights includes click-through lists for ratings, genres and TBR ages, plus new series and transition panels. The bookshelf shows only three tiers per page.

**IMPORTANT upgrade from deployed v2.3.3:** Supabase migrations v2.3.4 → v2.3.6 → v2.3.8 → v2.3.9 → **v2.4.2** must be applied before the v2.4.2 application deployment. No production changes have been made.

## New in v2.4.1 — Completed recaps, celebration, local log times and multi-page contents photos

**Completed recaps only (no "so far" views).** The Recaps tab begins at the latest **fully completed** Sunday–Saturday week, calendar month, or calendar year. The current unfinished week, month and year are available only in **Insights**. For example on November 18, 2026, the latest Week is November 8–14, latest Month is October 2026, and latest Year is 2025. Navigate backward to older completed periods; future/incomplete periods are never selectable. Previous-period comparisons cover full previous periods instead of partial data. Year-only Goodreads history is still respected, and session metrics are never invented.

**In-app celebration for a newly available recap.** An owner's signed-in landing UI shows a subtle celebratory banner when they have **activity in a newly finished period**, with a button opening the completed Weekly, Monthly or Annual replay. The banner is shown once per user, period type and finished-period ending date, remembered in **device/browser localStorage**; dismiss or opening the item records it as seen. It does **not** send a push notification, email, or automated message. Weeks qualify if completed within the last 14 days; months within 40; years within 90. No server-side notification or database migration. Friend/summary permissions are unchanged.

**New log start-time suggestion.** Navigating to **Log → New reading session** pre-fills the **local device time** (`HH:MM`) when today's date is selected. It is a suggestion: it remains fully editable, and a manually entered time isn't clobbered while changing other inputs. Selecting an earlier date with no manual time clears the auto-suggested time rather than fabricating a past timestamp. **Use stopwatch time** intentionally supplies the stopwatch's actual local start when available. Logged times continue feeding time-of-day Insights and date/time in the Friends Activity feed. The browser's time zone and clock are the source of the suggested local time.

**Multi-photo table of contents scan.** In **Book Details → Exact chapters → Find chapter pages**, select up to **20** contents photos in one file-selection dialog, or add further batches. On a phone, **Take another photo** lets you photograph successive pages. Selected photos show thumbnails and their scan sequence; **move up / move down / remove** controls let you order them. Scanning reuses one browser OCR worker and merges page starts into one editable chapter map. The user is warned about OCR omissions, duplicated/nonincreasing chapter starts or unrecognized rows and must confirm exact page boundaries for the same edition/ISBN before storing any map. No chapter may be logged without verified page data. Individual images are limited to 12 MB and the combined queue to 80 MB; if too large, resize photos before uploading.

**Validation:** `cd APP && npm test` passed **191/191** local automated tests. Real application DOM smoke navigation passed. Fictional standalone HTML design preview ran at desktop 1280px, phone 390px and small phone 320px without Javascript errors or page-level overflow. Live authenticated Supabase, actual multi-account permissions, OCR recognition on a physical phone, and production Vercel/PWA updates remain untested. The preview is mock data, not a real app connection.

**Direct deployment from current live v2.3.3:** Back up Supabase. Apply migrations in sequence: `APP/supabase/UPGRADE_EXISTING_TO_V2.3.4.sql`, then `...V2.3.6.sql`, `...V2.3.8.sql`, and `...V2.3.9.sql`. Skip only those you can verify were already applied. Do not run `schema.sql` over the existing live database. There are **no v2.4.0 or v2.4.1 SQL migrations**. Then deploy this package's **`APP/`** directory to the existing Vercel project and reopen/refresh the PWA for cache `reading-room-v2.4.1-sealed-replays`. Intermediate app deployments are unnecessary. No live site, database or user account has been changed by this handoff.

**Files:** `APP/reading-replay.js`, `APP/reading-replay-view.js`, `APP/replay-ready.js`, `APP/session-start-suggestion.js`, `APP/chapter-sourcing.js`, `APP/app.js` and `APP/style.css`; tests `APP/tests/*v241.test.mjs`; self-contained demo `PREVIEW_SITE/index.html`; current screenshot gallery `RECAP_MOCKUPS.pdf`; and `RELEASE_NOTES_v2.4.1.md`.

---

## Historical v2.4.0 release (superseded by v2.4.1)

### New in v2.4.0 — Reading Replay: weekly, monthly, annual recaps

**New Recaps tab in the real application.** A dedicated Reading Replay experience is available from desktop sidebar and mobile bottom navigation, separate from the existing Insights and Friends sections. Switch among **Weekly (6 cards)**, **Monthly (8 cards)** and **Annual (9 cards)**. Swipe-like storytelling is controlled by visible **Previous / Next** buttons, progress dots and optional left/right arrow keys on desktop. Choose previous weeks, months or years with the date navigator; future periods are disabled. Each story is generated for the selected viewed profile and selected period, without writing to the database.

**Card topics and graphics (at original v2.4.0 release):** Introductory headline and personalized observation; recorded reading time, pages, active days, session count, books finished and measured page speed; activity chart (day-by-day for week/month, month-by-month for year); most-read and finished books with book-cover cards; reading rhythm by time of day, most active day or annual peak month, and streak; reading-method mix (Reading / Audiobook / Read + Listen); dated daily-goal progress (weekly summary + monthly/annual cards); mini-genre ranking in the monthly books card and a full genre/rating panel for annual; period-to-period comparisons with elapsed days matched for current unfinished periods. Some supporting sections differ by timeframe to keep the stories concise.

**Goodreads and privacy semantics are preserved:** Annual recaps count historically dated and year-only finished Goodreads records regardless of the tracking-start date, consistent with the v2.3.9 fix. Monthly and weekly recaps use exact finished dates only; a year alone is never fabricated into a day. Repeated finishes for the same book in one annual calendar year count once toward the annual completed-books total. Tracking dates still gate *session-based* time, speed, pages, streaks and goals. A period with imported finished books but no logged sessions visibly says session data was not recorded: no invented pages, minutes, speeds or habits. Reading/speed charts separately disclose print pages versus audiobook page equivalents. Read + Listen sessions are counted **once**, not twice. Book titles from other users are escaped before rendering. Users with summary-only access are **not shown** book/session-level recaps; Full-shared friends have a read-only recap, with no owner-only copy action.

**Optional share text (original v2.4.0 behavior; v2.4.1 adds the in-app celebration):** Owners may press **Copy recap summary** (with browser clipboard permission on a secure origin). This copies plain text to clipboard; it does *not* automatically post, broadcast, send notifications, reveal a profile, or upload private data. The user decides whether to share. There are no automated recaps/notifications in this release, nor image export; those can be future enhancements after real-world visual feedback.

**Mockups for review:** `PREVIEW_SITE/index.html` is a fully standalone interactive **fictional** preview. Choose `Reading Replay · Week`, `Reading Replay · Month` or `Reading Replay · Year` using the desktop design-picker or the mobile dropdown, then click period and slide controls. The preview uses the **same story-card renderer** as the app, with embedded sample output that does not connect to a backend or access your accounts. `RECAP_MOCKUPS.pdf` contains a seven-page static desktop/phone gallery made from browser-rendered previews. The older `DESIGN_REFERENCE.pdf` stays as a historical archive of previous screens. For the actual feature use `APP/reading-replay.js` (pure analytics), `APP/reading-replay-view.js` (story renderer), `APP/app.js` (Recaps route/handlers), and `APP/style.css`. Automated edge tests: `APP/tests/reading-replay-v240.test.mjs`.

**Historical v2.4.0 deployment note (superseded by v2.4.1 instructions above):** The v2.4.0 Recaps addition needs **no new Supabase migration or table**. Back up your existing database; apply the **v2.3.4 → v2.3.6 → v2.3.8 → v2.3.9** SQL migrations from this ZIP (if not already applied), then deploy **only the v2.4.0 `APP/` directory** to your existing Vercel project. You do **not** need separate v2.3.4–v2.3.9 application deployments. Do not run `schema.sql` against a populated database. Reopen/refresh the PWA to pick up the `reading-room-v2.4.0-reading-replay` cache. **Nothing here has been run against your live deployment.** Check historical Goodreads counts, chapter-sharing RPCs, profile permissions, timezone-sensitive day boundaries and recap visuals on the deployed site with separate test accounts. 177 local automated tests and source-render smoke pass, while production Supabase, live multi-account sharing, and real-device visual tests have not been completed.

## New in v2.3.9 — Restore historical finished books and refine reading statistics

**Regression fixed: Goodreads finished books.** A book on the Finished shelf whose original/reread history records an exact finish date or a known finish year **counts toward the annual completed-books goal for that year even when it was read before this account's tracking start date**. The same behavior now applies to demo data, local Insights, friend comparison, and the Supabase Full/Summary shared-profile aggregate via a replacement `get_viewable_profile_summaries(integer)` RPC. Unique books count at most once **per year**, even if the book was finished multiple times in the same year; finishing a reread in a different year counts in that year too. The tracking date **still applies to reading sessions, daily-goal tracking, session statistics, pages and streaks**. Neither historical reading time nor pages are invented from Goodreads data. Imported libraries need **no destructive reimport**. Check the selected year in Insights if an older book is not in the current year's total.

**Quick summary goal overlay.** The **Reading activity by book** stacked graph includes a **fine dashed warm-amber Daily goal line** behind the bars while viewing **minutes**; historical target changes are preserved. The goal is for the reader's full day across all activity modes, even when bars are filtered by mode/book. In the Pages view, no time-based goal is drawn. The detailed **Reading time vs goal** graph uses the same amber, not chart-axis gray. Warm color `#b67b39`; chart axes remain cool gray/green.

**Speed by time of day and reading type.** For each of five dayparts, Insights → Reading Habits now visualizes **four** weighted page-speed series: **All activity**, **Reading Only**, **Audiobook Only**, and **Read + Listen**. Overall pages per hour = total measured pages / total eligible minutes × 60, not the arithmetic mean of each mode's speed. Only sessions with actual/recorded page progress and local start times contribute. For fair comparisons, the four-series breakdown ignores the optional mode filter but follows the selected period, account tracking date, and book filter. Missing data show an em dash instead of an invented speed.

**Friends → Activity feed.** The timeline now contains the signed-in reader's own events plus inbound Full-share friends' activity, with an unobtrusive **You** badge. **Recorded session local start time** is printed beside the date when supplied (HH:MM, displayed in the browser locale). Goodreads start and finished dates with no time stay **date-only**; server upload timestamps are never represented as reading times. Summary-only friends' titles and sessions remain inaccessible. The top friend counter excludes the reader themselves; the total activity count includes everyone visible in the feed. No schema changes required for these UI enhancements.

**Deployment directly from your production v2.3.3:** Back up your live Supabase database. Apply the existing SQL upgrades **v2.3.4 → v2.3.6 → v2.3.8 → NEW `APP/supabase/UPGRADE_EXISTING_TO_V2.3.9.sql`** in that exact order, then deploy only the current `APP/` to your existing Vercel project; refresh/reopen the PWA to clear cached app code. **No intermediate app-version deployment is required.** This last migration only replaces the authorized shared-summary RPC; it adds no tables, columns, public privileges, or policy changes. Never run `schema.sql` on a populated live installation. Test historical counts, sharing permissions, and actual visuals in staging first; no production migration or deployment was executed here.

**Historical recap proposal (now implemented in v2.4.0):** Introduce a **Reading Replay** area with **Week / Month / Year** period tabs. Weekly = a few goal/reading-time/most-read highlights; Monthly = a 5–7 card swipeable story with methods, habits, pace, and favorite reads; Annual = a rich Spotify-Wrapped-inspired story with year highlights, book covers, genres, peak month, streaks, reading-method mix and optional comparison to prior years. Let users open any historic period on demand before adding automated notifications or share cards. Read dates from Goodreads can supply historical completed-book and rating facts, but **must not imply past sessions, pages, or speed**. Sharing any recap graphic is opt-in, privacy-scoped, and excludes private book data for summary-only viewers.

## New in v2.3.8 — Source exact chapter mappings without inventing pages

**Reader requirement retained:** Chapter logging is permitted **only when every selected chapter has an exact, confirmed starting and ending page** in the user's saved print edition. Chapter-only/time-only tracking without page totals is deliberately **not** added. This retains meaningful pages-read, reading-speed and Insights metrics. Do not fill unmapped chapters with averages or guessed lengths.

**Auto-discovery on individual book add:** For a new book with a valid ISBN, My Reading Room checks the **Open Library exact ISBN edition endpoint** and the new shared ISBN repository. If candidates are found, the book opens directly in **Book Details → Exact chapters** with a proposed map. Neither source automatically writes mappings. Existing library books can click **Look up Open Library** or **Find shared mappings** within that same tab. The app does not bulk-probe ISBNs when importing Goodreads files. Catalog coverage may be limited and network access is required.

**Reviewable contents-page import:** From Exact chapters, choose a photo (camera/file selection) and press **Read photo**. A lazy-loaded Tesseract.js worker recognizes the text locally in the browser; the image is never submitted to a backend or stored in a shared database. It downloads OCR JS/worker/English language assets from external CDN hosts on first scan; a network connection is required for this dependency. **Paste table of contents** is a fallback. OCR recognizes lines with titles and Arabic-numeral page numbers; Roman numeral prefaces, multi-column layouts and poorly printed lists may need manual correction. The generated editor supports label/start/end corrections, removing headings and adding chapters. End pages inferred as `next chapter start - 1` are only **proposals**, and the last ending page stays blank: the reader must check the printed book and explicitly confirm all boundaries before **Save verified chapter map**. Book page count bounds and overlapping pages are enforced. Manual single-chapter editing still works.

**Shared chapter map database (opt-in):** An authenticated owner who already has a page-verified map and a valid book ISBN can press **Contribute my verified map**, then confirm. Only chapter names/page ranges and edition page count are published for the canonical ISBN-13 (ISBN-10 cross-matches to its 978 equivalent). Reader IDs, book notes, session history, ratings and uploaded photos are not returned to others. Shared maps are **community-contributed, not independently verified**; other readers must review and confirm each boundary before adding it to their own book. The server stores one submission per reader+ISBN and returns up to eight recent candidates per ISBN. No direct authenticated-user permissions are granted on the shared map table; authenticated RPC functions validate ownership and return only sanitized edition data. For later moderation and corrections, use a Supabase admin SQL session; there is not yet an end-user submission deletion/moderation dashboard.

**Storage/upgrade:** New SQL migration **`APP/supabase/UPGRADE_EXISTING_TO_V2.3.8.sql`** adds `shared_chapter_maps` and the RPCs `chapter_isbn13`, `replace_book_chapter_map`, `publish_chapter_map`, `get_shared_chapter_maps`, and `withdraw_chapter_map`. The bulk replace operation validates the *entire* map before atomically replacing a book's existing chapter boundaries, preventing partial saves; existing reading sessions retain the page totals recorded when originally logged. The current book's page count still bounds imported chapters. New installations use the full `APP/supabase/schema.sql`. The `chapter-sourcing.js` module is included in the bumped service-worker app shell. The standalone design preview has a **Book · Chapter Sources** screen; the PDF remains a historical design reference.

**Direct deployment from your current v2.3.3:** Back up the live Supabase database and confirm it contains earlier baseline migrations, then apply **`UPGRADE_EXISTING_TO_V2.3.4.sql` → `UPGRADE_EXISTING_TO_V2.3.6.sql` → `UPGRADE_EXISTING_TO_V2.3.8.sql`**, in that order. **You do not need to deploy v2.3.4, 2.3.5, 2.3.6 or 2.3.7 separately.** Deploy the latest `APP/` only after the database upgrades; then refresh/reopen the installed PWA. Do **not** run fresh-install `schema.sql` over populated Supabase data. Production cloud permissions/SQL migrations and live OCR accuracy must still be checked in staging with distinct signed-in accounts; no production deployment has occurred here.

## New in v2.3.7 — Clearer Friends, lighter goal line, book-specific chart colors

**Daily goal visual hierarchy:** The "Reading time vs goal" chart now emphasizes logged minutes using solid green columns, while the **Daily goal** appears as a soft, narrow gray-green dashed reference line **behind the bars** (rather than a competing series). Its legend label is **Daily goal**; existing dated-target calculations remain unchanged. The historical mockup shows the same visual treatment.

**Friends → Activity feed:** Refined card layout with date groupings, small avatar, action-focused event text, book cover/title, session metadata, completion ratings when available, and event filters (All, Started, Sessions, Finished). Cards avoid cramped widths and wrap elegantly at 320px/390px and desktop widths. Feed remains a read-only view of data exposed by inbound Full-profile sharing; summary-only friends' book/session data are never shown.

**Friends → Compare friends:** Reorganized the six detailed sections with proper **paired visual charts** for activity by period, pages, goal success, speed by mode/genre/time, routines, session distributions, ratings and genres, and TBR ages. Charts use a stable green (You) versus terracotta (Friend), clear value labels and axis/category labels; larger series scroll horizontally within the chart rather than expanding the page. Collapsible metric tables preserve exact values. Responsive cards, heatmaps, title wrapping, and mobile navigation were refined. The baseline and sharing permission rules remain unchanged.

**Distinct colors for individual books:** Insights' stacked **Reading activity by book** chart now assigns colors from a curated 16-color categorical palette to the active book series, instead of using cover colors or hashing titles (which could produce nearly identical shades). The same visible book set produces the same color mapping across chart segments, legend, and Most-read books ranking. The palette prioritizes contrast in hue and luminance and the stacked segments have a subtle separator. Individual cover/spine colors remain untouched. Beyond the curated first 16, additional series receive generated hues rather than an identical repeating color; labels and tooltips remain available for identification. The separate design preview uses matching sample colors. Source module: `APP/book-chart-colors.js` and its regression test.

**Deployment from v2.3.3:** No intermediate app deployments are needed. Back up the live Supabase database, confirm all earlier migrations already present, then run `APP/supabase/UPGRADE_EXISTING_TO_V2.3.4.sql` and `APP/supabase/UPGRADE_EXISTING_TO_V2.3.6.sql` **in order** on an existing v2.3.3 database. There is **no additional SQL migration in v2.3.7**. Deploy the updated `APP/` to your existing Vercel project only after the DB upgrades, then refresh/reopen the PWA for the updated service worker cache. Do not run fresh-install `schema.sql` over an existing database. These changes have **not** been deployed and production Supabase/Auth/RLS is not verified. Local regression suite: **154 tests passed**, plus app-render smoke checks; static Chromium screenshots of the rendered source at **1280px, 390px and 320px** showed no page-level horizontal overflow. Direct local-webserver navigation was blocked by the test environment, and live browser/phone/cloud validation remain unverified.

## New in v2.3.6 — Log the page where you stopped

**Implemented in the real application.** In **Log Reading → New reading session → Time + Ending Page**, users enter **minutes** and the **page they left off on**, not a manually counted number of pages. A clear preview shows **starting page → ending page = pages progressed**. For example, if Book details → Current page is 120 and the reader reaches page 145, the saved session records **25 pages**, and the book moves to page **145** (not 170). The same behavior applies to Reading Only, Audiobook Only (explicitly labeled *print-edition page-equivalents*), and Read + Listen. **Time + exact Chapters** and **Time + Audio Position** remain unchanged; the latter still has no invented page total.

**Starting position:** The default is the selected book's **Current page** on its active reading pass when the new log is chronological. For older/backdated logs, the app uses the previous *recorded ending page* for the same read pass, or page 0 when no earlier session exists. Legacy logs contain counted `pages_read` but no reliably known ending page: if they prevent safe inference the app asks for a **starting page override** rather than making one up. Readers can also select **Correct starting page** if they manually updated Book details or need a correction. The page-difference preview updates as they type. Input must be a whole-number ending page after the starting position, not beyond the book's known edition page count, and not beyond the next recorded session's known starting page.

**Storage and legacy data:** New Time + Ending Page sessions save `start_page`, `end_page`, **and** derived `pages_read` on the existing owner-scoped `reading_sessions` table. Historic rows preserve their recorded `pages_read`; their new positions remain **NULL** instead of being guessed. Backdated entries and logs for a prior reread never move the current book position, and existing later sessions are not recomputed. The new database CHECK constraint verifies `pages_read = end_page - start_page` whenever both positions are recorded. A database trigger checks that the stopping page does not exceed the edition's page count. Existing Supabase RLS and directional sharing permissions are unchanged. No new table or public role is added.

**Deploy v2.3.6 to an existing cloud database:** Back up Supabase, apply any earlier missing migrations in order, and then run **`APP/supabase/UPGRADE_EXISTING_TO_V2.3.6.sql`** before deploying the modified `APP/` to the existing Vercel project. The application sends the two new columns when saving sessions, so **new cloud page logs will fail until the migration is applied**. For an entirely empty Supabase project, use the latest `APP/supabase/schema.sql` once instead; never run the whole schema over populated production data. Reload the PWA after deployment so the updated service worker caches `session-page-progress.js`. Demo mode works without SQL migrations. The design preview was updated with a fictional ending-page example; the PDF remains a historical design reference.

**Local QA:** 150 automated tests plus source-render smoke checks passed after these changes, including real-app demo persistence tests. Browser and production validation status should be reviewed separately; live Supabase/Auth/RLS and deployed iPhone behavior have **not** been verified.

**Files changed:** `APP/session-page-progress.js` (new pure calculation and chronological baseline logic); `APP/app.js` (page-end input, live preview, saving); `APP/style.css`, `APP/service-worker.js`, `APP/package.json`; `APP/supabase/UPGRADE_EXISTING_TO_V2.3.6.sql` and the fresh-install `schema.sql`; `APP/tests/ending-page-v236.test.mjs`, `APP/tests/ending-page-app-v236.test.mjs`, `APP/tests/render-smoke.mjs`; `PREVIEW_SITE/index.html`, `DESIGN_SYSTEM.md`, and this handoff.

## New in v2.3.5 — Friend Comparison with the full Insights metric set

**New navigation:** **Friends → Compare friends** beside the existing **Activity feed**. Pick any reader who has shared their profile with you, and compare **This week (Sunday-first), This month, or This year**; a year selector supports previous years for Full-sharing accounts. The default is This week. Your own and the selected reader's **tracking start date** apply separately, so the report explicitly discloses both dates; calendar-day denominators reflect each person's actual tracked days.

**Full sharing comparison:** Six collapsible sections let you compare **Overview and activity; Goals and consistency; Speed and reading performance; Time of day and reading habits; Shared books and interests; TBR, completion efficiency, and rereads**. This includes:

- Time, pages (physical vs audiobook-equivalent), reading sessions, active days/streaks, books read, date/month activity and page trends, top books with time/session/day counts.
- Annual completed books/goal, daily target, dated goal-reference totals, goal success and streaks, day/month goal performance. Historical goal changes are preserved.
- Weighted pages/hour **overall, Reading Only, Audiobook Only, Read + Listen**; speed **by period, book, and primary genre**, plus **by time of day**. Missing/position-only pages remain unmeasured; none are fabricated.
- Five time bands (Morning 05–10:59, Midday 11–12:59, Afternoon 13–16:59, Evening 17–19:59, Night 20–04:59), seven Sunday-first weekdays and weekday/weekend averages, two 7×5 routine heatmaps, unknown start-time coverage, session duration distribution/average/median/longest, and time/method shares.
- Side-by-side books/ratings/genres: books in common (normalized title + author), exclusive titles, matching or distinctive interest tags, optional rating differences for books both readers rated, quarter-star rating histogram, genre counts and genre-specific ratings, favorites, shelves/statuses.
- Full-library TBR ages including **5+ years**, active-versus-elapsed book days and per-active-day reading/pages, and lifetime reread counts, time, sessions, and original-versus-reread comparisons where recorded.

**Summary-only permission:** The comparison shows **only the previously authorized current-year summary aggregates** (books completed/goal, total/mode minutes, sessions, Favorites count and mean rating). It does not read, display, or calculate titles, genres, session timelines, clock habits or speed for Summary-only profiles. Full-detail comparison requires an inbound Full share; outgoing-only shares and revoked relationships do not grant access. The actual app has an additional client-side permission guard in `APP/friend-comparison.js` and relies on existing Supabase **RLS** for database authorization.

**Files changed:** `APP/friend-comparison.js` (pure aggregate and privacy guard), `APP/friend-comparison-view.js` (read-only paired charts/tables), `APP/app.js` (Friends tabs and selectors), `APP/style.css` (responsive comparison cards/heatmaps), `APP/service-worker.js` (cache bump and both new modules), `APP/tests/friend-comparison-v235.test.mjs`, `PREVIEW_SITE/index.html` (fictional design reference), and `DESIGN_SYSTEM.md`.

**No new database tables or columns for v2.3.5.** If your live Supabase database is already at v2.3.4, push/deploy the updated `APP` code only. **If the live database is at v2.3.3 or older, back it up and run all missing migrations in order, including `APP/supabase/UPGRADE_EXISTING_TO_V2.3.4.sql`, before deploying this version.** Do not run `schema.sql` over existing data. The new companion preview and comparison data are fictional; this package has **not** been tested against your live three-account Supabase security policies or iPhone devices.

## New in v2.3.4 — friends, quick insights, goal baseline, covers, genres and reading status

**This is one directly edited source ZIP; there is no JavaScript patch.** Includes all v2.3.3 functions and prior migrations. The application defaults to **Insights → This Week**, with a **Quick summary / Detailed insights** toggle. Quick summary highlights the selected period's recorded minutes, sessions, active days, pages, goals and most-read books; the detailed tab retains every existing report. Charts display numerical values where appropriate, including Reading activity by book. Sunday-first weeks remain unchanged.

**Friends** is a dedicated owner-view feed assembled on demand from read-only inbound **Full** shares and the owner's allowed sessions/books: started reading, rereading, individual sessions (recorded minutes and activity), and completed books with the book's **current** rating (not a historical rating snapshot). Summary-only shares and outgoing-only shares never expose titles or sessions. The feed has a load-more control; it is not an external social service, and no database table is added for the feed. It reflects data available when the page is refreshed, not push notifications.

**Daily goal boundary correction:** moving `tracking_start_date` backward no longer automatically creates a 30-minute target on the newly included first day. Each profile has an optional **Starting daily goal (minutes)** setting, applied at the inclusive tracking start and editable under Settings. Genuine dated goal changes after that date remain effective. The new `profiles.tracking_start_goal_minutes` integer (1–1440) requires **`APP/supabase/UPGRADE_EXISTING_TO_V2.3.4.sql`** for an existing v2.3.2/v2.3.3 database. This migration is additive and idempotent, initializes the baseline from goal records when possible, and reloads the PostgREST schema cache. Back up the database and verify the initial goal on the live account, since automatic inference of undocumented historical changes is impossible. Run earlier missing migrations first if needed. A fresh database uses the latest `schema.sql` only.

**Cover loading:** book images use native lazy loading (`loading=lazy`) and a bounded service-worker on-demand cache for HTTPS external cover images (at most 160 entries); recently loaded covers can render faster on repeat scrolls. Offline availability depends on browser storage, external host policy, and whether the cover was viewed. Original URLs remain stored in Supabase, not duplicated in new SQL columns.

**Genres:** Add book manually and Book details → Edit genres now use the same **standardized 26-genre dropdown** as automatic catalog normalization. Choose multiple genres, remove individual values, and mark one primary for Insights. Older custom genre strings are retained unless manually removed; the editor cannot add new arbitrary strings. This does not overwrite existing classifications during import.

**Reading status:** open any owned book in My Library, choose **Book details → Reading status** directly below the cover/title (Want to read, Currently reading, Finished, Did not finish), then tap **Save book** in the sticky modal footer. For a finished/DNF book being read again, select **Start reread today** instead: this creates a new numbered pass, leaving the original completion and sessions intact. You can edit dates or historic reread status separately under **Read history**. Shared books remain read-only.

**Deploy:** Back up Supabase → run `APP/supabase/UPGRADE_EXISTING_TO_V2.3.4.sql` if upgrading from v2.3.2/v2.3.3 → from `APP/` run `npm test`, render checks, then deploy to the same Vercel project via GitHub or `npx vercel --prod`. Refresh/reopen the PWA after deployment. No separate genre, friends, status or image-cache SQL columns are required. Live Supabase migration, production RLS/Auth, actual external cover caching, and physical iPhone tests have not been verified.

## New in v2.3.3: Currently Reading first in Log Reading

**Already integrated into the running app. No SQL migration or JavaScript patch.** In **Log Reading → New reading session**, the Book dropdown now contains only books whose status is `reading` by default (including a reread that has been started and marked Currently Reading). The first visible book is selected correctly, even if the reader has never manually changed the dropdown. The filtered list is alphabetical by title. When the Reading shelf is empty, the app explains why logging is unavailable in this view and offers an escape hatch rather than silently displaying every finished book.

- **Choose another book** switches to the complete user's *own* library, with title/author search and status alongside each choice. This supports backdated logs for completed books, TBR books and books abandoned before finishing. **Back to currently reading** returns to the focused list; if the chosen book is outside it, selection resets to an active book. No partner book can be logged from this control.
- **Add new book** opens the existing catalog search/add flow directly from Log Reading. When adding a new title, choose its appropriate shelf; adding it to Currently Reading makes it visible in the default picker after save.
- **Read pass safety:** all existing reread assignment, manual pass selection and date validation still apply. For an active reread, choose the correct pass; for a finished book being read again, open its details and use **Start reread** / **Read history** before logging current sessions. The fallback does not create a reread automatically.
- **Existing behavior preserved:** Logging a TBR book still updates that book to Currently Reading after the session saves. Logging a historical session for a finished book leaves its Finished status intact when the selected read pass and dates are valid. Reading-mode choices, stopwatch, minutes/pages, chapters, per-person permissions, and Insights do not change.
- **Testing/deployment:** Run `npm test` and `node tests/render-smoke.mjs` from `APP`, then deploy this folder through your GitHub→Vercel pipeline (or `npx vercel --prod`). The PWA service-worker cache version is updated to v2.3.3. No new columns, tables, or Supabase SQL scripts are required if v2.3.2 is already installed. Production save behavior and iPhone Safari still need validation.

## New in v2.3.2: each reader chooses a tracking start date

**This is already implemented in the app; do not apply a separate JavaScript patch.** The tracking start is a `public.profiles.tracking_start_date` **date**, saved separately per Supabase account. Each owner can edit it at **Settings → Your account → Tracking start date → Save tracking start date**. The date must be a real local `YYYY-MM-DD` date on or before today; people viewing a shared profile cannot change it. The active profile's saved date also governs its view-only Insights.

**Reporting:** The app applies `max(calendar-period-start, tracking-start)` as the inclusive activity cutoff in **This Week** (Sunday–Saturday), **This Month** and **This Year · Monthly** (YTD for the current year). It uses the same boundary for session minutes, pages, modes, active days, top books, reading pace, habit distributions, calendar-day weekday/weekend averages, and reading streaks. The averaging *formula is unchanged*: daily weekday averages still include no-session dates **after** tracking begins, and future dates are excluded. This avoids treating dates before reliable logging began as zero-minute days. The selected period remains the familiar full week/month/year on screen, with a visible `Tracking since` caption. If the chosen date is later than the selected historical year, that year has no eligible tracked activity.

**Daily goal:** The goal's first evaluated date, historical goal reference chart, goal-met counts, streaks and heatmap markers now use **the same tracking start date**, replacing the previous account-creation cutoff. The daily target is **not reset** and existing dated target history remains intact. Goal time still combines Reading Only, Audiobook Only and Read + Listen once per session regardless of book/mode Insights filters. Moving the tracking start earlier or later recalculates reports; it does not delete reading sessions or rewrite historical daily targets.

**Annual completion count (corrected in v2.3.9):** The original v2.3.2 rule excluded historical Goodreads books completed before tracking started. That exclusion was a regression and is **superseded by the v2.3.9 rule**: finished books count in their actual completion year, even with year-only dates and regardless of account tracking start; sessions, reading time, pages, daily goals, streaks and heatmaps still respect the session-tracking cutoff. **Lifetime** book details, original/reread history, library genre ratings and TBR aging are not deleted or filtered by this setting.

**Summary-only sharing:** The server's owner-authorized aggregate RPC also respects the owner's start date for yearly session and distinct-completion counts. Full viewers use the selected owner's date; profiles remain editable only by their owners under existing RLS policies.

**Production upgrade from v2.3 or v2.3.1:** Back up Supabase, then run **`APP/supabase/UPGRADE_EXISTING_TO_V2.3.2.sql` in Supabase SQL Editor before deploying the new web app**. This additive, idempotent migration creates `profiles.tracking_start_date`, initializes existing accounts to their *account creation date* (UTC date) to avoid silently changing their old goal boundary, sets a `current_date` default for new accounts, updates the summary-only RPC, and refreshes the Supabase schema cache. Users should then select their actual reliable-tracking date in Settings. Earlier readers' history is retained; the migration is not a bulk data deletion. For a *brand-new* database, run **only** the latest `APP/supabase/schema.sql`. If your existing database is older than v2.3, apply missing migrations (v2.1 → v2.2 → v2.3) in order first.

**Deployment/testing:** From `My_Reading_Room/APP` run `npm test`, `node tests/render-smoke.mjs`, and then `npx vercel --prod`. Deploy `APP/` only. Service-worker cache v2.3.2 includes the new module and prompts fresh assets. Verify in Supabase with two separate accounts that (1) each can save its own tracking date; (2) another's date cannot be edited; (3) a date midweek excludes preceding Sunday/Monday; (4) the daily goal starts on the same date; and (5) summary-only aggregates match. Local automated tests passed; live SQL/Auth/RLS/production/iPhone testing must still be done.

## New in v2.3.1: weeks start Sunday everywhere

All weekly Insights now use **Sunday at 00:00 through Saturday at 23:59** in the reader's local calendar. The seven daily bars on **This Week** are Sunday, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday; Sunday activity no longer rolls into the prior Monday–Sunday week. The *reading time vs historical goal* reference, daily goal success percentages, most-read-book session/day counts, speed trends, and other filtered Insights all use the same current Sunday–Saturday window. The 12-week consistency heatmap starts on a Sunday; day-of-week statistics and the day-of-week × time-of-day routine heatmap list Sunday first. Weekday (Monday–Friday) versus weekend (Saturday–Sunday) averages retain their meaning. **This Month** and **This Year** remain unchanged calendar periods.

This is **presentation and reporting only**: stored `session_date`, time, progress, daily goal history, personal ratings, reading-pass assignments, and year/month totals are not rewritten. No Supabase migration or SQL patch is needed **when upgrading an already migrated v2.3 database**. Bump of `service-worker.js` cache from v2.3 to v2.3.1 ensures fresh static assets after deploy; hard-refresh or close/reopen the installed PWA if an older cached view remains. All **105 automated tests** and source render smoke checks passed locally; run `npm test` and `node tests/render-smoke.mjs` again from `APP/` before deploying it to your existing Vercel project. The `DESIGN_REFERENCE.pdf` includes two new Sunday-first visual addendum pages (152–153), while older pages are historical. Live hosting and physical phone testing have not been performed here.

## New in v2.3.0: edit original read and rereads independently

**The application code and interactive preview are already updated. No JavaScript patch is needed.** This release fixes a case in which currently logged sessions were placed under an imported or implicit original read, even when an earlier read had already finished years ago.

### Example: Dune, first finished in 2022 and rereading now

1. In **My Library**, open *Dune* and choose **Read history** in the book-details popup (or **Edit dates & rereads**).
2. Edit **Original read** to status `Finished`. Set the actual original `Finished on` date if you know it, **or enter only `Finished year = 2022`**. Leave unknown exact dates blank; the system does not invent January 1 or December 31.
3. Choose **Add a reread**, status `Currently reading`, with its actual start date if known. You may add additional previous rereads with separate start/end dates and statuses. The latest read-through controls the book's present shelf/status, not the historic original.
4. Keep **Move existing sessions to the correct reread** selected. The app proposes moves for sessions on or after **known reread start dates** and asks for your confirmation before updating their `read_number`. The session **date, duration, pages, activity type, notes, and ID are never altered** by this correction. If a reread's start date is unknown, sessions cannot be automatically reassigned from date evidence; use the explicit pass selector for new/backdated logging or supply a known start date.
5. Save and inspect the two read-throughs and their separate session counts. Use **Recheck saved session assignments** to safely retry if a previous correction was interrupted.
6. When logging a new session, look for the **Reading pass** selector. The app chooses the read-through corresponding to the session date by default, but you can override it explicitly. It prevents silently saving a new session to a pass that had already finished before that session's date.

**Data rules:** The original and rereads have separate date ranges, time totals and active-day counts. There are no invented historic reading sessions, pages, duration, methods or exact dates. Rereads can be in progress. Existing session data is preserved unless you **confirm** an assignment-only correction. The daily and overall activity metrics still count the saved session once, regardless of pass. Unknown date boundaries remain unknown rather than guessed. This is a corrective data editor; it is **not** an automatic reconstruction of imported Goodreads history.

**Database setup:** Existing v2.2 databases already have `public.user_books.read_history` (JSONB) and `public.reading_sessions.read_number` (integer). **No new table/column is required to edit or reassign reading passes.** The included `APP/supabase/UPGRADE_EXISTING_TO_V2.3.sql` updates the existing **summary-only sharing** aggregate so a book finished in a year-only historical pass counts in that year's finished-books total. Back up your live Supabase database and apply this additive `CREATE OR REPLACE FUNCTION` upgrade if v2.2 is already installed. If updating from an older release, run v2.1, v2.2, then v2.3 upgrades in order. A brand-new empty database uses the newest `APP/supabase/schema.sql` once (do not run upgrades afterward).

**Testing:** Run `npm test`, `node tests/render-smoke.mjs`, `node tests/book-detail-render-smoke.mjs` and `node tests/read-history-render-smoke.mjs` from `APP/`; tests cover the Dune 2022/2026 case, read-pass auto-selection, year-only annual count and session reassignment. The HTML preview is a **sample design**, not a live Supabase data editor. Live SQL execution, Auth/RLS, a Vercel deployment, a real iPhone and a complete browser login/save flow still require validation.

### Existing project upgrade / deployment checklist

1. **Back up** the current Supabase project; use SQL Editor to apply `APP/supabase/UPGRADE_EXISTING_TO_V2.3.sql` on top of v2.2.
2. Deploy **`APP/`** to the existing Vercel project; the service worker has a new cache version `reading-room-v2.3-read-history-pass-fix`.
3. On the live site, verify the editor with a small test book, then Dune, and confirm the correct saved `read_number` in `reading_sessions` before any bulk corrections. Also validate annual goal/summary-only sharing and that row-level security still restricts access across accounts.
4. On desktop and iPhone, confirm new sessions use the current reread and the old original no longer accumulates current activity.

---

## New in v2.2.0: per-book metadata controls, longer TBR history, and design handoff

**These code changes are integrated directly into `APP/` (no JavaScript patching).** They include manual ISBN-10/13, Amazon ASIN, genre list and custom HTTPS cover URL editing in individual book details; an explicit **Look up metadata & cover** action that displays reviewable suggestions; and a dedicated `DESIGN_SYSTEM.md` file with a shared app color palette, typography, component/layout guidelines and implementation map.

- **Save is not lookup:** entering or saving an identifier/genre/cover does **not** start a catalog call. The book-specific lookup button is the only manual metadata-lookup trigger. The automatic catalog enrichment after a Goodreads CSV import continues to operate separately, as specified in v2.1.
- **ISBN and ASIN are different fields:** verified ISBN lookups use exact ISBN metadata. Standalone Amazon ASIN identifiers can be recorded but are not resolvable as Amazon-only catalog entries without an Amazon metadata integration. Some ISBN-10 ASINs can be looked up as exact ISBN-10s. Title/author alternatives must be clearly labeled as approximate.
- **Review first:** lookup suggestions do not overwrite existing identifiers/genres/other fields. A suggested replacement cover requires explicit selection. Saved book edits are protected from being lost during lookup.
- **TBR aging chart:** the Books & Library Insights now has a horizontal distribution of the number of TBR books by age (0-30, 31-90, 91-180, 181-365 days, 1-2, 2-3, 3-4, 4-5, **5+ years**), with counts, shares, median and mean. Year bands use 365-day equivalents. A known `tbr_added_on` is preferred; Goodreads Date Added and created_at may be approximate reference dates. Unknown dates are excluded rather than guessed.
- **Design handoff:** `DESIGN_SYSTEM.md` describes the visual language and where to edit it; `APP/design-tokens.css` contains canonical color/font/spacing tokens (some legacy component colors remain hard-coded in `APP/style.css`). `PREVIEW_SITE/index.html` now includes the TBR chart and a sample metadata-edit screen.

**Existing Supabase database upgrade:** Back up your data. If v2.1 has already been applied, run `APP/supabase/UPGRADE_EXISTING_TO_V2.2.sql` to add the `user_books.asin` column and reload PostgREST schema. If upgrading from an earlier version, apply `UPGRADE_EXISTING_TO_V2.1.sql` first, then v2.2. **New, empty databases:** use the complete latest `APP/supabase/schema.sql` once instead; do not replay upgrades afterward. No database change is needed for the TBR chart or design tokens alone.

**Deployment:** Deploy only `APP/` to the existing Vercel project after applying the migration. Clear the outdated service worker if your browser still serves old CSS. Open a book and test manual Save, URL preview, explicit lookup/review, and the 5+ years distribution. As before, live Supabase/Auth/RLS and iPhone behavior have *not* been verified here.

## New in v2.1.0: automatic Goodreads enrichment and a full library table

**This ZIP already contains the updated running code. Do not apply a JavaScript patch before deployment.** The user's latest v2.0.1 code, conservative edition matcher and all other features remain included.

- **Goodreads CSV import is now two-phase, automatic:** (1) save everything reliably present in the export, including edition year (`Year Published`), original publication year, publisher, binding, page count, ISBN, status, ratings, dates and `goodreads_added_on`; (2) automatically look up missing metadata with visible progress. Existing books are *updated only in empty bibliographic fields* on reimport. Existing personal edits, notes, ratings, read passes, and logged sessions are preserved.
- **For books with a valid ISBN:** only fetch and assign missing *genres* from exact-ISBN catalog records. Never change the ISBN, chosen cover, publisher, binding, page count or edition identity as part of this enrichment step. Batch Open Library ISBN genre queries, then try Google Books for uncategorized ISBNs; missing genre stays uncategorized.
- **For books without ISBN:** look up by title, author and Goodreads publisher/binding/pages/edition year/original year, find a work-level cover and available genres when reliable, and select a specific edition/ISBN only when the existing conservative evidence checks pass. Do not invent editions, physical page progress, dates or chapters. Imported Goodreads values take precedence over catalog values; only blank fields are filled.
- **Safely resumable:** the CSV data is saved before network lookups. Keep the browser tab open; progress is shown during import. Pause between lookups, or reimport the same CSV / use **Fill missing metadata** to finish books left incomplete. APIs may be rate-limited, unavailable or have no suitable metadata; not every book will be completely enriched.
- **My Library genre filter:** filters by *any* assigned genre, with an `Uncategorized` option; works with shelf, text search and reading mode.
- **Covers / Table toggle:** same filters across both views. Full sortable table includes Title, Author, assigned genres, status, rating, pages, ISBN, publisher, binding, edition year, original year, Goodreads added, TBR added, started, and finished dates. On mobile, scroll horizontally to see all columns; tap a row to open its book detail.
- **Privacy:** Personal Goodreads CSV files used for local parser testing are deliberately **not** in this ZIP; the sample books shown in `PREVIEW_SITE/` are fictional.

**Deploy to EXISTING v2.0+ Supabase:** Back up your database, then execute **`APP/supabase/UPGRADE_EXISTING_TO_V2.1.sql`** once in the SQL Editor before deploying `APP/`. This one idempotent script includes the edition columns from v2.0.1 and the new `goodreads_added_on` date. Alternatively, if the v2.0.1 edition migration already ran, execute only `APP/supabase/migrations/2026-11-17_goodreads_added_date.sql`. For a completely NEW Supabase project use the latest `APP/supabase/schema.sql` instead, and do *not* rerun migrations after it.

**Then:** deploy the existing `APP/` contents to the SAME Vercel project, hard-refresh or test in a private tab if an older service worker is cached, open **My Library → Import Goodreads CSV / JSON**, select your CSV, then click **Import & fill metadata**. Wait for progress and check the import summary. Already-imported records can be enriched by **Fill missing metadata** or safely reimporting the CSV to restore missing CSV columns. Do **not** run the full schema.sql on a populated database.

**Local verification:** 93 unit tests, source render checks, per-book edit modal checks, and desktop/mobile interactive preview visual checks have passed. Live Supabase execution and catalog responses have **not** been verified in your accounts; three-account RLS/Auth tests and physical iPhone checks remain to be done.

## Previous patch retained: Goodreads edition matching (v2.0.1)

The uploaded `APP/update-edition-matcher.mjs` was a **truncated, syntactically invalid draft**. Its intended functionality has been completed directly in the canonical `APP/catalog.js` rather than maintaining competing copies. The file `APP/update-edition-matcher.mjs` is now a safe **verification command** (`node update-edition-matcher.mjs`), and the exact original incomplete text is retained as `APP/patches/update-edition-matcher-original-incomplete.txt` for reference.

- **Fixed genres:** `Biography & Autobiography / Sports` maps to Biography plus Sports & Fitness; `Desert ecology` no longer labels *Dune* as Science.
- **Five-field matching:** compares publisher, physical binding, exact/nearby page count, specific edition publication year, and original publication year. Exact ISBN is the strongest match. Low-confidence or tied candidate editions remain **unmatched**; absence of metadata never becomes a guessed page count or invented ISBN.
- **Goodreads import keeps fields:** `Binding`, `Year Published`, and `Original Publication Year` now persist in distinct nullable columns. Existing imported rows are not retroactively guessed or modified by the migration.
- **Book details:** adds editable publisher/binding/two year fields. A new **Match editions** button in My Library intentionally runs enrichment over books without an edition reference, protecting already-known values.
- **Historical v2.0.1 deployment change:** previously required edition metadata migration. For v2.1, use the consolidated idempotent upgrade described above instead.
- **QA status:** all 69 automated tests and the local HTML render smoke test pass. Real Supabase SQL execution, Auth/RLS tests, Vercel production deploy, and iPhone Safari tests are still pending.

## 1. Only five things to navigate

| Path inside ZIP | Purpose | When needed |
|---|---|---|
| **`START_HERE.md`** | This single consolidated handoff: requirements, architecture, tests, setup, security and next steps | **Read first** |
| **`APP/`** | Actual complete v2.3.8 PWA source, images/icons, Supabase schema + sequential migrations, and automated tests | For development, demo, testing, and deployment |
| **`PREVIEW_SITE/index.html`** | Standalone, self-contained **fictional** interactive design mockup, including phone-friendly navigation | For UX reference or hosting just the demo mockup |
| **`DESIGN_REFERENCE.pdf`** | Historical and updated mobile/desktop screenshot references consolidated into one bookmarked PDF | For layout comparison rather than dozens of PNG files |
| **`DESIGN_SYSTEM.md`** | Shareable design guide: palette, fonts, CSS tokens, components, spacing, TBR chart and editing workflow | **Send this file to a designer** |

**Do not upload the full handoff ZIP to Netlify/Vercel as a website.** For the preview, deploy only `PREVIEW_SITE/`. For the actual app, deploy only `APP/` after secure database configuration and review.

### Copy-and-paste prompt for the next ChatGPT conversation

> I'm continuing **My Reading Room**, currently source version **v2.3.8**. This single ZIP is the latest canonical handoff, including the mobile-preview compatibility fix. Unzip it and read `START_HERE.md` fully, then inspect `APP/` source. Use `PREVIEW_SITE/index.html` for interactive visual references and `DESIGN_REFERENCE.pdf` for screen reference images. Read `DESIGN_SYSTEM.md` before modifying any colors, typography or layout. Preserve every existing feature, the reading/audiobook calculation rules, database sharing security, and accumulated designs. Before finishing any changes, run the included tests, update this handoff guide and mockup if affected, and return **one revised simplified ZIP** with the same layout. The app has **not** been deployed or RLS-tested against live accounts; do not claim otherwise.

## 2. Product at a glance

**My Reading Room** is a phone-first installable **Progressive Web App (PWA)** combining Goodreads/Shelfy-style library management, fine-grained personal reading-session logs, reading analytics, configurable bookshelf design, and independent user accounts with directional access sharing. The source is **vanilla HTML/CSS/JavaScript** (no frontend build step), Supabase Auth/Postgres/RLS, Open Library (optional Google Books), and static HTTPS hosting compatible with Vercel.

Users install the **same hosted website** on their own phones; they do **not** need the ZIP. On iPhone, use Safari **Share → Add to Home Screen**; Android users can use Chrome **Install app**. It is not a native App Store binary or immersive 3D app.

### Library and book management

- Shelves: **To Be Read, Currently Reading, Finished, DNF**; **Favorites** is an independent overlapping flag, not a mutually exclusive status.
- Search books by title, author or ISBN through Open Library; choose the **exact print edition** where possible, including cover/page count/ISBN; optional Google Books fallback, manual book entry, compatible barcode scanning.
- Book details include authors, edition, genres, rating, series/publication data, reading progress, reading-session history, notes and relevant book metrics.
- Goodreads CSV import/export supports shelves, ratings, edition metadata, original publication year, Goodreads Date Added, historical completion dates and automatic missing-metadata enrichment, but **does not fabricate historical session time, activity methods, chapter mappings, or streaks**.
- Personal ratings are **0.25–5.00 stars in quarter-star increments**, with unrated supported.

### Three per-session activity labels

Every **session** (not each whole book) has exactly one:

1. **Reading Only** (`reading`)
2. **Audiobook Only** (`audiobook`)
3. **Read + Listen** (`read_listen`)

All / any individual method can be filtered in library, journal, virtual bookshelf and Insights. A mixed session is **one session, one duration and one quantity of progress**, never double-counted.

### Session logging and stopwatch — non-negotiable data integrity

- Every session requires **book, date, positive elapsed time, and progress**; **no time-only logs**.
- **Time + Ending Page:** enter the final page and positive duration. The application takes the prior saved ending page or current page in Book details, calculates the difference, and saves `start_page`, `end_page`, and `pages_read`. Older manually counted `pages_read` stays valid; missing historic position is not fabricated. In audiobook-only mode the page location means **print-edition page-equivalents**, not physical pages read.
- **Time + Exact Chapters:** only when the exact **start and end pages for every included chapter** have been verified for the **specific selected edition**. No average page estimates, chapter-count interpolation or audio-length-derived pages.
- **Time + Audiobook Position** in Audiobook Only or Read + Listen: log exact start/end position in whole minutes **within the recording**, plus actual elapsed session minutes. `pages_read=NULL`; time/streaks count, pages/speed do not.
- Read + Listen can also use pages/verified chapters; do not double-count the duration or progress.
- **Stopwatch:** optional timestamp-based Start/Pause/Resume/Stop & Use Time, with manual duration as backup. **No countdown timer**; mobile PWA lock-screen alarms cannot be guaranteed.
- Optional session-local start time (`HH:MM` in **24-hour clock**) supports time-of-day Insights. Missing historic times remain **Unknown**, not inferred.
- A session spanning bands/midnight can have its **minutes** distributed to the actual clock period; whole-session pages for speed-by-time-of-day are assigned to the start period because subperiod page attribution is unknowable.
- Audiobook-position-only minutes count towards time and daily goals, not pages per hour. The physical-reading-speed metric **excludes audiobook-only** sessions; audiobook page-equivalent speeds are separate.

### Calendar goals, consistency and recorded speed

- **This Week** means current **Sunday–Saturday**, daily granularity.
- **This Month** means current calendar month, daily granularity.
- **This Year** means **January–December**, **12 monthly totals**.
- Keep the distinct-finished-books **annual challenge** (not a monthly goal). One book completed using multiple methods counts once. Historical reread completions can contribute to reread statistics; do not accidentally duplicate distinct-book annual counts.
- Separate, editable **daily reading-time goal** (default **30 min**): every activity type counts; combined time once. Track progress, goal-met dates, goal success percentage, separate goal streak, and heatmap markers.
- **Historical daily-goal reference never rewrites older days**: if goal changes midmonth, earlier dates keep their then-effective target; the new value applies from its effective date. Week/month show daily actual vs goal; year shows monthly actual vs **sum of each day's historic goal**, excluding future days. Missing pre-migration goal changes cannot be reconstructed.
- **Book-specific active reading days** count distinct session dates; **elapsed calendar days** are inclusive from start to finish or today if in progress. Show consistency = active/elapsed; multiple same-day sessions count as one active day.
- Reading speed = **sum of recorded pages (or separately labeled page-equivalents) / sum of eligible recorded session hours**, not an unweighted average of individual session speeds. Break out Overall, Reading Only, Audiobook Only, Read + Listen; by book, primary genre, time of day and calendar period. Sessions without known pages are excluded from page-speed calculations.
- Most-read book rankings are ordered by logged **time**, additionally displaying session count and distinct active reading days under the selected period/mode filters.

## 3. Insights navigation: all current metrics

**Overview:** total time, known page progress, annual distinct-finished-books goal, daily reading-time target/progress, goal reference vs actual time by Week/Month/Year, streaks, heatmap, most-read books (time/sessions/days), top books, rating distribution, per-book activity chart, book reading days, and activity filters.

**Habits:** reading time by time of day; weighted page-progress speed by time-of-day starting band; seven-day patterns and weekday/weekend comparison; average/median/longest session and duration buckets (1–15, 16–30, 31–60, 61–90, 91+ minutes); the **Reading Only / Audiobook Only / Read + Listen pie chart** by total logged minutes (with session counts and percentages); daily goal success rate/streak; seven weekdays × five time-bands Routine Heatmap. **Desktop/tablet:** wide routine heatmap sits **beside** smaller activity pie; **mobile:** heatmap above the pie.

**Performance:** weighted pages/hour overall and by mode, book, primary genre and time band; speed by week/month/year and individual titles. Audio page-equivalent figures are always identified, and pages are never inferred from audio time.

**Books & Library:** library status/genre distribution; average personal quarter-star ratings by genre; ratings distribution; genre-specific stats; TBR aging using explicit date added when present (with disclosed fallback where applicable); completed-book efficiency (active days, elapsed days, pages or minutes per active day); reread history and original-vs-reread method/time comparisons.

### Exact five time-of-day bands (local time, 24-hour labels)

| Label | Local clock range |
|---|---|
| Morning | **05:00–10:59** |
| Midday | **11:00–12:59** |
| Afternoon | **13:00–16:59** |
| Evening | **17:00–19:59** |
| Night | **20:00–04:59** |

Time-zone and midnight handling should be reviewed in live use. Sessions with no real start time are **Unknown**, never assigned a fabricated band. Genre-speed grouping uses **one primary genre per book** (first genre tag) to avoid double-counting.

### Rereads (v1.9–v2.0)

- **Start reread** for a Finished or DNF title creates/updates a numbered reading pass in `user_books.read_history` and labels new sessions with `reading_sessions.read_number`. Original completion date and earlier sessions are preserved.
- Books & Library shows books reread, rereads started/finished, currently rereading, total reread sessions/time, most-reread books, first-read vs latest **completed** reread aggregate comparison, and the most common primary activity-type switch (when known).
- Individual book details compare the original read with **every later pass**, including current incomplete pass. Per-pass: dates, primary method (**largest logged time; ties → Mixed methods**), method-by-method share of logged minutes, time spent, number of sessions, distinct active days, inclusive elapsed days, known pages per active day and weighted speed (when eligible).
- Report original vs reread **time difference / percentage difference only when both passes are complete and sufficiently logged/timed**. If either is imported with no session logs, show **Not recorded/Unknown** rather than zero. Partially timed logs must be flagged, not silently compared.
- Read + Listen contributes one duration only; audiobook print-page equivalents remain distinct from physical pages. Never invent a historical reread from Goodreads dates.

### Virtual bookshelf

- CSS-dimensional cover/spine/mixed book arrangement, draggable order, Favorites, user-selectable finishes (walnut, oak, slate), plant/candle/frame decor.
- Actual physical book measurements can influence displayed size where known; page-count-based thickness is **visual only**, never evidence of real reading progress.
- Fully immersive 3D/WebGL is **not implemented**. Full-sharing viewers may explore, **not edit** another person's shelves.

## 4. Accounts, sharing and privacy — critical architecture

Every reader registers a **separate Supabase Auth account**. Owners independently decide whether to share access to each viewer (**directional**, owner → viewer). It is **not** a permanently linked pair.

| Grant | Viewer can access | Viewer cannot access |
|---|---|---|
| **Full** | Owner's raw library/title metadata, TBR/Favorites, notes, shelf, ratings, session logs, detailed Insights | Insert/update/delete **any** owner data |
| **Summary Only** | Only whitelisted **aggregate** summary of the permitted owner (annual counts/goal, Favorites count, average rating, total minutes and method distribution, session count) | Raw books, chapter maps, notes, dated session rows, shelf, daily goal/history or detailed Insights |
| **None / revoked** | No private content from owner | All private content and aggregates |

- Owner can issue a random **single-use invite**, **7-day expiration**, specifying Full or Summary Only; recipient signs in first and redeems it. Reciprocity requires **two separate shares**.
- Owner can upgrade/downgrade/revoke each viewer. A Full viewer is strictly read-only. Revocation blocks future queries but cannot undo a screenshot made earlier.
- Enforce access at **database RLS**, not only UI. Owner and Full viewers can SELECT relevant raw rows; Summary Only cannot SELECT raw rows and instead receives authorized fields from restricted `get_viewable_profile_summaries` RPC.
- Only owners can perform writes. `profile_shares`, `reading_goals`, `reading_goal_history`, `user_books`, `reading_sessions`, `chapter_boundaries`, shelf data and reread records require appropriate policies. Supabase **service_role, secret, or SMTP credentials must never go in client-side files**.
- Demo mode uses **fictional local profiles**, useful for previews but **not proof of cloud security**.

## 5. Application map (minimal, source kept intact)

```text
APP/
  index.html, style.css, app.js       Main UI and responsive styling
  design-tokens.css                  Shared app palette, typography and spacing
  book-detail-metadata.js            Per-book ID/genre/cover controls and explicit lookup
  db.js                               Local demo and Supabase repository adapters
  catalog.js                          Open Library/Google Books catalog
  reading-metrics.js                  Weighted pace and session aggregations
  reading-habits.js                   Time bands, routines, goals and patterns
  reading-history.js                  Reading passes and reread comparisons
  session-clock.js                    Stopwatch time helpers
  config.js                           Public Supabase config (project URL and publishable key already provided; no secret)
  manifest.webmanifest, service-worker.js, vercel.json, assets/
  supabase/schema.sql                 Clean NEW database only
  supabase/migrations/*.sql           Version-specific upgrades for EXISTING DBs
  tests/                              Local automated tests + render smoke
  package.json                        npm test; no build step
PREVIEW_SITE/index.html               Self-contained design mockup, not source app
DESIGN_REFERENCE.pdf                  Consolidated, bookmarked screenshot reference
DESIGN_SYSTEM.md                     Shareable design tokens, style/UX rules and editing map
```

The original handoff's repeated prompts, README copies, historical change notes, redundant screenshot PNGs and development-only export scripts were consolidated/removed from **this export**, but **no running application code, SQL migration, asset, or test is deliberately removed**. Need the old historical change notes? Major decisions from v1.1 through v2.0 are recorded above, and the most recent screens are in the PDF.

## 6. Get started locally

Use a Mac/desktop terminal, with Python 3 and Node.js installed:

```sh
cd APP
python3 -m http.server 5173
# Open http://localhost:5173 in a browser
```

The uploaded `APP/config.js` **already contains a public Supabase URL and publishable key**, so this package attempts cloud sign-in by default. To test with **fictional browser-local demo data**, make a **temporary local copy** of `APP/config.js` and set both fields to empty strings in that copy. Do not accidentally deploy an empty config file; do not add service-role or secret keys to the browser.

In a separate terminal:

```sh
cd APP
npm test
node tests/render-smoke.mjs
```

**v2.1 local QA:** 78/78 Node tests, source render smoke, edition matcher verifier, and desktop/mobile interactive preview checks passed. The v2.1 SQL was syntactically reviewed but has **not** been executed against your live Supabase instance. No production or physical-phone behavior is certified.

**Earlier v2.0.1 QA (retained for history):** 69/69 Node automated tests passed (61 existing + 8 new edition matching tests), application render smoke passed, JavaScript syntax checks passed, matcher verifier passed. The earlier 58/58 count described the original v2.0 export, not this revision. **Actual physical phone/Safari/production browser verification remains outstanding**.

## 7. How to launch the actual shared app (not yet performed)

1. **Backup if upgrading an existing database**, and use a staging Supabase project. Create Supabase Auth setup for separate users. Email/password signups for arbitrary recipients need **custom SMTP** (Supabase's default development mail delivery is restricted); alternatives require separate Auth provider implementation/testing. Confirm signups, emails and redirect URLs.
2. **Brand-new database:** Run **only** `APP/supabase/schema.sql` **once** in SQL Editor. **Do not run the migrations afterward**, as the latest schema already incorporates them.
3. **Existing database:** Backup; inspect which migrations have already run. Apply **only missing** migrations in this exact **historical order**. Never execute the full new-project schema on a populated database:

   ```text
   APP/supabase/migrations/2026-11-13_modes_and_profile_sharing.sql
   APP/supabase/migrations/2026-11-13_audio_page_equivalents.sql
   APP/supabase/migrations/2026-11-16_daily_minutes_goal.sql
   APP/supabase/migrations/2026-11-16_versioned_daily_goal_history.sql
   APP/supabase/migrations/2026-11-16_reading_habits_and_tbr_dates.sql
   APP/supabase/migrations/2026-11-16_reread_history_and_session_rounds.sql
   APP/supabase/migrations/2026-11-17_edition_metadata.sql
   APP/supabase/migrations/2026-11-17_goodreads_added_date.sql
   ```

   **For a project already upgraded through v2.0**, apply the idempotent `APP/supabase/UPGRADE_EXISTING_TO_V2.1.sql` **followed by** `APP/supabase/UPGRADE_EXISTING_TO_V2.2.sql` before deploying. The first adds edition metadata and historical Goodreads Date Added; the second adds nullable `user_books.asin` and reloads the Supabase API schema cache. **If v2.1 is already installed, apply only v2.2.** Neither script erases existing book records or retroactively guesses their bibliographic values. Earlier version-specific upgrades should not be reapplied. The SQL has **not** been validated against a real Supabase deployment in this project; review staging logs and privacy policies.
4. Confirm `APP/config.js` points to **your intended Supabase project**. The uploaded file already contains a public URL and publishable key; do not change these unintentionally. Never place service-role/secret keys or SMTP credentials in frontend assets.
5. Publish **contents of `APP/` only** to an HTTPS static site after the SQL update. The uploaded project is already linked locally to a Vercel project (see `APP/.vercel/project.json`), but **this file is not authentication**. On the Mac, open Terminal in `APP/`, run `npx vercel login` if needed, then `npx vercel --prod` (or deploy through a connected Vercel integration). Confirm Supabase Auth redirect URLs for that domain. This ZIP itself has NOT been deployed.
6. In My Library, import a Goodreads CSV and use **Import & fill metadata**; the auto-enrichment now runs immediately after CSV save. In individual book details, the **Look up metadata & cover** control is separate from Save and starts a lookup only on request. The separate **Match editions** action remains available to manually identify uncertain book editions. Exact ISBN wins; title/author plus publisher, binding, pages, edition year and original year contribute to confidence. Uncertain matches are left without a verified edition key; existing page counts/covers/ISBNs are preserved. Inspect the matched edition before entering exact chapter maps.
7. Perform the full **three-account security acceptance** below before adding private data. Install from Safari/Chrome on real phones only after successful HTTPS launch.

**Hosting cost caveat:** Small personal/noncommercial usage may fit available free hosting/DB tiers, but pricing/eligibility/quota can change. A verified domain and third-party SMTP may add fees. Do not promise perpetual $0 or email delivery from Supabase's default SMTP.

## 8. Mandatory live multi-account security/QA acceptance

**None of these live checks have been executed yet.** Use three independent confirmed test Auth users: **Alice** (owner), **Bob** (Full viewer) and **Cara** (Summary Only viewer).

1. Alice grants Bob Full and Cara Summary Only with separate one-use invitation codes. Verify `profile_shares` direction and invite expiry/reuse rejection; a viewer cannot self-grant access.
2. Bob sees Alice's titles, notes, Favorites, sessions and Insights but is **denied INSERT/UPDATE/DELETE** to her rows even by raw client requests.
3. Cara sees **only** the approved aggregate RPC summary. Direct authenticated SELECT against Alice's `user_books`, `reading_sessions`, `chapter_boundaries`, `reading_goals`, `reading_goal_history`, shelf settings, and read history must return **no raw data**. No leaked per-book title, timestamp, genre or chapter.
4. Verify no reciprocal access unless Bob/Cara separately share back to Alice. Check downgrade Full → Summary, upgrade back, and revoke with direct SQL/API queries after refresh. No unauthenticated enumeration.
5. Ensure read-number and `read_history` fields are protected by the same owner/Full-viewer RLS rules and not leaked via Summary Only; check the whitelisted aggregate function and completion dates.
6. Reject time-only sessions, zero/negative pages, invalid audio positions, incomplete/overlapping edition chapter boundaries. Accept audiobook-only **known pages** and exact mapped chapters, storing page-equivalents distinctly; audio-position-only must produce `pages_read=NULL`.
7. Confirm Read + Listen total time once and separate physical-reading pace from audiobook-only equivalent pace. Filter by period/book/mode and verify per-book active day counts.
8. Change Alice's goal 30 → 45 min on a chosen day: previous dated goals **must not retroactively change**; the yearly goal reference must sum the correct daily references, with future dates excluded.
9. Verify Bob may view but not change her goal history, Cara cannot SELECT it. Test reading-mode time split, midnight crossing, Unknown start times, five time-band heatmap and genre speed.
10. Verify reread creation preserves previous completion and sessions; method share and time differences reflect only actual logged sessions, hide unreliable comparisons, and do not double-count books.
11. Confirm real email confirmation/SMTP, login persistence, logout, import/export privacy, service worker updates, and phone Home Screen operation. Check visual layout in Safari on a real iPhone.

**RLS is a database property.** Hiding parts of a screen is not a permission test. A viewer can call the same API directly.

## 9. Mobile design-only preview (separate from real application)

`PREVIEW_SITE/index.html` is a **standalone** interactive design file with all styles/scripts embedded and **fictional data**. Local opening in Mac browsers should work, but ChatGPT/iPhone Files `.html` attachment previews may block active scripts. For a proper mobile demo, on a Mac go to <https://app.netlify.com/drop/>, drag the **`PREVIEW_SITE` folder** (or a ZIP of only that folder's contents with `index.html` at its root), then open the resulting `.netlify.app` HTTPS link in iPhone Safari.

This public mockup site is **not** the actual reading tracker, requires no Supabase, and must not receive real personal data or credentials. It has not been tested on a physical iPhone; local mobile-sized Chromium testing was reported successful.

The companion `DESIGN_REFERENCE.pdf` is a single static, navigable design reference consolidating earlier screen references, including four new v2.3.5 Friend Comparison desktop/mobile pages (156–159), and four v2.2 desktop/mobile examples for metadata editing and the expanded TBR chart. Some tall dashboard screens occupy multiple PDF pages to preserve legibility. **Design previews do not establish that live Auth/RLS work.**

## 10. Current state and next-developer priorities

- **Implemented locally:** PWA HTML/CSS/JS, automatic Goodreads enrichment, sortable/filterable Library table, browsing/import, sessions and stopwatch, exact chapter mappings, daily/history goals, Insights/heatmaps/speed/genre/rereads, profiles and source-level sharing/RLS SQL, bookshelf, standalone mockups, test coverage.
- **Not yet validated:** cloud Supabase schema/migration execution, actual three-account RLS permission isolation, confirmed SMTP/Auth signup, complete app deployed to public HTTPS, live iPhone/Android device operation and real-world offline/PWA behavior.
- **Priority order:** (1) run local tests; (2) inspect and safely stage Supabase schema; (3) 3-account direct RLS tests; (4) deploy app and configure Auth; (5) iPhone/Android installation and timer accuracy checks; (6) iterate UX and analytics after real usage.
- Do not conflate **design mockup** and real app. Do not guess missing historical data. Keep all decisions in this file, update it when making future changes, then deliver **one** ZIP using the five-entry structure in Section 1.

## Version progression (compressed, for context)

| Version | Main feature milestone |
|---|---|
| v1.1 | Independent accounts, directional Full/Summary invitations, mode labels |
| v1.2 | Exact known audiobook print-page equivalents / audio position |
| v1.3 | Active-vs-elapsed reading days; timestamp stopwatch |
| v1.4 | Weighted reading speed by activity type and book |
| v1.5 | Most-read titles show time, sessions, distinct days |
| v1.6 | Daily reading-minute goal, target streak and heatmap |
| v1.7 | Historical daily-goal reference chart (changes nonretroactive) |
| v1.8 | Habits/Performance/Library navigation, time-of-day and TBR analytics |
| v1.9 | Five 24-hour bands, genre speed, activity pie, reread tracking |
| v2.0 | Heatmap/pie responsive side-by-side; original-vs-reread detail comparisons |
| v2.1 | Automatic Goodreads CSV metadata enrichment; genre filter and sortable full library table; historical Goodreads added date |
| v2.2 | Manual book ISBN/ASIN/genre/cover edit, explicit book-level lookup, TBR aging distribution through 5+ years, consolidated design tokens and designer guide |
| v2.3 | Manual original/reread history, year-only completion and session pass correction |
| v2.3.1 | Sunday-first weekly calendar throughout Insights |
| v2.3.2 | Per-account tracking start date for Week/Month/YTD Insights and daily goal cutoff; summary sharing updated |
| v2.3.3 | Log Reading defaults to Currently Reading, with searchable full-library escape hatch and Add book shortcut |
| v2.3.4 | Friend feed, quick Insights, daily goal baseline, book image caching, standardized genres and status control |
| v2.3.5 | Full friend comparison with all Insights metrics and sharing restrictions |
| v2.3.6 | Ending-page session logging, accurate pages read and related SQL migration |
| v2.3.7 | Refined Friends cards and charts, subtle goal reference and high-contrast per-book chart colors |
| v2.3.8 | Exact-ISBN chapter lookup, browser contents-page OCR, reviewed chapter import, opt-in shared ISBN mappings and database migration |
| v2.3.9 | Goodreads historical finished-book count restored across Insights and shared summaries; Quick Summary amber Daily goal; four reading-speed-by-time-of-day series; own activity and true session clock times in Friends feed; future Reading Replay design documented (not built) |
| Mobile preview compatibility fix | Self-contained mobile-friendly preview intended for HTTPS hosting; **no app feature change** |

**End of canonical handoff.**

---
## v2.4.3 - Series details and catalog count lookup

See `RELEASE_NOTES_v2.4.3.md` and `APP/SERIES_CATALOG_SETUP.md`. The app now includes an optional server-side List Of Books lookup service (`LOB_API_KEY` in Vercel) and an additive Supabase migration (`APP/supabase/UPGRADE_EXISTING_TO_V2.4.3.sql`). Goodreads-derived series metadata and manual edits continue to work without the provider. In a configured environment, new books and the first eight distinct series in an import can receive missing series information, with all source totals editable and attributed.
