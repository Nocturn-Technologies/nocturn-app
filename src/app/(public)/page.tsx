import type { Metadata } from "next";
import Link from "next/link";
import { NocturnLogo } from "@/components/nocturn-logo";

export const metadata: Metadata = {
  title: "Nocturn — You run the night. Nocturn runs the business.",
  description:
    "The platform for everyone in nightlife. Events, ticketing, finance, a 16-role talent marketplace, and a built-in professional network — powered by AI.",
};
import {
  Calendar,
  DollarSign,
  Sparkles,
  Users,
  Mic,
  ArrowRight,
  Zap,
  Shield,
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
    color: "text-nocturn-light",
    bg: "bg-nocturn/15",
  },
  {
    icon: Sparkles,
    title: "AI Marketing",
    description:
      "Generate social posts, email campaigns, and promo content. Your AI marketing team, on demand.",
    color: "text-nocturn-glow",
    bg: "bg-nocturn-glow/10",
  },
  {
    icon: DollarSign,
    title: "Finance & Settlements",
    description:
      "Real-time P&L, artist settlements, expense tracking. Know your numbers before the night ends.",
    color: "text-emerald-400",
    bg: "bg-emerald-500/15",
  },
  {
    icon: Search,
    title: "Discover Marketplace",
    description:
      "Find and book from 16 professional roles — DJs, photographers, managers, designers, and more.",
    color: "text-violet-400",
    bg: "bg-violet-500/15",
  },
  {
    icon: Users2,
    title: "Your Network",
    description:
      "Every connection lives in one place. See who you've worked with, saved, and contacted — your nightlife rolodex.",
    color: "text-cyan-400",
    bg: "bg-cyan-500/15",
  },
  {
    icon: MessageSquare,
    title: "Team Sync & Chat",
    description:
      "Real-time chat with your collective and collab channels with other crews. Coordinate without the chaos.",
    color: "text-amber-400",
    bg: "bg-amber-500/15",
  },
  {
    icon: Mic,
    title: "Voice Recording",
    description:
      "Record calls with venues and artists. AI transcribes and extracts action items automatically.",
    color: "text-pink-400",
    bg: "bg-pink-500/15",
  },
  {
    icon: Users,
    title: "Attendee CRM",
    description:
      "Build your audience. Track who comes, who returns, and turn one-time guests into regulars.",
    color: "text-orange-400",
    bg: "bg-orange-500/15",
  },
];

const marketplaceRoles = [
  { icon: Music, label: "DJs & Artists", color: "text-nocturn-light", bg: "bg-nocturn/15" },
  { icon: MapPin, label: "Venues", color: "text-emerald-400", bg: "bg-emerald-500/15" },
  { icon: Users, label: "Collectives", color: "text-blue-400", bg: "bg-blue-500/15" },
  { icon: Megaphone, label: "Promoters", color: "text-amber-400", bg: "bg-amber-500/15" },
  { icon: Briefcase, label: "Artist Managers", color: "text-orange-400", bg: "bg-orange-500/15" },
  { icon: Plane, label: "Tour Managers", color: "text-indigo-400", bg: "bg-indigo-500/15" },
  { icon: CalendarCheck, label: "Booking Agents", color: "text-violet-400", bg: "bg-violet-500/15" },
  { icon: Camera, label: "Photographers", color: "text-pink-400", bg: "bg-pink-500/15" },
  { icon: Video, label: "Videographers", color: "text-red-400", bg: "bg-red-500/15" },
  {
    icon: () => <span className="text-lg">🎤</span>,
    label: "MCs & Hosts",
    color: "text-fuchsia-400",
    bg: "bg-fuchsia-500/15",
  },
  { icon: Palette, label: "Graphic Designers", color: "text-rose-400", bg: "bg-rose-500/15" },
  { icon: Speaker, label: "Sound & Production", color: "text-cyan-400", bg: "bg-cyan-500/15" },
  { icon: Lightbulb, label: "Lighting & Visuals", color: "text-yellow-400", bg: "bg-yellow-500/15" },
  { icon: UserCheck, label: "Event Staff", color: "text-slate-400", bg: "bg-slate-500/15" },
  { icon: Newspaper, label: "PR & Publicists", color: "text-teal-400", bg: "bg-teal-500/15" },
  { icon: BadgeDollarSign, label: "Sponsors & Brands", color: "text-green-400", bg: "bg-green-500/15" },
];

