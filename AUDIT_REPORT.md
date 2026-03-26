# Nocturn Codebase Audit Report

**Date:** 2026-03-26
**Project:** bpzwbqtpyorppijdblhy
**Scope:** Routes, env vars, integrations, dead code, database schema

---

## 1. Route Inventory

### Pages (47 total)

| Path | Type | Auth Required | Notes |
|------|------|--------------|-------|
| `(public)/page.tsx` | Landing | No | Public landing/waitlist |
| `(public)/e/[slug]/[eventSlug]/page.tsx` | Event page | No | Public event listing |
| `(public)/e/success/page.tsx` | Confirmation | No | Post-purchase success |
| `(public)/check-in/[token]/page.tsx` | Check-in | No | Token-based access |
| `(public)/invite/[token]/page.tsx` | Invite | No | Token-based access |
| `(public)/ticket/[token]/page.tsx` | Ticket | No | Token-based access |
| `(auth)/login/page.tsx` | Auth | No | Login form |
| `(auth)/signup/page.tsx` | Auth | No | Signup form |
| `auth/reset-password/page.tsx` | Auth | No | Password reset |
| `onboarding/page.tsx` | Onboarding | Yes* | No layout guard visible |
| `legal/privacy/page.tsx` | Legal | No | Privacy policy |
| `legal/terms/page.tsx` | Legal | No | Terms of service |
| `(dashboard)/dashboard/page.tsx` | Dashboard | Yes | Main dashboard |
| `(dashboard)/dashboard/analytics/page.tsx` | Dashboard | Yes | Analytics |
| `(dashboard)/dashboard/artists/page.tsx` | Dashboard | Yes | Artist list |
| `(dashboard)/dashboard/artists/[artistId]/page.tsx` | Dashboard | Yes | Artist detail |
| `(dashboard)/dashboard/artists/me/page.tsx` | Dashboard | Yes | Own artist profile |
| `(dashboard)/dashboard/attendees/page.tsx` | Dashboard | Yes | Attendee management |
| `(dashboard)/dashboard/audience/page.tsx` | Dashboard | Yes | Audience insights |
| `(dashboard)/dashboard/calendar/page.tsx` | Dashboard | Yes | Calendar view |
| `(dashboard)/dashboard/chat/page.tsx` | Dashboard | Yes | Chat list |
| `(dashboard)/dashboard/chat/[channelId]/page.tsx` | Dashboard | Yes | Chat channel |
| `(dashboard)/dashboard/discover/page.tsx` | Dashboard | Yes | Discovery |
| `(dashboard)/dashboard/events/page.tsx` | Dashboard | Yes | Event list |
| `(dashboard)/dashboard/events/new/page.tsx` | Dashboard | Yes | Create event |
| `(dashboard)/dashboard/events/[eventId]/page.tsx` | Dashboard | Yes | Event detail |
| `(dashboard)/dashboard/events/[eventId]/chat/page.tsx` | Dashboard | Yes | Event chat |
| `(dashboard)/dashboard/events/[eventId]/check-in/page.tsx` | Dashboard | Yes | Event check-in |
| `(dashboard)/dashboard/events/[eventId]/design/page.tsx` | Dashboard | Yes | Poster design |
| `(dashboard)/dashboard/events/[eventId]/edit/page.tsx` | Dashboard | Yes | Edit event |
| `(dashboard)/dashboard/events/[eventId]/forecast/page.tsx` | Dashboard | Yes | Financial forecast |
| `(dashboard)/dashboard/events/[eventId]/guests/page.tsx` | Dashboard | Yes | Guest list |
| `(dashboard)/dashboard/events/[eventId]/lineup/page.tsx` | Dashboard | Yes | Artist lineup |
| `(dashboard)/dashboard/events/[eventId]/live/page.tsx` | Dashboard | Yes | Live event view |
| `(dashboard)/dashboard/events/[eventId]/playbook/page.tsx` | Dashboard | Yes | Playbook tasks |
| `(dashboard)/dashboard/events/[eventId]/promos/page.tsx` | Dashboard | Yes | Promo codes |
| `(dashboard)/dashboard/events/[eventId]/recap/page.tsx` | Dashboard | Yes | Post-event recap |
| `(dashboard)/dashboard/events/[eventId]/referrals/page.tsx` | Dashboard | Yes | Referral tracking |
| `(dashboard)/dashboard/events/[eventId]/refunds/page.tsx` | Dashboard | Yes | Refund management |
| `(dashboard)/dashboard/events/[eventId]/tasks/page.tsx` | Dashboard | Yes | Task management |
| `(dashboard)/dashboard/events/[eventId]/wrap/page.tsx` | Dashboard | Yes | Event wrap-up |
| `(dashboard)/dashboard/finance/page.tsx` | Dashboard | Yes | Finance overview |
| `(dashboard)/dashboard/finance/[eventId]/page.tsx` | Dashboard | Yes | Event finance |
| `(dashboard)/dashboard/marketing/page.tsx` | Dashboard | Yes | Marketing hub |
| `(dashboard)/dashboard/marketing/email/page.tsx` | Dashboard | Yes | Email campaigns |
| `(dashboard)/dashboard/members/page.tsx` | Dashboard | Yes | Member management |
| `(dashboard)/dashboard/promo-insights/page.tsx` | Dashboard | Yes | Promo analytics |
| `(dashboard)/dashboard/record/page.tsx` | Dashboard | Yes | Voice recording |
| `(dashboard)/dashboard/settings/page.tsx` | Dashboard | Yes | Settings |
| `(dashboard)/dashboard/venues/page.tsx` | Dashboard | Yes | Venue list |
| `(dashboard)/dashboard/venues/me/page.tsx` | Dashboard | Yes | Own venue profile |

