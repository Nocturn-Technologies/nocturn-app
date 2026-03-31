# Nocturn Onboarding Redesign
## North Star: Time to First Ticket Sold

---

## The Problem

Current flow from signup to first ticket sold takes **11+ steps across 3+ sessions**:

```
Signup (2 steps) → Approval WALL (hours/days) → Onboarding (5 steps)
→ Dashboard (empty) → Create Event (chat) → Stripe Setup (redirect)
→ Publish → Share link → Wait for buyer → First sale
```

**Biggest blockers:**
1. **Manual approval gate** — user is dead in the water until Shawn manually approves
2. **No Stripe until publish** — user builds everything, then hits a wall when they try to go live
3. **Event creation is open-ended** — AI chat is cool but slow; user doesn't know what "done" looks like
4. **Empty dashboard** — zero momentum, zero social proof, zero urgency
5. **No guidance toward the goal** — nothing says "you're 3 steps from selling tickets"

---

## Research Insights

### From Partiful (beating Eventbrite)
- **One-page event creation** — no tabs, no multi-step wizard, everything on one scrollable page
- **Visual identity first** — themes/effects make your event page look pro instantly
- **SMS viral loop** — attendees get texts that advertise the platform

### From Linear
- **One input per step** — never overwhelm, each screen does one thing
- **No blank slate** — pre-populate with meaningful content
- **Instant wow effect** — the product feels alive from second one

### From Shopify (Activation Velocity)
- **Move high-activation actions earlier** — Shopify found mobile app login 2x'd activation, so they moved it earlier in the flow
- **Measure cohort curves, not averages** — track how fast each cohort reaches "first ticket sold"

### From Luma / Posh / Dice
- **Event template galleries** — "House Night", "Album Release", "Warehouse Rave" with pre-filled vibes
- **Link-in-bio ready** — shareable URL is the first thing you get
- **Mobile-first creation** — these users are on their phones at 2am after a set

---

## The New Flow

### Design Principles
1. **Zero to shareable link in 90 seconds**
2. **Stripe setup is woven in, not bolted on**
3. **Templates over blank canvas**
4. **Every screen moves toward first ticket sold**
5. **The product does things for you** (AI generates, not asks)

---

### New Step-by-Step Flow

```
SIGNUP (30s)
  Name + Email + Password → Auto-approved → Straight to onboarding

ONBOARDING (60s) — 3 screens, not 5
  1. "What's your collective?" → Name input → instant slug preview
  2. "Pick your vibe" → Select from 6 visual templates (auto-generates brand)
  3. "Drop your first event" → Template picker OR quick-fill card

EVENT CREATION (30s) — Card, not chat
  Pre-filled template with:
  - Title (from template, editable)
  - Date picker (defaults to next Saturday)
  - Venue (type-ahead, "add later" option)
  - One ticket tier ($25 default, editable)
  - → "Create & Set Up Payments" button

STRIPE SETUP (inline, not redirect)
  - Embedded Stripe Connect onboarding (not redirect)
  - OR "Skip for now — accept free RSVPs first"
  - → Event auto-publishes after Stripe completes

SHARE (immediate)
  - Animated success screen with confetti
  - Giant shareable link + copy button
  - "Share to Instagram Story" one-tap
  - "Text your crew" with pre-written message
  - Progress ring: "You're live! Share your link to sell your first ticket"

DASHBOARD (alive, not empty)
  - Event card front and center
  - Live visitor counter (even if 0)
  - Checklist: "Complete your setup" with progress bar
  - AI briefing teaser: "I'll send you a morning briefing when you get your first sale"
```

---

## Detailed Screen Designs

### Screen 1: Signup (Simplified)

**Current**: 2-step (type selection → form)
**New**: Single screen, collective is the default

```
┌─────────────────────────────┐
│     nocturn.                │
│                             │
│  Start your collective      │
│                             │
│  ┌─────────────────────┐   │
│  │ Your name            │   │
│  └─────────────────────┘   │
│  ┌─────────────────────┐   │
│  │ Email                │   │
│  └─────────────────────┘   │
│  ┌─────────────────────┐   │
│  │ Password             │   │
│  └─────────────────────┘   │
│                             │
│  ┌─────────────────────┐   │
│  │   Get Started →      │   │
│  └─────────────────────┘   │
│                             │
│  Not a collective?          │
│  Artist · Venue · Other     │
│                             │
└─────────────────────────────┘
```

**Key changes:**
- No type selection step — collective is assumed (80% of signups)
- Other types are a small link at bottom
- **No approval gate** — auto-approve all collectives, review later if needed
- Auto-sign-in on success, straight to onboarding

### Screen 2: Name Your Collective

