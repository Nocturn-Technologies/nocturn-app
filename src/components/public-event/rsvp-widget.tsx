"use client";

import { useState, useTransition } from "react";
import {
  Check,
  HelpCircle,
  X,
  Users,
  Loader2,
  Mail,
  Phone,
  PartyPopper,
  Edit3,
} from "lucide-react";
import { submitRsvp, type RsvpStatus } from "@/app/actions/rsvps";
import { useConfetti } from "@/components/celebrations";

interface RsvpWidgetProps {
  eventId: string;
  eventTitle: string;
  accentColor: string;
  initialCounts: { yes: number; maybe: number; no: number };
  initialMyStatus: RsvpStatus | null;
  isLoggedIn: boolean;
  /** User's phone number on file, if any — pre-fills the confirm form */
  initialPhone?: string | null;
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

function getConfirmedCopy(status: RsvpStatus): {
  headline: string;
  subhead: string;
  emoji: string;
} {
  switch (status) {
    case "yes":
      return {
        headline: "You're on the list",
        subhead: "We can't wait to see you there.",
        emoji: "🎉",
      };
    case "maybe":
      return {
        headline: "We've got you as a maybe",
        subhead: "The organizer will save you a spot.",
        emoji: "🤔",
      };
    case "no":
      return {
        headline: "Got it — we'll miss you",
        subhead: "Catch the next one?",
        emoji: "💔",
      };
  }
}

export function RsvpWidget({
  eventId,
  eventTitle,
  accentColor,
  initialCounts,
  initialMyStatus,
  isLoggedIn,
  initialPhone,
}: RsvpWidgetProps) {
  const [counts, setCounts] = useState(initialCounts);
  const [myStatus, setMyStatus] = useState<RsvpStatus | null>(initialMyStatus);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showGuestForm, setShowGuestForm] = useState(false);
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [pendingChoice, setPendingChoice] = useState<RsvpStatus | null>(null);
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestName, setGuestName] = useState("");
  const [memberPhone, setMemberPhone] = useState(initialPhone ?? "");
  // "isChanging" = user has a status on record but wants to edit it.
  // We start in the confirmed view if they already had one on load.
  const [isChanging, setIsChanging] = useState(false);
  const fireConfetti = useConfetti();

  const total = counts.yes + counts.maybe;
  // Show the confirmed panel whenever we have a status AND the user isn't
  // actively changing their mind AND no form is open.
  const showConfirmedPanel =
    myStatus !== null && !isChanging && !showGuestForm && !showMemberForm;

  function doSubmit(
    status: RsvpStatus,
    email: string | null,
    fullName: string | null,
    phone: string | null
  ) {
    setError(null);
    startTransition(async () => {
      const result = await submitRsvp({
        eventId,
        status,
        email,
        phone,
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
      const previousStatus = myStatus;
      setMyStatus(status);
      setShowGuestForm(false);
      setShowMemberForm(false);
      setPendingChoice(null);
      setIsChanging(false);

      // 🎉 Celebrate only on transitions INTO "going" — not if they were
      // already going and just reconfirmed (that would feel spammy).
      if (status === "yes" && previousStatus !== "yes") {
        fireConfetti({ duration: 2000 }).catch(() => {
          // Ignore confetti errors — don't let a CSS/animation hiccup
          // break the RSVP success state.
        });
      }
    });
  }

  function handleChoose(status: RsvpStatus) {
    setError(null);
    setPendingChoice(status);
    if (isLoggedIn) {
      setShowMemberForm(true);
    } else {
      setShowGuestForm(true);
    }
  }

  function handleChangeRsvp() {
    setError(null);
    setIsChanging(true);
  }

  function handleGuestSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingChoice) return;
    if (!guestName.trim() || guestName.trim().length < 2) {
      setError("Please enter your name");
      return;
    }
    if (!guestEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
      setError("Please enter a valid email");
      return;
    }
    const phoneDigits = guestPhone.replace(/[^0-9]/g, "");
    if (!guestPhone.trim() || phoneDigits.length < 7 || phoneDigits.length > 15) {
      setError("Please enter a valid phone number");
      return;
    }
    doSubmit(pendingChoice, guestEmail.trim(), guestName.trim(), guestPhone.trim());
  }

  function handleMemberSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingChoice) return;
    const phoneDigits = memberPhone.replace(/[^0-9]/g, "");
    if (!memberPhone.trim() || phoneDigits.length < 7 || phoneDigits.length > 15) {
      setError("Please enter a valid phone number");
      return;
    }
    doSubmit(pendingChoice, null, null, memberPhone.trim());
  }

  // ── Confirmed view ──
  if (showConfirmedPanel && myStatus) {
    const copy = getConfirmedCopy(myStatus);
    return (
      <div className="space-y-4" id="rsvp">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-[11px] font-bold tracking-[0.3em] uppercase text-white/40">
            RSVP
          </h3>
          {total > 0 && (
            <div className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" style={{ color: accentColor }} />
              <span className="text-xs font-medium text-white/60">
                {counts.yes} going{counts.maybe > 0 ? ` · ${counts.maybe} maybe` : ""}
              </span>
            </div>
          )}
        </div>

        {/* Confirmed card — prominent, colorful, unmistakable */}
        <div
          className="relative overflow-hidden rounded-2xl border p-6 animate-fade-in"
          style={{
            borderColor: `${accentColor}40`,
            background: `linear-gradient(135deg, ${accentColor}15 0%, ${accentColor}05 100%)`,
          }}
        >
          {/* Subtle glow */}
          <div
            className="absolute -top-20 -right-20 h-40 w-40 rounded-full blur-3xl opacity-30"
            style={{ backgroundColor: accentColor }}
          />

          <div className="relative flex items-start gap-4">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl"
              style={{ backgroundColor: `${accentColor}20` }}
            >
              {copy.emoji}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {myStatus === "yes" && (
                  <PartyPopper
                    className="h-4 w-4 shrink-0"
                    style={{ color: accentColor }}
                  />
                )}
                <p
                  className="font-heading text-lg font-bold leading-tight text-white"
                >
                  {copy.headline}
                </p>
              </div>
              <p className="mt-1 text-sm text-white/60">{copy.subhead}</p>
              <p className="mt-3 text-xs text-white/40">
                Plans changed?{" "}
                <button
                  type="button"
                  onClick={handleChangeRsvp}
                  className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline transition-all"
                  style={{ color: accentColor }}
                >
                  <Edit3 className="h-3 w-3" />
                  Change your RSVP
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Picker view (initial or while changing) ──
  return (
    <div className="space-y-4" id="rsvp">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-heading text-[11px] font-bold tracking-[0.3em] uppercase text-white/40">
            RSVP
          </h3>
          <p className="mt-1 text-sm text-white/60">
            {isChanging ? (
              <>
                Update your RSVP for{" "}
                <span className="text-white">{eventTitle}</span>
              </>
            ) : (
              <>
                Are you coming to <span className="text-white">{eventTitle}</span>?
              </>
            )}
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

      {/* If currently changing but haven't picked a new option, let them
          bail out and go back to the confirmed view. */}
      {isChanging && !showGuestForm && !showMemberForm && myStatus && (
        <button
          type="button"
          onClick={() => {
            setIsChanging(false);
            setError(null);
          }}
          className="w-full text-xs text-white/40 hover:text-white/60 transition-colors"
        >
          Nevermind, keep my RSVP as {OPTIONS.find((o) => o.key === myStatus)?.label}
        </button>
      )}

      {/* Guest full form (name + email + phone) */}
      {showGuestForm && !isLoggedIn && (
        <form onSubmit={handleGuestSubmit} className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4 animate-fade-in">
          <p className="text-xs text-white/60">
            Your name, email, and phone so the organizer knows who&apos;s coming and can reach you with updates.
          </p>
          <input
            type="text"
            placeholder="Your full name"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            required
            autoFocus
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
              maxLength={320}
              className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-10 pr-3 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/30 min-h-[44px]"
            />
          </div>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="(555) 123-4567"
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
              required
              maxLength={32}
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

      {/* Member phone-only form (logged in — we already have name + email) */}
      {showMemberForm && isLoggedIn && (
        <form onSubmit={handleMemberSubmit} className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4 animate-fade-in">
          <p className="text-xs text-white/60">
            {memberPhone
              ? "Confirm your phone so the organizer can reach you with updates."
              : "Add your phone so the organizer can reach you with updates."}
          </p>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="(555) 123-4567"
              value={memberPhone}
              onChange={(e) => setMemberPhone(e.target.value)}
              required
              autoFocus={!memberPhone}
              maxLength={32}
              className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-10 pr-3 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/30 min-h-[44px]"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setShowMemberForm(false);
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
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm RSVP"}
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
    </div>
  );
}
