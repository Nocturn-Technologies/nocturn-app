"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { rateLimitStrict } from "@/lib/rate-limit";
import { sanitizePostgRESTInput } from "@/lib/utils";
import type { Json } from "@/lib/supabase/database.types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Contact {
  id: string;
  collectiveId: string;
  contactType: "industry" | "fan";
  email: string | null;
  phone: string | null;
  fullName: string | null;
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
  notes?: string | null;
  role?: string | null;
};

type ContactFieldOutput = {
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  role?: string | null;
};

/**
 * Validate + sanitize contact fields.
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

// ── Internal row shape from DB ─────────────────────────────────────────────────

/**
 * A party_roles row joined with its party and contact methods.
 * Returned from queries that select contact-role rows.
 */
type ContactRow = {
  id: string;
  collective_id: string | null;
  party_id: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
  parties: {
    id: string;
    display_name: string;
    created_at: string;
    party_contact_methods: {
      id: string;
      type: string;
      value: string;
      is_primary: boolean;
    }[];
  } | null;
};

/**
 * Map a DB row (party_roles + parties + party_contact_methods) to the Contact interface.
 * The `role` column in party_roles is always 'contact' for these rows;
 * we derive the human-readable role from metadata.role if present.
 */
function rowToContact(row: ContactRow, collectiveId: string): Contact {
  const party = row.parties;
  const methods = party?.party_contact_methods ?? [];
  const meta = (row.metadata ?? {}) as Record<string, unknown>;

  const emailMethod = methods.find((m) => m.type === "email");
  const phoneMethod = methods.find((m) => m.type === "phone");

  return {
    id: row.id,
    collectiveId,
    contactType: (meta.contact_type as "industry" | "fan") ?? "industry",
    email: emailMethod?.value ?? null,
    phone: phoneMethod?.value ?? null,
    fullName: party?.display_name ?? null,
    role: (meta.role as string) ?? null,
    source: (meta.source as string) ?? "manual",
    sourceDetail: (meta.source_detail as string) ?? null,
    userId: (meta.user_id as string) ?? null,
    artistId: (meta.artist_id as string) ?? null,
    marketplaceProfileId: null,
    tags: (meta.tags as string[]) ?? [],
    notes: (meta.notes as string) ?? null,
    followUpAt: (meta.follow_up_at as string) ?? null,
    totalEvents: (meta.total_events as number) ?? 0,
    totalSpend: Number(meta.total_spend) || 0,
    firstSeenAt: party?.created_at ?? row.created_at,
    lastSeenAt: (meta.last_seen_at as string) ?? row.created_at,
    metadata: meta,
    createdAt: row.created_at,
    updatedAt: (meta.updated_at as string) ?? row.created_at,
  };
}

/** Verify authenticated user is a member of the collective. */
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
 */
function computeSegment(
  contact: Contact,
  totalCollectiveEvents: number
): "core50" | "ambassador" | "repeat" | "new" | "vip" {
  if (contact.totalSpend >= 500) return "vip";
  const meta = contact.metadata ?? {};
  if (
    contact.tags?.includes("ambassador") ||
    (meta.referrals_count as number) >= 3
  ) {
    return "ambassador";
  }
  if (
    totalCollectiveEvents >= 2 &&
    contact.totalEvents >= totalCollectiveEvents
  ) {
    return "core50";
  }
  if (contact.totalEvents >= 2) return "repeat";
  return "new";
}

