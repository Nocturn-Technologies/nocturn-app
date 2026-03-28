"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { haptic } from "@/lib/haptics";
import { useShake } from "@/hooks/use-shake";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Home,
  Calendar,
  Sparkles,
  DollarSign,
  Settings,
  LogOut,
  MessageSquare,
  Search,
  Menu,
  X,
  UsersRound,
  Compass,
  Megaphone,
} from "lucide-react";
import { NotificationToast } from "@/components/notification-toast";
import { useNotifications } from "@/hooks/use-notifications";
import { NocturnLogo } from "@/components/nocturn-logo";
import { AskNocturn } from "@/components/ask-nocturn";
import { posthog } from "@/lib/posthog";

interface DashboardShellProps {
  user: { id: string; email: string; fullName: string };
  collectives: { id: string; name: string; slug: string; logo_url: string | null; role: string }[];
  children: React.ReactNode;
}

/* ── Desktop sidebar nav items (7 core sections) ── */
const sidebarNavItems = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/dashboard/chat", label: "Chat", icon: MessageSquare },
  { href: "/dashboard/discover", label: "Discover", icon: Compass },
  { href: "/dashboard/events", label: "Ops", icon: Calendar },
  { href: "/dashboard/audience", label: "Reach", icon: UsersRound },
  { href: "/dashboard/finance", label: "Money", icon: DollarSign },
  { href: "/dashboard/marketing", label: "Promo", icon: Sparkles },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

/* ── Mobile bottom tab bar items (4 tabs) ── */
const mobileTabItems = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/dashboard/events", label: "Ops", icon: Calendar },
  { href: "/dashboard/discover", label: "Discover", icon: Compass },
  { href: "/dashboard/chat", label: "Chat", icon: MessageSquare },
];

