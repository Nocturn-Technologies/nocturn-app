"use client";

import { useState, useEffect } from "react";
import { Check, Copy, Mail, Link2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ShareScreenProps {
  eventTitle: string;
  collectiveSlug: string;
  eventSlug: string;
  isPaidEvent?: boolean;
  onDashboard: () => void;
}

export function ShareScreen({ eventTitle, collectiveSlug, eventSlug, isPaidEvent, onDashboard }: ShareScreenProps) {
  const [copied, setCopied] = useState(false);
  const [showConfetti, setShowConfetti] = useState(true);
  const hasEvent = !!eventSlug;
  const shareUrl = hasEvent
    ? `https://app.trynocturn.com/${collectiveSlug}/${eventSlug}`
    : `https://app.trynocturn.com/${collectiveSlug}`;

  useEffect(() => {
    const timer = setTimeout(() => setShowConfetti(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for mobile
      const input = document.createElement("input");
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleEmailShare() {
    const subject = encodeURIComponent(`${eventTitle} — Grab your tickets`);
    const body = encodeURIComponent(`Just dropped ${eventTitle}. Grab tickets here: ${shareUrl}`);
    window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
  }

  async function handleInstagramShare() {
    // Use Web Share API if available, otherwise fall back to clipboard copy
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: eventTitle,
          text: `Check out ${eventTitle}`,
          url: shareUrl,
        });
        return;
      } catch {
        // User cancelled or share failed — fall back to copy
      }
    }
    handleCopy();
  }

  return (
    <div className="flex flex-col items-center gap-6 py-8 animate-scale-in relative">
      {/* Confetti overlay */}
      {showConfetti && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              className="absolute animate-confetti"
              style={{
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 0.5}s`,
                animationDuration: `${1.5 + Math.random() * 1.5}s`,
              }}
            >
              <div
                className="w-2 h-2 rounded-sm"
                style={{
                  backgroundColor: ["#7B2FF7", "#9D5CFF", "#E9DEFF", "#2DD4BF", "#FF6B2C", "#F5C542"][
                    Math.floor(Math.random() * 6)
                  ],
                  transform: `rotate(${Math.random() * 360}deg)`,
                }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Success icon */}
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-nocturn/20 animate-pulse-glow">
        <span className="text-4xl">🎉</span>
      </div>

      <div className="text-center space-y-1">
        <h2 className="text-2xl font-bold">{eventTitle}</h2>
        <p className="text-lg text-nocturn font-semibold">
          {hasEvent ? (isPaidEvent ? "is ready" : "is LIVE") : "is ready"}
        </p>
      </div>

      {/* Event URL */}
      <div className="w-full max-w-sm">
        <button
          onClick={handleCopy}
          className="w-full flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 text-left transition-all hover:border-nocturn/50 active:scale-[0.98]"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Link2 className="h-4 w-4 text-nocturn shrink-0" />
            <span className="text-sm text-muted-foreground truncate">{shareUrl}</span>
          </div>
          {copied ? (
            <div className="flex items-center gap-1 shrink-0">
              <Check className="h-4 w-4 text-green-500" />
              <span className="text-xs text-green-500 font-medium">Copied</span>
            </div>
          ) : (
            <Copy className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
        </button>
      </div>

      {/* Share actions */}
      <div className="w-full max-w-sm space-y-2.5">
        {hasEvent && (
          <Button
            onClick={handleInstagramShare}
            className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 py-5 text-base"
          >
            Copy Link for IG Story
          </Button>
        )}

        <Button
          onClick={handleEmailShare}
          variant="outline"
          className="w-full py-5 text-base"
        >
          <Mail className="mr-2 h-4 w-4" />
          Email your list
        </Button>

        <Button
          onClick={handleCopy}
          variant="outline"
          className="w-full py-5 text-base"
        >
          <Copy className="mr-2 h-4 w-4" />
          Copy link
        </Button>
      </div>

      {/* Dashboard CTA */}
      <Button
        onClick={onDashboard}
        className="w-full max-w-sm bg-nocturn hover:bg-nocturn-light py-5 text-base mt-2"
      >
        Go to Dashboard
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}
