import type { Metadata } from "next";
import Link from "next/link";
import { NocturnLogo } from "@/components/nocturn-logo";
import { CinematicEffects } from "@/components/cinematic-effects";

export const metadata: Metadata = {
  title: "Nocturn — You run the night. Nocturn runs the business.",
  description:
    "The Agentic Work OS for nightlife. Book the talent. Fill the room. Settle the night — on autopilot.",
};
import {
  Calendar,
  DollarSign,
  Sparkles,
  Users,
  Mic,
  MessageSquare,
  Music,
  MapPin,
  Camera,
  Video,
  Speaker,
  Lightbulb,
  Briefcase,
  Plane,
  CalendarCheck,
  UserCheck,
  Palette,
  Newspaper,
  BadgeDollarSign,
  Megaphone,
  Users2,
  Search,
  Heart,
} from "lucide-react";

const features = [
  {
    icon: Calendar,
    title: "Event Management",
    description:
      "Create, publish, and manage events with ticketing, guest lists, and check-in — all from your phone.",
  },
  {
    icon: Sparkles,
    title: "AI Marketing",
    description:
      "Generate social posts, email campaigns, and promo content. Your AI marketing team, on demand.",
  },
  {
    icon: DollarSign,
    title: "Finance & Settlements",
    description:
      "Real-time P&L, artist settlements, expense tracking. Know your numbers before the night ends.",
  },
  {
    icon: Search,
    title: "Discover Marketplace",
    description:
      "Find and book from 16 professional roles — DJs, photographers, managers, designers, and more.",
  },
  {
    icon: Users2,
    title: "Your Network",
    description:
      "Every connection lives in one place. See who you've worked with, saved, and contacted — your nightlife rolodex.",
  },
  {
    icon: MessageSquare,
    title: "Team Sync & Chat",
    description:
      "Real-time chat with your collective and collab channels with other crews. Coordinate without the chaos.",
  },
  {
    icon: Mic,
    title: "Voice Recording",
    description:
      "Record calls with venues and artists. AI transcribes and extracts action items automatically.",
  },
  {
    icon: Users,
    title: "Attendee CRM",
    description:
      "Build your audience. Track who comes, who returns, and turn one-time guests into regulars.",
  },
];

const marketplaceRoles = [
  { icon: Music, label: "DJs & Artists" },
  { icon: MapPin, label: "Venues" },
  { icon: Users, label: "Collectives" },
  { icon: Megaphone, label: "Promoters" },
  { icon: Briefcase, label: "Artist Managers" },
  { icon: Plane, label: "Tour Managers" },
  { icon: CalendarCheck, label: "Booking Agents" },
  { icon: Camera, label: "Photographers" },
  { icon: Video, label: "Videographers" },
  { icon: Mic, label: "MCs & Hosts" },
  { icon: Palette, label: "Graphic Designers" },
  { icon: Speaker, label: "Sound & Production" },
  { icon: Lightbulb, label: "Lighting & Visuals" },
  { icon: UserCheck, label: "Event Staff" },
  { icon: Newspaper, label: "PR & Publicists" },
  { icon: BadgeDollarSign, label: "Sponsors & Brands" },
];

const stats = [
  { value: "16", label: "Professional roles" },
  { value: "100%", label: "Mobile-first" },
  { value: "7%", label: "+ $0.50 · buyer pays fee" },
];

