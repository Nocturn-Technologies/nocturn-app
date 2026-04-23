import { MessageSquare, Sparkles } from "lucide-react";
import Link from "next/link";

/**
 * Gate shown on /dashboard/chat. Chat is on hold while we figure out the
 * right shape — see NOC-31. Route still returns 200 so bookmarks / app
 * shortcuts don't break.
 */
export function ChatPausedNotice() {
  return (
    <div className="relative flex flex-col items-center justify-center min-h-[70vh] px-6 text-center overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[400px] w-[400px] rounded-full bg-nocturn/[0.06] blur-[120px]" />
      </div>

      <div className="relative inline-flex items-center gap-1.5 rounded-full border border-nocturn/20 bg-nocturn/[0.06] px-3 py-1 mb-6">
        <Sparkles className="h-3 w-3 text-nocturn" />
        <span className="text-[11px] font-medium uppercase tracking-wider text-nocturn">Coming soon</span>
      </div>

      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-nocturn/10 ring-1 ring-nocturn/20 mb-6">
        <MessageSquare className="h-7 w-7 text-nocturn" />
      </div>

      <h1 className="relative text-2xl font-bold font-heading mb-2 text-foreground">
        Chat is coming soon
      </h1>
      <p className="relative text-sm text-muted-foreground max-w-md mb-7 leading-relaxed">
        We&apos;re building messaging designed for how operators actually coordinate — not another inbox.
        Check back soon.
      </p>

      <Link
        href="/dashboard"
        className="relative inline-flex items-center min-h-[44px] px-5 rounded-xl bg-nocturn hover:bg-nocturn-light text-white font-medium text-sm transition-colors"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
