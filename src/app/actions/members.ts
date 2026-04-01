"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { sendEmail } from "@/lib/email/send";
import { invitationEmail } from "@/lib/email/templates";

async function sendInvitationEmail(
  collectiveId: string,
  email: string,
  role: string,
  inviterUserId: string
) {
  try {
    const admin = createAdminClient();
    const [{ data: collective }, { data: inviter }, { data: invitation }] = await Promise.all([
      admin.from("collectives").select("name").eq("id", collectiveId).maybeSingle(),
      admin.from("users").select("full_name").eq("id", inviterUserId).maybeSingle(),
      admin.from("invitations").select("token").eq("collective_id", collectiveId).eq("email", email.toLowerCase().trim()).eq("status", "pending").eq("type", "member").maybeSingle(),
    ]);

    if (!invitation?.token) return;

    const inviteLink = `${process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com"}/invite/${invitation.token}`;
    const inviterName = inviter?.full_name || "Someone";
    const collectiveName = collective?.name || "a collective";

    await sendEmail({
      to: email,
      subject: `${inviterName} invited you to ${collectiveName} on Nocturn`,
      html: invitationEmail(inviterName, collectiveName, role, inviteLink),
    });
  } catch (err) {
    console.error("[members] Failed to send invitation email:", err);
  }
}

export async function inviteMember(
  collectiveId: string,
  email: string,
  role: string = "member"
) {
  try {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in." };
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return { error: "Please enter a valid email address." };
  }

  const admin = createAdminClient();

  // Verify caller is a member of this collective
  const { count: callerMemberCount } = await admin
    .from("collective_members")
    .select("*", { count: "exact", head: true })
    .eq("collective_id", collectiveId)
    .eq("user_id", user.id)
    .is("deleted_at", null);

  if (!callerMemberCount || callerMemberCount === 0) {
    return { error: "You don't have permission to invite members to this collective." };
  }

  // Check if user already exists in the users table
  const { data: existingUser } = await admin
    .from("users")
    .select("id")
    .eq("email", email.toLowerCase().trim())
    .maybeSingle();

  if (existingUser) {
    // User exists — check if already a member
    const { data: existingMember } = await admin
      .from("collective_members")
      .select("id")
      .eq("collective_id", collectiveId)
      .eq("user_id", existingUser.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (existingMember) {
      return { error: "This person is already a member of your collective." };
    }

    // Add directly as a member
    const { error: insertError } = await admin
      .from("collective_members")
      .insert({
        collective_id: collectiveId,
        user_id: existingUser.id,
        role,
      });

    if (insertError) {
      console.error("[inviteMember] insert error:", insertError.message);
      return { error: "Failed to add member" };
    }

    return { error: null, status: "added" as const };
  }

  // User doesn't exist — create a pending invitation
  // Filter by type='member' since the unique constraint includes type
  const { data: existingInvite } = await admin
    .from("invitations")
    .select("id, status")
    .eq("collective_id", collectiveId)
    .eq("email", email.toLowerCase().trim())
    .eq("type", "member")
    .maybeSingle();

  if (existingInvite) {
    if (existingInvite.status === "pending") {
      return { error: "An invitation has already been sent to this email." };
    }
    // If expired or accepted, allow re-invite by updating
    const { error: updateError } = await admin
      .from("invitations")
      .update({
        role,
        status: "pending",
        invited_by: user.id,
        created_at: new Date().toISOString(),
        expires_at: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000
        ).toISOString(),
      })
      .eq("id", existingInvite.id);

    if (updateError) {
      console.error("[inviteMember] update error:", updateError.message);
      return { error: "Failed to send invitation" };
    }

    // Send invitation email (non-blocking)
    sendInvitationEmail(collectiveId, email.toLowerCase().trim(), role, user.id);

    return { error: null, status: "invited" as const };
  }

  const { error: inviteError } = await admin.from("invitations").insert({
    collective_id: collectiveId,
    email: email.toLowerCase().trim(),
    role,
    invited_by: user.id,
  });

  if (inviteError) {
    console.error("[inviteMember] invite error:", inviteError.message);
    return { error: "Failed to send invitation" };
  }

  // Send invitation email (non-blocking)
  sendInvitationEmail(collectiveId, email.toLowerCase().trim(), role, user.id);

  return { error: null, status: "invited" as const };
  } catch (err) {
    console.error("[inviteMember] Unexpected error:", err);
    return { error: "Something went wrong" };
  }
}

