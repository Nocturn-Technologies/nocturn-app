# Day 3 audit — Server action + API route error handling
_Generated 2026-04-15T07:00:00Z_

## Issue 1 — Conditional auth check silently skipped in `ai-email.ts`
- **Severity**: critical
- **File**: `src/app/actions/ai-email.ts:48`
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
- **Why it's wrong**: If `evForCol?.collective_id` is nullish for any reason (DB error, race condition, data corruption), the entire ownership check is silently skipped and any authenticated user can generate an AI email for any event. The same `if (colId)` pattern is repeated in `generatePromoEmail` at line ~199. The first query already fetches `*` with a join, so `collective_id` is available there — a second query is unnecessary and introduces this conditional guard.
- **Fix approach**: Remove the redundant second query; extract `collective_id` from the already-fetched event row (the first `admin.from("events")...` call already selects `*`); make the auth check unconditional — if `collective_id` is missing, return `{ error: "Not authorized" }` rather than continuing.

---

## Issue 2 — `addChannelMember` inserts unvalidated role string
- **Severity**: high
- **File**: `src/app/actions/chat-members.ts:162`
- **Offending code**:
  ```ts
  export async function addChannelMember(
    channelId: string,
    userId: string,
    role: string = "member"   // ← no enum validation
  ): Promise<{ error: string | null }> {
    // ... ownership check passes, then:
    const { error: insertError } = await sb
      .from("channel_members")
      .insert({ channel_id: channelId, user_id: userId, role });
  ```
- **Why it's wrong**: Any caller with admin/promoter membership can insert an arbitrary string as `role` (e.g., `"owner"`, `"superadmin"`, `"__proto__"`), potentially breaking downstream role-based access control on channels.
- **Fix approach**: Validate `role` against an allowlist `["member", "admin"]` before the insert; return `{ error: "Invalid role" }` if it doesn't match.

---

## Issue 3 — `generate-poster` accepts arbitrary client-supplied prompt, bypassing server-side prompt generator
- **Severity**: high
- **File**: `src/app/api/generate-poster/route.ts:67`
- **Offending code**:
  ```ts
  // TODO(audit): client sends arbitrary prompt bypassing server-side generatePosterPrompt.
  // Require HMAC-signed prompt or regenerate server-side.
  let prompt: string;
  try {
    const body = await request.json();
    prompt = body.prompt;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  // ...
  if (typeof prompt !== "string" || prompt.length > 2000) {
    return NextResponse.json({ error: "Invalid or too-long prompt" }, { status: 400 });
  }
  ```
- **Why it's wrong**: The server-side `generatePosterPrompt` in `ai-poster.ts` exists to produce a constrained, brand-safe prompt from structured event data; bypassing it lets authenticated users pass arbitrary strings (up to 2000 chars) directly to the Replicate image generation service, enabling content policy violations and prompt injection.
- **Fix approach**: Accept `eventId` from the client instead of `prompt`; call `generatePosterPrompt(eventId)` server-side to produce the prompt, then pass that to Replicate. If the caller needs a custom prompt, require it to be generated and HMAC-signed by `generatePosterPrompt` first.

---

