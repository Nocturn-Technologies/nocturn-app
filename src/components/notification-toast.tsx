"use client";

import { useState, useEffect, useCallback } from "react";
import { X } from "lucide-react";

export interface Notification {
  id: string;
  message: string;
  type: "event" | "settlement" | "message";
}

interface NotificationToastProps {
  notifications: Notification[];
  onDismiss: (id: string) => void;
}

export function NotificationToast({ notifications, onDismiss }: NotificationToastProps) {
  const [visible, setVisible] = useState<string[]>([]);

  useEffect(() => {
    // Show up to 3 notifications
    const toShow = notifications.slice(0, 3).map((n) => n.id);
    setVisible(toShow);
  }, [notifications]);

  // Auto-dismiss after 5 seconds
  useEffect(() => {
    if (visible.length === 0) return;

    const timers = visible.map((id) =>
      setTimeout(() => {
        handleDismiss(id);
      }, 5000)
    );

    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleDismiss = useCallback(
    (id: string) => {
      setVisible((prev) => prev.filter((v) => v !== id));
      onDismiss(id);
    },
    [onDismiss]
  );

  const visibleNotifications = notifications.filter((n) => visible.includes(n.id));

  if (visibleNotifications.length === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] flex flex-col items-center gap-2 px-4 pt-3 pointer-events-none md:pt-4">
      {visibleNotifications.map((notification, index) => (
        <div
          key={notification.id}
          className="pointer-events-auto w-full max-w-md animate-slide-down"
          style={{ animationDelay: `${index * 100}ms` }}
        >
          <div className="flex items-start gap-3 rounded-2xl border border-[#7B2FF7]/20 bg-[#09090B]/95 backdrop-blur-sm px-4 py-3 shadow-lg shadow-[#7B2FF7]/10">
            <p className="flex-1 text-sm text-white leading-relaxed">
              {notification.message}
            </p>
            <button
              onClick={() => handleDismiss(notification.id)}
              className="shrink-0 rounded-full p-1 text-muted-foreground hover:text-white hover:bg-white/10 transition-colors min-h-[28px] min-w-[28px] flex items-center justify-center"
              aria-label="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
