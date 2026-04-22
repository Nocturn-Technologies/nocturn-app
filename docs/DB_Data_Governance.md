# Nocturn — Database Data Governance

> This document defines the rules for how data is structured, stored, and computed in Nocturn. Every engineer adding to the schema should read Part 1 before touching a migration. Part 2 is the reference for the current schema.

---

## Part 1 — Governance Principles

### 1. The Three-Tier Model

Every table belongs to exactly one tier. The tier determines its mutability rules, deletion policy, RLS pattern, and index strategy. Declaring the tier is the first decision when adding a table.

| Tier | What it stores | Examples | Key rule |
|---|---|---|---|
| **Master** | Real-world entities — one record per person, place, or org | `parties`, `artist_profiles`, `venue_profiles` | Permanent. Never hard-deleted. |
| **Config** | Rules and offerings set by operators for a context | `events`, `ticket_tiers`, `promo_codes`, `channels` | Mutable until activity begins. Frozen once transactional rows reference it. |
| **Transactional** | Immutable records of what happened | `orders`, `tickets`, `ticket_events`, `payment_events` | Append-only. No UPDATE. No DELETE. Ever. |

---

### 2. New Table vs. New Column — Decision Flow

Work through these questions in order before touching the schema:

1. **Can an existing table support this with a new column or query?** → Stop. Use it.
2. **Is this a new kind of real-world person, org, or venue?** → `parties` + `party_roles`. No new identity table.
3. **Is this a new way to contact or reach a person?** → `party_contact_methods`. No new contact column on any other table.
4. **Does one parent record need many of these?** (contact methods, line items, log entries) → New table with FK back to parent.
5. **Is this recording something that happened?** (a purchase, a state change, a redemption) → New append-only transactional table.
6. **Is this a setting or rule for an event, tier, or collective?** → New column on an existing config table.
7. **Is this a derived or computed value?** → Don't store it. See Section 4.

---

### 3. Identity Rules

These are non-negotiable. Violating them creates duplicate identity records that are expensive to untangle.

- Every person, organization, and venue in the system has exactly **one `parties` row**
- New roles (door staff, bartender, silent partner, booking agent) → new row in `party_roles`, not a new table
- New contact channels (TikTok, WhatsApp, Bandcamp) → new row in `party_contact_methods`, not a new column anywhere
- Cross-collective access → add a `party_roles` row for that collective. Never create a second user record or a second party record.
- `channels.collective_id` is intentionally nullable — a null value means platform-level or cross-collective. Do not alter it to NOT NULL.

---

### 4. Where to Compute — Three Options

Not all computation belongs in the same layer. Choose based on data volume, read frequency, and how often the underlying logic changes.

| Option | When to use | Examples |
|---|---|---|
| **Store in DB** | The value is read on every list-view row, aggregated from many records, and expensive to recompute per request | `attendee_profiles.total_spend`, `attendee_profiles.total_tickets` — pre-aggregated on each purchase so CRM list views scan one row, not thousands of orders |
| **Compute server-side** | The value aggregates many rows but doesn't need to persist — calculate once per request in a server action or SSR page | Event P&L (sum orders + sum expenses), financial pulse dashboard, analytics summaries — runs at request time, not stored |
| **Compute in app** | The value is derived from data already in memory — lightweight math or display formatting | Sell-through % (sold ÷ capacity), currency formatting, time-ago display, progress bar widths |

**Rules:**
- Never store a value the app already has in memory and can compute instantly
- Never compute server-side what should be pre-aggregated (e.g. scanning every order row on every CRM page load)
- Never add a DB column for a value that changes whenever business rules change — those belong in the server layer
- When in doubt: store the facts, compute the insight server-side, format the display in the app

---

### 5. Immutability

Transactional data is a ledger. Treat it like one.

