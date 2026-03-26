# Nocturn Secondary Features & Infrastructure Audit

**Audit Date:** 2026-03-26
**Auditor:** Claude Opus 4.6
**Scope:** Phase 3 (Secondary Features) + Phase 4 (Infrastructure & Reliability)

---

## Phase 3: Secondary Features

### 3.1 Marketing / Promo Agent

**Does AI email composer generate content?**
- Promo emails: Template-based only (no AI call). Generates a structured email from event data (date, venue, lineup, ticket tiers, URL). Works well but is NOT AI-generated.
- Recap emails: Uses Claude API (`claude-sonnet-4-20250514`) with a well-crafted system prompt. Has a fallback template if `ANTHROPIC_API_KEY` is missing. JSON parsing from response uses regex extraction with graceful fallback.
- **Result:** Promo = template, Recap = real AI generation with fallback.

**Does email send via Resend work? Is the domain correct?**
- `src/lib/email/send.ts` uses Resend SDK. FROM address defaults to `noreply@resend.dev` (test domain) unless `RESEND_FROM_EMAIL` env var is set.
- `sendCampaignEmail` in `src/app/actions/send-campaign.ts` sends to all attendees with batching (10 per batch, 200ms delay), deduplication, and tracks via PostHog.
- Auth check verifies user is a member of the event's collective before sending.

**Is the 24hr reminder cron configured in vercel.json?**
- Yes: `"schedule": "0 14 * * *"` at path `/api/cron/reminders`. Runs daily at 2pm UTC.
- Cron route also sends day-of hype emails, 48hr organizer countdown, and weekly inactive collective nudges.
- Auth check: verifies `CRON_SECRET` bearer token.

| Item | Status |
|------|--------|
| AI email generation (recap) | ✅ PASS |
| AI email generation (promo) | ⚠️ CONCERN - Template only, no AI. Misleading "Generate Email" button for promo type |
| Email send via Resend | ⚠️ CONCERN - Default FROM is `noreply@resend.dev` (test domain). Must set `RESEND_FROM_EMAIL` env var for production |
| 24hr reminder cron | ✅ PASS |
| Email campaign auth check | ✅ PASS |
| Batched sending with rate limiting | ✅ PASS |

---

### 3.2 Calendar Heat Map

**Does scoring logic make sense?**
- Day-of-week scoring: Saturday (95), Friday (90), Thursday (70), Sunday (40), Mon-Wed (20). Reasonable for nightlife.
- Summer boost: +10 for Jun-Sep. Capped at 100.
- Competition penalty: 3+ events = -30, 2 events = -15, 1 other event = -5. Sound logic.
- Own events are marked separately ("Your event" label).

**Does it handle months with no events?**
- Yes. Events array defaults to empty. `eventMap` will be empty. Calendar renders all days with base scores (day-of-week only). Monthly summary shows "0 events across 0 nights."

| Item | Status |
|------|--------|
| Scoring logic | ✅ PASS |
| Months with no events | ✅ PASS |
| Competition penalty logic | ✅ PASS |
| Calendar loading state | ✅ PASS |
| Missing: error.tsx for calendar | ❌ FAIL - No `error.tsx` in `/dashboard/calendar/` |

---

### 3.3 Ambassador / Referral

**Does ?ref= tracking work in the checkout flow?**
- `trackReferral()` in `src/app/actions/referrals.ts` updates `tickets.referred_by` with the referrer user ID.
- However, the checkout API route (`src/app/api/checkout/route.ts`) does NOT extract or pass `ref` from the URL query params to the ticket metadata. The `post-purchase-hooks.ts` is imported but the `ref` parameter is not wired through checkout.
- `generateReferralLink()` generates links with `?ref=<userId>` appended.

**Does the reward logic execute?**
- `checkReferralReward()` exists and checks threshold (default 5). Ambassador config allows custom reward rules.
- But rewards are display-only in the UI. No actual reward fulfillment (no free ticket creation, no discount code generation). The leaderboard shows who qualifies but nothing happens automatically.

| Item | Status |
|------|--------|
| Referral link generation | ✅ PASS |
| ?ref= tracking in checkout flow | ❌ FAIL - ref param is not extracted from URL and not passed through the checkout API |
| Reward rules configuration UI | ✅ PASS |
| Automatic reward fulfillment | ❌ FAIL - Display only. No actual free ticket or discount code creation |
| Referral stats / leaderboard | ✅ PASS |
| Post-event insights | ✅ PASS |

---

### 3.4 Artist Directory

