# Nocturn MVP — Comprehensive QA Test Prompt

> **Purpose**: Systematically test every user-facing flow in the Nocturn MVP to find broken links, dead ends, logic gaps, and UX issues before the May 1 launch.
>
> **How to use**: Walk through each section below in order. For each test case, mark PASS / FAIL / BLOCKED. Note the exact issue for any FAIL. Screenshots help.
>
> **Test on**: Mobile (375px viewport) AND Desktop (1280px+). Many flows differ between the two.

---

## 0. Pre-Flight Checks

- [ ] App loads at `app.trynocturn.com` without errors
- [ ] No console errors on initial load (check DevTools → Console)
- [ ] Service worker registers (PWA installable)
- [ ] All environment variables are set (no "undefined" in API calls)

---

## 1. AUTH FLOW

### 1A. Signup (New User)
- [ ] Navigate to `/signup` — page loads, no errors
- [ ] Fill in name, email, password → click "Sign up"
- [ ] Confirmation email arrives (check spam)
- [ ] Click confirm link → lands on `/pending-approval` (NOT dashboard)
- [ ] `/pending-approval` shows "waiting for approval" message
- [ ] "Sign in" link on signup page → goes to `/login`
- [ ] Signing up with an existing email shows a clear error

### 1B. Login (Existing User)
- [ ] Navigate to `/login` — page loads
- [ ] Login with valid credentials → redirects to `/dashboard`
- [ ] Login with wrong password → shows error (NOT a crash)
- [ ] "Forgot password?" link → shows reset flow
- [ ] "Send magic link" button → sends email, shows confirmation
- [ ] "Sign up" link → goes to `/signup`
- [ ] After login, marketplace users (artist/venue) → redirect to `/dashboard/artists/me` or `/dashboard/venues/me`

### 1C. Password Reset
- [ ] Navigate to `/auth/reset-password` — page loads
- [ ] Enter email → sends reset link
- [ ] Click reset link from email → lands on password reset form
- [ ] Set new password → can login with new password

### 1D. Session & Auth Guards
- [ ] Visit `/dashboard` while logged out → redirects to `/login`
- [ ] Visit `/dashboard/events/new` while logged out → redirects to `/login`
- [ ] Session expires during use → next action gracefully redirects to `/login` (not a white screen)
- [ ] After login, redirect back to the originally requested page

### 1E. Account States
- [ ] Denied user at `/login` → redirected to `/account-denied`
- [ ] `/account-denied` shows message + mailto link to shawn@trynocturn.com
- [ ] Pending user at `/login` → redirected to `/pending-approval`
- [ ] Approved user at `/pending-approval` → auto-redirects to `/dashboard`

---

## 2. ONBOARDING (New Collective)

### 2A. Three-Screen Flow
- [ ] Navigate to `/onboarding` — page loads
- [ ] **Screen 1**: Enter collective name → slug preview updates live
- [ ] **Screen 1**: Enter city → can proceed to next screen
- [ ] **Screen 2**: Six vibe options display correctly
- [ ] **Screen 2**: Tap a vibe → it highlights, shows subgenres
- [ ] **Screen 2**: Can proceed to Screen 3
- [ ] **Screen 3**: Event card pre-fills from vibe selection
- [ ] **Screen 3**: Can edit event name, date, time inline
- [ ] **Screen 3**: Venue field is optional
- [ ] **Screen 3**: "Create" button → creates event + collective
- [ ] **Share Screen**: Confetti animation plays
- [ ] **Share Screen**: Copy link button works
- [ ] **Share Screen**: "Go to Dashboard" → navigates to `/dashboard`

### 2B. Edge Cases
- [ ] Refresh mid-onboarding → state persists or restarts cleanly
- [ ] Back button works between screens
- [ ] Empty collective name → shows validation error
- [ ] Very long collective name → doesn't break layout

---

## 3. DASHBOARD HOME (`/dashboard`)