- Transactional tables are write-once. Never UPDATE or DELETE a row after it is created.
- `ticket_events`, `event_status_log`, `promo_code_usage`, and `payment_events` are audit records. They may be needed for disputes, chargebacks, and reconciliation — never modify them.
- `orders` and `settlements` are immutable after creation. The `status` column is the only field that changes, and only via controlled server actions, never direct DB writes.
- If a record was written incorrectly, write a correcting row. Never edit the original.

---

### 6. Deletion Policy

| Table type | Policy |
|---|---|
| `parties` | Never deleted — permanent identity |
| Profile tables (`artist_profiles`, `collective_members`) | Soft delete via `deleted_at` |
| Config tables with transactional references (`events`, `ticket_tiers`) | Soft delete only — hard delete blocked if orders or tickets exist |
| Config tables with no transactional references | Hard delete is acceptable |
| All transactional tables | Never deleted |

---

### 7. New Table Checklist

Before merging any migration that creates a table:

- [ ] Tier declared in a comment at the top of the table definition (master / config / transactional)
- [ ] RLS enabled with at least one policy written
- [ ] `created_at TIMESTAMPTZ NOT NULL DEFAULT now()` present
- [ ] Index on every FK column
- [ ] Status and type columns use enum types, not freetext strings
- [ ] `deleted_at` only if the tier requires soft delete
- [ ] Rollback script committed alongside the migration in `supabase/migrations/`

---

### 8. Migration Safety Rules

- **Two-step drops:** Never drop a column in the same migration that adds its replacement. Ship the addition, verify in prod, then drop in a follow-up migration.
- **No in-place type changes:** Never ALTER a column type on a live transactional table. Add a new column, migrate the data, then drop the old column.
- **Always ship a rollback:** Every destructive migration must have a matching rollback file.
- **QA before prod:** QA receives every migration first. No exceptions. The QA Supabase project (vtkvhdaadobigtojmztg) is the gate.

---

### 9. Naming Conventions

| Thing | Convention | Example |
|---|---|---|
| Tables | `snake_case`, plural noun | `ticket_events`, `party_roles` |
| Timestamps | `_at` suffix | `created_at`, `occurred_at`, `deleted_at` |
| Foreign keys | `<singular>_id` or semantic variant | `party_id`, `holder_party_id`, `venue_party_id` |
| Enum types | singular noun | `party_type`, `ticket_event_type` |
| Audit / log tables | `<entity>_events` or `<entity>_log` | `ticket_events`, `event_status_log` |
| Boolean flags | `is_` prefix | `is_active`, `is_verified` |
| Amount / money columns | dollars as `NUMERIC(10,2)` | `price`, `total`, `net_payout` |

---

## Part 2 — Current Schema Reference

> Live as of QA deployment — April 2026. Production Supabase: zvmslijvdkcnkrjjgaie. QA Supabase: vtkvhdaadobigtojmztg.

---

### A. Master Data

These tables represent real-world entities that exist independently of any event or transaction. They are permanent.

---

#### `parties`
The universal identity record. Every person, organization, and venue in the system has exactly one row here.

**Why it's designed this way:** A DJ who buys a ticket, performs at an event, and sends a DM is the same person — one `parties` row, multiple roles. Keeping identity separate from roles and profiles means the identity survives profile deletion, role changes, and collective membership changes.

| Column | Notes |
|---|---|
| `type` | `'person' \| 'organization' \| 'venue'` — enum enforced |
| `display_name` | The canonical human-readable name. Not nullable. |

**Important:** Never hard-delete a `parties` row. If someone leaves the platform, deactivate their profile — the identity record must remain for referential integrity on orders, tickets, and audit logs.

---

#### `party_contact_methods`
All contact channels and social links for any party, in one place.

**Why it's designed this way:** Contact information (Instagram, Spotify, email, phone) used to exist as individual columns scattered across multiple tables. Normalizing into one table means adding a new channel (e.g. TikTok) is a single INSERT with no schema change, and querying all contacts for a party is one join.

