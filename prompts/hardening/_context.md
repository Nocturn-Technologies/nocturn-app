# Nocturn hardening — shared context (read this first every run)

You are running inside a GitHub Action on the `Nocturn-Technologies/nocturn-app` repo on a one-off branch created for this slot. Read `CLAUDE.md` at the repo root before doing anything else — it has the complete architecture, tech stack, DB schema, and patterns.

## Your operating rules (apply to every slot)

### 1. Scope
- Only work on what this slot's prompt file tells you to. Do not drift.
- Respect the MVP: ticketing (Stripe), QR check-in, Marketing Agent (Hype Machine), Finance/Settlement Agent (The Closer), onboarding, and the 5-screen dashboard. Do not build non-MVP features.

### 2. Protected paths — auto-fix BLOCKLIST
You MUST NOT edit these files in a `midday` or `afternoon` slot. If the audit names them, log the issue to `.hardening/dayN/protected-paths-todo.md` instead and skip the fix:
- `src/app/api/webhooks/**`
- `src/app/api/stripe/**`
- `src/app/api/create-payment-intent/**`
- `src/app/api/checkout/**`
- `middleware.ts`
- `supabase/migrations/**`
- `src/lib/supabase/config.ts` (admin client)
- `.env*`
- Anything that mutates RLS policies

`morning` audits MAY read these files and describe issues, but still shouldn't edit.

### 3. Day 4 is audit-only
All Day 4 slots (`day4-*.md`) produce reports and open GitHub issues. They NEVER edit code. No exceptions.

### 4. File-based handoff (morning → midday)
- **Morning slots** write their full audit to `.hardening/dayN/audit.md` using the audit template below. They do not edit any other file.
- **Midday slots** read that audit file and fix the issues in it. Before fixing each issue, re-open the cited file, verify the offending code excerpt still matches what the audit quoted, and skip any that no longer reproduce (log skipped items to `.hardening/dayN/skipped.md`).

### 5. Audit template (morning output must use this exact format)
```markdown
# Day {N} audit — {focus}
_Generated {timestamp}_

## Issue 1 — {one-line title}
- **Severity**: critical | high | medium | low
- **File**: `src/path/to/file.ts:42`
- **Offending code**:
  ```ts
  // exact 3-10 line excerpt so midday can verify the issue still exists
  ```
- **Why it's wrong**: {one sentence}
- **Fix approach**: {one sentence — midday will use this}

## Issue 2 — ...
```

### 6. Quality gates midday/afternoon slots must run before finishing
- `npm run build` — must pass. If it fails, investigate; do not commit a broken build.
- `npm run test` (Vitest) — keep previously-passing tests green.
- `npm run test:e2e` (Playwright) — log any new regressions to `.hardening/dayN/test-breakage.md` and revert the offending commit.

### 7. Commits
- One commit per logical fix, message format `fix(area): brief summary`.
- The workflow will bundle them into one PR at the end. Don't try to open a PR yourself.

### 8. Tech stack summary (don't re-derive)
- Next.js 16 App Router, React 19, TypeScript strict
- Tailwind v4 + shadcn/ui v4 (dark theme only)
- Supabase (Postgres + Auth + RLS + Realtime), admin client pattern
- Stripe direct checkout + Connect, webhooks on `/api/webhooks/stripe`
- Resend for email, PostHog + Sentry for analytics
- Vitest for unit, Playwright for E2E
- `.maybeSingle()` not `.single()` where 0 rows possible
- Prices in DOLLARS (NUMERIC), not cents
- Brand: `#7B2FF7` (nocturn purple), `#09090B` bg, Outfit headings, DM Sans body
- Voice: "operators" not "users", "collectives" not "teams"

### 9. What counts as done
You're done when:
- Your slot's specific checklist is complete
- Build + tests still pass (where applicable to your slot)
- Either `.hardening/dayN/audit.md` exists (morning) OR you've committed fixes (midday/afternoon)
- You've NOT touched anything outside your slot's scope
