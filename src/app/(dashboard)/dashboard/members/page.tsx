"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { inviteMember, getTeamMembers, getPendingInvitations, cancelInvitation } from "@/app/actions/members";
import { searchCollectives, startCollabChat } from "@/app/actions/collab";
import { getReferralCode } from "@/app/actions/referral-program";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  UserPlus,
  MoreVertical,
  Shield,
  Users,
  Crown,
  Mail,
  X,
  Clock,
  Loader2,
  Handshake,
  Search,
  MessageSquare,
  Gift,
  Copy,
  Check,
  Share2,
} from "lucide-react";
import { useRouter } from "next/navigation";

type Role = "admin" | "promoter" | "talent_buyer" | "door_staff" | "member";
type Tab = "team" | "collabs" | "referral";

interface Member {
  id: string;
  user_id: string;
  role: Role;
  joined_at: string | null;
  user: {
    full_name: string;
    email: string;
    avatar_url: string | null;
  };
}

interface PendingInvite {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  expires_at: string;
  token: string;
}

interface CollectiveResult {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  city: string | null;
  description: string | null;
}

const roleLabels: Record<Role, string> = {
  admin: "Admin",
  promoter: "Promoter",
  talent_buyer: "Talent Buyer",
  door_staff: "Door Staff",
  member: "Member",
};

const roleIcons: Record<Role, typeof Shield> = {
  admin: Crown,
  promoter: Users,
  talent_buyer: Users,
  door_staff: Shield,
  member: Users,
};

