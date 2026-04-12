"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  MessageSquare,
  Hash,
  Calendar,
  Users,
  Plus,
  Search,
  Loader2,
  X,
  Mic,
  Mail,
  Send,
  Check,
  Inbox,
  ArrowUpRight,
  Clock,
} from "lucide-react";
import {
  getCollabChannels,
  searchCollectives,
  startCollabChat,
  inviteToCollab,
} from "@/app/actions/collab";
import {
  getSentInquiries,
  getReceivedInquiries,
  acceptInquiry,
  rejectInquiry,
  type InquiryItem,
} from "@/app/actions/inquiries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Channel {
  id: string;
  collective_id: string;
  event_id: string | null;
  partner_collective_id?: string | null;
  name: string;
  type: "general" | "event" | "collab";
  created_at: string;
  metadata?: Record<string, string>;
}

interface ChannelWithMeta extends Channel {
  last_message?: string;
  last_message_at?: string | null;
  unread: boolean;
  unread_count: number;
  event_date?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function hashColor(name: string): string {
  const colors = [
    "#7B2FF7", "#E84393", "#00B894", "#0984E3", "#FDCB6E",
    "#E17055", "#6C5CE7", "#00CEC9", "#FF7675", "#55EFC4",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function getInitials(name: string): string {
  return name
    .split(/[\s×·&]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

function relativeTime(dateStr: string | undefined): string {
  if (!dateStr) return "";
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) {
    return new Date(dateStr).toLocaleDateString("en", { weekday: "short" });
  }
  return new Date(dateStr).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
  });
}

function formatEventBadge(dateStr: string | undefined): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
  });
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ─── Components ─────────────────────────────────────────────────────────────

function Avatar({
  name,
  size = "md",
}: {
  name: string;
  size?: "sm" | "md";
}) {
  const bg = hashColor(name);
  const initials = getInitials(name);
  const dim = size === "sm" ? "w-10 h-10" : "w-12 h-12";
  const text = size === "sm" ? "text-xs" : "text-sm";
  return (
    <div
      className={`${dim} rounded-full flex items-center justify-center shrink-0 font-bold ${text}`}
      style={{ backgroundColor: `${bg}20`, color: bg }}
    >
      {initials}
    </div>
  );
}

function ChannelRow({
  ch,
  icon,
}: {
  ch: ChannelWithMeta;
  icon?: React.ReactNode;
}) {
  return (
    <Link
      href={`/dashboard/chat/${ch.id}`}
      className="flex items-center gap-3 px-4 py-3 min-h-[48px] hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors duration-200 border-b border-white/5 last:border-b-0"
    >
      {/* Avatar */}
      {icon ?? <Avatar name={ch.name} />}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold truncate text-[15px] leading-tight text-foreground">
            {ch.name}
          </p>
          {ch.event_date && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#7B2FF7]/10 text-[#7B2FF7] shrink-0">
              {formatEventBadge(ch.event_date)}
            </span>
          )}
        </div>
        <p className="text-[13px] text-muted-foreground truncate mt-0.5 leading-snug">
          {ch.last_message ?? "No messages yet"}
        </p>
      </div>

      {/* Right: time + unread */}
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        {ch.last_message_at && (
          <span className="text-[11px] text-muted-foreground">
            {relativeTime(ch.last_message_at)}
          </span>
        )}
        {ch.unread_count > 0 ? (
          <div className="min-w-[20px] h-5 rounded-full bg-nocturn flex items-center justify-center px-1.5">
            <span className="text-[11px] font-bold text-white">
              {ch.unread_count}
            </span>
          </div>
        ) : ch.unread ? (
          <div className="w-2.5 h-2.5 rounded-full bg-[#7B2FF7]" />
        ) : null}
      </div>
    </Link>
  );
}

