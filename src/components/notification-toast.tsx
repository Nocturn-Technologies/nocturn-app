"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const handleDismiss = useCallback(
    (id: string) => {
      setDismissed((prev) => new Set(prev).add(id));
      onDismiss(id);
      const timer = timersRef.current.get(id);
      if (timer) {
        clearTimeout(timer);
        timersRef.current.delete(id);
      }
    },
    [onDismiss]
  );

  // Auto-dismiss after 5 seconds — keyed by notification ID, not visible array
  useEffect(() => {
    const toShow = notifications.slice(0, 3);
    for (const n of toShow) {
      if (dismissed.has(n.id) || timersRef.current.has(n.id)) continue;
      const timer = setTimeout(() => {
        handleDismiss(n.id);
        timersRef.current.delete(n.id);
      }, 5000);
      timersRef.current.set(n.id, timer);
    }

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current.clear();
    };
  }, [notifications, dismissed, handleDismiss]);

  const visibleNotifications = notifications
    .slice(0, 3)
    .filter((n) => !dismissed.has(n.id));

  if (visibleNotifications.length === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] flex flex-col items-center gap-2 px-4 pt-3 pointer-events-none md:pt-4">
      {visibleNotifications.map((notification, index) => (
        <div
          key={notification.id}
          className="pointer-events-auto w-full max-w-md animate-slide-down"
          style={{ animationDelay: `${index * 100}ms` }}
        >
          <div className="flex items-start gap-3 rounded-2xl border border-nocturn/20 bg-background/95 backdrop-blur-sm px-4 py-3 shadow-lg shadow-nocturn/10">
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
