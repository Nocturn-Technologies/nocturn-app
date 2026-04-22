# Nocturn — AI for Music Collectives and Promoters

> This is the ONLY active codebase. The mobile repo (nocturn-mobile) is archived — all features were merged here.

## What is this?
Mobile-first web app for nightlife promoters and collectives. Manage events, sell tickets, coordinate teams, discover venues, and record calls — all from your phone or desktop. Built with Next.js + Supabase + Stripe.

## Codebase Stats (audited 2026-04-21 — post entity-arch rebuild / PR #93)
- **63 app routes** (page.tsx) + **20 API route files** + **8 layouts**
- **69 server action files** under `src/app/actions/`
- **38 lib files**, **76 components**, **3 custom hooks**
- **46 database tables**, **0 views** (dropped), **party-centric identity model**
- **Middleware convention**: `src/proxy.ts` (Next.js 16 renamed `middleware.ts` → `proxy.ts`)
- **Zero TypeScript errors** — build passes clean. Zero `as any`, zero `eslint-disable`.

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
- **Framework**: Next.js 16.1.7 (App Router) + TypeScript 5.x
- **Styling**: Tailwind CSS v4 (PostCSS plugin, no config file) + shadcn/ui v4
- **Auth & DB**: Supabase (PostgreSQL + Auth + Realtime + RLS) — @supabase/supabase-js 2.99, @supabase/ssr 0.9
- **Payments**: Stripe 20.4 (direct checkout + Connect for payouts) — @stripe/react-stripe-js 5.6
- **AI**: Anthropic Claude (@anthropic-ai/sdk 0.80) + OpenAI Whisper (openai 6.32) + Replicate (replicate 1.4)
- **Analytics**: PostHog (posthog-js 1.363), Vercel Analytics 2.0, Sentry 10.45
- **Email**: Resend 6.9 (transactional email from trynocturn.com)
- **State**: Zustand 5.0 + TanStack React Query 5.90
- **Validation**: Zod 4.3
- **QR**: html5-qrcode 2.3 (scanning) + qrcode 1.5 (generation)
- **Testing**: Vitest 4.1
- **PWA**: manifest.json + service worker
- **Deploy**: Vercel (auto-deploys from main branch)

## URLs
- **App**: https://app.trynocturn.com (Vercel: nocturn-app-navy.vercel.app)
- **Public site**: https://trynocturn.com (Vercel: nocturn-site)
- **GitHub (app)**: https://github.com/Nocturn-Technologies/nocturn-app
- **GitHub (site)**: https://github.com/Nocturn-Technologies/nocturn-site
- **Supabase project**: zvmslijvdkcnkrjjgaie
- **Supabase URL**: https://zvmslijvdkcnkrjjgaie.supabase.co
- **Project management**: Linear

