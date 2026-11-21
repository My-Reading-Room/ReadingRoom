# My Reading Room

A personal reading tracker with private libraries and shared, view-only partner profiles.

The app is being migrated from a vanilla-JS PWA (`legacy/`) to **Next.js (App Router) + Supabase**. Progress is tracked in [#17](https://github.com/My-Reading-Room/ReadingRoom/issues/17).

## Getting started

Requires Node 22 (`nvm use`).

```bash
npm install
cp .env.example .env.local   # fill in values from Supabase → Project Settings → API Keys
npm run dev                  # http://localhost:3000
```

| Script                        | What it does                              |
| ----------------------------- | ----------------------------------------- |
| `npm run dev`                 | Dev server                                |
| `npm run build` / `npm start` | Production build / serve                  |
| `npm run lint`                | ESLint                                    |
| `npm run typecheck`           | Generate route types, then `tsc --noEmit` |
| `npm run test:legacy`         | Test suite of the legacy app              |

## Database (Supabase)

`supabase/migrations/` is the source of truth for the schema. The first migration is a baseline
captured from production on 2026-11-18. The SQL files in `legacy/supabase/` are history only.

Requires Docker Desktop running and the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
supabase start          # local Postgres + Auth in Docker, applies all migrations
supabase db reset       # rebuild the local database from migrations
npm run db:types        # regenerate src/types/database.ts from the local database
supabase stop           # shut the local stack down
npm run dev:local       # run the app against the local stack (the default for development)
```

Develop against the local stack. The hosted project holds real users' data; a separate hosted
database for preview deployments is deferred (#23). Create local test users with
`supabase status` → Studio, or the local Auth admin API.

Schema changes go in a new migration (`supabase migration new <name>`), are tested locally with
`supabase db reset`, and reach production only after review. Never edit production by hand in the
dashboard SQL editor.

## Project layout

```
src/
  app/
    (app)/          signed-in routes (protected by src/proxy.ts and requireUser())
    (auth)/         /login, /signup and their Server Actions
    auth/confirm/   landing route for Supabase email links
  components/       shared React components
  hooks/            custom React hooks (client-side helpers live here)
  utils/supabase/   server, browser and proxy Supabase clients
  proxy.ts          refreshes the session and redirects signed-out visitors
legacy/             the previous vanilla-JS app, kept as reference until the port is done
docs/               design system, legacy handoff notes, release notes, design references
```

## Security rules of thumb

- Authorization lives in Postgres RLS. The browser only ever holds the **publishable** key.
- On the server, identify the user with `requireUser()` / `supabase.auth.getClaims()`, never `getSession()`.
- Never put the Supabase secret (service_role) key in a `NEXT_PUBLIC_` variable or in client code.
- Never use `"use cache"` on data read with the user's cookies.
- Redirect targets from user input go through `safeRedirectPath()`.
- No `dangerouslySetInnerHTML` (enforced by ESLint).
- Every HTML response gets a nonce-based Content-Security-Policy from `src/proxy.ts`
  (`src/utils/security/csp.ts`): only scripts Next.js stamps with the per-request nonce can run,
  and inline event handlers are blocked. Because of this, every page renders per request and
  Cache Components / Partial Prerendering are off (static shells can't carry a nonce).
- Third-party API keys (Google Books, List Of Books) live only in server env vars and are used
  by the sign-in-only route handlers under `src/app/api/`, which validate input and rate-limit
  per user. The browser never calls those providers directly.
- Load third-party code from npm, never from a CDN `<script>`. New external hosts (images, APIs)
  must be added to the CSP deliberately. Set `CSP_REPORT_ONLY=true` to trial a policy change in
  report-only mode.

## Contributing

**Branch flow:** feature branch → PR into `develop` → release PR from `develop` into `main`.
`main` is production; never push to it directly.

Every PR into `develop` or `main` runs CI (`.github/workflows/ci.yml`):

| Job                          | What it checks                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Lint, types, tests, build    | Prettier, ESLint, TypeScript, Vitest, the legacy tests, `next build`                                                      |
| Migrations from scratch      | Starts a fresh local Supabase, applies every migration and the seed, `supabase db lint`, pgTAP tests in `supabase/tests/` |
| Secrets and dependency audit | gitleaks over the full history (`.gitleaks.toml`), `npm audit` on production dependencies                                 |
| CodeQL                       | Security analysis of the TypeScript and the workflows (runs only while the repo is public; see the workflow)              |

Run the same checks locally before pushing:

```bash
npm run format:check && npm run lint && npm run typecheck && npm test && npm run test:legacy
supabase db reset && supabase db lint --fail-on error   # needs Docker
```

Dependabot opens grouped weekly updates against `develop`. Security problems:
see [SECURITY.md](SECURITY.md).
