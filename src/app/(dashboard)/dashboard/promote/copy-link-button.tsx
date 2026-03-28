"use client";

import { useState, useEffect, useRef } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function CopyLinkButton({ url, label = "Copy Link" }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const userIdRef = useRef<string | null>(null);

  // Fetch user ID once on mount
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      userIdRef.current = user?.id ?? null;
    });
  }, []);

  async function handleCopy() {
    const refUrl = userIdRef.current ? `${url}?ref=${userIdRef.current}` : url;

    // Try native share on mobile, fallback to clipboard
    if (navigator.share) {
      try {
        await navigator.share({ url: refUrl });
        return;
      } catch {
        // User cancelled share sheet — fall through to clipboard
      }
    }

    await navigator.clipboard.writeText(refUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="shrink-0 gap-1.5 text-xs"
      onClick={handleCopy}
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-green-500" />
          Copied!
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          {label}
        </>
      )}
    </Button>
  );
}