## Brand
- **Design System**: See `DESIGN.md` for the full design system reference — colors, typography, component patterns, layout rules, and agent prompt guide. All AI agents should read DESIGN.md before generating UI code.
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
│   ├── (auth)/          — Login, signup, pending-approval, account-denied (4 routes)
│   ├── (dashboard)/     — All authenticated pages (45 routes)
│   │   └── dashboard/
│   │       ├── page.tsx         — Home/dashboard
│   │       ├── analytics/       — Founder analytics dashboard
│   │       ├── artists/         — Artist directory + detail + analytics + me (4 routes)
│   │       ├── attendees/       — Attendee CRM + CSV export
│   │       ├── audience/        — Audience insights
│   │       ├── calendar/        — Calendar heat map (best nights to throw)
│   │       ├── chat/            — Team Sync (channels + real-time messaging + collabs) (2 routes)
│   │       ├── discover/        — Marketplace discovery + profile pages (2 routes)
│   │       ├── events/          — Events CRUD + 17 sub-pages per event (21 routes)
│   │       ├── finance/         — Event P&L + settlements + per-event financials (2 routes)
│   │       ├── inquiries/       — Inquiry management (reads orders/parties now, not marketplace_*)
│   │       ├── marketing/       — AI email composer + send to attendees (2 routes)
│   │       ├── members/         — Team management + invitations
│   │       ├── my-profile/      — User profile editing
│   │       ├── network/         — Collective network / social graph (NEW, post-rebuild)
│   │       ├── promo-insights/  — Promoter performance dashboard
│   │       ├── promote/         — Promo tools
│   │       ├── record/          — Voice recording + AI transcription
│   │       ├── settings/        — Profile + Stripe Connect
│   │       └── venues/          — Venue discovery + saved venues + my venues (2 routes)
│   ├── (public)/        — Public event pages, ticket view, check-in, invites (6 routes)
│   ├── admin/           — Admin dashboard (cookie-based auth with timing-safe comparison)
│   ├── api/             — 20 route files (checkout, webhooks, cron, seeding, tier-availability, venues-search, OG images)
│   ├── auth/            — Confirm + reset password
│   ├── go/              — Short URL redirects
│   ├── legal/           — Terms of Service, Privacy Policy
│   ├── og-image/        — Dynamic OG image generation (2 routes)
│   ├── onboarding/      — Collective onboarding + marketplace onboarding (2 routes)
│   └── actions/         — 69 server action files (rewritten against parties/orders/profiles)
├── components/          — 76 components (ui/, public-event/, onboarding/, finance/, etc.)
├── hooks/               — 3 hooks (notifications, speech, shake)
├── lib/                 — 38 utility files (supabase, stripe, email, analytics, AI, etc.)
└── proxy.ts             — Next.js 16 middleware convention (renamed from middleware.ts)
```

### Event Sub-Pages (17 routes per event)
`/dashboard/events/[eventId]/` → chat, check-in, design, edit, financials, forecast, guests, lineup, live, playbook, promos, recap, referrals, refunds, tasks, wrap

## Key Features (Shipped)
- **Event creation** with AI chat + budget planning (headliner type, travel estimation, break-even pricing)
- **Ticketing**: Paid (Stripe) + free, QR codes, check-in with Realtime live stats, promo codes, waitlist for sold-out tiers, atomic fulfillment (race-condition safe)
- **Budget planner**: Suggests 4 tiers (Early Bird → Tier 1 → Tier 2 → Tier 3) based on expenses
- **Market pricing**: Shows avg ticket prices in your city + competing events
- **Calendar heat map**: Color-coded months showing best nights to throw events
- **Refunds**: Per-ticket Stripe refund with buyer email notification + waitlist notify
- **Email campaigns**: Generate + send to attendees via Resend (6 email-sending actions)
- **Event reminders**: Auto-email 24hr before (Vercel cron)
- **Call recording**: Supports 50+ min calls via Supabase Storage + Whisper transcription
- **Collab chat**: Search and message other collectives
- **Marketplace**: Discover profiles, send inquiries, save profiles, analytics
- **AI features**: 9 Claude-powered actions (briefings, forecasts, email generation, event parsing, enrichment, poster prompts, ask-nocturn chat, content playbooks)
- **Legal pages**: Terms + Privacy
- **Analytics**: PostHog + Vercel Analytics + Sentry + founder dashboard + per-event analytics tracking

## Key Patterns

### Server Actions
All DB mutations use server actions with `"use server"` directive + admin client:
```typescript
import { createAdminClient } from "@/lib/supabase/config";
```
The admin client is a singleton per serverless function instance, typed with `Database` generic, and re-created if the service role key changes.

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
- Generated types from live DB — regenerate with Supabase MCP `generate_typescript_types`
- Relationship joins typed with `as unknown as SomeType` pattern (not `as any`)

### Security Patterns
- **RLS on all 46 tables** — no exceptions
- **Admin panel**: Cookie-based auth with `crypto.timingSafeEqual` + HMAC-signed session token
- **UUID validation**: Shared `isValidUUID()` utility, layout-level validation for `[eventId]` routes
- **PostgREST injection**: `sanitizePostgRESTInput()` strips dangerous chars before `.or()` filters
- **AI output sanitization**: `sanitizeAIText()` strips HTML tags + control chars from LLM responses
- **File upload validation**: MIME whitelist + blocked extensions (SVG/HTML) + size limits
- **URL sanitization**: `sanitizeUrl()` rejects `javascript:`, enforces `https://`, caps length
- **Input limits**: Max lengths on all text inputs (titles, bios, messages, promo codes)
- **Atomic DB operations**: `fulfill_tickets_atomic` uses advisory locks to prevent duplicate tickets

