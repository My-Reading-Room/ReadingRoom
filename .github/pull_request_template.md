## What and why

<!-- What does this change, and which issue does it address? (e.g. Closes #12) -->

## How it was verified

<!-- Tests added or run, pages checked in the browser, against local Supabase -->

## Checklist

- [ ] Targets `develop` (only release PRs target `main`)
- [ ] `npm run lint`, `npm run typecheck` and `npm test` pass locally
- [ ] Database changes are a new migration in `supabase/migrations/`, never edits made in the dashboard
- [ ] New tables have row-level security; policies were tested with a second user
- [ ] No secrets, keys or `.env*` files committed; server-only keys stay out of `NEXT_PUBLIC_*`
- [ ] Production steps needed after merge (migrations, env vars) are listed below

## After merge

<!-- e.g. "Apply migration X to production", "Add env var Y in Vercel", or "None" -->