## Issue 4 — `searchInvitableUsers` uses ad-hoc inline sanitizer instead of shared `sanitizePostgRESTInput`
- **Severity**: medium
- **File**: `src/app/actions/chat-members.ts:353`
- **Offending code**:
  ```ts
  // TODO(audit): replace inline sanitizer with shared sanitizePostgRESTInput() from @/lib/utils + length cap
  const sanitized = query
    .replace(/\\/g, "")
    .replace(/[%_.,()'"`]/g, "")
    .trim();
  if (sanitized) {
    const escaped = sanitized
      .replace(/\\/g, "\\\\")
      .replace(/%/g, "\\%")
      .replace(/_/g, "\\_");
    teamQuery = teamQuery.or(
      `users.full_name.ilike.%${escaped}%,users.email.ilike.%${escaped}%`
    );
  }
  ```
- **Why it's wrong**: The project's canonical pattern is `sanitizePostgRESTInput()` from `@/lib/utils`; having a second ad-hoc sanitizer risks diverging behavior (missed characters, different escaping logic). Additionally no length cap is applied to `query` before sanitization — a very long query string passes through.
- **Fix approach**: Replace both occurrences of the inline sanitizer in this function with `sanitizePostgRESTInput(query)` from `@/lib/utils`; add `query.slice(0, 100)` cap before passing to any DB filter.

---

## Issue 5 — `createPromoCode` missing upper-bound validation on `maxUses` and date validation on `expiresAt`
- **Severity**: medium
- **File**: `src/app/actions/promo-codes.ts:80`
- **Offending code**:
  ```ts
  // TODO(audit): bound maxUses 1-100000, validate expiresAt as real date
  export async function createPromoCode(input: {
    // ...
    maxUses?: number | null;        // ← no upper bound
    expiresAt?: string | null;      // ← not validated as real ISO date
  }) {
    // ...
    const { error } = await supabase.from("promo_codes").insert({
      max_uses: input.maxUses ?? null,
      valid_until: input.expiresAt ?? null,
    });
  ```
- **Why it's wrong**: `maxUses` accepts `Number.MAX_SAFE_INTEGER` or negative numbers (despite discount value checks, `maxUses` has none), which could produce misleading "unlimited" behavior or DB constraint errors; `expiresAt` is not validated as a real ISO date — passing e.g. `"not-a-date"` inserts garbage into `valid_until`, which is then used in comparisons.
- **Fix approach**: Validate `maxUses` is either `null` or an integer in `[1, 100_000]`; validate `expiresAt` with `!isNaN(Date.parse(input.expiresAt))` and reject if it's in the past or > 2 years out.

---

## Issue 6 — `create-payment-intent` rate limit is per-IP only, vulnerable to IP rotation for card testing
- **Severity**: medium
- **File**: `src/app/api/create-payment-intent/route.ts:16`
- **Offending code**:
  ```ts
  // TODO(audit): rate limit is per-IP only; add per-email limit to prevent card-testing via IP rotation
  const clientIp = request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { success } = await rateLimitStrict(`payment-intent:${clientIp}`, 10, 60000); // 10 requests per minute
  if (!success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again in a moment." },
      { status: 429 }
    );
  }
  ```
- **Why it's wrong**: Per-IP rate limiting is trivially bypassed by rotating IPs (residential proxies, VPNs). Card-testing attacks typically try many cards against the same email address, so an additional `payment-intent:email:${buyerEmail}` rate limit (e.g., 5 per 5 minutes) would provide meaningful protection at low false-positive cost.
- **Fix approach**: Add a second `rateLimitStrict` call keyed on `payment-intent:email:${buyerEmail}` with a tighter window (e.g., 5 requests per 5 minutes) after the IP check; both checks must pass.

---

## Issue 7 — `cleanup-pending-tickets` cron has no audit log for successful runs
- **Severity**: low
- **File**: `src/app/api/cron/cleanup-pending-tickets/route.ts:19`
- **Offending code**:
  ```ts
  // TODO(audit): log successful auth for audit trail
  const authHeader = request.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) { /* ... */ }
  if (!safeCompare(authHeader, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // (no log that a successful run started or completed)
  ```
- **Why it's wrong**: Without a log entry for successful auth and completion, there's no reliable way to verify the cron is running on schedule or to audit that capacity cleanup is happening as expected during an incident.
- **Fix approach**: Add a `console.info` log immediately after successful auth (`[cleanup-pending-tickets] cron triggered at ${new Date().toISOString()}`) and log the final `cleaned` count regardless of whether it's zero.

---

## Issue 8 — `tier-availability` endpoint has no per-session binding; any origin-allowed client can poll capacity for any event
- **Severity**: low
- **File**: `src/app/api/tier-availability/route.ts:65`
- **Offending code**:
  ```ts
  // TODO(audit): consider a short-lived HMAC token issued by the event page
  // for stronger binding to a specific checkout session.
  export async function GET(request: NextRequest) {
    // Rate limit + origin check only:
    const { success } = await rateLimitStrict(`tier-availability:${ip}`, 60, 60_000);
    if (!isAllowedOrigin(request)) { /* ... */ }
    // Any eventId from an allowed origin is accepted:
    const eventId = request.nextUrl.searchParams.get("eventId");
  ```
- **Why it's wrong**: An authenticated user on the app can poll capacity counts for any event (including competitors') at 60 req/min, enabling inventory monitoring. The endpoint is intentionally semi-public but a checkout-session-bound token would make scraping substantially harder.
- **Fix approach**: Issue a short-lived HMAC-signed token (e.g., `sha256(eventId + sessionId + timestamp, CHECKOUT_SECRET)`) from the event page load and require it on the tier-availability request; this makes bulk cross-event scraping impractical without first visiting each event page.