### 3A. Layout
- [ ] **Desktop**: Left sidebar shows 6 items (Home, Chat, Discover, Ops, Reach, Money)
- [ ] **Desktop**: Dimmed "Promo — Soon" link with lock icon in sidebar
- [ ] **Mobile**: Bottom tab bar shows 4 tabs (Home, Ops, Chat, Money)
- [ ] **Mobile**: Tapping "..." or menu opens More drawer with Discover + Reach

### 3B. Home Page Content
- [ ] Greeting shows correct time of day (Good morning/afternoon/evening)
- [ ] Collective name displays correctly
- [ ] Smart actions section shows relevant cards based on event state:
  - No events → "Create Your First Event" + "Find a Venue"
  - Has draft → "Publish [Event Name]" + Promo + Money
  - Has upcoming → "Promote [Event Name]" + Promo + Money
- [ ] Quick actions row: "Find Venue", "New Event", "Team Chat"
- [ ] Insights section shows contextual tips

### 3C. Home Page Links — CLICK EVERY ONE
- [ ] "Create Your First Event" → `/dashboard/events/new` ✓
- [ ] "Publish [Event]" → `/dashboard/events` ✓
- [ ] "Promote [Event]" → `/dashboard/marketing` ✓
- [ ] "Promo" card → `/dashboard/marketing` ✓
- [ ] "Money" card → `/dashboard/finance` ✓
- [ ] "Find a Venue" card → `/dashboard/discover?tab=venues` ✓
- [ ] Quick action "Find Venue" → `/dashboard/discover?tab=venues` ✓
- [ ] Quick action "New Event" → `/dashboard/events/new` ✓
- [ ] Quick action "Team Chat" → `/dashboard/chat` ✓
- [ ] "View all events" → `/dashboard/events` ✓
- [ ] Finance summary card → `/dashboard/finance` ✓
- [ ] Insight links → correct destinations
- [ ] Attendee CRM insight → `/dashboard/attendees` ✓
- [ ] Upcoming event cards → `/dashboard/events/[eventId]` ✓

### 3D. Sidebar / Nav Links — CLICK EVERY ONE
- [ ] Home → `/dashboard`
- [ ] Chat → `/dashboard/chat`
- [ ] Discover → `/dashboard/discover`
- [ ] Ops → `/dashboard/events`
- [ ] Reach → `/dashboard/audience`
- [ ] Money → `/dashboard/finance`
- [ ] Promo (dimmed) → `/dashboard/marketing` (should show Coming Soon gate or dimmed state)
- [ ] User menu → Team → `/dashboard/members`
- [ ] User menu → Settings → `/dashboard/settings`
- [ ] User menu → Sign out → logs out, redirects to `/login`

---

## 4. EVENT CREATION (`/dashboard/events/new`)

### 4A. Chat Flow — Happy Path
- [ ] Page loads with AI greeting: "Tell me about your event..."
- [ ] Type event name (e.g. "Midnight Sessions") → AI responds, asks for more
- [ ] Type venue (e.g. "CODA Toronto") → AI captures venue, asks for date/time
- [ ] Type date/time (e.g. "April 25 10pm") → AI captures, shows confirmation summary
- [ ] Confirmation summary shows: event name, date, time, venue
- [ ] AI asks: "What's the capacity and ticket price?"
- [ ] Type "$25, 200 tickets" → AI captures, asks headliner type
- [ ] Select headliner type (international/local/none) → appropriate follow-up
- [ ] Complete budget planner questions → budget breakdown shows
- [ ] **Tiers reflect the price you entered in chat** (e.g. $25 → Early Bird ~$25)
- [ ] Review card appears with all details editable
- [ ] "Create Event" button → creates event, redirects to event detail

### 4B. Chat Flow — Venue Picker
- [ ] When asked "where's it happening" → venue picker widget appears
- [ ] Can search for venues in the picker
- [ ] Selecting a venue fills in venue name + city
- [ ] Can also type a custom venue (e.g. "My friend's loft, Toronto")