### API Routes (13 total)

| Path | Method | Auth | Notes |
|------|--------|------|-------|
| `api/auth/callback/route.ts` | GET | Supabase | OAuth callback |
| `auth/confirm/route.ts` | GET | Supabase | Email confirmation |
| `api/checkout/route.ts` | POST | Supabase | Stripe checkout session |
| `api/create-payment-intent/route.ts` | POST | Supabase | Payment intent |
| `api/cron/reminders/route.ts` | POST | CRON_SECRET | Vercel cron job |
| `api/events/list/route.ts` | GET | Supabase | Event listing API |
| `api/generate-poster/route.ts` | POST | **NONE** | Replicate AI poster gen |
| `api/seed-artists/route.ts` | POST | Supabase | Dev seed data |
| `api/seed-demo/route.ts` | POST | Supabase | Dev seed data |
| `api/seed-venues/route.ts` | POST | Supabase | Dev seed data |
| `api/stripe/connect/callback/route.ts` | GET | **NONE** | Redirect only |
| `api/unsplash/route.ts` | GET | **NONE** | Unsplash proxy |
| `api/webhooks/stripe/route.ts` | POST | Stripe sig | Webhook verification |

> **WARNING:** `generate-poster` and `unsplash` routes have no auth. Anyone can call them and burn API credits.

---

## 2. Environment Variables

| Variable | Required | Used In |
|----------|----------|---------|
| `ANTHROPIC_API_KEY` | Yes | `actions/ai-parse-event`, `ai-email`, `ai-enrich-event`, `lib/claude` |
| `CRON_SECRET` | Yes | `api/cron/reminders` |
| `NEXT_PUBLIC_APP_URL` | Yes | 12 files (tickets, stripe, emails, public pages) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Yes | `stripe-checkout`, `lib/stripe` |
| `NEXT_RUNTIME` | No | `instrumentation.ts` (Sentry) |
| `OPENAI_API_KEY` | Yes | `actions/transcribe` (Whisper) |
| `REPLICATE_API_TOKEN` | Yes | `api/generate-poster` |
| `RESEND_API_KEY` | Yes | `actions/recap-email`, `auth`, `lib/email/send`, `lib/resend` |
| `RESEND_FROM_EMAIL` | Yes | `lib/email/send` |
| `STRIPE_SECRET_KEY` | Yes | `lib/stripe` |
| `STRIPE_WEBHOOK_SECRET` | Yes | `lib/stripe` |
| `UNSPLASH_ACCESS_KEY` | Yes | `api/unsplash` |

> **Note:** Supabase vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) are loaded via `lib/supabase/config` and not via `process.env` directly in `src/`.

