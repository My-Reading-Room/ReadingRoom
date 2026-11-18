# My Reading Room | Design System and Visual Handoff

**Design reference version: 2.4.1 (2026-11-18)**

This is the **single shareable design specification** for anyone changing My Reading Room's appearance. It documents the actual app's visual foundations, conventions and change points without requiring access to Supabase or user data.

## 1. Design direction

- **Character:** quiet, literary, tactile, welcoming. A personal reading nook rather than a corporate analytics dashboard.
- **Color:** warm off-white surfaces, forest/sage greens, restrained warm gold; generous space and understated borders.
- **Hierarchy:** elegant serif editorial headings + highly legible sans-serif interface labels and data.
- **Reading first:** book covers and reading status should remain prominent; metrics are calm and clearly labeled. No gradients or neon treatment on analytics panels.
- **Accessibility:** maintain visible keyboard focus, sufficient text contrast and 40px-class touch controls. Avoid color-only explanations; numerical values and labels remain visible.

## Exact chapter sourcing and shared ISBN maps (v2.3.8)

**Location:** Book Details → Exact chapters, within an inset sage panel. Three calm, secondary discovery controls: Look up Open Library, Find shared mappings, and Read photo. Add a collapsible paste-text option for scanned/OCR failures. Keep source identifiers and edition/page-count differences visible. Scan runs locally in the browser. No content image is ever persisted or shared. Never mark imported chapter starts as exact automatically.

**Editor:** An inset white review card shows one responsive row per chapter (title, start page, end page, remove control). Suggest endings from the next chapter's starting page only as a draft, leave the final chapter end empty, clearly label those values *candidates*. Support adding/removing rows and correcting OCR errors. At narrow widths (320–390px) put the chapter title on its own line and keep the two numeric inputs side-by-side beneath it. Require a legible acknowledgment checkbox and a full-width Save verified chapter map button. Keep the original editable, owner-only single-chapter editor below. Community candidates must display an independent-verification warning before import. Avoid raw JSON, bare metrics, or overflowing table layouts.

**Sharing:** The opt-in Contribute my verified map and Withdraw my contribution controls are small secondary actions below the review editor; clarify that it shares chapter names/page boundaries only, not the person's reading sessions or profile. Shared suggestions require the same confirmation and edition-specific page validation as any Open Library/OCR draft.

## v2.3.9 chart, social feed and recap design notes

- **Daily goal reference:** In both Quick Summary (minutes only) and Detailed Insights, keep the Daily goal fine, dashed, and secondary to the data. Use warm amber **`#b67b39`** (not the cool gray grid/axes), stroke opacity about 0.68–0.8. Behind stacked bars; label plainly **Daily goal**. Never display a minutes goal on a pages chart. Historical targets from all reading modes remain full-day totals even if bars are filtered.
- **Reading speed by time of day:** In each of five bands show 4 labeled values/mini-bars: All activity (violet), Reading Only (green), Audiobook Only (blue), Read + Listen (gold). Show real measured pages/hr, not an unweighted average of mode speeds. Missing page/time data shows `—`. Small phones stack each band and its mini-bars in one column.
- **Friends Activity:** Show **You** in the same chronological stream as authorized Full-sharing friends. Display date and true local session start time if known; the `created_at` upload timestamp does not stand for a reading time. Hide time for books started/finished from Goodreads dates. Summary-only profiles do not expose book/session activity; a user always sees their own entries. Include `You` badge and an unobtrusive time below the date on mobile.
- **Reading Replay (now implemented):** Week/Month/Year storytelling shipped in v2.4.0, then restricted to completed periods in v2.4.1. Older concept discussion below is historical. A quiet, once-per-completed-period in-app celebration is shown to signed-in owners with recap data; no push/email or new database table.

## New session input — ending page instead of page count (v2.3.6)

The actual app's **Log → New reading session → Time + Ending Page** uses two primary fields: **Session time (minutes)** and **Page left off on**. A subtle progress strip below the page field shows the starting page from **Book details → Current page** and immediately computes a real progress delta. Example: starting at page 120 and ending at page 145 yields 25 pages, with Book details updated to page 145. This is a **measured difference**, not a speed or chapter estimate. The default calculation spans Reading Only, Audiobook Only (print-edition equivalent pages), and Read + Listen. Exact Chapters and Audio Position modes remain available and are not overwritten.