// The join string for party_roles → parties → party_contact_methods
const CONTACT_JOIN =
  "id, collective_id, party_id, created_at, metadata, parties(id, display_name, created_at, party_contact_methods(id, type, value, is_primary))";

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

  // Query party_roles where role='contact' and collective_id=X
  let query = admin
    .from("party_roles")
    .select(CONTACT_JOIN, { count: "exact" })
    .eq("role", "contact")
    .eq("collective_id", collectiveId);

  // Sorting on the joined party display_name is not directly supported via
  // PostgREST nested ordering, so we order by created_at for now. Name/email
  // sorts are applied in-memory after fetch for small result sets.
  const sortBy = filters.sortBy ?? "last_seen";
  const needsInMemorySort = sortBy === "name" || sortBy === "email" || sortBy === "last_seen" || sortBy === "total_events" || sortBy === "total_spend";
  if (!needsInMemorySort) {
    query = query.order("created_at", { ascending: sortBy === "created" });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  query = query.range(offset, offset + PAGE_SIZE - 1);

  const { data, count: totalCount, error } = await query;

  if (error) {
    console.error("[getContacts] query error:", error.message);
    return { ...empty, error: "Failed to load contacts" };
  }

  let contacts = (data ?? []).map((row) =>
    rowToContact(row as unknown as ContactRow, collectiveId)
  );

  // Apply contact type filter (stored in metadata)
  if (filters.contactType) {
    contacts = contacts.filter((c) => c.contactType === filters.contactType);
  }

  // Apply search filter
  if (filters.search?.trim()) {
    const sanitized = sanitizePostgRESTInput(filters.search).toLowerCase();
    if (sanitized) {
      contacts = contacts.filter(
        (c) =>
          c.fullName?.toLowerCase().includes(sanitized) ||
          c.email?.toLowerCase().includes(sanitized)
      );
    }
  }

  // Apply tag filter
  if (filters.tags && filters.tags.length > 0) {
    contacts = contacts.filter((c) =>
      filters.tags!.every((t) => c.tags.includes(t))
    );
  }

  // Apply source filter
  if (filters.source) {
    contacts = contacts.filter((c) => c.source === filters.source);
  }

  // Apply role filter
  if (filters.role) {
    contacts = contacts.filter((c) => c.role === filters.role);
  }

  // In-memory sort
  if (needsInMemorySort) {
    contacts.sort((a, b) => {
      switch (sortBy) {
        case "name":
          return (a.fullName ?? "").localeCompare(b.fullName ?? "");
        case "email":
          return (a.email ?? "").localeCompare(b.email ?? "");
        case "last_seen":
          return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
        case "total_events":
          return b.totalEvents - a.totalEvents;
        case "total_spend":
          return b.totalSpend - a.totalSpend;
        default:
          return 0;
      }
    });
  }

  // Segment computation for fan contacts
  if (filters.contactType === "fan" || !filters.contactType) {
    const { count: eventCount } = await admin
      .from("events")
      .select("*", { count: "exact", head: true })
      .eq("collective_id", collectiveId)
      .is("deleted_at", null);

    const totalCollectiveEvents = eventCount ?? 0;

    if (filters.segment) {
      contacts = contacts.filter((c) => {
        if (c.contactType !== "fan") return false;
        return computeSegment(c, totalCollectiveEvents) === filters.segment;
      });
    }

    // Compute aggregate stats across all contacts fetched
    const segmentCounts: Record<string, number> = {
      core50: 0, ambassador: 0, repeat: 0, new: 0, vip: 0,
    };
    let totalRevenue = 0;
    let repeatCount = 0;
    let newThisMonth = 0;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    for (const c of contacts) {
      if (c.contactType !== "fan") continue;
      totalRevenue += c.totalSpend;
      if (c.totalEvents >= 2) repeatCount++;
      if (new Date(c.createdAt) >= thirtyDaysAgo) newThisMonth++;
      segmentCounts[computeSegment(c, totalCollectiveEvents)]++;
    }

    const fanCount = contacts.filter((c) => c.contactType === "fan").length;
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

  // Fetch the party_roles row (contact role)
  const { data: contactRow, error: contactError } = await admin
    .from("party_roles")
    .select(CONTACT_JOIN)
    .eq("id", contactId)
    .eq("role", "contact")
    .maybeSingle();

  if (contactError || !contactRow) {
    if (contactError) console.error("[getContactDetail] query error:", contactError.message);
    return { error: "Contact not found", detail: null };
  }

  const row = contactRow as unknown as ContactRow;
  if (!row.collective_id) return { error: "Contact not found", detail: null };

  const auth = await verifyCollectiveAccess(row.collective_id);
  if (auth.error) return { error: auth.error, detail: null };

  const contact = rowToContact(row, row.collective_id);
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

  // Purchase history via orders (linked by party_id)
  if (eventIds.length > 0) {
    const { data: orders } = await admin
      .from("orders")
      .select("id, event_id, total, created_at")
      .in("event_id", eventIds)
      .eq("party_id", row.party_id)
      .eq("status", "paid");

    for (const order of orders ?? []) {
      const event = eventMap.get(order.event_id);
      timeline.push({
        id: order.id,
        type: "ticket",
        title: `Ticket for ${event?.title ?? "Unknown event"}`,
        detail: order.total ? `$${Number(order.total).toFixed(2)}` : "Free",
        date: order.created_at,
      });
    }
  }

  // Event bookings (if artist_id is set in metadata — stored as artist_profiles.id)
  if (contact.artistId && eventIds.length > 0) {
    // Resolve artist_profiles.id → parties.id for event_artists lookup
    const { data: artistProfileRow } = await admin
      .from("artist_profiles")
      .select("party_id")
      .eq("id", contact.artistId)
      .is("deleted_at", null)
      .maybeSingle();

    if (artistProfileRow?.party_id) {
      const { data: bookings } = await admin.from("event_artists")
        .select("id, event_id, created_at, role")
        .eq("party_id", artistProfileRow.party_id)
        .in("event_id", eventIds);

      for (const booking of (bookings ?? []) as Record<string, unknown>[]) {
        const event = eventMap.get(booking.event_id as string);
        timeline.push({
          id: booking.id as string,
          type: "booking",
          title: `Booked for ${event?.title ?? "Unknown event"}`,
          detail: `Status: ${(booking.role as string) ?? "pending"}`,
          date: booking.created_at as string,
        });
      }
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

  const rl = await rateLimitStrict(`import:${auth.userId}`, 5, 60_000);
  if (!rl.success) return { error: "Rate limit exceeded. Try again in a minute.", result: null };

  const lines = input.text.trim().split("\n").filter((l) => l.trim());
  if (lines.length === 0) return { error: "No data provided", result: null };
  if (lines.length > 501) return { error: "Maximum 500 contacts per import (plus header row)", result: null };

  const result: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };

  const firstLine = lines[0].trim();
  const isCSV = firstLine.includes(",") && /email/i.test(firstLine);
  const isTSV = firstLine.includes("\t") && /email/i.test(firstLine);

  type ParsedRow = { email: string; fullName?: string; phone?: string };
  const parsed: ParsedRow[] = [];

  if (isCSV || isTSV) {
    const separator = isTSV ? "\t" : ",";
    const headers = firstLine.split(separator).map((h) => h.trim().toLowerCase().replace(/['"]/g, ""));
    const emailIdx = headers.findIndex((h) =>
      ["email", "e-mail", "email_address", "emailaddress", "email address"].includes(h)
    );
    const nameIdx = headers.findIndex((h) =>
      ["name", "full_name", "fullname", "full name", "customer_name", "customer name"].includes(h)
    );
    const phoneIdx = headers.findIndex((h) =>
      ["phone", "phone_number", "phonenumber", "phone number", "mobile", "cell"].includes(h)
    );
    if (emailIdx === -1) {
      return { error: "Could not find an email column in the CSV header", result: null };
    }
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(separator).map((c) => c.trim().replace(/^["']|["']$/g, ""));
      const email = cols[emailIdx]?.trim().toLowerCase();
      if (!email) continue;
      parsed.push({
        email,
        fullName: nameIdx >= 0 ? cols[nameIdx] : undefined,
        phone: phoneIdx >= 0 ? cols[phoneIdx] : undefined,
      });
    }
  } else {
    for (const line of lines) {
      const email = line.trim().toLowerCase();
      if (email) parsed.push({ email });
    }
  }

  if (parsed.length > 500) return { error: "Maximum 500 contacts per import", result: null };

  const admin = createAdminClient();

  for (const row of parsed) {
    const validation = validateContactFields({
      fullName: row.fullName,
      email: row.email,
      phone: row.phone,
      role: input.role,
    });

    if (validation.error !== null) {
      result.errors.push(`Invalid contact (${row.email || "no email"}): ${validation.error}`);
      result.skipped++;
      continue;
    }
    const sanitized = validation.data;
    if (!sanitized.email) {
      result.errors.push(`Invalid contact (${row.email || "no email"}): email required`);
      result.skipped++;
      continue;
    }

    try {
      // Create party
      const { data: party, error: partyError } = await admin
        .from("parties")
        .insert({ display_name: sanitized.fullName ?? sanitized.email, type: "person" })
        .select("id")
        .maybeSingle();

      if (partyError || !party) {
        result.errors.push(`Failed to import contact (${sanitized.email})`);
        result.skipped++;
        continue;
      }

      // Create the contact role
      const now = new Date().toISOString();
      const { error: roleError } = await admin.from("party_roles").insert({
        party_id: party.id,
        role: "contact",
        collective_id: collectiveId,
        metadata: {
          contact_type: input.contactType,
          source: "import",
          source_detail: input.sourceDetail || null,
          tags: input.tags ?? [],
          role: sanitized.role ?? null,
          updated_at: now,
        },
      });

      if (roleError) {
        result.errors.push(`Failed to import contact (${sanitized.email})`);
        result.skipped++;
        continue;
      }

      // Store email contact method
      await admin.from("party_contact_methods").insert({
        party_id: party.id,
        type: "email",
        value: sanitized.email,
        is_primary: true,
      });

      // Store phone if provided
      if (sanitized.phone) {
        await admin.from("party_contact_methods").insert({
          party_id: party.id,
          type: "phone",
          value: sanitized.phone,
          is_primary: false,
        });
      }

      result.created++;
    } catch (rowErr) {
      console.error("[importContacts] row error:", rowErr);
      result.errors.push(`Failed to import contact (${row.email})`);
      result.skipped++;
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

  const rl = await rateLimitStrict(`add-contact:${auth.userId}`, 20, 60_000);
  if (!rl.success) return { error: "Rate limit exceeded. Try again in a minute.", contact: null };

  const validation = validateContactFields({
    fullName: data.fullName,
    email: data.email,
    phone: data.phone,
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
  const now = new Date().toISOString();

  // 1. Create party
  const { data: party, error: partyError } = await admin
    .from("parties")
    .insert({ display_name: sanitized.fullName ?? sanitized.email, type: "person" })
    .select("id, display_name, created_at")
    .maybeSingle();

  if (partyError || !party) {
    console.error("[addContact] party insert error:", partyError?.message);
    return { error: "Failed to add contact", contact: null };
  }

  // 2. Create contact role
  const { data: roleRow, error: roleError } = await admin
    .from("party_roles")
    .insert({
      party_id: party.id,
      role: "contact",
      collective_id: collectiveId,
      metadata: {
        contact_type: data.contactType,
        source: "manual",
        source_detail: "quick_add",
        tags: data.tags ?? [],
        notes: sanitized.notes ?? null,
        role: sanitized.role ?? null,
        updated_at: now,
      },
    })
    .select("id, collective_id, party_id, created_at, metadata")
    .maybeSingle();

  if (roleError || !roleRow) {
    console.error("[addContact] role insert error:", roleError?.message);
    return { error: "Failed to add contact", contact: null };
  }

  // 3. Store email contact method
  await admin.from("party_contact_methods").insert({
    party_id: party.id,
    type: "email",
    value: sanitized.email,
    is_primary: true,
  });

  // 4. Store phone if provided
  if (sanitized.phone) {
    await admin.from("party_contact_methods").insert({
      party_id: party.id,
      type: "phone",
      value: sanitized.phone,
      is_primary: false,
    });
  }

  // Build contact from what we just inserted
  const contactMethods: { id: string; type: string; value: string; is_primary: boolean }[] = [
    { id: "", type: "email", value: sanitized.email, is_primary: true },
  ];
  if (sanitized.phone) {
    contactMethods.push({ id: "", type: "phone", value: sanitized.phone, is_primary: false });
  }

  const row: ContactRow = {
    id: roleRow.id as string,
    collective_id: collectiveId,
    party_id: party.id,
    created_at: roleRow.created_at as string,
    metadata: roleRow.metadata as Record<string, unknown> | null,
    parties: {
      id: party.id,
      display_name: party.display_name,
      created_at: party.created_at,
      party_contact_methods: contactMethods,
    },
  };

  return { error: null, contact: rowToContact(row, collectiveId) };
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

  const rl = await rateLimitStrict(`update-contact:${user.id}`, 30, 60_000);
  if (!rl.success) return { error: "Rate limit exceeded. Try again in a minute.", contact: null };

  const admin = createAdminClient();

  // Fetch existing contact role
  const { data: existing } = await admin
    .from("party_roles")
    .select("collective_id, party_id, metadata")
    .eq("id", contactId)
    .eq("role", "contact")
    .maybeSingle();

  if (!existing) return { error: "Contact not found", contact: null };
  if (!existing.collective_id) return { error: "Contact not found", contact: null };

  const auth = await verifyCollectiveAccess(existing.collective_id);
  if (auth.error) return { error: auth.error, contact: null };

  const validation = validateContactFields({
    fullName: updates.fullName,
    email: updates.email,
    phone: updates.phone,
    notes: updates.notes,
    role: updates.role,
  });
  if (validation.error !== null) {
    return { error: validation.error, contact: null };
  }
  const sanitized = validation.data;

  // Update party display_name if fullName changed
  if (sanitized.fullName !== undefined && sanitized.fullName !== null) {
    await admin
      .from("parties")
      .update({ display_name: sanitized.fullName })
      .eq("id", existing.party_id);
  }

  // Update email contact method
  if (sanitized.email !== undefined && sanitized.email !== null) {
    const { count: emailCount } = await admin
      .from("party_contact_methods")
      .select("*", { count: "exact", head: true })
      .eq("party_id", existing.party_id)
      .eq("type", "email");

    if (emailCount && emailCount > 0) {
      await admin
        .from("party_contact_methods")
        .update({ value: sanitized.email })
        .eq("party_id", existing.party_id)
        .eq("type", "email");
    } else {
      await admin.from("party_contact_methods").insert({
        party_id: existing.party_id,
        type: "email",
        value: sanitized.email,
        is_primary: true,
      });
    }
  }

  // Update phone contact method
  if (sanitized.phone !== undefined) {
    const { count: phoneCount } = await admin
      .from("party_contact_methods")
      .select("*", { count: "exact", head: true })
      .eq("party_id", existing.party_id)
      .eq("type", "phone");

    if (sanitized.phone === null) {
      await admin
        .from("party_contact_methods")
        .delete()
        .eq("party_id", existing.party_id)
        .eq("type", "phone");
    } else if (phoneCount && phoneCount > 0) {
      await admin
        .from("party_contact_methods")
        .update({ value: sanitized.phone })
        .eq("party_id", existing.party_id)
        .eq("type", "phone");
    } else {
      await admin.from("party_contact_methods").insert({
        party_id: existing.party_id,
        type: "phone",
        value: sanitized.phone,
        is_primary: false,
      });
    }
  }

  // Update metadata on the party_roles row
  const now = new Date().toISOString();
  const prevMeta = (existing.metadata as Record<string, unknown>) ?? {};
  const newMeta: Record<string, unknown> = { ...prevMeta, updated_at: now };

  if (updates.tags !== undefined) newMeta.tags = updates.tags;
  if (updates.followUpAt !== undefined) newMeta.follow_up_at = updates.followUpAt;
  if (sanitized.notes !== undefined) newMeta.notes = sanitized.notes;
  if (sanitized.role !== undefined) newMeta.role = sanitized.role;

  const { error: updateError } = await admin
    .from("party_roles")
    .update({ metadata: newMeta as unknown as { [key: string]: Json | undefined } })
    .eq("id", contactId);

  if (updateError) {
    console.error("[updateContact] update error:", updateError.message);
    return { error: "Failed to update contact", contact: null };
  }

  // Re-fetch to build the response
  const { data: refreshed } = await admin
    .from("party_roles")
    .select(CONTACT_JOIN)
    .eq("id", contactId)
    .maybeSingle();

  if (!refreshed) return { error: "Failed to reload contact", contact: null };

  return {
    error: null,
    contact: rowToContact(refreshed as unknown as ContactRow, existing.collective_id as string),
  };
  } catch (err) {
    console.error("[updateContact] Unexpected error:", err);
    return { error: "Something went wrong", contact: null };
  }
}

// ── 6. getEventFanEmails ─────────────────────────────────────────────────────

export async function getEventFanEmails(
  eventId: string
): Promise<{ error: string | null; emails: string[] }> {
  try {
    if (!eventId?.trim()) return { error: "Event ID required", emails: [] };

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated", emails: [] };

    const admin = createAdminClient();

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

    // Ticket buyer emails (from order metadata)
    const { data: orders } = await admin
      .from("orders")
      .select("metadata")
      .eq("event_id", eventId)
      .eq("status", "paid");

    for (const o of (orders ?? []) as { metadata: Record<string, unknown> | null }[]) {
      const email =
        (o.metadata?.customer_email as string) ||
        (o.metadata?.buyer_email as string) ||
        (o.metadata?.email as string);
      if (email) emailSet.add(email.toLowerCase().trim());
    }

    // Guest list emails
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

export async function generateReachInsights(
  collectiveId: string
): Promise<{ error: string | null; insights: ReachInsight[] }> {
  try {
    if (!collectiveId?.trim()) return { error: "Collective ID required", insights: [] };

    const auth = await verifyCollectiveAccess(collectiveId);
    if (auth.error) return { error: auth.error, insights: [] };

    const admin = createAdminClient();

    // Fetch all contact-role rows for this collective
    const { data: contactRows } = await admin
      .from("party_roles")
      .select(CONTACT_JOIN)
      .eq("role", "contact")
      .eq("collective_id", collectiveId);

    if (!contactRows || contactRows.length === 0) return { error: null, insights: [] };

    const allContacts = (contactRows as unknown as ContactRow[]).map((row) =>
      rowToContact(row, collectiveId)
    );
    const allFans = allContacts.filter((c) => c.contactType === "fan");

    if (allFans.length === 0) return { error: null, insights: [] };

    const { count: eventCount } = await admin
      .from("events")
      .select("*", { count: "exact", head: true })
      .eq("collective_id", collectiveId)
      .is("deleted_at", null);

    const totalEvents = eventCount ?? 0;
    const insights: ReachInsight[] = [];

    const ambassadors = allFans.filter(
      (f) => f.tags?.includes("ambassador") || (f.metadata?.referrals_count as number) >= 3
    );
    const potentialAmbassadors = allFans.filter(
      (f) => f.totalEvents >= 2 && !f.tags?.includes("ambassador")
    );

    if (potentialAmbassadors.length > 0) {
      insights.push({
        id: "potential_ambassadors",
        icon: "⭐",
        title: `${potentialAmbassadors.length} fans ready to become ambassadors`,
        description: `They've come to multiple events. Give them a unique promo code, early access to tickets, and ask them to post your flyer on their story.`,
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

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const newFans = allFans.filter((f) => new Date(f.createdAt) >= thirtyDaysAgo);
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

    if (totalEvents >= 2) {
      const coreCrew = allFans.filter((f) => f.totalEvents >= totalEvents);
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

    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const dormant = allFans.filter(
      (f) => f.lastSeenAt && new Date(f.lastSeenAt) < sixtyDaysAgo && f.totalEvents >= 1
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

export async function syncContactMetrics(
  collectiveId: string
): Promise<{ error: string | null; synced: number }> {
  try {
    if (!collectiveId?.trim()) return { error: "Collective ID is required", synced: 0 };

    const auth = await verifyCollectiveAccess(collectiveId);
    if (auth.error) return { error: auth.error, synced: 0 };

    const { success: rlOk } = await rateLimitStrict(`sync-metrics:${collectiveId}`, 2, 3600_000);
    if (!rlOk) return { error: null, synced: 0 };

    const admin = createAdminClient();

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

    const allOrders: { event_id: string; total: number; metadata: Record<string, unknown> | null }[] = [];
    const BATCH = 5000;
    for (let offset = 0; ; offset += BATCH) {
      const { data: batch, error: batchErr } = await admin
        .from("orders")
        .select("event_id, total, metadata")
        .in("event_id", eventIds)
        .eq("status", "paid")
        .range(offset, offset + BATCH - 1);
      if (batchErr || !batch || batch.length === 0) break;
      allOrders.push(...(batch as typeof allOrders));
      if (batch.length < BATCH) break;
    }

    if (allOrders.length === 0) return { error: null, synced: 0 };

    const emailMetrics = new Map<string, {
      totalSpend: number;
      eventIds: Set<string>;
      lastEventDate: string;
    }>();

    for (const order of allOrders) {
      const meta = order.metadata;
      const email =
        (meta?.customer_email as string) ||
        (meta?.buyer_email as string) ||
        (meta?.email as string);
      if (!email) continue;
      const normalized = email.toLowerCase().trim();
      if (!normalized) continue;

      const existing = emailMetrics.get(normalized);
      const eventDate = eventDateMap.get(order.event_id) ?? "";

      if (existing) {
        existing.totalSpend += Number(order.total) || 0;
        existing.eventIds.add(order.event_id);
        if (eventDate > existing.lastEventDate) existing.lastEventDate = eventDate;
      } else {
        emailMetrics.set(normalized, {
          totalSpend: Number(order.total) || 0,
          eventIds: new Set([order.event_id]),
          lastEventDate: eventDate,
        });
      }
    }

    // Fetch contact roles with their email contact methods
    const { data: contactRoles } = await admin
      .from("party_roles")
      .select("id, party_id, metadata, parties(party_contact_methods(type, value))")
      .eq("role", "contact")
      .eq("collective_id", collectiveId);

    if (!contactRoles || contactRoles.length === 0) return { error: null, synced: 0 };

    let synced = 0;
    for (const cr of contactRoles as {
      id: string;
      party_id: string;
      metadata: Record<string, unknown> | null;
      parties: { party_contact_methods: { type: string; value: string }[] } | null;
    }[]) {
      const emailMethod = cr.parties?.party_contact_methods?.find((m) => m.type === "email");
      if (!emailMethod?.value) continue;

      const normalized = emailMethod.value.toLowerCase().trim();
      const metrics = emailMetrics.get(normalized);
      if (!metrics) continue;

      const prevMeta = cr.metadata ?? {};
      const updatedMeta = {
        ...prevMeta,
        total_spend: metrics.totalSpend,
        total_events: metrics.eventIds.size,
        last_seen_at: metrics.lastEventDate || null,
        updated_at: new Date().toISOString(),
      };
      await admin
        .from("party_roles")
        .update({ metadata: updatedMeta as unknown as { [key: string]: Json | undefined } })
        .eq("id", cr.id);
      synced++;
    }

    return { error: null, synced };
  } catch (err) {
    console.error("[syncContactMetrics] Unexpected error:", err);
    return { error: "Something went wrong", synced: 0 };
  }
}
