# Day 3 — Skipped issues

Issues where the cited offending-code excerpt matched but the fix was deferred with reason.

---

## Issue 8 — `tier-availability` HMAC session binding (Low)

- **File**: `src/app/api/tier-availability/route.ts:65`
- **Reason skipped**: Fix requires a multi-file architectural change — a token-issuance endpoint, updates to the public checkout page (a protected UI flow), and enforcement in the route. Implementing only part of it (e.g., just the route check) would break the checkout flow without also updating the checkout page. Low severity; existing rate-limiting + origin-allowlist defenses are meaningful.
- **Recommended next step**: Create a Linear ticket to implement HMAC session tokens across the full checkout flow in a dedicated sprint. Token key: `sha256(eventId + sessionId + timestamp, CHECKOUT_SECRET)`.
