# Day 3 midday — Fix error handling issues

**Mode: FIX. Input = `.hardening/day3/audit.md`.**

## Steps
1. Read audit. If missing/empty, stop and open issue.
2. Bucket:
   - **Fixable**: server actions under `src/app/actions/`, non-protected API routes (`src/app/api/events/list/`, `src/app/api/marketplace-inquiry-email/`, `src/app/api/unsplash/`, seed routes, `src/app/api/generate-poster/`, `src/app/api/cron/reminders/` — but be careful with cron auth).
   - **Protected → issue**: Stripe routes, webhook routes, create-payment-intent, checkout, middleware, auth callback. Route to `.hardening/day3/protected-paths-todo.md`.
3. For each fixable issue (critical → high → medium → low), re-open cited file, verify excerpt, apply fix.

## Canonical pattern for server actions
When adding try/catch wrappers, follow the shape already used elsewhere in `src/app/actions/` — read a few existing actions first to match the exact return-shape convention. In general:
```ts
export async function doThing(input: Input): Promise<{ data: T } | { error: string }> {
  try {
    const supabase = await createAdminClient();
    // 1. Auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };
    // 2. Authorization (ownership / role) check
    // 3. Input validation (Zod or manual)
    // 4. DB call with .maybeSingle() where applicable
    return { data: result };
  } catch (err) {
    // Log to Sentry if configured, return user-safe message
    return { error: "Something went wrong" };
  }
}
```
If the existing pattern in the repo differs (e.g. throws instead of returning), MATCH the existing pattern — don't invent a new one.

## Gates
- `npm run build`
- `npm run test`
- `npm run test:e2e`

## Commits
- `fix(actions): <area> error handling` per logical area
- `fix(api): <route> error handling`