Show the optional **Correct starting page** control only when needed; for historic legacy logs with no recoverable baseline, the starting page field appears automatically. Never silently infer legacy positions or recalculate later sessions; a backdated entry must not change the current reading position. The new component CSS classes are `.page-progress-source`, `.page-progress-result`, and `.page-start-toggle`; use the primary green design tokens and the existing mobile two-column form. The companion preview's **Log · Ending Page** screen is illustrative only; `DESIGN_REFERENCE.pdf` remains historical.

## New Friends Comparison — design and behavior (v2.3.5)

The **Friends** nav page contains a segmented control with **Activity feed** and **Compare friends**. The comparison screen has a friend selector, Sunday-first period selector (This week / This month / This year), and an optional year selector for a Full-sharing comparison. Distinguish your values (forest-green accent) from the friend's (muted warm-brown accent) with **clear text headings and numeric labels, not color alone**. Use existing app tokens where possible; the view is designed for narrow phone widths, with no horizontal scrolling required for side-by-side values.

Six collapsible metric groups organize the full Insights surface: Overview and activity; Goals and consistency; Speed and reading performance; Time of day and reading habits; Books and shared interests; TBR, completion efficiency and rereads. Each paired table uses a **Metric / You / Friend** column header, clear units, and optional simple proportion bars. Heatmaps show the five clock bands across Sunday–Saturday for each reader, stacked on mobile. Speed values always use pages/hr with a dash for unmeasurable speed; blank clock times remain Unknown. The primary comparison uses the existing user's and the friend's own tracking cutoffs rather than pretending they have identical data coverage.

Friend book matches are based on normalized **title + author**, not edition ISBN, and therefore intentionally treat different editions of one work as overlapping. Preserve individual edition metadata in each library; don't fabricate shared ratings or start dates. Period-specific metrics can be compared for Week, Month or Year, while TBR aging, genre/ratings, shelf and reread sections are **lifetime** (as in the original Insights).

**Privacy is mandatory:** Summary-only permission reduces the comparison to the authorized current-year aggregate metrics. Do not reveal book titles, author, genre, per-session data, page speed, clock habits, timelines or individual rating differences. Never fetch private rows using service-role credentials to construct the page. Data authorization is enforced by Supabase RLS plus `APP/friend-comparison.js`; the display lives in `APP/friend-comparison-view.js`. Reusing pure functions from `reading-metrics.js`, `reading-habits.js`, and `reading-history.js` prevents calculations drifting from the main Insights page. No new SQL schema is needed for v2.3.5.

Designer reference: **Friends · Compare Insights** in `PREVIEW_SITE/index.html` (fictional data only), plus the latest comparison screenshots appended in `DESIGN_REFERENCE.pdf`. CSS component classes begin with `.compare-` in `APP/style.css`.

## New session book picker (v2.3.3)

Inside **Log Reading → New reading session**, the book dropdown lists only books on the **Currently Reading** shelf on initial load. Beneath the field, two small responsive secondary buttons provide **Choose another book** (toggles the searchable complete library) and **Add new book** (opens the existing catalog add modal). The full-library dropdown displays the book's existing status; title/author searching is only present when the alternate picker is open. A back button returns to the limited selection without modifying the book's shelf. If there are no currently reading books, keep the field disabled and show a clear empty-state explanation plus the alternate options. Preserve the single-book selection and read-pass editor: no change to session ownership, reread dates or permissions. Use existing green secondary buttons and `--color-primary`; on mobile buttons may wrap to two columns. The design preview's **Log · Pages** screen is interactive for both picker modes. This is a **UI-only change** and needs no database migration. The actual selection logic lives in `APP/session-book-picker.js`, application rendering in `APP/app.js`, styles in `APP/style.css`.

## New account setting: tracking start date (v2.3.2)

The real app now includes a **Tracking start date** date input and independent Save button inside **Settings → Your account**. The selected date is printed near the Insights calendar-period label as `Tracking since ...`. Daily-goal summaries, goal reference chart, consistency heatmap and calendar-day averages respect this inclusive start; periods remain Sunday–Saturday, calendar month and year. Each account's profile owns its date; shared views use the selected owner's cutoff. Older log records are not deleted. Keep an accessible date label, explain what is counted, and do not imply that a year-only completion had a known day. No new color tokens are required.

