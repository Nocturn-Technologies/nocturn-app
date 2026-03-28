import type { Metadata } from "next";
import Link from "next/link";
import { NocturnLogo } from "@/components/nocturn-logo";

export const metadata: Metadata = {
  title: "Nocturn — You run the night. Nocturn runs the business.",
  description: "AI-powered operations platform for music collectives and independent promoters. Events, ticketing, settlements, and marketing — all in one place.",
};
import {
  Calendar,
  DollarSign,
  Sparkles,
  Users,
  Mic,
  BarChart3,
  ArrowRight,
  Zap,
  Shield,
  MessageSquare,
} from "lucide-react";

const features = [
  {
    icon: Calendar,
    title: "Event Management",
    description: "Create, publish, and manage events with ticketing, guest lists, and check-in — all from your phone.",
    color: "text-nocturn-light",
    bg: "bg-nocturn/15",
  },
  {
    icon: Sparkles,
    title: "AI Marketing",
    description: "Generate social posts, email campaigns, and promo content. Your AI marketing team, on demand.",
    color: "text-nocturn-glow",
    bg: "bg-nocturn-glow/10",
  },
  {
    icon: DollarSign,
    title: "Finance & Settlements",
    description: "Real-time P&L, artist settlements, expense tracking. Know your numbers before the night ends.",
    color: "text-nocturn-teal",
    bg: "bg-nocturn-teal/15",
  },
  {
    icon: Users,
    title: "Attendee CRM",
    description: "Build your audience. Track who comes, who returns, and turn one-time guests into regulars.",
    color: "text-nocturn-coral",
    bg: "bg-nocturn-coral/15",
  },
  {
    icon: Mic,
    title: "Voice Recording",
    description: "Record calls with venues and artists. AI transcribes and extracts action items automatically.",
    color: "text-nocturn-amber",
    bg: "bg-nocturn-amber/15",
  },
  {
    icon: MessageSquare,
    title: "Team Sync",
    description: "Real-time chat with your collective. AI assistant built in. Coordinate without the chaos.",
    color: "text-nocturn-light",
    bg: "bg-nocturn/15",
  },
];

const stats = [
  { value: "10x", label: "Faster event setup" },
  { value: "100%", label: "Mobile-first" },
  { value: "AI", label: "Powered workflows" },
];

export default function HomePage() {
  return (
    <div className="relative min-h-screen bg-background overflow-hidden">
      {/* ── Ambient background effects ── */}
      <div className="fixed inset-0 pointer-events-none">
        {/* Large purple orb — top right */}
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-nocturn/[0.07] rounded-full blur-[120px] animate-mesh-rotate" />
        {/* Teal orb — bottom left */}
        <div className="absolute -bottom-60 -left-40 w-[500px] h-[500px] bg-nocturn-teal/[0.04] rounded-full blur-[100px]" />
        {/* Center glow */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-nocturn/[0.03] rounded-full blur-[150px]" />
      </div>

      {/* ── Navigation ── */}
      <nav className="relative z-20 flex items-center justify-between px-6 py-5 max-w-6xl mx-auto">
        <NocturnLogo size="md" />
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2"
          >
            Sign In
          </Link>
          <Link
            href="/signup"
            className="inline-flex h-9 items-center justify-center rounded-lg bg-gradient-to-r from-nocturn to-nocturn-light px-5 text-sm font-semibold text-white hover:shadow-lg hover:shadow-nocturn/25 hover:brightness-110 transition-all duration-300"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative z-10 px-6 pt-20 pb-32 max-w-6xl mx-auto">
        <div className="max-w-3xl">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-nocturn/20 bg-nocturn/[0.06] px-3 py-1 mb-8">
            <Zap className="h-3.5 w-3.5 text-nocturn-light" />
            <span className="text-xs font-medium text-nocturn-light tracking-wide">AI-Powered Nightlife Operations</span>
          </div>

          {/* Headline */}
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

          {/* Subheading */}
          <p className="mt-8 text-lg md:text-xl text-muted-foreground max-w-xl leading-relaxed">
            The all-in-one platform for nightlife promoters and collectives.
            Events, ticketing, marketing, finance, team coordination —
            powered by AI agents that work while you sleep.
          </p>

          {/* CTA buttons */}
          <div className="mt-10 flex flex-wrap gap-4">
            <Link
              href="/signup"
              className="group inline-flex h-12 items-center justify-center rounded-xl bg-gradient-to-r from-nocturn to-nocturn-light px-8 text-base font-semibold text-white shadow-lg shadow-nocturn/25 hover:shadow-xl hover:shadow-nocturn/30 hover:brightness-110 transition-all duration-300"
            >
              Start Building
              <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              href="/login"
              className="inline-flex h-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-8 text-base font-medium hover:bg-white/[0.06] hover:border-white/20 transition-all duration-300"
            >
              Sign In
            </Link>
          </div>

          {/* Stats row */}
          <div className="mt-16 flex gap-10 md:gap-16">
            {stats.map((stat) => (
              <div key={stat.label}>
                <p className="text-3xl md:text-4xl font-extrabold text-nocturn-light">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="relative z-10 px-6 py-24 max-w-6xl mx-auto">
        <div className="mb-16">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            Everything you need.
            <br />
            <span className="text-muted-foreground">Nothing you don't.</span>
          </h2>
        </div>

        <p className="text-sm text-muted-foreground mb-8 -mt-8">
          Use Nocturn&apos;s event tools, team chat, and AI agents whether you ticket here or somewhere else. No lock-in.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="group rounded-2xl bg-card/40 backdrop-blur-sm ring-1 ring-white/[0.06] p-6 transition-all duration-300 hover:ring-white/[0.1] hover:bg-card/60 hover:shadow-lg hover:shadow-nocturn/5"
              >
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${feature.bg} mb-4`}>
                  <Icon className={`h-5 w-5 ${feature.color}`} />
                </div>
                <h3 className="text-base font-bold mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Built for the Night ── */}
      <section className="relative z-10 px-6 py-24 max-w-6xl mx-auto">
        <div className="rounded-3xl bg-gradient-to-br from-nocturn/10 via-nocturn/[0.04] to-transparent ring-1 ring-nocturn/15 p-10 md:p-16 relative overflow-hidden">
          {/* Background glow */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-nocturn/10 rounded-full blur-[100px] pointer-events-none" />

          <div className="relative z-10 max-w-2xl">
            <div className="flex items-center gap-2 mb-6">
              <Shield className="h-5 w-5 text-nocturn-light" />
              <span className="text-xs font-bold uppercase tracking-widest text-nocturn-light">Built for Operators</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-6">
              Stop juggling spreadsheets,
              <br />
              DMs, and Venmo requests.
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-8 max-w-xl">
              Nocturn replaces 6+ tools with one platform. AI agents handle your marketing,
              finance tracking, and team coordination — so you can focus on creating
              unforgettable nights.
            </p>
            <div className="flex flex-wrap gap-3">
              {["Stripe Payments", "AI Content", "Real-time Chat", "Voice Recording", "Venue Discovery", "QR Check-in"].map((tag) => (
                <span key={tag} className="rounded-full border border-nocturn/20 bg-nocturn/[0.06] px-3 py-1.5 text-xs font-medium text-nocturn-light">
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
          Join the collectives already using Nocturn to run smarter nights.
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
            &copy; {new Date().getFullYear()} Nocturn Technologies. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
