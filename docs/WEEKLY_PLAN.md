# Nocturn MVP — Weekly Build Plan

**Constraint:** Shawn works 9-5, so evening/weekend build sessions only.
**Estimate:** ~15-20 hrs/week of focused build time (evenings + weekends).
**Target:** MVP live with first real events by end of Week 12 (late May 2026).

---

## Phase 1: Agentic OS MVP (Weeks 1-12)

### Week 1 (Mar 16-22): Foundation ✅
- [x] Repo setup, Next.js + Tailwind + shadcn/ui
- [x] Supabase client/server/middleware setup
- [x] Stripe Connect integration scaffolding
- [x] GitHub repo + Vercel deployment
- [x] Create Supabase project + run initial migration (00001_initial_schema.sql)
- [x] Set up Supabase Auth (email/magic link)
- [x] Create signup/login pages with Supabase Auth UI

### Week 2 (Mar 23-29): Auth & Collective CRUD ✅
- [x] Complete auth flow: signup → create collective → dashboard
- [x] Collective creation form (name, slug, bio, city, instagram, website)
- [x] Collective settings page
- [x] Dashboard layout (sidebar nav, header, main content area, mobile bottom tabs)
- [x] Protected routes working end-to-end

### Week 3 (Mar 30 - Apr 5): Member Management ✅ (done early)
- [x] Member add system (email lookup + add to collective)
- [x] Member list with role management (admin/promoter/talent_buyer/door_staff)
- [ ] Accept invitation flow (email invite link)
- [ ] Member activity feed on dashboard
- [ ] RLS policies tested for member access control

### Week 4 (Apr 6-12): Event Creation ✅ (done early)
- [x] Event builder form (3-step wizard: details → venue → tickets)
- [x] Venue creation (inline during event creation)
- [x] Ticket tier configuration (name, price, quantity)
- [ ] Event status management (draft → published → completed)
- [x] Public event page (shareable URL: /e/[collective-slug]/[event-slug])

### Week 5 (Apr 13-19): Artist Booking
- [ ] Artist database (create, search, browse)
- [ ] Event lineup builder (add artists, set times, fees, status)
- [ ] Booking status workflow (pending → confirmed → declined)
- [ ] Artist page with upcoming events
- [ ] Genre tagging and search

### Week 6 (Apr 20-26): Stripe Connect + Ticketing
- [ ] Stripe Connect Express onboarding flow for collectives
- [ ] Ticket purchase flow (select tier → checkout → Stripe payment)
- [ ] QR code ticket generation (ticket_token)
- [ ] Order confirmation email via Resend
- [ ] Stripe webhook handler (payment_intent.succeeded, etc.)
- [ ] **BIZ: Identify 8-10 Toronto collectives for beta outreach**

### Week 7 (Apr 27 - May 3): Settlement Engine
- [ ] Post-event settlement generation (auto-calculate from ticket sales)
- [ ] Revenue split configuration UI (percentage per member/artist/venue)
- [ ] Settlement approval workflow
- [ ] P&L report view
- [ ] Transaction ledger recording

### Week 8 (May 4-10): Payouts + Demo Prep
- [ ] Payout execution via Stripe Connect transfers
- [ ] Settlement report email (auto-send to all stakeholders)
- [ ] Payout status tracking (pending → completed)
- [ ] **BIZ: Begin 1-on-1 demos with target collectives**
- [ ] Polish dashboard with real data views

### Week 9 (May 11-17): CRM & Attendee Data
- [ ] Attendee database built from ticket purchases
- [ ] Attendee profiles (events attended, total spend, tags)
- [ ] Simple segmentation (one-time vs repeat attendees)
- [ ] Attendee list export (CSV)
- [ ] Promo code system for promoter referral tracking

### Week 10 (May 18-24): AI Email + Event Pages
- [ ] AI-drafted post-event email (recap + next event promo) via Claude API
- [ ] Email sending via Resend
- [ ] Public event pages with mobile-optimized design
- [ ] Social sharing metadata (OG tags)
- [ ] **BIZ: Confirm 3-5 collectives for live beta**

### Week 11 (May 25-31): Door Check-in & Polish
- [ ] QR code scanner for door check-in (mobile web camera)
- [ ] Real-time check-in counter via Supabase Realtime
- [ ] Guest list / door list management
- [ ] Capacity tracking
- [ ] Mobile PWA polish (manifest, icons, offline fallback)

### Week 12 (Jun 1-7): QA & Launch
- [ ] End-to-end testing of full flow (create event → sell tickets → check-in → settle)
- [ ] Performance optimization (loading states, error boundaries)
- [ ] Onboarding flow for new collectives
- [ ] Bug fixes from internal testing
- [ ] **MVP LAUNCH — first real events processed on Nocturn**

---

## Key Dependencies / Setup Tasks
- [ ] Create Supabase project at supabase.com
- [ ] Set up Stripe Connect platform account
- [ ] Configure Resend domain (nocturn.app or similar)
- [ ] Set up Sentry for error monitoring
- [ ] Configure environment variables in Vercel

## Build Session Tips (for 9-5 schedule)
- **Weeknight sessions (2-3 hrs):** Focus on one feature at a time. Start with the data model, then the API, then the UI.
- **Weekend sessions (4-6 hrs):** Tackle larger features (Stripe integration, settlement engine).
- **Use Claude Code for acceleration:** Have Claude write the boilerplate, you focus on product decisions and UX.
- **Test with real data early:** Create a test collective and run through flows yourself before demo day.
