# Day 3 audit — Onboarding flow
_Generated 2026-04-16T13:00:00Z_

## Summary
6 issues found across `src/app/onboarding/page.tsx`, `src/components/onboarding/share-screen.tsx`, and `src/components/onboarding/event-card.tsx`.
- **1 high** — skip-event race condition creates unwanted event
- **2 medium** — blank screen trap on localStorage restore; no disabled state on submit
- **3 low** — progress bar disappears mid-create; deprecated clipboard API; client-only auth guard

---

## Answers to checklist questions

- **Can a user skip onboarding?** No — `(dashboard)/layout.tsx` server-redirects to `/onboarding` if user has no collective memberships. Good.
- **Close tab mid-onboarding → come back — state persisted?** Yes — `localStorage` saves step/name/slug/city/vibe/eventData. Works for steps 1–3. Steps "creating"/"share" are excluded from restore (correct).
- **Total time under 2 min on happy path?** Yes — 4 screens, all CTAs clear, no long-form inputs.
- **Clear CTAs at every step?** Yes — "Continue", "Continue", "Create Event" / "I'll do this later", "Go to Dashboard". ✓
- **Empty dashboard guides to "create your first event"?** Yes — `SetupChecklist` component renders for new collectives with 4-step progress checklist. ✓
- **Auth guarded on all `(dashboard)` routes?** Yes — `(dashboard)/layout.tsx` does server-side `auth.getUser()` + redirect. ✓

---

## Issue 1 — `handleSkipEvent` stale-closure bug creates unwanted event
- **Severity**: high
- **File**: `src/app/onboarding/page.tsx:210-213`
- **Offending code**:
  ```ts
  function handleSkipEvent() {
    setSkipEvent(true);
    handleCreate();
  }
  ```
- **Why it's wrong**: React state updates are asynchronous. `setSkipEvent(true)` schedules a re-render but `skipEvent` is still `false` when `handleCreate()` runs immediately after. Inside `handleCreate`, the guard `if (!skipEvent && eventData)` reads the stale `false`, so a Stripe draft event is created even though the operator clicked "I'll do this later".
- **Fix approach**: Pass the intended skip value as a parameter to `handleCreate(skipOverride?: boolean)` and use it instead of the state variable.

---

## Issue 2 — Blank screen trap when localStorage restores `step="event"` but `eventData` is null
- **Severity**: medium
- **File**: `src/app/onboarding/page.tsx:372-409`
- **Offending code**:
  ```tsx
  {step === "event" && eventData && (
    <div className="space-y-6">
      ...
    </div>
  )}
  ```
- **Why it's wrong**: If localStorage restore sets `step = "event"` but `eventData` is null (corrupt/missing JSON, or `selectedVibe` missing so `createInitialEventData` was never called on restore), the entire block is skipped — user sees a blank min-h-[420px] area with no CTA and no back button. They're stuck.
- **Fix approach**: In the restore `useEffect`, if `data.step === "event"` and `data.eventData` is null/missing, fall back to restoring `step = "vibe"` instead.

---

## Issue 3 — "Create Event" button has no disabled/loading state — double-tap creates duplicate
- **Severity**: medium
- **File**: `src/app/onboarding/page.tsx:394-400`
- **Offending code**:
  ```tsx
  <Button
    onClick={() => handleCreate()}
    className="w-full bg-nocturn hover:bg-nocturn-light py-5 text-base min-h-[48px]"
  >
    <Sparkles className="mr-2 h-4 w-4" />
    Create Event
  </Button>
  ```
- **Why it's wrong**: There is no `disabled` prop. A quick double-tap triggers `handleCreate()` twice before `setStep("creating")` has updated the DOM, creating two collectives/events.
- **Fix approach**: Add `disabled={step === "creating"}` to the button.

---

## Issue 4 — Progress bar disappears during "creating" step (currentStep = 0)
- **Severity**: low
- **File**: `src/app/onboarding/page.tsx:221`
- **Offending code**:
  ```ts
  const currentStep = step === "name_city" ? 1 : step === "vibe" ? 2 : step === "event" ? 3 : step === "share" ? 3 : 0;
  ```
- **Why it's wrong**: `step === "creating"` maps to `0`, so `{currentStep > 0 && ...}` hides the progress bar. User sees the progress bar vanish the moment they hit "Create Event" — looks broken.
- **Fix approach**: Map "creating" to `3` (same as "event"/"share") to keep the bar visible during submission.

---

## Issue 5 — `document.execCommand("copy")` deprecated in share-screen fallback
- **Severity**: low
- **File**: `src/components/onboarding/share-screen.tsx:35-43`
- **Offending code**:
  ```ts
  const input = document.createElement("input");
  input.value = shareUrl;
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  document.body.removeChild(input);
  ```
- **Why it's wrong**: `execCommand("copy")` is deprecated and silently fails in strict contexts (e.g. Safari 17+, isolated iframes). If both `navigator.clipboard.writeText` and `execCommand` fail, `setCopied(true)` still fires — user thinks they copied but clipboard is empty.
- **Fix approach**: Remove the `execCommand` fallback; catch the clipboard failure and instead show a toast/inline message prompting the user to long-press to copy the URL.

---

## Issue 6 — Onboarding page auth guard is client-side only (brief unauthenticated render)
- **Severity**: low
- **File**: `src/app/onboarding/page.tsx:92-100`
- **Offending code**:
  ```ts
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login");
      } else {
        setAuthChecked(true);
      }
    });
  }, [supabase, router]);
  ```
- **Why it's wrong**: The auth check is client-side. The page renders a loading spinner (safe), but the full HTML is served to unauthenticated users before the redirect fires. The loading state prevents content exposure, but a server-side guard would be cleaner and faster.
- **Fix approach**: Convert `/onboarding/page.tsx` to a Server Component shell that calls `auth.getUser()` server-side and redirects before HTML is sent. (Non-trivial refactor — note as improvement, not urgent fix since server actions all re-check auth.)