### 4C. Chat Flow — Free Events
- [ ] Type "free" or "no charge" for ticket price → AI says "Got it, free event!"
- [ ] AI asks about bar revenue / other revenue
- [ ] Say "no" → skips budget planner, goes directly to review
- [ ] Say "yes, bar revenue" → continues to budget planner
- [ ] Free event review card shows "$0" / "Free" for tiers

### 4D. Chat Flow — "Change Something"
- [ ] Click "Change something" on review card → AI asks what to change
- [ ] Type "change the name to House of Sound" → name updates in review
- [ ] Type "make it a free event" → all tier prices update to $0
- [ ] Type "change capacity to 300" → capacity updates
- [ ] After change, review card re-renders with updated data

### 4E. Review Card
- [ ] **Title**: Click to edit inline → saves on Enter
- [ ] **Description**: Click to edit inline → saves
- [ ] **Date/Time**: Click to edit → saves
- [ ] **Venue**: Click to edit → saves
- [ ] **Ticket tiers**: Each tier name, price, capacity is click-to-edit
- [ ] **Capacity**: Click to edit → saves
- [ ] Pricing Insight shows (if city + date set): market avg GA, avg VIP, confidence
- [ ] Revenue Forecast shows: sell-out number, scenarios (50%/75%/100%)
- [ ] **Price slider**: Drag slider → tier prices update in real time in the Tickets section above
- [ ] Slider labels show correct base/min/max prices
- [ ] After sliding, scenario numbers update to match new prices

### 4F. Edge Cases
- [ ] Send empty message → nothing happens (no crash)
- [ ] Very long event name (100+ chars) → doesn't break layout
- [ ] Refresh page mid-flow → draft restores from localStorage
- [ ] "Start over" button → confirms, then resets entire flow
- [ ] Type everything in one message ("Midnight Sessions at CODA April 25 10pm $25 200 cap") → AI parses all fields at once
- [ ] Voice input button (if supported) → transcribes and submits

### 4G. Event Creation Success
- [ ] After "Create Event" → spinner shows
- [ ] On success → redirects to `/dashboard/events/[newEventId]`
- [ ] Draft is cleared from localStorage
- [ ] New event appears in events list
- [ ] On failure → error message shows in review card (not a white screen)

---

## 5. EVENTS LIST (`/dashboard/events`)

### 5A. Page Content
- [ ] Page loads showing all events (upcoming + past)
- [ ] Each event card shows: title, date, venue, status badge
- [ ] "New Event" button → `/dashboard/events/new`
- [ ] Click an event card → `/dashboard/events/[eventId]`
- [ ] Empty state (no events): shows helpful message + "Create Event" CTA
- [ ] Empty state includes link to `/onboarding`

### 5B. Event Filtering/Sorting
- [ ] Events sorted by date (upcoming first)
- [ ] Draft events show "Draft" badge
- [ ] Published events show "Published" or ticket count
- [ ] Past events distinguished from upcoming

---

## 6. EVENT DETAIL (`/dashboard/events/[eventId]`)

### 6A. Page Content
- [ ] Back arrow → `/dashboard/events`
- [ ] Event title, date, venue display correctly
- [ ] Status badge (Draft/Published/Live/Past)
- [ ] Quick links grid shows all available actions

