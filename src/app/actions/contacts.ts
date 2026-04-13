"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { rateLimitStrict } from "@/lib/rate-limit";
import { sanitizePostgRESTInput } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Contact {
  id: string;
  collectiveId: string;
  contactType: "industry" | "fan";
  email: string | null;
  phone: string | null;
  fullName: string | null;
  instagram: string | null;
  role: string | null;
  source: string;
  sourceDetail: string | null;
  userId: string | null;
  artistId: string | null;
  marketplaceProfileId: string | null;
  tags: string[];
  notes: string | null;
  followUpAt: string | null;
  totalEvents: number;
  totalSpend: number;
  firstSeenAt: string;
  lastSeenAt: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface TimelineEntry {
  id: string;
  type: "ticket" | "inquiry" | "booking" | "note" | "import";
  title: string;
  detail: string | null;
  date: string;
  metadata?: Record<string, unknown>;
}

export interface ContactDetail {
  contact: Contact;
  timeline: TimelineEntry[];
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export interface ContactFilters {
  contactType?: "industry" | "fan";
  search?: string;
  tags?: string[];
  source?: string;
  role?: string;
  segment?: "core50" | "ambassador" | "repeat" | "new" | "vip";
  sortBy?: "name" | "email" | "created" | "last_seen" | "total_events" | "total_spend";
  page?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

/** Allowed roles for industry contacts. */
const ALLOWED_CONTACT_ROLES = [
  "artist",
  "promoter",
  "venue",
  "press",
  "photographer",
  "other",
] as const;

type ContactFieldInput = {
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  instagram?: string | null;
  notes?: string | null;
  role?: string | null;
};

type ContactFieldOutput = {
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  instagram?: string | null;
  notes?: string | null;
  role?: string | null;
};

/**
 * Validate + sanitize contact fields shared across addContact, updateContact, and importContacts.
 * Trims strings, enforces length caps, validates email format, strips unsafe phone chars,
 * and restricts role to the allowlist.
 *
 * Returns `{ error }` on failure or `{ data }` with sanitized fields on success.
 * Only fields present in `input` (non-undefined) appear in `data`, so callers can distinguish
 * "not provided" from "explicitly set to null" and build partial update payloads cleanly.
 */
function validateContactFields(
  input: ContactFieldInput
): { error: string; data: null } | { error: null; data: ContactFieldOutput } {
  const data: ContactFieldOutput = {};

  if (input.fullName !== undefined) {
    if (input.fullName === null) {
      data.fullName = null;
    } else {
      const trimmed = String(input.fullName).trim();
      if (trimmed.length === 0) {
        return { error: "Full name cannot be empty", data: null };
      }
      if (trimmed.length > 200) {
        return { error: "Full name is too long (max 200 characters)", data: null };
      }
      data.fullName = trimmed;
    }
  }

  if (input.email !== undefined) {
    if (input.email === null) {
      data.email = null;
    } else {
      const trimmed = String(input.email).trim().toLowerCase();
      if (trimmed.length === 0) {
        data.email = null;
      } else {
        if (trimmed.length > 254) {
          return { error: "Email is too long", data: null };
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
          return { error: "Invalid email address", data: null };
        }
        data.email = trimmed;
      }
    }
  }

  if (input.phone !== undefined) {
    if (input.phone === null) {
      data.phone = null;
    } else {
      // Strip to digits + `+ -()` characters; cap at 50
      const stripped = String(input.phone).trim().replace(/[^0-9+\-() ]/g, "");
      if (stripped.length === 0) {
        data.phone = null;
      } else if (stripped.length > 50) {
        return { error: "Phone number is too long (max 50 characters)", data: null };
      } else {
        data.phone = stripped;
      }
    }
  }

  if (input.instagram !== undefined) {
    if (input.instagram === null) {
      data.instagram = null;
    } else {
      const trimmed = String(input.instagram).trim().replace(/^@/, "");
      if (trimmed.length === 0) {
        data.instagram = null;
      } else if (trimmed.length > 100) {
        return { error: "Instagram handle is too long (max 100 characters)", data: null };
      } else {
        data.instagram = trimmed;
      }
    }
  }

  if (input.notes !== undefined) {
    if (input.notes === null) {
      data.notes = null;
    } else {
      const trimmed = String(input.notes).trim();
      if (trimmed.length === 0) {
        data.notes = null;
      } else if (trimmed.length > 2000) {
        return { error: "Notes are too long (max 2000 characters)", data: null };
      } else {
        data.notes = trimmed;
      }
    }
  }

  if (input.role !== undefined) {
    if (input.role === null) {
      data.role = null;
    } else {
      const trimmed = String(input.role).trim().toLowerCase();
      if (trimmed.length === 0) {
        data.role = null;
      } else if (!(ALLOWED_CONTACT_ROLES as readonly string[]).includes(trimmed)) {
        return {
          error: `Invalid role. Must be one of: ${ALLOWED_CONTACT_ROLES.join(", ")}`,
          data: null,
        };
      } else {
        data.role = trimmed;
      }
    }
  }

  return { error: null, data };
}

/** Map a DB row to our Contact interface */
function rowToContact(row: Record<string, unknown>): Contact {
  return {
    id: row.id as string,
    collectiveId: row.collective_id as string,
    contactType: row.contact_type as "industry" | "fan",
    email: (row.email as string) ?? null,
    phone: (row.phone as string) ?? null,
    fullName: (row.full_name as string) ?? null,
    instagram: (row.instagram as string) ?? null,
    role: (row.role as string) ?? null,
    source: row.source as string,
    sourceDetail: (row.source_detail as string) ?? null,
    userId: (row.user_id as string) ?? null,
    artistId: (row.artist_id as string) ?? null,
    marketplaceProfileId: (row.marketplace_profile_id as string) ?? null,
    tags: (row.tags as string[]) ?? [],
    notes: (row.notes as string) ?? null,
    followUpAt: (row.follow_up_at as string) ?? null,
    totalEvents: (row.total_events as number) ?? 0,
    totalSpend: Number(row.total_spend) || 0,
    firstSeenAt: row.first_seen_at as string,
    lastSeenAt: row.last_seen_at as string,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/** Verify authenticated user is a member of the collective. Returns userId or error. */
async function verifyCollectiveAccess(
  collectiveId: string
): Promise<{ userId: string; error: null } | { userId: null; error: string }> {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { userId: null, error: "Not authenticated" };
    }

    const admin = createAdminClient();
    const { count, error: memberError } = await admin
      .from("collective_members")
      .select("*", { count: "exact", head: true })
      .eq("collective_id", collectiveId)
      .eq("user_id", user.id)
      .is("deleted_at", null);

    if (memberError) {
      console.error("[verifyCollectiveAccess] query error:", memberError.message);
      return { userId: null, error: "Something went wrong" };
    }

    if (!count || count === 0) {
      return { userId: null, error: "Not a member of this collective" };
    }

    return { userId: user.id, error: null };
  } catch (err) {
    console.error("[verifyCollectiveAccess] Unexpected error:", err);
    return { userId: null, error: "Something went wrong" };
  }
}

/**
 * Compute fan segment from contact data.
 * Segments are computed, never stored as a column.
 */
function computeSegment(
  contact: Contact,
  totalCollectiveEvents: number
): "core50" | "ambassador" | "repeat" | "new" | "vip" {
  // VIP: high spender (top tier, >$500 lifetime)
  if (contact.totalSpend >= 500) return "vip";
  // Ambassador: tagged as ambassador or has referral metadata
  const meta = contact.metadata ?? {};
  if (
    contact.tags?.includes("ambassador") ||
    (meta.referrals_count as number) >= 3
  ) {
    return "ambassador";
  }
  // Core 50: attended all events (or nearly all) when 2+ exist
  if (
    totalCollectiveEvents >= 2 &&
    contact.totalEvents >= totalCollectiveEvents
  ) {
    return "core50";
  }
  // Repeat: 2+ events
  if (contact.totalEvents >= 2) return "repeat";
  // New: everyone else
  return "new";
}

// ── 1. getContacts ────────────────────────────────────────────────────────────

export interface AggregateStats {
  totalRevenue: number;
  avgSpend: number;
  repeatRate: number;
  newThisMonth: number;
}

export async function getContacts(
  collectiveId: string,
  filters: ContactFilters = {}
): Promise<{
  error: string | null;
  contacts: Contact[];
  totalCount: number;
  segmentCounts: Record<string, number>;
  aggregateStats: AggregateStats;
}> {
  const emptyAgg: AggregateStats = { totalRevenue: 0, avgSpend: 0, repeatRate: 0, newThisMonth: 0 };
  const empty = { error: null as string | null, contacts: [] as Contact[], totalCount: 0, segmentCounts: {}, aggregateStats: emptyAgg };
  try {
  if (!collectiveId?.trim()) return { ...empty, error: "Collective ID is required" };

  const auth = await verifyCollectiveAccess(collectiveId);
  if (auth.error) return { ...empty, error: auth.error };

  const admin = createAdminClient();
  const page = filters.page ?? 1;
  const offset = (page - 1) * PAGE_SIZE;

  // Build query
  let query = admin.from("contacts")
    .select("*", { count: "exact" })
    .eq("collective_id", collectiveId)
    .is("deleted_at", null);

  // Filter by contact type
  if (filters.contactType) {
    query = query.eq("contact_type", filters.contactType);
  }

  // Search by name or email (sanitize to prevent PostgREST injection)
  if (filters.search?.trim()) {
    const sanitized = sanitizePostgRESTInput(filters.search);
    if (sanitized) {
      query = query.or(`full_name.ilike.%${sanitized}%,email.ilike.%${sanitized}%`);
    }
  }

  // Filter by tags (all provided tags must be present)
  if (filters.tags && filters.tags.length > 0) {
    query = query.contains("tags", filters.tags);
  }

  // Filter by source
  if (filters.source) {
    query = query.eq("source", filters.source);
  }

  // Filter by role (industry contacts)
  if (filters.role) {
    query = query.eq("role", filters.role);
  }

  // Sorting
  const sortMap: Record<string, string> = {
    name: "full_name",
    email: "email",
    created: "created_at",
    last_seen: "last_seen_at",
    total_events: "total_events",
    total_spend: "total_spend",
  };
  const sortColumn = sortMap[filters.sortBy ?? "last_seen"] ?? "last_seen_at";
  const ascending = sortColumn === "full_name" || sortColumn === "email";
  query = query.order(sortColumn, { ascending, nullsFirst: false });

  // Pagination
  query = query.range(offset, offset + PAGE_SIZE - 1);

  const { data, count: totalCount, error } = await query;

  if (error) {
    console.error("[getContacts] query error:", error.message);
    return { ...empty, error: "Failed to load contacts" };
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  let contacts = rows.map(rowToContact);

  // For fan segment filtering, we need to compute segments
  if (filters.contactType === "fan" || !filters.contactType) {
    // Get total events for this collective (for segment computation)
    const { count: eventCount } = await admin
      .from("events")
      .select("*", { count: "exact", head: true })
      .eq("collective_id", collectiveId)
      .is("deleted_at", null);

    const totalCollectiveEvents = eventCount ?? 0;

    // Attach computed segment for fan contacts
    if (filters.segment) {
      contacts = contacts.filter((c) => {
        if (c.contactType !== "fan") return false;
        return computeSegment(c, totalCollectiveEvents) === filters.segment;
      });
    }

    // Compute segment counts — fetch all fan contacts for counts
    const { data: allFans } = await admin.from("contacts")
      .select("total_events, total_spend, tags, metadata, created_at")
      .eq("collective_id", collectiveId)
      .eq("contact_type", "fan")
      .is("deleted_at", null);

    const segmentCounts: Record<string, number> = {
      core50: 0,
      ambassador: 0,
      repeat: 0,
      new: 0,
      vip: 0,
    };

    // Compute aggregate stats across ALL fan contacts (not just paginated)
    let totalRevenue = 0;
    let repeatCount = 0;
    let newThisMonth = 0;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    for (const fan of (allFans ?? []) as Record<string, unknown>[]) {
      const spend = Number(fan.total_spend) || 0;
      const events = (fan.total_events as number) ?? 0;
      const createdAt = fan.created_at as string | undefined;
      totalRevenue += spend;
      if (events >= 2) repeatCount++;
      if (createdAt && new Date(createdAt) >= thirtyDaysAgo) newThisMonth++;

      const tempContact = {
        totalEvents: events,
        totalSpend: spend,
        tags: (fan.tags as string[]) ?? [],
        metadata: (fan.metadata as Record<string, unknown>) ?? {},
      } as Contact;
      const seg = computeSegment(tempContact, totalCollectiveEvents);
      segmentCounts[seg]++;
    }

    const fanCount = (allFans ?? []).length;
    const aggregateStats: AggregateStats = {
      totalRevenue,
      avgSpend: fanCount > 0 ? totalRevenue / fanCount : 0,
      repeatRate: fanCount > 0 ? (repeatCount / fanCount) * 100 : 0,
      newThisMonth,
    };

    return {
      error: null,
      contacts,
      totalCount: totalCount ?? 0,
      segmentCounts,
      aggregateStats,
    };
  }

  return {
    error: null,
    contacts,
    totalCount: totalCount ?? 0,
    segmentCounts: {},
    aggregateStats: emptyAgg,
  };
  } catch (err) {
    console.error("[getContacts] Unexpected error:", err);
    return { ...empty, error: "Something went wrong" };
  }
}

// ── 2. getContactDetail ───────────────────────────────────────────────────────

export async function getContactDetail(
  contactId: string
): Promise<{ error: string | null; detail: ContactDetail | null }> {
  try {
  if (!contactId?.trim()) return { error: "Contact ID is required", detail: null };

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated", detail: null };

  const admin = createAdminClient();

  // Fetch the contact row
  const { data: contactRow, error: contactError } = await admin.from("contacts")
    .select("*")
    .eq("id", contactId)
    .is("deleted_at", null)
    .maybeSingle();

  if (contactError || !contactRow) {
    if (contactError) console.error("[getContactDetail] query error:", contactError.message);
    return { error: "Contact not found", detail: null };
  }

  // Verify user has access to this contact's collective
  const auth = await verifyCollectiveAccess(contactRow.collective_id as string);
  if (auth.error) return { error: auth.error, detail: null };

  const contact = rowToContact(contactRow as Record<string, unknown>);
  const timeline: TimelineEntry[] = [];

  // Get collective event IDs for ticket lookups
  const { data: events } = await admin
    .from("events")
    .select("id, title, starts_at")
    .eq("collective_id", contact.collectiveId)
    .is("deleted_at", null);

  const eventIds = events?.map((e) => e.id) ?? [];
  const eventMap = new Map(
    (events ?? []).map((e) => [e.id, { title: e.title, startsAt: e.starts_at }])
  );

  // Tickets by email match within collective events
  if (contact.email && eventIds.length > 0) {
    const { data: tickets } = await admin
      .from("tickets")
      .select("id, event_id, price_paid, metadata, created_at")
      .in("event_id", eventIds)
      .in("status", ["paid", "checked_in"]);

    for (const ticket of tickets ?? []) {
      const meta = ticket.metadata as Record<string, unknown> | null;
      const ticketEmail =
        ((meta?.customer_email ?? meta?.buyer_email ?? meta?.email) as string)
          ?.toLowerCase()
          .trim() ?? "";

      if (ticketEmail === contact.email.toLowerCase().trim()) {
        const event = eventMap.get(ticket.event_id);
        timeline.push({
          id: ticket.id,
          type: "ticket",
          title: `Ticket for ${event?.title ?? "Unknown event"}`,
          detail: ticket.price_paid ? `$${Number(ticket.price_paid).toFixed(2)}` : "Free",
          date: ticket.created_at,
        });
      }
    }
  }

  // Marketplace inquiries (if marketplace_profile_id is set)
  if (contact.marketplaceProfileId) {
    const { data: inquiries } = await admin.from("marketplace_inquiries")
      .select("id, message, created_at, from_user_id")
      .eq("to_profile_id", contact.marketplaceProfileId)
      .order("created_at", { ascending: false })
      .limit(20);

    for (const inq of (inquiries ?? []) as Record<string, unknown>[]) {
      timeline.push({
        id: inq.id as string,
        type: "inquiry",
        title: "Marketplace inquiry",
        detail: ((inq.message as string) ?? "").slice(0, 100),
        date: inq.created_at as string,
      });
    }
  }

  // Event bookings (if artist_id is set)
  if (contact.artistId && eventIds.length > 0) {
    const { data: bookings } = await admin.from("event_artists")
      .select("id, event_id, status, created_at")
      .eq("artist_id", contact.artistId)
      .in("event_id", eventIds);

    for (const booking of (bookings ?? []) as Record<string, unknown>[]) {
      const event = eventMap.get(booking.event_id as string);
      timeline.push({
        id: booking.id as string,
        type: "booking",
        title: `Booked for ${event?.title ?? "Unknown event"}`,
        detail: `Status: ${booking.status as string}`,
        date: booking.created_at as string,
      });
    }
  }

  // Sort timeline chronologically (most recent first)
  timeline.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return { error: null, detail: { contact, timeline } };
  } catch (err) {
    console.error("[getContactDetail] Unexpected error:", err);
    return { error: "Something went wrong", detail: null };
  }
}

// ── 3. importContacts ─────────────────────────────────────────────────────────

export async function importContacts(
  collectiveId: string,
  input: {
    text: string;
    contactType: "industry" | "fan";
    tags?: string[];
    sourceDetail?: string;
    role?: string;
  }
): Promise<{ error: string | null; result: ImportResult | null }> {
  try {
  if (!collectiveId?.trim()) return { error: "Collective ID is required", result: null };

  const auth = await verifyCollectiveAccess(collectiveId);
  if (auth.error) return { error: auth.error, result: null };

  // Rate limit: 5 imports per minute
  const rl = await rateLimitStrict(`import:${auth.userId}`, 5, 60_000);
  if (!rl.success) return { error: "Rate limit exceeded. Try again in a minute.", result: null };

  const lines = input.text.trim().split("\n").filter((l) => l.trim());
  if (lines.length === 0) return { error: "No data provided", result: null };
  if (lines.length > 501) return { error: "Maximum 500 contacts per import (plus header row)", result: null };

  const result: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };

  // Detect format: CSV with headers, tab-separated, or plain email list
  const firstLine = lines[0].trim();
  const isCSV = firstLine.includes(",") && /email/i.test(firstLine);
  const isTSV = firstLine.includes("\t") && /email/i.test(firstLine);

  type ParsedRow = {
    email: string;
    fullName?: string;
    phone?: string;
    instagram?: string;
  };

  const parsed: ParsedRow[] = [];

  if (isCSV || isTSV) {
    // Parse header to find column indices
    const separator = isTSV ? "\t" : ",";
    const headers = firstLine.split(separator).map((h) => h.trim().toLowerCase().replace(/['"]/g, ""));

    // Common header variants
    const emailIdx = headers.findIndex((h) =>
      ["email", "e-mail", "email_address", "emailaddress", "email address"].includes(h)
    );
    const nameIdx = headers.findIndex((h) =>
      ["name", "full_name", "fullname", "full name", "customer_name", "customer name"].includes(h)
    );
    const phoneIdx = headers.findIndex((h) =>
      ["phone", "phone_number", "phonenumber", "phone number", "mobile", "cell"].includes(h)
    );
    const igIdx = headers.findIndex((h) =>
      ["instagram", "ig", "instagram_handle", "ig_handle", "instagram handle"].includes(h)
    );

    if (emailIdx === -1) {
      return { error: "Could not find an email column in the CSV header", result: null };
    }

    // Parse data rows (skip header)
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(separator).map((c) => c.trim().replace(/^["']|["']$/g, ""));
      const email = cols[emailIdx]?.trim().toLowerCase();
      if (!email) continue;

      parsed.push({
        email,
        fullName: nameIdx >= 0 ? cols[nameIdx] : undefined,
        phone: phoneIdx >= 0 ? cols[phoneIdx] : undefined,
        instagram: igIdx >= 0 ? cols[igIdx] : undefined,
      });
    }
  } else {
    // Plain email list (one per line)
    for (const line of lines) {
      const email = line.trim().toLowerCase();
      if (email) {
        parsed.push({ email });
      }
    }
  }

  // Enforce limit on parsed rows
  if (parsed.length > 500) {
    return { error: "Maximum 500 contacts per import", result: null };
  }

  const admin = createAdminClient();

  // Batch upsert in chunks of 50
  const chunkSize = 50;
  for (let i = 0; i < parsed.length; i += chunkSize) {
    const chunk = parsed.slice(i, i + chunkSize);
    const rows = [];

    for (const row of chunk) {
      // Shared validation per row: email regex, length caps, role allowlist, phone sanitize
      const validation = validateContactFields({
        fullName: row.fullName,
        email: row.email,
        phone: row.phone,
        instagram: row.instagram,
        role: input.role,
      });

      if (validation.error !== null) {
        result.errors.push(
          `Invalid contact (${row.email || "no email"}): ${validation.error}`
        );
        result.skipped++;
        continue;
      }
      const sanitized = validation.data;
      if (!sanitized.email) {
        result.errors.push(
          `Invalid contact (${row.email || "no email"}): email required`
        );
        result.skipped++;
        continue;
      }

      rows.push({
        collective_id: collectiveId,
        contact_type: input.contactType,
        email: sanitized.email,
        full_name: sanitized.fullName ?? null,
        phone: sanitized.phone ?? null,
        instagram: sanitized.instagram ?? null,
        role: sanitized.role ?? null,
        source: "import",
        source_detail: input.sourceDetail || null,
        tags: input.tags ?? [],
        updated_at: new Date().toISOString(),
      });
    }

    if (rows.length === 0) continue;

    // Upsert with ON CONFLICT on (collective_id, email)
    const { data: upserted, error: upsertError } = await admin.from("contacts")
      .upsert(rows, {
        onConflict: "collective_id,email",
        ignoreDuplicates: false,
      })
      .select("id, created_at, updated_at");

    if (upsertError) {
      console.error("[importContacts] batch upsert error:", upsertError.message);
      result.errors.push("Some contacts failed to import");
      result.skipped += rows.length;
      continue;
    }

    // Count created vs updated by comparing created_at and updated_at
    for (const rec of (upserted ?? []) as Record<string, unknown>[]) {
      const created = new Date(rec.created_at as string).getTime();
      const updated = new Date(rec.updated_at as string).getTime();
      // If created_at is within 2 seconds of updated_at, it's a new record
      if (Math.abs(updated - created) < 2000) {
        result.created++;
      } else {
        result.updated++;
      }
    }
  }

  return { error: null, result };
  } catch (err) {
    console.error("[importContacts] Unexpected error:", err);
    return { error: "Something went wrong", result: null };
  }
}

// ── 4. addContact ─────────────────────────────────────────────────────────────

export async function addContact(
  collectiveId: string,
  data: {
    fullName: string;
    email: string;
    phone?: string;
    instagram?: string;
    contactType: "industry" | "fan";
    role?: string;
    tags?: string[];
    notes?: string;
  }
): Promise<{ error: string | null; contact: Contact | null }> {
  try {
  if (!collectiveId?.trim()) return { error: "Collective ID is required", contact: null };

  const auth = await verifyCollectiveAccess(collectiveId);
  if (auth.error) return { error: auth.error, contact: null };

  // Rate limit: 20 adds per minute
  const rl = await rateLimitStrict(`add-contact:${auth.userId}`, 20, 60_000);
  if (!rl.success) return { error: "Rate limit exceeded. Try again in a minute.", contact: null };

  // Shared validation: trims, length caps, email regex, role allowlist, phone sanitization
  const validation = validateContactFields({
    fullName: data.fullName,
    email: data.email,
    phone: data.phone,
    instagram: data.instagram,
    notes: data.notes,
    role: data.role,
  });
  if (validation.error !== null) {
    return { error: validation.error, contact: null };
  }
  const sanitized = validation.data;

  if (!sanitized.email) {
    return { error: "A valid email is required", contact: null };
  }

  const admin = createAdminClient();

  const { data: row, error } = await admin.from("contacts")
    .upsert(
      {
        collective_id: collectiveId,
        contact_type: data.contactType,
        email: sanitized.email,
        full_name: sanitized.fullName ?? null,
        phone: sanitized.phone ?? null,
        instagram: sanitized.instagram ?? null,
        role: sanitized.role ?? null,
        source: "manual",
        source_detail: "quick_add",
        tags: data.tags ?? [],
        notes: sanitized.notes ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "collective_id,email", ignoreDuplicates: false }
    )
    .select("*")
    .maybeSingle();

  if (error || !row) {
    if (error) console.error("[addContact] upsert error:", error.message);
    return { error: "Failed to add contact", contact: null };
  }

  return { error: null, contact: rowToContact(row as Record<string, unknown>) };
  } catch (err) {
    console.error("[addContact] Unexpected error:", err);
    return { error: "Something went wrong", contact: null };
  }
}

// ── 5. updateContact ──────────────────────────────────────────────────────────

export async function updateContact(
  contactId: string,
  updates: {
    tags?: string[];
    notes?: string;
    followUpAt?: string | null;
    fullName?: string;
    email?: string;
    phone?: string;
    instagram?: string;
    role?: string;
  }
): Promise<{ error: string | null; contact: Contact | null }> {
  try {
  if (!contactId?.trim()) return { error: "Contact ID is required", contact: null };

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated", contact: null };

  // Rate limit: 30 updates per minute
  const rl = await rateLimitStrict(`update-contact:${user.id}`, 30, 60_000);
  if (!rl.success) return { error: "Rate limit exceeded. Try again in a minute.", contact: null };

  const admin = createAdminClient();

  // First fetch the contact to verify access
  const { data: existing } = await admin.from("contacts")
    .select("collective_id")
    .eq("id", contactId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!existing) return { error: "Contact not found", contact: null };

  const auth = await verifyCollectiveAccess(existing.collective_id as string);
  if (auth.error) return { error: auth.error, contact: null };

  // Shared validation: trims, length caps, email regex, role allowlist, phone sanitization.
  // Only the fields the caller provided will be validated + returned.
  const validation = validateContactFields({
    fullName: updates.fullName,
    email: updates.email,
    phone: updates.phone,
    instagram: updates.instagram,
    notes: updates.notes,
    role: updates.role,
  });
  if (validation.error !== null) {
    return { error: validation.error, contact: null };
  }
  const sanitized = validation.data;

  // Build update payload — only include provided fields
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (updates.tags !== undefined) payload.tags = updates.tags;
  if (updates.followUpAt !== undefined) payload.follow_up_at = updates.followUpAt;
  if (sanitized.fullName !== undefined) payload.full_name = sanitized.fullName;
  if (sanitized.email !== undefined) payload.email = sanitized.email;
  if (sanitized.phone !== undefined) payload.phone = sanitized.phone;
  if (sanitized.instagram !== undefined) payload.instagram = sanitized.instagram;
  if (sanitized.notes !== undefined) payload.notes = sanitized.notes;
  if (sanitized.role !== undefined) payload.role = sanitized.role;

  const { data: row, error } = await admin.from("contacts")
    .update(payload)
    .eq("id", contactId)
    .select("*")
    .maybeSingle();

  if (error || !row) {
    if (error) console.error("[updateContact] update error:", error.message);
    return { error: "Failed to update contact", contact: null };
  }

  return { error: null, contact: rowToContact(row as Record<string, unknown>) };
  } catch (err) {
    console.error("[updateContact] Unexpected error:", err);
    return { error: "Something went wrong", contact: null };
  }
}

// ── 6. getEventFanEmails ─────────────────────────────────────────────────────

/**
 * Get all emails associated with a specific event — from tickets, RSVPs,
 * and guest list. Uses admin client to bypass RLS.
 */
export async function getEventFanEmails(
  eventId: string
): Promise<{ error: string | null; emails: string[] }> {
  try {
    if (!eventId?.trim()) return { error: "Event ID required", emails: [] };

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated", emails: [] };

    const admin = createAdminClient();

    // Verify user has access to this event's collective
    const { data: event } = await admin
      .from("events")
      .select("collective_id")
      .eq("id", eventId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!event) return { error: "Event not found", emails: [] };

    const { count: memberCount } = await admin
      .from("collective_members")
      .select("*", { count: "exact", head: true })
      .eq("collective_id", (event as { collective_id: string }).collective_id)
      .eq("user_id", user.id)
      .is("deleted_at", null);
    if (!memberCount) return { error: "Not authorized", emails: [] };

    const emailSet = new Set<string>();

    // 1. Ticket buyer emails (from metadata)
    const { data: tickets } = await admin
      .from("tickets")
      .select("metadata")
      .eq("event_id", eventId)
      .in("status", ["paid", "checked_in"]);

    for (const t of (tickets ?? []) as { metadata: Record<string, unknown> | null }[]) {
      const email =
        (t.metadata?.customer_email as string) ||
        (t.metadata?.buyer_email as string);
      if (email) emailSet.add(email.toLowerCase().trim());
    }

    // 2. RSVP emails
    const { data: rsvps } = await admin
      .from("rsvps")
      .select("email")
      .eq("event_id", eventId)
      .in("status", ["yes", "maybe"])
      .not("email", "is", null);

    for (const r of (rsvps ?? []) as { email: string | null }[]) {
      if (r.email) emailSet.add(r.email.toLowerCase().trim());
    }

    // 3. Guest list emails
    const { data: guests } = await admin
      .from("guest_list")
      .select("email")
      .eq("event_id", eventId)
      .not("email", "is", null);

    for (const g of (guests ?? []) as { email: string | null }[]) {
      if (g.email) emailSet.add(g.email.toLowerCase().trim());
    }

    return { error: null, emails: Array.from(emailSet) };
  } catch (err) {
    console.error("[getEventFanEmails]", err);
    return { error: "Something went wrong", emails: [] };
  }
}

// ── 7. generateReachInsights ─────────────────────────────────────────────────

export interface ReachInsight {
  id: string;
  icon: string;
  title: string;
  description: string;
  action?: string;
  actionType?: "copy_emails" | "copy_handles" | "navigate";
  actionTarget?: string;
}

/**
 * Generate actionable Reach agent insights for the audience page.
 * Pure computation — no AI call. Returns insights sorted by impact.
 */
export async function generateReachInsights(
  collectiveId: string
): Promise<{ error: string | null; insights: ReachInsight[] }> {
  try {
    if (!collectiveId?.trim()) return { error: "Collective ID required", insights: [] };

    const auth = await verifyCollectiveAccess(collectiveId);
    if (auth.error) return { error: auth.error, insights: [] };

    const admin = createAdminClient();

    // Fetch all fan contacts
    const { data: fans } = await admin
      .from("contacts")
      .select("id, email, full_name, instagram, total_events, total_spend, tags, last_seen_at, created_at, metadata")
      .eq("collective_id", collectiveId)
      .eq("contact_type", "fan")
      .is("deleted_at", null);

    if (!fans || fans.length === 0) return { error: null, insights: [] };

    const allFans = fans as {
      id: string; email: string | null; full_name: string | null;
      instagram: string | null; total_events: number; total_spend: number;
      tags: string[]; last_seen_at: string | null; created_at: string;
      metadata: Record<string, unknown> | null;
    }[];

    // Get event count for context
    const { count: eventCount } = await admin
      .from("events")
      .select("*", { count: "exact", head: true })
      .eq("collective_id", collectiveId)
      .is("deleted_at", null);

    const totalEvents = eventCount ?? 0;
    const insights: ReachInsight[] = [];

    // ── Insight: Fans with IG handles (ambassador potential) ──
    const withIG = allFans.filter((f) => f.instagram);
    const withoutIG = allFans.filter((f) => !f.instagram);
    if (withIG.length > 0) {
      const repeatWithIG = withIG.filter((f) => f.total_events >= 2);
      if (repeatWithIG.length >= 3) {
        insights.push({
          id: "ambassador_candidates",
          icon: "🚀",
          title: `${repeatWithIG.length} repeat fans have IG handles`,
          description: `These fans came back 2+ times and are reachable on Instagram. Arm them with promo codes to share — each one could bring 3-5 new people.`,
          action: "Copy their @handles",
          actionType: "copy_handles",
        });
      }
    }

    if (withoutIG.length > allFans.length * 0.5 && allFans.length >= 10) {
      insights.push({
        id: "missing_ig",
        icon: "📱",
        title: `${withoutIG.length} fans have no IG handle`,
        description: `You're missing the main nightlife communication channel for ${Math.round((withoutIG.length / allFans.length) * 100)}% of your audience. Ask at the door or add a field to your checkout.`,
      });
    }

    // ── Insight: Ambassador arming strategy ──
    const ambassadors = allFans.filter(
      (f) => f.tags?.includes("ambassador") || (f.metadata?.referrals_count as number) >= 3
    );
    const potentialAmbassadors = allFans.filter(
      (f) => f.total_events >= 2 && f.instagram && !f.tags?.includes("ambassador")
    );

    if (potentialAmbassadors.length > 0) {
      insights.push({
        id: "potential_ambassadors",
        icon: "⭐",
        title: `${potentialAmbassadors.length} fans ready to become ambassadors`,
        description: `They've come to multiple events and have IG handles. Give them a unique promo code, early access to tickets, and ask them to post your flyer on their story.`,
        action: "Copy their @handles",
        actionType: "copy_handles",
      });
    }

    if (ambassadors.length > 0) {
      insights.push({
        id: "arm_ambassadors",
        icon: "🎯",
        title: `Arm your ${ambassadors.length} ambassador${ambassadors.length !== 1 ? "s" : ""} for the next event`,
        description: `Send them the flyer early, give them a "friends of [collective]" promo code (10-15% off), and ask them to post to their story 3 days before. Each ambassador typically brings 3-5 ticket sales.`,
        action: "Go to Promo Codes",
        actionType: "navigate",
        actionTarget: "/dashboard/events",
      });
    }

    // ── Insight: New fans this month ──
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const newFans = allFans.filter((f) => new Date(f.created_at) >= thirtyDaysAgo);
    if (newFans.length > 0 && allFans.length > newFans.length) {
      const growthPct = Math.round((newFans.length / (allFans.length - newFans.length)) * 100);
      insights.push({
        id: "new_fans",
        icon: "📈",
        title: `${newFans.length} new fan${newFans.length !== 1 ? "s" : ""} in the last 30 days`,
        description: growthPct > 20
          ? `Your audience grew ${growthPct}% this month — strong momentum. Keep pushing the social loop.`
          : `Steady growth. Tip: post a recap reel from your last event — past event content is the #1 driver of new followers.`,
      });
    }

    // ── Insight: Core crew identification ──
    if (totalEvents >= 2) {
      const coreCrew = allFans.filter((f) => f.total_events >= totalEvents);
      if (coreCrew.length > 0) {
        insights.push({
          id: "core_crew",
          icon: "💎",
          title: `${coreCrew.length} fan${coreCrew.length !== 1 ? "s" : ""} came to every event`,
          description: `Your day-ones. They deserve VIP treatment — early ticket access, guest list +1, or a shoutout in your next event description. Loyalty breeds loyalty.`,
          action: "Copy their emails",
          actionType: "copy_emails",
        });
      }
    }

    // ── Insight: Dormant fans (haven't been seen in 60+ days) ──
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const dormant = allFans.filter(
      (f) => f.last_seen_at && new Date(f.last_seen_at) < sixtyDaysAgo && f.total_events >= 1
    );
    if (dormant.length >= 3) {
      insights.push({
        id: "dormant_fans",
        icon: "😴",
        title: `${dormant.length} fan${dormant.length !== 1 ? "s" : ""} haven't come in 60+ days`,
        description: `Win them back. Send a "we miss you" DM with an exclusive early access link. Re-engagement campaigns convert at 15-25% for nightlife.`,
        action: "Copy their emails",
        actionType: "copy_emails",
      });
    }

    // ── Insight: Email list health ──
    const withEmail = allFans.filter((f) => f.email);
    if (withEmail.length >= 10) {
      insights.push({
        id: "email_list",
        icon: "📧",
        title: `${withEmail.length} fans have emails — use them`,
        description: `Send a pre-event hype email 5 days before your next event. Email drives 20-30% of advance ticket sales for nightlife. Use the Marketing tab to blast.`,
        action: "Go to Email Marketing",
        actionType: "navigate",
        actionTarget: "/dashboard/marketing",
      });
    }

    return { error: null, insights };
  } catch (err) {
    console.error("[generateReachInsights]", err);
    return { error: "Something went wrong", insights: [] };
  }
}

// ── 8. syncContactMetrics ────────────────────────────────────────────────────

/**
 * Sync total_spend, total_events, and last_seen_at from ticket purchases
 * into the contacts table. Matches tickets to contacts via email.
 *
 * Call this:
 * - When the audience page loads (debounced, max once per hour)
 * - After ticket purchase via Stripe webhook (future)
 * - After CSV import completes
 */
export async function syncContactMetrics(
  collectiveId: string
): Promise<{ error: string | null; synced: number }> {
  try {
    if (!collectiveId?.trim()) return { error: "Collective ID is required", synced: 0 };

    const auth = await verifyCollectiveAccess(collectiveId);
    if (auth.error) return { error: auth.error, synced: 0 };

    // Rate limit: max once per hour per collective
    const { success: rlOk } = await rateLimitStrict(`sync-metrics:${collectiveId}`, 2, 3600_000);
    if (!rlOk) return { error: null, synced: 0 }; // silently skip — not an error

    const admin = createAdminClient();

    // 1. Get all events for this collective
    const { data: events } = await admin
      .from("events")
      .select("id, starts_at")
      .eq("collective_id", collectiveId)
      .is("deleted_at", null);

    if (!events || events.length === 0) return { error: null, synced: 0 };

    const eventIds = (events as { id: string; starts_at: string }[]).map((e) => e.id);
    const eventDateMap = new Map(
      (events as { id: string; starts_at: string }[]).map((e) => [e.id, e.starts_at])
    );

    // 2. Fetch all paid/checked-in tickets in batches
    const allTickets: { event_id: string; price_paid: number | null; metadata: Record<string, unknown> | null }[] = [];
    const BATCH = 5000;
    for (let offset = 0; ; offset += BATCH) {
      const { data: batch, error: batchErr } = await admin
        .from("tickets")
        .select("event_id, price_paid, metadata")
        .in("event_id", eventIds)
        .in("status", ["paid", "checked_in"])
        .range(offset, offset + BATCH - 1);
      if (batchErr || !batch || batch.length === 0) break;
      allTickets.push(...(batch as typeof allTickets));
      if (batch.length < BATCH) break;
    }

    if (allTickets.length === 0) return { error: null, synced: 0 };

    // 3. Aggregate by email: total_spend, event count, last event date
    const emailMetrics = new Map<string, {
      totalSpend: number;
      eventIds: Set<string>;
      lastEventDate: string;
    }>();

    for (const ticket of allTickets) {
      const meta = ticket.metadata;
      const email =
        (meta?.customer_email as string) ||
        (meta?.buyer_email as string);
      if (!email) continue;
      const normalized = email.toLowerCase().trim();
      if (!normalized) continue;

      const existing = emailMetrics.get(normalized);
      const eventDate = eventDateMap.get(ticket.event_id) ?? "";

      if (existing) {
        existing.totalSpend += Number(ticket.price_paid) || 0;
        existing.eventIds.add(ticket.event_id);
        if (eventDate > existing.lastEventDate) existing.lastEventDate = eventDate;
      } else {
        emailMetrics.set(normalized, {
          totalSpend: Number(ticket.price_paid) || 0,
          eventIds: new Set([ticket.event_id]),
          lastEventDate: eventDate,
        });
      }
    }

    // 4. Get all fan contacts for this collective
    const { data: contacts } = await admin
      .from("contacts")
      .select("id, email")
      .eq("collective_id", collectiveId)
      .eq("contact_type", "fan")
      .is("deleted_at", null);

    if (!contacts || contacts.length === 0) return { error: null, synced: 0 };

    // 5. Update each contact that has matching ticket data
    let synced = 0;
    for (const contact of contacts as { id: string; email: string | null }[]) {
      if (!contact.email) continue;
      const normalized = contact.email.toLowerCase().trim();
      const metrics = emailMetrics.get(normalized);
      if (!metrics) continue;

      await admin
        .from("contacts")
        .update({
          total_spend: metrics.totalSpend,
          total_events: metrics.eventIds.size,
          last_seen_at: metrics.lastEventDate || undefined,
        })
        .eq("id", contact.id);
      synced++;
    }

    return { error: null, synced };
  } catch (err) {
    console.error("[syncContactMetrics] Unexpected error:", err);
    return { error: "Something went wrong", synced: 0 };
  }
}

