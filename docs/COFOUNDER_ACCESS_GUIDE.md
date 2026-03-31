# Co-Founder Access Guide

> Everything your co-founder needs to run, develop, and deploy Nocturn locally and in production.

---

## Quick Start

1. Get invited to all platforms below
2. Clone the repo: `git clone https://github.com/Nocturn-Technologies/nocturn-app.git`
3. Copy `.env.local` (Shawn sends via secure channel) into the project root
4. Run `npm install && npm run dev`
5. Open `http://localhost:3000`

---

## 1. GitHub (Code)

**What**: Source code, PRs, CI/CD triggers, issue tracking

| Action | How |
|--------|-----|
| Invite to org | GitHub > [Nocturn-Technologies](https://github.com/Nocturn-Technologies) > Settings > Members > Invite |
| Grant role | **Owner** (full admin) or **Member** with write access to `nocturn-app` and `nocturn-site` |
| Repos to grant | `nocturn-app` (main app), `nocturn-site` (marketing site) |

---

## 2. Vercel (Hosting & Deploys)

**What**: Auto-deploys from `main`, preview deploys on PRs, environment variables, domain config, cron jobs, runtime logs

| Action | How |
|--------|-----|
| Invite to team | [vercel.com/teams](https://vercel.com) > Settings > Members > Invite |
| Grant role | **Owner** or **Developer** |
| Projects to access | `nocturn-app` (app.trynocturn.com), `nocturn-site` (trynocturn.com) |

**Important**: All environment variables live in Vercel. Your co-founder can view/edit them at:
`Project Settings > Environment Variables`

---

## 3. Supabase (Database, Auth, Storage)

**What**: PostgreSQL database, user auth, file storage (recordings, flyers), real-time subscriptions, RLS policies

| Action | How |
|--------|-----|
| Invite to org | [supabase.com](https://supabase.com) > Organization > Members > Invite |
| Grant role | **Owner** or **Admin** |
| Project | `zvmslijvdkcnkrjjgaie` |
| Dashboard | https://supabase.com/dashboard/project/zvmslijvdkcnkrjjgaie |

**Keys they'll need** (found in Supabase > Project Settings > API):

| Key | Type | Where It's Used |
|-----|------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Client + server — project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Client-side queries (respects RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | **SECRET** | Server actions only — bypasses RLS, treat like a DB password |

---

## 4. Stripe (Payments)

**What**: Ticket checkout, payment processing, webhooks, refunds, Connect (future payouts)

| Action | How |
|--------|-----|
| Invite to account | [dashboard.stripe.com](https://dashboard.stripe.com) > Settings > Team > Invite |
| Grant role | **Administrator** or **Developer** |
| Mode | **Live** in production, **Test** for local dev |

**Keys** (found in Stripe > Developers > API Keys):

| Key | Type | Notes |
|-----|------|-------|
| `STRIPE_SECRET_KEY` | **SECRET** | `sk_live_...` in prod, `sk_test_...` in dev |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Public | `pk_live_...` in prod, `pk_test_...` in dev |
| `STRIPE_WEBHOOK_SECRET` | **SECRET** | `whsec_...` — found in Developers > Webhooks > endpoint > Signing secret |

**Webhook endpoint**: `https://app.trynocturn.com/api/webhooks/stripe`
Events listened to: `checkout.session.completed`, `payment_intent.succeeded`, `charge.refunded`

---

## 5. Resend (Email)

**What**: Transactional emails — ticket confirmations, event reminders, approval links, marketing campaigns

| Action | How |
|--------|-----|
| Invite to team | [resend.com](https://resend.com) > Settings > Team > Invite |
| Domain | `trynocturn.com` (already verified) |

| Key | Type |
|-----|------|
| `RESEND_API_KEY` | **SECRET** — `re_...` |

Emails send from: `Nocturn <noreply@trynocturn.com>`

---

## 6. PostHog (Product Analytics)

**What**: User events, feature flags, session replays, funnels

| Action | How |
|--------|-----|
| Invite | [app.posthog.com](https://app.posthog.com) > Settings > Members > Invite |

| Key | Type |
|-----|------|
| `NEXT_PUBLIC_POSTHOG_KEY` | Public — `phc_...` |
| `NEXT_PUBLIC_POSTHOG_HOST` | Public — PostHog cloud URL |

---

## 7. Sentry (Error Tracking)

**What**: Client + server error monitoring, performance traces, session replays (prod only)

| Action | How |
|--------|-----|
| Invite | [sentry.io](https://sentry.io) > Settings > Members > Invite |

| Key | Type | Notes |
|-----|------|-------|
| `NEXT_PUBLIC_SENTRY_DSN` | Public | Data Source Name URL |
| `SENTRY_AUTH_TOKEN` | **SECRET** | Only needed for source map uploads during build |
| `SENTRY_ORG` | Config | Organization slug |
| `SENTRY_PROJECT` | Config | Project slug |

---

## 8. Anthropic (AI — Claude)

**What**: AI event parsing, email generation, event enrichment

| Action | How |
|--------|-----|
| Invite | [console.anthropic.com](https://console.anthropic.com) > Settings > Members > Invite |

| Key | Type |
|-----|------|
| `ANTHROPIC_API_KEY` | **SECRET** — `sk-ant-...` |

---

## 9. OpenAI (Whisper Transcription)

**What**: Transcribes recorded calls (50+ min support)

| Action | How |
|--------|-----|
| Invite | [platform.openai.com](https://platform.openai.com) > Settings > Members > Invite |

| Key | Type |
|-----|------|
| `OPENAI_API_KEY` | **SECRET** — `sk-...` |

---

## 10. Google Maps

**What**: Venue location maps on public event pages

| Action | How |
|--------|-----|
| Add to project | [console.cloud.google.com](https://console.cloud.google.com) > IAM > Add member |

| Key | Type |
|-----|------|
| `NEXT_PUBLIC_GOOGLE_MAPS_KEY` | Public |

---

## 11. Replicate (AI Poster Generation)

**What**: Generate event posters/flyers with AI

| Key | Type |
|-----|------|
| `REPLICATE_API_TOKEN` | **SECRET** |

---

## 12. Unsplash (Image Search)

**What**: Search nightlife photos for event covers

| Key | Type |
|-----|------|
| `UNSPLASH_ACCESS_KEY` | **SECRET** |

---

## 13. Internal / Admin Keys

These aren't tied to external platforms — they're custom secrets you set yourself:

| Key | Purpose | Where to set |
|-----|---------|-------------|
| `CRON_SECRET` | Authenticates Vercel cron jobs (event reminders) | Vercel env vars |
| `ADMIN_APPROVAL_SECRET` | Authenticates user approval endpoint (falls back to CRON_SECRET) | Vercel env vars |
| `INTERNAL_API_SECRET` | Internal API calls (marketplace inquiry emails) | Vercel env vars |
| `ADMIN_EMAIL` | Where signup approval requests go (default: shawn@trynocturn.com) | Vercel env vars |
| `ALLOW_SEED` | Set to `true` to enable seed/demo data routes (dev only) | .env.local |

---

## Full .env.local Template

```bash
# ── Supabase ──
NEXT_PUBLIC_SUPABASE_URL=https://zvmslijvdkcnkrjjgaie.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# ── Stripe ──
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=

# ── AI ──
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

# ── Email ──
RESEND_API_KEY=

# ── Analytics ──
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=
NEXT_PUBLIC_SENTRY_DSN=

# ── Media ──
NEXT_PUBLIC_GOOGLE_MAPS_KEY=
REPLICATE_API_TOKEN=
UNSPLASH_ACCESS_KEY=

# ── App Config ──
NEXT_PUBLIC_APP_URL=http://localhost:3000

# ── Internal ──
CRON_SECRET=
ADMIN_APPROVAL_SECRET=
INTERNAL_API_SECRET=
ADMIN_EMAIL=shawn@trynocturn.com
ALLOW_SEED=true
```

---

## How to Share Secrets Safely

**Never** send API keys over Slack, email, or text in plain text. Use one of these:

1. **1Password / Bitwarden** — create a shared vault for Nocturn secrets
2. **Vercel** — if they have Vercel access, they can read env vars directly from the dashboard
3. **`npx vercel env pull`** — pulls all env vars into `.env.local` automatically (requires Vercel CLI login)
4. **Doppler / Infisical** — secret management platforms (overkill for now, good at scale)

### Fastest method: Vercel CLI
```bash
npm i -g vercel
vercel login
vercel link          # link to the nocturn-app project
vercel env pull      # downloads .env.local with all production values
```

---

## Platform Access Checklist

Use this to track what you've granted:

- [ ] **GitHub** — Invited to Nocturn-Technologies org
- [ ] **Vercel** — Added to team with access to both projects
- [ ] **Supabase** — Added to org with access to project
- [ ] **Stripe** — Invited as team member
- [ ] **Resend** — Invited to team
- [ ] **PostHog** — Invited as member
- [ ] **Sentry** — Invited as member
- [ ] **Anthropic** — Invited to workspace
- [ ] **OpenAI** — Invited to org
- [ ] **Google Cloud** — Added to project IAM
- [ ] **.env.local** — Shared securely (1Password, Vercel CLI, or encrypted)
