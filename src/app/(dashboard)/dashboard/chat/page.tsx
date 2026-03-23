"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Sparkles, Hash, Pin, Mic, Calendar, MessageSquare } from "lucide-react";

interface Channel {
  id: string;
  collective_id: string;
  event_id: string | null;
  name: string;
  type: "general" | "event";
  created_at: string;
}

interface ChannelWithMeta extends Channel {
  last_message?: string;
  last_message_at?: string;
  unread: boolean;
  unread_count: number;
  event_date?: string;
}

export default function ChatPage() {
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [channels, setChannels] = useState<ChannelWithMeta[]>([]);
  const [loading, setLoading] = useState(true);

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
      .eq("user_id", userId);

    const collectiveIds = memberships?.map((m) => m.collective_id) ?? [];
    if (collectiveIds.length === 0) {
      setLoading(false);
      return;
    }

    const collectiveId = collectiveIds[0];

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
      .order("created_at", { ascending: true });

    if (!allChannels) {
      setLoading(false);
      return;
    }

    // Get last message for each channel
    const channelsWithMeta: ChannelWithMeta[] = await Promise.all(
      allChannels.map(async (ch) => {
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
    setLoading(false);
  }, [userId, supabase]);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  // Separate general from event channels, split upcoming vs past
  const now = new Date();
  const generalChannel = channels.find((ch) => ch.type === "general");
  const eventChannels = channels.filter((ch) => ch.type === "event");
  const upcomingThreads = eventChannels
    .filter((ch) => !ch.event_date || new Date(ch.event_date) >= now)
    .sort((a, b) => {
      if (a.event_date && b.event_date)
        return new Date(a.event_date).getTime() - new Date(b.event_date).getTime();
      return 0;
    });
  const pastThreads = eventChannels
    .filter((ch) => ch.event_date && new Date(ch.event_date) < now)
    .sort((a, b) => {
      if (a.event_date && b.event_date)
        return new Date(b.event_date).getTime() - new Date(a.event_date).getTime();
      return 0;
    });

  function formatTime(dateStr: string | undefined) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000) {
      return d.toLocaleTimeString("en", {
        hour: "numeric",
        minute: "2-digit",
      });
    }
    if (diff < 604800000) {
      return d.toLocaleDateString("en", { weekday: "short" });
    }
    return d.toLocaleDateString("en", { month: "short", day: "numeric" });
  }

  function formatEventDate(dateStr: string | undefined) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en", { month: "short", day: "numeric" });
  }

  function ThreadCard({ ch }: { ch: ChannelWithMeta }) {
    const isGeneral = ch.type === "general";
    return (
      <Link
        key={ch.id}
        href={`/dashboard/chat/${ch.id}`}
        className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border hover:border-[#7B2FF7]/30 hover:bg-accent/50 transition-all min-h-[72px] active:scale-[0.98]"
      >
        {/* Avatar / Icon */}
        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
            isGeneral
              ? "bg-[#7B2FF7]/15"
              : "bg-zinc-800"
          }`}
        >
          {isGeneral ? (
            <Hash size={22} className="text-[#7B2FF7]" />
          ) : (
            <Calendar size={20} className="text-zinc-400" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {isGeneral && (
              <Pin size={12} className="text-[#7B2FF7] shrink-0" />
            )}
            <p className="font-semibold truncate text-[15px] leading-tight">
              {ch.name}
            </p>
            {ch.event_date && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#7B2FF7]/10 text-[#7B2FF7] shrink-0">
                {formatEventDate(ch.event_date)}
              </span>
            )}
          </div>
          {ch.last_message ? (
            <p className="text-[13px] text-muted-foreground truncate mt-0.5">
              {ch.last_message}
            </p>
          ) : (
            <p className="text-[13px] text-muted-foreground/40 mt-0.5">
              No messages yet
            </p>
          )}
        </div>

        {/* Right side: time + unread */}
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {ch.last_message_at && (
            <span className="text-[11px] text-muted-foreground">
              {formatTime(ch.last_message_at)}
            </span>
          )}
          {ch.unread_count > 0 && (
            <div className="min-w-[20px] h-5 rounded-full bg-[#7B2FF7] flex items-center justify-center px-1.5">
              <span className="text-[11px] font-bold text-white">
                {ch.unread_count}
              </span>
            </div>
          )}
        </div>
      </Link>
    );
  }

  return (
    <div className="max-w-2xl mx-auto pb-24 md:pb-0">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-6">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-6 w-6 text-[#7B2FF7]" />
          <h1 className="text-2xl font-bold tracking-tight font-heading">
            Team Sync
          </h1>
          <Sparkles size={18} className="text-[#7B2FF7] animate-pulse" />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 border-2 border-[#7B2FF7] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : channels.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <div className="w-16 h-16 rounded-full bg-[#7B2FF7]/10 flex items-center justify-center mb-4">
            <Hash size={28} className="text-[#7B2FF7]" />
          </div>
          <p className="font-semibold text-lg mb-1">No channels yet</p>
          <p className="text-sm text-muted-foreground max-w-xs">
            Join a collective to start chatting with your team.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* General channel — always first, pinned */}
          {generalChannel && (
            <div>
              <ThreadCard ch={generalChannel} />
            </div>
          )}

          {/* Upcoming event threads */}
          {upcomingThreads.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">
                Upcoming Events
              </p>
              <div className="space-y-2">
                {upcomingThreads.map((ch) => (
                  <ThreadCard key={ch.id} ch={ch} />
                ))}
              </div>
            </div>
          )}

          {/* Past event threads */}
          {pastThreads.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">
                Past Events
              </p>
              <div className="space-y-2">
                {pastThreads.map((ch) => (
                  <ThreadCard key={ch.id} ch={ch} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Floating Record Call button — makes Record accessible from Chat on mobile */}
      <Link
        href="/dashboard/record"
        className="fixed bottom-24 right-4 z-40 flex items-center gap-2 rounded-full bg-[#7B2FF7] text-white shadow-lg shadow-[#7B2FF7]/30 px-5 py-3.5 hover:bg-[#6B1FE7] active:scale-95 transition-all md:bottom-6"
      >
        <Mic className="h-5 w-5" />
        <span className="text-sm font-semibold">Record Call</span>
      </Link>
    </div>
  );
}