| Column | Notes |
|---|---|
| `type` | Enum: `'email' \| 'phone' \| 'instagram' \| 'soundcloud' \| 'spotify' \| 'website' \| 'twitter'` |
| `is_primary` | One primary per type per party |
| UNIQUE | `(party_id, type)` — one record per channel per party |

**Rule:** Never add a social or contact column to any other table. Always add a row here instead.

---

#### `party_roles`
Flexible role assignment — what a party is allowed to do and in what context.

**Why it's designed this way:** A person can be a platform user, an artist on two collectives, and a venue operator — all at once. Roles are rows, not columns. Adding a new role type (e.g. `'door_staff'`) is an enum addition, not a table change.

| Column | Notes |
|---|---|
| `role` | Enum: `'artist' \| 'collective' \| 'venue_operator' \| 'platform_user' \| 'contact'` |
| `collective_id` | Nullable — roles scoped to a collective set this; platform-wide roles leave it null |
| UNIQUE | `(party_id, role, collective_id)` — prevents duplicate role assignments |

**Cross-collective access pattern:** To give someone from an outside collective access to an event, add a `party_roles` row for them with the target collective's `collective_id`. No new tables, no duplicate user records.

---

#### `artist_profiles`
Rich metadata for parties with an artist role — bio, genre, booking info, portfolio.

**Why it's separate from `parties`:** A party can be both an artist and a venue operator. Separating profiles from identity allows a single person to have both an `artist_profiles` row and a `venue_profiles` row, linked via `party_id`.

| Column | Notes |
|---|---|
| `party_id` | UNIQUE — one artist profile per party |
| `deleted_at` | Soft delete — deactivating hides the profile but preserves the party identity |
| `is_active` | Filtered index on this column — active-only queries stay fast as catalog grows |
| `genre` | `TEXT[]` — GIN indexed for array containment queries |

---

#### `venue_profiles`
Rich metadata for parties with a venue_operator role — address, capacity, amenities.

Same pattern as `artist_profiles`. Linked to `parties` via `party_id`.

| Column | Notes |
|---|---|
| `party_id` | UNIQUE — one venue profile per party |
| `is_active` | Filtered index — active venue lookups stay fast |

---

### B. Configuration Data

These tables hold operator-defined rules and offerings. They are mutable until transactional data (orders, tickets) references them — after that point they should be treated as frozen.

---

#### `collectives`
The top-level organizational unit. Everything in the app is scoped to a collective.

| Column | Notes |
|---|---|
| `party_id` | FK to parties — the collective itself has an identity record |
| `slug` | URL-safe identifier, unique |

---

#### `events`
The central config object for a night. Defines what's happening, when, where, and at what capacity.

**Key design note — flat venue columns:** Venue information (`venue_name`, `venue_address`, `city`) is stored directly on the event row as flat columns, not as a foreign key to a venues table. This means the most common read path (listing events, loading event detail) requires no join. If a venue record changes after an event is published, the event still reflects what was true when it was set.

| Column | Notes |
|---|---|
| `venue_name`, `venue_address`, `city` | Flat — no venues join needed |
| `starts_at`, `ends_at`, `doors_at` | All TIMESTAMPTZ — never use `date` or `time` types |
| `status` | Enum: `'draft' \| 'published' \| 'cancelled' \| 'completed'` |
| `flyer_url` | Not `cover_image_url` — use this exact column name |

---

#### `ticket_tiers`
Defines a ticket type for an event — name, price, capacity.

| Column | Notes |
|---|---|
| `price` | `NUMERIC(10,2)` in dollars — not cents |
| `capacity` | Nullable — null means unlimited |

**Important:** Never insert directly into `tickets` based on a tier. Always go through `fulfill_tickets_atomic` — it handles capacity reservation atomically.

---

#### `promo_codes`
Defines discount rules for an event — percentage, fixed amount, or free. Stores rules only.

