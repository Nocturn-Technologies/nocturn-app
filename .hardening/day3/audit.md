# Day 3 audit — Server action + API route error handling
_Generated 2026-04-15T07:00:00Z_

## Summary
13 issues found across 61 server actions and 18 API routes.
- **1 high** — conditional auth check can be silently skipped in `ai-email.ts`
- **8 medium** — missing input validation, enum guards, broken queries, missing try/catch
- **4 low** — weak validation, content control gaps, missing audit logs

Protected-path notes: `create-payment-intent/route.ts` has a real TODO (per-email rate limit) but is on the protected-path blocklist — midday must NOT edit it. Logged separately in description below.

---

## Issue 1 — `generatePostEventEmail` auth guard skipped when `collective_id` is null
- **Severity**: high
- **File**: `src/app/actions/ai-email.ts:48-58`
- **Offending code**:
  ```ts
  const { data: evForCol } = await admin.from("events").select("collective_id").eq("id", eventId).is("deleted_at", null).maybeSingle();
  const colId = evForCol?.collective_id;
  if (colId) {
    const { count: memberCount } = await admin
      .from("collective_members")
      .select("*", { count: "exact", head: true })
      .eq("collective_id", colId)
      .eq("user_id", user.id)
      .is("deleted_at", null);
    if (!memberCount) return { error: "Not authorized", email: null };
  }
  ```
- **Why it's wrong**: If the second `events` query returns null (DB error, race condition, or soft-deleted event), `colId` is `undefined` and the entire ownership check is skipped — any authenticated user can generate AI email content for any event. A first query already fetched the event successfully (line ~35); this redundant second query introduces the conditional bypass.
- **Fix approach**: Remove the redundant second query; pull `collective_id` from the already-fetched `event` object (line ~35 query already selects it); make the auth guard unconditional — if `collective_id` is missing, return `{ error: "Not authorized" }`.

---

## Issue 2 — `saveVenueScoutNotes` queries columns that don't exist on `saved_venues` — function always errors
- **Severity**: medium
- **File**: `src/app/actions/venue-scout.ts:52-57`
- **Offending code**:
  ```ts
  const { data: savedVenue } = await admin
    .from("saved_venues")
    .select("id, notes")
    .eq("user_id", user.id)
    .eq("place_id", notes.place_id)
    .maybeSingle();
  if (!savedVenue) {
    return { error: "Venue not found in your saved venues" };
  }
  ```
- **Why it's wrong**: DB types (`database.types.ts:2415-2423`) confirm `saved_venues` columns are: `id`, `collective_id`, `venue_id`, `notes`, `rating`, `metadata`, `created_at`. Neither `user_id` nor `place_id` exist. PostgREST silently ignores unknown equality filters, so `maybeSingle()` always returns `null` and every call returns `{ error: "Venue not found in your saved venues" }` — the function is permanently broken.
- **Fix approach**: Replace `.eq("user_id", …).eq("place_id", …)` with a lookup by `venue_id` (resolve the venue record by the incoming `place_id` from the `venues.metadata` field or a separate query), then verify `collective_id` ownership.

---

## Issue 3 — `addChannelMember` writes arbitrary `role` string to DB without enum guard
- **Severity**: medium
- **File**: `src/app/actions/chat-members.ts:161,208-213`
- **Offending code**:
  ```ts
  // TODO(audit): validate role against ["member","admin"] enum
  export async function addChannelMember(
    channelId: string,
    userId: string,
    role: string = "member"
  ): Promise<{ error: string | null }> {
    // ...
    await sb.from("channel_members").insert({ channel_id: channelId, user_id: userId, role });
  ```
- **Why it's wrong**: Any caller with admin/promoter membership can insert an arbitrary string as `role` (e.g. `"owner"` or `"superadmin"`), potentially breaking downstream role-based access control on channels if no DB-level enum/CHECK constraint enforces this.
- **Fix approach**: Add `const VALID_ROLES = ["member", "admin"] as const; if (!VALID_ROLES.includes(role as never)) return { error: "Invalid role" };` before the insert.

---

## Issue 4 — `checkCollectiveNameAvailability` has no try/catch; DB errors throw unhandled exceptions
- **Severity**: medium
- **File**: `src/app/actions/check-collective-name.ts:61-82`
- **Offending code**:
  ```ts
  const { data: bySlug } = await admin
    .from("collectives")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();

  if (bySlug) {
    return { status: "taken", reason: "slug", conflictingName: bySlug.name };
  }

  const { data: byName } = await admin
    .from("collectives")
    .ilike("name", name)
    .maybeSingle();
  ```
- **Why it's wrong**: Both Supabase calls are outside any try/catch. A network timeout or DB error throws an unhandled exception from this server action, surfacing a raw error boundary instead of the typed `{ status: "error"; reason: string }` return the caller expects.
- **Fix approach**: Wrap the function body from line 29 onward in `try { … } catch (err) { console.error("[checkCollectiveNameAvailability]", err); return { status: "error", reason: "Something went wrong" }; }`.

