# Nocturn — AI for Music Collectives and Promoters

> ⚠️ This is the ONLY active codebase. The mobile repo (nocturn-mobile) is archived — all features were merged here.

## What is this?
Mobile-first web app for nightlife promoters and collectives. Manage events, sell tickets, coordinate teams, discover venues, and record calls — all from your phone or desktop. Built with Next.js + Supabase + Stripe.

## Current Priority: Customer Pitch & Onboarding
Shawn is actively pitching collectives as potential customers. The primary workflow right now is:
1. Creating visual assets (slide decks, mockups, branded materials) to pitch Nocturn to collectives
2. Demoing the new onboarding flow to prospective customers
3. Getting the first 3 collectives onboarded before Techstars NYC deadline (June 10, 2026)

### Pitch Context
- **Target customer**: House music collectives in Toronto (20-30 year old promoters running 2-4 events/month)
- **Pain they feel**: Scattered across Google Sheets, Venmo, Instagram DMs, group chats. No single tool runs their operation.
- **Nocturn's pitch**: "You run the night. Nocturn runs the business." — one platform for events, tickets, settlements, marketing, and team coordination
- **Competitive edge**: AI agents (Money, Promo, Reach, Ops) that automate the boring parts. 7% + $0.50 per ticket (cheaper than Posh at 10% + $0.99)
- **North star metric**: Time to First Ticket Sold (target: <48 hours for 30% of new collectives)

### New Onboarding Flow (Just Built)
The collective onboarding was redesigned from a 7-step AI chat to a fast 3-screen card-based flow:
1. **Screen 1 — Name + City**: Collective name with live slug preview + city input (combined, was 2 screens)
2. **Screen 2 — Vibe Picker**: 6 house-music-focused vibes with subgenre listings:
   - Deep & Melodic (Deep House / Melodic Techno / Progressive / Organic House)
   - Peak Time (Tech House / Big Room / Mainstage / Festival House)
   - Underground (Warehouse Techno / Minimal / Raw / Acid)
   - Afro & Amapiano (Afro House / Amapiano / Afrobeats / Percussive)
   - Experimental (Breaks / Electro / Left-field Bass / IDM)
   - Open Format (House / Hip Hop / R&B / Genre-fluid)
3. **Screen 3 — Drop Your First Event**: Pre-filled event card from vibe selection (8 templates), inline editing, venue optional
4. **Share Screen**: Confetti + copy link + IG Story share + email share
5. **Dashboard**: Setup checklist with progress toward first ticket sold

**Key files for onboarding**:
- `src/app/onboarding/page.tsx` — Main 3-screen flow
- `src/lib/event-templates.ts` — 6 vibes + 8 event templates
- `src/components/onboarding/vibe-picker.tsx` — Vibe selection grid
- `src/components/onboarding/event-card.tsx` — Inline editable event card
- `src/components/onboarding/share-screen.tsx` — Post-creation share screen
- `src/app/actions/onboarding-event.ts` — Server action for quick event creation
- `docs/ONBOARDING_REDESIGN.md` — Full design document with research

**Approval gate**: Collectives still require manual approval (Shawn approves via email) before they can access the dashboard and onboarding. This is intentional to keep competitors out during beta.