### 6B. Quick Links — CLICK EVERY ONE
- [ ] Edit → `/dashboard/events/[id]/edit` — page loads, form pre-fills
- [ ] Design → `/dashboard/events/[id]/design` — poster tools load
- [ ] Tasks → `/dashboard/events/[id]/tasks` — task list loads
- [ ] Lineup → `/dashboard/events/[id]/lineup` — artist management loads
- [ ] Check-in → `/dashboard/events/[id]/check-in` — QR scanner loads
- [ ] Promo Codes → `/dashboard/events/[id]/promos` — promo code manager loads
- [ ] Guest List → `/dashboard/events/[id]/guests` — guest list loads
- [ ] Event Chat → `/dashboard/events/[id]/chat` — chat loads
- [ ] Refunds → `/dashboard/events/[id]/refunds` — refund manager loads
- [ ] Financials → `/dashboard/events/[id]/financials` — P&L loads
- [ ] Forecast → `/dashboard/events/[id]/forecast` — forecast loads
- [ ] Recap (past events only) → `/dashboard/events/[id]/recap` — post-event recap loads
- [ ] Wrap (past events only) → `/dashboard/events/[id]/wrap` — wrap-up loads
- [ ] Public page link → opens `/e/[slug]/[eventSlug]` in new tab
- [ ] ~~Referrals~~ — should be HIDDEN (gated for MVP)

### 6C. Event Sub-Pages — Quick Smoke Test Each
For each sub-page, verify:
- [ ] Page loads without white screen or crash
- [ ] Back button/link returns to event detail
- [ ] Data loads (or shows appropriate empty state)
- [ ] No console errors

### 6D. Design Page
- [ ] Flyer upload works
- [ ] Unsplash search works
- [ ] AI Poster Generator section shows "Coming Soon" badge + is dimmed/non-interactive
- [ ] Save → actually saves the flyer

### 6E. Edit Page
- [ ] Form pre-fills with current event data
- [ ] Can change title, date, time, venue, description
- [ ] Save → updates event, redirects back to detail page
- [ ] Cancel → goes back without saving

### 6F. Lineup Page
- [ ] Can add artists from directory
- [ ] Can set performance times
- [ ] Artist list displays correctly
- [ ] "Browse Artists" link → `/dashboard/artists` (verify page exists)

### 6G. Check-in Page
- [ ] QR scanner activates (may need camera permission)
- [ ] Shows attendee count / checked-in count
- [ ] Manual check-in search works

### 6H. Live Mode
- [ ] Live mode banner appears for events happening today
- [ ] `/dashboard/events/[id]/live` — shows real-time stats
- [ ] Links to check-in, guests, lineup from live mode all work

---

## 7. DISCOVER (`/dashboard/discover`)

### 7A. Default Tab (Marketplace Profiles)
- [ ] Page loads with marketplace profiles grid
- [ ] Category filter chips work (DJs, Venues, Photo, etc.)
- [ ] Search bar filters profiles
- [ ] Click a profile → `/dashboard/discover/[slug]` — profile detail loads
- [ ] Save/unsave a profile works

### 7B. Venues Tab
- [ ] Navigate via `/dashboard/discover?tab=venues` → switches to Venues tab
- [ ] Navigate from Home "Find Venue" → lands on Venues tab
- [ ] Venue cards show: photo, name, type badge, rating, neighbourhood
- [ ] Save/unsave venue works (heart icon)
- [ ] Google Places data loads (not showing "No venues found" with empty state)
- [ ] Search for specific venues works
- [ ] Fallback to mock data if Google API fails (not a white screen)

### 7C. Edge Cases
- [ ] Tab state persists when navigating back
- [ ] Empty search results show "No results" message
- [ ] Network error shows retry option

---

## 8. REACH / AUDIENCE (`/dashboard/audience`)

### 8A. Fan List
- [ ] Page loads with "Your Fans" header
- [ ] Import button visible → opens import sheet
- [ ] Contact list loads (or shows empty state)
- [ ] Search bar filters fans by name/email
- [ ] Segment filter chips: All, Core 50, Ambassadors, Repeat, New, VIP
- [ ] Click a fan → contact detail sheet opens

### 8B. Import Sheet
- [ ] Import button opens sheet/modal
- [ ] Can paste CSV data (email, name, phone columns)
- [ ] Can paste plain email list
- [ ] Import processes and shows results (created/updated/skipped)
- [ ] Imported fans appear in list after import
- [ ] Invalid emails are skipped with error message