---

## Issue 5 — `createPromoCode` accepts unbounded `maxUses` and unvalidated `expiresAt` date string
- **Severity**: medium
- **File**: `src/app/actions/promo-codes.ts:80,144-153`
- **Offending code**:
  ```ts
  // TODO(audit): bound maxUses 1-100000, validate expiresAt as real date
  export async function createPromoCode(input: {
    maxUses?: number | null;
    expiresAt?: string | null;
  }) {
    // ...
    const { error } = await supabase.from("promo_codes").insert({
      max_uses: input.maxUses ?? null,
      valid_until: input.expiresAt ?? null,
  ```
- **Why it's wrong**: `maxUses` can be 0 or negative (the claim logic `current_uses < max_uses` breaks for non-positive values). `expiresAt` accepts any arbitrary string — an invalid date like `"not-a-date"` stored in `valid_until` corrupts promo expiry comparisons in the checkout flow.
- **Fix approach**: Validate `maxUses` is either `null` or integer in `[1, 100_000]`; validate `expiresAt` with `!isNaN(Date.parse(input.expiresAt))` and reject past dates.

---

## Issue 6 — `addGuest` stores uncapped name, unvalidated email/phone, and unbounded `plusOnes`
- **Severity**: medium
- **File**: `src/app/actions/guest-list.ts:68,89-96`
- **Offending code**:
  ```ts
  // TODO(audit): add name length cap, email format, phone format, plusOnes bounds 0-20
  const { error } = await supabase.from("guest_list").insert({
    name: input.name.trim(),
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    plus_ones: input.plusOnes ?? 0,
  ```
- **Why it's wrong**: `name` has no length cap (unlimited text to DB); `email` stored without format check means malformed emails break subsequent send-campaign logic; `plusOnes` has no upper bound — a value of `9999` could misrepresent event capacity.
- **Fix approach**: Add `if (input.name.length > 200) return { error: "Name too long" }`, email regex check `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`, and `if ((input.plusOnes ?? 0) < 0 || (input.plusOnes ?? 0) > 20) return { error: "Plus-ones must be 0–20" }`.

---

## Issue 7 — `createEventTask` and `updateEventTask` write unvalidated enum fields and unverified UUID
- **Severity**: medium
- **File**: `src/app/actions/tasks.ts:197,222-232`
- **Offending code**:
  ```ts
  // TODO(audit): validate priority/category enums, UUID-validate assignedTo
  await admin.from("event_tasks").insert({
    priority: input.priority || "medium",
    assigned_to: input.assignedTo || null,
    metadata: { created_by: user.id, category: input.category || "general" },
  });
  ```
- **Why it's wrong**: `priority` and `category` are passed raw without enum checks — if the DB has a CHECK constraint, invalid values produce opaque 400 errors rather than a client-friendly message. `assignedTo` accepts any string as a UUID without `isValidUUID()`, risking FK violations or PostgREST errors.
- **Fix approach**: Validate `priority` against `["low","medium","high","urgent"]`, validate `category` against its enum, and add `if (input.assignedTo && !isValidUUID(input.assignedTo)) return { error: "Invalid assignee ID" }`.

---

## Issue 8 — `createCollective` stores `slug` without regex enforcement and `website` without URL validation
- **Severity**: medium
- **File**: `src/app/actions/auth.ts:253,272-274,347-351`
- **Offending code**:
  ```ts
  // TODO(audit): enforce slug regex /^[a-z0-9][a-z0-9-]{1,79}$/, sanitize instagram/website, trim description
  if (formData.slug.length > 100) {
    return { error: "Slug must be 100 characters or fewer." };
  }
  // ...
  await admin.from("collectives").insert({
    slug: formData.slug,
    website: formData.website,
  ```
- **Why it's wrong**: `slug` is length-checked only; values like `"  MY SLUG!!"` or `"--bad--"` pass and produce broken URL routing. `website` is stored without protocol enforcement — a `javascript:alert(1)` URI could be stored and later rendered as a link in collective profiles.
- **Fix approach**: Add `if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(formData.slug)) return { error: "Invalid slug format" };`; validate `website` with `new URL(formData.website).protocol === "https:"` (same pattern as `external-events.ts:44-51`).

---

## Issue 9 — CSV export in `exportAttendeesCSV` does not escape formula-injection characters
- **Severity**: medium
- **File**: `src/app/actions/attendees.ts:313-317`
- **Offending code**:
  ```ts
  // TODO(audit): prefix CSV cells starting with =/+/-/@ to prevent Excel formula injection
  function csvSafe(field: string): string {
    const escaped = field.replace(/"/g, '""');
    return `"${escaped}"`;
  }
  ```
