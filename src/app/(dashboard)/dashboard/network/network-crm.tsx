"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Users,
  Music2,
  Bookmark,
  MapPin,
  Search,
  Instagram,
  Globe,
  Heart,
  MessageSquare,
  User,
  Upload,
  Plus,
  Mail,
  Phone,
  Loader2,
} from "lucide-react";
import {
  getNetworkCRM,
  type IndustryContact,
  type NetworkCRMStats,
  type RelationshipTag,
} from "@/app/actions/network-crm";
import { getContacts, type Contact } from "@/app/actions/contacts";
import { saveProfile, unsaveProfile } from "@/app/actions/marketplace";
import { ContactDialog } from "../discover/contact-dialog";
import { ImportSheet } from "@/components/people/import-sheet";
import { ContactDetailSheet } from "@/components/people/contact-detail-sheet";
import { haptic } from "@/lib/haptics";
import { TYPE_BADGE_COLORS, TYPE_LABELS_SHORT } from "@/lib/marketplace-constants";

// ── Constants ──────────────────────────────────────────────────────────────────

type RelFilter = "all" | RelationshipTag;

// All 17 category types (matches discover page CATEGORY_TABS)
const ALL_CATEGORY_TYPES = [
  { label: "All", value: "all" },
  { label: "DJs", value: "artist" },
  { label: "Venues", value: "venue" },
  { label: "Collectives", value: "collective" },
  { label: "Promoters", value: "promoter" },
  { label: "Managers", value: "artist_manager" },
  { label: "Tour Mgrs", value: "tour_manager" },
  { label: "Agents", value: "booking_agent" },
  { label: "Photo", value: "photographer" },
  { label: "Video", value: "videographer" },
  { label: "MC / Host", value: "mc_host" },
  { label: "Designers", value: "graphic_designer" },
  { label: "Sound", value: "sound_production" },
  { label: "Lighting", value: "lighting_production" },
  { label: "Staff", value: "event_staff" },
  { label: "PR", value: "pr_publicist" },
  { label: "Sponsors", value: "sponsor" },
] as const;

const RELATIONSHIP_FILTERS: { label: string; value: RelFilter }[] = [
  { label: "All", value: "all" },
  { label: "Booked", value: "Booked" },
  { label: "Saved", value: "Saved" },
  { label: "Connected", value: "Connected" },
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface NetworkCRMProps {
  collectiveId?: string;
}

// ── Relationship badge ─────────────────────────────────────────────────────────

function RelBadge({ tag }: { tag: RelationshipTag }) {
  const styles: Record<RelationshipTag, string> = {
    Booked:
      "bg-nocturn/15 text-nocturn-light border border-nocturn/25",
    Saved:
      "bg-rose-500/10 text-rose-400 border border-rose-500/20",
    Connected:
      "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  };

  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase ${styles[tag]}`}
    >
      {tag}
    </span>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  iconBg,
  iconColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <Card className="border-border/50">
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconBg}`}
        >
          <span className={iconColor}>{icon}</span>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold truncate">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Soundcloud icon (not in lucide) ───────────────────────────────────────────

function SoundcloudIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M11.56 8.87V17h8.76c.82-.09 1.49-.8 1.49-1.65s-.68-1.57-1.51-1.64c.2-.48.31-.99.31-1.53 0-2.17-1.76-3.93-3.93-3.93-.84 0-1.62.26-2.26.71-.5-1.84-2.18-3.2-4.19-3.2-2.4 0-4.34 1.94-4.34 4.34 0 .28.03.55.07.82C4.08 11.41 3 12.64 3 14.1c0 1.59 1.3 2.9 2.9 2.9h1.73V8.87a.93.93 0 0 1 1.86 0v8.13h1.86V8.87a.93.93 0 0 1 1.21-.87z" />
    </svg>
  );
}

// ── Contact card ──────────────────────────────────────────────────────────────

