# Day 5 midday — AI event creation polish (voice + text + URL)

**Mode: AUDIT + FIX.** Output audit to `.hardening/day5/event-creation-audit.md`, then fix non-protected items.

## Scope
Three ingestion paths into the event-creation form:
1. **Voice** — Whisper transcription → `transcribe.ts` / `transcribeFromStorage` → then Claude parse via `ai-parse-event.ts`
2. **Text** — direct paste → Claude parse via `ai-parse-event.ts`
3. **URL** — fetch remote page → parse → populate form (uses `import-profile.ts` pattern or event-specific variant; verify which)

## For each path, check
- **Garbage input**: random noise, non-English, completely irrelevant text, broken URL
- **Partial info**: transcript mentions only date — does parsing populate what it can and leave the rest blank for the user?
- **Network failure at each hop**: mic permission denied, Whisper API 429/5xx, Claude API failure, URL fetch 404/timeout
- **Progress UI**: user sees each stage (transcribing... parsing... populating...) with clear indicators
- **Edit-after-AI**: user can edit every field the AI populated
- **Sanitization**: `sanitizeAIText` applied to anything the model wrote before rendering; `sanitizeUrl` applied to any URL the model emitted

## Fix
Non-protected fixes only. Tighten prompts, add progress indicators, wire fallbacks, add sanitization where missing. Do not touch Stripe/webhook files.

## Gates
- `npm run build`
- `npm run test`
- `npm run test:e2e` (`event-creation.spec.ts`)

## Commits
- `fix(event-creation/<path>): <summary>`
