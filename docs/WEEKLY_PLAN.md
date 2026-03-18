# Nocturn MVP — Weekly Build Plan

**Constraint:** Shawn works 9-5, so evening/weekend build sessions only.
**Target:** MVP live with first real events by end of Week 12 (late May 2026).
**Status:** ✅ ALL WEEKS COMPLETE — READY FOR QA & LAUNCH

---

## Phase 1: Agentic OS MVP (Weeks 1-12)

### Week 1 (Mar 16-22): Foundation ✅
- [x] Repo setup, Next.js + Tailwind + shadcn/ui
- [x] Supabase client/server/middleware setup
- [x] Stripe Connect integration scaffolding
- [x] GitHub repo + Vercel deployment
- [x] Create Supabase project + run initial migration
- [x] Set up Supabase Auth (email/magic link)
- [x] Create signup/login pages with Supabase Auth UI

### Week 2 (Mar 23-29): Auth & Collective CRUD ✅
- [x] Complete auth flow: signup → create collective → dashboard
- [x] Collective creation form (name, slug, bio, city, instagram, website)
- [x] Collective settings page
- [x] Dashboard layout (sidebar nav, header, main content area, mobile bottom tabs)
- [x] Protected routes working end-to-end

### Week 3 (Mar 30 - Apr 5): Member Management ✅
- [x] Member add system (email lookup + add to collective)
- [x] Member list with role management (admin/promoter/talent_buyer/door_staff)
- [ ] Accept invitation flow (email invite link) — deferred
- [ ] Member activity feed on dashboard — replaced by event activity feed

### Week 4 (Apr 6-12): Event Creation ✅
- [x] Event builder form (3-step wizard: details → venue → tickets)
- [x] Venue creation (inline during event creation)
- [x] Ticket tier configuration (name, price, quantity)
- [x] Event status management (draft → published → completed → cancelled)
- [x] Public event page (shareable URL: /e/[collective-slug]/[event-slug])

### Week 5 (Apr 13-19): Artist Booking ✅
- [x] Artist database (create, search, browse)
- [x] Event lineup builder (add artists, set times, fees, status)
- [x] Booking status workflow (pending → confirmed → declined)
- [x] Artist detail page with upcoming events + booking history
- [x] Genre tagging and search

### Week 6 (Apr 20-26): Stripe Connect + Ticketing ✅
- [x] Stripe Connect Express onboarding flow for collectives
- [x] Ticket purchase flow (select tier → checkout → Stripe payment)
- [x] QR code ticket generation (ticket_token)
- [x] Stripe webhook handler (checkout.session.completed)
- [x] Ticket view page with QR code display

### Week 7 (Apr 27 - May 3): Settlement Engine ✅
- [x] Post-event settlement generation (auto-calculate from ticket sales)
- [x] Revenue split with line items (artists, expenses, platform fee, Stripe fee)
- [x] Settlement approval workflow
- [x] P&L report view
- [x] Event expenses tracking with categories

### Week 8 (May 4-10): Payouts + Polish ✅
- [x] Payout execution via Stripe Connect transfers
- [x] Settlement report email generation
- [x] Payout status tracking (pending → completed)
- [x] Dashboard with real data views (revenue, events, attendees)

### Week 9 (May 11-17): CRM & Attendee Data ✅
- [x] Attendee database built from ticket purchases
- [x] Attendee profiles (events attended, total spend, event titles)
- [x] Simple segmentation (one-time vs repeat attendees)
- [x] Attendee list export (CSV)
- [x] Promo code system for promoter referral tracking

### Week 10 (May 18-24): AI Email + Event Pages ✅
- [x] AI-drafted post-event email (recap) via Claude API
- [x] AI promo email generation
- [x] Email composer with event selection
- [x] Social sharing metadata (OG tags, Twitter cards)

### Week 11 (May 25-31): Door Check-in & Polish ✅
- [x] QR code scanner for door check-in (mobile web camera)
- [x] Real-time check-in counter
- [x] Guest list / door list management
- [x] Mobile PWA (manifest, theme color, apple-touch-icon)
- [x] Forgot password / password reset flow

### BONUS: Agentic Experience ✅
- [x] Conversational AI onboarding (typewriter text, AI-generated bio & Instagram caption)
- [x] Smart dashboard with contextual greeting and state-aware actions
- [x] AI Insights section with proactive suggestions
- [x] Floating "Ask Nocturn" AI button
- [x] Event Playbook system (3 built-in: Club Night, Festival, Pop-Up)
- [x] Task delegation with assignments and due dates
- [x] Event activity feed for team communication
- [x] AI task suggestions based on event state

### Week 12 (Jun 1-7): QA & Launch
- [ ] End-to-end testing of full flow
- [ ] Performance optimization (loading states, error boundaries)
- [ ] Bug fixes from testing
- [ ] **MVP LAUNCH — first real events processed on Nocturn**

---

## Key Dependencies — Status
- [x] Supabase project live
- [x] Stripe Connect platform account (sandbox)
- [x] Environment variables on Vercel
- [x] Stripe webhook configured
- [ ] Configure Resend domain for transactional email
- [ ] Set up Sentry for error monitoring
- [ ] Stripe Connect live mode (when ready for real payments)