Key files: `APP/app.js` (UI and filters), `APP/tracking-start.js` (pure date scope rules), `APP/reading-habits.js` (weekday denominator), `APP/db.js` (persistence), `APP/supabase/UPGRADE_EXISTING_TO_V2.3.2.sql` (migration). `PREVIEW_SITE/index.html` has a new **Settings · Tracking Start** interactive design screen. Its metrics are illustrative, not live. The bundled `DESIGN_REFERENCE.pdf` still contains earlier historical screens; inspect the actual app and preview for the newest account-setting control.

## 2. Source-of-truth files and what they do

| File | What to edit | Important caveat |
|---|---|---|
| `APP/design-tokens.css` | **Primary palette**, body/heading font stacks, radius, spacing and key chart colors | This is the preferred starting point for new design work. |
| `APP/style.css` | Current application UI: sidebar, cards, buttons, book details, charts, bookshelf, mobile rules | Many pre-v2.2 component shades are **still hard-coded**. Not every CSS rule is driven by a token yet. |
| `APP/index.html` | HTML shell, theme-color and loading state | Link order: `design-tokens.css` **before** `style.css`. |
| `APP/app.js` | App interface structure, labels, controls, chart and book-detail markup | Keep data calculation logic separate from visual changes. |
| `PREVIEW_SITE/index.html` | Standalone interactive **design** mockups for another designer | The preview is self-contained, uses **fictional** books and a related but not identical palette. It is not the live app. |
| `DESIGN_REFERENCE.pdf` | Browsable screen examples from past versions | Historical reference only; newer details are also in `PREVIEW_SITE/` and the real app. |
| `START_HERE.md` | Product and deployment handoff, security/analytics requirements | Read before modifying workflows or privacy assumptions. |

If you adjust a token, check whether a component also has a fixed hex color in `APP/style.css` or `PREVIEW_SITE/index.html`. Those must be updated separately for consistent results.

## 3. Application color palette

Canonical colors in `APP/design-tokens.css`:

| Semantic role | CSS variable | Hex | Typical use |
|---|---|---|---|
| Primary forest green | `--color-primary` | `#2D5941` | Primary buttons, navigation emphasis |
| Dark forest | `--color-primary-dark` | `#234532` | Strongest text/green treatments |
| Soft green | `--color-primary-light` | `#EDF4EB` | Light actions, soft backgrounds |
| Body text | `--color-text` | `#263D31` | Main reading text |
| Page background | `--color-background` | `#F6F6F0` | Main application canvas |
| Card / paper | `--color-surface` | `#FFFEFA` | Cards, popups, top bar |
| Borders | `--color-border` | `#E3E8DF` | Hairline dividers and containers |
| Muted text | `--color-muted` | `#78887D` | Descriptions and quieter labels |
| Gold accent | `--color-accent` | `#BF955B` | Highlights, small editorial accents |
| Danger | `--color-danger` | `#A75751` | Destructive or invalid actions |

### Chart series colors

| Meaning | Token | Hex |
|---|---|---|
| Reading Only | `--color-chart-reading` | `#568468` |
| Audiobook Only | `--color-chart-audiobook` | `#557FA0` |
| Read + Listen | `--color-chart-combined` | `#B28A56` |
| TBR age bars | `--color-chart-tbr` | `#628C71` |
| Reading speed | `--color-chart-speed` | `#8572A1` |

Important: read/listen colors are **categorical**, not rank or goal levels. Charts must include visible labels or a legend; never rely on the hue alone. Soft chart background (such as `#EDF2E9`) represents *empty track*, not a missing book count.

### A few legacy UI colors

The app still uses deliberate legacy shades in component rules, such as `#F5F6F0` (sidebar background), `#E1EDDF` (selected nav), `#EEF4EC` (KPI cards), `#FCF4E8` (warning), and `#FFF0EE` (error). Review these in `APP/style.css` rather than assuming changing the main token will update every individual shade.

## 4. Typography

| Role | Font | Typical size | Weight / note |
|---|---|---|---|
| Main page heading | `Newsreader`, serif fallbacks | 39px desktop | 500, tight tracking |
| Section heading | `Newsreader`, serif fallbacks | 23px | 600 |
| Card subheading | `DM Sans`, system sans-serif | 13px | 800 |
| Body / controls | `DM Sans`, system sans-serif | 12-13px | 400-750 |
| Data labels / footnotes | `DM Sans`, system sans-serif | 10-11px | 500-750 |
| KPI number | `Newsreader`, serif fallbacks | 30px | 500; tabular numbers where necessary |

