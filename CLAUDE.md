# Nocturn — Where Music Collectives Run Their Nights

> This is the ONLY active codebase. The mobile repo (nocturn-mobile) is archived — all features were merged here.

## What is this?
Mobile-first web app for nightlife promoters and collectives. Manage events, sell tickets, coordinate teams, discover venues, and record calls — all from your phone or desktop. Built with Next.js + Supabase + Stripe.

## Codebase Stats (audited 2026-04-04)
- **310 TypeScript files** (118 .ts + 192 .tsx) — **~68,800 lines of code**
- **61 app routes** (page.tsx) + **17 API routes** (route.ts) + **7 layouts**
- **61 server action files** — 130+ exported functions (16,070 lines)
- **31 lib files** (7,328 lines)
- **58 components** across 10 subdirectories
- **3 custom hooks** (notifications, speech, shake)
- **45 database tables** + 2 views + 13 custom DB functions
- **176 indexes**, **66 RLS policies**, **10 applied migrations**
- **28 dependencies** + **12 devDependencies**
- **0 `as any` casts**, **0 `eslint-disable` comments**, **0 unsafe non-null assertions**
- **Zero TypeScript errors** — build passes clean

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
│   │       ├── inquiries/       — Marketplace inquiry management
│   │       ├── marketing/       — AI email composer + send to attendees (2 routes)
│   │       ├── members/         — Team management + invitations
│   │       ├── my-profile/      — User profile editing
│   │       ├── promo-insights/  — Promoter performance dashboard
│   │       ├── promote/         — Promo tools
│   │       ├── record/          — Voice recording + AI transcription
│   │       ├── settings/        — Profile + Stripe Connect
│   │       └── venues/          — Venue discovery + saved venues + my venues (2 routes)
│   ├── (public)/        — Public event pages, ticket view, check-in, invites (6 routes)
│   ├── admin/           — Admin dashboard (cookie-based auth with timing-safe comparison)
│   ├── api/             — 15 API routes (checkout, webhooks, cron, seeding, OG images)
│   ├── auth/            — Confirm + reset password
│   ├── go/              — Short URL redirects
│   ├── legal/           — Terms of Service, Privacy Policy
│   ├── og-image/        — Dynamic OG image generation (2 routes)
│   ├── onboarding/      — Collective onboarding + marketplace onboarding (2 routes)
│   └── actions/         — 61 server action files (130+ exported functions)
├── components/          — 58 components (ui/, public-event/, onboarding/, finance/, etc.)
├── hooks/               — 3 hooks (notifications, speech, shake)
└── lib/                 — 31 utility files (supabase, stripe, email, analytics, AI, etc.)
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
- **RLS on all 48 tables** — 66 policies, no exceptions
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

## Database (45 tables + 2 views)

> Audited against QA (vtkvhdaadobigtojmztg) on 2026-04-21. See `docs/DB_Data_Governance.md` for full schema reference.

### Tables
artist_profiles, attendee_profiles, audit_logs, channel_members, channels, collective_members, collectives, email_campaigns, event_activity, event_analytics, event_artists, event_cards, event_expenses, event_status_log, event_tasks, events, external_events, guest_list, invitations, messages, order_lines, orders, parties, party_contact_methods, party_roles, payment_events, payouts, playbook_task_templates, playbook_templates, promo_clicks, promo_code_usage, promo_codes, promo_links, rate_limits, recordings, saved_venues, settlement_lines, settlements, ticket_events, ticket_tiers, ticket_waitlist, tickets, users, venue_profiles, waitlist_entries

### Views
event_dashboard, promoter_performance

### Custom DB Functions (13)
acquire_ticket_lock, audit_financial_change (trigger), check_and_reserve_capacity, claim_promo_code, fulfill_tickets_atomic, get_user_collectives, has_collective_role, increment_analytics_counter, increment_attendee_profile, increment_promo_click, track_ticket_refund, track_ticket_sale, update_updated_at (trigger)

