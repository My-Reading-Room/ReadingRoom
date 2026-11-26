# Security policy

My Reading Room stores people's private reading data, so security reports are
very welcome.

## Reporting a vulnerability

Please **do not open a public issue**. Report it privately through GitHub:
**Security → Report a vulnerability** on this repository
([direct link](https://github.com/My-Reading-Room/ReadingRoom/security/advisories/new)).
Only the maintainers can see the report.

Include what you found, how to reproduce it, and what an attacker could do.
We aim to reply within a week.

## Scope

In scope: this repository (the Next.js app, Supabase migrations and row-level
security policies, server routes) and the deployed site.

Please don't run automated scanners against the production site, access other
people's data, or do anything that degrades the service. Test against a local
Supabase stack instead (see `README.md`).

## How the app is protected

- Every table is protected by Supabase row-level security; the browser only
  ever holds the publishable key.
- Server-only keys (Google Books, List Of Books, Open Library contact) are read
  in `src/utils/server-env.ts` and never sent to the browser.
- Pages use a per-request nonce Content-Security-Policy (`src/proxy.ts`).
- CI scans every PR for leaked secrets (gitleaks) and vulnerable dependencies,
  and CodeQL scans the code. GitHub secret scanning with push protection is on.
- Dependabot alerts are on. Fixes go into `develop` first, never straight into
  `main`: direct dependencies through the weekly update PR (or a manual "Check
  for updates"), indirect ones with `npm audit fix` on a branch from `develop`.