The application loads these font families from Google Fonts in `APP/style.css` with OS/browser fallbacks. Do not include or redistribute font files. The preview currently uses Inter/system sans and Georgia for a lighter-weight independent prototype; consolidate later if a perfectly pixel-matched preview is essential.

## 5. Spacing, shapes and sizing

- Spacing tokens: `--space-1` = 4px, `--space-2` = 8px, `--space-3` = 12px, `--space-4` = 16px, `--space-5` = 20px, `--space-6` = 24px, `--space-8` = 32px.
- Control radius: 9px (`--radius-control`); card radius: 15px (`--radius-card`); chip radius: 10px (`--radius-chip`).
- Default button minimum height: 39px; text entry minimum height: 40px; use larger touch targets for commonly used phone controls where space permits.
- App desktop sidebar: 222px wide. Top navigation: 74px high. Main page max width: 1180px, with approximately 34px horizontal padding on desktop.
- Cards usually have 20px internal padding and 13-15px corner radii. Related cards use 13-15px gaps.
- Use one primary action per card/step and plain secondaries rather than a row of competing solid buttons.
- Use existing `.grid2`, `.grid3`, `.kpis`, `.formgrid`, and `.toolbar` classes where possible before inventing layouts.

## 6. Component behavior

### Book detail editor (v2.2)

- Manual edits: ISBN-10/13, distinct Amazon ASIN, genres, cover HTTPS URL, and publication metadata.
- First genre in the user's list is the **primary genre** for genre-level Insights. Preserve order and allow multiple tags.
- Provide a cover URL preview. A manually entered cover is not replaced by a normal save.
- The **Look up metadata & cover** action is **user-initiated inside the specific book**; display results in a review panel, and require a separate Apply action. Existing fields remain unchanged unless the user explicitly chooses a replacement where supported.
- Amazon-only ASINs are not resolved by the available Open Library/Google Books catalogs. Some ISBN-10 values overlap with ASIN; avoid presenting unrelated title matches as exact identifiers.
- Goodreads CSV import has its **separate** automatic enrichment pathway; do not turn on background lookup when manually saving a book.

### Reading Habits and Insights

- Show reading minutes and daily-goal reference on the same graph; historical daily targets do not change retroactively.
- Activity mix uses a three-slice pie; Routine Heatmap uses weekday x five 24-hour time periods and sits next to the pie on wide layouts, then stacks on phones.
- Reading speed is weighted by **measured** minutes and recorded pages/page-equivalents; show audiobooks' print-page equivalents separately and do not estimate pages from playback time.
- Show counts and values next to graphical marks. Missing time/date/metadata is displayed as Unknown or Not recorded, never zero without evidence.

### TBR aging distribution (v2.2)

Display **nine non-overlapping bins**, using elapsed calendar days and the following inclusive numeric boundaries. Years here mean approximate 365-day bands, not exact anniversaries.

| Label | Calendar days on TBR |
|---|---:|
| 0-30 days | 0-30 |
| 31-90 days | 31-90 |
| 91-180 days | 91-180 |
| 181-365 days | 181-365 |
| 1-2 years | 366-730 |
| 2-3 years | 731-1095 |
| 3-4 years | 1096-1460 |
| 4-5 years | 1461-1825 |
| 5+ years | 1826+ |

Horizontal bars are proportional to the largest category, with the **book count and percent** shown in text; empty categories have an empty bar, not a fake minimum. Use actual `tbr_added_on` first; `goodreads_added_on` and creation dates are **marked as approximate proxies**, and missing dates stay excluded. The chart covers the complete owned or fully shared lifetime TBR shelf rather than a weekly/monthly reading-session filter.

### Virtual shelf

Walnut, Light Oak and Slate finishes; covers vs spines; relative 3D-like CSS thickness is **decorative** rather than exact physical measurements unless known. Preserving drag ordering, Favorites, and accessible book title/author matters more than visual realism.

## v2.4.1 — Completed-period Replay + local time + multi-photo scanner

