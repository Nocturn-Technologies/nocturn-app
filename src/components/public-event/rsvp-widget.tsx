"use client";

import { useState, useTransition } from "react";
import { Check, HelpCircle, X, Users, Loader2, Mail } from "lucide-react";
import { submitRsvp, type RsvpStatus } from "@/app/actions/rsvps";

interface RsvpWidgetProps {
  eventId: string;
  eventTitle: string;
  accentColor: string;
  initialCounts: { yes: number; maybe: number; no: number };
  initialMyStatus: RsvpStatus | null;
  isLoggedIn: boolean;
}

const OPTIONS: Array<{
  key: RsvpStatus;
  label: string;
  icon: typeof Check;
  emoji: string;
}> = [
  { key: "yes", label: "Going", icon: Check, emoji: "🎉" },
  { key: "maybe", label: "Maybe", icon: HelpCircle, emoji: "🤔" },
  { key: "no", label: "Can't make it", icon: X, emoji: "💔" },
];

export function RsvpWidget({
  eventId,
  eventTitle,
  accentColor,
  initialCounts,
  initialMyStatus,
  isLoggedIn,
}: RsvpWidgetProps) {
  const [counts, setCounts] = useState(initialCounts);
  const [myStatus, setMyStatus] = useState<RsvpStatus | null>(initialMyStatus);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showGuestForm, setShowGuestForm] = useState(false);
  const [pendingChoice, setPendingChoice] = useState<RsvpStatus | null>(null);
  const [guestEmail, setGuestEmail] = useState("");
  const [guestName, setGuestName] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const total = counts.yes + counts.maybe;

  function doSubmit(status: RsvpStatus, email: string | null, fullName: string | null) {
    setError(null);
    startTransition(async () => {
      const result = await submitRsvp({
        eventId,
        status,
        email,
        fullName,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      // Optimistic local update
      setCounts((prev) => {
        const next = { ...prev };
        if (myStatus && myStatus in next) next[myStatus] = Math.max(0, next[myStatus] - 1);
        next[status] = next[status] + 1;
        return next;
      });
      setMyStatus(status);
      setSubmitted(true);
      setShowGuestForm(false);
      setPendingChoice(null);
    });
  }

  function handleChoose(status: RsvpStatus) {
    if (isLoggedIn) {
      doSubmit(status, null, null);
    } else {
      setPendingChoice(status);
      setShowGuestForm(true);
    }
  }

  function handleGuestSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingChoice) return;
    if (!guestEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
      setError("Please enter a valid email");
      return;
    }
    doSubmit(pendingChoice, guestEmail.trim(), guestName.trim() || null);
  }

  return (
    <div className="space-y-4" id="rsvp">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-heading text-[11px] font-bold tracking-[0.3em] uppercase text-white/40">
            RSVP
          </h3>
          <p className="mt-1 text-sm text-white/60">
            Are you coming to <span className="text-white">{eventTitle}</span>?
          </p>
        </div>
        {total > 0 && (
          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" style={{ color: accentColor }} />
            <span className="text-xs font-medium text-white/60">
              {counts.yes} going{counts.maybe > 0 ? ` · ${counts.maybe} maybe` : ""}
            </span>
          </div>
        )}
      </div>

      {/* Choice buttons */}
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map((opt) => {
          const isActive = myStatus === opt.key;
          const Icon = opt.icon;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => handleChoose(opt.key)}
              disabled={pending}
              className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl border p-4 transition-all active:scale-[0.97] min-h-[88px] ${
                isActive
                  ? "bg-white/[0.04]"
                  : "border-white/10 hover:border-white/20 hover:bg-white/[0.02]"
              } ${pending ? "opacity-60 cursor-wait" : ""}`}
              style={
                isActive
                  ? {
                      borderColor: accentColor,
                      boxShadow: `0 0 0 1px ${accentColor}40`,
                    }
                  : undefined
              }
            >
              <div className="flex items-center gap-1.5">
                <span className="text-lg">{opt.emoji}</span>
                {isActive && (
                  <Icon className="h-3.5 w-3.5" style={{ color: accentColor }} />
                )}
              </div>
              <span
                className={`text-[11px] font-semibold ${
                  isActive ? "text-white" : "text-white/60"
                }`}
              >
                {opt.label}
              </span>
              <span className="text-[10px] text-white/30">
                {counts[opt.key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Guest email form */}
      {showGuestForm && !isLoggedIn && (
        <form onSubmit={handleGuestSubmit} className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4 animate-fade-in">
          <p className="text-xs text-white/60">Drop your email so the organizer can reach you with updates.</p>
          <input
            type="text"
            placeholder="Your name (optional)"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            maxLength={200}
            className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/30 min-h-[44px]"
          />
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
            <input
              type="email"
              placeholder="you@example.com"
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              required
              autoFocus
              maxLength={320}
              className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-10 pr-3 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/30 min-h-[44px]"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setShowGuestForm(false);
                setPendingChoice(null);
                setError(null);
              }}
              className="flex-1 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-white/60 hover:text-white hover:border-white/20 transition-all min-h-[44px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-2"
              style={{ backgroundColor: accentColor }}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit RSVP"}
            </button>
          </div>
        </form>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      )}

      {/* Confirmation */}
      {submitted && !showGuestForm && myStatus && (
        <p className="text-xs text-white/40 flex items-center gap-1.5">
          <Check className="h-3 w-3" style={{ color: accentColor }} />
          You&apos;re marked as <span className="text-white/60">{OPTIONS.find((o) => o.key === myStatus)?.label}</span>.
          {myStatus !== "no" && " See you there."}
        </p>
      )}
    </div>
  );
}