- **Why it's wrong**: Attendee names/emails starting with `=`, `+`, `-`, or `@` trigger formula execution when admins open the exported CSV in Excel or Google Sheets — a supply-chain risk if an attendee deliberately registers with a formula-prefix name.
- **Fix approach**: Prefix dangerous-first-char fields: `const safe = /^[=+\-@]/.test(field) ? "'" + field : field;` before the double-quote escape step.

---

## Issue 10 — `addExternalEvent` and `saveExternalTicketData` missing length caps and weak validation
- **Severity**: low
- **File**: `src/app/actions/external-events.ts:27,57-66` and `src/app/actions/external-tickets.ts:15,26-32`
- **Offending code**:
  ```ts
  // TODO(audit): add length caps, eventDate ISO validation, platform enum, ticketsSold/revenue bounds
  await admin.from("external_events").insert({
    title: data.title,        // no length cap
    event_date: data.eventDate || null,  // not ISO-validated
    venue_name: data.venueName || null,  // no length cap
  ```
- **Why it's wrong**: `title` and `venueName` have no length caps before DB insert; `eventDate` is not validated as ISO 8601 (an invalid string in `event_date` can break any date-based sorting). In `external-tickets.ts`, `ticketUrl` is checked with `startsWith("https://")` only — not a full URL parse — allowing malformed strings through.
- **Fix approach**: Add `if (data.title.length > 200)` cap; validate `data.eventDate` with `isNaN(Date.parse(…))`; add `venueName` length cap at 200; replace `startsWith` with `new URL(data.ticketUrl)` parse in `external-tickets.ts`.

---

## Issue 11 — `markSettlementPaid` `payoutMethod` not validated against allowed enum
- **Severity**: low
- **File**: `src/app/actions/payouts.ts:7,60`
- **Offending code**:
  ```ts
  // TODO(audit): validate payoutMethod against enum ["etransfer","venmo","cashapp","wire","paypal","manual","other"]
  if (payoutMethod && (typeof payoutMethod !== "string" || payoutMethod.length > 100)) {
    return { error: "Invalid payout method" };
  }
  // ...
  metadata: { payout_method: payoutMethod || "manual", … }
  ```
- **Why it's wrong**: Any string under 100 chars is written to `metadata.payout_method`. Admin dashboards and reporting logic that switch on this value will encounter unexpected strings.
- **Fix approach**: `const VALID_METHODS = ["etransfer","venmo","cashapp","wire","paypal","manual","other"]; if (payoutMethod && !VALID_METHODS.includes(payoutMethod)) return { error: "Invalid payout method" };`

---

## Issue 12 — `POST /api/generate-poster` accepts arbitrary client-supplied prompt, bypassing server-side generator
- **Severity**: low
- **File**: `src/app/api/generate-poster/route.ts:67,76-82`
- **Offending code**:
  ```ts
  // TODO(audit): client sends arbitrary prompt bypassing server-side generatePosterPrompt.
  // Require HMAC-signed prompt or regenerate server-side.
  const body = await request.json();
  prompt = body.prompt;
  // ...
  if (typeof prompt !== "string" || prompt.length > 2000) {
    return NextResponse.json({ error: "Invalid or too-long prompt (max 2000 chars)" }, { status: 400 });
  }
  ```
- **Why it's wrong**: The `generatePosterPrompt` server action exists to produce constrained, brand-safe prompts from structured event data. This endpoint lets authenticated users send arbitrary 2000-char strings directly to Replicate, enabling content policy violations and prompt injection attempts.
- **Fix approach**: Accept `eventId` from the client; call `generatePosterPrompt(eventId)` server-side to produce the prompt; remove the client-controlled `prompt` parameter entirely.

---

## Issue 13 — Four files use inline PostgREST sanitizer instead of shared `sanitizePostgRESTInput()`
- **Severity**: low
- **File**: `src/app/actions/marketplace.ts:273`, `src/app/actions/collab.ts:35`, `src/app/actions/chat-members.ts:353`, `src/app/actions/discover-collectives.ts:76`
- **Offending code** (representative — `collab.ts:35`):
  ```ts
  // TODO(audit): replace inline sanitizer with shared sanitizePostgRESTInput() from @/lib/utils
  const sanitized = query
    .replace(/\\/g, "")
    .replace(/[%_.,()'"`]/g, "")
    .trim();
  ```
- **Why it's wrong**: Each file implements its own PostgREST injection sanitizer with slightly different character sets and no consistent length cap. A fix to the canonical `sanitizePostgRESTInput()` from `@/lib/utils` doesn't propagate to these four call sites.
- **Fix approach**: Import `sanitizePostgRESTInput` from `@/lib/utils` in all four files; delete local implementations; add `.slice(0, 100)` cap before passing any user query to DB filter.

---

## Protected-path notes (AUDIT ONLY — midday must NOT edit)
- `src/app/api/create-payment-intent/route.ts:15-17` — rate limit is per-IP only; a per-email limit would prevent card-testing via IP rotation. Issue is real but this path is protected. Midday must add this to `protected-paths-todo.md` and skip the fix.
