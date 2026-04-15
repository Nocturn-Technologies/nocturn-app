# Day 4 afternoon — TypeScript strictness audit (AUDIT-ONLY)

**Mode: AUDIT ONLY. Day 4 never edits code.** Output to `.hardening/day4/typescript.md`.

CLAUDE.md claims: "0 `as any` casts, 0 `eslint-disable` comments, 0 unsafe non-null assertions, zero TypeScript errors." Verify and flag any drift.

## Check
- Run `npx tsc --noEmit` — list any errors.
- Grep for `as any` — report each with `file:line` and 3-line excerpt.
- Grep for `@ts-ignore`, `@ts-expect-error` — report each.
- Grep for `eslint-disable` — report each with justification notes if comment provides one.
- Grep for non-null assertions (`!` after expressions that could be null) — flag suspicious ones, not harmless ones like `process.env.NODE_ENV!`.
- Untyped function parameters (params typed as `any` implicitly).
- Missing return types on exported functions (especially server actions).
- Implicit `any` in callbacks.

## Output
Write findings to `.hardening/day4/typescript.md`. For each finding: `file:line`, category, excerpt, severity (high = masks a real bug, medium = type pollution, low = stylistic). Open a GitHub issue labeled `day4-typescript-audit`.

## Hard rules
- No code edits, not even "obvious" TS fixes. Day 4 is report-only. Shawn reviews.
- Only commit `.hardening/day4/typescript.md`.
