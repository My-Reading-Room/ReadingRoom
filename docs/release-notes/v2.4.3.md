# My Reading Room v2.4.3 - Series Lookup and Complete Series Details

**Deployment status:** Not deployed. This is a handoff; v2.3.3 production is unchanged until you apply migrations and deploy to Vercel.

## What's new

- Goodreads `(Series #N)` extraction is retained. In addition, new books added through catalog search or manual entry can now ask a dedicated catalog service for a matching series and installment number when those fields are missing.
- Goodreads imports can fill an empty series total for **up to eight distinct named series per import** when the optional provider is configured. One request is made per series, not per book; later imports/retries and manual lookups can cover more. Existing manual totals are never silently overwritten.
- Insights > Detailed > Books & Library > Series has an **Explore complete series** button. Shows author, the number of cataloged volumes, ordered books and publication years, which titles are in your library and their status, source link, plus your existing installment ratings, reading modes and measured speeds. A button fills only missing series data across your books.
- Book Details provides **Find series details** and **Fill missing series fields**. A catalog match fills blank form inputs, and the user reviews and chooses **Save book**. Existing editable values remain authoritative.
- Series lookups link visibly to their original source (required by provider's free plan). Source and manual provenance are stored for user-provided counts, through an additive migration.
- A completed progress indicator now means *all currently known main installments have been read*, not that the author will never publish another book.

## Optional provider setup (required for online series search)

Sign up for a free key at https://www.listofbooks.net/developers. In Vercel > Project Settings > Environment Variables, set `LOB_API_KEY` to the provider key as a **server-side** secret. Redeploy the app. Do not add it to `config.js`, Git, front-end code, or any downloadable bundle. The Vercel serverless function at `APP/api/series-lookup.js` makes the external requests and returns only metadata.

Free plan: 10 requests per minute, 60/hour, 200/day and 50 distinct series or author pages per day; attribution links are required. App import enrichment is limited to 8 distinct series per run, with pacing. No book catalog is stored or scraped in bulk. A preview opened from a local HTML file has sample data and does not connect to the provider.

Without a key, **all existing application features work**, including Goodreads parsing, manual series name/order/count editing, and your local installment statistics. The lookup controls will explain that the provider is not configured.

## Database upgrade from the existing v2.3.3 deployment

1. Export a Supabase backup.
2. Apply these scripts in order if not already applied: `UPGRADE_EXISTING_TO_V2.3.4.sql`, `UPGRADE_EXISTING_TO_V2.3.6.sql`, `UPGRADE_EXISTING_TO_V2.3.8.sql`, `UPGRADE_EXISTING_TO_V2.3.9.sql`, `UPGRADE_EXISTING_TO_V2.4.2.sql`, **`UPGRADE_EXISTING_TO_V2.4.3.sql`**.
3. Deploy the **v2.4.3 `APP/` folder** to the existing Vercel project. Add `LOB_API_KEY` to Vercel settings before deploying if you want automatic lookup.
4. Reopen/refresh the app to update the service worker. Verify a known series from Goodreads and manually save an updated series count.
5. Verify one manual add, one catalog add, one import, a series with novella #1.5, a manually set total, and a lookup without a match. Check sharing permissions with separate accounts.

Do **not** run `schema.sql` against an existing database; it is for fresh installs only.

## Safety & accuracy

- An external total counts currently cataloged books, not a confirmed final *planned* number of novels. Ongoing series may gain additional installments later; lookups can be refreshed.
- Exact series-name and author agreement is required before automatically applying a suggestion. The highest numbered book imported is **never** used as the total.
- Missing source, API downtime, rate limiting and unrecognized series do not prevent any book from being saved or imported.
- The source's URL is linked for attribution. Third-party metadata can contain mistakes; user edits prevail.
- Lookup details are fetched on demand, not permanently copied as a complete external catalog.

## QA

- Automated tests for series result normalization, exact matching, automatic import enrichment, manual total protection, source attribution, proxy API token handling, source URL validation, and UI integration.
- Full project test suite: see the latest test summary in the handoff.
- Browser mockup uses fictional reading status/rating values. Live third-party provider, Supabase permissions, and production deployment still need manual verification with real API credentials.

## Reviewable design preview

`PREVIEW_SITE/v2.4.3_series_details_preview.html` provides a responsive, standalone interactive mockup of series details and editable book metadata. All sample book statuses, ratings, and activity data are fictional. The preview does not call the provider or a live Supabase account. A standalone copy is also provided with the handoff. The preview was visually checked in Chromium at 1280px, 390px and 320px widths, including its interactive book-lookup demonstration; no horizontal overflow was detected.

Series details count a book that was finished previously and is currently being reread as already completed for the series. Its current status is shown as **Rereading** to preserve that distinction.
