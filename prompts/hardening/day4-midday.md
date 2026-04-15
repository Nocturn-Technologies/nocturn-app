# Day 4 midday — Performance scan (AUDIT-ONLY)

**Mode: AUDIT ONLY. Day 4 NEVER edits code.** Output to `.hardening/day4/performance.md`.

## Scan
- N+1 queries in server actions (DB calls in loops). Use `Promise.all` where serial calls are independent.
- Missing Supabase indexes for hot paths. Repo has 176 indexes + migration 7 "add_compound_indexes_for_hot_paths" — verify queries actually hit them. Flag queries that likely don't.
- Large components that should be split or lazy-loaded (`next/dynamic`)
- `<img>` without width/height, or where `next/image` would be better
- Unnecessary client-side data fetching that could be server-rendered
- Excessive re-renders (state updates at the wrong level, missing `memo`/`useMemo` where profiler would justify it — NOT blanket additions)
- Bundle size — large imports that could be dynamic (`import()`)

## Output format
Each finding:
- **File**: `src/path:line`
- **Impact**: high | medium | low (estimated — quantify where you can)
- **Code excerpt**: 3-10 lines
- **Why it's slow**: one sentence
- **Proposed fix**: one sentence (for Shawn to implement later)

Write to `.hardening/day4/performance.md`. Open a GitHub issue referencing the file, labeled `day4-performance-audit`.

## Hard rules
- No code edits.
- No `npm run build`.
- Only commit `.hardening/day4/performance.md`.