export default function HomePage() {
  return (
    <div className="relative min-h-dvh bg-background overflow-hidden">
      {/* Cursor spotlight + magnetic CTAs (matches marketing site) */}
      <CinematicEffects />

      {/* ── Ambient background effects ── */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-nocturn/[0.08] rounded-full blur-[120px] animate-mesh-rotate" />
        <div className="absolute -bottom-60 -left-40 w-[500px] h-[500px] bg-nocturn-light/[0.06] rounded-full blur-[100px]" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-nocturn/[0.03] rounded-full blur-[150px]" />
      </div>

      {/* ── Navigation ── */}
      <nav className="relative z-20 flex items-center justify-between px-6 py-5 max-w-6xl mx-auto">
        <NocturnLogo size="md" />
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 min-h-[44px] inline-flex items-center"
          >
            Sign In
          </Link>
          <Link
            href="/signup"
            data-magnetic
            className="inline-flex h-11 items-center justify-center rounded-lg bg-nocturn hover:bg-nocturn-light px-5 text-sm font-medium text-white transition-colors"
          >
            Start free
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative z-10 px-6 pt-16 pb-24 max-w-6xl mx-auto">
        <div className="max-w-3xl">
          <div className="eyebrow-pill mb-8">
            <span className="eyebrow-pill-dot" />
            THE AGENTIC WORK OS · NIGHTLIFE
          </div>

          <h1 className="font-heading text-[clamp(44px,7vw,80px)] font-semibold tracking-[-0.035em] leading-[0.98]">
            You run the night.
            <br />
            <em className="not-italic text-nocturn-glow">
              Nocturn runs the business.
            </em>
          </h1>

          <p className="mt-7 text-lg md:text-xl text-muted-foreground max-w-xl leading-[1.5]">
            The Agentic Work OS for nightlife. Book the talent. Fill the room.
            Settle the night —{" "}
            <span className="text-nocturn-glow">on autopilot.</span>
          </p>

          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href="/signup"
              data-magnetic
              className="inline-flex h-12 items-center justify-center rounded-xl bg-nocturn hover:bg-nocturn-light px-7 text-base font-medium text-white transition-colors"
            >
              Start free →
            </Link>
            <Link
              href="/login"
              className="inline-flex h-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.02] px-7 text-base font-medium hover:bg-white/[0.05] hover:border-white/20 transition-colors"
            >
              Sign in
            </Link>
          </div>

          <p className="mt-5 text-xs font-mono text-muted-foreground/70 uppercase tracking-[0.12em]">
            Free for operators · No credit card
          </p>

          {/* Stats (stat-trio pattern — matches marketing) */}
          <div className="mt-14 grid grid-cols-1 sm:grid-cols-3 gap-px bg-white/[0.06] border border-white/[0.06] rounded-2xl overflow-hidden">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="bg-background px-6 py-7 flex flex-col gap-2 transition-colors hover:bg-white/[0.02]"
              >
                <p className="stat-cell-align text-[clamp(32px,4vw,44px)] font-semibold text-nocturn-glow leading-none whitespace-nowrap">
                  {stat.value}
                </p>
                <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-[0.14em]">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Discover Marketplace ── */}
      <section className="relative z-10 px-6 py-24 max-w-6xl mx-auto">
        <div className="mb-12">
          <div className="section-label-mono mb-5">01 / THE NETWORK</div>
          <h2 className="font-heading text-[clamp(30px,4vw,48px)] font-semibold tracking-[-0.03em] leading-[1.05] mb-4">
            Every role in the scene.
            <br />
            <span className="text-muted-foreground">One platform.</span>
          </h2>
          <p className="text-muted-foreground max-w-xl leading-relaxed">
            From the headliner to the door staff, from the booking agent to the
            flyer designer — Nocturn connects every professional who makes
            nightlife happen.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-white/[0.06] border border-white/[0.06] rounded-2xl overflow-hidden">
          {marketplaceRoles.map((role) => {
            const Icon = role.icon;
            return (
              <Link
                key={role.label}
                href="/signup"
                className="group flex items-center gap-3 bg-background p-5 transition-colors hover:bg-white/[0.02]"
              >
                <Icon className="h-4 w-4 text-nocturn-glow shrink-0" strokeWidth={1.5} />
                <span className="text-sm font-medium truncate">
                  {role.label}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── Your Network ── */}
      <section className="relative z-10 px-6 py-20 max-w-6xl mx-auto">
        <div className="rounded-3xl bg-card/40 ring-1 ring-white/[0.06] p-10 md:p-16 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-nocturn/[0.08] rounded-full blur-[100px] pointer-events-none" />

          <div className="relative z-10 max-w-2xl">
            <div className="section-label-mono mb-6">02 / YOUR ROLODEX</div>
            <h2 className="font-heading text-[clamp(30px,4vw,48px)] font-semibold tracking-[-0.03em] leading-[1.05] mb-6">
              Your rolodex for
              <br />
              <em className="not-italic text-nocturn-glow">
                the nightlife industry.
              </em>
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-8 max-w-xl">
              Every connection you make on Nocturn lives in one place. See who
              you&apos;ve worked with, who you&apos;ve saved, and who&apos;s
              reached out to you — with badges showing how you know each person.
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "Saved", icon: Heart },
                { label: "Contacted", icon: MessageSquare },
                { label: "Worked Together", icon: Users },
                { label: "Search by Role", icon: Search },
              ].map(({ label, icon: Icon }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs font-mono text-muted-foreground uppercase tracking-wider"
                >
                  <Icon className="h-3 w-3 text-nocturn-glow" strokeWidth={1.5} />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="relative z-10 px-6 py-24 max-w-6xl mx-auto">
        <div className="mb-12">
          <div className="section-label-mono mb-5">03 / THE PLATFORM</div>
          <h2 className="font-heading text-[clamp(30px,4vw,48px)] font-semibold tracking-[-0.03em] leading-[1.05]">
            Everything you need.
            <br />
            <span className="text-muted-foreground">
              Nothing you don&apos;t.
            </span>
          </h2>
          <p className="text-sm text-muted-foreground mt-4 max-w-xl leading-relaxed">
            Use Nocturn&apos;s event tools, team chat, and AI agents whether you
            ticket here or somewhere else. No lock-in.
          </p>
        </div>

        <div className="grid gap-px sm:grid-cols-2 lg:grid-cols-4 bg-white/[0.06] border border-white/[0.06] rounded-2xl overflow-hidden">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="group bg-background p-6 transition-colors hover:bg-white/[0.02]"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-nocturn/[0.06] mb-4">
                  <Icon className="h-4 w-4 text-nocturn-glow" strokeWidth={1.5} />
                </div>
                <h3 className="font-heading text-base font-semibold mb-2 tracking-tight">
                  {feature.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Built for Operators ── */}
      <section className="relative z-10 px-6 py-20 max-w-6xl mx-auto">
        <div className="rounded-3xl bg-card/40 ring-1 ring-white/[0.06] p-10 md:p-16 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-nocturn/[0.08] rounded-full blur-[100px] pointer-events-none" />

          <div className="relative z-10 max-w-2xl">
            <div className="section-label-mono mb-6">04 / BUILT FOR OPERATORS</div>
            <h2 className="font-heading text-[clamp(30px,4vw,48px)] font-semibold tracking-[-0.03em] leading-[1.05] mb-6">
              Stop juggling spreadsheets,
              <br />
              <em className="not-italic text-nocturn-glow">
                DMs, and Venmo requests.
              </em>
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-8 max-w-xl">
              Nocturn replaces 6+ tools with one platform. AI agents handle your
              marketing, finance tracking, and team coordination — so you can
              focus on creating unforgettable nights.
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                "Stripe payments",
                "AI content",
                "Real-time chat",
                "Voice recording",
                "Venue discovery",
                "QR check-in",
                "Talent marketplace",
                "Network CRM",
              ].map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs font-mono text-muted-foreground uppercase tracking-wider"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="relative z-10 px-6 py-28 max-w-6xl mx-auto text-center">
        <h2 className="font-heading text-[clamp(36px,6vw,72px)] font-semibold tracking-[-0.035em] leading-[1.05] mb-5 max-w-3xl mx-auto">
          Stop running a business
          <br />
          on <em className="not-italic text-nocturn-glow">group chats.</em>
        </h2>
        <p className="text-muted-foreground text-lg mb-9 max-w-md mx-auto">
          Free to start. Three-minute setup. Built for operators.
        </p>
        <div className="inline-flex flex-wrap justify-center gap-3">
          <Link
            href="/signup"
            data-magnetic
            className="inline-flex h-13 items-center justify-center rounded-xl bg-nocturn hover:bg-nocturn-light px-8 py-[14px] text-base font-medium text-white transition-colors"
          >
            Get started free →
          </Link>
          <Link
            href="/login"
            className="inline-flex h-13 items-center justify-center rounded-xl border border-white/10 bg-white/[0.02] px-8 py-[14px] text-base font-medium hover:bg-white/[0.05] hover:border-white/20 transition-colors"
          >
            Sign in
          </Link>
        </div>
        <p className="mt-6 text-xs font-mono text-muted-foreground/70 uppercase tracking-[0.12em]">
          No credit card · Free for operators
        </p>
      </section>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-white/[0.06] px-6 py-8 max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <NocturnLogo size="sm" />
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-[0.1em]">
            © {new Date().getFullYear()} Nocturn Technologies · Built in Toronto
          </p>
        </div>
      </footer>
    </div>
  );
}