### 8C. Contact Detail Sheet
- [ ] Shows fan name, email, phone, Instagram
- [ ] Shows timeline (tickets purchased, events attended)
- [ ] Can edit tags, notes, follow-up date
- [ ] Can edit contact info (name, email, phone)
- [ ] Close button works

### 8D. Desktop vs Mobile
- [ ] Desktop: Grid layout with columns (Contact, Info, Events, Spent, Segment, Tags)
- [ ] Mobile: Card layout with stacked info
- [ ] Pagination works on both
- [ ] 44px minimum tap targets on all interactive elements

---

## 9. CHAT (`/dashboard/chat`)

### 9A. Channel List
- [ ] Page loads with channels list
- [ ] Shows collective channels + collab channels
- [ ] Unread message indicators
- [ ] Click a channel → `/dashboard/chat/[channelId]` — chat loads

### 9B. Chat Interface
- [ ] Messages load in chronological order
- [ ] Can send a text message → appears immediately
- [ ] Real-time: messages from other users appear without refresh
- [ ] Back button returns to channel list
- [ ] Empty channel shows appropriate state

---

## 10. MONEY / FINANCE (`/dashboard/finance`)

### 10A. Finance Dashboard
- [ ] Page loads with financial overview
- [ ] Total revenue, ticket sales, event count display
- [ ] Per-event breakdown available
- [ ] Click an event → `/dashboard/finance/[eventId]` — event financials load

### 10B. Event Financials
- [ ] Shows ticket revenue breakdown by tier
- [ ] Expenses section (if budget planner was used)
- [ ] P&L calculation
- [ ] Back button returns to finance dashboard

---

## 11. MARKETING (`/dashboard/marketing`)

> Note: Marketing/Promo is gated for MVP but the route exists. The sidebar shows it dimmed with "Soon".

### 11A. Marketing Page
- [ ] Page loads (may show Coming Soon gate or actual content)
- [ ] If gated: shows clear "Coming Soon" message
- [ ] If not gated: email composer loads
- [ ] `/dashboard/marketing/email` — email page loads

### 11B. Coming Soon Behavior
- [ ] Clicking dimmed "Promo" in sidebar → goes to `/dashboard/marketing`
- [ ] Page doesn't crash or show blank white screen
- [ ] Clear indication this feature is coming

---

## 12. SETTINGS & TEAM

### 12A. Settings (`/dashboard/settings`)
- [ ] Page loads with profile/settings form
- [ ] Can update profile info
- [ ] Stripe Connect section visible (if applicable)

### 12B. Team (`/dashboard/members`)
- [ ] Page loads with team members list
- [ ] Can invite new members (shows invite form)
- [ ] Member roles display correctly
- [ ] Invitation flow: invite → email sent → accept → member added

---

## 13. PUBLIC PAGES

### 13A. Event Page (`/e/[slug]/[eventSlug]`)
- [ ] Public event page loads without login
- [ ] Shows event title, date, venue, description, flyer
- [ ] Ticket tiers display with prices
- [ ] "Buy Tickets" button → Stripe checkout flow
- [ ] Free tickets → bypass Stripe, direct confirmation
- [ ] Sold out tiers show "Sold Out" (not a buy button)
- [ ] Waitlist option for sold-out tiers

### 13B. Ticket Page (`/ticket/[token]`)
- [ ] Ticket page loads showing QR code
- [ ] Shows event name, date, venue, ticket holder info
- [ ] QR code scannable by check-in page

### 13C. Check-in Page (`/check-in/[token]`)
- [ ] Public check-in page loads (for door staff)

### 13D. Other Public Pages
- [ ] `/legal/terms` — Terms of Service loads
- [ ] `/legal/privacy` — Privacy Policy loads
- [ ] `/invite/[token]` — Team invite page loads
- [ ] `/e/success` — Post-purchase success page loads

---

## 14. MOBILE-SPECIFIC TESTS

### 14A. Navigation
- [ ] Bottom tab bar: 4 tabs visible, correct active states
- [ ] More menu opens drawer with Discover + Reach
- [ ] Tab switching is instant (no lag)
- [ ] Active tab has pill-style highlight