function SectionHeader({
  icon,
  label,
  count,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 select-none">
      <span className="text-muted-foreground/60">{icon}</span>
      <h2 className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-widest">
        {label}
      </h2>
      <span className="text-[10px] font-medium text-muted-foreground/40 bg-white/[0.04] rounded-full px-1.5 py-0.5">
        {count}
      </span>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function ChatPage() {
  const supabase = createClient();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [channels, setChannels] = useState<ChannelWithMeta[]>([]);
  const [collabChannels, setCollabChannels] = useState<ChannelWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [myCollectiveId, setMyCollectiveId] = useState<string | null>(null);

  // Tabs: chats | requests | sent
  const [activeTab, setActiveTab] = useState<"chats" | "requests" | "sent">("chats");
  const [sentInquiries, setSentInquiries] = useState<InquiryItem[]>([]);
  const [receivedInquiries, setReceivedInquiries] = useState<InquiryItem[]>([]);
  const [inquiriesLoaded, setInquiriesLoaded] = useState(false);
  const [processingInquiryId, setProcessingInquiryId] = useState<string | null>(null);
  const [inquiryError, setInquiryError] = useState<string | null>(null);

  // Search
  const [searchQuery, setSearchQuery] = useState("");

  // New Chat Sheet
  const [sheetOpen, setSheetOpen] = useState(false);
  const [collabQuery, setCollabQuery] = useState("");
  const [collabResults, setCollabResults] = useState<
    Array<{
      id: string;
      name: string;
      slug: string;
      city: string | null;
      logo_url: string | null;
    }>
  >([]);
  const [collabSearching, setCollabSearching] = useState(false);
  const [startingCollab, setStartingCollab] = useState<string | null>(null);
  const [inviteSent, setInviteSent] = useState(false);
  const [inviting, setInviting] = useState(false);

  // Get current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, [supabase]);

  const loadChannels = useCallback(async () => {
    if (!userId) return;

    // Get user's collective memberships
    const { data: memberships } = await supabase
      .from("collective_members")
      .select("collective_id")
      .eq("user_id", userId)
      .is("deleted_at", null);

    const collectiveIds = memberships?.map((m) => m.collective_id) ?? [];
    if (collectiveIds.length === 0) {
      setLoading(false);
      return;
    }

    const collectiveId = collectiveIds[0];
    setMyCollectiveId(collectiveId);

    // Check if general channel exists, create if not
    const { data: existingGeneral } = await supabase
      .from("channels")
      .select("id")
      .eq("collective_id", collectiveId)
      .eq("type", "general")
      .limit(1);

    if (!existingGeneral || existingGeneral.length === 0) {
      await supabase.from("channels").insert({
        collective_id: collectiveId,
        name: "General",
        type: "general",
        event_id: null,
      });
    }

    // Get events for this collective to auto-create event channels
    const { data: events } = await supabase
      .from("events")
      .select("id, title, starts_at")
      .eq("collective_id", collectiveId)
      .is("deleted_at", null)
      .order("starts_at", { ascending: true });

    if (events && events.length > 0) {
      const { data: existingEventChannels } = await supabase
        .from("channels")
        .select("event_id")
        .eq("collective_id", collectiveId)
        .eq("type", "event");

      const existingEventIds = new Set(
        existingEventChannels?.map((c) => c.event_id) ?? []
      );

      const newChannels = events
        .filter((e) => !existingEventIds.has(e.id))
        .map((e) => ({
          collective_id: collectiveId,
          event_id: e.id,
          name: e.title,
          type: "event" as const,
        }));

      if (newChannels.length > 0) {
        await supabase.from("channels").insert(newChannels);
      }
    }

    // Fetch all channels with last message info
    const { data: allChannels } = await supabase
      .from("channels")
      .select("*")
      .eq("collective_id", collectiveId)
      .in("type", ["general", "event"])
      .order("created_at", { ascending: true });

    if (!allChannels) {
      setLoading(false);
      return;
    }

    // Get last message for each channel
    const typedChannels = allChannels as unknown as Channel[];
    const channelsWithMeta: ChannelWithMeta[] = await Promise.all(
      typedChannels.map(async (ch) => {
        const { data: msgs } = await supabase
          .from("messages")
          .select("content, created_at, type")
          .eq("channel_id", ch.id)
          .order("created_at", { ascending: false })
          .limit(1);

        const lastMsg = msgs?.[0];
        let eventDate: string | undefined;

        if (ch.event_id && events) {
          const evt = events.find(
            (e: { id: string }) => e.id === ch.event_id
          );
          if (evt) eventDate = (evt as { starts_at: string }).starts_at;
        }

        return {
          ...ch,
          last_message: lastMsg
            ? lastMsg.type === "voice"
              ? "Voice note"
              : lastMsg.content
            : undefined,
          last_message_at: lastMsg?.created_at,
          unread: false,
          unread_count: 0,
          event_date: eventDate,
        };
      })
    );

    setChannels(channelsWithMeta);

    // Load collab channels
    try {
      const collabs = await getCollabChannels(collectiveId);
      const collabsWithMeta: ChannelWithMeta[] = await Promise.all(
        ((collabs ?? []) as Channel[]).map(async (ch) => {
          const { data: msgs } = await supabase
            .from("messages")
            .select("content, created_at, type")
            .eq("channel_id", ch.id as string)
            .order("created_at", { ascending: false })
            .limit(1);

          const lastMsg = msgs?.[0];
          return {
            ...ch,
            last_message: lastMsg?.content,
            last_message_at: lastMsg?.created_at,
            unread: false,
            unread_count: 0,
          };
        })
      );
      setCollabChannels(collabsWithMeta);
    } catch {
      // Collab channels failed — non-critical
    }

    setLoading(false);
  }, [userId, supabase]);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  // Load inquiries when switching to requests/sent tabs
  useEffect(() => {
    if ((activeTab === "requests" || activeTab === "sent") && !inquiriesLoaded) {
      setInquiriesLoaded(true);
      Promise.all([getSentInquiries(), getReceivedInquiries()]).then(
        ([sent, received]) => {
          setSentInquiries(sent);
          setReceivedInquiries(received);
        }
      );
    }
  }, [activeTab, inquiriesLoaded]);

  async function handleAcceptInquiry(inquiryId: string) {
    setProcessingInquiryId(inquiryId);
    setInquiryError(null);
    const result = await acceptInquiry(inquiryId);
    setProcessingInquiryId(null);
    if (result.error) {
      setInquiryError(result.error);
      return;
    }
    setReceivedInquiries((prev) =>
      prev.map((inq) => (inq.id === inquiryId ? { ...inq, status: "accepted" } : inq))
    );
    if (result.channelId) {
      router.push(`/dashboard/chat/${result.channelId}`);
    }
  }

  async function handleRejectInquiry(inquiryId: string) {
    setProcessingInquiryId(inquiryId);
    setInquiryError(null);
    const result = await rejectInquiry(inquiryId);
    setProcessingInquiryId(null);
    if (result.error) {
      setInquiryError(result.error);
      return;
    }
    setReceivedInquiries((prev) =>
      prev.map((inq) => (inq.id === inquiryId ? { ...inq, status: "rejected" } : inq))
    );
  }

  // ─── Derived data ──────────────────────────────────────────────────────────

  const teamChannels = useMemo(
    () => channels.filter((ch) => ch.type === "general"),
    [channels]
  );

  const eventChannels = useMemo(
    () =>
      channels
        .filter((ch) => ch.type === "event")
        .sort((a, b) => {
          if (a.event_date && b.event_date)
            return (
              new Date(a.event_date).getTime() -
              new Date(b.event_date).getTime()
            );
          return 0;
        }),
    [channels]
  );

  // Filter by search
  const filterBySearch = useCallback(
    (list: ChannelWithMeta[]) => {
      if (!searchQuery.trim()) return list;
      const q = searchQuery.toLowerCase();
      return list.filter(
        (ch) =>
          ch.name.toLowerCase().includes(q) ||
          ch.last_message?.toLowerCase().includes(q)
      );
    },
    [searchQuery]
  );

  const filteredCollabs = useMemo(
    () => filterBySearch(collabChannels),
    [filterBySearch, collabChannels]
  );
  const filteredTeam = useMemo(
    () => filterBySearch(teamChannels),
    [filterBySearch, teamChannels]
  );
  const filteredEvents = useMemo(
    () => filterBySearch(eventChannels),
    [filterBySearch, eventChannels]
  );

  const totalChannels =
    collabChannels.length + teamChannels.length + eventChannels.length;

  // ─── New Chat search handler ──────────────────────────────────────────────

  async function handleCollabSearch(query: string) {
    setCollabQuery(query);
    setInviteSent(false);
    if (query.length >= 2 && myCollectiveId) {
      setCollabSearching(true);
      const results = await searchCollectives(query, myCollectiveId);
      setCollabResults(results);
      setCollabSearching(false);
    } else {
      setCollabResults([]);
    }
  }

  async function handleStartCollab(collectiveId: string) {
    if (!myCollectiveId || startingCollab) return;
    setStartingCollab(collectiveId);
    const result = await startCollabChat(myCollectiveId, collectiveId);
    if (result.channelId) {
      setSheetOpen(false);
      setCollabQuery("");
      setCollabResults([]);
      router.push(`/dashboard/chat/${result.channelId}`);
    }
    setStartingCollab(null);
  }

  async function handleInvite(email: string) {
    if (!myCollectiveId || inviting) return;
    setInviting(true);
    const result = await inviteToCollab(myCollectiveId, email);
    if (!result.error) {
      setInviteSent(true);
    }
    setInviting(false);
  }

  // ─── Determine if query looks like an email ────────────────────────────────
  const queryIsEmail = isValidEmail(collabQuery);
  const showEmailInvite =
    collabQuery.length >= 3 &&
    !collabSearching &&
    collabResults.length === 0 &&
    queryIsEmail;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto pb-24 md:pb-0 animate-in fade-in duration-300 overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-nocturn" />
          <h1 className="text-2xl font-bold tracking-tight font-heading">
            Messages
          </h1>
        </div>
        <Button
          onClick={() => {
            setSheetOpen(true);
            setCollabQuery("");
            setCollabResults([]);
            setInviteSent(false);
          }}
          size="sm"
          className="bg-[#7B2FF7] hover:bg-[#6B1FE7] active:scale-95 text-white rounded-full min-h-[44px] h-11 px-4 text-sm font-semibold transition-all duration-200"
        >
          <Plus className="h-4 w-4 mr-1" />
          New Chat
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-white/[0.03] rounded-xl p-1">
        {([
          { key: "chats" as const, label: "Chats", icon: MessageSquare },
          { key: "requests" as const, label: "Requests", icon: Inbox, badge: receivedInquiries.filter((i) => i.status === "pending").length },
          { key: "sent" as const, label: "Sent", icon: ArrowUpRight },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 min-h-[44px] ${
              activeTab === tab.key
                ? "bg-white/[0.08] text-foreground"
                : "text-muted-foreground hover:text-foreground/80"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
            {tab.badge ? (
              <span className="min-w-[18px] h-[18px] rounded-full bg-nocturn text-white text-[10px] font-bold flex items-center justify-center px-1">
                {tab.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Search bar — only on chats tab */}
      {activeTab === "chats" && (
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
        <Input
          placeholder="Search conversations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 bg-white/[0.04] border-white/[0.06] rounded-xl h-10 text-sm placeholder:text-muted-foreground/40"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground active:scale-90 transition-all duration-200 min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      )}

      {/* ── CHATS TAB ──────────────────────────────────────────────────── */}
      {activeTab === "chats" && (
        <>
          {loading ? (
            <div className="rounded-2xl border border-white/[0.06] bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5">
                <div className="w-3 h-3 rounded bg-white/[0.06] animate-pulse" />
                <div className="w-16 h-3 rounded bg-white/[0.06] animate-pulse" />
              </div>
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.04] last:border-b-0">
                  <div className="w-12 h-12 rounded-full bg-white/[0.06] animate-pulse shrink-0" />
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="h-4 rounded bg-white/[0.06] animate-pulse w-2/3" />
                    <div className="h-3 rounded bg-white/[0.04] animate-pulse w-4/5" />
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <div className="w-10 h-3 rounded bg-white/[0.04] animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : totalChannels === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
              <div className="w-16 h-16 rounded-full bg-[#7B2FF7]/10 flex items-center justify-center mb-5">
                <MessageSquare size={28} className="text-[#7B2FF7]" />
              </div>
              <p className="font-semibold text-lg mb-2 text-foreground">
                Start a conversation
              </p>
              <p className="text-sm text-muted-foreground max-w-[280px] leading-relaxed">
                Connect with other collectives and coordinate with your team.
              </p>
              <Button
                onClick={() => setSheetOpen(true)}
                className="mt-6 bg-[#7B2FF7] hover:bg-[#6B1FE7] active:scale-95 text-white rounded-full px-6 min-h-[44px] transition-all duration-200"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                New Chat
              </Button>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/[0.06] bg-card overflow-hidden divide-y divide-white/[0.04]">
              {filteredCollabs.length > 0 && (
                <div>
                  <SectionHeader icon={<Users size={12} />} label="Collabs" count={filteredCollabs.length} />
                  {filteredCollabs.map((ch) => (
                    <ChannelRow key={ch.id} ch={ch} />
                  ))}
                </div>
              )}
              {filteredTeam.length > 0 && (
                <div>
                  <SectionHeader icon={<Hash size={12} />} label="Team" count={filteredTeam.length} />
                  {filteredTeam.map((ch) => (
                    <ChannelRow
                      key={ch.id}
                      ch={ch}
                      icon={
                        <div className="w-12 h-12 rounded-full bg-[#7B2FF7]/10 flex items-center justify-center shrink-0">
                          <Hash size={20} className="text-[#7B2FF7]" />
                        </div>
                      }
                    />
                  ))}
                </div>
              )}
              {filteredEvents.length > 0 && (
                <div>
                  <SectionHeader icon={<Calendar size={12} />} label="Events" count={filteredEvents.length} />
                  {filteredEvents.map((ch) => (
                    <ChannelRow
                      key={ch.id}
                      ch={ch}
                      icon={
                        <div className="w-12 h-12 rounded-full bg-zinc-800/80 flex items-center justify-center shrink-0">
                          <Calendar size={20} className="text-zinc-400" />
                        </div>
                      }
                    />
                  ))}
                </div>
              )}
              {searchQuery && filteredCollabs.length === 0 && filteredTeam.length === 0 && filteredEvents.length === 0 && (
                <div className="py-10 text-center">
                  <p className="text-sm text-muted-foreground">
                    No conversations matching &ldquo;{searchQuery}&rdquo;
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── REQUESTS TAB ─────────────────────────────────────────────── */}
      {activeTab === "requests" && (
        <div className="space-y-3">
          {inquiryError && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive flex items-start justify-between gap-2">
              <span>{inquiryError}</span>
              <button
                onClick={() => setInquiryError(null)}
                className="text-destructive/70 hover:text-destructive shrink-0"
                aria-label="Dismiss error"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          {!inquiriesLoaded ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-nocturn" />
            </div>
          ) : receivedInquiries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
              <div className="w-16 h-16 rounded-full bg-[#7B2FF7]/10 flex items-center justify-center mb-5">
                <Inbox size={28} className="text-[#7B2FF7]" />
              </div>
              <p className="font-semibold text-lg mb-2 text-foreground">
                No requests yet
              </p>
              <p className="text-sm text-muted-foreground max-w-[280px] leading-relaxed">
                When someone reaches out through Discover, their request will show up here.
              </p>
            </div>
          ) : (
            receivedInquiries.map((inq) => {
              const isProcessing = processingInquiryId === inq.id;
              return (
                <div
                  key={inq.id}
                  className="rounded-xl border border-white/[0.06] bg-card p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar name={inq.contact_name} size="sm" />
                      <div>
                        <p className="font-medium text-sm text-foreground">
                          {inq.contact_name}
                        </p>
                        {inq.contact_email && (
                          <p className="text-xs text-muted-foreground">{inq.contact_email}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        inq.status === "pending"
                          ? "bg-amber-500/10 text-amber-400"
                          : inq.status === "accepted"
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-zinc-500/10 text-zinc-400"
                      }`}>
                        {inq.status}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(inq.created_at).toLocaleDateString("en", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                  </div>

                  {inq.message && (
                    <div className="bg-white/[0.03] rounded-lg p-3 text-sm text-foreground/90 leading-relaxed">
                      {inq.message}
                    </div>
                  )}

                  {inq.status === "pending" && (
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white h-10 text-xs font-semibold"
                        disabled={isProcessing}
                        onClick={() => handleAcceptInquiry(inq.id)}
                      >
                        {isProcessing ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                        ) : (
                          <Check className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Accept & Chat
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-10 text-xs text-muted-foreground hover:text-foreground"
                        disabled={isProcessing}
                        onClick={() => handleRejectInquiry(inq.id)}
                      >
                        <X className="h-3.5 w-3.5 mr-1.5" />
                        Dismiss
                      </Button>
                    </div>
                  )}

                  {inq.status === "accepted" && (
                    <p className="text-xs text-emerald-400/80 flex items-center gap-1">
                      <Check className="h-3 w-3" /> Accepted — check your Chats
                    </p>
                  )}

                  {inq.status === "rejected" && (
                    <p className="text-xs text-muted-foreground/60 italic">Dismissed</p>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── SENT TAB ─────────────────────────────────────────────────── */}
      {activeTab === "sent" && (
        <div className="space-y-3">
          {!inquiriesLoaded ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-nocturn" />
            </div>
          ) : sentInquiries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
              <div className="w-16 h-16 rounded-full bg-[#7B2FF7]/10 flex items-center justify-center mb-5">
                <ArrowUpRight size={28} className="text-[#7B2FF7]" />
              </div>
              <p className="font-semibold text-lg mb-2 text-foreground">
                No sent requests
              </p>
              <p className="text-sm text-muted-foreground max-w-[280px] leading-relaxed">
                When you reach out to someone on Discover, your requests will appear here so you can track them.
              </p>
              <Button
                onClick={() => router.push("/dashboard/discover")}
                className="mt-6 bg-[#7B2FF7] hover:bg-[#6B1FE7] active:scale-95 text-white rounded-full px-6 min-h-[44px] transition-all duration-200"
              >
                <Search className="h-4 w-4 mr-1.5" />
                Browse Discover
              </Button>
            </div>
          ) : (
            sentInquiries.map((inq) => (
              <div
                key={inq.id}
                className="rounded-xl border border-white/[0.06] bg-card p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar name={inq.profile_display_name || inq.contact_name} size="sm" />
                    <div>
                      <p className="font-medium text-sm text-foreground">
                        {inq.profile_display_name || inq.contact_name}
                      </p>
                      {inq.inquiry_type !== "general" && (
                        <p className="text-xs text-muted-foreground capitalize">{inq.inquiry_type}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      inq.status === "pending"
                        ? "bg-amber-500/10 text-amber-400"
                        : inq.status === "accepted"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "bg-zinc-500/10 text-zinc-400"
                    }`}>
                      {inq.status === "pending" ? "awaiting reply" : inq.status}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(inq.created_at).toLocaleDateString("en", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                </div>

                {inq.message && (
                  <div className="bg-white/[0.03] rounded-lg p-3 text-sm text-foreground/90 leading-relaxed">
                    {inq.message}
                  </div>
                )}

                {inq.status === "pending" && (
                  <p className="text-xs text-muted-foreground/60 flex items-center gap-1.5">
                    <Clock className="h-3 w-3" /> Waiting for them to respond
                  </p>
                )}

                {inq.status === "accepted" && (
                  <p className="text-xs text-emerald-400/80 flex items-center gap-1">
                    <Check className="h-3 w-3" /> Accepted — check your Chats
                  </p>
                )}

                {inq.status === "rejected" && (
                  <p className="text-xs text-muted-foreground/60 italic">They passed on this one</p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ── New Chat Sheet ────────────────────────────────────────────────── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] p-0">
          <SheetHeader className="px-5 pt-5 pb-3">
            <SheetTitle className="text-lg font-bold">New Chat</SheetTitle>
            <SheetDescription>
              Find a collective or invite someone by email
            </SheetDescription>
          </SheetHeader>

          <div className="px-5 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
              <Input
                placeholder="Search collectives or type an email..."
                value={collabQuery}
                onChange={(e) => handleCollabSearch(e.target.value)}
                className="pl-9 bg-white/[0.04] border-white/[0.06] rounded-xl h-10 text-sm"
                autoFocus
              />
            </div>
          </div>

          <div className="overflow-y-auto max-h-[55vh] px-5 pb-5">
            {/* Loading */}
            {collabSearching && (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-[#7B2FF7]" />
              </div>
            )}

            {/* Results */}
            {collabResults.length > 0 && (
              <div className="space-y-1">
                {collabResults.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleStartCollab(c.id)}
                    disabled={startingCollab === c.id}
                    className="w-full flex items-center gap-3 p-3 min-h-[48px] rounded-xl hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors duration-200 text-left"
                  >
                    <Avatar name={c.name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate text-foreground">
                        {c.name}
                      </p>
                      {c.city && (
                        <p className="text-xs text-muted-foreground">
                          {c.city}
                        </p>
                      )}
                    </div>
                    {startingCollab === c.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-[#7B2FF7] shrink-0" />
                    ) : (
                      <span className="text-xs text-[#7B2FF7] font-semibold shrink-0">
                        Chat
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Email invite */}
            {showEmailInvite && !inviteSent && (
              <div className="mt-2">
                <button
                  onClick={() => handleInvite(collabQuery)}
                  disabled={inviting}
                  className="w-full flex items-center gap-3 p-4 rounded-xl border border-dashed border-[#7B2FF7]/30 hover:bg-[#7B2FF7]/5 active:bg-[#7B2FF7]/10 transition-colors duration-200 text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-[#7B2FF7]/10 flex items-center justify-center shrink-0">
                    <Mail size={18} className="text-[#7B2FF7]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground">
                      Invite to Nocturn
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {collabQuery}
                    </p>
                  </div>
                  {inviting ? (
                    <Loader2 className="h-4 w-4 animate-spin text-[#7B2FF7] shrink-0" />
                  ) : (
                    <Send size={16} className="text-[#7B2FF7] shrink-0" />
                  )}
                </button>
              </div>
            )}

            {/* Invite sent confirmation */}
            {inviteSent && (
              <div className="mt-2 flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                  <Check size={18} className="text-emerald-400" />
                </div>
                <div>
                  <p className="font-medium text-sm text-foreground">
                    Invitation sent
                  </p>
                  <p className="text-xs text-muted-foreground">
                    The chat will activate when they join Nocturn
                  </p>
                </div>
              </div>
            )}

            {/* No results, not an email */}
            {collabQuery.length >= 2 &&
              !collabSearching &&
              collabResults.length === 0 &&
              !queryIsEmail &&
              !inviteSent && (
                <div className="py-8 text-center">
                  <p className="text-sm text-muted-foreground mb-1">
                    No collectives found
                  </p>
                  <p className="text-xs text-muted-foreground/60">
                    Type an email address to invite someone
                  </p>
                </div>
              )}

            {/* Default state */}
            {collabQuery.length < 2 && (
              <div className="py-8 text-center">
                <p className="text-sm text-muted-foreground/60">
                  Search for a collective name or enter an email
                </p>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Record Call FAB ───────────────────────────────────────────────── */}
      <Link
        href="/dashboard/record"
        className="fixed bottom-24 right-4 z-40 flex items-center gap-2 rounded-full bg-[#7B2FF7] text-white shadow-lg shadow-[#7B2FF7]/30 px-5 py-3.5 hover:bg-[#6B1FE7] active:scale-95 transition-all duration-200 md:bottom-6"
      >
        <Mic className="h-5 w-5" />
        <span className="text-sm font-semibold">Record Call</span>
      </Link>
    </div>
  );
}
