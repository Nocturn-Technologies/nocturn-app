# Day 1 afternoon — Console.log cleanup + dead code

**Mode: FIX.**

## Part A — Console cleanup
Find and remove all `console.log`, `console.warn`, `console.error` statements that are debug/dev leftovers. Keep any that are inside legitimate error-handling paths (catch blocks that intentionally log, Sentry-adjacent logging, boot-time warnings). Rule of thumb: if it's inside a user-triggered code path and the app would be noisier for end users with it, delete it.

## Part B — Dead code
- Unused imports in every file (rely on the ESLint output — run `npm run lint` to list them)
- Unused exported functions — check with the codebase-memory-mcp tool if available, otherwise grep references
- Commented-out code blocks longer than 3 lines — delete
- `TODO` / `FIXME` / `HACK` comments — DO NOT delete. Instead, collect them all into `.hardening/day1/todo-triage.md` with file:line and the comment text. This becomes a triage list you review later.

Do NOT delete directories referenced in planned-but-empty modules (e.g. `src/lib/agents/`, `src/lib/validators/`, `src/components/collective/`, `src/components/layout/`, `src/components/settlements/` if any exist as placeholders).

## Gates
- `npm run lint` must pass
- `npm run build` must pass
- `npm run test` must stay green
- `npm run test:e2e` — log breakage to `.hardening/day1/test-breakage.md` and revert

## Commits
- `chore: remove debug console statements`
- `chore: remove unused imports`
- `chore: remove dead code` (if anything substantial)
- `docs: triage TODO/FIXME comments` (the `.md` file)
