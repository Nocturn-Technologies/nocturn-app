"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mail, Search, UserPlus, Users, Check } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  searchInvitableUsers,
  addChannelMember,
} from "@/app/actions/chat-members";
import type { InvitableUser } from "@/app/actions/chat-members";
import { inviteMember } from "@/app/actions/members";

interface InviteMemberModalProps {
  channelId: string;
  collectiveId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onMemberAdded: () => void;
}

const SOURCE_LABELS: Record<InvitableUser["source"], string> = {
  team: "Team",
  artist: "Lineup",
  collaborator: "Collaborator",
  platform_artist: "Artist",
  platform_collective: "Collective",
};

const SOURCE_COLORS: Record<InvitableUser["source"], string> = {
  team: "bg-nocturn/20 text-nocturn-light",
  artist: "bg-amber-500/20 text-amber-400",
  collaborator: "bg-emerald-500/20 text-emerald-400",
  platform_artist: "bg-amber-500/20 text-amber-400",
  platform_collective: "bg-cyan-500/20 text-cyan-400",
};

function getInitials(name: string | null, email: string | null): string {
  if (name) {
    return name
      .split(" ")
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase();
  }
  if (email) return email[0].toUpperCase();
  return "?";
}

export function InviteMemberModal({
  channelId,
  collectiveId,
  isOpen,
  onClose,
  onMemberAdded,
}: InviteMemberModalProps) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<InvitableUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());
  const [hasSearched, setHasSearched] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteState, setInviteState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [inviteError, setInviteError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Search users with debounce
  const search = useCallback(
    (q: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);

      debounceRef.current = setTimeout(async () => {
        setIsSearching(true);
        try {
          const results = await searchInvitableUsers(channelId, q);
          setUsers(results);
          setHasSearched(true);
        } finally {
          setIsSearching(false);
        }
      }, 300);
    },
    [channelId]
  );

  // Load initial list when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setUsers([]);
      setAddingIds(new Set());
      setHasSearched(false);
      setInviteEmail("");
      setInviteState("idle");
      setInviteError(null);
      search("");
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [isOpen, search]);

  function handleQueryChange(value: string) {
    setQuery(value);
    search(value);
  }

  async function handleAdd(userId: string) {
    setAddingIds((prev) => new Set(prev).add(userId));

    const { error } = await addChannelMember(channelId, userId, "member");

    if (!error) {
      // Remove user from results on success
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      onMemberAdded();
    }

    setAddingIds((prev) => {
      const next = new Set(prev);
      next.delete(userId);
      return next;
    });
  }

  const isEmpty = hasSearched && users.length === 0 && !isSearching;

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(inviteEmail.trim());

  async function handleInviteByEmail() {
    if (!collectiveId || !isValidEmail) return;
    setInviteState("sending");
    setInviteError(null);

    const result = await inviteMember(collectiveId, inviteEmail.trim(), "member");

    if (result?.error) {
      setInviteState("error");
      setInviteError(result.error);
    } else {
      setInviteState("sent");
      setInviteEmail("");
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        className="bg-card md:inset-y-0 md:right-0 md:left-auto md:w-[420px] md:max-w-[420px] md:rounded-none md:border-l md:border-t-0 h-[85dvh] md:h-full rounded-t-2xl md:rounded-t-none"
      >
        <SheetHeader className="px-4 pt-4 pb-2">
          <SheetTitle className="flex items-center gap-2 text-foreground">
            <Users className="h-5 w-5 text-nocturn" />
            Add Members
          </SheetTitle>
          <SheetDescription className="text-muted-foreground">
            Search your team, artists, and collectives — or invite by email
          </SheetDescription>
        </SheetHeader>

        {/* Search input */}
        <div className="px-4 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              className="w-full bg-accent text-foreground placeholder:text-muted-foreground rounded-xl py-2.5 pl-10 pr-4 text-sm outline-none ring-1 ring-transparent focus:ring-nocturn/50 transition-shadow min-h-[44px]"
              autoFocus
            />
            {isSearching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
            )}
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {users.map((user) => {
            const isAdding = addingIds.has(user.id);
            return (
              <div
                key={user.id}
                className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.04] transition-colors min-h-[48px]"
              >
                {/* Avatar / Initials */}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-nocturn/20 text-nocturn-light text-xs font-semibold">
                  {getInitials(user.name, user.email)}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">
                      {user.name ?? "Unnamed"}
                    </span>
                    {user.role && (
                      <span className="text-[10px] text-muted-foreground capitalize shrink-0">
                        {user.role}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {user.email && (
                      <span className="text-xs text-muted-foreground truncate">
                        {user.email}
                      </span>
                    )}
                    <span
                      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium shrink-0 ${SOURCE_COLORS[user.source]}`}
                    >
                      {SOURCE_LABELS[user.source]}
                    </span>
                  </div>
                </div>

                {/* Add button */}
                <button
                  onClick={() => handleAdd(user.id)}
                  disabled={isAdding}
                  className="bg-nocturn hover:bg-nocturn-light text-white rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
                >
                  {isAdding ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Add"
                  )}
                </button>
              </div>
            );
          })}

          {/* Empty state + invite by email */}
          {isEmpty && (
            <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
              <UserPlus className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                {query.trim()
                  ? "No users found matching your search"
                  : "All team members are already in this chat"}
              </p>
            </div>
          )}

          {/* Invite by email — always visible at the bottom */}
          {collectiveId && (
            <div className="mt-4 border-t border-border pt-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Invite by email
              </p>
              <p className="text-xs text-muted-foreground mb-3">
                Send an invite to join your collective. They&apos;ll be added to this chat once they accept.
              </p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="email"
                    placeholder="name@email.com"
                    value={inviteEmail}
                    onChange={(e) => {
                      setInviteEmail(e.target.value);
                      if (inviteState !== "idle") {
                        setInviteState("idle");
                        setInviteError(null);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && isValidEmail) handleInviteByEmail();
                    }}
                    className="w-full bg-accent text-foreground placeholder:text-muted-foreground rounded-xl py-2.5 pl-10 pr-4 text-sm outline-none ring-1 ring-transparent focus:ring-nocturn/50 transition-shadow min-h-[44px]"
                    maxLength={254}
                  />
                </div>
                <button
                  onClick={handleInviteByEmail}
                  disabled={!isValidEmail || inviteState === "sending"}
                  className="bg-nocturn hover:bg-nocturn-light text-white rounded-xl px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 min-h-[44px] flex items-center gap-2 shrink-0"
                >
                  {inviteState === "sending" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : inviteState === "sent" ? (
                    <>
                      <Check className="h-4 w-4" />
                      Sent
                    </>
                  ) : (
                    "Invite"
                  )}
                </button>
              </div>
              {inviteState === "sent" && (
                <p className="text-xs text-emerald-400 mt-2">
                  Invitation sent! They&apos;ll appear here once they accept.
                </p>
              )}
              {inviteState === "error" && inviteError && (
                <p className="text-xs text-red-400 mt-2">{inviteError}</p>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