```
┌─────────────────────────────┐
│                             │
│  What's your collective     │
│  called?                    │
│                             │
│  ┌─────────────────────┐   │
│  │ Midnight Society     │   │
│  └─────────────────────┘   │
│                             │
│  nocturn.app/midnight-      │
│  society ✓ available        │
│                             │
│  ┌─────────────────────┐   │
│  │ Where are you based? │   │
│  └─────────────────────┘   │
│                             │
│         Continue →          │
│                             │
│  ░░░░░░░░░░░░░░░░░░  1/3   │
└─────────────────────────────┘
```

**Key changes:**
- Name AND city on same screen (was 2 separate screens)
- Live slug availability check
- Progress bar: 1 of 3

### Screen 3: Pick Your Vibe

```
┌─────────────────────────────┐
│                             │
│  Pick a vibe for            │
│  Midnight Society           │
│                             │
│  ┌────────┐ ┌────────┐    │
│  │ 🌙     │ │ 🔥     │    │
│  │ Dark & │ │ High   │    │
│  │ Minimal│ │ Energy │    │
│  └────────┘ └────────┘    │
│  ┌────────┐ ┌────────┐    │
│  │ 🎨     │ │ ✨     │    │
│  │ Art &  │ │ Elegant│    │
│  │ Culture│ │ & Luxe │    │
│  └────────┘ └────────┘    │
│  ┌────────┐ ┌────────┐    │
│  │ 🏠     │ │ 🎤     │    │
│  │ Under- │ │ Hip Hop│    │
│  │ ground │ │ & R&B  │    │
│  └────────┘ └────────┘    │
│                             │
│         Continue →          │
│                             │
│  ░░░░░░░░░░░░░░░░░░  2/3   │
└─────────────────────────────┘
```

**What this does behind the scenes:**
- Sets vibe_tags on the collective
- Auto-generates a matching bio via AI
- Pre-selects color accent and event page style
- Seeds the event template suggestions in the next screen

### Screen 4: Drop Your First Event

```
┌─────────────────────────────┐
│                             │
│  Drop your first event      │
│                             │
│  ┌─────────────────────────┐│
│  │ 🌙 Midnight Sessions    ││
│  │ ───────────────────     ││
│  │ Sat, Apr 12 · 10 PM    ││
│  │ 📍 Add venue            ││
│  │ 🎫 $25 · General Adm.  ││
│  │                         ││
│  │ [Edit details]          ││
│  └─────────────────────────┘│
│                             │
│  OR start from a template:  │
│                             │
│  ┌──────┐ ┌──────┐ ┌──────┐│
│  │House │ │Album │ │Ware- ││
│  │Night │ │Drop  │ │house ││
│  └──────┘ └──────┘ └──────┘│
│                             │
│  ┌─────────────────────┐   │
│  │ Create Event →       │   │
│  └─────────────────────┘   │
│                             │
│  I'll do this later →       │
│                             │
│  ░░░░░░░░░░░░░░░░░░  3/3   │
└─────────────────────────────┘
```

**Key changes:**
- **Pre-filled card** based on vibe selection (AI generates title, defaults next Saturday 10PM)
- **Template gallery** as alternative — each template pre-fills: title, description, vibe_tags, suggested tier names + prices
- **Inline editing** — tap any field to change it, no chat needed
- **Venue is optional** — "Add venue" is a tap target, not a blocker
- **"I'll do this later"** skips to dashboard (but dashboard will nudge)

### Screen 5: Payments (Inline)

After "Create Event →":

```
┌─────────────────────────────┐
│                             │
│  ✓ Midnight Sessions        │
│    created!                 │
│                             │
│  One more thing — connect   │
│  payments so you can sell   │
│  tickets.                   │
│                             │
│  ┌─────────────────────┐   │
│  │ 🔗 Connect Stripe    │   │
│  │    Takes 2 minutes    │   │
│  └─────────────────────┘   │
│                             │
│  ┌─────────────────────┐   │
│  │ Skip — accept free   │   │
│  │ RSVPs for now         │   │
│  └─────────────────────┘   │
│                             │
│  Your event will auto-      │
│  publish once payments      │
│  are connected.             │
│                             │
└─────────────────────────────┘
```

**Key changes:**
- Stripe setup is part of the flow, not buried in settings
- If they connect Stripe → event auto-publishes → go to share screen
- If they skip → event stays as draft → dashboard nudges to connect Stripe
- Copy: "Takes 2 minutes" sets expectations

### Screen 6: You're Live! (Share)

```
┌─────────────────────────────┐
│                             │
│        🎉                   │
│                             │
│  Midnight Sessions          │
│  is LIVE                    │
│                             │
│  ┌─────────────────────┐   │
│  │ nocturn.app/midnight │   │
│  │ -society/midnight-   │   │
│  │ sessions             │   │
│  │          📋 Copy     │   │
│  └─────────────────────┘   │
│                             │
│  ┌─────────────────────┐   │
│  │ 📱 Share to IG Story │   │
│  └─────────────────────┘   │
│  ┌─────────────────────┐   │
│  │ 💬 Text your crew    │   │
│  └─────────────────────┘   │
│  ┌─────────────────────┐   │
│  │ 🔗 Copy link         │   │
│  └─────────────────────┘   │
│                             │
│  Go to Dashboard →          │
│                             │
└─────────────────────────────┘
```

