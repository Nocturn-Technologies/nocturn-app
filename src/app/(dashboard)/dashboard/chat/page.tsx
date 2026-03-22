"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Sparkles, Hash, Pin } from "lucide-react";
import { Card } from "@/components/ui/card";

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

  // Sort: general first, then by event date
  const sorted = [...channels].sort((a, b) => {
    if (a.type === "general" && b.type !== "general") return -1;
    if (a.type !== "general" && b.type === "general") return 1;
    if (a.event_date && b.event_date) {
      return (
        new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
      );
    }
    return 0;
  });

  function formatTime(dateStr: string | undefined) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    const now = new Date();
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

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Team Sync</h1>
        <Sparkles size={20} className="text-nocturn" />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-nocturn border-t-transparent rounded-full animate-spin" />
        </div>
      ) : sorted.length === 0 ? (
        <Card className="p-8 text-center border-border">
          <Hash size={40} className="text-muted-foreground mx-auto mb-3" />
          <p className="font-medium mb-1">No channels yet</p>
          <p className="text-sm text-muted-foreground">
            Join a collective to start chatting with your team.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {sorted.map((ch) => (
            <Link
              key={ch.id}
              href={`/dashboard/chat/${ch.id}`}
              className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-border hover:bg-accent/50 transition-colors min-h-[68px]"
            >
              {/* Icon */}
              <div className="w-11 h-11 rounded-xl bg-nocturn/10 flex items-center justify-center shrink-0">
                {ch.type === "general" ? (
                  <Hash size={20} className="text-nocturn" />
                ) : (
                  <Sparkles size={20} className="text-nocturn" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {ch.type === "general" && (
                    <Pin size={12} className="text-nocturn shrink-0" />
                  )}
                  <p className="font-medium truncate text-[15px]">{ch.name}</p>
                  {ch.event_date && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-nocturn/15 text-nocturn shrink-0">
                      {formatEventDate(ch.event_date)}
                    </span>
                  )}
                </div>
                {ch.last_message ? (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {ch.last_message}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground/50 mt-0.5">
                    No messages yet
                  </p>
                )}
              </div>

              {/* Right side: time + unread */}
              <div className="flex flex-col items-end gap-1 shrink-0">
                {ch.last_message_at && (
                  <span className="text-[11px] text-muted-foreground">
                    {formatTime(ch.last_message_at)}
                  </span>
                )}
                {ch.unread && (
                  <div className="w-2.5 h-2.5 rounded-full bg-nocturn" />
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
