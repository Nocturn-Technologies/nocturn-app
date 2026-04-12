"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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

// Short, mobile-friendly haptic tick on tap. iOS only fires this
// inside a PWA or via the Web Vibration API on supported browsers,
// so we treat it as best-effort.
function tapHaptic() {
  if (typeof window === "undefined") return;
  try {
    if ("vibrate" in navigator) navigator.vibrate(8);
  } catch {
    // noop — some browsers throw if the user hasn't interacted yet
  }
}

interface RsvpWidgetProps {
  eventId: string;
  eventTitle: string;
  accentColor: string;
  initialCounts: { yes: number; maybe: number; no: number };
  initialMyStatus: RsvpStatus | null;
  isLoggedIn: boolean;
  /** User's phone number on file, if any — pre-fills the confirm form */
  initialPhone?: string | null;
  /**
   * Access token from the email confirmation deep link. When present,
   * the user (even a guest) is authenticated as the owner of an existing
   * RSVP and can switch status with a single tap — no form required.
   */
  rsvpToken?: string | null;
}

const OPTIONS: Array<{
  key: RsvpStatus;
  label: string;
  /** Longer label used in confirm/submit button text */
  longLabel: string;
  icon: typeof Check;
  emoji: string;
}> = [
  { key: "yes", label: "Going", longLabel: "Going", icon: Check, emoji: "🎉" },
  { key: "maybe", label: "Maybe", longLabel: "Maybe", icon: HelpCircle, emoji: "🤔" },
  // Shortened from "Can't make it" — 13 chars was wrapping to two lines on
  // iPhone SE / narrow viewports inside the 3-column picker.
  { key: "no", label: "Can't go", longLabel: "Can't go", icon: X, emoji: "💔" },
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
  rsvpToken,
}: RsvpWidgetProps) {
  // Token-auth is effectively "logged in" from the widget's POV — we
  // already know who they are so we skip the guest form entirely and
  // submit the new status with one tap.
  const isTokenAuth = !!rsvpToken;
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

  // Scroll the form into view when it opens. On mobile the form
  // usually appears BELOW the picker and the user doesn't realize
  // new inputs just rendered off-screen.
  const formRef = useRef<HTMLFormElement | null>(null);
  useEffect(() => {
    if (showGuestForm || showMemberForm) {
      // Wait a frame so the DOM has actually painted the new form.
      requestAnimationFrame(() => {
        formRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      });
    }
  }, [showGuestForm, showMemberForm]);

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
        rsvpToken: rsvpToken ?? null,
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
    tapHaptic();
    setError(null);

    // Token-authenticated users (came via the email deep link) have
    // their identity + phone already stored on the RSVP row — submit
    // the new status directly with zero friction.
    if (isTokenAuth) {
      setPendingChoice(status);
      doSubmit(status, null, null, null);
      return;
    }

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

  // Used by Cancel buttons in either form. If the user had an RSVP
  // on record, returning to the confirmed view is the least surprising
  // behaviour — otherwise just close the form and stay on the picker.
  function handleCancelForm() {
    setShowGuestForm(false);
    setShowMemberForm(false);
    setPendingChoice(null);
    setError(null);
    if (myStatus !== null) {
      setIsChanging(false);
    }
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
          className="relative overflow-hidden rounded-2xl border p-5 sm:p-6 animate-fade-in"
          style={{
            borderColor: `${accentColor}40`,
            background: `linear-gradient(135deg, ${accentColor}15 0%, ${accentColor}05 100%)`,
          }}
        >
          {/* Subtle glow */}
          <div
            className="absolute -top-20 -right-20 h-40 w-40 rounded-full blur-3xl opacity-30 pointer-events-none"
            style={{ backgroundColor: accentColor }}
          />

          <div className="relative flex items-start gap-3 sm:gap-4">
            <div
              className="flex h-14 w-14 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-2xl text-3xl sm:text-2xl"
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
                <p className="font-heading text-xl sm:text-lg font-bold leading-tight text-white">
                  {copy.headline}
                </p>
              </div>
              <p className="mt-1 text-[15px] sm:text-sm text-white/60 leading-snug">
                {copy.subhead}
              </p>
            </div>
          </div>

          {/* Dedicated full-width "Change RSVP" button — big enough to
              hit reliably on mobile and visible, not hidden inside copy. */}
          <button
            type="button"
            onClick={handleChangeRsvp}
            className="relative mt-4 sm:mt-5 w-full rounded-xl border px-4 py-3 text-sm font-semibold text-white transition-all active:scale-[0.98] min-h-[48px] flex items-center justify-center gap-2"
            style={{
              borderColor: `${accentColor}50`,
              backgroundColor: `${accentColor}15`,
            }}
          >
            <Edit3 className="h-4 w-4" style={{ color: accentColor }} />
            Change my RSVP
          </button>
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
              className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl border px-2 py-4 transition-all active:scale-[0.97] min-h-[96px] touch-manipulation ${
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
                <span className="text-2xl sm:text-xl">{opt.emoji}</span>
                {isActive && (
                  <Icon className="h-3.5 w-3.5" style={{ color: accentColor }} />
                )}
              </div>
              <span
                className={`text-[13px] font-semibold text-center leading-tight whitespace-nowrap ${
                  isActive ? "text-white" : "text-white/70"
                }`}
              >
                {opt.label}
              </span>
              {isActive && isChanging ? (
                <span
                  className="text-[11px] font-bold uppercase tracking-wider"
                  style={{ color: accentColor }}
                >
                  Current
                </span>
              ) : counts[opt.key] > 0 ? (
                <span className="text-[11px] text-white/50">
                  {counts[opt.key]}
                </span>
              ) : null}
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
        <form
          ref={formRef}
          onSubmit={handleGuestSubmit}
          className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4 animate-fade-in"
        >
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
            autoComplete="name"
            autoCapitalize="words"
            autoCorrect="off"
            enterKeyHint="next"
            maxLength={200}
            /* text-base (16px) prevents iOS Safari auto-zoom on focus. */
            className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-base text-white placeholder:text-white/40 outline-none focus:border-white/30 min-h-[48px]"
          />
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              placeholder="you@example.com"
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              required
              maxLength={320}
              className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-base text-white placeholder:text-white/40 outline-none focus:border-white/30 min-h-[48px]"
            />
          </div>
          <div className="relative">
            <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              enterKeyHint="done"
              placeholder="(555) 123-4567"
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
              required
              maxLength={32}
              className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-base text-white placeholder:text-white/40 outline-none focus:border-white/30 min-h-[48px]"
            />
          </div>
          {error && (
            <p
              className="text-sm font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2"
              role="alert"
            >
              {error}
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleCancelForm}
              className="flex-1 rounded-xl border border-white/10 px-4 py-3 text-sm font-medium text-white/70 hover:text-white hover:border-white/20 transition-all min-h-[48px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-[2] rounded-xl px-4 py-3 text-base font-bold text-white transition-all active:scale-[0.98] disabled:opacity-50 min-h-[48px] flex items-center justify-center gap-2"
              style={{ backgroundColor: accentColor }}
            >
              {pending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                `Submit as ${OPTIONS.find((o) => o.key === pendingChoice)?.longLabel ?? "RSVP"}`
              )}
            </button>
          </div>
        </form>
      )}

      {/* Member phone-only form (logged in — we already have name + email) */}
      {showMemberForm && isLoggedIn && (
        <form
          ref={formRef}
          onSubmit={handleMemberSubmit}
          className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4 animate-fade-in"
        >
          <p className="text-xs text-white/60">
            {memberPhone
              ? "Confirm your phone so the organizer can reach you with updates."
              : "Add your phone so the organizer can reach you with updates."}
          </p>
          <div className="relative">
            <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              enterKeyHint="done"
              placeholder="(555) 123-4567"
              value={memberPhone}
              onChange={(e) => setMemberPhone(e.target.value)}
              required
              autoFocus={!memberPhone}
              maxLength={32}
              /* text-base (16px) prevents iOS Safari zoom on focus */
              className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-base text-white placeholder:text-white/40 outline-none focus:border-white/30 min-h-[48px]"
            />
          </div>
          {error && (
            <p
              className="text-sm font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2"
              role="alert"
            >
              {error}
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleCancelForm}
              className="flex-1 rounded-xl border border-white/10 px-4 py-3 text-sm font-medium text-white/70 hover:text-white hover:border-white/20 transition-all min-h-[48px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-[2] rounded-xl px-4 py-3 text-base font-bold text-white transition-all active:scale-[0.98] disabled:opacity-50 min-h-[48px] flex items-center justify-center gap-2"
              style={{ backgroundColor: accentColor }}
            >
              {pending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                `Confirm as ${OPTIONS.find((o) => o.key === pendingChoice)?.longLabel ?? "RSVP"}`
              )}
            </button>
          </div>
        </form>
      )}

      {/* Inline error (shown only if no form is open — otherwise error
          lives inside the form so users see it next to the inputs) */}
      {error && !showGuestForm && !showMemberForm && (
        <p
          className="text-sm font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
