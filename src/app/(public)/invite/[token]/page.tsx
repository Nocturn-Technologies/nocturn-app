"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { acceptInvitation } from "@/app/actions/members";

type InviteState =
  | "loading"
  | "not-found"
  | "expired"
  | "needs-login"
  | "ready"
  | "accepting"
  | "accepted"
  | "already-member"
  | "error";

const MARQUEE_ITEMS = [
  "INVITATION",
  "TEAM ONBOARD",
  "NOCTURN",
  "RUN THE NIGHT",
  "INVITATION",
  "TEAM ONBOARD",
  "NOCTURN",
  "RUN THE NIGHT",
];

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const token = params.token as string;

  const [state, setState] = useState<InviteState>("loading");
  const [collectiveName, setCollectiveName] = useState<string>("");
  const [inviteRole, setInviteRole] = useState<string>("");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    async function checkInvite() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push(`/login?redirect=/invite/${token}`);
        return;
      }

      const { data: invitation } = await supabase
        .from("invitations")
        .select("*, collectives(name)")
        .eq("token", token)
        .maybeSingle();

      if (!invitation) {
        setState("not-found");
        return;
      }

      if (invitation.accepted_at !== null) {
        setState("not-found");
        return;
      }

      if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
        setState("expired");
        return;
      }

      setCollectiveName(
        (invitation.collectives as unknown as { name: string } | null)?.name ?? "this collective"
      );
      setInviteRole(invitation.role);
      setExpiresAt(invitation.expires_at ?? null);
      setState("ready");
    }

    checkInvite();
  }, [supabase, token, router]);

  async function handleAccept() {
    setState("accepting");
    const result = await acceptInvitation(token);

    if (result.error) {
      setErrorMessage(result.error);
      setState("error");
      return;
    }

    if (result.alreadyMember) {
      setState("already-member");
    } else {
      setState("accepted");
    }
  }

  // ─── LOADING ─────────────────────────────
  if (state === "loading") {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center overflow-x-hidden">
        <div className="flex items-center gap-3 brutalist-mono text-[11px] tracking-[0.3em] uppercase text-white/40">
          <div className="h-1.5 w-1.5 rounded-full bg-nocturn animate-pulse" />
          Loading invitation…
        </div>
      </div>
    );
  }

  const collectiveInitial = collectiveName ? collectiveName.charAt(0).toUpperCase() : "N";
  const expiresInDays = expiresAt
    ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <div className="min-h-dvh bg-background text-white antialiased overflow-x-hidden">
      {/* Top marquee */}
      <div className="brutalist-marquee">
        <div className="brutalist-marquee-track">
          {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
            <span key={i}>{item}</span>
          ))}
        </div>
      </div>

      {/* HERO */}
      <section className="relative overflow-hidden px-5 sm:px-10 lg:px-16 pt-10 sm:pt-14 pb-12 sm:pb-16">
        {/* Cropped letterform watermark */}
        <div
          aria-hidden
          className="brutalist-watermark right-[-8vw] top-[2vh]"
          style={{ fontSize: "clamp(14rem, 38vw, 28rem)" }}
        >
          {collectiveInitial}
        </div>

        {/* Top row — nocturn mark + stamp */}
        <div className="relative z-10 flex items-start justify-between gap-4 mb-12 sm:mb-16">
          <div className="font-heading text-base sm:text-lg font-bold tracking-tight">
            nocturn<span className="text-nocturn">.</span>
          </div>
          <div className="brutalist-stamp -rotate-3">
            INVITATION · 001
          </div>
        </div>

        {/* READY state — main invite */}
        {state === "ready" && (
          <div className="relative z-10 max-w-3xl">
            <div className="flex items-center gap-2 mb-5">
              <div className="h-1.5 w-1.5 rounded-full bg-nocturn animate-pulse" />
              <span className="brutalist-mono text-[11px] tracking-[0.3em] uppercase text-white/45">
                You&apos;re invited
              </span>
            </div>

            <p className="brutalist-mono text-[12px] tracking-[0.18em] uppercase text-white/55 mb-3">
              An operator invited you to run nights with
            </p>

            <h1
              className="font-heading font-bold text-white tracking-[-0.03em] mb-6 leading-[0.95]"
              style={{ fontSize: "clamp(2rem, 7vw, 4.5rem)" }}
            >
              {collectiveName}
            </h1>

            <div className="flex flex-wrap items-center gap-3 mb-7">
              <span className="inline-flex items-center gap-2 px-3 py-1.5 border border-nocturn/40 rounded-full text-[12px] font-semibold tracking-[0.18em] uppercase text-nocturn-glow bg-nocturn/[0.06]">
                <span className="h-1.5 w-1.5 rounded-full bg-nocturn" />
                {inviteRole}
              </span>
            </div>

            <div className="brutalist-prose mb-9">
              <p>
                Run nights with the people building this collective — the calendar, the lineup,
                the door, the settlements. Nocturn is the operating system underneath, so the
                team can focus on the night itself.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 sm:items-center mb-2">
              <button
                onClick={handleAccept}
                className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl bg-nocturn hover:bg-nocturn-light text-white font-semibold text-[15px] transition-all duration-200 hover:translate-y-[-1px] active:scale-[0.98] shadow-[0_0_0_0_rgba(123,47,247,0.4)] hover:shadow-[0_0_28px_-8px_rgba(123,47,247,0.7)] min-h-[52px]"
              >
                Accept the invitation
                <span aria-hidden>→</span>
              </button>
              <button
                onClick={() => router.push("/dashboard")}
                className="text-[14px] text-white/45 hover:text-white/70 underline underline-offset-4 transition-colors py-3 sm:py-0"
              >
                Not for me
              </button>
            </div>
          </div>
        )}

        {/* NOT-FOUND */}
        {state === "not-found" && (
          <div className="relative z-10 max-w-3xl">
            <p className="brutalist-mono text-[11px] tracking-[0.3em] uppercase text-white/45 mb-3">
              Status · Invalid
            </p>
            <h1
              className="font-heading font-bold text-white tracking-[-0.03em] mb-5 leading-[0.95]"
              style={{ fontSize: "clamp(1.85rem, 6vw, 4rem)" }}
            >
              This invitation isn&apos;t valid.
            </h1>
            <div className="brutalist-prose mb-8">
              <p>
                The link is invalid, has already been used, or was withdrawn by the collective.
                Ask the person who invited you to send a fresh one.
              </p>
            </div>
            <button
              onClick={() => router.push("/dashboard")}
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-white text-background font-semibold text-[14px] hover:bg-nocturn-glow transition-colors min-h-[48px]"
            >
              Go to dashboard →
            </button>
          </div>
        )}

        {/* EXPIRED */}
        {state === "expired" && (
          <div className="relative z-10 max-w-3xl">
            <p className="brutalist-mono text-[11px] tracking-[0.3em] uppercase text-white/45 mb-3">
              Status · Expired
            </p>
            <h1
              className="font-heading font-bold text-white tracking-[-0.03em] mb-5 leading-[0.95]"
              style={{ fontSize: "clamp(1.85rem, 6vw, 4rem)" }}
            >
              This invitation expired.
            </h1>
            <div className="brutalist-prose mb-8">
              <p>
                Ask the collective admin to send you a new one — invitations are time-bound on
                purpose to keep team access tidy.
              </p>
            </div>
            <button
              onClick={() => router.push("/dashboard")}
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl border border-white/15 text-white/85 hover:border-nocturn hover:text-white font-semibold text-[14px] transition-colors min-h-[48px]"
            >
              Go to dashboard →
            </button>
          </div>
        )}

        {/* ACCEPTING */}
        {state === "accepting" && (
          <div className="relative z-10 max-w-3xl">
            <div className="flex items-center gap-3 brutalist-mono text-[12px] tracking-[0.28em] uppercase text-white/55">
              <div className="h-1.5 w-1.5 rounded-full bg-nocturn animate-pulse" />
              Joining {collectiveName}…
            </div>
          </div>
        )}

        {/* ACCEPTED / ALREADY-MEMBER */}
        {(state === "accepted" || state === "already-member") && (
          <div className="relative z-10 max-w-3xl">
            <p className="brutalist-mono text-[11px] tracking-[0.3em] uppercase text-emerald-400/80 mb-3">
              {state === "already-member" ? "Status · Already in" : "Status · Accepted"}
            </p>
            <h1
              className="font-heading font-bold text-white tracking-[-0.03em] mb-5 leading-[0.95]"
              style={{ fontSize: "clamp(1.85rem, 6vw, 4rem)" }}
            >
              {state === "already-member"
                ? `You're already with ${collectiveName}.`
                : `Welcome to ${collectiveName}.`}
            </h1>
            <div className="brutalist-prose mb-8">
              <p>
                {state === "already-member"
                  ? `You can pick up where the team left off — the calendar, the chat, the next event.`
                  : `You're in as a ${inviteRole}. Head to the dashboard to see what the collective is running this week.`}
              </p>
            </div>
            <button
              onClick={() => router.push("/dashboard")}
              className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl bg-nocturn hover:bg-nocturn-light text-white font-semibold text-[15px] transition-all hover:translate-y-[-1px] active:scale-[0.98] min-h-[52px]"
            >
              Open the dashboard →
            </button>
          </div>
        )}

        {/* ERROR */}
        {state === "error" && (
          <div className="relative z-10 max-w-3xl">
            <p className="brutalist-mono text-[11px] tracking-[0.3em] uppercase text-red-400/80 mb-3">
              Status · Couldn&apos;t accept
            </p>
            <h1
              className="font-heading font-bold text-white tracking-[-0.03em] mb-5 leading-[0.95]"
              style={{ fontSize: "clamp(1.85rem, 6vw, 4rem)" }}
            >
              Something didn&apos;t go through.
            </h1>
            <div className="brutalist-prose mb-8">
              <p>{errorMessage || "We couldn't accept the invitation. Try again, or ask the collective admin to resend."}</p>
            </div>
            <button
              onClick={() => setState("ready")}
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-nocturn hover:bg-nocturn-light text-white font-semibold text-[14px] min-h-[48px]"
            >
              Try again →
            </button>
          </div>
        )}
      </section>

      {/* RECEIPT-STRIP INFO BAR — only on ready state, anchors hero into next section */}
      {state === "ready" && (
        <>
          <hr className="brutalist-hairline" />
          <section className="px-5 sm:px-10 lg:px-16 py-6 sm:py-7">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-5">
              <div>
                <p className="brutalist-mono text-[10px] tracking-[0.3em] uppercase text-white/40 mb-1.5">Role</p>
                <p className="font-heading text-[14px] sm:text-[15px] font-semibold tracking-tight">{inviteRole}</p>
              </div>
              <div className="sm:border-l sm:border-white/[0.06] sm:pl-6">
                <p className="brutalist-mono text-[10px] tracking-[0.3em] uppercase text-white/40 mb-1.5">Collective</p>
                <p className="font-heading text-[14px] sm:text-[15px] font-semibold tracking-tight truncate">{collectiveName}</p>
              </div>
              <div className="sm:border-l sm:border-white/[0.06] sm:pl-6">
                <p className="brutalist-mono text-[10px] tracking-[0.3em] uppercase text-white/40 mb-1.5">Type</p>
                <p className="font-heading text-[14px] sm:text-[15px] font-semibold tracking-tight">Operator</p>
              </div>
              <div className="sm:border-l sm:border-white/[0.06] sm:pl-6">
                <p className="brutalist-mono text-[10px] tracking-[0.3em] uppercase text-white/40 mb-1.5">Expires</p>
                <p className="brutalist-mono text-[14px] sm:text-[15px] text-white/85">
                  {expiresInDays !== null ? `IN ${expiresInDays} ${expiresInDays === 1 ? "DAY" : "DAYS"}` : "—"}
                </p>
              </div>
            </div>
          </section>
        </>
      )}

      {/* WHAT COMES NEXT — only on ready state */}
      {state === "ready" && (
        <>
          <hr className="brutalist-hairline" />
          <section className="px-5 sm:px-10 lg:px-16 py-12 sm:py-16">
            <div className="flex items-baseline justify-between gap-4 mb-6">
              <div className="brutalist-chapter">01 / WHAT COMES NEXT</div>
            </div>
            <hr className="brutalist-hairline mb-10" />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-12 max-w-4xl">
              {[
                {
                  num: "01",
                  title: "Co-run events",
                  body: "Build the calendar with the team — flyers, lineups, dispatches, door staff.",
                },
                {
                  num: "02",
                  title: "Settle payouts",
                  body: "Splits run through Nocturn — the math is decided up front, not over text after the night.",
                },
                {
                  num: "03",
                  title: "Get paid faster",
                  body: "Stripe Connect goes straight to the collective account. No more spreadsheet receipts.",
                },
              ].map((item) => (
                <div key={item.num}>
                  <p className="brutalist-mono text-[11px] tracking-[0.3em] text-nocturn-glow mb-3">{item.num}</p>
                  <p className="font-heading text-[18px] sm:text-[20px] font-bold tracking-tight mb-2">{item.title}</p>
                  <p className="text-[14px] leading-[1.65] text-white/55">{item.body}</p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {/* Bottom marquee */}
      <div className="brutalist-marquee">
        <div className="brutalist-marquee-track">
          {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
            <span key={i}>{item}</span>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="px-5 sm:px-10 lg:px-16 py-8 sm:py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="font-heading text-base font-bold tracking-tight">
          nocturn<span className="text-nocturn">.</span>
        </div>
        <p className="brutalist-mono text-[10.5px] tracking-[0.28em] uppercase text-white/35">
          Powered by Nocturn · Run the night
        </p>
      </footer>
    </div>
  );
}
