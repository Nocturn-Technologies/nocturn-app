# Day 3 afternoon — Onboarding + QR check-in flow

**Mode: AUDIT + FIX.**

## Part A — Onboarding flow
Trace the 3-screen onboarding (see `src/app/onboarding/page.tsx`, `src/components/onboarding/*`, `src/lib/event-templates.ts`, `src/app/actions/onboarding-event.ts`):
1. Signup → approval gate → onboarding entry
2. Screen 1: name + city + slug preview
3. Screen 2: vibe picker (6 vibes)
4. Screen 3: drop first event (8 templates)
5. Share screen (confetti + copy link + IG story + email share)
6. First dashboard view (setup checklist)

Check:
- Can a user skip onboarding? Should they be able to?
- Close tab mid-onboarding → come back — is state persisted? Where?
- Total time under 2 min on happy path?
- Clear CTAs at every step?
- Empty dashboard guides to "create your first event"?
- Auth properly guarded on all post-onboarding pages (every `(dashboard)` route)?

Write findings to `.hardening/day3/onboarding-audit.md` (separate from the morning audit), then fix the gaps (unless protected).

## Part B — QR check-in flow
Trace `src/app/(public)/...` check-in routes + `src/app/(dashboard)/dashboard/events/[eventId]/check-in/` + `html5-qrcode` usage:
1. Organizer opens check-in dashboard for an event
2. Scans QR code (camera or manual entry)
3. Ticket validated via server action
4. Live dashboard updates (Supabase Realtime)

Check:
- Duplicate scan → shows "already scanned" not another "valid" green flash
- Invalid QR string → error, no crash
- Network drop mid-scan → graceful retry or clear error
- Live dashboard actually updates in realtime (Supabase channel subscription working)?
- Offline fallback — optional; if not present, note it
- UI feedback distinct for valid / invalid / already-scanned (three visually different states)

Write findings to `.hardening/day3/checkin-audit.md`, then fix non-protected issues.

## Gates
- `npm run build`
- `npm run test`
- `npm run test:e2e` (especially `check-in.spec.ts` from Day 0)

## Commits
- `fix(onboarding): <short summary>` per fix
- `fix(checkin): <short summary>` per fix
