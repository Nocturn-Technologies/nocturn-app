"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TagInput } from "./tag-input";
import {
  User,
  Phone,
  Mail,
  Instagram,
  Calendar,
  MessageSquare,
  Copy,
  CheckCircle,
  Ticket,
  Music,
  Upload,
  Clock,
  Loader2,
  Pencil,
  Save,
  X,
} from "lucide-react";
import type { Contact } from "@/app/actions/contacts";

// ── Types ────────────────────────────────────────────────────────────────────

interface ContactDetailSheetProps {
  contactId: string | null;
  onClose: () => void;
  collectiveId: string;
  onContactUpdated?: () => void;
}

interface TimelineEntry {
  id: string;
  type: "ticket" | "checkin" | "inquiry" | "booking" | "import" | "note";
  title: string;
  detail?: string | null;
  date: string;
  metadata?: Record<string, unknown>;
}

// ── Constants ────────────────────────────────────────────────────────────────

const SEGMENT_BADGE_STYLES: Record<string, string> = {
  core50: "bg-amber-400/10 text-amber-400 border-amber-400/20",
  ambassadors: "bg-nocturn/10 text-nocturn border-nocturn/20",
  repeat: "bg-green-400/10 text-green-400 border-green-400/20",
  new: "bg-blue-400/10 text-blue-400 border-blue-400/20",
  vip: "bg-rose-400/10 text-rose-400 border-rose-400/20",
};

