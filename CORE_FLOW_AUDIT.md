# Nocturn Core Flow Audit — Phase 2

**Date:** 2026-03-26
**Auditor:** Claude Opus 4.6
**Scope:** Critical path trace through all core flows — happy path AND error path

---

## 2.1 Authentication

### Does signup create a user profile row in the users table?
**PASS** — `signUpUser()` in `src/app/actions/auth.ts` (line 38) explicitly inserts into the `users` table with `id`, `email`, `full_name`, and `user_type` immediately after creating the Supabase auth user via the admin API. The user is then auto-signed-in with `signInWithPassword()` so they get a session cookie.

### Does login handle wrong password with a proper error message?
**PASS** — `src/app/(auth)/login/page.tsx` (line 42-45) catches the Supabase `signInWithPassword` error and displays `error.message` to the user via a red `text-destructive` element. Supabase returns "Invalid login credentials" for wrong passwords, which is appropriately vague (does not reveal whether the email exists).

### Does middleware protect /dashboard/* routes?
**PASS** — `src/lib/supabase/middleware.ts` (line 39-43) checks `if (!user && request.nextUrl.pathname.startsWith("/dashboard"))` and redirects to `/login`. The middleware matcher in `src/middleware.ts` covers all routes except static assets.

### Is there a password reset flow?
**PASS** — Full flow exists:
1. Login page has "Forgot password?" button (line 168) that calls `supabase.auth.resetPasswordForEmail()` with redirect to `/auth/reset-password`
2. `src/app/auth/confirm/route.ts` handles the OTP verification and redirects recovery tokens to `/auth/reset-password`
3. `src/app/auth/reset-password/page.tsx` provides the new password form with confirmation, min 6 chars validation, and calls `supabase.auth.updateUser()`

### Additional Auth Concerns

**FAIL — Service role key is hardcoded in source code**
`src/lib/supabase/config.ts` hardcodes the `SUPABASE_SERVICE_ROLE_KEY` directly in the source file (line 7-8). This is the admin key that bypasses all Row Level Security. While Next.js tree-shaking should exclude it from client bundles, this is a critical security risk:
- The key is committed to Git and visible to anyone with repo access
- If tree-shaking fails or the file is accidentally imported client-side, the key is fully exposed
- **This key should be in environment variables only, never in source code.**