### Responsive Layout
- Mobile (< 768px): bottom tab bar with 4 tabs (Home, Events, Chat, Venues) — pill-style active state, 48px tap targets
- Desktop (≥ 768px): left sidebar with full nav (Home, Events, Chat, Venues, Calendar, Record, Artists, Attendees, Promo, Money, Analytics, Members, Settings)
- Use Tailwind `md:` prefix for desktop enhancements
- Min 44px tap targets on all interactive elements

### Dark Theme
- Uses CSS variables via shadcn: `bg-card`, `text-foreground`, `text-muted-foreground`
- Brand accents: `bg-nocturn`, `text-nocturn`, `hover:bg-nocturn-light`
- Never use light theme

## Database (46 tables, party-centric — rebuilt in PR #93, 2026-04-19)

> Schema was rebuilt around a **party-centric identity model**. `parties` is the universal identity (person | organization | venue). Contact info, roles, and ownership all hang off parties. Old contact-scattered tables (`artists`, `venues`, `contacts`, `marketplace_*`) are gone. Always verify against `src/lib/supabase/database.types.ts` before asserting column shapes.

### Identity & roles (new)
- **parties** — `id`, `type` (person|organization|venue), `display_name`
- **party_contact_methods** — email/phone/instagram/soundcloud/spotify/website/twitter. UNIQUE (party_id, type)
- **party_roles** — artist | collective | venue_operator | platform_user | contact. Optionally scoped to `collective_id`. UNIQUE (party_id, role, collective_id)
- **artist_profiles** — replaces `artists`. `party_id` FK (UNIQUE, required). Has slug/bio/genre[]/booking_email/default_fee/spotify/services[]/rate_range/availability/portfolio_urls[]/past_venues[]/is_verified/is_active/deleted_at
- **venue_profiles** — replaces `venues`. `party_id` FK (UNIQUE, required). Has slug/name/city/address/capacity/amenities[]/photo_url/cover_photo_url

### Purchase chain (new)
- **orders** — permanent purchase record: `party_id`, `event_id`, `stripe_payment_intent_id`, `promo_code_id`, `subtotal`, `platform_fee`, `stripe_fee`, `total`, `currency`, `status` (pending|paid|failed|refunded|partially_refunded)
- **order_lines** — `order_id`, `tier_id`, `quantity`, `unit_price`, `subtotal`, `refunded_quantity`
- **tickets** — now has `order_line_id` and `holder_party_id` (FK → parties). Still has `event_id` + `tier_id`

### Lifecycle logs (new, immutable)
- **ticket_events** — purchased | transferred | checked_in | refunded | voided, per ticket
- **event_status_log** — draft | published | cancelled | wrapped, per event
- **promo_code_usage** — one row per use (replaces `promo_codes.times_used` counter, which was dropped)

### Everything else (46 tables total)
artist_profiles, attendee_profiles, audit_logs, channel_members, channels, collective_members, collectives, email_campaigns, event_activity, event_analytics, event_artists, event_cards, event_expenses, event_status_log, event_tasks, events, external_events, guest_list, invitations, messages, order_lines, orders, parties, party_contact_methods, party_roles, payment_events, payouts, playbook_task_templates, playbook_templates, promo_clicks, promo_code_usage, promo_codes, promo_links, rate_limits, recordings, saved_venues, settlement_lines, settlements, ticket_events, ticket_tiers, ticket_waitlist, tickets, users, venue_profiles, waitlist_entries, webhook_events

