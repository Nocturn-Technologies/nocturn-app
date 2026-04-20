"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Notification } from "@/components/notification-toast";

const DISMISSED_KEY = "nocturn_dismissed_notifications";

function getDismissedIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(DISMISSED_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveDismissedId(id: string) {
  if (typeof window === "undefined") return;
  try {
    const existing = getDismissedIds();
    // Keep max 100 dismissed IDs to avoid unbounded growth
    const updated = [...existing, id].slice(-100);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(updated));
  } catch {
    // localStorage may be unavailable
  }
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (loaded) return;

    async function checkNotifications() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoaded(true);
        return;
      }

      const dismissedIds = getDismissedIds();
      const newNotifications: Notification[] = [];

      try {
        // 1. Check for events starting in < 3 hours
        const now = new Date();
        const threeHoursLater = new Date(now.getTime() + 3 * 60 * 60 * 1000);

        const { data: upcomingEvents } = await supabase
          .from("events")
          .select("id, title, starts_at")
          .in("status", ["published", "upcoming"])
          .gte("starts_at", now.toISOString())
          .lte("starts_at", threeHoursLater.toISOString())
          .limit(3);

        if (upcomingEvents) {
          for (const event of upcomingEvents) {
            const eventStart = new Date(event.starts_at);
            const hoursUntil = Math.round(
              (eventStart.getTime() - now.getTime()) / (60 * 60 * 1000)
            );
            const id = `event-soon-${event.id}`;
            if (!dismissedIds.includes(id)) {
              // Get ticket count for this event
              const { count: ticketCount } = await supabase
                .from("tickets")
                .select("*", { count: "exact", head: true })
                .eq("event_id", event.id)
                .in("status", ["valid", "checked_in"]);

              const ticketText = ticketCount ? ` ${ticketCount} tickets sold` : "";
              newNotifications.push({
                id,
                message: `\uD83C\uDF89 ${event.title} starts in ${hoursUntil} hour${hoursUntil !== 1 ? "s" : ""}!${ticketText}`,
                type: "event",
              });
            }
          }
        }

        // 2. Check for unsettled events > 3 days old
        const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

        const { data: completedEvents } = await supabase
          .from("events")
          .select("id, title, ends_at")
          .eq("status", "completed")
          .lte("ends_at", threeDaysAgo.toISOString())
          .limit(3);

        if (completedEvents) {
          for (const event of completedEvents) {
            const id = `settle-${event.id}`;
            if (!dismissedIds.includes(id)) {
              newNotifications.push({
                id,
                message: `\uD83D\uDCB0 ${event.title} needs settlement`,
                type: "settlement",
              });
            }
          }
        }

        // 3. Check for new team messages (last 24 hours)
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const { data: recentMessages } = await supabase
          .from("messages")
          .select("id, channels(name)")
          .neq("sender_id", user.id)
          .gte("created_at", oneDayAgo.toISOString())
          .order("created_at", { ascending: false })
          .limit(1);

        if (recentMessages && recentMessages.length > 0) {
          const msg = recentMessages[0];
          const channel = msg.channels as unknown as { name: string } | null;
          const id = `msg-${msg.id}`;
          if (channel && !dismissedIds.includes(id)) {
            newNotifications.push({
              id,
              message: `\uD83D\uDCAC New message in ${channel.name}`,
              type: "message",
            });
          }
        }
      } catch (err) {
        console.error("[notifications] Failed to check notifications:", err);
      }

      setNotifications(newNotifications);
      setLoaded(true);
    }

    checkNotifications();
  }, [loaded]);

  const dismiss = useCallback((id: string) => {
    saveDismissedId(id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return { notifications, dismiss };
}
