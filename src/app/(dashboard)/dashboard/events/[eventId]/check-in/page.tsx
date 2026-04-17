"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { checkInTicket, getCheckInStats, type CheckInStats } from "@/app/actions/check-in";

const QrScanner = dynamic(() => import("@/components/qr-scanner").then(m => m.QrScanner), {
  ssr: false,
  loading: () => (
    <div className="flex h-[250px] sm:h-[300px] items-center justify-center rounded-xl border border-border bg-muted">
      <p className="text-sm text-muted-foreground">Loading camera...</p>
    </div>
  ),
});
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, ScanLine, CheckCircle2, XCircle, AlertTriangle, Users, RotateCcw, Keyboard, Volume2, VolumeX } from "lucide-react";
import Link from "next/link";
import { haptic } from "@/lib/haptics";

type ScanResult = {
  type: "success" | "error" | "duplicate" | "queued";
  message: string;
  guestName?: string;
  tierName?: string;
  failedToken?: string; // for retry
};

// --- Audio feedback (Web Audio API) ---
let audioCtx: AudioContext | null = null;

function playTone(frequency: number, duration: number, type: OscillatorType = "sine") {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration / 1000);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + duration / 1000);
}

function playSuccessTone() {
  playTone(440, 100);
  setTimeout(() => playTone(660, 100), 120);
}

function playDuplicateTone() {
  playTone(500, 200);
}

function playErrorTone() {
  playTone(220, 300);
}

function playQueuedTone() {
  playTone(880, 100);
}