**CONCERN — Signup bypasses email confirmation**
`signUpUser()` uses `admin.auth.admin.createUser()` with `email_confirm: true`, which auto-confirms the email without sending a verification link. This means anyone can sign up with any email address (including emails they don't own). For an MVP this is acceptable, but before launch you should either enable email confirmation or add rate limiting to prevent abuse.

**CONCERN — No rate limiting on auth endpoints**
Neither signup nor login has rate limiting. Supabase has built-in rate limits on its auth endpoints, but the signup action uses the admin API which may have different limits.

---

## 2.2 Collective Creation (Onboarding)

### Does the onboarding chat create a collective + membership?
**PASS** — The flow is:
1. `src/app/onboarding/page.tsx` collects name, city, then calls `generateOnboardingSuggestions()` for AI content
2. User clicks "Launch" which calls `createCollective()` from `src/app/actions/auth.ts`
3. `createCollective()` (line 107-175):
   - Verifies user session
   - Ensures user record exists in `users` table (FK safety)
   - Inserts into `collectives` table
   - Inserts into `collective_members` with `role: "admin"`
   - Returns error if any step fails

### What happens if the AI fails during onboarding?
**PASS** — `src/app/onboarding/page.tsx` (line 99-104) has a proper `.catch()` handler that sets sensible fallback defaults:
- Bio: `"${name} is a music collective based in ${city}."`
- Instagram caption: generic launch announcement
- Welcome message: generic greeting
The user is never stuck — they proceed to the suggestions step after 1 second with defaults.

`src/app/actions/ai-onboarding.ts` also has its own fallback object (line 7-11) that's used if individual AI calls return empty strings.

**CONCERN — No slug uniqueness check**
The onboarding page generates a slug client-side via `slugify()` but never checks if the slug already exists before submitting. If two collectives pick the same name, the database insert will fail with a unique constraint error. The error is displayed to the user, but the UX is poor — the user has no idea why it failed or that they need a different name.

---

## 2.3 Event Creation

### Does the AI chat parse event details?
**PASS** — `src/app/actions/ai-parse-event.ts` has a robust dual-path system:
1. **Local parsing** (lines 105-236): Regex-based extraction for dates, times, venues, cities, prices, capacity. Handles formats like "10pm", "april 25", "doors at 9", "$25", "200 cap"
2. **AI parsing** (lines 50-95): If `ANTHROPIC_API_KEY` is set, calls Claude Sonnet for NLU extraction
3. **Fallback**: If AI fails, falls back to local parsing results
4. **Smart defaults**: Assumes PM for nightlife times, handles "next saturday" calculation

**CONCERN — Hardcoded date in AI prompt**
Line 73: `Today is 2026-03-18` is hardcoded. This will become stale and cause incorrect "next saturday" calculations. Should use `new Date().toISOString().split('T')[0]`.

### Does budget planning calculate break-even correctly?
**PASS** — `src/app/actions/budget-planner.ts` performs correct calculations:
- Accounts for platform fee rate (7%) and flat fee ($0.50) AND Stripe fees (2.9% + $0.30) in break-even price
- Targets 75% sell-through for safety margin
- Formula (line 134-136): `breakEvenPrice = ceil((totalExpenses / targetTickets + PLATFORM_FEE_FLAT + STRIPE_FEE_FLAT) / (1 - PLATFORM_FEE_RATE - STRIPE_FEE_RATE))`
- Travel estimation for international headliners with per-region flight costs

### Does it create ticket tiers?
**PASS** — `src/app/actions/events.ts` (line 208-217) creates ticket tiers from the input array, mapping `quantity` to `capacity` and setting `sort_order`. The budget planner suggests 4 tiers (Early Bird, Tier 1, Tier 2, Tier 3) with appropriate capacity splits (15%, 35%, 30%, 20%).

**CONCERN — Event date timezone handling**
`src/app/actions/events.ts` (line 130): `new Date("${input.date}T${input.startTime}:00").toISOString()` constructs timestamps without timezone info. This means a "10pm" event in Toronto will be stored as 10pm in the server's timezone (UTC on Vercel), not in the local timezone. Events will display at wrong times for users. This is a production-critical bug.

---

## 2.4 Ticketing & Payments

### Does Stripe checkout create a session with correct line items?
**PASS** — `src/app/api/checkout/route.ts` (lines 237-271) creates a Stripe Checkout Session with two line items:
1. Ticket price: `unitAmountCents` (tier price in cents)
2. Service fee: `serviceFeePerTicketCents` (7% + $0.50)
Both have correct `quantity` multiplied. Metadata includes `eventId`, `tierId`, `quantity`, and fee breakdown.

**There are TWO checkout paths:**
1. **Stripe Checkout Session** via `/api/checkout/route.ts` — creates a redirect-based checkout
2. **Embedded PaymentElement** via `/api/create-payment-intent/route.ts` — creates a PaymentIntent for inline checkout

Both correctly calculate fees and check capacity.

### Does the webhook create tickets, decrement capacity, send email, generate QR?
**PASS** — `src/app/api/webhooks/stripe/route.ts` handles `checkout.session.completed`:
1. **Ticket creation** (lines 119-141): Creates `quantity` ticket records with status "paid", price, payment intent ID, and unique `ticket_token`
2. **QR generation** (lines 159-189): Generates QR codes as data URLs pointing to `/check-in/{ticket_token}` and stores them on the ticket record
3. **Email** (lines 192-236): Sends branded confirmation email with event details and ticket link
4. **Post-purchase hooks** (lines 225-231): Triggers referral nudge and milestone checks

**Note:** Capacity is not explicitly decremented — it's calculated by counting tickets with status "paid" or "checked_in" against the tier's capacity. This is correct because it prevents phantom decrement issues.

### Is there race condition protection on ticket purchase?
**CONCERN — Advisory lock exists but effectiveness is uncertain**
Both `/api/checkout/route.ts` (line 95) and `/api/create-payment-intent/route.ts` (line 65) call `supabase.rpc("acquire_ticket_lock", { p_tier_id: tierId })` before checking capacity. However:
- The advisory lock is acquired via a Supabase RPC call, but the subsequent capacity check is a separate query. Since Supabase uses connection pooling, there's no guarantee these two operations happen on the same database connection. If they run on different connections, the lock is meaningless.
- The checkout creates a Stripe session/PaymentIntent, but doesn't reserve the ticket. Between payment initiation and webhook completion, another buyer could take the last ticket.
- **The webhook has idempotency protection** (lines 94-104) checking for existing tickets with the same `stripe_payment_intent_id`, which prevents duplicate ticket creation on webhook retries. This is good.
- **Bottom line:** Two users buying the last ticket simultaneously could both get through checkout, but only one would get a valid ticket if the webhook handles it correctly. There's a small window for overselling.

### Does the free ticket flow bypass Stripe?
**PASS** — `src/app/api/checkout/route.ts` (lines 126-218) handles free tickets entirely without Stripe:
- Creates ticket records directly with status "paid"
- Generates QR codes
- Sends confirmation email
- Returns success URL with `?free=true`

### Do promo codes work?
**CONCERN — Promo codes are validated client-side but NOT enforced server-side**
This is a significant issue:
1. `src/components/ticket-purchase.tsx` validates the promo code and calculates a discounted price client-side
2. The `StripeCheckout` component sends the original `tierId` to `/api/create-payment-intent` which charges the FULL tier price
3. The promo discount shown to the user does NOT propagate to the actual Stripe charge
4. `applyPromoCode()` in `src/app/actions/promo-codes.ts` increments usage count, but there's no code path that actually calls it during checkout
5. **Neither `/api/checkout/route.ts` nor `/api/create-payment-intent/route.ts` accept or process a promo code parameter**
6. **Result: Promo codes are cosmetic only — the buyer sees a discounted price in the UI but is charged the full price. This is a critical bug.**

---

## 2.5 Check-in

### Does QR scanning verify the ticket?
**PASS** — `src/app/(dashboard)/dashboard/events/[eventId]/check-in/page.tsx`:
1. QR scanner extracts ticket token from URL (handles both full URL and raw UUID formats, lines 61-75)
2. Calls `checkInTicket(ticketToken, eventId)` server action
3. Server verifies ticket exists, belongs to the correct event, and has status "paid"
4. Updates status to "checked_in" with timestamp

### Does it handle duplicate scans?
**PASS** — Two layers of protection:
1. **Client-side**: `lastScannedRef` prevents the same QR from being processed twice in quick succession (line 51)
2. **Server-side**: `checkInTicket()` (line 58-74) checks if `ticket.status === "checked_in"` and returns an error with the check-in time: "Already checked in at {time}"

### Does it handle invalid QRs?
**PASS** — Multiple validation levels:
1. If QR content is not a valid URL and not a UUID, returns "Invalid QR code - not a valid ticket" (line 78-84)
2. If ticket token doesn't exist in DB, returns "Ticket not found" (line 41-45)
3. If ticket belongs to a different event, returns "This ticket is for a different event" (line 49-54)
4. If ticket has non-"paid" status (refunded, etc.), returns appropriate error (line 77-82)

**CONCERN — Guest ticket check-in shows "Guest" for all names**
Since tickets are purchased as guest purchases (`user_id: null`), the `profiles:user_id` join returns null for all tickets. Every check-in displays "Guest" as the name. The buyer's email IS stored in `ticket.metadata.customer_email` but the check-in action doesn't extract it. This makes it hard for door staff to identify attendees.

---

## 2.6 Finance / Settlements

### Does settlement generation calculate correctly?
**PASS** — Two settlement generators exist:

1. **Manual** (`src/app/actions/settlements.ts` `generateSettlement()`):
   - Correctly sums `price_paid` from paid/checked-in tickets for gross revenue
   - Estimates Stripe fees (2.9% + $0.30/ticket)
   - Sets platform fee to $0 (buyer pays separately)
   - Sums artist fees from `event_artists` with "confirmed" status
   - Sums expenses from `event_expenses`
   - Calculates net = gross - stripe_fees - platform_fee, profit = net - artist_fees - expenses

2. **Automatic** (`src/app/actions/auto-settlement.ts` `generateAutoSettlement()`):
   - Similar calculation but also accounts for refunded tickets
   - Triggers CRM enrichment after settlement

**CONCERN — Inconsistency between settlement generators**
The manual generator does NOT account for refunded tickets in its revenue calculation (it only selects "paid" and "checked_in" status). The auto generator does. This could lead to different profit numbers depending on which path creates the settlement.

### Is there duplicate prevention?
**PASS** — Both generators check for existing settlements:
- Manual: Checks with `select("id").eq("event_id", eventId).maybeSingle()` (line 39-42)
- Both: Handle Postgres unique constraint violation (error code 23505) as a race condition guard (settlements.ts line 113, auto-settlement.ts line 127)

### Does the settlement email send?
**CONCERN — Settlement email is NOT actually sent**
`src/app/actions/settlement-email.ts` generates a report (subject + body text) and returns it along with recipient emails, but it does NOT call `sendEmail()`. The function returns the report data for display in the UI, but there's no code that actually delivers the email. The comment on line 14 confirms this: "for now, no Resend -- just generates the content." The settlement email feature is incomplete.

---

## 2.7 Refunds

### Does it call Stripe's refund API?
**PASS** — `src/app/actions/refunds.ts` `refundTicket()` (lines 60-73):
- Checks if ticket has a `stripe_payment_intent_id` and `pricePaid > 0`
- Calls `stripe.refunds.create()` with the payment intent ID
- Refunds only the ticket price (not the service fee, which is documented as non-refundable)
- Catches Stripe errors and returns them to the user

### Does it update ticket status?
**PASS** — After successful Stripe refund (or for free tickets), updates ticket to status "refunded" with metadata including `refunded_at`, `refunded_by`, and `refund_amount` (lines 77-88).

### Does it trigger waitlist notification?
**PASS** — After refund, calls `notifyNextOnWaitlist(eventId, tierId)` (lines 95-103):
- Finds the oldest "waiting" entry on the waitlist for that tier
- Sends branded email with event link and CTA to buy
- Updates waitlist entry status to "notified"
- Non-blocking: failure doesn't affect the refund

### Additional Refund Concerns

**PASS** — Authorization is properly checked: only collective members with "admin" or "promoter" role can issue refunds (line 42-50).

**PASS** — Refund policy toggle exists (`toggleRefundPolicy`) that stores `refunds_enabled` in event metadata, checked before processing refunds (line 39-41).

**CONCERN — Refund for multi-ticket purchases may only refund one ticket's worth**
When a buyer purchases 3 tickets, a single Stripe PaymentIntent is created. If the organizer refunds one ticket, `stripe.refunds.create()` is called with `amount: Math.round(pricePaid * 100)` which is the price of ONE ticket. But the PaymentIntent was for the full amount. This is actually correct — Stripe supports partial refunds. However, if all 3 tickets are refunded individually, the total refund amount could exceed the original payment if the per-ticket calculation rounds differently than the original charge. In practice, Stripe would reject the over-refund, so this is low risk.

**CONCERN — Refund notification email relies on metadata.customer_email**
If the ticket metadata doesn't have `customer_email` or `buyer_email`, no refund notification is sent. The email lookup (line 118) is best-effort.

---

## Summary of Critical Issues

### CRITICAL (Must fix before launch)

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 1 | **Service role key hardcoded in source** | `src/lib/supabase/config.ts` | Full database admin access exposed in Git |
| 2 | **Promo codes are cosmetic only** | `ticket-purchase.tsx`, `checkout/route.ts` | Buyers see discount but are charged full price |
| 3 | **Event timestamps lack timezone** | `src/app/actions/events.ts:130` | Events display at wrong times for users |

### HIGH (Should fix before launch)

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 4 | Advisory lock may not prevent race conditions | `checkout/route.ts:95` | Potential overselling of last tickets |
| 5 | Settlement email never actually sends | `settlement-email.ts` | Feature appears complete but is non-functional |
| 6 | Settlement calculation inconsistency (refunds) | `settlements.ts` vs `auto-settlement.ts` | Manual settlement may overstate revenue |
| 7 | Hardcoded date in AI event parser | `ai-parse-event.ts:73` | "Next saturday" calculations will be wrong |

### MEDIUM (Should fix soon after launch)

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 8 | No email verification on signup | `auth.ts:26-29` | Anyone can sign up with any email |
| 9 | No slug uniqueness check in onboarding | `onboarding/page.tsx` | Poor UX on duplicate collective names |
| 10 | Check-in shows "Guest" for all attendees | `check-in.ts` | Door staff can't identify people |
| 11 | No rate limiting on auth | `auth.ts`, `login/page.tsx` | Brute force / abuse potential |

### What Works Well

- Authentication flow is complete with login, signup, magic link, and password reset
- Middleware properly protects dashboard routes
- Onboarding has graceful AI failure handling with sensible defaults
- Budget planner math is sound with proper fee accounting
- Free ticket flow correctly bypasses Stripe
- Webhook has idempotency protection against duplicate ticket creation
- QR check-in handles all error cases (invalid QR, wrong event, duplicate scan, refunded ticket)
- Refund flow properly calls Stripe, updates status, and notifies waitlist
- Settlement has duplicate prevention with both application-level and database-level guards
- All critical errors are caught and surfaced to users with meaningful messages
