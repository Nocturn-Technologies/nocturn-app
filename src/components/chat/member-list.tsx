"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Users,
  UserPlus,
  MoreHorizontal,
  X,
  User,
  UserMinus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { ChatMember } from "@/app/actions/chat-members";
import {
  getChannelMembers,
  removeChannelMember,
  updatePresence,
} from "@/app/actions/chat-members";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ChatMemberListProps {
  channelId: string;
  channelType: "general" | "event" | "collab";
  isOpen: boolean;
  onToggle: () => void;
  onInvite: () => void;
  currentUserId: string | null;
  isAdmin: boolean;
  onMemberCountChange?: (count: number) => void;
}

// ---------------------------------------------------------------------------
// Avatar colors (deterministic by user ID)
// ---------------------------------------------------------------------------

const AVATAR_COLORS = [
  "bg-purple-500",
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-indigo-500",
  "bg-orange-500",
  "bg-teal-500",
  "bg-fuchsia-500",
];

function getAvatarColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash << 5) - hash + userId.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return (
    (parts[0][0]?.toUpperCase() ?? "") + (parts[parts.length - 1][0]?.toUpperCase() ?? "")
  );
}

// ---------------------------------------------------------------------------
// Role Badge
// ---------------------------------------------------------------------------

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-purple-500/15 text-purple-400",
  owner: "bg-purple-500/15 text-purple-400",
  manager: "bg-blue-500/15 text-blue-400",
  promoter: "bg-blue-500/15 text-blue-400",
  talent_buyer: "bg-cyan-500/15 text-cyan-400",
  door_staff: "bg-orange-500/15 text-orange-400",
  member: "bg-zinc-500/15 text-zinc-400",
  artist: "bg-amber-500/15 text-amber-400",
  collaborator: "bg-emerald-500/15 text-emerald-400",
};

