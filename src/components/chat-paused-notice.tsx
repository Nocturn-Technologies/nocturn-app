import { MessageSquare } from "lucide-react";
import Link from "next/link";

/**
 * Stub shown wherever chat used to live. Chat is paused while the
 * collective + AI + DM feature set is rethought (see NOC-31). Routes
 * still respond 200 with this notice rather than 404 so existing links
 * (emails, bookmarks, app shortcuts) don't break.
 */
export function ChatPausedNotice() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-nocturn/10 mb-6">
        <MessageSquare className="h-7 w-7 text-nocturn" />
      </div>
      <h1 className="text-2xl font-bold font-heading mb-2">Chat is paused</h1>
      <p className="text-sm text-muted-foreground max-w-md mb-6">
        We&apos;re rethinking how messaging should work — what helps operators
        coordinate vs. what just adds noise. The current chat is offline while
        we figure out a sharper version.
      </p>
      <Link
        href="/dashboard"
        className="inline-flex items-center min-h-[44px] px-5 rounded-xl bg-nocturn hover:bg-nocturn-light text-white font-medium text-sm transition-colors"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
