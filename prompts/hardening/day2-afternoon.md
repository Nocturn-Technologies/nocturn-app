# Day 2 afternoon — Button states + loading states pass

**Mode: FIX.**

## Part A — Button states
Audit every button in the app that triggers an async action. For each one, ensure:
- Loading spinner during the async action
- Disabled while pending (no double-clicks)
- Success or error feedback after

Common offenders: "Create event", "Save", "Publish", "Send email", "Generate content" (Promo agent), "Run settlement" (Money agent), "Scan QR", "Refund ticket".

Use the existing `Button` component (shadcn/ui) + `useTransition` or local `isPending` state pattern. Do not introduce a new button primitive.

## Part B — Loading states pass
For every component that fetches data (React Query `useQuery`, `useSuspenseQuery`, server actions called from client, `fetch` in client components), confirm it shows a skeleton or spinner during the fetch. Add where missing using existing shadcn patterns (`Skeleton` component).

Don't touch server components that render data server-side — they don't need client-side loading UI.

## Gates
- `npm run build`
- `npm run test`
- `npm run test:e2e` — log breakage, revert offenders

## Commits
- `fix(ui): add loading states to async buttons` (or per-area if many)
- `fix(ui): add skeleton loaders to data-fetching components`