- **Recaps:** Show **completed calendar periods only**, with a discrete `Complete period` cue. Do not use `So far` language on this tab. Historical date navigation is backward only. Live ongoing activity stays under Insights; do not obscure it with Recaps. Previous-period comparison uses equal *complete* calendar periods.
- **Celebration:** In-app `.replay-ready-*` panel has warm green/gold accents and a light festive illustration, but does not steal focus, autoplay media or imply a delivered push notification. Provide a clear **view recap** action and **Not now** dismiss. If multiple completed periods are newly available, link each directly; seen state is per owner+kind+period end and stored locally, not synced between devices.
- **Logging:** Show a device-local `HH:MM` suggestion immediately when opening a new log for today. It must stay editable. Do not silently assign a start time to backdated records; retain stopwatch provenance when available. `APP/session-start-suggestion.js` owns pure date/clock conversion for this feature.
- **Contents OCR:** Book Details > Exact chapters has a multi-select photo field + phone camera-add action; retain a visible ordered thumbnail queue with remove/reorder. The chapter mapping should be a single editable result across scans. Page boundaries are candidate suggestions until user verification, preserving the exact pages-only logging metric rule. `APP/chapter-sourcing.js` holds the batch OCR limits and parser.
- **Mockups:** `PREVIEW_SITE/index.html` is standalone fictional data with completed week/month/year cards and an example celebration. `RECAP_MOCKUPS.pdf` includes current static screenshots. It does **not** illustrate actual mobile photo capture in a live device.

## v2.4.0 — Reading Replay visual language

- **Location:** A new `Recaps` tab (distinct from Insights), in the desktop side rail and mobile bottom navigation. Week / Month / Year switches use the existing segmented-control treatment, plus accessible back/forward period arrows. Cards advance using Previous/Next and individual story dots.
- **Composition:** Editorial 2-layer system: cream/sage UI outside the frame; individually themed jewel-tone story cards inside. Use high-contrast typography and discrete color variants for adjacent cards (deep forest, pine, warm coral, ink, soft violet, etc.). Keep decorative star/ring graphics behind data and headings; don't obstruct numeric charts.
- **Layout:** `APP/style.css` section `v2.4.0 Reading Replay` styles `.replay-*`. A single story is visible at a time; use stable proportions where possible, but allow height to grow to fit labels. At 320px wide the cards and controls wrap rather than creating page-wide overflow.
- **Content:** Week: six cards; month: eight cards; year: nine cards. Book ranking cards show cover/title/author, mode splits include proportion charts plus values, time-of-day/genres/timelines have actual chart marks. Monthly highlights combine book covers and three compact genre bars. Goals are actual-to-historical-target, not inferred from today's setting. Weekly habits card includes goal success. Annual journey card labels the busiest **month**, unlike week/month which show the busiest **day**.
- **Trust:** All displayed counts and annotations come from eligible sessions and historical book completions. The cards explain how audiobook equivalents differ from physical pages; backfilled Goodreads dates do not imply previously recorded session time. Summary-only shares do not expose these visuals. Owners may copy text explicitly, never automatically share.
- **References:** `RECAP_MOCKUPS.pdf` is the up-to-date v2.4.1 static storyboard; `PREVIEW_SITE/index.html` has interactive fictional Weekly/Monthly/Annual Recaps using actual renderer output. `DESIGN_REFERENCE.pdf` remains historical for prior releases.

## 7. Responsive and accessibility guidance

- Desktop: sidebar navigation and multi-column dashboard. Mobile: bottom navigation, stacked analytics, compact controls and horizontal overflow for the full library table.
- Existing relevant breakpoints include around **850px, 760px, 530px, 470px and 430px**. Confirm changes at narrow **~375px phones**, middle **~768px tablets**, and **~1280px desktops**.
- TBR bar chart: minimum legible label column, an expanding horizontal track, and a numeric count/percentage column. It must not horizontally overflow on a phone.
- Preserve keyboard focus outlines, semantic labels, readable text, and `aria` descriptions; keep chart values in accessible text as well as bar length.
- A preview opened from a local iPhone HTML file might not run its JavaScript. Serve `PREVIEW_SITE/index.html` over HTTPS for interactive testing; this is independent of deployment of the real app.

## 8. How to propose a visual change safely

1. Identify the surface: app (`APP/`) or preview (`PREVIEW_SITE/`) or both.
2. Start with token changes in `APP/design-tokens.css`; then update any component-specific `APP/style.css` colors that bypass tokens.
3. Adjust only presentation and navigation in `APP/app.js` unless changing a metric's **definition** is explicitly requested.
4. Update the mockup and this document if a new component, color, chart, or layout is added.
5. Bump the cache name and pre-cache paths in `APP/service-worker.js` when changing static app assets.
6. Run `npm test`, `node tests/render-smoke.mjs`, and `node tests/book-detail-render-smoke.mjs` from `APP/`; verify actual desktop and mobile screenshots.
7. Database changes require a separate **idempotent migration** for existing Supabase installations. Do not change Supabase RLS or overwrite a user's reading history for design-only work.
8. Package the **one current project ZIP** after tests. Keep personal Goodreads CSVs, private account data, credentials and local test screenshots out of public preview pages.

