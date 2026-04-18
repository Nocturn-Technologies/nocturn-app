"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { NocturnLogo } from "@/components/nocturn-logo";

const MARKETING_LINKS = [
  { href: "https://trynocturn.com/product.html", label: "Product" },
  { href: "https://trynocturn.com/discover.html", label: "Discover" },
  { href: "https://trynocturn.com/pricing.html", label: "Pricing" },
  { href: "https://trynocturn.com/about.html", label: "About" },
];

export function AppNav() {
  const [open, setOpen] = useState(false);

  // Close the menu if viewport grows past the mobile breakpoint
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(min-width: 768px)");
    const onChange = () => {
      if (mql.matches) setOpen(false);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <nav className="relative z-20 max-w-6xl mx-auto">
      <div className="flex items-center justify-between px-6 py-5">
        <Link href="/" className="shrink-0">
          <NocturnLogo size="md" />
        </Link>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-7 text-sm text-muted-foreground">
          {MARKETING_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="hover:text-foreground transition-colors"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="hidden sm:inline-flex text-sm text-muted-foreground hover:text-foreground transition-colors px-3 min-h-[44px] items-center"
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

          {/* Hamburger — mobile only */}
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 hover:border-white/20 hover:bg-white/[0.02] transition-colors ml-1"
          >
            {open ? (
              <X className="h-4 w-4" strokeWidth={1.75} />
            ) : (
              <Menu className="h-4 w-4" strokeWidth={1.75} />
            )}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div className="md:hidden border-t border-white/[0.06] bg-background/95 backdrop-blur-sm">
          <div className="px-6 py-3 flex flex-col">
            {MARKETING_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="py-3 text-base font-medium text-foreground border-b border-white/[0.04] last:border-b-0 hover:text-nocturn-glow transition-colors"
              >
                {link.label}
              </a>
            ))}
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="sm:hidden py-3 text-base font-medium text-muted-foreground hover:text-foreground transition-colors border-t border-white/[0.04] mt-1"
            >
              Sign in
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