const ROLE_BADGE_STYLES: Record<string, string> = {
  artist: "bg-nocturn/15 text-nocturn-light border-nocturn/25",
  venue: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  photographer: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  videographer: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  promoter: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

const ROLE_LABELS: Record<string, string> = {
  artist: "DJ / Artist",
  venue: "Venue",
  photographer: "Photographer",
  videographer: "Videographer",
  promoter: "Promoter",
  sound_production: "Sound",
  lighting_production: "Lighting",
  sponsor: "Sponsor",
  artist_manager: "Manager",
  tour_manager: "Tour Manager",
  booking_agent: "Booking",
  graphic_designer: "Design",
  mc_host: "MC / Host",
  event_staff: "Staff",
  pr_publicist: "PR / Publicist",
  collective: "Collective",
};

const ROLE_OPTIONS = Object.entries(ROLE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const TIMELINE_ICONS: Record<string, typeof Ticket> = {
  ticket: Ticket,
  checkin: CheckCircle,
  inquiry: MessageSquare,
  booking: Music,
  import: Upload,
  note: MessageSquare,
};

// ── Component ───────────────────────────────────────────────────────────────

export function ContactDetailSheet({
  contactId,
  onClose,
  collectiveId: _collectiveId,
  onContactUpdated,
}: ContactDetailSheetProps) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit mode for identity fields
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editInstagram, setEditInstagram] = useState("");
  const [editRole, setEditRole] = useState("");
  const [savingIdentity, setSavingIdentity] = useState(false);

  // Editable fields (always inline)
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editNotes, setEditNotes] = useState("");
  const [editFollowUp, setEditFollowUp] = useState("");
  const [savingTags, setSavingTags] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [savingFollowUp, setSavingFollowUp] = useState(false);
  const [copied, setCopied] = useState(false);

  const notesRef = useRef<HTMLTextAreaElement>(null);

  // Populate edit fields from contact
  const populateEditFields = useCallback((c: Contact) => {
    setEditName(c.fullName ?? "");
    setEditEmail(c.email ?? "");
    setEditPhone(c.phone ?? "");
    setEditInstagram(c.instagram ?? "");
    setEditRole(c.role ?? "");
    setEditTags(c.tags ?? []);
    setEditNotes(c.notes ?? "");
    setEditFollowUp(c.followUpAt?.split("T")[0] ?? "");
  }, []);

  // Fetch contact detail
  const fetchContact = useCallback(async () => {
    if (!contactId) return;
    setLoading(true);
    setError(null);
    try {
      const { getContactDetail } = await import("@/app/actions/contacts");
      const result = await getContactDetail(contactId);
      if (result.error) {
        setError(result.error);
      } else if (result.detail) {
        setContact(result.detail.contact);
        populateEditFields(result.detail.contact);
        setTimeline(result.detail.timeline ?? []);
      }
    } catch {
      setError("Failed to load contact.");
    } finally {
      setLoading(false);
    }
  }, [contactId, populateEditFields]);

  useEffect(() => {
    if (contactId) {
      setEditing(false);
      fetchContact();
    } else {
      setContact(null);
      setTimeline([]);
    }
  }, [contactId, fetchContact]);

  // Save identity fields
  const handleSaveIdentity = useCallback(async () => {
    if (!contactId || !contact) return;
    setSavingIdentity(true);
    try {
      const { updateContact } = await import("@/app/actions/contacts");
      const result = await updateContact(contactId, {
        fullName: editName || undefined,
        email: editEmail || undefined,
        phone: editPhone || undefined,
        instagram: editInstagram || undefined,
        ...(contact.contactType === "industry" && editRole
          ? { role: editRole }
          : {}),
      });
      if (result.contact) {
        setContact(result.contact);
        populateEditFields(result.contact);
        onContactUpdated?.();
      }
    } catch {
      // Silent fail
    } finally {
      setSavingIdentity(false);
      setEditing(false);
    }
  }, [
    contactId,
    contact,
    editName,
    editEmail,
    editPhone,
    editInstagram,
    editRole,
    populateEditFields,
    onContactUpdated,
  ]);

  // Cancel editing
  const handleCancelEdit = useCallback(() => {
    if (contact) populateEditFields(contact);
    setEditing(false);
  }, [contact, populateEditFields]);

  // Auto-save tags
  const handleTagsChange = useCallback(
    async (newTags: string[]) => {
      setEditTags(newTags);
      if (!contactId) return;
      setSavingTags(true);
      try {
        const { updateContact } = await import("@/app/actions/contacts");
        await updateContact(contactId, { tags: newTags });
        onContactUpdated?.();
      } catch {
        // Silent fail — will be retried
      } finally {
        setSavingTags(false);
      }
    },
    [contactId, onContactUpdated]
  );

  // Auto-save notes on blur
  const handleNotesBlur = useCallback(async () => {
    if (!contactId || editNotes === (contact?.notes ?? "")) return;
    setSavingNotes(true);
    try {
      const { updateContact } = await import("@/app/actions/contacts");
      await updateContact(contactId, { notes: editNotes });
    } catch {
      // Silent fail
    } finally {
      setSavingNotes(false);
    }
  }, [contactId, editNotes, contact?.notes]);

  // Auto-save follow-up
  const handleFollowUpChange = useCallback(
    async (value: string) => {
      setEditFollowUp(value);
      if (!contactId) return;
      setSavingFollowUp(true);
      try {
        const { updateContact } = await import("@/app/actions/contacts");
        await updateContact(contactId, { followUpAt: value || null });
      } catch {
        // Silent fail
      } finally {
        setSavingFollowUp(false);
      }
    },
    [contactId]
  );

  // Copy email
  const handleCopyEmail = useCallback(async () => {
    if (!contact?.email) return;
    try {
      await navigator.clipboard.writeText(contact.email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  }, [contact?.email]);

  // Relative date formatter
  function relativeDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
    return `${Math.floor(diffDays / 365)}y ago`;
  }

  function getInitials(): string {
    if (contact?.fullName) {
      return contact.fullName
        .split(" ")
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase();
    }
    return contact?.email?.[0]?.toUpperCase() ?? "?";
  }

  const open = !!contactId;

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md overflow-y-auto"
      >
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-nocturn" />
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center gap-3 py-20">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchContact}>
              Retry
            </Button>
          </div>
        )}

        {contact && !loading && !error && (
          <>
            {/* Header */}
            <SheetHeader className="pb-0">
              <div className="flex items-start gap-3">
                <div className="h-12 w-12 shrink-0 rounded-full bg-nocturn/10 flex items-center justify-center border-2 border-card">
                  {(contact.metadata as Record<string, unknown>)
                    ?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={
                        (contact.metadata as Record<string, unknown>)
                          .avatar_url as string
                      }
                      alt="Contact avatar"
                      className="h-full w-full rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-sm font-bold text-nocturn/60 select-none">
                      {getInitials() || (
                        <User className="h-5 w-5 text-nocturn/50" />
                      )}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <SheetTitle className="truncate">
                      {contact.fullName || contact.email}
                    </SheetTitle>
                    {!editing ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 min-h-[44px] min-w-[44px] p-0 shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={() => setEditing(true)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    ) : (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 min-h-[44px] min-w-[44px] p-0 text-muted-foreground hover:text-foreground"
                          onClick={handleCancelEdit}
                          disabled={savingIdentity}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 min-h-[44px] min-w-[44px] p-0 text-nocturn hover:text-nocturn-light"
                          onClick={handleSaveIdentity}
                          disabled={savingIdentity}
                        >
                          {savingIdentity ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Save className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                  {!editing && contact.fullName && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {contact.email}
                    </p>
                  )}
                  {!editing && (
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      {contact.contactType === "industry" &&
                        contact.role && (
                          <Badge
                            variant="outline"
                            className={`text-[11px] uppercase tracking-wide ${
                              ROLE_BADGE_STYLES[contact.role] ??
                              "bg-muted/60 text-muted-foreground"
                            }`}
                          >
                            {ROLE_LABELS[contact.role] ?? contact.role}
                          </Badge>
                        )}
                      {contact.contactType === "fan" &&
                        !!(contact.metadata as Record<string, unknown>)
                          ?.segment && (
                          <Badge
                            variant="outline"
                            className={`text-[11px] ${SEGMENT_BADGE_STYLES[(contact.metadata as Record<string, unknown>).segment as string] ?? ""}`}
                          >
                            {
                              (contact.metadata as Record<string, unknown>)
                                .segment as string
                            }
                          </Badge>
                        )}
                    </div>
                  )}
                </div>
              </div>
            </SheetHeader>

            {/* ── Edit mode: identity fields ── */}
            {editing && (
              <div className="px-4 py-3 space-y-3 border-b border-border/50">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Name</Label>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Full name"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      placeholder="email@example.com"
                      type="email"
                      className="h-9 pl-9"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Phone</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="+1 (416) 555-0123"
                      type="tel"
                      className="h-9 pl-9"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Instagram
                  </Label>
                  <div className="relative">
                    <Instagram className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={editInstagram}
                      onChange={(e) => setEditInstagram(e.target.value)}
                      placeholder="username"
                      className="h-9 pl-9"
                    />
                  </div>
                </div>
                {contact.contactType === "industry" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Role
                    </Label>
                    <select
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value)}
                      className="w-full h-9 rounded-lg border border-input bg-transparent px-3 text-base md:text-sm text-foreground transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                    >
                      <option value="">Select role...</option>
                      {ROLE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Quick info row (view mode) */}
            {!editing && (
              <div className="px-4 py-3 space-y-1.5">
                {contact.email && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Mail className="h-3 w-3 shrink-0" />
                    <a
                      href={`mailto:${contact.email}`}
                      className="hover:text-foreground transition-colors truncate"
                    >
                      {contact.email}
                    </a>
                    <button
                      onClick={handleCopyEmail}
                      className="shrink-0 text-muted-foreground/60 hover:text-foreground transition-colors"
                    >
                      {copied ? (
                        <CheckCircle className="h-3 w-3 text-green-400" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                )}
                {contact.phone && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Phone className="h-3 w-3 shrink-0" />
                    <a
                      href={`tel:${contact.phone}`}
                      className="hover:text-foreground transition-colors"
                    >
                      {contact.phone}
                    </a>
                  </div>
                )}
                {contact.instagram && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Instagram className="h-3 w-3 shrink-0" />
                    <a
                      href={`https://instagram.com/${contact.instagram.replace(/^@/, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-pink-400 transition-colors"
                    >
                      @{contact.instagram.replace(/^@/, "")}
                    </a>
                  </div>
                )}
                <div className="flex items-center gap-3 pt-1 text-xs text-muted-foreground">
                  {(contact.totalEvents ?? 0) > 0 && (
                    <span className="flex items-center gap-1">
                      <Ticket className="h-3 w-3" />
                      {contact.totalEvents} event
                      {(contact.totalEvents ?? 0) !== 1 ? "s" : ""}
                    </span>
                  )}
                  {(contact.totalSpend ?? 0) > 0 && (
                    <span className="text-nocturn font-medium">
                      ${(contact.totalSpend ?? 0).toFixed(2)} spent
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Sections */}
            <div className="px-4 space-y-5 pb-6">
              {/* Tags */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                    Tags
                  </Label>
                  {savingTags && (
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  )}
                </div>
                <TagInput
                  tags={editTags}
                  onChange={handleTagsChange}
                  placeholder="Add tags..."
                />
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                    Notes
                  </Label>
                  {savingNotes && (
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  )}
                </div>
                <textarea
                  ref={notesRef}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  onBlur={handleNotesBlur}
                  placeholder="Add notes about this contact..."
                  rows={3}
                  className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base md:text-sm text-foreground placeholder:text-muted-foreground transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none dark:bg-input/30"
                />
              </div>

              {/* Follow-up */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Follow Up
                  </Label>
                  {savingFollowUp && (
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  )}
                </div>
                <Input
                  type="date"
                  value={editFollowUp}
                  onChange={(e) => handleFollowUpChange(e.target.value)}
                  className="w-full"
                />
              </div>

              {/* Timeline */}
              {timeline.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                    Timeline
                  </Label>
                  <div className="space-y-0.5 max-h-64 overflow-y-auto">
                    {timeline.map((entry) => {
                      const Icon = TIMELINE_ICONS[entry.type] ?? Calendar;
                      return (
                        <div
                          key={entry.id}
                          className="flex items-start gap-3 rounded-lg p-2 hover:bg-white/[0.02] transition-colors"
                        >
                          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/5">
                            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-foreground leading-tight">
                              {entry.title}
                            </p>
                            {entry.detail && (
                              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                                {entry.detail}
                              </p>
                            )}
                          </div>
                          <span className="text-[11px] text-muted-foreground/70 shrink-0 mt-0.5">
                            {relativeDate(entry.date)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2">
                {contact.marketplaceProfileId && (
                  <Button
                    size="sm"
                    className="flex-1 bg-nocturn hover:bg-nocturn-light text-white min-h-[44px]"
                    onClick={() => {
                      // Open contact dialog — parent page handles this via profile_id
                    }}
                  >
                    <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                    Message
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={handleCopyEmail}
                >
                  {copied ? (
                    <>
                      <CheckCircle className="mr-1.5 h-3.5 w-3.5 text-green-400" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                      Copy email
                    </>
                  )}
                </Button>
                {!editing && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-[44px]"
                    onClick={() => setEditing(true)}
                  >
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    Edit
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