---

## 3. Integration Inventory

| Integration | Config File | Error Handling | Fallback |
|-------------|-------------|----------------|----------|
| **Stripe** | `lib/stripe.ts` | Throws if key missing; webhook sig verified | None |
| **Resend** | `lib/resend/index.ts`, `lib/email/send.ts` | try/catch, returns `{ error }` | Dev mode skips send |
| **PostHog** | `lib/posthog.ts`, `components/posthog-provider.tsx` | No visible error handling | None |
| **Sentry** | `instrumentation.ts`, `global-error.tsx` | `onRequestError` captures exceptions | None |
| **OpenAI** | Used in `actions/transcribe.ts` | Not checked (direct usage) | None |
| **Anthropic** | `lib/claude.ts` | try/catch, console.error | None |
| **Replicate** | `api/generate-poster/route.ts` | Not checked | None |
| **Unsplash** | `api/unsplash/route.ts` | Returns error if key missing | None |

---

## 4. Dead Code

### Unused Components (4 files)

| File | Export | Notes |
|------|--------|-------|
| `src/components/empty-state.tsx` | `EmptyState` | Not imported anywhere |
| `src/components/nocturn-loading.tsx` | `NocturnLoading` | Not imported anywhere |
| `src/components/page-transition.tsx` | `PageTransition` | Not imported anywhere |
| `src/components/ticket-purchase.tsx` | `TicketPurchase` | Replaced by `stripe-checkout.tsx`? |

### Unused Server Actions (5 files)

| File | Notes |
|------|-------|
| `src/app/actions/check-in-analytics.ts` | Not imported anywhere |
| `src/app/actions/cohost.ts` | Not imported anywhere |
| `src/app/actions/recap-email.ts` | Not imported anywhere |
| `src/app/actions/seed-artists.ts` | Not imported anywhere |
| `src/app/actions/ticket-notifications.ts` | Not imported anywhere |

---

## 5. Database Schema

### Tables (35 total)

| Table | Columns | RLS | Rows | Notes |
|-------|---------|-----|------|-------|
| artists | 13 | Yes | 16 | |
| attendee_profiles | 13 | **No** | 0 | Missing RLS |
| audit_logs | 5 | **No** | 2 | Missing RLS |
| channels | 8 | Yes | 16 | |
| collective_members | 6 | Yes | 4 | |
| collectives | 12 | Yes | 4 | |
| event_activity | 7 | Yes | 4 | |
| event_artists | 14 | Yes | 17 | |
| event_cards | 10 | Yes | 0 | |
| event_collectives | 9 | **No** | 0 | Missing RLS |
| event_expenses | 9 | Yes | 0 | |
| event_reactions | 5 | Yes | 9 | |
| event_tasks | 20 | Yes | 30 | |
| events | 32 | Yes | 17 | |
| expenses | 7 | Yes | 0 | |
| guest_list | 11 | Yes | 0 | |
| invitations | 10 | Yes | 0 | |
| marketing_outputs | 7 | Yes | 0 | |
| messages | 9 | Yes | 13 | |
| org_members | 5 | Yes | 0 | |
| organizations | 5 | Yes | 0 | |
| playbook_task_templates | 9 | Yes | 32 | |
| playbook_templates | 7 | Yes | 3 | |
| profiles | 5 | Yes | 0 | |
| promo_codes | 11 | Yes | 0 | |
| recordings | 12 | Yes | 2 | |
| saved_venues | 19 | Yes | 0 | |
| settlement_lines | 10 | Yes | 0 | |
| settlements | 10 | Yes | 4 | |
| ticket_tiers | 10 | Yes | 32 | |
| ticket_waitlist | 7 | **No** | 0 | Missing RLS |
| tickets | 14 | Yes | 935 | |
| users | 6 | Yes | 5 | |
| venues | 9 | Yes | 10 | |
| waitlist | 6 | Yes | 2 | |

### RLS Policy Summary (66 policies)

