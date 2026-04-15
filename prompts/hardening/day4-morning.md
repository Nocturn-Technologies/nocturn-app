# Day 4 morning — Auth + RLS + input sanitization audit (AUDIT-ONLY, NO FIXES)

**Mode: AUDIT ONLY. Day 4 NEVER edits code. Output to `.hardening/day4/audit.md` + open a GitHub issue from it.**

This is the security slot. Claude Code is not permitted to auto-fix security findings — the risk of "fixes" that look right but widen exposure is too high. Produce a thorough report. Shawn reviews and fixes interactively later.

## Audit 1 — Auth + authorization
- Every page route — auth guard present? Can an unauthenticated user access any dashboard page?
- Every server action — does it verify the user owns the resource they're mutating? Uses `has_collective_role` RPC or equivalent?
- Every API route — auth verification?
- Supabase RLS — any table missing RLS? (Schema says 66 policies across 48 tables. Verify.)
- Any direct Supabase client calls that bypass RLS inappropriately?
- `createAdminClient()` usage — only in server-side code? Never leaks to client bundle?
- Admin panel cookie auth — `crypto.timingSafeEqual` + HMAC still intact?
- UUID validation — every `[eventId]`, `[userId]` dynamic segment validated?

## Audit 2 — Input sanitization
- Form submissions — sanitized before DB insert?
- URL params — validated / typed?
- AI-generated content — `sanitizeAIText()` used before rendering (XSS protection)?
- File uploads — MIME whitelist + blocked extensions (SVG/HTML) + size limits still enforced?
- Search inputs — `sanitizePostgRESTInput()` before `.or()` filters?
- External URL parsing (event creation from URL) — fetched content sanitized before rendering or LLM-ingesting?
- `javascript:` / `data:` URL rejection via `sanitizeUrl()`?

## Output
Write the full report to `.hardening/day4/audit.md`. Then:
1. Open ONE GitHub issue with label `day4-security-audit` containing:
   - Summary of findings grouped by severity (critical / high / medium / low)
   - Link to the audit file on this branch
   - Assignee: `@shawn-nocturn`
2. Do NOT commit any code changes beyond the audit file itself.

## Hard rules
- No edits to `src/`, `supabase/`, `middleware.ts`, `.env*`, or anywhere else.
- No `npm run build` — nothing to build.
- The only committed file is `.hardening/day4/audit.md`.
