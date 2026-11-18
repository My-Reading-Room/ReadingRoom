# Optional series lookup provider (v2.4.3)

The app works without a key; Goodreads title parsing and manual series editing remain available. To enable exact series lookup, configure a **server-side** Vercel environment variable `LOB_API_KEY` using a key from https://www.listofbooks.net/developers. Redeploy to apply the environment variable. **Never put the key in APP/config.js or frontend source.**

The app's `/api/series-lookup` endpoint proxies only the documented List Of Books reading-order and book lookup routes. It returns source URLs for visible attribution. The free plan requires linked attribution, and limits lookups to 10/min, 60/hr, 200/day, 50 distinct pages/day. Import auto-enrichment is intentionally capped at 8 distinct series per import; remaining books can be looked up later using their Series Details controls or a later import retry. No large-scale catalog harvesting is performed.

Book series counts represent **currently cataloged installments**, not the author's final planned total. Source suggestions do not overwrite manual totals. Verify series membership and any unusual order numbers before trusting completion reports. See RELEASE_NOTES_v2.4.3.md for deployment and QA.
