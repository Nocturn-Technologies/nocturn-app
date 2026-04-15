# Day 2 morning — Event creation + ticket purchase flow audit

**Mode: AUDIT ONLY. Output to `.hardening/day2/audit.md`.**

## Audit 1 — Event creation flow
Trace the entire event creation flow end-to-end in code:
1. User clicks "Create Event"
2. AI chat / form-based creation (text, voice, URL paths in `src/app/actions/ai-parse-event.ts`)
3. Form population and editing
4. Save to database (event + ticket_tiers + expenses)
5. Event appears in dashboard

For each step, audit:
- Error handling + user-facing error messages (not raw error objects)
- Loading states
- Validation (Zod or manual)
- Cancel-mid-flow behavior (is partial state persisted or discarded?)
- Empty / malformed input handling
- Supabase or Claude API failure paths
- Are buttons disabled during loading? Feedback on success?

## Audit 2 — Ticket purchase flow
Trace the full public ticket-buying flow:
1. Public event page loads (`src/app/(public)/...`)
2. Tier + quantity selection
3. Stripe Checkout OR PaymentIntent flow (`src/app/api/checkout/`, `src/app/api/create-payment-intent/`)
4. Success/failure handling
5. Confirmation page + email with QR code
6. Ticket appears in organizer dashboard
7. Webhook handling in `src/app/api/webhooks/stripe/`

Check specifically:
- Stripe failure (network, card decline, 3DS abandon)
- Event sold out mid-checkout — does the atomic `fulfill_tickets_atomic` RPC prevent over-selling?
- User refresh during payment — idempotency
- Webhook events covered: `payment_intent.succeeded`, `checkout.session.completed`, `charge.failed`, `charge.disputed` (dispute/refund path)
- Webhook signature verification (`STRIPE_WEBHOOK_SECRET` — HMAC check)
- QR code generation and delivery via Resend

## Output
One file: `.hardening/day2/audit.md`. Use the template from `_context.md`. Protected-path issues (anything under `/api/stripe/**` or `/api/webhooks/**`) should still be listed — midday will route them to an issue, not a PR.

## Stop conditions
Read-only. No edits. No build commands.
