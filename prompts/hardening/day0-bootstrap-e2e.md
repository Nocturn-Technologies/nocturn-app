# Day 0 — Bootstrap Playwright E2E suite (with network mocking)

Generate a real E2E suite for Nocturn that runs without a separate test Supabase or test Stripe account. **Strategy: mock external services at the network layer using Playwright's `route` interception.** The UI, validation, routing, client state, and server-action client code all run for real. Only network I/O to Supabase / Stripe / Claude / OpenAI / Resend is intercepted and returned from fixtures.

The scaffolding is in place: `playwright.config.ts`, `tests/e2e/`, placeholder `smoke.spec.ts`. Replace the placeholder with the real suite.

## Directory layout to produce

```
tests/e2e/
  fixtures/
    mocks.ts                 # All route interceptors in one place (Supabase REST, Stripe, Claude, OpenAI, Resend)
    seed-data.ts             # Typed seed objects: testUser, testCollective, testEvent, testTier, testTicket
    auth.ts                  # Playwright fixture that "logs in" by seeding cookies/localStorage + mocks
  auth.spec.ts
  marketing-agent.spec.ts
  finance-agent.spec.ts
  five-screens-nav.spec.ts
  event-creation.spec.ts
  ticket-purchase.spec.ts
  ticket-edge-cases.spec.ts
  check-in.spec.ts
  dashboard-empty-states.spec.ts
  README.md                  # Update with the mocking-strategy explanation
```

## The mocking layer — `fixtures/mocks.ts`

Write one function `installMocks(page: Page, overrides?: Partial<MockState>)` that installs route handlers for:

- **Supabase REST** (`**/rest/v1/**`): Parse the table name + filter from the URL. Return seed data matching the query. Support `GET`, `POST`, `PATCH`, `DELETE`. Support `.or()` query strings. Use the seed-data objects.
- **Supabase Auth** (`**/auth/v1/**`): Return a signed-in session for the test user by default. Overridable to return unauthenticated.
- **Supabase Realtime** (`**/realtime/v1/**`): Return empty subscription response; tests needing realtime push simulate via `page.evaluate` calling the realtime callback directly.
- **Supabase RPC** (`**/rest/v1/rpc/**`): For `fulfill_tickets_atomic`, `check_and_reserve_capacity`, `has_collective_role` etc., return the fixture-appropriate response. Default to success.
- **Stripe** (`https://api.stripe.com/**`, `https://checkout.stripe.com/**`): Mock PaymentIntent / Checkout Session creation with deterministic IDs. Webhook simulation happens by having the test `POST` to the local webhook route with a signed fixture payload.
- **Claude / Anthropic** (`https://api.anthropic.com/**`): Return a deterministic completion fixture appropriate to the prompt detected in the request body (basic shape-match).
- **OpenAI Whisper** (`https://api.openai.com/**`): Return a transcription fixture when `/audio/transcriptions` is hit.
- **Resend** (`https://api.resend.com/**`): Return `{ id: "mock-email-id" }` on every send.

Add a `MockState` store so tests can assert "Resend was called with subject X" or "Stripe got price Y". Export helpers: `getLastStripeIntent()`, `getAllResendCalls()`, etc.

## The auth fixture — `fixtures/auth.ts`

Export a `test` object extended from `@playwright/test` that:
1. Installs mocks by default
2. Sets Supabase auth cookies/localStorage for `testUser` before each test
3. Navigates to `/dashboard` as the entry point
4. Exposes `page`, `mockState`, and helpers (`loginAs`, `logout`, `seedEvent`) to each test

Use Playwright's storage-state pattern where sensible. Keep it small — under 200 lines.

## The 9 spec files (happy path + 1-2 failure modes each, ~25 tests total, target <4 min full run)

### `auth.spec.ts`
- Unauthenticated user hitting `/dashboard` redirects to `/login`
- Signup happy path mock → lands on `/onboarding`
- Invalid signup (weak password) shows inline validation