export default function MembersPage() {
  const supabase = createClient();
  const router = useRouter();

  // Core state
  const [activeTab, setActiveTab] = useState<Tab>("team");
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [collectiveId, setCollectiveId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Team invite state
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("member");
  const [inviting, setInviting] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);

  // Collab state
  const [collabSearch, setCollabSearch] = useState("");
  const [collabResults, setCollabResults] = useState<CollectiveResult[]>([]);
  const [searchingCollabs, setSearchingCollabs] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);

  // Referral state
  const [cancellingInviteId, setCancellingInviteId] = useState<string | null>(null);
  const [changingRoleId, setChangingRoleId] = useState<string | null>(null);

  // Referral state
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Load members + pending invites via server action (bypasses RLS issues)
  const loadData = useCallback(async () => {
    try {
      const teamResult = await getTeamMembers();
      if (teamResult.error) {
        setLoadError(teamResult.error);
        return;
      }
      if (teamResult.userId) setCurrentUserId(teamResult.userId);
      if (teamResult.collectiveId) {
        setCollectiveId(teamResult.collectiveId);
        setMembers(
          teamResult.members.map((m) => ({
            id: m.id,
            user_id: m.user_id,
            role: m.role as Role,
            joined_at: m.joined_at,
            user: m.user as Member["user"],
          }))
        );

        // Load pending invites
        const invitesResult = await getPendingInvitations(teamResult.collectiveId);
        if (!invitesResult.error && invitesResult.data) {
          setPendingInvites(invitesResult.data as PendingInvite[]);
        }
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load members");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Load referral code when switching to referral tab
  useEffect(() => {
    if (activeTab === "referral" && collectiveId && !referralCode) {
      getReferralCode(collectiveId).then((result) => {
        if (!result.error && result.code) setReferralCode(result.code);
      });
    }
  }, [activeTab, collectiveId, referralCode]);

  // Auto-clear messages
  useEffect(() => {
    if (success || error) {
      const timer = setTimeout(() => { setSuccess(null); setError(null); }, 5000);
      return () => clearTimeout(timer);
    }
  }, [success, error]);

  // Handle team invite — uses the proper server action that supports non-Nocturn emails
  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!collectiveId) return;
    setError(null);
    setSuccess(null);
    setInviting(true);

    const result = await inviteMember(collectiveId, inviteEmail, inviteRole);

    if (result.error) {
      setError(result.error);
      setInviting(false);
      return;
    }

    if (result.status === "added") {
      setSuccess(`Added ${inviteEmail} as ${roleLabels[inviteRole]}`);
    } else {
      setSuccess(`Invitation sent to ${inviteEmail} — they have 7 days to accept`);
    }

    setInviteEmail("");
    setShowInvite(false);
    setInviting(false);
    loadData();
  }

  // Cancel a pending invite
  async function handleCancelInvite(inviteId: string) {
    setCancellingInviteId(inviteId);
    const result = await cancelInvitation(inviteId);
    if (result.error) {
      setError(result.error);
    } else {
      setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId));
      setSuccess("Invitation cancelled");
    }
    setCancellingInviteId(null);
  }

  // Role change
  async function handleRoleChange(memberId: string, newRole: Role) {
    setChangingRoleId(memberId);
    const { error } = await supabase
      .from("collective_members")
      .update({ role: newRole })
      .eq("id", memberId);

    if (error) {
      setError(error.message);
    } else {
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m))
      );
      setSuccess(`Role updated to ${roleLabels[newRole]}`);
    }
    setChangingRoleId(null);
  }

  // Remove member
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function handleRemove(memberId: string) {
    if (!confirm("Remove this member from the collective?")) return;
    const member = members.find((m) => m.id === memberId);
    if (member?.role === "admin") {
      const adminCount = members.filter((m) => m.role === "admin").length;
      if (adminCount <= 1) {
        setError("Can't remove the last admin. Promote another member first.");
        return;
      }
    }

    setRemovingId(memberId);
    const { error } = await supabase
      .from("collective_members")
      .delete()
      .eq("id", memberId);

    if (error) {
      setError(error.message);
      setRemovingId(null);
      return;
    }

    setMembers((prev) => prev.filter((m) => m.id !== memberId));
    setSuccess("Member removed from collective");
    setRemovingId(null);
  }

  // Search collectives
  async function handleCollabSearch(query: string) {
    setCollabSearch(query);
    if (!collectiveId || query.trim().length < 2) {
      setCollabResults([]);
      return;
    }
    setSearchingCollabs(true);
    const results = await searchCollectives(query, collectiveId);
    setCollabResults(results as CollectiveResult[]);
    setSearchingCollabs(false);
  }

  // Start collab chat with another collective
  async function handleConnect(partnerId: string) {
    if (!collectiveId) return;
    setConnectingId(partnerId);
    setError(null);

    const result = await startCollabChat(collectiveId, partnerId);
    if (result.error) {
      setError(result.error);
      setConnectingId(null);
      return;
    }

    if (result.channelId) {
      router.push(`/dashboard/chat/${result.channelId}`);
    }
    setConnectingId(null);
  }

  // Copy referral code
  function handleCopyCode() {
    if (!referralCode) return;
    const url = `https://app.trynocturn.com/signup?ref=${referralCode}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="space-y-2">
          <div className="h-7 w-28 rounded-lg bg-muted animate-pulse" />
          <div className="h-4 w-44 rounded-lg bg-muted animate-pulse" />
        </div>
        <div className="h-10 w-full rounded-lg bg-muted animate-pulse" />
        <Card className="rounded-2xl">
          <CardContent className="p-4 space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl">
                <div className="h-9 w-9 rounded-full bg-muted animate-pulse shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 w-32 rounded bg-muted animate-pulse" />
                  <div className="h-3 w-44 rounded bg-muted animate-pulse" />
                </div>
                <div className="h-6 w-16 rounded-full bg-muted animate-pulse" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center animate-in fade-in duration-300">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 mb-3">
          <Users className="h-7 w-7 text-destructive" />
        </div>
        <p className="text-sm font-medium">Something went wrong</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-[260px]">{loadError}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.location.reload()}
          className="mt-4 min-h-[44px] transition-all duration-200 active:scale-[0.97]"
        >
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 overflow-x-hidden animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold font-heading">Team & Network</h1>
          <p className="text-sm text-muted-foreground truncate">
            Manage your crew, connect with collectives, and grow your network
          </p>
        </div>
        {activeTab === "team" && (
          <Button
            className="bg-nocturn hover:bg-nocturn-light min-h-[44px] shrink-0 transition-all duration-200 active:scale-[0.97]"
            onClick={() => setShowInvite(!showInvite)}
          >
            <UserPlus className="mr-2 h-4 w-4" />
            Invite
          </Button>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {([
          { key: "team" as Tab, label: "Your Team", icon: Users },
          { key: "collabs" as Tab, label: "Collectives", icon: Handshake },
          { key: "referral" as Tab, label: "Referral", icon: Gift },
        ]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 min-h-[44px] text-sm font-medium transition-all duration-200 active:scale-[0.97] ${
              activeTab === key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            }`}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Alerts */}
      {error && (
        <div className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive flex items-center justify-between animate-in fade-in duration-200">
          {error}
          <button onClick={() => setError(null)} className="min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0 rounded-md hover:bg-destructive/10 transition-colors duration-200 active:scale-[0.95]"><X className="h-4 w-4" /></button>
        </div>
      )}
      {success && (
        <div className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-500 flex items-center justify-between animate-in fade-in duration-200">
          {success}
          <button onClick={() => setSuccess(null)} className="min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0 rounded-md hover:bg-emerald-500/10 transition-colors duration-200 active:scale-[0.95]"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* ==================== TEAM TAB ==================== */}
      {activeTab === "team" && (
        <>
          {/* Invite form */}
          {showInvite && (
            <Card className="border-nocturn/20 rounded-2xl animate-in fade-in slide-in-from-top-2 duration-300">
              <CardHeader>
                <CardTitle className="text-base font-bold">Invite a team member</CardTitle>
                <CardDescription>
                  Enter their email — if they&apos;re already on Nocturn they&apos;ll be added instantly. Otherwise they&apos;ll get an invite link.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleInvite} className="flex flex-col space-y-3 sm:space-y-0 sm:flex-row sm:gap-3 sm:items-end">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="inviteEmail">Email</Label>
                    <Input
                      id="inviteEmail"
                      type="email"
                      placeholder="teammate@email.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="w-40 space-y-2">
                    <Label htmlFor="inviteRole">Role</Label>
                    <select
                      id="inviteRole"
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as Role)}
                      className="flex h-11 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="member">Member</option>
                      <option value="promoter">Promoter</option>
                      <option value="talent_buyer">Talent Buyer</option>
                      <option value="door_staff">Door Staff</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <Button
                    type="submit"
                    className="bg-nocturn hover:bg-nocturn-light min-h-[44px] transition-all duration-200 active:scale-[0.97]"
                    disabled={inviting}
                  >
                    {inviting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending...</> : "Send Invite"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Pending invitations */}
          {pendingInvites.length > 0 && (
            <Card className="border-amber-500/20 rounded-2xl">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500" />
                  Pending Invitations ({pendingInvites.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {pendingInvites.map((invite) => {
                  const expiresAt = new Date(invite.expires_at);
                  const daysLeft = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 86400000));
                  return (
                    <div
                      key={invite.id}
                      className="flex items-center gap-3 rounded-xl p-3 bg-amber-500/5 transition-colors duration-200 hover:bg-amber-500/10"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/10">
                        <Mail className="h-4 w-4 text-amber-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{invite.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {roleLabels[invite.role as Role] ?? invite.role} · {daysLeft} day{daysLeft !== 1 ? "s" : ""} left
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive min-h-[44px] min-w-[44px] transition-colors duration-200 active:scale-[0.95]"
                        onClick={() => handleCancelInvite(invite.id)}
                        disabled={cancellingInviteId === invite.id}
                      >
                        {cancellingInviteId === invite.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                      </Button>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Members list */}
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base font-bold">
                Team ({members.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {members.length === 0 && (
                <div className="flex flex-col items-center py-8 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-nocturn/10 mb-3">
                    <Users className="h-7 w-7 text-nocturn" />
                  </div>
                  <p className="text-sm font-medium">No team members yet</p>
                  <p className="text-xs text-muted-foreground max-w-[260px] mt-1">
                    Invite your crew to manage events, handle the door, and run the night together.
                  </p>
                  <Button
                    className="mt-4 bg-nocturn hover:bg-nocturn-light min-h-[44px] transition-all duration-200 active:scale-[0.97]"
                    onClick={() => setShowInvite(true)}
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    Invite your first member
                  </Button>
                </div>
              )}
              {members.map((member) => {
                const initials = (member.user?.full_name ?? member.user?.email ?? "?")
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2);
                const RoleIcon = roleIcons[member.role];
                const isCurrentUser = member.user_id === currentUserId;

                return (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 rounded-xl p-3 transition-all duration-200 hover:bg-accent/50"
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="bg-nocturn/10 text-xs text-nocturn">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {member.user?.full_name ?? "Unknown"}
                        {isCurrentUser && (
                          <span className="ml-1 text-xs text-muted-foreground">(you)</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {member.user?.email}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 rounded-full bg-nocturn/10 px-2.5 py-1">
                      <RoleIcon className="h-3 w-3 text-nocturn" />
                      <span className="text-xs font-medium text-nocturn">
                        {roleLabels[member.role]}
                      </span>
                    </div>
                    {!isCurrentUser && (
                      <DropdownMenu>
                        <DropdownMenuTrigger className="flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-md hover:bg-accent transition-colors duration-200 active:scale-[0.95]" disabled={changingRoleId === member.id || removingId === member.id}>
                          {changingRoleId === member.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {(["admin", "promoter", "talent_buyer", "door_staff", "member"] as Role[])
                            .filter((r) => r !== member.role)
                            .map((role) => (
                              <DropdownMenuItem
                                key={role}
                                onClick={() => handleRoleChange(member.id, role)}
                                disabled={!!changingRoleId}
                              >
                                Make {roleLabels[role]}
                              </DropdownMenuItem>
                            ))}
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => handleRemove(member.id)}
                            disabled={removingId === member.id}
                          >
                            {removingId === member.id ? "Removing..." : "Remove from collective"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </>
      )}

      {/* ==================== COLLABS TAB ==================== */}
      {activeTab === "collabs" && (
        <>
          <Card className="border-nocturn/20 rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Handshake className="h-5 w-5 text-nocturn" />
                Connect with Collectives
              </CardTitle>
              <CardDescription>
                Search for other collectives on Nocturn to collaborate, co-host events, or just chat
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search collectives by name or city..."
                  className="pl-10"
                  value={collabSearch}
                  onChange={(e) => handleCollabSearch(e.target.value)}
                />
              </div>

              {searchingCollabs && (
                <div className="space-y-2 py-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-xl p-3 border border-border">
                      <div className="h-10 w-10 rounded-full bg-muted animate-pulse shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-4 w-28 rounded bg-muted animate-pulse" />
                        <div className="h-3 w-20 rounded bg-muted animate-pulse" />
                      </div>
                      <div className="h-9 w-16 rounded-md bg-muted animate-pulse" />
                    </div>
                  ))}
                </div>
              )}

              {!searchingCollabs && collabSearch.trim().length >= 2 && collabResults.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-6">
                  No collectives found matching &quot;{collabSearch}&quot;
                </p>
              )}

              {collabResults.length > 0 && (
                <div className="space-y-2">
                  {collabResults.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-3 rounded-xl p-3 border border-border hover:border-nocturn/30 transition-all duration-200 active:scale-[0.99]"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-nocturn/10 shrink-0">
                        {c.logo_url ? (
                          <img
                            src={c.logo_url}
                            alt={c.name}
                            className="h-10 w-10 rounded-full object-cover"
                          />
                        ) : (
                          <Users className="h-5 w-5 text-nocturn" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.name}</p>
                        {c.city && (
                          <p className="text-xs text-muted-foreground">{c.city}</p>
                        )}
                        {c.description && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {c.description}
                          </p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        className="bg-nocturn hover:bg-nocturn-light shrink-0 min-h-[44px] transition-all duration-200 active:scale-[0.97]"
                        onClick={() => handleConnect(c.id)}
                        disabled={connectingId === c.id}
                      >
                        <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                        {connectingId === c.id ? "..." : "Chat"}
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {collabSearch.trim().length < 2 && collabResults.length === 0 && (
                <div className="flex flex-col items-center py-8 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-nocturn/10 mb-3">
                    <Handshake className="h-7 w-7 text-nocturn" />
                  </div>
                  <p className="text-sm font-medium">Find your people</p>
                  <p className="text-xs text-muted-foreground max-w-[260px] mt-1">
                    Search for collectives in your city or beyond. Start a conversation and plan something together.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ==================== REFERRAL TAB ==================== */}
      {activeTab === "referral" && (
        <>
          <Card className="border-nocturn/20 rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Gift className="h-5 w-5 text-nocturn" />
                Referral Program
              </CardTitle>
              <CardDescription>
                Share your unique code to grow the Nocturn network. When new collectives or operators sign up with your code, you both benefit.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Referral code display */}
              <div className="rounded-xl bg-gradient-to-br from-nocturn/20 to-nocturn/5 p-6 text-center space-y-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                  Your Referral Code
                </p>
                {referralCode ? (
                  <>
                    <p className="text-3xl font-bold tracking-widest text-nocturn">
                      {referralCode}
                    </p>
                    <div className="flex items-center justify-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-nocturn/20 min-h-[44px] transition-all duration-200 active:scale-[0.97] hover:border-nocturn/40"
                        onClick={handleCopyCode}
                      >
                        {copied ? (
                          <>
                            <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-500" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="mr-1.5 h-3.5 w-3.5" />
                            Copy Link
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-nocturn/20 min-h-[44px] transition-all duration-200 active:scale-[0.97] hover:border-nocturn/40"
                        onClick={() => {
                          if (!referralCode) return;
                          const url = `https://app.trynocturn.com/signup?ref=${referralCode}`;
                          const text = `Join me on Nocturn — the platform for nightlife collectives and operators. Sign up here: ${url}`;
                          if (navigator.share) {
                            navigator.share({ title: "Join Nocturn", text, url });
                          } else {
                            navigator.clipboard.writeText(text);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          }
                        }}
                      >
                        <Share2 className="mr-1.5 h-3.5 w-3.5" />
                        Share
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      app.trynocturn.com/signup?ref={referralCode}
                    </p>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-2">
                    <div className="h-8 w-32 rounded-lg bg-nocturn/10 animate-pulse" />
                    <div className="h-4 w-48 rounded bg-muted animate-pulse" />
                  </div>
                )}
              </div>

              {/* How it works */}
              <div className="space-y-3">
                <h2 className="text-lg font-bold">How it works</h2>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    {
                      step: "1",
                      title: "Share your code",
                      desc: "Send your referral link to other operators, promoters, or collectives",
                    },
                    {
                      step: "2",
                      title: "They sign up",
                      desc: "When they create a Nocturn account using your link, you're connected",
                    },
                    {
                      step: "3",
                      title: "Grow together",
                      desc: "Build your network, co-host events, and collaborate across the platform",
                    },
                  ].map(({ step, title, desc }) => (
                    <div key={step} className="rounded-xl border border-border p-4 space-y-2 hover:border-nocturn/20 transition-colors duration-200">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-nocturn/10 text-sm font-bold text-nocturn">
                        {step}
                      </div>
                      <p className="text-sm font-medium">{title}</p>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
