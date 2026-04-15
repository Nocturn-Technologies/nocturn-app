# Day 5 morning — AI agents (Money / Promo / Reach / Ops + Ask Nocturn) quality check

**Mode: AUDIT + FIX (non-protected).** Output audit to `.hardening/day5/agents-audit.md`, then fix what's safe.

## Scope — 4 named agents + Ask Nocturn
Per CLAUDE.md, agent names are Money, Promo, Reach, Ops (NOT the earlier "Marketing / Finance" naming from PDFs — use the real names). Sources:
- Claude wrapper: `src/lib/claude.ts` (model fallback logic)
- AI server actions: `ai-briefing.ts`, `ai-chat.ts`, `ai-email.ts`, `ai-enrich-event.ts`, `ai-finance.ts`, `ai-parse-event.ts`, `ai-poster.ts`, `ask-nocturn.ts`, `import-profile.ts` (all under `src/app/actions/`)
- UI surfaces: any page under `/dashboard` that chats with an agent (promote, marketing, finance, ask-nocturn, record)

## Check per agent
- **System prompts**: nightlife/collective-specific language, not generic "assistant". Reference the brand voice ("operators", "collectives", "you run the night") and the operator persona (Toronto house-music collective, 20-30 year old promoter, 2-4 events/month).
- **Edge cases**:
  - Empty data (new collective, no events)
  - Partial data (event with no tier yet, or no expenses logged)
  - Very large data (collective with 50+ events) — prompt-window behavior
- **Error handling**: Claude API fails (timeout, 429, 5xx) — is there a user-visible fallback? Retry logic? Does the model-fallback ladder in `src/lib/claude.ts` actually trigger?
- **Response quality**: sampling check — do generated outputs read as actionable for a promoter, not generic business-speak? Flag any agent whose outputs are generic.
- **UI**: chat interfaces clean? Message formatting (markdown rendering, code blocks if ever returned)? Loading states? Copy-output button works?

## Output then fix
1. Write full audit to `.hardening/day5/agents-audit.md` with per-agent sections.
2. Fix the non-protected, safe items:
   - Tighten system prompts (text-only changes in the `*.ts` action files)
   - Add missing loading states / error UI on agent chat surfaces
   - Wire in the model-fallback ladder if a call path bypasses it
3. Do NOT touch Stripe/webhook-adjacent files. Do NOT modify `.env*`.

## Gates
- `npm run build`
- `npm run test`
- `npm run test:e2e` (especially `marketing-agent.spec.ts`, `finance-agent.spec.ts`)

## Commits
- `fix(ai/<agent>): <summary>` per agent change
- `fix(ai): <ui summary>` for UI surface changes