### Key Column Notes
- `events.starts_at` / `ends_at` / `doors_at` — TIMESTAMPTZ (NOT `date`, `start_time`, etc.)
- `events.flyer_url` (NOT `cover_image_url`)
- `ticket_tiers.price` — dollars as NUMERIC(10,2) (NOT cents)
- `ticket_tiers.capacity` (NOT `quantity`) — nullable
- `venues.slug` — NOT NULL, auto-generated via slugify()
- `attendee_profiles.user_id` — nullable (guest checkouts)
- `audit_logs.action` — TEXT (not enum, stores custom action strings)

### Migrations (10 applied)
1. `fix_security_definer_views_and_audit_logs` — Security definer fixes
2. `add_vibe_tags_and_min_age_columns` — Event vibe tags
3. `create_channels_and_messages` — Chat infrastructure
4. `payment_events_log` — Payment event tracking
5. `unified_contacts` — Contact management
6. `enable_rls_event_analytics_and_payment_events` — RLS on analytics tables
7. `add_compound_indexes_for_hot_paths` — Performance indexes
8. `add_missing_enums_columns_tables` — Schema alignment (13 tables, 6 enum values)
9. `add_missing_rpcs_table_column` — 6 RPCs, rate_limits table, is_denied column
10. `fix_attendee_profiles_user_id_nullable` — Guest checkout support

## API Routes (15)

### Payments
- `POST /api/checkout` — Stripe checkout session creation
- `POST /api/create-payment-intent` — Direct payment intent
- `POST /api/webhooks/stripe` — Stripe webhook handler (payment success, refunds, disputes)
- `GET /api/stripe/connect/callback` — Stripe Connect OAuth callback

### Auth
- `GET /api/auth/callback` — Supabase auth callback
- `GET /api/approve-user` — Admin user approval/denial

### Cron
- `GET /api/cron/reminders` — Event reminder emails (24hr before)

### Data
- `GET /api/events/list` — Public event listing
- `POST /api/marketplace-inquiry-email` — Marketplace inquiry notifications
- `GET /api/unsplash` — Unsplash image proxy

### Seeding
- `POST /api/seed-demo` — Demo data seeder
- `POST /api/seed-artists` — Artist data seeder
- `POST /api/seed-venues` — Venue data seeder

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

## Deployment

**Production (`main`)** auto-deploys on push → serves `app.trynocturn.com`.

**QA (`QA`) does NOT auto-deploy.** Vercel's Preview Branch Tracking is intentionally disabled (Andrew's cost-control decision — prevents every feature branch, PR branch, and cloud-agent commit from burning build minutes). **Merging a PR to QA lands in GitHub but ships nothing** unless you also run:

```bash
cd nocturn-app
git checkout QA && git pull --ff-only origin QA
vercel deploy --yes
```

Returns a fresh `https://nocturn-<hash>-shawn-nocturns-projects.vercel.app` preview URL. ~50s build.

### Hard rules

- **Every `gh pr merge` targeting QA must be followed by `vercel deploy --yes`.** A merged-but-not-deployed PR creates the "I thought it shipped" failure mode — Shawn tests the QA URL, sees stale code, and debugging wastes time.
- **Do not use Deploy Hooks** (Settings → Git → Deploy Hooks). Confirmed 2026-04-23 that hook jobs silently fail when Branch Tracking is off, even though the Vercel UI suggests otherwise.
- **If a session cannot run the Vercel CLI** (e.g., a scheduled cloud agent without `vercel login` state), it **must not admin-merge non-schema PRs to QA.** Leave the PR open for a session that can deploy.
- **Do not re-enable Preview Branch Tracking** without Andrew's sign-off. The current config is intentional.
- **Production deploys** — `QA → main` merge triggers prod auto-deploy. Never `vercel --prod` without explicit Shawn approval.
