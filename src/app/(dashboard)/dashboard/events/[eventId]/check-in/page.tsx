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
import { ArrowLeft, ScanLine, CheckCircle2, XCircle, Users, RotateCcw, Keyboard } from "lucide-react";
import Link from "next/link";
import { haptic } from "@/lib/haptics";

type ScanResult = {
  type: "success" | "error";
  message: string;
  guestName?: string;
  tierName?: string;
  failedToken?: string; // for retry
};

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

  // Load initial stats
  useEffect(() => {
    getCheckInStats(eventId).then(setStats).catch((err) => {
      console.error("[check-in] Failed to load initial stats:", err);
      setStatsError("Failed to load stats");
    });
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
          // A ticket was updated (likely checked in) — refresh stats
          getCheckInStats(eventId).then(setStats).catch(() => {});
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
    }, 30000);
    return () => clearInterval(interval);
  }, [eventId]);

  // Clean up scan result timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

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
        setProcessing(false);
        clearAfterDelay();
        return;
      }

      // Call the server action
      const result = await checkInTicket(ticketToken, eventId);

      if (result.success) {
        haptic('success');
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
        haptic('heavy');
        // Include the failed token so user can retry
        const isNetworkError = !result.error || result.error === "Something went wrong" || result.error === "Failed to check in ticket. Please try again.";
        setScanResult({
          type: "error",
          message: result.error ?? "Check-in failed",
          guestName: result.ticket?.guestName,
          tierName: result.ticket?.tierName,
          failedToken: isNetworkError ? ticketToken : undefined,
        });
        // Allow re-scan of this token if it was a network error
        if (isNetworkError) {
          scannedTokensRef.current.delete(decodedText);
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
    <div className="mx-auto max-w-lg space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/dashboard/events/${eventId}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-nocturn" />
            Door Check-In
          </h1>
        </div>
      </div>

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
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 font-mono text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-nocturn"
                autoFocus
              />
              <Button type="submit" disabled={!manualToken.trim() || processing} size="sm">
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
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
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
              : "border-red-500/50 bg-red-500/15"
          }`}
        >
          <div className="flex items-center gap-4">
            {scanResult.type === "success" ? (
              <CheckCircle2 className="h-10 w-10 shrink-0 text-green-400" />
            ) : (
              <XCircle className="h-10 w-10 shrink-0 text-red-400" />
            )}
            <div className="min-w-0 flex-1">
              <p
                className={`text-xl font-bold ${
                  scanResult.type === "success"
                    ? "text-green-400"
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
    </div>
  );
}