| Table | SELECT | INSERT | UPDATE | DELETE | ALL | Scoping |
|-------|--------|--------|--------|--------|-----|---------|
| artists | anon + auth | auth | auth (any) | - | - | Open to all authenticated |
| channels | anon + auth | auth | auth (any) | - | - | Open to all authenticated |
| collective_members | auth | auth | auth | auth | - | Open to all authenticated (no row filter) |
| collectives | anon + auth | auth | membership-scoped | - | - | Update requires membership |
| event_activity | anon | - | - | - | auth | Open ALL for authenticated |
| event_artists | anon + membership | auth | auth (any) | auth (any) | - | Mixed: read is scoped, write is open |
| event_cards | - | auth | auth (any) | - | - | Open to all authenticated |
| event_expenses | - | - | - | - | auth | Open ALL for authenticated |
| event_reactions | public | public | - | - | - | Fully open |
| event_tasks | anon | - | - | - | auth | Open ALL for authenticated |
| events | anon + membership + org | auth | membership-scoped | - | org-admin | Mixed scoping |
| expenses | org-scoped SELECT | - | - | - | - | Read-only, org-scoped |
| guest_list | - | - | - | - | auth | Open ALL for authenticated |
| invitations | - | - | - | - | auth | Open ALL for authenticated |
| marketing_outputs | org-scoped | - | - | - | org-scoped | Org-scoped |
| messages | anon + auth | auth | auth (any) | - | - | Open to all authenticated |
| organizations | org-scoped SELECT | - | - | - | - | Org-scoped |
| playbook_task_templates | - | - | - | - | auth | Open ALL for authenticated |
| playbook_templates | auth SELECT | - | - | - | - | Read-only |
| profiles | uid-scoped | - | uid-scoped | - | - | User-scoped |
| promo_codes | - | - | - | - | auth | Open ALL for authenticated |
| recordings | - | - | - | - | uid-scoped | User-scoped |
| saved_venues | - | - | - | - | uid-scoped | User-scoped |
| settlement_lines | - | - | - | - | auth | Open ALL for authenticated |
| settlements | org-scoped SELECT | - | - | - | auth | Mixed: ALL open, SELECT org-scoped |
| ticket_tiers | anon + membership | auth | - | - | - | Read scoped, insert open |
| tickets | membership-scoped | auth | - | - | - | Membership-scoped |
| users | uid-scoped | auth | uid-scoped | - | - | User-scoped |
| venues | anon + auth | auth | - | - | - | Open reads |
| waitlist | auth SELECT | public INSERT | - | - | - | Public insert, auth read |

### Tables in Code but Not in DB

| Table Name | Notes |
|------------|-------|
| `waitlist_entries` | Code references this, DB has `waitlist` instead -- name mismatch |

### Tables in DB but Not Referenced in Code

| Table Name | Notes |
|------------|-------|
| `expenses` | Exists in DB with RLS, no `.from("expenses")` in code |
| `marketing_outputs` | Has org-scoped RLS, not queried from code |
| `org_members` | Used in RLS policies but not queried directly |
| `organizations` | Used in RLS policies but not queried directly |
| `profiles` | Has user-scoped RLS, not queried from code |
| `waitlist` | Code uses `waitlist_entries` instead (name mismatch) |

---

## Key Findings

| # | Severity | Finding |
|---|----------|---------|
| 1 | **HIGH** | 4 tables have RLS disabled: `attendee_profiles`, `audit_logs`, `event_collectives`, `ticket_waitlist` |
| 2 | **HIGH** | 8 RLS policies use `qual: true` for write ops (any authenticated user can modify any row): `collective_members`, `event_expenses`, `guest_list`, `invitations`, `playbook_task_templates`, `promo_codes`, `settlement_lines`, `settlements` |
| 3 | **MED** | `api/generate-poster` and `api/unsplash` have no auth -- public can burn Replicate/Unsplash API credits |
| 4 | **MED** | `waitlist_entries` table referenced in code does not exist in DB (`waitlist` exists instead) |
| 5 | **LOW** | 4 unused components and 5 unused server actions can be deleted |
| 6 | **LOW** | 5 DB tables (`expenses`, `marketing_outputs`, `org_members`, `organizations`, `profiles`) are not queried from code |
| 7 | **INFO** | Seed routes (`seed-artists`, `seed-demo`, `seed-venues`) should be disabled or removed for production |
