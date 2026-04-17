# Day 3 — Protected-paths TODO

Issues that touch protected files and require manual review before applying.

---

## Issue 6 — `create-payment-intent` per-IP-only rate limit

- **Severity**: medium
- **File**: `src/app/api/create-payment-intent/route.ts:16`
- **Why protected**: `src/app/api/create-payment-intent/**` is a protected Stripe path — no automated edits.
- **Recommended fix**: Add a second `rateLimitStrict` call keyed on `payment-intent:email:${buyerEmail}` with a tighter window (5 requests per 5 minutes) immediately after the existing IP check. Both checks must pass.
- **Risk**: Tighter limits could cause false positives for high-volume buyers; test against real Stripe test-mode flow before deploying.
- **Owner**: Shawn — review and apply manually after Stripe live-key validation sprint.
