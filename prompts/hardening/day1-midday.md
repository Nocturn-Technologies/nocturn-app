# Day 1 midday — Fix UI issues from this morning's audit

**Mode: FIX. Input = `.hardening/day1/audit.md`.**

## Steps
1. Read `.hardening/day1/audit.md`. If it doesn't exist or is <100 bytes, stop and open an issue — no morning audit means nothing to fix.
2. For each issue in the audit (in severity order: critical → high → medium → low):
   a. Re-open the cited file at the cited line.
   b. Check that the quoted "Offending code" excerpt still matches what's in the file. If it doesn't match (code changed, or audit hallucinated), skip and append the issue to `.hardening/day1/skipped.md` with the reason.
   c. Apply the fix described in "Fix approach". Only touch styling and layout — no logic changes.
3. After all fixes:
   - `npm run build` — must pass. If it fails, investigate and fix before committing anything.
   - `npm run test` — must stay green.
   - `npm run test:e2e` — log any new failures to `.hardening/day1/test-breakage.md` and revert the specific commits that caused them.

## Scope rules
- Styling and layout only. No logic changes, no new dependencies, no refactors.
- Use existing shadcn/ui patterns. Do not introduce new design primitives.
- Do not edit files in the protected paths list from `_context.md`.

## Output
- Commit fixes one per logical change (`fix(ui): <short summary>`)
- Commit `.hardening/day1/skipped.md` and `.hardening/day1/test-breakage.md` if they were created