**Key design note:** `promo_codes` does not track how many times a code has been used. Usage is tracked in `promo_code_usage` (transactional tier). Query that table for redemption counts. The `claim_promo_code` RPC validates quota automatically.

---

#### `channels`
Messaging channels — both collective group channels and direct cross-collective channels.

| Column | Notes |
|---|---|
| `collective_id` | **Nullable by design.** Null = direct channel or platform-level channel. Do not make this NOT NULL. |
| `type` | `'collective' \| 'event' \| 'direct'` |

**Cross-collective chat pattern:** A direct channel between two collectives has `collective_id = null` and both parties as `channel_members` rows. No new infrastructure needed.

---

### C. Transactional Data

These tables are append-only ledgers. Every row represents something that happened. No row is ever updated or deleted after creation.

---

#### `orders`
The canonical purchase record. Created at checkout, updated only via `status` changes.

**Purchase flow:** `orders` → `order_lines` → `tickets`. This is the only valid path. There is no direct ticket insert.

| Column | Notes |
|---|---|
| `party_id` | The buyer's identity |
| `stripe_payment_intent_id` | Single source of truth for linking to Stripe |
| `status` | `'pending' \| 'paid' \| 'failed' \| 'refunded' \| 'partially_refunded'` |
| `total` | Dollars — includes platform fee and Stripe fee |

---

#### `order_lines`
Line items within an order — one row per ticket tier per order.

| Column | Notes |
|---|---|
| `refunded_quantity` | Tracks partial refunds at the line level |

---

#### `tickets`
Issued access rights — one row per ticket issued.

| Column | Notes |
|---|---|
| `holder_party_id` | Current ticket holder — updated on transfer |
| `status` | `'valid' \| 'checked_in' \| 'refunded' \| 'voided'` — never `'paid'` |
| `qr_code` | UUID generated at fulfillment — unique |

**Important:** `tickets.status` reflects the most recent `ticket_events` entry. Always write to `ticket_events` when changing status — do not update `tickets.status` directly without a corresponding event log row.

---

#### `ticket_events`
Immutable lifecycle log for every ticket. One row per state change.

| `event_type` | When written |
|---|---|
| `'purchased'` | At checkout fulfillment |
| `'transferred'` | When `holder_party_id` changes |
| `'checked_in'` | At door scan |
| `'refunded'` | On refund |
| `'voided'` | When manually voided by staff |

**This table is the audit trail.** Never modify a row. If you need to reverse an action, write a correcting event row.

Index: `(ticket_id, occurred_at)` — composite index supports chronological lifecycle queries efficiently.

---

#### `payment_events`
Raw Stripe webhook log. One row per webhook delivery. Also serves as the deduplication gate for the Stripe webhook handler.

| Column | Notes |
|---|---|
| `stripe_event_id` | UNIQUE — used for INSERT-first dedup at the webhook handler entrance. If a 23505 conflict is returned, the event is a Stripe retry and is skipped. |
| `is_processed` | Set to `true` after the event has been fully handled. |
| `processed_at` | Timestamp of successful processing. |

**Dedup pattern:** The webhook handler inserts a minimal row (stripe_event_id + event_type) at the start. After successful processing, `logStripePaymentEvent` upserts the full row (amount, order_id, etc.) and sets `is_processed = true`. This replaced the former `webhook_events` table.

**Never add a second row for a stripe_event_id.** Use upsert with `onConflict: 'stripe_event_id'` when enriching an existing row.

---

#### `promo_code_usage`
One row per promo code redemption, linked to the exact ticket.

**Why it exists:** Usage is an event (something that happened), not a property of the code. Storing it here instead of as a counter on `promo_codes` makes double-redemption physically impossible — the `UNIQUE(promo_code_id, ticket_id)` constraint prevents the same promo from being applied to the same ticket twice, even under concurrent requests.

---

#### `event_status_log`
Audit trail for every event status change — draft, published, cancelled, completed.

