# Day 3 audit — QR check-in flow
_Generated 2026-04-16T13:00:00Z_

## Summary
5 issues found across `src/app/(dashboard)/dashboard/events/[eventId]/check-in/page.tsx`, `src/app/actions/check-in.ts`, and `src/components/qr-scanner.tsx`.
- **1 high** — stale closure captures `muted` and `offlineQueue` state, audio toggles silently broken
- **1 medium** — `loadDoorList` silently fails with no user-facing error
- **3 low** — stale queue count in queued message; duplicate-scan path shows wrong feedback on concurrent double-scan; `loadDoorList` called inside `handleScan` dependency (dep-array issue)

---

## Answers to checklist questions

- **Duplicate scan → "already scanned" not another "valid" green flash?**
  - Server action: atomic `.eq("status", "paid")` guard returns `duplicate: true` if already checked in. ✓
  - Client: `result.duplicate` or `/already checked in/i` regex → `type: "duplicate"` → amber AlertTriangle. ✓
  - Race condition (two scanners simultaneously): `updateCount === 0` guard in server action catches the second scanner and returns `duplicate: true`. ✓

- **Invalid QR string → error, no crash?**
  - URL parsing wrapped in try/catch; non-URL non-UUID falls through to `type: "error"` with "Invalid QR code — not a valid ticket". ✓

- **Network drop mid-scan → graceful retry or clear error?**
  - `navigator.onLine` check before scan: queues token offline. ✓
  - Check after failed server action: if offline + generic error → re-queues. ✓
  - Failed tokens expose a `Retry` button. ✓

- **Live dashboard updates in realtime?**
  - Supabase Realtime channel `checkin:{eventId}` watches `tickets` table UPDATEs and calls `getCheckInStats` + `loadDoorList`. ✓
  - 30-second fallback polling if Realtime drops. ✓

- **Offline fallback?**
  - Present: offline banner, queue to localStorage, flush on reconnect. ✓

- **UI feedback distinct for valid/invalid/already-scanned?**
  - success: green border + CheckCircle2 + "Checked in!" ✓
  - duplicate: amber border + AlertTriangle + "Already checked in at HH:MM" ✓
  - error: red border + XCircle + error message ✓
  - queued (offline): yellow border + CheckCircle2 + "Queued for check-in" ✓

---

## Issue 1 — `handleScan` stale closure: `muted` and `offlineQueue` not in `useCallback` deps
- **Severity**: high
- **File**: `src/app/(dashboard)/dashboard/events/[eventId]/check-in/page.tsx:241-359`
- **Offending code**:
  ```ts
  const handleScan = useCallback(
    async (decodedText: string) => {
      // ...reads `muted` and `offlineQueue` from closure...
      if (!muted) playErrorTone();
      setScanResult({ ..., message: `Queued for check-in (offline). ${offlineQueue.length + 1} in queue.` });
    },
    [eventId, processing]  // ← muted and offlineQueue missing
  );
  ```
- **Why it's wrong**: `muted` is captured at `handleScan` creation time. If the operator toggles the mute button after the first scan, subsequent scans still use the stale `muted` value — sounds play when muted and vice versa. `offlineQueue.length + 1` also shows a stale count.
- **Fix approach**: Use a `useRef` to mirror `muted` (same pattern as `pausedRef` in `qr-scanner.tsx`), and read `mutedRef.current` inside the callback instead of the state variable.

---

## Issue 2 — `loadDoorList` silently fails: no error state or user feedback
- **Severity**: medium
- **File**: `src/app/(dashboard)/dashboard/events/[eventId]/check-in/page.tsx:101-141`
- **Offending code**:
  ```ts
  async function loadDoorList() {
    const supabase = createClient();
    const [{ data: ticketHolders }, { data: guestEntries }] = await Promise.all([...]);
    // ... no error handling
    setGuests(combined);
  }
  ```
- **Why it's wrong**: If the Supabase client query fails (network error, RLS deny, session expired), `data` is `null` and `combined` will be empty. The door list section simply disappears with no explanation — operator doesn't know if the list is empty or broken. The stats section already has `statsError` state for this.
- **Fix approach**: Add try/catch + a `doorListError` state; display an inline error banner below the door list header when the query fails.

---

## Issue 3 — Stale `offlineQueue.length + 1` count in queued scan message
- **Severity**: low
- **File**: `src/app/(dashboard)/dashboard/events/[eventId]/check-in/page.tsx:285`
- **Offending code**:
  ```ts
  setScanResult({ type: "queued", message: `Queued for check-in (offline). ${offlineQueue.length + 1} in queue.` });
  ```
- **Why it's wrong**: `offlineQueue` inside the stale closure is the value from when `handleScan` was created, not the current queue length after the functional `setOfflineQueue(prev => [...prev, ticketToken])` update. The displayed count lags by one or more.
- **Fix approach**: Removed as part of Issue 1 fix (using ref for muted). The queue count can be read from the offline banner which has correct live state.

---

## Issue 4 — `loadDoorList` is defined inside the component body but called from multiple effects — creates a new function reference on every render
- **Severity**: low
- **File**: `src/app/(dashboard)/dashboard/events/[eventId]/check-in/page.tsx:101`
- **Offending code**:
  ```ts
  async function loadDoorList() { ... }
  ```
- **Why it's wrong**: `loadDoorList` is a plain function, not `useCallback`, so it gets a new reference on every render. The Realtime subscription's `on()` handler and the polling interval hold references to the original closure, so they'll always call the original version — fine for correctness but means the `guests` state it closes over is also stale. Wrapping in `useCallback([eventId])` stabilizes the identity and prevents subtle closure bugs.
- **Fix approach**: Wrap `loadDoorList` in `useCallback` with `[eventId]` dependency.

---

## Issue 5 — Manual token entry form accepts any input without UUID format hint/validation
- **Severity**: low
- **File**: `src/app/(dashboard)/dashboard/events/[eventId]/check-in/page.tsx:474-492`
- **Offending code**:
  ```tsx
  <input
    placeholder="e.g. a1b2c3d4-e5f6-..."
    value={manualToken}
    onChange={(e) => setManualToken(e.target.value)}
    ...
  />
  ```
- **Why it's wrong**: The placeholder suggests a UUID format, but there's no client-side format validation before calling `handleScan`. If an operator types a partial UUID or a wrong string, they'll see "Invalid QR code" after the round-trip. A quick regex pre-check before submitting would give instant feedback.
- **Fix approach**: In `handleManualSubmit`, check if the trimmed value matches the UUID regex (already defined in the component) and show inline error before calling `handleScan`. (Low priority — `handleScan` already handles invalid tokens gracefully.)