### Tables DROPPED in PR #93 (do NOT reference in new code)
- `artists`, `venues` — replaced by `artist_profiles` / `venue_profiles`
- `contacts`, `marketplace_profiles`, `marketplace_inquiries`, `marketplace_saved` — replaced by party model
- `segments`, `campaign_segments`, `segment_members` — never implemented
- `split_items`, `transactions` — orphaned
- `event_reactions`, `event_collectives`, `waitlist_entries` (old), `expenses` — not present
- Views `event_dashboard`, `promoter_performance` — dropped

### Custom DB Functions (post-rebuild)
`acquire_ticket_lock(p_tier_id)`, `check_and_reserve_capacity(p_tier_id, p_quantity)`, `claim_promo_code(p_code, p_event_id)`, `fulfill_tickets_atomic(p_event_id, p_holder_party_id, p_order_line_id, p_quantity, p_tier_id)`, `get_user_collectives()`, `has_collective_role(p_collective_id, p_role | p_roles[])`, `increment_analytics_counter(p_event_id, p_field, p_value?)`, `increment_attendee_profile(p_collective_id, p_email, p_name, p_party_id, p_spend, p_ticket_count)`, `increment_promo_click(p_code | p_link_id)`, `track_ticket_sale(p_tier_id, p_quantity)`, `track_ticket_refund(p_tier_id, p_quantity)`.

All RPCs use **p_**-prefixed param names. `track_ticket_sale/refund` take `tier_id` (not `event_id`). `fulfill_tickets_atomic` now requires `order_line_id` + `holder_party_id`.

### Key Column Notes
- `users.party_id` — FK → parties (nullable). This is how app users link to the identity graph. Auth ID is still `users.id` (matches `auth.uid()`).
- `tickets.holder_party_id` — FK → parties (nullable). The owner of the ticket. `user_id` is gone from tickets.
- `tickets.order_line_id` — FK → order_lines (nullable for legacy/free tickets).
- `events.starts_at` / `ends_at` / `doors_at` — TIMESTAMPTZ (NOT `date`, `start_time`).
- `events.flyer_url` (NOT `cover_image_url`).
- `events.venue_party_id` — FK → parties (replaces old `venue_id` → venues).
- `events.published_at` — added 2026-04-19.
- `ticket_tiers.price` — dollars as NUMERIC(10,2) (NOT cents).
- `ticket_tiers.capacity` (NOT `quantity`) — nullable.
- `attendee_profiles.user_id` — nullable (guest checkouts). Also now has `party_id` FK.
- `channels.collective_id` — nullable (enables direct DM channels without a collective owner).
- `messages.user_id` — NOT NULL. AI bot posts use UUID `00000000-0000-0000-0000-000000000000`.
- `invitations` — uses `accepted_at` timestamp pattern (old `status` column removed).
- `settlements` — columns are `total_revenue` / `net_payout` (renamed from `gross_revenue` / `net_profit`).
- `promo_links` — column is `code` (renamed from `token`). No `promoter_id` or `external_event_id`.
- `saved_venues` — uses `venue_party_id` FK (not `venue_id`).
- `event_artists.artist_id` — nullable (old FK dropped). Use `party_id` going forward.

### Migrations of note
- `20260419000001_drop_orphaned_tables.sql` — drops segments/split_items/transactions + unused junction tables
- `20260419000002_entity_architecture.sql` — adds parties/party_contact_methods/party_roles/ticket_events/event_status_log/promo_code_usage, adds `party_id` FKs everywhere
- `20260419000003_full_schema_rebuild.sql` — adds orders/order_lines/artist_profiles/venue_profiles, modifies tickets, drops replaced tables
- `20260419201107_drop_users_is_denied.sql` — removes `users.is_denied`
- `20260419234500_add_events_published_at.sql` — adds `events.published_at`
- Rollback partial: `supabase/migrations/_rollback_entity_arch.sql` restores social columns and drops the identity tables, but does NOT undo the orders/profiles rebuild (migration 003).