export async function getTeamMembers() {
  try {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return { error: "Not authenticated", userId: null, collectiveId: null, members: [] };

  const admin = createAdminClient();

  // Get user's collective
  const { data: memberships } = await admin
    .from("collective_members")
    .select("collective_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .limit(1);

  if (!memberships || memberships.length === 0)
    return { error: null, userId: user.id, collectiveId: null, members: [] };

  const collectiveId = memberships[0].collective_id;

  // Load members with user info via admin client (bypasses RLS)
  const { data: memberRows, error } = await admin
    .from("collective_members")
    .select("id, user_id, role, joined_at")
    .eq("collective_id", collectiveId)
    .is("deleted_at", null)
    .order("joined_at");

  if (error) {
    console.error("[getTeamMembers] members query error:", error.message);
    return { error: "Failed to load team members", userId: user.id, collectiveId, members: [] };
  }

  // Fetch user details separately via admin client
  const userIds = (memberRows ?? []).map((m) => m.user_id);
  const { data: users } = userIds.length > 0
    ? await admin
        .from("users")
        .select("id, full_name, email, avatar_url")
        .in("id", userIds)
    : { data: [] };

  const userMap = new Map(
    (users ?? []).map((u) => [u.id, u])
  );

  const members = (memberRows ?? []).map((m) => ({
    id: m.id,
    user_id: m.user_id,
    role: m.role,
    joined_at: m.joined_at,
    user: userMap.get(m.user_id) ?? {
      full_name: "Unknown",
      email: "",
      avatar_url: null,
    },
  }));

  return {
    error: null,
    userId: user.id,
    collectiveId,
    members,
  };
  } catch (err) {
    console.error("[getTeamMembers] Unexpected error:", err);
    return { error: "Something went wrong", userId: null, collectiveId: null, members: [] };
  }
}

export async function getPendingInvitations(collectiveId: string) {
  try {
  // Auth check: only collective members can view invitations
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", data: null };

  const admin = createAdminClient();

  // Verify user belongs to this collective
  const { count } = await admin
    .from("collective_members")
    .select("*", { count: "exact", head: true })
    .eq("collective_id", collectiveId)
    .eq("user_id", user.id)
    .is("deleted_at", null);

  if (!count || count === 0) return { error: "Access denied", data: null };

  const { data, error } = await admin
    .from("invitations")
    .select("id, email, role, status, created_at, expires_at")
    .eq("collective_id", collectiveId)
    .eq("status", "pending")
    .eq("type", "member")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getPendingInvitations] query error:", error.message);
    return { error: "Failed to load invitations", data: null };
  }

  return { error: null, data };
  } catch (err) {
    console.error("[getPendingInvitations] Unexpected error:", err);
    return { error: "Something went wrong", data: null };
  }
}

export async function cancelInvitation(invitationId: string) {
  try {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in." };
  }

  const admin = createAdminClient();

  // Verify user owns the invitation's collective
  const { data: invitation } = await admin
    .from("invitations")
    .select("collective_id")
    .eq("id", invitationId)
    .maybeSingle();

  if (!invitation) return { error: "Invitation not found." };

  const { count } = await admin
    .from("collective_members")
    .select("*", { count: "exact", head: true })
    .eq("collective_id", invitation.collective_id)
    .eq("user_id", user.id)
    .is("deleted_at", null);

  if (!count || count === 0) return { error: "You don't have permission." };

  const { error } = await admin
    .from("invitations")
    .delete()
    .eq("id", invitationId);

  if (error) {
    console.error("[cancelInvitation] delete error:", error.message);
    return { error: "Failed to cancel invitation" };
  }

  return { error: null };
  } catch (err) {
    console.error("[cancelInvitation] Unexpected error:", err);
    return { error: "Something went wrong" };
  }
}

export async function acceptInvitation(token: string) {
  try {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in to accept an invitation." };
  }

  const admin = createAdminClient();

  // Look up the invitation by token
  const { data: invitation, error: lookupError } = await admin
    .from("invitations")
    .select("*")
    .eq("token", token)
    .eq("status", "pending")
    .maybeSingle();

  if (lookupError || !invitation) {
    return { error: "Invitation not found or has already been used." };
  }

  // Check if expired
  if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
    await admin
      .from("invitations")
      .update({ status: "expired" })
      .eq("id", invitation.id);
    return { error: "This invitation has expired." };
  }

  // Check email matches
  if (user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
    return {
      error: `This invitation was sent to ${invitation.email}. Please log in with that email address.`,
    };
  }

  // Check if already a member
  const { data: existingMember } = await admin
    .from("collective_members")
    .select("id")
    .eq("collective_id", invitation.collective_id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (existingMember) {
    // Mark invitation as accepted anyway
    await admin
      .from("invitations")
      .update({ status: "accepted" })
      .eq("id", invitation.id);
    return { error: null, alreadyMember: true };
  }

  // Ensure user record exists in users table
  const { data: existingUserRecord } = await admin
    .from("users")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!existingUserRecord) {
    await admin.from("users").insert({
      id: user.id,
      email: user.email ?? "",
      full_name:
        user.user_metadata?.full_name ?? (user.email ? user.email.split("@")[0] : "User"),
    });
  }

  // Create collective member record
  const { error: memberError } = await admin
    .from("collective_members")
    .insert({
      collective_id: invitation.collective_id,
      user_id: user.id,
      role: invitation.role,
    });

  if (memberError) {
    console.error("[acceptInvitation] member insert error:", memberError.message);
    return { error: "Failed to join collective" };
  }

  // Mark invitation as accepted
  await admin
    .from("invitations")
    .update({ status: "accepted" })
    .eq("id", invitation.id);

  return { error: null, alreadyMember: false };
  } catch (err) {
    console.error("[acceptInvitation] Unexpected error:", err);
    return { error: "Something went wrong" };
  }
}