## 9. Short designer brief to forward

> My Reading Room is a calm, literary reading tracker. Use warm cream card surfaces, forest and sage greens, understated gold accents, Newsreader editorial headings, and clear DM Sans UI labels. Preserve existing information hierarchy, mobile usability, accessible data labels, and the three distinct reading methods. The app styling starts in `APP/design-tokens.css` and `APP/style.css`. Use `PREVIEW_SITE/index.html` and `DESIGN_REFERENCE.pdf` for screen examples. Avoid changing reading calculations or user data when revising visuals; propose visual revisions separately from behavior changes.

---

**Status:** Source files and tests are locally verified. Cloud database migrations, production data responses, real multi-account security tests, and real iPhone browser behavior still require live validation. The preview contains demo data only.

## v2.3 — Manual reading-pass history editor

The owner-facing book detail popup now has a third tab labeled **Read history**, alongside Book details and Exact chapters. The tab has a short explanation, one panel per read-through, and a clear save/correction workflow.

- **Original read** is the first numbered pass and is never removed. Add subsequent passes as **Reread #1**, **Reread #2**, etc. The latest pass may be `Currently reading`; earlier passes should be complete or DNF.
- Each panel has a status select, optional start date, optional **exact** finished date and optional completion **year**. Show the year-only field rather than fabricating a date. Use text explaining that unknown time/pages/methods stay unrecorded.
- A softly bordered, labeled card groups each pass. The outer editor uses a pale sage surface with forest-green buttons and standard form controls. On phones the fields stack vertically; avoid horizontal scrolling and touch targets below 40px.
- Put **Add a reread**, the existing-session reassignment checkbox and **Save reading history** in visible sequence. A separate **Recheck saved session assignments** action supports safe recovery after partial updates.
- When a save would move existing sessions between passes, the product must **show a confirmation with the number and example dates**. Only the `read_number` changes; do not visually imply that reading time, pages or genres will be populated automatically.
- The session logger has a **Reading pass** dropdown (auto + manual choices). Completed earlier passes cannot accept sessions dated beyond their known completion.
- The desktop/mobile read-history editor references are in the **v2.3** pages of `DESIGN_REFERENCE.pdf`; the four most recent **v2.3.5** pages document Friend Comparison. The standalone HTML mockup uses the **Book · Edit Read History** screen with Dune as a fictional 2022/2026 example. Its Save button is intentionally a design-preview notice rather than a database action.

**Visual adjustment locations:** `APP/style.css` (`.history-editor`, `.history-edit-row` and related selectors), `APP/app.js` (editor/render), `PREVIEW_SITE/index.html` (portable design preview), and `APP/design-tokens.css` (system-wide colors, spacing and type tokens). All changes to app behavior should be verified against `APP/tests/manual-read-history-v23.test.mjs` and `APP/tests/read-history-render-smoke.mjs`.

## v2.3.1 — Calendar and Insights visual convention (Sunday first)

- Weekly timeline and charts run **Sunday–Saturday**, with day labels **Sun, Mon, Tue, Wed, Thu, Fri, Sat**, in that order. The week containing 2026-11-17 is 2026-11-15 through 2026-11-21.
- Heatmaps, including the last-12-weeks activity grid and the five-band routine heatmap, must put **Sunday at the beginning** of the grid/order; do not rearrange persisted data to make this happen.
- The `Reading Habits` weekdays-versus-weekends metric remains Monday–Friday vs Saturday–Sunday, despite changing display order.
- Core implementation: `APP/calendar-week.js` for Sunday-boundary helper, `APP/app.js` for period selection and reading heatmap, `APP/reading-habits.js` for weekday indexes, and `PREVIEW_SITE/index.html` for fictional reference screens.
- Monthly and annual charts remain their standard calendar month/year (no week-based aggregation of monthly data). Older PDF screenshots are **historical designs** and may show Monday-first before the v2.3.1 Sunday-first supplement.

## v2.3.4 — Quick summary, Friends, and book editing controls

