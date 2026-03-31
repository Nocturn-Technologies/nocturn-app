"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { rateLimitStrict } from "@/lib/rate-limit";

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
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { userId: null, error: "Not authenticated" };
  }

  const admin = createAdminClient();
  const { count } = await admin
    .from("collective_members")
    .select("*", { count: "exact", head: true })
    .eq("collective_id", collectiveId)
    .eq("user_id", user.id)
    .is("deleted_at", null);

  if (!count || count === 0) {
    return { userId: null, error: "Not a member of this collective" };
  }

  return { userId: user.id, error: null };
}

/** Basic email validation */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

export async function getContacts(
  collectiveId: string,
  filters: ContactFilters = {}
): Promise<{
  error: string | null;
  contacts: Contact[];
  totalCount: number;
  segmentCounts: Record<string, number>;
}> {
  const empty = { error: null as string | null, contacts: [] as Contact[], totalCount: 0, segmentCounts: {} };
  try {
  const auth = await verifyCollectiveAccess(collectiveId);
  if (auth.error) return { ...empty, error: auth.error };

  const admin = createAdminClient();
  const page = filters.page ?? 1;
  const offset = (page - 1) * PAGE_SIZE;

  // Build query
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (admin.from("contacts") as any)
    .select("*", { count: "exact" })
    .eq("collective_id", collectiveId)
    .is("deleted_at", null);

  // Filter by contact type
  if (filters.contactType) {
    query = query.eq("contact_type", filters.contactType);
  }

  // Search by name or email
  if (filters.search) {
    const term = `%${filters.search}%`;
    query = query.or(`full_name.ilike.${term},email.ilike.${term}`);
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
    return { ...empty, error: `Failed to fetch contacts: ${error.message}` };
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: allFans } = await (admin.from("contacts") as any)
      .select("total_events, total_spend, tags, metadata")
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

    for (const fan of (allFans ?? []) as Record<string, unknown>[]) {
      const tempContact = {
        totalEvents: (fan.total_events as number) ?? 0,
        totalSpend: Number(fan.total_spend) || 0,
        tags: (fan.tags as string[]) ?? [],
        metadata: (fan.metadata as Record<string, unknown>) ?? {},
      } as Contact;
      const seg = computeSegment(tempContact, totalCollectiveEvents);
      segmentCounts[seg]++;
    }

    return {
      error: null,
      contacts,
      totalCount: totalCount ?? 0,
      segmentCounts,
    };
  }

  return {
    error: null,
    contacts,
    totalCount: totalCount ?? 0,
    segmentCounts: {},
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
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated", detail: null };

  const admin = createAdminClient();

  // Fetch the contact row
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: contactRow, error: contactError } = await (admin.from("contacts") as any)
    .select("*")
    .eq("id", contactId)
    .is("deleted_at", null)
    .maybeSingle();

  if (contactError || !contactRow) {
    return { error: contactError?.message ?? "Contact not found", detail: null };
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: inquiries } = await (admin.from("marketplace_inquiries") as any)
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: bookings } = await (admin.from("event_artists") as any)
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
      if (!isValidEmail(row.email)) {
        result.errors.push(`Invalid email: ${row.email}`);
        result.skipped++;
        continue;
      }

      rows.push({
        collective_id: collectiveId,
        contact_type: input.contactType,
        email: row.email,
        full_name: row.fullName || null,
        phone: row.phone || null,
        instagram: row.instagram || null,
        role: input.role || null,
        source: "import",
        source_detail: input.sourceDetail || null,
        tags: input.tags ?? [],
        updated_at: new Date().toISOString(),
      });
    }

    if (rows.length === 0) continue;

    // Upsert with ON CONFLICT on (collective_id, email)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: upserted, error: upsertError } = await (admin.from("contacts") as any)
      .upsert(rows, {
        onConflict: "collective_id,email",
        ignoreDuplicates: false,
      })
      .select("id, created_at, updated_at");

    if (upsertError) {
      result.errors.push(`Batch error: ${upsertError.message}`);
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
  const auth = await verifyCollectiveAccess(collectiveId);
  if (auth.error) return { error: auth.error, contact: null };

  // Rate limit: 20 adds per minute
  const rl = await rateLimitStrict(`add-contact:${auth.userId}`, 20, 60_000);
  if (!rl.success) return { error: "Rate limit exceeded. Try again in a minute.", contact: null };

  const email = data.email?.trim().toLowerCase();
  if (!email || !isValidEmail(email)) {
    return { error: "A valid email is required", contact: null };
  }

  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row, error } = await (admin.from("contacts") as any)
    .upsert(
      {
        collective_id: collectiveId,
        contact_type: data.contactType,
        email,
        full_name: data.fullName || null,
        phone: data.phone || null,
        instagram: data.instagram || null,
        role: data.role || null,
        source: "manual",
        source_detail: "quick_add",
        tags: data.tags ?? [],
        notes: data.notes || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "collective_id,email", ignoreDuplicates: false }
    )
    .select("*")
    .maybeSingle();

  if (error || !row) {
    return { error: error?.message ?? "Failed to add contact", contact: null };
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (admin.from("contacts") as any)
    .select("collective_id")
    .eq("id", contactId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!existing) return { error: "Contact not found", contact: null };

  const auth = await verifyCollectiveAccess(existing.collective_id as string);
  if (auth.error) return { error: auth.error, contact: null };

  // Build update payload — only include provided fields
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (updates.tags !== undefined) payload.tags = updates.tags;
  if (updates.notes !== undefined) payload.notes = updates.notes;
  if (updates.followUpAt !== undefined) payload.follow_up_at = updates.followUpAt;
  if (updates.fullName !== undefined) payload.full_name = updates.fullName;
  if (updates.email !== undefined) payload.email = updates.email;
  if (updates.phone !== undefined) payload.phone = updates.phone;
  if (updates.instagram !== undefined) payload.instagram = updates.instagram;
  if (updates.role !== undefined) payload.role = updates.role;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row, error } = await (admin.from("contacts") as any)
    .update(payload)
    .eq("id", contactId)
    .select("*")
    .maybeSingle();

  if (error || !row) {
    return { error: error?.message ?? "Failed to update contact", contact: null };
  }

  return { error: null, contact: rowToContact(row as Record<string, unknown>) };
  } catch (err) {
    console.error("[updateContact] Unexpected error:", err);
    return { error: "Something went wrong", contact: null };
  }
}