**Does search work?**
- Yes. Client-side filter by name, genre, and location (metadata.location). Case-insensitive. Instant filtering.

**Does booking flow work?**
- No dedicated booking flow exists. Artist detail page (`/dashboard/artists/[artistId]/`) shows profile info.
- Artists have `booking_email` and `default_fee` fields displayed. User would need to contact manually.
- No in-app booking request, no calendar integration, no payment flow for artist fees.

| Item | Status |
|------|--------|
| Artist search | ✅ PASS |
| Artist creation form | ✅ PASS |
| Artist detail page | ✅ PASS |
| In-app booking flow | ❌ FAIL - Does not exist. Booking email displayed but no request mechanism |
| Artist profile links (Instagram, SC, Spotify) | ✅ PASS |

---

### 3.5 Team Chat

**Does Supabase Realtime subscription work?**
- Yes. `src/app/(dashboard)/dashboard/chat/[channelId]/page.tsx` subscribes to `postgres_changes` on the `messages` table filtered by `channel_id`. Uses `INSERT` event listener.
- Deduplication check prevents duplicate messages (checks by ID before appending).
- Cleanup: `supabase.removeChannel(sub)` called in useEffect cleanup.

**Is there error handling if Realtime disconnects?**
- No explicit reconnection logic. No `onError`, `onClose`, or `onStatusChange` handlers on the subscription.
- If the Realtime connection drops, messages will stop arriving with no user-visible indication.
- AI response failure has a fallback (inserts a "having trouble" message client-side).

| Item | Status |
|------|--------|
| Realtime subscription | ✅ PASS |
| Message deduplication | ✅ PASS |
| Subscription cleanup | ✅ PASS |
| Reconnection / disconnect handling | ❌ FAIL - No reconnection logic, no user notification on disconnect |
| AI chat integration | ✅ PASS |
| Voice messages | ⚠️ CONCERN - Voice URL is `mock://voice/...` - not real audio storage |

---

### 3.6 Voice Recording

**Does it handle mic permission denial?**
- Yes. `startRecording()` wraps `getUserMedia` in try/catch. On error, sets `permissionError` state with the error message. UI displays error with "Check your browser microphone permissions" guidance.

**Does the long recording upload + transcription pipeline work?**
- Two-path architecture: Short (<3MB or <3min) sends base64 directly. Long recordings upload to Supabase Storage, then transcribe server-side.
- `transcribeFromStorage()` downloads from Storage, sends to Whisper API, then uses GPT-4o-mini for summary/action items/key decisions.
- Handles >25MB files with a warning log but no actual chunking (documented as "future enhancement").
- Long transcripts truncated to 30,000 chars for GPT analysis.
- Error handling: try/catch throughout, recording status set to "failed" on error.

| Item | Status |
|------|--------|
| Mic permission denial handling | ✅ PASS |
| Short recording transcription | ✅ PASS |
| Long recording upload pipeline | ✅ PASS |
| Whisper 25MB limit handling | ⚠️ CONCERN - Files >25MB will be sent anyway and likely fail silently |
| AI summary extraction | ✅ PASS |
| Recording status tracking | ✅ PASS |

---

### 3.7 Attendee CRM

**Does CSV export work?**
- Yes. `exportAttendeesCSV()` server action generates CSV string. Client creates a Blob, ObjectURL, and triggers download via programmatic anchor click.
- File named with date: `nocturn-attendees-YYYY-MM-DD.csv`.

**Does repeat tracking work?**
- Yes. `getAttendees()` aggregates tickets by email across all events. Calculates `totalEvents`, `ticketCount`, `totalSpent`, `lastEventDate`, and `eventTitles`.
- Stats card shows repeat attendees (2+ events) count.
- Both desktop and mobile layouts show event count and ticket count.

| Item | Status |
|------|--------|
| CSV export | ✅ PASS |
| Repeat attendee tracking | ✅ PASS |
| Attendee search | ✅ PASS |
| Revenue per attendee | ✅ PASS |
| Mobile layout | ✅ PASS |

---

### 3.8 Analytics

**Are PostHog events being tracked on key actions?**
- `src/lib/posthog.ts` initializes PostHog with `autocapture: true`, `capture_pageview: true`, `capture_pageleave: true`.
- Custom events tracked: `email_campaign_sent`, `ticket_purchased`, `ticket_free_registered` (via `src/lib/track-server.ts`).
- No PostHog events on: event creation, artist creation, recording completion, referral link generation, or chat messages.