### 14B. Touch & Scroll
- [ ] All buttons have min 44px tap targets
- [ ] No horizontal scroll on any page
- [ ] Event creation chat scrolls smoothly
- [ ] Review card in event creation is fully scrollable (no nested scroll trap)
- [ ] Contact list cards are tappable
- [ ] Long lists scroll without jank

### 14C. Shake to Record
- [ ] Shake phone → toast appears + navigates to `/dashboard/record`
- [ ] Record page loads, can start recording

---

## 15. CROSS-CUTTING CONCERNS

### 15A. Loading States
- [ ] Every page shows a loading spinner/skeleton (not a white screen)
- [ ] Loading states are consistent (use Nocturn purple spinner)

### 15B. Error States
- [ ] Network disconnect → shows error message + retry
- [ ] 404 pages → shows "Not Found" (not a crash)
- [ ] Server action failure → shows user-friendly error
- [ ] Invalid event ID in URL → shows "Event not found" (not a crash)

### 15C. Empty States
- [ ] Dashboard with no events → helpful onboarding CTA
- [ ] Events list with no events → "Create your first event" CTA
- [ ] Chat with no channels → helpful message
- [ ] Audience with no fans → "Import fans" CTA
- [ ] Finance with no revenue → meaningful empty state

### 15D. Broken Link Audit
Known routes that are linked to — verify each exists and loads:
| Route | Linked From | Status |
|-------|------------|--------|
| `/dashboard` | Sidebar, logo, onboarding | |
| `/dashboard/events` | Sidebar (Ops), home cards | |
| `/dashboard/events/new` | Home CTA, events page | |
| `/dashboard/events/[id]` | Events list, creation success | |
| `/dashboard/events/[id]/edit` | Event detail | |
| `/dashboard/events/[id]/design` | Event detail | |
| `/dashboard/events/[id]/tasks` | Event detail | |
| `/dashboard/events/[id]/lineup` | Event detail | |
| `/dashboard/events/[id]/check-in` | Event detail, live mode | |
| `/dashboard/events/[id]/promos` | Event detail | |
| `/dashboard/events/[id]/guests` | Event detail, live mode | |
| `/dashboard/events/[id]/chat` | Event detail | |
| `/dashboard/events/[id]/refunds` | Event detail | |
| `/dashboard/events/[id]/financials` | Event detail, recap | |
| `/dashboard/events/[id]/forecast` | Event detail | |
| `/dashboard/events/[id]/recap` | Event detail (past) | |
| `/dashboard/events/[id]/wrap` | Event detail (past) | |
| `/dashboard/events/[id]/live` | Live mode banner | |
| `/dashboard/events/[id]/playbook` | ⚠️ Verify — exists? | |
| `/dashboard/events/[id]/referrals` | ⚠️ Should be HIDDEN | |
| `/dashboard/chat` | Sidebar, home, mobile tab | |
| `/dashboard/chat/[channelId]` | Chat list | |
| `/dashboard/discover` | Sidebar, more drawer | |
| `/dashboard/discover?tab=venues` | Home quick actions | |
| `/dashboard/discover/[slug]` | Discover grid cards | |
| `/dashboard/audience` | Sidebar (Reach), more drawer | |
| `/dashboard/finance` | Sidebar (Money), home cards | |
| `/dashboard/finance/[eventId]` | Finance dashboard | |
| `/dashboard/marketing` | Home cards, sidebar (dimmed) | |
| `/dashboard/marketing/email` | Recap page | |
| `/dashboard/attendees` | Home insight | |
| `/dashboard/members` | User menu dropdown | |
| `/dashboard/settings` | User menu dropdown | |
| `/dashboard/record` | Shake gesture | |
| `/dashboard/artists` | Lineup page | |
| `/dashboard/artists/me` | Login redirect (artist) | |
| `/dashboard/venues/me` | Login redirect (venue) | |
| `/dashboard/my-profile` | Marketplace nav | |
| `/dashboard/promote` | Promoter nav | |
| `/dashboard/calendar` | ⚠️ Check if linked | |
| `/dashboard/analytics` | ⚠️ Check if linked | |
| `/dashboard/promo-insights` | ⚠️ Check if linked | |
| `/dashboard/inquiries` | ⚠️ Check if linked | |
| `/onboarding` | Events empty state | |
| `/onboarding/marketplace` | ⚠️ Check if linked | |
| `/login` | Logout, auth guards | |
| `/signup` | Login page | |
| `/pending-approval` | Login/signup redirect | |
| `/account-denied` | Login redirect (denied) | |