export default function CheckInScannerPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [stats, setStats] = useState<CheckInStats>({
    totalTickets: 0,
    checkedIn: 0,
    recentCheckIns: [],
  });
  const [statsError, setStatsError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const scannedTokensRef = useRef<Set<string>>(new Set());
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [offlineQueue, setOfflineQueue] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem(`nocturn_offline_queue_${eventId}`);
      return stored ? (JSON.parse(stored) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [muted, setMuted] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("nocturn_checkin_muted") === "true";
  });
  // Ref mirrors muted so handleScan (a useCallback) always reads the current
  // value without needing muted in its dependency array (which would recreate
  // the callback and break the QrScanner's stable onScan prop).
  const mutedRef = useRef(muted);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  // Unified door list: ticket holders + guest list entries (#25)
  const [guests, setGuests] = useState<{ name: string; status: string; type: "ticket" | "guest"; email?: string }[]>([]);
  const [doorListError, setDoorListError] = useState<string | null>(null);

  const loadDoorList = useCallback(async () => {
    try {
      setDoorListError(null);
      const supabase = createClient();
      const [{ data: ticketHolders, error: ticketErr }, { data: guestEntries, error: guestErr }] = await Promise.all([
        supabase
          .from("tickets")
          .select("id, status, metadata, ticket_tiers(name)")
          .eq("event_id", eventId)
          .in("status", ["paid", "checked_in"])
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("guest_list")
          .select("id, name, status, email, plus_ones")
          .eq("event_id", eventId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(200),
      ]);

      if (ticketErr || guestErr) {
        console.error("[check-in] loadDoorList error:", ticketErr ?? guestErr);
        setDoorListError("Could not load door list");
        return;
      }

      const combined: typeof guests = [];
      for (const t of ticketHolders || []) {
        const meta = t.metadata as Record<string, unknown> | null;
        const email = (meta?.customer_email ?? meta?.buyer_email ?? "") as string;
        const tier = t.ticket_tiers as unknown as { name: string } | null;
        combined.push({
          name: email || tier?.name || "Ticket holder",
          status: t.status,
          type: "ticket",
          email: email || undefined,
        });
      }
      for (const g of guestEntries || []) {
        combined.push({
          name: g.name + ((g.plus_ones ?? 0) > 0 ? ` +${g.plus_ones}` : ""),
          status: g.status ?? "pending",
          type: "guest",
          email: g.email || undefined,
        });
      }
      setGuests(combined);
    } catch (err) {
      console.error("[check-in] loadDoorList unexpected error:", err);
      setDoorListError("Could not load door list");
    }
  }, [eventId]);

  // Load initial stats + door list
  useEffect(() => {
    getCheckInStats(eventId).then(setStats).catch((err) => {
      console.error("[check-in] Failed to load initial stats:", err);
      setStatsError("Failed to load stats");
    });
    loadDoorList();
  }, [eventId]);

  // Supabase Realtime: listen for ticket status changes → refresh stats instantly
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`checkin:${eventId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tickets",
          filter: `event_id=eq.${eventId}`,
        },
        () => {
          // A ticket was updated (likely checked in) — refresh stats + door list (#31)
          getCheckInStats(eventId).then(setStats).catch(() => {});
          loadDoorList();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  // Fallback polling every 30s in case Realtime connection drops
  useEffect(() => {
    const interval = setInterval(() => {
      getCheckInStats(eventId).then(setStats).catch((err) => {
        console.error("[check-in] Failed to refresh stats:", err);
        setStatsError("Failed to load stats");
      });
      loadDoorList();
    }, 30000);
    return () => clearInterval(interval);
  }, [eventId]);

  // Clean up scan result timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // Persist offline queue to localStorage
  useEffect(() => {
    try {
      if (offlineQueue.length > 0) {
        localStorage.setItem(`nocturn_offline_queue_${eventId}`, JSON.stringify(offlineQueue));
      } else {
        localStorage.removeItem(`nocturn_offline_queue_${eventId}`);
      }
    } catch { /* localStorage full or unavailable */ }
  }, [offlineQueue, eventId]);

  // Online/offline detection (#35)
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    setIsOnline(navigator.onLine);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Flush offline queue when back online (#35)
  useEffect(() => {
    if (!isOnline || offlineQueue.length === 0) return;
    const flush = async () => {
      const queue = [...offlineQueue];
      setOfflineQueue([]);
      for (const token of queue) {
        try {
          await checkInTicket(token, eventId);
        } catch { /* will show in next stats refresh */ }
      }
      // Clear localStorage after flushing
      try { localStorage.removeItem(`nocturn_offline_queue_${eventId}`); } catch {}
      // Refresh stats after flushing
      getCheckInStats(eventId).then(setStats).catch(() => {});
      loadDoorList();
    };
    flush();
  }, [isOnline, offlineQueue, eventId]);

  const handleScan = useCallback(
    async (decodedText: string) => {
      // Prevent duplicate scans — track all scanned tokens for the session
      if (processing) return;
      if (scannedTokensRef.current.has(decodedText)) return;

      scannedTokensRef.current.add(decodedText);
      setProcessing(true);
      setScanResult(null);

      // Extract ticket_token from the URL
      // Expected format: https://app.trynocturn.com/check-in/{ticket_token}
      let ticketToken: string | null = null;

      try {
        const url = new URL(decodedText);
        const pathParts = url.pathname.split("/");
        const checkInIndex = pathParts.indexOf("check-in");
        if (checkInIndex !== -1 && pathParts[checkInIndex + 1]) {
          ticketToken = pathParts[checkInIndex + 1];
        }
      } catch {
        // Not a valid URL — maybe just a raw token (UUID)
        const uuidRegex =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(decodedText)) {
          ticketToken = decodedText;
        }
      }

      if (!ticketToken) {
        setScanResult({
          type: "error",
          message: "Invalid QR code — not a valid ticket",
        });
        if (!mutedRef.current) playErrorTone();
        setProcessing(false);
        clearAfterDelay();
        return;
      }

      // If offline, queue for later (#35)
      if (!navigator.onLine) {
        setOfflineQueue(prev => [...prev, ticketToken]);
        // Don't read offlineQueue.length from stale closure — the offline banner
        // already shows the live count, so keep the message simple.
        setScanResult({ type: "queued", message: "Queued for check-in (offline). Will sync when back online." });
        haptic("light");
        if (!mutedRef.current) playQueuedTone();
        setProcessing(false);
        clearAfterDelay();
        return;
      }

      // Call the server action
      const result = await checkInTicket(ticketToken, eventId);

      if (result.success) {
        haptic('success');
        if (!mutedRef.current) playSuccessTone();
        setScanResult({
          type: "success",
          message: "Checked in!",
          guestName: result.ticket?.guestName,
          tierName: result.ticket?.tierName,
        });
        // Refresh stats immediately
        getCheckInStats(eventId).then(setStats).catch((err) => {
          console.error("[check-in] Failed to refresh stats after scan:", err);
        });

        // Track check-in (client-side)
        import("@/lib/track").then(({ trackEvent }) =>
          trackEvent("checkin_scanned", { eventId })
        ).catch(() => {});
      } else {
        // If we went offline during the request, queue instead (#35)
        const isNetworkError = !result.error || result.error === "Something went wrong" || result.error === "Failed to check in ticket. Please try again.";
        if (!navigator.onLine && isNetworkError) {
          setOfflineQueue(prev => [...prev, ticketToken]);
          setScanResult({ type: "queued", message: "Queued for check-in (offline). Will sync when back online." });
          haptic("light");
          if (!mutedRef.current) playQueuedTone();
          scannedTokensRef.current.delete(decodedText);
        } else {
          // Detect "already checked in" vs real error
          const errorMsg = result.error ?? "Check-in failed";
          const isDuplicate = /already checked in/i.test(errorMsg);

          if (isDuplicate) {
            haptic('medium');
            if (!mutedRef.current) playDuplicateTone();
            setScanResult({
              type: "duplicate",
              message: errorMsg,
              guestName: result.ticket?.guestName,
              tierName: result.ticket?.tierName,
            });
          } else {
            haptic('heavy');
            if (!mutedRef.current) playErrorTone();
            // Include the failed token so user can retry
            setScanResult({
              type: "error",
              message: errorMsg,
              guestName: result.ticket?.guestName,
              tierName: result.ticket?.tierName,
              failedToken: isNetworkError ? ticketToken : undefined,
            });
            // Allow re-scan of this token if it was a network error
            if (isNetworkError) {
              scannedTokensRef.current.delete(decodedText);
            }
          }
        }
      }

      setProcessing(false);
      clearAfterDelay();
    },
    [eventId, processing]
  );

  const handleRetry = useCallback(
    (token: string) => {
      setScanResult(null);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      // Re-run the check-in with the stored token
      handleScan(`${token}`);
    },
    [handleScan]
  );

  const handleManualSubmit = useCallback(() => {
    const trimmed = manualToken.trim();
    if (!trimmed) return;
    setManualToken("");
    setShowManualEntry(false);
    handleScan(trimmed);
  }, [manualToken, handleScan]);

  function clearAfterDelay() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setScanResult(null);
      // Don't reset scannedTokensRef — keep dedup for the entire session
    }, 30000);
  }

  const percentage =
    stats.totalTickets > 0
      ? Math.round((stats.checkedIn / stats.totalTickets) * 100)
      : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-8 overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/dashboard/events/${eventId}`}>
          <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]" aria-label="Back to event">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold font-heading flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-nocturn" />
            Door Check-In
          </h1>
        </div>
        <button
          onClick={() => {
            const next = !muted;
            setMuted(next);
            localStorage.setItem("nocturn_checkin_muted", String(next));
          }}
          className="flex h-10 w-10 min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors"
          aria-label={muted ? "Unmute scan sounds" : "Mute scan sounds"}
        >
          {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>
      </div>

      {/* Offline Banner (#35) */}
      {!isOnline && (
        <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 flex items-center gap-2 mb-4">
          <div className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
          <p className="text-sm text-yellow-400">
            Offline mode — scans will be queued and synced when back online
            {offlineQueue.length > 0 && ` (${offlineQueue.length} queued)`}
          </p>
        </div>
      )}

      {/* Stats Banner */}
      {statsError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {statsError}
        </div>
      )}
      <Card>
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-nocturn/10">
              <Users className="h-5 w-5 text-nocturn" />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">
                {stats.checkedIn}{" "}
                <span className="text-base font-normal text-muted-foreground">
                  / {stats.totalTickets}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">checked in</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-nocturn tabular-nums">
              {percentage}%
            </p>
          </div>
        </CardContent>
      </Card>

      {/* QR Scanner */}
      <div className="relative">
        <QrScanner onScan={handleScan} paused={processing} />
      </div>

      {/* Manual Token Entry — fallback when camera fails */}
      {showManualEntry && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Enter the ticket code manually (UUID from the QR code URL)
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleManualSubmit();
              }}
              className="flex gap-2"
            >
              <input
                placeholder="e.g. a1b2c3d4-e5f6-..."
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 font-mono text-base md:text-sm min-h-[44px] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-nocturn"
                autoFocus
              />
              <Button type="submit" disabled={!manualToken.trim() || processing} size="sm" className="min-h-[44px]">
                Check In
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Toggle manual entry */}
      <div className="flex justify-center">
        <button
          onClick={() => setShowManualEntry((v) => !v)}
          className="flex items-center gap-1.5 text-sm min-h-[44px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <Keyboard className="h-3.5 w-3.5" />
          {showManualEntry ? "Hide manual entry" : "Enter code manually"}
        </button>
      </div>

      {/* Scan Feedback — large and visible in dark venues */}
      {scanResult && (
        <div
          className={`rounded-2xl border-2 p-5 transition-all animate-fade-in-up ${
            scanResult.type === "success"
              ? "border-green-500/50 bg-green-500/15"
              : scanResult.type === "duplicate"
              ? "border-amber-500/50 bg-amber-500/15"
              : scanResult.type === "queued"
              ? "border-yellow-500/50 bg-yellow-500/15"
              : "border-red-500/50 bg-red-500/15"
          }`}
        >
          <div className="flex items-center gap-4">
            {scanResult.type === "success" ? (
              <CheckCircle2 className="h-10 w-10 shrink-0 text-green-400" />
            ) : scanResult.type === "duplicate" ? (
              <AlertTriangle className="h-10 w-10 shrink-0 text-amber-400" />
            ) : scanResult.type === "queued" ? (
              <CheckCircle2 className="h-10 w-10 shrink-0 text-yellow-400" />
            ) : (
              <XCircle className="h-10 w-10 shrink-0 text-red-400" />
            )}
            <div className="min-w-0 flex-1">
              <p
                className={`text-xl font-bold ${
                  scanResult.type === "success"
                    ? "text-green-400"
                    : scanResult.type === "duplicate"
                    ? "text-amber-400"
                    : scanResult.type === "queued"
                    ? "text-yellow-400"
                    : "text-red-400"
                }`}
              >
                {scanResult.message}
              </p>
              {scanResult.guestName && (
                <p className="text-base text-muted-foreground truncate">
                  {scanResult.guestName}
                  {scanResult.tierName ? ` — ${scanResult.tierName}` : ""}
                </p>
              )}
            </div>
            {scanResult.failedToken && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleRetry(scanResult.failedToken!)}
                className="shrink-0"
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Retry
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Recent Check-ins */}
      {stats.recentCheckIns.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Recent Check-ins
          </h2>
          <div className="space-y-1">
            {stats.recentCheckIns.map((ci) => (
              <div
                key={ci.id}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
                  <span className="text-sm font-medium truncate">
                    {ci.guestName}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {ci.tierName}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground tabular-nums shrink-0 ml-2">
                  {new Date(ci.checkedInAt).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unified Door List (#25) */}
      {doorListError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {doorListError}
        </div>
      )}
      {guests.length > 0 && (
        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Door List</h3>
            <span className="text-xs text-zinc-500">{guests.length} entries</span>
          </div>
          <div className="space-y-1 max-h-[300px] overflow-y-auto rounded-xl border border-white/5 bg-card p-2">
            {guests.map((g, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-zinc-800/50 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`h-2 w-2 rounded-full shrink-0 ${g.status === "checked_in" ? "bg-green-500" : g.status === "confirmed" || g.status === "paid" ? "bg-blue-500" : "bg-zinc-600"}`} />
                  <span className="truncate text-foreground">{g.name}</span>
                  <span className="text-[11px] text-zinc-600 shrink-0">{g.type === "guest" ? "GUEST" : "TICKET"}</span>
                </div>
                <span className={`text-xs shrink-0 ${g.status === "checked_in" ? "text-green-400" : "text-zinc-500"}`}>
                  {g.status === "checked_in" ? "\u2713 In" : g.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
