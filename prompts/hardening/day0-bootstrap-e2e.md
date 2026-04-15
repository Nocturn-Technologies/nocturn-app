# Day 0 — Bootstrap Playwright E2E suite

Generate a complete Playwright E2E suite for Nocturn. The scaffolding is already in place: `playwright.config.ts`, `tests/e2e/` directory, `tests/e2e/smoke.spec.ts` (the placeholder), `tests/e2e/README.md`. Replace the placeholder smoke with a real suite.

## What to build — 9 spec files

Create these files under `tests/e2e/`. Target roughly 25 tests total, smoke coverage (happy path + 1-2 key failure modes per flow). Target wall-clock <4 min in CI.

1. **`auth.spec.ts`** — signup → email confirm stub → onboarding entry → dashboard reach
2. **`marketing-agent.spec.ts`** — logged-in operator creates an event, opens Marketing Hub, generates Instagram caption via Promo agent, copies output. Mock the Claude API response with a fixture.
3. **`finance-agent.spec.ts`** — operator closes an event, opens Finance/Settlement, verifies P&L math (revenue − expenses − splits), confirms payout. Use a seeded event with known numbers.
4. **`five-screens-nav.spec.ts`** — bottom-tab navigation between Home, Events, Chat, Venues on mobile viewport + sidebar nav on desktop.
5. **`event-creation.spec.ts`** — AI event creation text input path (Claude parse → form prefilled). Skip voice/URL with `test.skip()` and a TODO — those need audio fixtures and network intercepts.
6. **`ticket-purchase.spec.ts`** — public event page, select tier + quantity, Stripe test card `4242 4242 4242 4242` exp `12/34` CVC `123`, confirmation page, QR code visible. Use Stripe test mode.
7. **`ticket-edge-cases.spec.ts`** — four sub-tests: (a) sold-out tier shows waitlist CTA, (b) card decline (`4000 0000 0000 0002`) shows error, (c) user refresh mid-checkout doesn't double-charge, (d) webhook replay is idempotent (simulate via admin endpoint or DB).
8. **`check-in.spec.ts`** — organizer opens event check-in dashboard, scans a valid pre-seeded QR (mock the camera with `html5-qrcode` hooks or direct scan URL), sees ticket validated; scanning same QR again shows "already scanned"; invalid QR string shows error; live stats counter increments in realtime.
9. **`dashboard-empty-states.spec.ts`** — brand-new collective with zero events sees the empty state on Home, Events, Marketing, Finance, Settings. No blank screens.

## Fixtures and helpers to create

Create `tests/e2e/fixtures/` with:
- `auth.ts` — Playwright fixture that logs in a test user and reuses storage state across tests. Use a dedicated `e2e-test-user@trynocturn.com` + E2E-only collective seeded via Supabase service key. Add `.env.e2e` doc to README for required vars.
- `seed.ts` — helper to insert + tear down a test collective, event, and ticket tier via Supabase admin client. Uses env `E2E_SUPABASE_*` vars (already referenced in `.github/workflows/e2e.yml`).
- `stripe.ts` — helper constants for Stripe test cards (success, decline, 3DS required).

## Rules

- Tests must be independent — use `test.beforeEach` to seed, `test.afterEach` to clean up. No test depends on a prior test's state.
- Use semantic selectors (`getByRole`, `getByLabel`, `getByText`) not CSS. If selectors don't exist, add `data-testid` attributes sparingly to the React components — but only add them, don't refactor component code.
- Do not put real API keys in any test file. Reference `process.env.E2E_*` only.
- Each spec file should have a leading JSDoc comment explaining the flow and the MVP loop it covers.
- `npx playwright test --list` must show your tests without errors before you finish.

## Check when done

Run `npx playwright test --list` and confirm ~25 tests load without parse errors. Then run `npx playwright test smoke.spec.ts` to confirm the placeholder still passes (don't delete it yet — keep it as the absolute baseline; delete it only after confirming the real suite works locally).

Commit message: `test(e2e): bootstrap Playwright suite covering MVP loops`.