Index: `(event_id, occurred_at)` — supports chronological history queries.

---

#### `settlements`, `settlement_lines`, `payouts`
Financial management layer. Settlements aggregate revenue and costs for a completed event. Payouts record when funds were disbursed.

| Column | Notes |
|---|---|
| `total_revenue` | Gross ticket revenue collected |
| `stripe_fee` | Stripe processing fees |
| `net_payout` | What the collective receives — computed at settlement time, stored here |

**Note on `net_payout`:** This is one of the few derived values stored in the DB. It is stored because it represents a financial commitment made at a specific point in time — it should not change if fee logic changes later.

---

### D. Supporting Tables

| Table | Tier | Purpose |
|---|---|---|
| `attendee_profiles` | Supporting | Per-collective engagement record for a party. Stores pre-aggregated `total_spend`, `total_tickets`, `total_events` — updated on each purchase so CRM list views are fast. |
| `event_analytics` | Supporting | Aggregated event page metrics (views, unique visitors, conversion). Incremented via RPC, never computed at read time. |
| `event_expenses` | Config | Itemized costs for an event (artist fees, venue fee, etc.). Source data for server-side P&L computation. |
| `event_tasks` | Config | Checklist items for an event. |
| `guest_list` | Config | Manual guest additions outside the ticket flow. |
| `recordings` | Config | Voice memos and call recordings — stored in Supabase Storage, metadata here. |
| `rate_limits` | Supporting | Per-key rate limit windows. UNIQUE on `key`. Use upsert — never INSERT directly. |
| `audit_logs` | Transactional | Platform-level action audit trail (admin actions, access events). |
| `invitations` | Config | Team member invitations to collectives. |
| `saved_venues` | Config | Collective's saved venue references — links to `venue_profiles` via `venue_party_id`. |
| `messages` | Transactional | Individual messages within a channel. |
| `channel_members` | Config | Junction table — who belongs to a channel. |
| `ticket_waitlist` | Transactional | Waitlist entries for sold-out tiers. |

---

### E. Transitional Tables

These tables exist during the migration from the legacy schema to the new `parties`-based model. They are still the primary auth and access control mechanism — do not remove them until the migration is complete.

---

#### `users`
The Supabase auth user record. Still the primary identity table for authenticated sessions.

**Transitional status:** The `parties` model is the target. `users.party_id` is already populated — this is the FK that links a logged-in user to their `parties` row. When the migration is complete, auth lookups will go directly to `parties`. Until then, all RLS policies and server actions use `users.id` as the auth principal.

| Column | Notes |
|---|---|
| `party_id` | FK to `parties` — already populated for all users |
| `collective_id` | The user's primary collective scope |
| `is_approved` | Approval gate — false blocks dashboard access |

**Rule:** Never hard-delete a `users` row. Deactivate via `is_approved = false`.

---

#### `collective_members`
Junction table — which users belong to which collective and in what role.

**Transitional status:** This is the current equivalent of `party_roles` scoped to collectives. The `party_id` column is populated alongside `user_id`. When all auth is migrated to `parties`, this table will be superseded by `party_roles`. Until then, all collective-scoped access checks query this table.

| Column | Notes |
|---|---|
| `user_id` | FK to `users` — primary auth key |
| `party_id` | FK to `parties` — populated, used in the new model |
| `collective_id` | The collective being scoped to |
| `role` | `'owner' \| 'admin' \| 'member'` |
| `deleted_at` | Soft delete — removed members retain their row |

**RLS:** This table is the gate for collective-scoped row access. Do not drop it until `party_roles` is the verified auth source.

---

### F. Event-Scoped Config & Activity Tables

---

#### `event_activity`
General-purpose activity feed for an event. Stores updates, task completions, playbook steps, and operator-posted notes.

**Important distinction from `ticket_events` and `event_status_log`:** Those tables are strict immutable audit trails. `event_activity` is a human-readable feed — rows can be edited or deleted by the operator who created them (e.g. editing an event update post). Do not use `event_activity` for financial or compliance audit purposes.

