"use client";

import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { searchProfiles } from "@/app/actions/marketplace";
import { sendInquiry } from "@/app/actions/marketplace";
import {
  Search,
  MessageCircle,
  UserPlus,
  Copy,
  Check,
  Send,
  ArrowRight,
  Mail,
  Loader2,
} from "lucide-react";
import { TYPE_LABELS_SHORT, TYPE_BADGE_COLORS } from "@/lib/marketplace-constants";

interface MarketplaceConnectProps {
  userType: string;
  displayName: string;
  city: string;
  onSkip: () => void;
  onDone: () => void;
}

export function MarketplaceConnect({
  userType: _userType,
  displayName,
  city,
  onSkip,
  onDone,
}: MarketplaceConnectProps) {
  const [mode, setMode] = useState<"search" | "invite">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Record<string, unknown>[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Message state
  const [selectedProfile, setSelectedProfile] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // Invite state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteSent, setInviteSent] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const appUrl = typeof window !== "undefined" ? window.location.origin : "https://app.trynocturn.com";
  const inviteLink = `${appUrl}/signup?ref=${encodeURIComponent(displayName.toLowerCase().replace(/\s+/g, "-"))}`;

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    setHasSearched(true);

    try {
      // Search marketplace profiles in the same city first, then broader
      const { profiles } = await searchProfiles({
        query: query.trim(),
        city: city || undefined,
      });
      setResults(profiles);
    } catch {
      setResults([]);
    }

    setSearching(false);
  }, [query, city]);

  const handleSendMessage = useCallback(async () => {
    if (!selectedProfile || !message.trim()) return;
    setSending(true);

    try {
      const result = await sendInquiry({
        toProfileId: selectedProfile.id as string,
        message: message.trim(),
        inquiryType: "intro",
      });

      if (!result.error) {
        setSent(true);
      }
    } catch {
      // Silent fail — they can retry
    }

    setSending(false);
  }, [selectedProfile, message]);

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(inviteLink).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }, [inviteLink]);

  const handleInviteEmail = useCallback(async () => {
    if (!inviteEmail.trim()) return;

    // Open mailto with a pre-filled invite
    const subject = encodeURIComponent(`Join me on Nocturn`);
    const body = encodeURIComponent(
      `Hey! I just set up my profile on Nocturn — it's a platform for the nightlife industry. You should check it out.\n\nSign up here: ${inviteLink}\n\n– ${displayName}`
    );
    window.open(`mailto:${inviteEmail.trim()}?subject=${subject}&body=${body}`, "_blank");
    setInviteSent(true);
  }, [inviteEmail, inviteLink, displayName]);

  // After sending a message or invite, show success
  if (sent) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/10">
            <Check className="h-7 w-7 text-green-500" />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-semibold">Message sent!</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {(selectedProfile?.display_name as string) ?? "They"}&apos;ll get notified.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Button
            onClick={onDone}
            className="w-full bg-nocturn hover:bg-nocturn-light py-5 text-base"
          >
            Go to Dashboard
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <button
            onClick={() => {
              setSent(false);
              setSelectedProfile(null);
              setMessage("");
            }}
            className="text-xs text-muted-foreground hover:underline text-center py-2"
          >
            Message someone else
          </button>
        </div>
      </div>
    );
  }

  // Composing a message to a selected profile
  if (selectedProfile) {
    return (
      <div className="space-y-4">
        {/* Selected profile card */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-nocturn/20 text-nocturn font-bold text-sm">
              {((selectedProfile.display_name as string) ?? "?")[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">
                {selectedProfile.display_name as string}
              </p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className={`px-1.5 py-0.5 rounded-full text-[11px] font-medium ${TYPE_BADGE_COLORS[selectedProfile.user_type as string] ?? "bg-accent text-muted-foreground"}`}>
                  {TYPE_LABELS_SHORT[selectedProfile.user_type as string] ?? selectedProfile.user_type}
                </span>
                {selectedProfile.city ? <span>{String(selectedProfile.city)}</span> : null}
              </div>
            </div>
          </div>
        </div>

        {/* Message input */}
        <div className="space-y-2">
          <textarea
            placeholder={`Hey ${(selectedProfile.display_name as string)?.split(" ")[0] ?? ""}! Just set up my profile on Nocturn — let's connect.`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full rounded-xl border bg-card px-4 py-3 text-base md:text-sm leading-relaxed resize-none focus:border-nocturn focus:ring-1 focus:ring-nocturn min-h-[80px]"
            rows={3}
            autoFocus
          />
        </div>

        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setSelectedProfile(null);
              setMessage("");
            }}
            className="text-sm"
          >
            Back
          </Button>
          <Button
            onClick={handleSendMessage}
            disabled={sending || !message.trim()}
            className="flex-1 bg-nocturn hover:bg-nocturn-light"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Mode tabs */}
      <div className="flex gap-1 rounded-lg bg-accent p-1">
        <button
          onClick={() => setMode("search")}
          className={`flex-1 rounded-md py-2 text-xs font-medium transition-colors min-h-[44px] ${
            mode === "search"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Search className="inline h-3 w-3 mr-1" />
          Find someone
        </button>
        <button
          onClick={() => setMode("invite")}
          className={`flex-1 rounded-md py-2 text-xs font-medium transition-colors min-h-[44px] ${
            mode === "invite"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <UserPlus className="inline h-3 w-3 mr-1" />
          Invite someone
        </button>
      </div>

      {mode === "search" && (
        <div className="space-y-4">
          {/* Search input */}
          <div className="flex gap-2">
            <Input
              placeholder="Search by name..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="flex-1"
              autoFocus
            />
            <Button
              onClick={handleSearch}
              disabled={searching || !query.trim()}
              size="icon"
              aria-label="Search"
              className="bg-nocturn hover:bg-nocturn-light shrink-0"
            >
              {searching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Results */}
          {results.length > 0 && (
            <div className="space-y-2 max-h-[280px] overflow-y-auto">
              {results.map((profile) => (
                <button
                  key={profile.id as string}
                  onClick={() => setSelectedProfile(profile)}
                  className="w-full flex items-center gap-3 rounded-xl border border-border bg-card p-3 hover:border-nocturn/50 transition-colors text-left"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-nocturn/20 text-nocturn font-bold text-xs shrink-0">
                    {((profile.display_name as string) ?? "?")[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {profile.display_name as string}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className={`px-1.5 py-0.5 rounded-full text-[11px] font-medium ${TYPE_BADGE_COLORS[profile.user_type as string] ?? "bg-accent text-muted-foreground"}`}>
                        {TYPE_LABELS_SHORT[profile.user_type as string] ?? profile.user_type}
                      </span>
                      {profile.city ? <span>{String(profile.city)}</span> : null}
                    </div>
                  </div>
                  <MessageCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          )}

          {hasSearched && results.length === 0 && !searching && (
            <div className="text-center py-6">
              <p className="text-sm text-muted-foreground">
                No one found. Invite them instead?
              </p>
              <button
                onClick={() => setMode("invite")}
                className="text-sm text-nocturn hover:underline mt-2"
              >
                <UserPlus className="inline h-3 w-3 mr-1" />
                Send an invite
              </button>
            </div>
          )}
        </div>
      )}

      {mode === "invite" && (
        <div className="space-y-4">
          {/* Copy invite link */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Share your invite link</p>
            <div className="flex gap-2">
              <Input
                value={inviteLink}
                readOnly
                className="flex-1 text-base md:text-xs"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <Button
                onClick={handleCopyLink}
                size="icon"
                variant="outline"
                aria-label="Copy link"
                className="shrink-0"
              >
                {linkCopied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Email invite */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Email an invite</p>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="friend@email.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleInviteEmail()}
                className="flex-1"
              />
              <Button
                onClick={handleInviteEmail}
                disabled={!inviteEmail.trim() || inviteSent}
                size="icon"
                aria-label="Send invite"
                className="bg-nocturn hover:bg-nocturn-light shrink-0"
              >
                {inviteSent ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Mail className="h-4 w-4" />
                )}
              </Button>
            </div>
            {inviteSent && (
              <p className="text-xs text-green-500">Invite opened in your email app!</p>
            )}
          </div>
        </div>
      )}

      {/* Skip / Continue */}
      <div className="flex flex-col gap-2 pt-2">
        <Button
          onClick={onDone}
          className="w-full bg-nocturn hover:bg-nocturn-light py-5 text-base"
        >
          Go to Dashboard
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
        <button
          onClick={onSkip}
          className="text-xs text-muted-foreground hover:underline text-center py-2"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