const stats = [
  { value: "16", label: "Professional roles" },
  { value: "100%", label: "Mobile-first" },
  { value: "AI", label: "Powered workflows" },
  { value: "7%", label: "Per ticket only" },
];

export default function HomePage() {
  return (
    <div className="relative min-h-dvh bg-background overflow-hidden">
      {/* ── Ambient background effects ── */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-nocturn/[0.07] rounded-full blur-[120px] animate-mesh-rotate" />
        <div className="absolute -bottom-60 -left-40 w-[500px] h-[500px] bg-nocturn-teal/[0.04] rounded-full blur-[100px]" />
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
            className="inline-flex h-11 items-center justify-center rounded-lg bg-gradient-to-r from-nocturn to-nocturn-light px-5 text-sm font-semibold text-white hover:shadow-lg hover:shadow-nocturn/25 hover:brightness-110 transition-all duration-300"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative z-10 px-6 pt-20 pb-28 max-w-6xl mx-auto">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-nocturn/20 bg-nocturn/[0.06] px-3 py-1 mb-8">
            <Zap className="h-3.5 w-3.5 text-nocturn-light" />
            <span className="text-xs font-medium text-nocturn-light tracking-wide">
              The Platform for Everyone in Nightlife
            </span>
          </div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight leading-[0.95]">
            You run
            <br />
            the night.
            <br />
            <span className="bg-gradient-to-r from-nocturn via-nocturn-light to-nocturn-glow bg-clip-text text-transparent">
              Nocturn runs
            </span>
            <br />
            the business.
          </h1>

          <p className="mt-8 text-lg md:text-xl text-muted-foreground max-w-xl leading-relaxed">
            Events, ticketing, finance, a 16-role talent marketplace, and a
            built-in professional network. Whether you throw the events or make
            them happen — this is your platform.
          </p>

          <div className="mt-10 flex flex-wrap gap-4">
            <Link
              href="/signup"
              className="group inline-flex h-12 items-center justify-center rounded-xl bg-gradient-to-r from-nocturn to-nocturn-light px-8 text-base font-semibold text-white shadow-lg shadow-nocturn/25 hover:shadow-xl hover:shadow-nocturn/30 hover:brightness-110 transition-all duration-300"
            >
              Get Started
              <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              href="/login"
              className="inline-flex h-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-8 text-base font-medium hover:bg-white/[0.06] hover:border-white/20 transition-all duration-300"
            >
              Sign In
            </Link>
          </div>

          <div className="mt-16 flex gap-8 md:gap-14">
            {stats.map((stat) => (
              <div key={stat.label}>
                <p className="text-3xl md:text-4xl font-extrabold text-nocturn-light">
                  {stat.value}
                </p>
                <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">
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
          <div className="flex items-center gap-2 mb-4">
            <Search className="h-4 w-4 text-nocturn-light" />
            <span className="text-xs font-bold uppercase tracking-widest text-nocturn-light">
              Discover Marketplace
            </span>
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4">
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

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {marketplaceRoles.map((role) => {
            const Icon = role.icon;
            return (
              <Link
                key={role.label}
                href="/signup"
                className="group flex items-center gap-3 rounded-xl bg-card/40 ring-1 ring-white/[0.06] p-4 transition-all duration-300 hover:ring-nocturn/30 hover:bg-card/60"
              >
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-lg ${role.bg} shrink-0`}
                >
                  <Icon className={`h-4 w-4 ${role.color}`} />
                </div>
                <span className="text-sm font-medium truncate">
                  {role.label}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── Your Network ── */}
      <section className="relative z-10 px-6 py-24 max-w-6xl mx-auto">
        <div className="rounded-3xl bg-gradient-to-br from-cyan-500/10 via-nocturn/[0.04] to-transparent ring-1 ring-cyan-500/15 p-10 md:p-16 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-500/10 rounded-full blur-[100px] pointer-events-none" />

          <div className="relative z-10 max-w-2xl">
            <div className="flex items-center gap-2 mb-6">
              <Users2 className="h-5 w-5 text-cyan-400" />
              <span className="text-xs font-bold uppercase tracking-widest text-cyan-400">
                Your Network
              </span>
            </div>
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-6">
              Your rolodex for
              <br />
              the nightlife industry.
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-8 max-w-xl">
              Every connection you make on Nocturn lives in one place. See who
              you&apos;ve worked with, who you&apos;ve saved, and who&apos;s
              reached out to you — with badges showing how you know each person.
            </p>
            <div className="flex flex-wrap gap-3">
              {[
                { label: "Saved", icon: Heart },
                { label: "Contacted", icon: MessageSquare },
                { label: "Worked Together", icon: Users },
                { label: "Search by Role", icon: Search },
              ].map(({ label, icon: Icon }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/20 bg-cyan-500/[0.06] px-3 py-1.5 text-xs font-medium text-cyan-400"
                >
                  <Icon className="h-3 w-3" />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="relative z-10 px-6 py-24 max-w-6xl mx-auto">
        <div className="mb-16">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            Everything you need.
            <br />
            <span className="text-muted-foreground">Nothing you don&apos;t.</span>
          </h2>
          <p className="text-sm text-muted-foreground mt-4">
            Use Nocturn&apos;s event tools, team chat, and AI agents whether you
            ticket here or somewhere else. No lock-in.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="group rounded-2xl bg-card/40 backdrop-blur-sm ring-1 ring-white/[0.06] p-6 transition-all duration-300 hover:ring-white/[0.1] hover:bg-card/60 hover:shadow-lg hover:shadow-nocturn/5"
              >
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-xl ${feature.bg} mb-4`}
                >
                  <Icon className={`h-5 w-5 ${feature.color}`} />
                </div>
                <h3 className="text-base font-bold mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Built for Operators ── */}
      <section className="relative z-10 px-6 py-24 max-w-6xl mx-auto">
        <div className="rounded-3xl bg-gradient-to-br from-nocturn/10 via-nocturn/[0.04] to-transparent ring-1 ring-nocturn/15 p-10 md:p-16 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-nocturn/10 rounded-full blur-[100px] pointer-events-none" />

          <div className="relative z-10 max-w-2xl">
            <div className="flex items-center gap-2 mb-6">
              <Shield className="h-5 w-5 text-nocturn-light" />
              <span className="text-xs font-bold uppercase tracking-widest text-nocturn-light">
                Built for Operators
              </span>
            </div>
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-6">
              Stop juggling spreadsheets,
              <br />
              DMs, and Venmo requests.
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-8 max-w-xl">
              Nocturn replaces 6+ tools with one platform. AI agents handle your
              marketing, finance tracking, and team coordination — so you can
              focus on creating unforgettable nights.
            </p>
            <div className="flex flex-wrap gap-3">
              {[
                "Stripe Payments",
                "AI Content",
                "Real-time Chat",
                "Voice Recording",
                "Venue Discovery",
                "QR Check-in",
                "Talent Marketplace",
                "Network CRM",
              ].map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-nocturn/20 bg-nocturn/[0.06] px-3 py-1.5 text-xs font-medium text-nocturn-light"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="relative z-10 px-6 py-24 max-w-6xl mx-auto text-center">
        <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-6">
          Ready to level up?
        </h2>
        <p className="text-muted-foreground text-lg mb-10 max-w-md mx-auto">
          Join the operators, DJs, photographers, managers, and crews already
          building on Nocturn.
        </p>
        <Link
          href="/signup"
          className="group inline-flex h-14 items-center justify-center rounded-xl bg-gradient-to-r from-nocturn to-nocturn-light px-10 text-lg font-bold text-white shadow-xl shadow-nocturn/25 hover:shadow-2xl hover:shadow-nocturn/30 hover:brightness-110 transition-all duration-300"
        >
          Get Started Free
          <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
        </Link>
      </section>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-white/[0.06] px-6 py-8 max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <NocturnLogo size="sm" />
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Nocturn Technologies. All rights
            reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