**Is Sentry configured with source maps?**
- Yes. `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` all exist.
- `next.config.ts` uses `withSentryConfig` wrapper with org "nocturn" and project "javascript-nextjs".
- Client config: 10% traces sample rate, 100% replay on error, production-only.
- Source maps will be uploaded automatically via the Sentry webpack plugin.

| Item | Status |
|------|--------|
| PostHog initialization | ✅ PASS |
| PostHog autocapture | ✅ PASS |
| PostHog custom events on key actions | ⚠️ CONCERN - Only 3 custom events tracked. Missing: event creation, chat usage, recording, referral actions |
| Sentry configuration | ✅ PASS |
| Sentry source maps | ✅ PASS |
| Analytics dashboard (founder) | ✅ PASS - Uses `Promise.all` for 19 parallel queries, good performance |
| PostHog key hardcoded | ⚠️ CONCERN - Public key hardcoded in `src/lib/posthog.ts` instead of env var. Functional but not best practice |

---

## Phase 4: Infrastructure & Reliability

### 4.1 Error Handling

**Do ALL API routes have try/catch?**

| Route | Has try/catch | Status |
|-------|--------------|--------|
| `/api/checkout` | Yes, wraps entire handler | ✅ PASS |
| `/api/create-payment-intent` | Yes | ✅ PASS |
| `/api/webhooks/stripe` | Yes, signature verification + handler | ✅ PASS |
| `/api/cron/reminders` | Yes, individual try/catch per section | ✅ PASS |
| `/api/generate-poster` | Yes | ✅ PASS |
| `/api/events/list` | No try/catch | ❌ FAIL |
| `/api/unsplash` | No try/catch on GET (fetch could throw) | ❌ FAIL |
| `/api/seed-venues` | No try/catch | ❌ FAIL |
| `/api/seed-artists` | No try/catch | ❌ FAIL |
| `/api/seed-demo` | No try/catch | ❌ FAIL |
| `/api/auth/callback` | Not reviewed (auth utility) | -- |
| `/api/stripe/connect/callback` | No try/catch (one-liner redirect) | ⚠️ CONCERN |

**Do ALL dashboard pages have error.tsx?**

Pages WITH error.tsx:
- `/dashboard` (root), `/dashboard/artists`, `/dashboard/attendees`, `/dashboard/audience`, `/dashboard/chat`, `/dashboard/discover`, `/dashboard/events`, `/dashboard/finance`, `/dashboard/marketing`, `/dashboard/members`, `/dashboard/promo-insights`, `/dashboard/record`, `/dashboard/settings`, `/dashboard/venues`, `/dashboard/events/[eventId]/refunds`

Pages MISSING error.tsx:
| Page | Status |
|------|--------|
| `/dashboard/calendar` | ❌ FAIL |
| `/dashboard/analytics` | ❌ FAIL |
| `/dashboard/events/[eventId]` (detail + sub-pages) | ❌ FAIL |
| `/dashboard/events/new` | ❌ FAIL |
| `/dashboard/chat/[channelId]` | ❌ FAIL |
| `/dashboard/artists/[artistId]` | ❌ FAIL |
| `/dashboard/artists/me` | ❌ FAIL |
| `/dashboard/venues/me` | ❌ FAIL |

---

### 4.2 Loading States

Pages WITH loading.tsx:
- `/dashboard` (root), `/dashboard/artists`, `/dashboard/attendees`, `/dashboard/audience`, `/dashboard/calendar`, `/dashboard/chat`, `/dashboard/events`, `/dashboard/finance`, `/dashboard/marketing`, `/dashboard/members`, `/dashboard/promo-insights`, `/dashboard/record`, `/dashboard/settings`, `/dashboard/venues`, `/dashboard/analytics`, `/dashboard/events/[eventId]/refunds`

Pages MISSING loading.tsx:
| Page | Status |
|------|--------|
| `/dashboard/discover` | ❌ FAIL |
| `/dashboard/events/[eventId]` (detail + all sub-pages) | ❌ FAIL |
| `/dashboard/chat/[channelId]` | ❌ FAIL |
| `/dashboard/artists/[artistId]` | ❌ FAIL |
| `/dashboard/artists/me` | ❌ FAIL |
| `/dashboard/venues/me` | ❌ FAIL |
| `/dashboard/marketing/email` | ❌ FAIL |

Note: Many client-side pages handle their own loading state internally, which is acceptable but not as good as server-side loading.tsx for initial page load.

---

### 4.3 Mobile / Responsive