### QA bootstrap files (idempotent, QA project `vtkvhdaadobigtojmztg` only)
`QA_BOOTSTRAP.sql`, `QA_FULL_SCHEMA.sql`, `QA_RLS.sql` — bring QA to prod parity + full schema/RLS snapshots. Not normal migration files.

## API Routes (20 route files)

### Payments
- `POST /api/checkout` — Stripe checkout session creation (now writes an `orders` row + `order_lines`)
- `POST /api/create-payment-intent` — Direct payment intent
- `POST /api/webhooks/stripe` — Stripe webhook handler; dedupes via `webhook_events`; on success marks `orders.status = 'paid'` and calls `fulfill_tickets_atomic`
- `GET /api/stripe/connect/callback` — Stripe Connect OAuth callback
- `GET /api/tier-availability` — Live ticket tier capacity for public event pages

### Auth
- `GET /api/auth/callback` — Supabase auth callback
- `GET /api/approve-user` — Admin user approval/denial (fallback URL defaults to prod — set `NEXT_PUBLIC_APP_URL` on QA)

### Cron
- `GET /api/cron/reminders` — Event reminder emails (24hr before)

### Data
- `GET /api/events/list` — Public event listing
- `GET /api/venues-search` — Venue lookup (reads `venue_profiles` via party)
- `POST /api/marketplace-inquiry-email` — Inquiry notifications (lives on, backed by parties now)
- `GET /api/unsplash` — Unsplash image proxy

### Seeding
- `POST /api/seed-demo` — Demo data seeder
- `POST /api/seed-artists` — Artist data seeder (writes `parties` + `artist_profiles`)
- `POST /api/seed-venues` — Venue data seeder (writes `parties` + `venue_profiles`)

### Utilities
- `GET /api/generate-poster` — AI poster generation
- `POST /api/setup-storage` — Supabase storage bucket setup

## AI-Powered Server Actions (10 total)

### Claude-Powered (9)
1. `ai-briefing.ts` — `generateMorningBriefing` (daily collective summary)
2. `ai-chat.ts` — `generateChatResponse` (ask-nocturn conversational AI)
3. `ai-email.ts` — `generatePostEventEmail` (post-event email drafts)
4. `ai-enrich-event.ts` — `enrichEventContent` (event description enhancement)
5. `ai-finance.ts` — `generateEventForecast`, `getRevenueForecast`, `analyzeTicketSalesPatterns`
6. `ai-parse-event.ts` — `parseEventDetails` (natural language → structured event)
7. `ai-poster.ts` — `generatePosterPrompt` (image generation prompts)
8. `ask-nocturn.ts` — `askNocturn` (general Q&A about collective data)
9. `import-profile.ts` — `importProfileFromUrl` (scrape + parse artist profiles)

### OpenAI Whisper (1)
10. `transcribe.ts` — `transcribeAudio`, `transcribeFromStorage` (voice → text)

## Email Actions (6 files sending via Resend)
1. `event-reminders.ts` — 24hr event reminder emails
2. `members.ts` — Team invitation, acceptance, cancellation emails
3. `post-purchase-hooks.ts` — Milestone notification emails (batched with Promise.all)
4. `refunds.ts` — Refund confirmation emails
5. `send-campaign.ts` — Marketing campaign emails to attendees
6. `ticket-waitlist.ts` — Waitlist notification emails

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
ANTHROPIC_API_KEY=sk-ant-... (for Claude AI features)
CRON_SECRET=... (for admin panel + cron job auth)
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
- [x] Security hardening (RLS, input validation, auth, timing-safe admin)
- [x] TypeScript strictness (zero `as any`, generated DB types)
- [x] Performance optimization (compound indexes, batched queries, dynamic imports)
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