| Column | Notes |
|---|---|
| `action` | Free-text action string: `'update'`, `'task_complete'`, `'playbook_step'`, etc. |
| `metadata` | JSONB — stores supporting context (task title, changed field, etc.) |
| `party_id` | The party who triggered the action (nullable for system actions) |

---

#### `event_artists`
The lineup for an event — one row per artist/performer booking.

**Tier: Config.** Frozen once the event is completed. Artist data here (name, fee, set_time) is copied from `artist_profiles` at booking time so historical event records survive profile changes.

| Column | Notes |
|---|---|
| `party_id` | FK to `parties` — nullable if artist is not a platform user |
| `name` | Denormalized from profile at booking time |
| `fee` | `NUMERIC(10,2)` in dollars — source data for P&L |
| `set_time` | Free-text (e.g. `"11pm–1am"`) |
| `sort_order` | Controls display order on lineup page |

---

#### `event_cards`
Shareable event card content — pre-rendered tiles used for social sharing previews and in-app event cards.

**Tier: Config.** One or more cards per event, each with a `type` and a `content` JSONB blob. Cards are regenerated when event details change.

| Column | Notes |
|---|---|
| `type` | Card type: `'share'`, `'lineup'`, `'promo'`, etc. |
| `content` | JSONB — card-type-specific fields (title, image URL, ticket URL, etc.) |
| `sort_order` | Display priority |

---

#### `external_events`
Scraped or imported events from external sources (RA, Posh, Eventbrite, etc.) used for calendar intelligence and competitive pricing analysis.

**Tier: Config.** Read-only data from external scrapers. Never modified after import. Used by the pricing suggestion and calendar heat map features.

| Column | Notes |
|---|---|
| `source` | Origin system: `'ra'`, `'posh'`, `'eventbrite'`, etc. |
| `source_url` | Canonical URL of the original listing |
| `ticket_price` | `NUMERIC(10,2)` — used for market pricing comparisons |
| `scraped_at` | When this record was last pulled |
| `collective_id` | The collective this competitive intel is scoped to |

---

### G. Marketing & Email Tables

---

#### `email_campaigns`
A record of every email campaign sent to event attendees.

**Tier: Transactional.** Append-only. Each row captures what was sent (`subject`, `body`), to how many recipients (`sent_to`), and when. Used to prevent duplicate sends and to audit what attendees received.

| Column | Notes |
|---|---|
| `event_id` | The event this campaign is scoped to |
| `sent_to` | Count of recipients at send time — not recomputed |
| `sent_at` | Timestamp of delivery |
| `created_by` | FK to `users` — the operator who triggered the send |

---

### H. Playbook Tables

---

#### `playbook_templates`
Reusable event playbook templates that operators can apply when creating a new event.

**Tier: Config.** `is_global = true` means the template is available to all collectives (platform-defined). `is_global = false` means it is collective-specific.

---

#### `playbook_task_templates`
Individual task definitions within a `playbook_templates` row.

**Tier: Config.** One row per task. `due_offset` is the number of days before the event the task should be completed (negative = before event, positive = after).

| Column | Notes |
|---|---|
| `template_id` | FK to `playbook_templates` |
| `due_offset` | Days relative to `events.starts_at` — used to auto-populate `event_tasks.due_at` |
| `sort_order` | Controls task order within the playbook |

---

### I. Promo & Attribution Tables

---

#### `promo_links`
Shareable promo links with unique short codes, used for attribution and click tracking.

**Tier: Config.** One row per promo campaign. The `clicks` column is an incrementing counter (updated by the `increment_promo_click` RPC). Individual click events are recorded in `promo_clicks` for detailed attribution.

| Column | Notes |
|---|---|
| `code` | Short unique token — resolved via `/go/[code]` |
| `clicks` | Running total — do not sum `promo_clicks` rows for this value, read `clicks` directly |
| `created_by` | FK to `users` |