### `marketing-agent.spec.ts`
- Operator opens Marketing Hub for a seeded event, clicks "Generate IG caption", mock Claude returns a caption, test verifies it renders + "Copy" button puts it on clipboard
- Claude API failure → friendly error UI, no crash

### `finance-agent.spec.ts`
- Seeded event with revenue=$1000, expenses=$400, 50/50 split between two members → Finance page shows correct P&L + settlement lines
- "Confirm payout" button calls the server action; assert Resend mock was called with the right subject + to-addresses

### `five-screens-nav.spec.ts`
- Mobile viewport (use the `mobile` project): bottom-tab nav cycles Home / Events / Chat / Venues (note: per CLAUDE.md the 4 mobile tabs are these, not Marketing/Finance — verify before writing the test)
- Desktop viewport: sidebar nav includes full menu; clicking each route lands on the right page

### `event-creation.spec.ts`
- Text-based AI event creation: user pastes "Deep house night Friday at Studio A doors 10pm" → Claude mock returns parsed event → form is prefilled → user can edit every field → Save creates event in mocked Supabase → redirect to event page
- `test.skip` voice and URL paths with a TODO comment — audio fixtures + remote fetch intercepts are phase-2

### `ticket-purchase.spec.ts`
- Public event page loads → select tier 2 × quantity → click buy → Stripe mock returns `client_secret` → submit PaymentIntent mock succeeds → confirmation page shows QR → Resend mock received confirmation email
- Use Stripe test card `4242 4242 4242 4242` exp `12/34` cvc `123` in the mock fixture matching

### `ticket-edge-cases.spec.ts`
- Sold-out tier: mock capacity check returns 0 → UI shows waitlist CTA, buy button disabled
- Card decline: Stripe mock returns decline → UI shows error, no ticket created in mocked DB
- Refresh mid-checkout: simulate reload after PaymentIntent creation but before confirm → page resumes correctly, no double-charge
- Webhook replay idempotency: POST the same webhook fixture to `/api/webhooks/stripe` twice → second call does not create a second ticket (assert via mocked DB state)

### `check-in.spec.ts`
- Organizer opens check-in dashboard for seeded event with 3 issued tickets → live stats show 3 issued / 0 checked
- Valid QR (use direct URL endpoint to bypass camera): ticket validated, stats update to 1 checked
- Duplicate scan: second scan shows "already scanned" state (distinct visual from first scan)
- Invalid QR: shows error, no state change

### `dashboard-empty-states.spec.ts`
- New collective with zero events: Home, Events, Marketing, Finance, Settings all render empty states with clear CTAs
- No blank screens anywhere

## Conventions
- Use semantic selectors (`getByRole`, `getByLabel`, `getByText`) first. Only add `data-testid` when semantic selection is infeasible — and when you add one, add it to the component itself, don't refactor surrounding code.
- Every test independent: `test.beforeEach` installs mocks + resets state, `test.afterEach` clears cookies.
- `test.describe` groups per spec, one operator story per `describe`.
- Real API keys NEVER appear in tests. Use placeholder env values — the workflow uses `sk_test_mock`, `re_mock`, etc.
- JSDoc at the top of each spec file explains the MVP loop it covers and which production server action(s) it exercises client-side.

## Verification before you finish
1. `npx playwright test --list` shows ~25 tests without parse errors
2. `npx playwright test --project=chromium` runs to completion with no test failures on your local machine
3. If any test takes >20s, investigate and shorten
4. Delete `tests/e2e/smoke.spec.ts` once your suite runs green

## Commit strategy
- `test(e2e): add mocking layer and auth fixture`
- `test(e2e): add {spec file name}` per spec file (8–9 commits)
- `test(e2e): remove placeholder smoke test` (last)

Push on branch `hardening/day0-20260415`, open a PR labeled `hardening`, title `hardening: Day 0 bootstrap Playwright E2E suite`. When the PR is open, link to it in your completion summary.