interface ContactCardProps {
  contact: IndustryContact;
  savedIds: Set<string>;
  onSave: (id: string) => void;
  onUnsave: (id: string) => void;
  onContact: (contact: IndustryContact) => void;
  onClick: (contact: IndustryContact) => void;
}

function ContactCard({
  contact,
  savedIds,
  onSave,
  onUnsave,
  onContact,
  onClick,
}: ContactCardProps) {
  const type = contact.type ?? "artist";
  const badgeColor =
    TYPE_BADGE_COLORS[type] ?? "bg-muted/60 text-muted-foreground";
  const typeLabel = TYPE_LABELS_SHORT[type] ?? type;

  const isSaved = savedIds.has(contact.profileId ?? contact.id);

  const lastDate = contact.lastCollabDate
    ? new Date(contact.lastCollabDate).toLocaleDateString("en", {
        month: "short",
        year: "numeric",
      })
    : null;

  const initials = contact.name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <Card
      className="overflow-hidden border-border/50 hover:border-border/80 transition-all group bg-card/60 cursor-pointer"
      onClick={() => onClick(contact)}
    >
      {/* Header row: avatar + name + badge */}
      <div className="flex items-center gap-2.5 px-3 pt-2.5">
        <div className="h-8 w-8 shrink-0 rounded-full bg-nocturn/10 flex items-center justify-center overflow-hidden ring-1 ring-nocturn/20">
          {contact.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={contact.avatarUrl}
              alt={contact.name}
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <span className="text-[11px] font-bold text-nocturn/60 select-none">
              {initials || <User className="h-3.5 w-3.5 text-nocturn/50" />}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold font-heading text-sm leading-tight truncate">
            {contact.name}
          </h3>
          {contact.city && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <MapPin className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{contact.city}</span>
            </div>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${badgeColor}`}
        >
          {typeLabel}
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-1.5 px-3 pt-1.5 pb-1">
        {/* Events + last collab */}
        {(contact.eventsWorked > 0 || lastDate) && (
          <div className="flex items-center gap-2 text-[11px]">
            {contact.eventsWorked > 0 && (
              <span className="text-nocturn font-medium">
                {contact.eventsWorked} event{contact.eventsWorked !== 1 ? "s" : ""} together
              </span>
            )}
            {contact.eventsWorked > 0 && lastDate && (
              <span className="text-muted-foreground/40">·</span>
            )}
            {lastDate && (
              <span className="text-muted-foreground/70">Last: {lastDate}</span>
            )}
          </div>
        )}

        {/* Relationship badges */}
        {contact.relationships.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {contact.relationships.map((tag) => (
              <RelBadge key={tag} tag={tag} />
            ))}
          </div>
        )}

        {/* Contact info */}
        {(contact.email || contact.phone) && (
          <div className="space-y-0.5">
            {contact.email && (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground truncate">
                <Mail className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{contact.email}</span>
              </div>
            )}
            {contact.phone && (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Phone className="h-2.5 w-2.5 shrink-0" />
                <a
                  href={`tel:${contact.phone}`}
                  onClick={(e) => e.stopPropagation()}
                  className="hover:text-foreground transition-colors"
                >
                  {contact.phone}
                </a>
              </div>
            )}
          </div>
        )}

        {/* Social links */}
        <div className="flex items-center gap-2">
          {contact.instagramHandle && (
            <a
              href={`https://instagram.com/${contact.instagramHandle.replace(/^@/, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-pink-400 transition-colors"
              title="Instagram"
            >
              <Instagram className="h-3 w-3" />
              <span className="truncate max-w-[80px]">
                @{contact.instagramHandle.replace(/^@/, "")}
              </span>
            </a>
          )}
          {contact.soundcloudUrl && (
            <a
              href={contact.soundcloudUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-muted-foreground hover:text-orange-400 transition-colors"
              title="SoundCloud"
            >
              <SoundcloudIcon className="h-3.5 w-3.5" />
            </a>
          )}
          {contact.spotifyUrl && (
            <a
              href={contact.spotifyUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-muted-foreground hover:text-green-400 transition-colors"
              title="Spotify"
            >
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
              </svg>
            </a>
          )}
          {contact.websiteUrl && (
            <a
              href={contact.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Website"
            >
              <Globe className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1.5 px-3 pb-2.5 pt-1">
        {contact.profileId ? (
          <Button
            size="sm"
            className="flex-1 bg-nocturn hover:bg-nocturn-light text-white h-9 min-h-[44px] text-xs"
            onClick={(e) => {
              e.stopPropagation();
              haptic("light");
              onContact(contact);
            }}
          >
            <MessageSquare className="mr-1.5 h-3 w-3" />
            Contact
          </Button>
        ) : (
          <div className="flex-1" />
        )}

        {contact.profileId && (
          <Button
            size="icon"
            variant="ghost"
            aria-label={isSaved ? "Unsave contact" : "Save contact"}
            aria-pressed={isSaved}
            className={`shrink-0 h-9 w-9 min-h-[44px] min-w-[44px] ${
              isSaved
                ? "text-rose-400 hover:text-rose-300"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={(e) => {
              e.stopPropagation();
              haptic("light");
              if (contact.profileId) {
                isSaved ? onUnsave(contact.profileId) : onSave(contact.profileId);
              }
            }}
          >
            <Heart className={`h-3.5 w-3.5 ${isSaved ? "fill-rose-400" : ""}`} />
          </Button>
        )}
      </div>
    </Card>
  );
}

// ── Helper: Convert Contact (from contacts table) → IndustryContact shape ────

function contactToIndustry(c: Contact): IndustryContact {
  const meta = c.metadata ?? {};
  return {
    id: c.id,
    name: c.fullName ?? c.email ?? "Unknown",
    type: c.role ?? "other",
    avatarUrl: (meta.avatar_url as string) ?? null,
    city: (meta.city as string) ?? null,
    email: c.email ?? null,
    phone: c.phone ?? null,
    instagramHandle: null,
    soundcloudUrl: (meta.soundcloud_url as string) ?? null,
    spotifyUrl: (meta.spotify_url as string) ?? null,
    websiteUrl: (meta.website_url as string) ?? null,
    eventsWorked: c.totalEvents ?? 0,
    lastCollabDate: c.lastSeenAt ?? null,
    isSaved: false,
    relationships: c.source === "import" ? ["Connected"] : [],
    profileId: c.marketplaceProfileId ?? null,
    slug: null,
    _contactsTableId: c.id,
  };
}

// ── Main Component ────────────────────────────────────────────────────────────

export function NetworkCRM({ collectiveId }: NetworkCRMProps) {
  const [networkContacts, setNetworkContacts] = useState<IndustryContact[]>([]);
  const [importedContacts, setImportedContacts] = useState<IndustryContact[]>([]);
  const [stats, setStats] = useState<NetworkCRMStats>({
    totalContacts: 0,
    bookedArtists: 0,
    savedProfiles: 0,
    cities: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  // Local saved IDs for optimistic UI
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [relFilter, setRelFilter] = useState<RelFilter>("all");
  const [catFilter, setCatFilter] = useState<string>("all");

  // Contact dialog (for messaging via marketplace profile)
  const [contactTarget, setContactTarget] = useState<{
    id: string;
    name: string;
    type: string;
    city: string;
  } | null>(null);

  // Import sheet
  const [importOpen, setImportOpen] = useState(false);
  const [importDefaultTab, setImportDefaultTab] = useState<"paste" | "csv" | "quick">("paste");

  // Contact detail sheet
  const [detailContactId, setDetailContactId] = useState<string | null>(null);

  // ── Merge & dedupe contacts from both sources ─────────────────────────────

  const contacts = useMemo(() => {
    // Dedupe across two sources (marketplace network + imported contacts
    // table). Prefer EMAIL as the dedup key — two DJs can share a stage name
    // ("Sam"), but they can't share an email. Fall back to a normalized name
    // key only when no email is available on either side.
    const emailKey = (c: IndustryContact): string | null =>
      c.email ? c.email.toLowerCase().trim() : null;
    const nameKey = (c: IndustryContact): string =>
      c.name.toLowerCase().replace(/\s+/g, " ").trim();

    const seenEmails = new Set<string>();
    const seenNames = new Set<string>();
    const seenIds = new Set<string>();
    const result: IndustryContact[] = [];

    const tryAdd = (c: IndustryContact) => {
      if (seenIds.has(c.id)) return;
      const ek = emailKey(c);
      if (ek && seenEmails.has(ek)) return;
      // Only fall back to name dedup when BOTH sides lack an email —
      // otherwise we'd drop distinct people who happen to share a first name.
      const nk = nameKey(c);
      if (!ek && nk && seenNames.has(nk)) return;

      seenIds.add(c.id);
      if (ek) seenEmails.add(ek);
      if (!ek && nk) seenNames.add(nk);
      result.push(c);
    };

    // Network contacts first (richer data).
    for (const c of networkContacts) tryAdd(c);
    // Then imported contacts — will be skipped if duplicate.
    for (const c of importedContacts) tryAdd(c);

    return result;
  }, [networkContacts, importedContacts]);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch from both sources in parallel
      const promises: [
        Promise<{ error: string | null; contacts: IndustryContact[]; stats: NetworkCRMStats }>,
        Promise<{ error: string | null; contacts: Contact[]; totalCount: number; segmentCounts: Record<string, number> }> | null,
      ] = [
        Promise.race([
          getNetworkCRM(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), 20000)
          ),
        ]),
        null,
      ];

      // Only fetch from contacts table if we have a collectiveId
      if (collectiveId) {
        promises[1] = getContacts(collectiveId, { contactType: "industry" });
      }

      const [networkResult, contactsResult] = await Promise.all([
        promises[0],
        promises[1] ?? Promise.resolve({ error: null, contacts: [], totalCount: 0, segmentCounts: {} }),
      ]);

      if (networkResult.error) {
        setError(networkResult.error);
      } else {
        setNetworkContacts(networkResult.contacts);
        setStats(networkResult.stats);
        // Seed saved IDs from contacts
        const saved = new Set(
          networkResult.contacts
            .filter((c) => c.isSaved && c.profileId)
            .map((c) => c.profileId as string)
        );
        setSavedIds(saved);
      }

      // Merge in imported contacts (non-error). We intentionally do NOT bump
      // stats.totalContacts from here — the merged `contacts` memo below
      // deduplicates across sources, and the stats strip is rewritten from
      // that memo in a separate effect. Previously this added the raw
      // imported count, overstating total when the same person showed up in
      // both lists.
      if (!contactsResult.error && contactsResult.contacts.length > 0) {
        const converted = contactsResult.contacts.map(contactToIndustry);
        setImportedContacts(converted);
      }
    } catch {
      setError("Failed to load your network. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [collectiveId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Keep stats.totalContacts in sync with the deduplicated merge (otherwise
  // the "Total Contacts" card over-counts people who are in both sources).
  useEffect(() => {
    setStats((prev) =>
      prev.totalContacts === contacts.length ? prev : { ...prev, totalContacts: contacts.length }
    );
  }, [contacts.length]);

  // ── Save / unsave ──────────────────────────────────────────────────────────

  async function handleSave(profileId: string) {
    setSavedIds((prev) => new Set(prev).add(profileId));
    const { error: err } = await saveProfile(profileId);
    if (err) {
      setSavedIds((prev) => {
        const next = new Set(prev);
        next.delete(profileId);
        return next;
      });
    }
  }

  async function handleUnsave(profileId: string) {
    setSavedIds((prev) => {
      const next = new Set(prev);
      next.delete(profileId);
      return next;
    });
    const { error: err } = await unsaveProfile(profileId);
    if (err) {
      setSavedIds((prev) => new Set(prev).add(profileId));
    }
  }

  // ── Category counts (only show chips with >= 1 contact) ───────────────────

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of contacts) {
      const t = c.type ?? "other";
      counts[t] = (counts[t] ?? 0) + 1;
    }
    return counts;
  }, [contacts]);

  const visibleCategories = useMemo(() => {
    return ALL_CATEGORY_TYPES.filter(
      (cat) => cat.value === "all" || (categoryCounts[cat.value] ?? 0) > 0
    );
  }, [categoryCounts]);

  // ── Filter ─────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return contacts.filter((c) => {
      // Relationship filter
      if (relFilter !== "all" && !c.relationships.includes(relFilter as RelationshipTag)) {
        return false;
      }

      // Category filter
      if (catFilter !== "all") {
        if (c.type !== catFilter) return false;
      }

      // Search
      const q = searchQuery.toLowerCase().trim();
      if (q && !c.name.toLowerCase().includes(q)) return false;

      return true;
    });
  }, [contacts, relFilter, catFilter, searchQuery]);

  // Filter counts for relationship chips
  const relCounts = useMemo(() => {
    const counts: Record<RelFilter, number> = {
      all: contacts.length,
      Booked: 0,
      Saved: 0,
      Connected: 0,
    };
    for (const c of contacts) {
      for (const r of c.relationships) counts[r]++;
    }
    return counts;
  }, [contacts]);

  // ── Handle contact card click → open detail sheet ─────────────────────────

  function handleCardClick(contact: IndustryContact) {
    // If this contact has a contacts-table ID, open the detail sheet
    if (contact._contactsTableId) {
      setDetailContactId(contact._contactsTableId);
    }
  }

  // ── Handle import complete → refresh data ─────────────────────────────────

  function handleImportComplete() {
    // Refresh data to include newly imported contacts
    fetchData();
  }

  // ── Open import sheet with quick add tab ──────────────────────────────────

  function openQuickAdd() {
    setImportDefaultTab("quick");
    setImportOpen(true);
  }

  function openImport() {
    setImportDefaultTab("paste");
    setImportOpen(true);
  }

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-nocturn border-t-transparent" />
          <p className="text-xs text-muted-foreground">Loading your network...</p>
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10">
          <p className="text-sm text-destructive">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              setRetrying(true);
              try {
                await fetchData();
              } finally {
                setRetrying(false);
              }
            }}
            disabled={retrying}
            className="min-h-[44px]"
          >
            {retrying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {retrying ? "Retrying..." : "Retry"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────────

  if (contacts.length === 0) {
    return (
      <>
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-14">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-nocturn/10">
              <Users className="h-8 w-8 text-nocturn" />
            </div>
            <div className="text-center max-w-xs">
              <p className="font-semibold text-lg">Your network is empty</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Discover and save profiles, book artists, or import your contacts
                to start building your industry network.
              </p>
            </div>
            {collectiveId && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="bg-nocturn hover:bg-nocturn-light text-white min-h-[44px]"
                  onClick={openImport}
                >
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                  Import Contacts
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={openQuickAdd}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Quick Add
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Import Sheet */}
        {collectiveId && (
          <ImportSheet
            open={importOpen}
            onOpenChange={setImportOpen}
            collectiveId={collectiveId}
            contactType="industry"
            onImportComplete={handleImportComplete}
          />
        )}
      </>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Stats bar + action buttons */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            icon={<Users className="h-5 w-5" />}
            label="Total Contacts"
            value={stats.totalContacts}
            iconBg="bg-nocturn/10"
            iconColor="text-nocturn"
          />
          <StatCard
            icon={<Music2 className="h-5 w-5" />}
            label="Booked Artists"
            value={stats.bookedArtists}
            iconBg="bg-nocturn/10"
            iconColor="text-nocturn-light"
          />
          <StatCard
            icon={<Bookmark className="h-5 w-5" />}
            label="Saved Profiles"
            value={stats.savedProfiles}
            iconBg="bg-rose-500/10"
            iconColor="text-rose-400"
          />
          <StatCard
            icon={<MapPin className="h-5 w-5" />}
            label="Cities"
            value={stats.cities}
            iconBg="bg-emerald-500/10"
            iconColor="text-emerald-400"
          />
        </div>
      </div>

      {/* Import + Quick Add buttons */}
      {collectiveId && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="min-h-[44px] text-xs"
            onClick={openImport}
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            Import
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="min-h-[44px] min-w-[44px]"
            onClick={openQuickAdd}
            title="Quick add contact"
            aria-label="Quick add contact"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name..."
          className="pl-10"
        />
      </div>

      {/* Relationship filter chips */}
      <div className="flex gap-1.5 flex-wrap">
        {RELATIONSHIP_FILTERS.map(({ label, value }) => {
          const isActive = relFilter === value;
          const count = relCounts[value];

          let chipClass = "";
          if (isActive) {
            if (value === "all") chipClass = "bg-nocturn text-white";
            else if (value === "Booked") chipClass = "bg-nocturn text-white";
            else if (value === "Saved") chipClass = "bg-rose-500 text-white";
            else chipClass = "bg-blue-500 text-white";
          } else {
            chipClass =
              "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted";
          }

          return (
            <button
              key={value}
              onClick={() => setRelFilter(value)}
              className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors min-h-[44px] ${chipClass}`}
            >
              {label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                  isActive ? "bg-white/20" : "bg-muted"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Category filter chips — all 17 types, only show those with >= 1 contact */}
      <div className="-mx-1 px-1">
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {visibleCategories.map(({ label, value }) => {
            const isActive = catFilter === value;
            const count = value === "all" ? contacts.length : (categoryCounts[value] ?? 0);
            return (
              <button
                key={value}
                onClick={() => setCatFilter(value)}
                className={`shrink-0 flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors min-h-[44px] ${
                  isActive
                    ? "bg-white/10 text-foreground border border-white/20"
                    : "bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {label}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                    isActive ? "bg-white/15" : "bg-muted/80"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Result count */}
      <p className="text-xs text-muted-foreground">
        {filtered.length} contact{filtered.length !== 1 ? "s" : ""}
        {relFilter !== "all" && ` · ${relFilter}`}
        {catFilter !== "all" && ` · ${visibleCategories.find((f) => f.value === catFilter)?.label}`}
        {searchQuery && ` · matching "${searchQuery}"`}
      </p>

      {/* Contact grid */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground">
              No contacts match your filters.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((contact) => (
            <ContactCard
              key={`${contact.profileId ?? "c"}-${contact.id}`}
              contact={contact}
              savedIds={savedIds}
              onSave={handleSave}
              onUnsave={handleUnsave}
              onContact={(c) => {
                if (c.profileId) {
                  setContactTarget({
                    id: c.profileId,
                    name: c.name,
                    type: c.type,
                    city: c.city ?? "",
                  });
                }
              }}
              onClick={handleCardClick}
            />
          ))}
        </div>
      )}

      {/* Contact dialog (for messaging) */}
      <ContactDialog
        profileId={contactTarget?.id ?? ""}
        profileName={contactTarget?.name ?? ""}
        open={!!contactTarget}
        onOpenChange={(open) => {
          if (!open) setContactTarget(null);
        }}
      />

      {/* Import Sheet */}
      {collectiveId && (
        <ImportSheet
          open={importOpen}
          onOpenChange={setImportOpen}
          collectiveId={collectiveId}
          contactType="industry"
          defaultTab={importDefaultTab}
          onImportComplete={handleImportComplete}
        />
      )}

      {/* Contact Detail Sheet */}
      {collectiveId && (
        <ContactDetailSheet
          contactId={detailContactId}
          onClose={() => setDetailContactId(null)}
          collectiveId={collectiveId}
          onContactUpdated={handleImportComplete}
        />
      )}
    </div>
  );
}

export default NetworkCRM;