---

#### `promo_clicks`
Individual click events for promo links — one row per visit to a `/go/[code]` URL.

**Tier: Transactional.** Append-only. Stores `referrer` and `user_agent` for attribution analysis beyond the counter on `promo_links`.

| Column | Notes |
|---|---|
| `promo_link_id` | FK to `promo_links` |
| `referrer` | HTTP Referer header — nullable |
| `user_agent` | Browser/device string — nullable |

---

### J. Platform Waitlist

---

#### `waitlist_entries`
Pre-signup entries for collectives waiting for platform access. Exists before a `users` record is created.

**Tier: Master.** Never deleted. If a waitlist entry converts to a user, the `users` row is created independently — no automatic FK link. Used by the founder dashboard to track platform growth pipeline.

| Column | Notes |
|---|---|
| `email` | Contact email — not unique (same person may submit twice) |
| `referral` | Free-text referral source (e.g. `"instagram"`, `"word of mouth"`) |

---

### K. Key Database Functions

These RPCs exist because the operations they perform must be atomic — they cannot be safely replicated with multiple sequential queries from the application layer. **Do not bypass them.**

---

#### `fulfill_tickets_atomic(tier_id, order_line_id, quantity, holder_party_id, event_id)`
**The only correct way to issue tickets.** Acquires an advisory lock on the tier, checks remaining capacity, inserts ticket rows, and returns them — all in a single transaction.

- **Never** insert directly into `tickets`
- **Never** call `check_and_reserve_capacity` standalone — use this function
- Returns `SETOF tickets` — use the returned rows to write `ticket_events`

---

#### `acquire_ticket_lock(tier_id)`
Acquires a PostgreSQL advisory lock keyed to the tier UUID. Must be called within a transaction before any capacity check.

Called internally by `fulfill_tickets_atomic`. Only call this directly if writing a custom atomic operation that needs to serialize against ticket fulfillment.

---

#### `claim_promo_code(code, event_id)`
Validates a promo code — checks it exists, is within its date range, and has not exceeded `max_uses` by counting `promo_code_usage` rows.

- Do not validate promo codes by checking a `times_used` column — that column does not exist
- This function raises an exception if the code is invalid or exhausted — catch it in the server action

---

#### `increment_attendee_profile(collective_id, party_id, email, name, ticket_count, spend)`
Upserts an `attendee_profiles` record and increments `total_tickets`, `total_spend`, `total_events`, and `last_seen_at`.

- Call this after every completed purchase (order status → `'paid'`)
- This is how `attendee_profiles` stays current — it is not recomputed from orders at read time

---

#### `increment_analytics_counter(event_id, field, value)`
Upserts an `event_analytics` row and increments the named counter field.

- Used for page views, unique visitors, share clicks — non-blocking
- `SECURITY DEFINER` — can be called from the client without service role

---

#### `increment_promo_click(link_id)`
Increments `promo_links.click_count`. Call on every promo link visit.

---

### L. RLS Pattern

Every table has row-level security enabled. The application never bypasses it — all client queries are scoped by the authenticated user's memberships.

**Collective-scoped access (most tables):**
Users can see rows where they have a `collective_members` entry for the row's `collective_id`. This is enforced at the DB level — a missing auth check in a server action cannot expose another collective's data.

**Cross-collective access (`parties`, `party_contact_methods`):**
A party is visible if the requesting user shares a collective with that party, OR the party has a `platform_user` role. This is what makes cross-collective discovery, messaging, and bookings possible without compromising isolation.

**Service role:**
The admin client (`createAdminClient`) uses the Supabase service role key and bypasses RLS. It is used only in server actions and DB functions — never on the client, never in API routes that accept user-controlled input without validation.

**Rule:** Every new table gets an RLS policy on day one. An unprotected table is a security incident waiting to happen.
