# Day 5 afternoon — Email deliverability + final polish + E2E coverage expansion

**Mode: AUDIT + FIX.**

## Part A — Resend email deliverability
Audit email-sending surfaces (6 files in `src/app/actions/` that send via Resend — see CLAUDE.md "Email Actions"):
- Every `resend.emails.send` call includes: `from` (verified sender), `to`, `subject`, `html`, `replyTo` where relevant
- Error handling — Resend returns `{ data, error }`; is `error` checked and logged?
- Retry on transient failures (429, 5xx)?
- Unsubscribe link on marketing campaign emails (compliance)
- Domain is `trynocturn.com` and sender is verified (don't change this — just flag if you see a test sender in prod code)
- `from` domain matches `DKIM/SPF` — if unsure, just flag for review

Fix non-protected issues (message bodies, error handling, retry logic). Do NOT touch `.env*` or `RESEND_API_KEY` plumbing.

## Part B — Final polish sweep
Light pass for anything the first 4 days missed:
- Any new `console.log` introduced by midweek fixes
- Any new `TODO`/`FIXME` added this week — add to `.hardening/day5/todo-final.md`
- Any new unused imports (run `npm run lint`)
- Visual regressions on Home/Events/Marketing/Finance/Settings after a week of edits (check Vercel preview of this branch)

## Part C — E2E coverage expansion
For any MVP-critical flow that was edited this week and lacks E2E coverage, add a new Playwright spec or extend an existing one. Cap at 5 new tests — don't bloat the suite.

## Gates
- `npm run build`
- `npm run test`
- `npm run test:e2e`

## Commits
- `fix(email): <summary>`
- `chore: final polish`
- `test(e2e): expand coverage for <flow>`
