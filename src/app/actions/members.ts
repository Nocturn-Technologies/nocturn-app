"use server";

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function inviteMember(
  collectiveId: string,
  email: string,
  role: string = "member"
) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in." };
  }

  const admin = createAdminClient();

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
      return { error: insertError.message };
    }

    return { error: null, status: "added" as const };
  }

  // User doesn't exist — create a pending invitation
  const { data: existingInvite } = await admin
    .from("invitations")
    .select("id, status")
    .eq("collective_id", collectiveId)
    .eq("email", email.toLowerCase().trim())
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
      return { error: updateError.message };
    }

    return { error: null, status: "invited" as const };
  }

  const { error: inviteError } = await admin.from("invitations").insert({
    collective_id: collectiveId,
    email: email.toLowerCase().trim(),
    role,
    invited_by: user.id,
  });

  if (inviteError) {
    return { error: inviteError.message };
  }

  return { error: null, status: "invited" as const };
}

export async function getPendingInvitations(collectiveId: string) {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("invitations")
    .select("id, email, role, status, created_at, expires_at, token")
    .eq("collective_id", collectiveId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    return { error: error.message, data: null };
  }

  return { error: null, data };
}

export async function cancelInvitation(invitationId: string) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in." };
  }

  const admin = createAdminClient();

  const { error } = await admin
    .from("invitations")
    .delete()
    .eq("id", invitationId);

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}

export async function acceptInvitation(token: string) {
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
  if (new Date(invitation.expires_at) < new Date()) {
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
      email: user.email!,
      full_name:
        user.user_metadata?.full_name ?? user.email!.split("@")[0],
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
    return { error: memberError.message };
  }

  // Mark invitation as accepted
  await admin
    .from("invitations")
    .update({ status: "accepted" })
    .eq("id", invitation.id);

  return { error: null, alreadyMember: false };
}
