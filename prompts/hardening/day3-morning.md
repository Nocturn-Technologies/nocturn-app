# Day 3 morning — Server action + API route error handling audit

**Mode: AUDIT ONLY. Output to `.hardening/day3/audit.md`.**

## Audit 1 — Server actions in `src/app/actions/`
This is the biggest surface — 61 files, 130+ exported functions. Audit every server action for:
- Wrapped in try/catch (or uses a shared helper that does)
- Returns `{ error: string }` on failure, `{ data: T }` on success (or consistent with the project's pattern — check existing actions to confirm the canonical shape)
- Auth check at the top — is user logged in? Do they own the resource they're modifying? (`has_collective_role` RPC is the project pattern)
- Input validation (Zod schema or manual) BEFORE any DB call
- No silent failures — every catch returns an error message, no bare `return;`
- Uses `.maybeSingle()` not `.single()` where 0 rows is possible

## Audit 2 — API routes in `src/app/api/`
15 routes total. For each (except the protected Stripe/webhook routes — note those but don't propose code edits):
- Correct HTTP status codes (not 200 for errors)
- Auth verification on protected routes
- Input validation + sanitization (Zod, `sanitizePostgRESTInput`, etc.)
- Rate-limiting considerations (project has a `rate_limits` table — is it used?)
- CORS headers where needed
- JSON error response format
- Webhook signature verification (Stripe, if relevant — AUDIT ONLY, midday won't edit this)

## Output
`.hardening/day3/audit.md`. Group by file. Severity reflects risk: a missing auth check is critical; a missing error message is medium.

## Stop conditions
Read-only.
