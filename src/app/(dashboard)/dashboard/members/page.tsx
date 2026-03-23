"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
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
import { UserPlus, MoreVertical, Shield, Users, Crown } from "lucide-react";

type Role = "admin" | "promoter" | "talent_buyer" | "door_staff" | "member";

interface Member {
  id: string;
  user_id: string;
  role: Role;
  joined_at: string;
  user: {
    full_name: string;
    email: string;
    avatar_url: string | null;
  };
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
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("member");
  const [inviting, setInviting] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [collectiveId, setCollectiveId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);

      // Get first collective
      const { data: memberships } = await supabase
        .from("collective_members")
        .select("collective_id")
        .eq("user_id", user.id)
        .limit(1);

      if (!memberships || memberships.length === 0) return;
      const cId = memberships[0].collective_id;
      setCollectiveId(cId);

      // Get all members with user info
      const { data: memberData } = await supabase
        .from("collective_members")
        .select("id, user_id, role, joined_at, users(full_name, email, avatar_url)")
        .eq("collective_id", cId)
        .order("joined_at");

      if (memberData) {
        setMembers(
          memberData.map((m) => ({
            id: m.id,
            user_id: m.user_id,
            role: m.role as Role,
            joined_at: m.joined_at,
            user: m.users as unknown as Member["user"],
          }))
        );
      }
      setLoading(false);
    }
    load();
  }, [supabase]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setInviting(true);

    if (!collectiveId) return;

    // Check if user exists
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", inviteEmail)
      .maybeSingle();

    if (!existingUser) {
      setError(
        "This email isn't signed up on Nocturn yet. Ask them to create an account first, then add them here."
      );
      setInviting(false);
      return;
    }

    // Check if already a member
    const { data: existingMember } = await supabase
      .from("collective_members")
      .select("id")
      .eq("collective_id", collectiveId)
      .eq("user_id", existingUser.id)
      .maybeSingle();

    if (existingMember) {
      setError("This person is already a member of your collective.");
      setInviting(false);
      return;
    }

    // Add member
    const { error: insertError } = await supabase
      .from("collective_members")
      .insert({
        collective_id: collectiveId,
        user_id: existingUser.id,
        role: inviteRole,
      });

    if (insertError) {
      setError(insertError.message);
      setInviting(false);
      return;
    }

    setSuccess(`Added ${inviteEmail} as ${roleLabels[inviteRole]}`);
    setInviteEmail("");
    setShowInvite(false);
    setInviting(false);

    // Refresh members list
    const { data: memberData } = await supabase
      .from("collective_members")
      .select("id, user_id, role, joined_at, users(full_name, email, avatar_url)")
      .eq("collective_id", collectiveId)
      .order("joined_at");

    if (memberData) {
      setMembers(
        memberData.map((m) => ({
          id: m.id,
          user_id: m.user_id,
          role: m.role as Role,
          joined_at: m.joined_at,
          user: m.users as unknown as Member["user"],
        }))
      );
    }
  }

  async function handleRoleChange(memberId: string, newRole: Role) {
    const { error } = await supabase
      .from("collective_members")
      .update({ role: newRole })
      .eq("id", memberId);

    if (error) {
      setError(error.message);
      return;
    }

    setMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m))
    );
  }

  async function handleRemove(memberId: string) {
    // Prevent removing the last admin
    const member = members.find((m) => m.id === memberId);
    if (member?.role === "admin") {
      const adminCount = members.filter((m) => m.role === "admin").length;
      if (adminCount <= 1) {
        setError("Can't remove the last admin. Promote another member first.");
        return;
      }
    }

    const { error } = await supabase
      .from("collective_members")
      .delete()
      .eq("id", memberId);

    if (error) {
      setError(error.message);
      return;
    }

    setMembers((prev) => prev.filter((m) => m.id !== memberId));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-nocturn border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Members</h1>
          <p className="text-sm text-muted-foreground">
            Manage your collective&apos;s team
          </p>
        </div>
        <Button
          className="bg-nocturn hover:bg-nocturn-light"
          onClick={() => setShowInvite(!showInvite)}
        >
          <UserPlus className="mr-2 h-4 w-4" />
          Add Member
        </Button>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-500">
          {success}
        </div>
      )}

      {/* Invite form */}
      {showInvite && (
        <Card className="border-nocturn/20">
          <CardHeader>
            <CardTitle className="text-base">Add a team member</CardTitle>
            <CardDescription>
              They must have a Nocturn account first
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleInvite} className="flex flex-col gap-3 sm:flex-row sm:items-end">
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
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                className="bg-nocturn hover:bg-nocturn-light"
                disabled={inviting}
              >
                {inviting ? "Adding..." : "Add"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Members list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Team ({members.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
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
                className="flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-accent/50"
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
                    <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent">
                      <MoreVertical className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {(["admin", "promoter", "talent_buyer", "door_staff", "member"] as Role[])
                        .filter((r) => r !== member.role)
                        .map((role) => (
                          <DropdownMenuItem
                            key={role}
                            onClick={() => handleRoleChange(member.id, role)}
                          >
                            Make {roleLabels[role]}
                          </DropdownMenuItem>
                        ))}
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => handleRemove(member.id)}
                      >
                        Remove from collective
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