### 15E. User Type Variations
Test the following with different user types:
- [ ] **Collective user**: Full nav (Home, Chat, Discover, Ops, Reach, Money)
- [ ] **Promoter user**: Promoter nav (Promote, Discover, Chat)
- [ ] **Marketplace user** (artist/venue): Marketplace nav (Home, My Profile, Discover, Chat)
- [ ] Each user type sees only their relevant nav items
- [ ] Marketplace users can't access collective-only pages

---

## 16. FULL USER JOURNEY — END TO END

### Journey 1: First-Time Collective
1. [ ] Sign up → pending approval
2. [ ] Get approved → login → dashboard
3. [ ] See empty state → click "Create Your First Event"
4. [ ] Chat through event creation: name → venue → date → $25, 200 cap → local headliner → $500 talent fee → no venue costs → budget breakdown
5. [ ] Review card shows correct tiers based on $25 input
6. [ ] Adjust price with slider → tiers update in real time
7. [ ] Create event → lands on event detail
8. [ ] Go to Design → upload a flyer
9. [ ] Go to Lineup → add an artist
10. [ ] Go to Tasks → see default tasks
11. [ ] Go back to Home → see upcoming event card
12. [ ] Share public event link → opens public page
13. [ ] Buy a ticket (Stripe test mode)
14. [ ] Check ticket page → QR code shows
15. [ ] Go to Check-in → scan QR code
16. [ ] Go to Finance → see ticket revenue
17. [ ] Go to Reach → see the ticket buyer as a fan

### Journey 2: Quick Free Event
1. [ ] Create event → chat: "House Vibes at The Loft, May 5 9pm, free, 100 cap"
2. [ ] AI parses all fields → asks about bar revenue
3. [ ] Say "no" → goes to review (skips budget planner)
4. [ ] Review shows all tiers as "Free"
5. [ ] Create → event created with $0 tickets

### Journey 3: Returning User
1. [ ] Login → see dashboard with existing events
2. [ ] Click into an event → all sub-pages accessible
3. [ ] Navigate between tabs (Home → Ops → Chat → Money)
4. [ ] Each page loads data correctly (no stale state)
5. [ ] Logout → redirects to login → no cached state issues

---

## KNOWN ISSUES TO VERIFY FIXED

- [ ] Nested scroll trap on event creation review card (mobile)
- [ ] "Change something" + "make it free" → tiers should update to $0
- [ ] Free event detection: "free", "no charge", "$0" all work
- [ ] Chat-entered ticket price reflected in forecast tiers (not overwritten by budget planner)
- [ ] Price slider updates actual tier prices in review card
- [ ] `?tab=venues` query param switches to Venues tab on Discover page
- [ ] Referrals button hidden on event detail page
- [ ] AI Poster Generator shows "Coming Soon" badge + dimmed

---

## SEVERITY GUIDE

| Level | Meaning | Action |
|-------|---------|--------|
| **P0 — Blocker** | White screen, crash, data loss, can't create/buy tickets | Fix before launch |
| **P1 — Critical** | Broken link, flow dead end, incorrect data display | Fix before launch |
| **P2 — Major** | UX confusion, missing loading/error state, layout break | Fix Week 2 |
| **P3 — Minor** | Cosmetic, copy, animation polish | Fix after launch |