function RoleBadge({ role }: { role: string }) {
  const colorClasses = ROLE_COLORS[role] ?? ROLE_COLORS.member;
  const label = role.replace(/_/g, " ");

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize leading-none ${colorClasses}`}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Member Row
// ---------------------------------------------------------------------------

function MemberRow({
  member,
  currentUserId,
  isAdmin,
  onRemove,
}: {
  member: ChatMember;
  currentUserId: string | null;
  isAdmin: boolean;
  onRemove: (userId: string) => void;
}) {
  const isCurrentUser = member.user_id === currentUserId;
  const canRemove = isAdmin && !isCurrentUser;

  return (
    <div className="group flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-muted/50">
      {/* Avatar */}
      <div className="relative shrink-0">
        {member.avatar_url ? (
          <img
            src={member.avatar_url}
            alt={member.user_name ?? "Member"}
            className="h-9 w-9 rounded-full object-cover"
          />
        ) : (
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-white ${getAvatarColor(member.user_id)}`}
          >
            {getInitials(member.user_name)}
          </div>
        )}
        {/* Online dot */}
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${
            member.is_online ? "bg-emerald-500" : "bg-zinc-600"
          }`}
        />
      </div>

      {/* Name + Role */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-foreground">
            {member.user_name ?? "Unknown"}
            {isCurrentUser && (
              <span className="ml-1 text-muted-foreground">(you)</span>
            )}
          </span>
        </div>
        <div className="mt-0.5">
          <RoleBadge role={member.role} />
        </div>
      </div>

      {/* Actions dropdown */}
      {(canRemove || !isCurrentUser) && (
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100 focus:opacity-100"
          >
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="left" align="start" sideOffset={8}>
            <DropdownMenuItem
              className="flex items-center gap-2 text-sm"
              onSelect={() => {
                // View profile — navigate or open modal
                // For now this is a no-op placeholder
              }}
            >
              <User className="h-4 w-4" />
              View profile
            </DropdownMenuItem>
            {canRemove && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="flex items-center gap-2 text-sm text-red-400 focus:text-red-400"
                  onSelect={() => onRemove(member.user_id)}
                >
                  <UserMinus className="h-4 w-4" />
                  Remove from chat
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Member List Content (shared between desktop sidebar and mobile sheet)
// ---------------------------------------------------------------------------

function MemberListContent({
  members,
  currentUserId,
  isAdmin,
  onInvite,
  onRemove,
  onClose,
}: {
  members: ChatMember[];
  currentUserId: string | null;
  isAdmin: boolean;
  onInvite: () => void;
  onRemove: (userId: string) => void;
  onClose: () => void;
}) {
  const onlineMembers = members.filter((m) => m.is_online);
  const offlineMembers = members.filter((m) => !m.is_online);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">
            Members
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {members.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {isAdmin && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onInvite}
              className="text-muted-foreground hover:text-foreground"
            >
              <UserPlus className="h-4 w-4" />
              <span className="sr-only">Invite member</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground md:flex hidden"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Button>
        </div>
      </div>

      {/* Scrollable member list */}
      <div className="flex-1 overflow-y-auto px-1 py-2">
        {/* Online section */}
        {onlineMembers.length > 0 && (
          <div className="mb-2">
            <div className="flex items-center gap-2 px-3 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Online &mdash; {onlineMembers.length}
              </span>
            </div>
            {onlineMembers.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
                onRemove={onRemove}
              />
            ))}
          </div>
        )}

        {/* Offline section */}
        {offlineMembers.length > 0 && (
          <div>
            <div className="flex items-center gap-2 px-3 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Offline &mdash; {offlineMembers.length}
              </span>
            </div>
            {offlineMembers.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
                onRemove={onRemove}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {members.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No members yet</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ChatMemberList({
  channelId,
  channelType,
  isOpen,
  onToggle,
  onInvite,
  currentUserId,
  isAdmin,
  onMemberCountChange,
}: ChatMemberListProps) {
  const supabase = useMemo(() => createClient(), []);
  const [members, setMembers] = useState<ChatMember[]>([]);
  const [loading, setLoading] = useState(true);
  const presenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const subscriptionRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const onMemberCountChangeRef = useRef(onMemberCountChange);
  onMemberCountChangeRef.current = onMemberCountChange;

  // ── Fetch members ──
  const fetchMembers = useCallback(async () => {
    const data = await getChannelMembers(channelId);
    setMembers(data);
    onMemberCountChangeRef.current?.(data.length);
    setLoading(false);
  }, [channelId]);

  // ── Remove member ──
  const handleRemove = useCallback(
    async (userId: string) => {
      if (!confirm("Remove this member from the chat?")) return;
      const { error } = await removeChannelMember(channelId, userId);
      if (error) {
        console.error("[ChatMemberList] remove error:", error);
        return;
      }
      // Optimistic removal
      setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    },
    [channelId]
  );

  // ── Initial fetch + Realtime subscription ──
  useEffect(() => {
    fetchMembers();

    // Subscribe to channel_members changes
    const channel = supabase
      .channel(`channel_members:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "channel_members",
          filter: `channel_id=eq.${channelId}`,
        },
        () => {
          // Re-fetch the full list on any change
          fetchMembers();
        }
      )
      .subscribe();

    subscriptionRef.current = channel;

    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
    };
  }, [channelId, fetchMembers, supabase]);

  // ── Presence heartbeat ──
  useEffect(() => {
    // Mark online on mount
    updatePresence(channelId, true);

    // Heartbeat every 30 seconds
    presenceIntervalRef.current = setInterval(() => {
      updatePresence(channelId, true);
    }, 30_000);

    return () => {
      // Mark offline on unmount
      updatePresence(channelId, false);
      if (presenceIntervalRef.current) {
        clearInterval(presenceIntervalRef.current);
        presenceIntervalRef.current = null;
      }
    };
  }, [channelId]);

  // ── Desktop sidebar (md+) ──
  const desktopSidebar = (
    <div
      className={`hidden md:flex flex-col border-l border-border bg-card transition-all duration-300 overflow-hidden ${
        isOpen ? "w-[280px] min-w-[280px]" : "w-0 min-w-0"
      }`}
    >
      {isOpen && (
        <MemberListContent
          members={members}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          onInvite={onInvite}
          onRemove={handleRemove}
          onClose={onToggle}
        />
      )}
    </div>
  );

  // ── Mobile bottom sheet (<md) ──
  const mobileSheet = (
    <div className="md:hidden">
      <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onToggle(); }}>
        <SheetContent side="bottom" showCloseButton className="h-[70vh] rounded-t-2xl bg-card p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Channel Members</SheetTitle>
          </SheetHeader>
          {/* Drag handle */}
          <div className="flex justify-center py-2">
            <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
          </div>
          <MemberListContent
            members={members}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            onInvite={onInvite}
            onRemove={handleRemove}
            onClose={onToggle}
          />
        </SheetContent>
      </Sheet>
    </div>
  );

  return (
    <>
      {desktopSidebar}
      {mobileSheet}
    </>
  );
}

export { RoleBadge };