### Creating Pitch Assets
When asked to create pitch decks, slides, or marketing materials:
- Use the **Gamma MCP** for generating slide decks (it's connected)
- Use the **Canva MCP** for creating visual designs and social assets
- Follow brand guidelines: #7B2FF7 purple, #09090B background, Outfit headings, DM Sans body
- Voice: Confident, warm, precise. Say "operators" not "users". Say "collectives" not "teams"
- Photography style: atmospheric, moody, silhouette-forward. Avoid DJ hero shots or posed corporate
- Key stats to include: 7% + $0.50 per ticket, 4 AI agents, <2 min to live event, house music focused
- Competitors to reference: Posh (10% + $0.99), Eventbrite (dated UX), RA (24hr approval delay), Partiful (casual only)

## Tech Stack
- **Framework**: Next.js 16 (App Router) + TypeScript
- **Styling**: Tailwind CSS v4 + shadcn/ui components
- **Auth & DB**: Supabase (PostgreSQL + Auth + Realtime + RLS)
- **Payments**: Stripe (direct checkout + Connect for payouts)
- **Analytics**: PostHog (user analytics), Vercel Analytics (web vitals), Sentry (errors)
- **Email**: Resend (transactional email from trynocturn.com)
- **PWA**: manifest.json + service worker
- **Deploy**: Vercel (auto-deploys from main branch)

## URLs
- **App**: https://app.trynocturn.com (Vercel: nocturn-app-navy.vercel.app)
- **Public site**: https://trynocturn.com (Vercel: nocturn-site)
- **GitHub (app)**: https://github.com/Nocturn-Technologies/nocturn-app
- **GitHub (site)**: https://github.com/Nocturn-Technologies/nocturn-site
- **Supabase project**: zvmslijvdkcnkrjjgaie
- **Supabase URL**: https://zvmslijvdkcnkrjjgaie.supabase.co

## Brand
- **Primary**: #7B2FF7 (Nocturn Purple)
- **Light**: #9D5CFF
- **Glow**: #E9DEFF
- **Background**: #09090B
- **Font headings**: Outfit
- **Font body**: DM Sans
- **Voice**: Confident, warm, precise. Say "operators" not "users". Say "collectives" not "teams".
- **Tagline**: "You run the night. Nocturn runs the business."
- **Agent names**: Money, Promo, Reach, Ops

## Pricing
- **Model**: 7% + $0.50 per ticket (buyer pays service fee, organizer keeps 100%)
- **Comparison**: Posh charges 10% + $0.99, FourVenues is enterprise pricing
- **Free tickets**: Bypass Stripe entirely, no fee
- **Subscription**: $49/mo for premium features (not yet implemented)
- **Payouts**: All payments go to Nocturn platform account, manual payout to collectives
- **No Stripe Connect KYC required**: Collectives can start selling immediately

## Four AI Agents
- **Money** — Splits, settlements, P&L, financial forecasting, payout docs
- **Promo** — Flyers, social posts, email campaigns, content generation
- **Reach** — Growth, audience insights, cross-promo, market pricing intelligence
- **Ops** — Event day management, set times, door staff, tasks, live mode

## Architecture
```
src/
├── app/
│   ├── (auth)/          — Login, signup, password reset
│   ├── (dashboard)/     — All authenticated pages
│   │   └── dashboard/
│   │       ├── page.tsx         — Home/dashboard
│   │       ├── events/          — Events CRUD + sub-pages (lineup, tasks, promos, guests, check-in, recap, forecast, refunds)
│   │       ├── calendar/        — Calendar heat map (best nights to throw)
│   │       ├── artists/         — Artist directory + detail
│   │       ├── attendees/       — Attendee CRM + CSV export
│   │       ├── chat/            — Team Sync (channels + real-time messaging + collabs)
│   │       ├── venues/          — Venue discovery + saved venues
│   │       ├── record/          — Voice recording + AI transcription (supports 50+ min calls)
│   │       ├── marketing/       — AI email composer + send to attendees
│   │       ├── finance/         — Event P&L + settlements + refunds
│   │       ├── analytics/       — Founder analytics dashboard
│   │       ├── members/         — Team management + invitations
│   │       └── settings/        — Profile + Stripe Connect
│   ├── (public)/        — Public event pages, ticket view, check-in
│   ├── api/             — Stripe checkout, webhooks, cron jobs
│   ├── legal/           — Terms of Service, Privacy Policy
│   └── actions/         — Server actions (events, artists, tickets, budget-planner, pricing-suggestion, transcribe, etc.)
├── components/          — Shared UI (dashboard-shell, voice-note, event-card-live, public-event/*)
└── lib/                 — Supabase clients, Stripe, mock data, utilities, tracking
```

## Key Features (Shipped)
- **Event creation** with AI chat + budget planning (headliner type, travel estimation, break-even pricing)
- **Ticketing**: Paid (Stripe) + free, QR codes, check-in, promo codes, waitlist for sold-out tiers
- **Budget planner**: Suggests 4 tiers (Early Bird → Tier 1 → Tier 2 → Tier 3) based on expenses
- **Market pricing**: Shows avg ticket prices in your city + competing events
- **Calendar heat map**: Color-coded months showing best nights to throw events
- **Refunds**: Per-ticket Stripe refund with buyer email notification + waitlist notify
- **Email campaigns**: Generate + send to attendees via Resend
- **Event reminders**: Auto-email 24hr before (Vercel cron)
- **Call recording**: Supports 50+ min calls via Supabase Storage + Whisper transcription
- **Collab chat**: Search and message other collectives
- **Legal pages**: Terms + Privacy
- **Analytics**: PostHog + Vercel Analytics + Sentry + founder dashboard

## Key Patterns

### Server Actions
All DB mutations use server actions with `"use server"` directive + admin client:
```typescript
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";

function createAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}
```

### Client Components
Interactive pages use `"use client"` with the browser Supabase client:
```typescript
import { createClient } from "@/lib/supabase/client";
```

### Supabase Queries
- Always use `.maybeSingle()` instead of `.single()` where 0 rows is possible
- Always null-guard results with `?.` and `??`
- Prices stored in dollars (NUMERIC), NOT cents
- Use `Promise.all()` for parallel queries wherever possible

### Responsive Layout
- Mobile (< 768px): bottom tab bar with 4 tabs (Home, Events, Chat, Venues) — pill-style active state, 48px tap targets
- Desktop (≥ 768px): left sidebar with full nav (Home, Events, Chat, Venues, Calendar, Record, Artists, Attendees, Promo, Money, Analytics, Members, Settings)
- Use Tailwind `md:` prefix for desktop enhancements
- Min 44px tap targets on all interactive elements

### Dark Theme
- Uses CSS variables via shadcn: `bg-card`, `text-foreground`, `text-muted-foreground`
- Brand accents: `bg-nocturn`, `text-nocturn`, `hover:bg-nocturn-light`
- Never use light theme

## Database Tables (Supabase)
collectives, collective_members, users, events, venues, ticket_tiers, tickets, artists, event_artists, channels, messages, event_cards, event_tasks, event_activity, playbook_templates, recordings, saved_venues, invitations, settlements, expenses, waitlist_entries

### Key Column Notes
- `events.starts_at` / `ends_at` / `doors_at` — TIMESTAMPTZ (NOT `date`, `start_time`, etc.)
- `events.flyer_url` (NOT `cover_image_url`)
- `ticket_tiers.price` — dollars as NUMERIC(10,2) (NOT cents)
- `ticket_tiers.capacity` (NOT `quantity`)
- `venues.slug` — NOT NULL, auto-generated via slugify()

## Environment Variables
```
NEXT_PUBLIC_SUPABASE_URL=https://zvmslijvdkcnkrjjgaie.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
STRIPE_SECRET_KEY=sk_live_... (MUST be live key for real payments)
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_APP_URL=https://app.trynocturn.com
RESEND_API_KEY=re_...
NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...
NEXT_PUBLIC_POSTHOG_KEY=phc_...
OPENAI_API_KEY=sk-... (for Whisper transcription)
ANTHROPIC_API_KEY=sk-ant-... (for AI event parsing)
```

## Roadmap

### Phase 1 — Launch (May 2026) ✅ MOSTLY DONE
- [x] Core event creation + ticketing + settlements
- [x] AI budget planning with travel estimation
- [x] Market pricing suggestions
- [x] Calendar heat map
- [x] Refund flow
- [x] Email campaigns
- [x] Legal pages
- [x] Analytics (PostHog + Sentry + Vercel)
- [ ] Stripe live keys in production
- [ ] Full lifecycle test (buy ticket → scan → settle → refund)
- [ ] First 3 collectives onboarded

### Phase 2 — Growth (June-July 2026)
- [ ] **Ambassador program**: Referral links per attendee, "bring 5 friends = free ticket" rewards
- [ ] **Artist directory**: Artists sign up, upload SoundCloud/Spotify, build profiles, collectives discover and book
- [ ] **Social graph**: Map connections between attendees across collectives, cross-promo targeting
- [ ] **Bar minimum tracking**: Live drink sales progress on event night, deposit risk indicator
- [ ] **Dynamic ticket pricing**: Auto-adjust prices based on demand velocity
- [ ] **Shared artist library**: Platform-wide artist directory with contact info, SoundCloud/Spotify links
- [ ] **Artist FOMO loop**: Prompt artists to share profile on IG story → drives more artist signups

### Phase 3 — Scale (August-September 2026)
- [ ] **20 collectives on platform** by end of summer
- [ ] **City-wide event scraping**: Pull from RA, Posh, Eventbrite for competitive intelligence
- [ ] **Revenue**: $49/mo premium tier + 7% ticket fees
- [ ] **Push notifications** (event reminders, ticket updates)
- [ ] **Advanced analytics**: Source attribution, heatmaps, conversion funnels
- [ ] **Recurring events**
- [ ] **Multi-city expansion** (Montreal, Vancouver, NYC)

## Scheduled Agents
Three cloud agents run daily (weekdays):
1. **Daily Builder** (4:00 AM ET) — builds one feature per session
2. **QA + Deploy** (5:30 AM ET) — fixes build errors, pushes clean code
3. **Morning Standup** (7:00 AM ET) — generates progress report, saves Gmail draft

## Techstars Deadline
NYC accelerator application deadline: June 10, 2026. All demo-ready features should be polished by then.

## MCP Tools — When to Use
- **Context7**: ALWAYS use when working with any library/framework (Next.js, Supabase, Stripe, Tailwind, shadcn, etc.) — fetch up-to-date docs instead of relying on training data
- **Tavily**: Use for any web research — competitor analysis, market data, finding examples, checking current API docs
- **Codebase Memory**: Use `search_graph` BEFORE grepping for functions/classes/routes — the knowledge graph is faster and shows relationships. Run `index_repository` if the graph is empty
- **Playwright MCP**: Use for end-to-end testing and browser automation when verifying UI flows
- **markdownify**: Use to convert any URL to clean markdown — useful for reading external docs, blog posts, or reference material
- **Task Master AI**: Use for breaking down complex features into structured task lists with dependencies
- **Supabase MCP**: Use for all database operations — migrations, SQL queries, type generation, project management
- **Vercel MCP**: Use for deployment checks, build logs, runtime logs, and project configuration

## Running Locally
```bash
git clone https://github.com/Nocturn-Technologies/nocturn-app.git
cd nocturn-app
npm install
npm run dev
```