- **Insights landing:** Show Quick summary for **This Week** by default; keep Detailed insights as a separate toggle without deleting or simplifying the existing analytics. Use clearly readable numeric labels on chart marks rather than relying on hover (mobile has no hover).
- **Friends activity:** a single-column timeline with name/initials, date, action verb, title and short metric. Neutral surfaces, restrained accent colors, and clear labels. Only inbound **Full-access** shared profiles may contribute book/session events; Summary-only profiles remain excluded.
- **Daily goal boundary:** Settings → Your account contains `Tracking start date` and **Starting daily goal** together. Clarify that later real goal changes still use their effective dates. A 30-minute goal must not be silently shown for a newly included earlier tracked day when the starting target was set to 60.
- **Book covers:** use lazy loading and a bounded cache for eligible HTTPS cover images. Do not load every image eagerly or replace manual URL choices.
- **Genres:** both Add manually and Book details use the canonical 26-category dropdown from `APP/catalog.js` (`STANDARD_GENRES`), with an **Add genre** button and selected chips. Multi-genre books have one Primary chip; a `Make primary` action changes the first genre used in Insights. Keep legacy strings labeled as existing; never silently delete or standardize a user's previous custom data merely for display.
- **Reading status:** place **Reading status** directly beneath the book cover/title in the owner-facing **Book details** view, *above* the lengthy metadata editor, with `Save book` in the modal footer. For completed or DNF books, show **Start reread today** beside the status control so the previous read's date and session records stay intact. Do not duplicate `id=edit-status` in the same modal. Other users' shared books remain read-only.
- Source locations: `APP/app.js` (`renderBookModal`, `renderGenrePicker`, `renderInsights`, `renderFriends`), `APP/style.css`, `APP/design-tokens.css`, `APP/friend-feed.js`, `APP/book-detail-metadata.js`, `APP/catalog.js`, `PREVIEW_SITE/index.html`, and `APP/tests/*v234.test.mjs`. Existing SQL upgrade: `APP/supabase/UPGRADE_EXISTING_TO_V2.3.4.sql`.


## v2.3.7 chart hierarchy and color accessibility

- **Book chart series:** `APP/book-chart-colors.js` controls the shared categorical palette for stacked activity and the most-read ranking. It intentionally ignores book-cover hues. For a two-book view, ocean blue `#277F98` and burnt orange `#C47738` are used to avoid lookalike colors. Next colors include amethyst `#7962A9`, green `#47865A`, and raspberry `#B64D78`. Do not randomize palette assignment during rendering; the mapping must be consistent for a given visible book set and shared across the chart and legend. Use visible labels/tooltips to support non-color identification.
- **Comparisons:** You = deep green, Friend = warm terracotta. Use paired bars or columns and visible data labels, not number rows alone, for trend and distribution charts. Keep exact-value details available in a secondary disclosure. Horizontal scrolling belongs within chart containers.
- **Goals:** Historical daily goal is a thin, low-contrast dashed line (`#a4b1a2`, ~65% opacity), always behind the solid actual activity in the visual hierarchy. Legend label = **Daily goal**, not Daily reference or Goal reference.
- **Friends feed:** Group by date and use a post-like hierarchy: avatar/byline, book title + cover, action/type, then time/rating metadata. Use compact but readable cards at 320px viewport; the primary page must never scroll horizontally because of a child chart.


## v2.4.2 — Data-driven insights and series UI

- Read and unread use distinct green (`#477f65`) and warm ochre (`#d8ac66`) bar fills, with accessible segmented buttons plus text counts. Shared summary-only profiles cannot open title-level drilldowns.
- The library drilldown modal retains existing book-cover styles and simple book status/rating labels; rating and TBR rows become keyboard-focusable buttons with visible focus styles.
- Series appear as collapsible panels with golden rating bars and green/blue/amber segments for measured reading methods. Unknown totals are shown explicitly instead of implying completion.
- Three bookshelf tiers are displayed per page with up to nine visible books; paging controls are placed below the shelf.
- These modifications are in `APP/style.css` and `APP/app.js` and retain all existing 2.4.1 theme tokens.

### Series catalog (v2.4.3)

The Series Insights card has a source-attributed, expanded reading-order panel. A compact header shows cataloged installment count (not a claim of final series completion), a scrollable list shows ordered titles with years and the user's library status, and buttons link to local Book Details. Source attribution stays visible beside each provider-backed detail. The panel is responsive down to 320px and never replaces user-entered series totals without consent. Book Details includes a smaller version of the same panel and an explicit Fill missing series fields action.