**Hardcoded widths / overflow issues:**
- Calendar grid uses `grid-cols-7` which is fine (equal divisions).
- Chat page uses `max-w-2xl` constraint -- good.
- Attendee CRM has proper mobile layout (`sm:hidden` / `hidden sm:grid`) -- good.
- Artist cards use `sm:grid-cols-2` -- responsive.
- No hardcoded pixel widths found on layout containers.

**Touch target sizes (min 44px):**
- Main record button: 80x80px -- ✅ PASS
- Chat send button: 44px (w-11 h-11) -- ✅ PASS
- Chat mic button: Uses `MicButton` component -- assumed adequate
- Calendar day cells: `aspect-square` in 7-column grid. On small screens (375px wide), each cell is ~50px -- ✅ PASS
- Navigation tabs: Bottom tab bar uses 48px targets per CLAUDE.md -- ✅ PASS
- Some small icon buttons use `size="icon"` which defaults to 40x40 in shadcn -- ⚠️ borderline

| Item | Status |
|------|--------|
| Responsive grid layouts | ✅ PASS |
| Mobile-specific layouts | ✅ PASS |
| Touch targets >= 44px | ⚠️ CONCERN - Some icon buttons are 40px (shadcn default). Most interactive elements meet 44px |
| No hardcoded pixel widths on containers | ✅ PASS |
| Overflow handling | ✅ PASS - `truncate` used on text, `min-w-0` on flex children |

---

### 4.4 Performance

**N+1 query patterns:**
- **Chat page (`chat/page.tsx`):** CRITICAL N+1. For each channel, makes an individual query to fetch the last message. With 10 channels, this is 10+1 queries. Should be a single query with a join or RPC.
- **Cron reminders (`api/cron/reminders/route.ts`):** Multiple N+1 patterns in the inactive nudge section. Loops through collectives, querying last event and audit logs for each one individually.
- **Referral stats:** Queries all tickets, then queries user names for each referrer. The second query uses `IN` which is fine.

**Are heavy pages using Promise.all?**
- Analytics page: Yes, 19 parallel queries via `Promise.all` -- excellent.
- Referrals page: Yes, `Promise.all` for stats, config, and insights -- good.
- Event detail page: Not reviewed in detail.
- Chat page: Uses `Promise.all` for channel metadata -- but each channel still has an inner query (N+1).

**Is next/image used instead of `<img>`?**
- `next/image` is used in 5 files (public event page, past events, ticket component, also-this-week, middleware).
- Raw `<img>` tag found in 1 file: `/dashboard/events/[eventId]/design/page.tsx`.
- Most pages use Lucide icons and CSS backgrounds rather than images.

| Item | Status |
|------|--------|
| N+1 in chat channel list | ❌ FAIL - Each channel queries last message individually |
| N+1 in cron inactive nudge | ⚠️ CONCERN - Loops through collectives with individual queries (limited to 100) |
| Promise.all for parallel queries | ✅ PASS - Used effectively in analytics and referrals |
| next/image usage | ⚠️ CONCERN - 1 raw `<img>` tag found in design page |
| next.config.ts image optimization | ✅ PASS - AVIF + WebP formats configured, remote patterns set |

---

### 4.5 Security

**Auth verification on API routes:**

| Route | Auth Check | Status |
|-------|-----------|--------|
| `/api/checkout` | None (public-facing, takes buyer email) | ✅ PASS - Correct, public checkout |
| `/api/create-payment-intent` | None (public-facing) | ✅ PASS - Correct, public checkout |
| `/api/webhooks/stripe` | Stripe signature verification | ✅ PASS |
| `/api/cron/reminders` | `CRON_SECRET` bearer token | ✅ PASS |
| `/api/events/list` | Supabase auth check | ✅ PASS |
| `/api/generate-poster` | Not fully reviewed | -- |
| `/api/unsplash` | No auth check | ❌ FAIL - Anyone can proxy Unsplash API calls |
| `/api/seed-venues` | Not fully reviewed | ⚠️ CONCERN - Seed routes should be protected |
| `/api/seed-artists` | Not fully reviewed | ⚠️ CONCERN |
| `/api/seed-demo` | Auth check (requires logged-in user) | ✅ PASS |
| `/api/stripe/connect/callback` | No auth (redirect only) | ⚠️ CONCERN |

**Stripe webhook signature verification:**
- ✅ PASS. Uses `getStripe().webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET)`. Returns 400 on verification failure.

**Hardcoded secrets or API keys:**