/* ── More drawer items (items not in mobile tabs) ── */
const moreDrawerItems = [
  { href: "/dashboard/audience", label: "Reach", icon: UsersRound },
  { href: "/dashboard/finance", label: "Money", icon: DollarSign },
  { href: "/dashboard/marketing", label: "Promo", icon: Sparkles },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

/* ── Promoter-specific nav ── */
const promoterSidebarItems = [
  { href: "/dashboard/promote", label: "Promote", icon: Megaphone },
  { href: "/dashboard/discover", label: "Discover", icon: Compass },
  { href: "/dashboard/chat", label: "Chat", icon: MessageSquare },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

const promoterMobileTabItems = [
  { href: "/dashboard/promote", label: "Promote", icon: Megaphone },
  { href: "/dashboard/chat", label: "Chat", icon: MessageSquare },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function DashboardShell({ user, collectives, children }: DashboardShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [shakeToast, setShakeToast] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [betaDismissed, setBetaDismissed] = useState(true); // start true to avoid flash
  const { notifications, dismiss: dismissNotification } = useNotifications();

  // Identify user in PostHog
  useEffect(() => {
    if (user?.id) {
      posthog.identify(user.id, {
        email: user.email,
        name: user.fullName,
        collective: collectives?.[0]?.name,
      });
    }
  }, [user, collectives]);

  // Check localStorage for beta banner dismissed state
  useEffect(() => {
    const dismissed = localStorage.getItem("nocturn-beta-dismissed");
    setBetaDismissed(dismissed === "true");
  }, []);

  const dismissBeta = () => {
    setBetaDismissed(true);
    localStorage.setItem("nocturn-beta-dismissed", "true");
  };

  const initials = user.fullName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  // Shake to Record — only on mobile
  const handleShake = useCallback(() => {
    if (typeof window === "undefined" || window.innerWidth >= 768) return;
    haptic('heavy');
    setShakeToast(true);
    router.push("/dashboard/record");
    setTimeout(() => setShakeToast(false), 2000);
  }, [router]);

  useShake(handleShake);

  // Auto-dismiss shake toast
  useEffect(() => {
    if (!shakeToast) return;
    const t = setTimeout(() => setShakeToast(false), 2000);
    return () => clearTimeout(t);
  }, [shakeToast]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const activeColl = collectives[0];
  const isPromoter = activeColl?.role === "promoter";

  // Select nav items based on user type
  const currentSidebarItems = isPromoter ? promoterSidebarItems : sidebarNavItems;
  const currentMobileItems = isPromoter ? promoterMobileTabItems : mobileTabItems;
  const currentMoreItems = isPromoter ? [] : moreDrawerItems;

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    if (href === "/dashboard/promote") return pathname === "/dashboard/promote";
    return pathname.startsWith(href);
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* ── Beta Banner ── */}
      {!betaDismissed && (
        <div className="relative w-full bg-nocturn/10 border-b border-nocturn/20 py-1.5 px-4 flex items-center justify-center shrink-0 z-50">
          <span className="text-xs text-nocturn text-center">
            🌙 Nocturn is in beta — We'd love your feedback
          </span>
          <a
            href="mailto:shawn@trynocturn.com"
            className="absolute right-10 text-xs text-nocturn/70 hover:text-nocturn underline hidden sm:block"
          >
            Send feedback
          </a>
          <button
            onClick={dismissBeta}
            className="absolute right-3 text-nocturn/50 hover:text-nocturn"
            aria-label="Dismiss beta banner"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
      {/* ── Notification Toasts ── */}
      <NotificationToast notifications={notifications} onDismiss={dismissNotification} />

      {/* ── Desktop sidebar (hidden on mobile) ── */}
      <aside className="hidden w-64 shrink-0 border-r border-white/[0.06] bg-gradient-to-b from-[#12111a] to-[#0d0c14] md:flex md:flex-col relative overflow-hidden">
        {/* Ambient glow at top of sidebar */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-40 bg-nocturn/8 rounded-full blur-3xl pointer-events-none" />

        <div className="flex h-14 items-center border-b border-white/[0.06] px-4 relative z-10">
          <Link href="/dashboard">
            <NocturnLogo size="md" />
          </Link>
        </div>

        {activeColl && (
          <div className="border-b border-white/[0.06] px-4 py-3 relative z-10">
            <p className="text-sm font-semibold">{activeColl.name}</p>
            <p className="text-xs text-muted-foreground capitalize">{activeColl.role}</p>
          </div>
        )}

        <nav className="flex-1 space-y-0.5 p-3 relative z-10">
          {currentSidebarItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={true}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200 ${
                  active
                    ? "bg-nocturn/15 text-white shadow-[0_0_12px_rgba(123,47,247,0.15)]"
                    : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? "text-nocturn-light" : ""}`} />
                <span className={active ? "font-medium" : ""}>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/[0.06] p-3 relative z-10">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-white/[0.04] transition-colors">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-gradient-to-br from-nocturn to-nocturn-light text-xs text-white">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="truncate">{user.fullName || user.email}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* ── Main content area ── */}
      <div className="flex flex-1 flex-col">
        {/* Mobile header */}
        <header className="flex h-14 items-center justify-between border-b border-white/[0.06] px-4 md:hidden bg-background/80 backdrop-blur-md">
          <Link href="/dashboard">
            <NocturnLogo size="sm" />
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-gradient-to-br from-nocturn to-nocturn-light text-xs text-white">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {activeColl && (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  {activeColl.name}
                </div>
              )}
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* Page content — pb-20 on mobile for bottom tab bar clearance, normal on desktop */}
        <main className="flex-1 overflow-y-auto p-4 pb-20 md:p-6 md:pb-6">{children}</main>

        {/* ── Mobile bottom tab bar (hidden on desktop) ── */}
        <nav className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-around border-t border-white/[0.06] bg-background/90 backdrop-blur-xl px-2 pt-2 pb-[max(env(safe-area-inset-bottom),8px)] md:hidden">
          {currentMobileItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => haptic('light')}
                className={`flex items-center justify-center gap-1.5 rounded-full px-4 min-h-[48px] min-w-[48px] transition-all duration-300 ${
                  active
                    ? "bg-nocturn text-white shadow-lg shadow-nocturn/30"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon
                  className="h-5 w-5 shrink-0"
                  {...(active ? { strokeWidth: 2.5 } : {})}
                />
                <span className={`text-xs font-semibold whitespace-nowrap ${active ? "" : "hidden"}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}
          {/* More button (hidden for promoters — all tabs fit) */}
          {currentMoreItems.length > 0 && (
            <button
              onClick={() => { haptic('light'); setMoreOpen(true); }}
              aria-label="Open menu"
              className={`flex flex-col items-center justify-center gap-0.5 min-h-[48px] min-w-[48px] transition-all ${
                moreOpen
                  ? "text-nocturn"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Menu className="h-5 w-5 shrink-0" />
              <span className="text-[10px]">More</span>
            </button>
          )}
        </nav>
      </div>

      {/* ── More Drawer (mobile) — frosted glass ── */}
      {moreOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
            onClick={() => setMoreOpen(false)}
          />
          {/* Drawer */}
          <div className="absolute inset-x-0 bottom-0 animate-slide-in-up">
            <div className="bg-[#12111a]/95 backdrop-blur-2xl rounded-t-3xl border-t border-white/[0.08] px-4 pt-3 pb-[max(env(safe-area-inset-bottom),16px)]">
              {/* Drag handle */}
              <div className="flex justify-center mb-4">
                <div className="w-10 h-1 rounded-full bg-white/20" />
              </div>
              {/* Nav items */}
              <nav className="space-y-0.5 mb-4">
                {currentMoreItems.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => { haptic('light'); setMoreOpen(false); }}
                      className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition-all duration-200 ${
                        active
                          ? "bg-nocturn/15 text-white shadow-[0_0_12px_rgba(123,47,247,0.15)]"
                          : "text-foreground hover:bg-white/[0.04]"
                      }`}
                    >
                      <Icon className={`h-5 w-5 ${active ? "text-nocturn-light" : ""}`} />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>
        </div>
      )}

      {/* Shake-to-Record toast */}
      {shakeToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] animate-fade-in-up md:hidden">
          <div className="flex items-center gap-2 rounded-full bg-gradient-to-r from-nocturn to-nocturn-light px-4 py-2 shadow-lg shadow-nocturn/30">
            <span className="text-sm">🎤</span>
            <span className="text-sm font-medium text-white">Recording...</span>
          </div>
        </div>
      )}

      {/* ── Ask Nocturn AI Assistant ── */}
      {activeColl && <AskNocturn collectiveId={activeColl.id} />}
      </div>
    </div>
  );
}
