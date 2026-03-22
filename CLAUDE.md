# Nocturn — The Agentic Work OS for Nightlife

> ⚠️ This is the ONLY active codebase. The mobile repo (nocturn-mobile) is archived — all features were merged here.

## What is this?
Mobile-first web app for nightlife promoters and collectives. Manage events, sell tickets, coordinate teams, discover venues, and record calls — all from your phone or desktop. Built with Next.js + Supabase + Stripe.

## Tech Stack
- **Framework**: Next.js 16 (App Router) + TypeScript
- **Styling**: Tailwind CSS v4 + shadcn/ui components
- **Auth & DB**: Supabase (PostgreSQL + Auth + Realtime + RLS)
- **Payments**: Stripe (direct checkout + Connect for payouts)
- **PWA**: manifest.json + service worker
- **Deploy**: Vercel (auto-deploys from main branch)

## URLs
- **Production**: https://nocturn-app-navy.vercel.app
- **GitHub**: https://github.com/Nocturn-Technologies/nocturn-app
- **Supabase project**: bpzwbqtpyorppijdblhy
- **Supabase URL**: https://bpzwbqtpyorppijdblhy.supabase.co

## Brand
- **Primary**: #7B2FF7 (Nocturn Purple)
- **Light**: #9D5CFF
- **Glow**: #E9DEFF
- **Background**: #09090B
- **Font headings**: Space Grotesk
- **Font body**: Inter
- **Voice**: Confident, warm, precise. Say "operators" not "users". Say "collectives" not "teams".
- **Tagline**: "You run the night. Nocturn runs the business."

## Architecture
```
src/
├── app/
│   ├── (auth)/          — Login, signup, password reset
│   ├── (dashboard)/     — All authenticated pages
│   │   └── dashboard/
│   │       ├── page.tsx         — Home/dashboard
│   │       ├── events/          — Events CRUD + sub-pages (lineup, tasks, promos, guests, check-in, recap, forecast)
│   │       ├── artists/         — Artist directory + detail
│   │       ├── attendees/       — Attendee CRM + CSV export
│   │       ├── chat/            — Team Sync (channels + real-time messaging)
│   │       ├── venues/          — Venue discovery + saved venues
│   │       ├── record/          — Voice recording + AI transcription
│   │       ├── marketing/       — AI email composer
│   │       ├── finance/         — Event P&L + settlements
│   │       ├── members/         — Team management + invitations
│   │       └── settings/        — Profile + Stripe Connect
│   ├── (public)/        — Public event pages, ticket view, check-in
│   ├── api/             — Stripe checkout, webhooks
│   └── actions/         — Server actions (events, artists, tickets, etc.)
├── components/          — Shared UI (dashboard-shell, voice-note, event-card-live)
└── lib/                 — Supabase clients, Stripe, mock data, utilities
```

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

### Responsive Layout
- Mobile (< 768px): bottom tab bar with 5 tabs (Home, Events, Chat, Venues, Record)
- Desktop (≥ 768px): left sidebar with full nav
- Use Tailwind `md:` prefix for desktop enhancements
- Min 44px tap targets on all interactive elements

### Dark Theme
- Uses CSS variables via shadcn: `bg-card`, `text-foreground`, `text-muted-foreground`
- Brand accents: `bg-nocturn`, `text-nocturn`, `hover:bg-nocturn-light`
- Never use light theme

## Database Tables (Supabase)
collectives, collective_members, users, events, venues, ticket_tiers, tickets, artists, event_artists, channels, messages, event_cards, event_tasks, event_activity, playbook_templates, recordings, saved_venues, invitations, settlements, expenses

### Key Column Notes
- `events.starts_at` / `ends_at` / `doors_at` — TIMESTAMPTZ (NOT `date`, `start_time`, etc.)
- `events.flyer_url` (NOT `cover_image_url`)
- `ticket_tiers.price` — dollars as NUMERIC(10,2) (NOT cents)
- `ticket_tiers.capacity` (NOT `quantity`)
- `venues.slug` — NOT NULL, auto-generated via slugify()

## Running Locally
```bash
git clone https://github.com/Nocturn-Technologies/nocturn-app.git
cd nocturn-app
npm install
npm run dev
```

## Environment Variables
```
NEXT_PUBLIC_SUPABASE_URL=https://bpzwbqtpyorppijdblhy.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_APP_URL=https://nocturn-app-navy.vercel.app
```

## Scheduled Agents
Three cloud agents run daily (weekdays):
1. **Daily Builder** (4:00 AM ET) — builds one feature per session
2. **QA + Deploy** (5:30 AM ET) — fixes build errors, pushes clean code
3. **Morning Standup** (7:00 AM ET) — generates progress report, saves Gmail draft

## Techstars Deadline
NYC accelerator application deadline: June 10, 2026. All demo-ready features should be polished by then.