| Finding | Severity | Status |
|---------|----------|--------|
| Supabase service role key hardcoded in `src/lib/supabase/config.ts` | **CRITICAL** | ❌ FAIL |
| Supabase anon key hardcoded in `src/lib/supabase/config.ts` | Medium | ⚠️ CONCERN - Anon key is designed to be public, but service role key is NOT |
| PostHog key hardcoded in `src/lib/posthog.ts` | Low | ⚠️ CONCERN - Public key, but should use env var |

**CRITICAL SECURITY ISSUE:** The Supabase service role key is hardcoded in source code at `src/lib/supabase/config.ts`. This key bypasses all Row Level Security (RLS) policies and grants full admin access to the database. If this repository is public or if the key is exposed in client-side bundles, this is a severe vulnerability. The comment says "Next.js tree-shakes this from client bundles" but this relies on correct tree-shaking behavior which is not guaranteed.

**SQL injection vectors:**
- No string concatenation in queries found. All Supabase queries use the builder pattern with parameterized values.
- ✅ PASS - No SQL injection vectors detected.

**Additional security concerns:**
- Email campaign `sendCampaignEmail` has proper ownership verification (checks collective membership).
- Checkout route validates input (quantity 1-10, price validation, capacity check with advisory lock).
- Referral `trackReferral()` takes a `ticketId` and `referrerId` without auth -- could be called by anyone with valid IDs.

| Item | Status |
|------|--------|
| Stripe webhook signature | ✅ PASS |
| SQL injection protection | ✅ PASS |
| Hardcoded service role key | ❌ FAIL - CRITICAL. Must move to environment variable |
| API route auth coverage | ⚠️ CONCERN - Unsplash and seed routes lack auth |
| CSRF protection | ✅ PASS - Next.js server actions have built-in CSRF tokens |
| Security headers | ✅ PASS - X-Content-Type-Options, X-Frame-Options, Referrer-Policy in vercel.json |
| Checkout input validation | ✅ PASS |
| Idempotency on webhook | ✅ PASS - Checks for existing tickets before creating |

---

## Summary

### Critical Issues (Must Fix Before Launch)

1. **HARDCODED SERVICE ROLE KEY** (`src/lib/supabase/config.ts`): The Supabase service role key is committed to source code. This key has full database admin access. Move to `SUPABASE_SERVICE_ROLE_KEY` environment variable immediately.

2. **Referral tracking not wired through checkout**: The `?ref=` parameter is generated and links are created, but the checkout API does not extract or persist the referrer ID. Referral tracking is effectively broken.

3. **No Realtime disconnect handling in chat**: If the WebSocket connection drops, users get no notification and messages stop arriving silently.

4. **N+1 query in chat channel list**: Each channel makes an individual query for its last message. Will degrade with more channels.

### High Priority Issues

5. **8 dashboard pages missing error.tsx** (calendar, analytics, event detail pages, channel detail, artist detail)
6. **7 pages missing loading.tsx** (discover, event sub-pages, channel detail, artist detail, venues/me, marketing/email)
7. **5 API routes missing try/catch** (events/list, unsplash, seed routes)
8. **Unsplash API route has no auth** -- could be abused for API quota exhaustion
9. **Resend FROM email defaults to test domain** (`noreply@resend.dev`)
10. **Promo email type shows "Generate Email" but produces a template, not AI content** -- misleading UX

### Medium Priority

11. PostHog only tracks 3 custom events; key user actions untracked
12. Voice messages in chat use mock URLs (`mock://voice/...`)
13. No artist booking flow (directory is view-only)
14. Ambassador rewards are display-only (no fulfillment)
15. Whisper 25MB limit not enforced (large files will fail)
16. Some icon buttons are 40px (below 44px touch target minimum)
17. One raw `<img>` tag instead of `next/image`

### Score Summary

| Category | Pass | Fail | Concern |
|----------|------|------|---------|
| 3.1 Marketing | 4 | 0 | 2 |
| 3.2 Calendar | 4 | 1 | 0 |
| 3.3 Referral | 3 | 2 | 0 |
| 3.4 Artists | 4 | 1 | 0 |
| 3.5 Chat | 3 | 1 | 1 |
| 3.6 Recording | 5 | 0 | 1 |
| 3.7 Attendees | 5 | 0 | 0 |
| 3.8 Analytics | 4 | 0 | 2 |
| 4.1 Error Handling | 5 | 13 | 1 |
| 4.2 Loading States | -- | 7 | 0 |
| 4.3 Mobile | 4 | 0 | 1 |
| 4.4 Performance | 3 | 1 | 2 |
| 4.5 Security | 7 | 1 | 3 |
| **TOTAL** | **51** | **27** | **13** |
