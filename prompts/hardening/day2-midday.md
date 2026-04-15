# Day 2 midday — Fix event creation + ticket flow issues

**Mode: FIX. Input = `.hardening/day2/audit.md`.**

## Steps
1. Read `.hardening/day2/audit.md`. If missing or <100 bytes, stop and open an issue.
2. Bucket the issues:
   - **Fixable here**: anything NOT in a protected path (event creation form, dashboard views, non-Stripe client code, validation logic)
   - **Protected — route to issue**: anything under `src/app/api/stripe/**`, `src/app/api/webhooks/**`, `src/app/api/checkout/**`, `src/app/api/create-payment-intent/**`. For these, append to `.hardening/day2/protected-paths-todo.md` with the full audit entry — the workflow opens a GitHub issue from it.
3. For fixable issues (severity order):
   - Re-open cited file, verify excerpt matches. Skip and log to `.hardening/day2/skipped.md` if not.
   - Apply the fix following the audit's Fix Approach.
   - Prioritize: (1) crashes/errors first, (2) missing error handling, (3) UX gaps (loading, disabled states, empty states).
4. Gates: `npm run build`, `npm run test`, `npm run test:e2e`. On build break, don't commit. On test:e2e regression, revert the offending commit and log to `.hardening/day2/test-breakage.md`.

## Scope rules
- Do NOT modify Stripe webhook signature logic, Stripe secret handling, or webhook event types — those go to the protected-paths-todo.md file.
- Do NOT alter `supabase/migrations/**` or the `fulfill_tickets_atomic` RPC. If the audit claims the atomic fulfillment needs a change, route it to the protected todo.
- OK to fix: form validation, loading/disabled states, error message user-facing text, empty states on the event dashboard, client-side cancel-flow state cleanup.

## Commits
- `fix(events): <short summary>` per logical change
- `fix(checkout): <short summary>` for non-protected checkout UX fixes
- `docs(hardening): route protected-path items to issue queue` (one commit for the `.md` file)