**Key changes:**
- Confetti animation on load
- Shareable link is HUGE and prominent
- Instagram Story share generates a branded card
- "Text your crew" opens native SMS with pre-written message:
  `"Just dropped Midnight Sessions 🌙 Grab tickets: [link]"`
- This is the magic moment — from signup to this screen in ~2 minutes

---

## What Changes in the Codebase

### 1. Remove Approval Gate
**File:** `src/app/actions/auth.ts`
- Change: `is_approved = true` for all collective signups
- Add: Background review system (flag suspicious accounts after signup, don't block)

### 2. New Onboarding Flow (3 screens)
**File:** `src/app/onboarding/page.tsx` (rewrite)
- Replace 7-step AI chat with 3-screen card-based flow
- Screen 1: Name + City
- Screen 2: Vibe picker (6 options)
- Screen 3: Event template card + quick-fill

### 3. Event Templates System
**New file:** `src/lib/event-templates.ts`
- 6-8 pre-built templates based on vibe:
  - "House Night", "Techno Warehouse", "Album Listening Party"
  - "Rooftop Sessions", "Underground Rave", "R&B Night"
- Each template includes: title pattern, description, vibe_tags, suggested tiers, door time defaults

### 4. Inline Event Creation Card
**New component:** `src/components/onboarding/event-card.tsx`
- Compact editable card (not full chat interface)
- Pre-filled from template, each field tappable to edit
- Venue field optional (shows "Add venue" placeholder)

### 5. Stripe Setup in Onboarding
**File:** `src/app/onboarding/page.tsx` (new step after event creation)
- Show Stripe Connect button immediately after event is created
- After Stripe callback → auto-publish event → show share screen
- Skip option creates draft event

### 6. Share Screen
**New component:** `src/components/onboarding/share-screen.tsx`
- Confetti animation
- Copy link button
- IG Story share card generation
- SMS pre-fill with native share API

### 7. Dashboard Alive State
**File:** `src/app/(dashboard)/dashboard/page.tsx`
- New "Setup Checklist" component for users with < 1 event
- Progress bar toward "first ticket sold"
- Checklist items:
  - ✅ Created collective
  - ✅ Created first event
  - ⬜ Connected Stripe (if skipped)
  - ⬜ Published event (if draft)
  - ⬜ Shared event link
  - ⬜ First ticket sold!

---

## Metrics to Track

### Primary: Time to First Ticket Sold
- Measure: Time from signup → first `tickets` row with `status = 'paid'`
- Target: < 48 hours for 30% of new collectives

### Secondary:
- **Onboarding completion rate** — % who finish all 3 screens
- **Event creation rate** — % who create at least 1 event during onboarding
- **Stripe connection rate** — % who connect Stripe during onboarding vs. later
- **Share rate** — % who use at least 1 share action
- **Activation velocity** — cohort curve of "first ticket sold" by day

### Funnel:
```
Signup → Onboarding Complete → Event Created → Stripe Connected
→ Event Published → Link Shared → First Visitor → First Ticket Sold
```

---

## Implementation Priority

### Phase 1: Remove Blockers (1 day)
1. Remove approval gate — auto-approve collectives
2. Add Stripe setup prompt to event detail page (before full redesign)
3. Add "Share" section to event page after publish

### Phase 2: New Onboarding (2-3 days)
1. Build 3-screen onboarding flow
2. Build vibe picker component
3. Build event template system
4. Build inline event creation card

### Phase 3: Stripe in Flow + Share (1-2 days)
1. Add Stripe Connect step to onboarding
2. Build share screen with IG Story + SMS
3. Auto-publish after Stripe connection

### Phase 4: Dashboard Alive (1 day)
1. Build setup checklist component
2. Add progress bar toward first ticket sold
3. Add contextual nudges based on missing steps

---

## What We're NOT Changing
- The AI chat for event creation stays as an advanced option (power users love it)
- The marketplace onboarding (separate flow, different user type)
- The event detail page (already works well)
- The checkout/payment flow (already working after our fixes)

---

## Summary

| | Current | New |
|---|---|---|
| Steps to live event | 11+ | 5 |
| Time to live event | Days (approval wait) | ~2 minutes |
| Approval | Manual gate | Auto-approve |
| Event creation | Open-ended AI chat | Template card |
| Stripe setup | Buried in settings | In onboarding flow |
| Share tools | None in onboarding | IG Story + SMS + Copy |
| Dashboard (new user) | Empty | Checklist + progress |
| Venue required | Yes (blocks creation) | Optional (add later) |
