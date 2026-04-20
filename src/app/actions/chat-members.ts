"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { revalidatePath } from "next/cache";
import { sanitizePostgRESTInput } from "@/lib/utils";
import type { SupabaseClient } from "@supabase/supabase-js";

// channel_members columns role/last_seen_at/is_online exist in the database
// but are not yet reflected in the generated types.
// Note: channels.event_id was dropped in the schema rebuild.
function untypedFrom(sb: ReturnType<typeof createAdminClient>, table: string) {
  return (sb as unknown as SupabaseClient).from(table);
}

// Types
export interface ChatMember {
  id: string;
  channel_id: string;
  user_id: string;
  role: string;
  joined_at: string;
  last_seen_at: string | null;
  is_online: boolean;
  user_name: string | null;
  user_email: string | null;
  avatar_url: string | null;
}

export interface InvitableUser {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  source: "team" | "artist" | "collaborator" | "platform_artist" | "platform_collective";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getAuthenticatedUser() {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch (err) {
    console.error("[getAuthenticatedUser] Unexpected error:", err);
    return null;
  }
}

async function verifyCollectiveMembership(
  sb: ReturnType<typeof createAdminClient>,
  userId: string,
  collectiveId: string
) {
  try {
    const { data, error } = await sb
      .from("collective_members")
      .select("role")
      .eq("user_id", userId)
      .eq("collective_id", collectiveId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      console.error("[verifyCollectiveMembership] query error:", error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.error("[verifyCollectiveMembership] Unexpected error:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 1. getChannelMembers
// ---------------------------------------------------------------------------

/**
 * Returns all members for a channel with user details (name, email, avatar).
 * Sorted: online users first, then alphabetically by name.
 */
export async function getChannelMembers(
  channelId: string
): Promise<ChatMember[]> {
  try {
    if (!channelId?.trim()) return [];

    const user = await getAuthenticatedUser();
    if (!user) return [];

    const sb = createAdminClient();

    // Get channel to find its collective_id
    const { data: channel } = await sb
      .from("channels")
      .select("collective_id")
      .eq("id", channelId)
      .maybeSingle();

    if (!channel || !channel.collective_id) return [];

    // Verify caller is a member of the channel's collective
    const membership = await verifyCollectiveMembership(
      sb,
      user.id,
      channel.collective_id
    );
    if (!membership) return [];

    // Fetch channel members joined with users table.
    // role/last_seen_at/is_online exist in DB but not in generated types — cast.
    const { data: members, error: membersError } = await untypedFrom(sb, "channel_members")
      .select(
        "id, channel_id, user_id, role, joined_at, last_seen_at, is_online, users!inner(full_name, email, avatar_url)"
      )
      .eq("channel_id", channelId) as {
        data: Array<{
          id: string;
          channel_id: string;
          user_id: string;
          role: string | null;
          joined_at: string;
          last_seen_at: string | null;
          is_online: boolean | null;
          users: { full_name: string | null; email: string | null; avatar_url: string | null };
        }> | null;
        error: { message: string } | null;
      };

    if (membersError) {
      console.error("[getChannelMembers] query error:", membersError.message);
      return [];
    }

    if (!members || members.length === 0) return [];

    const mapped: ChatMember[] = members.map((m) => {
      const u = m.users as { full_name: string | null; email: string | null; avatar_url: string | null };
      return {
        id: m.id,
        channel_id: m.channel_id,
        user_id: m.user_id,
        role: m.role ?? "member",
        joined_at: m.joined_at,
        last_seen_at: m.last_seen_at,
        is_online: m.is_online ?? false,
        user_name: u?.full_name ?? null,
        user_email: u?.email ?? null,
        avatar_url: u?.avatar_url ?? null,
      };
    });

    // Sort: online first, then by name
    mapped.sort((a, b) => {
      if (a.is_online !== b.is_online) return a.is_online ? -1 : 1;
      return (a.user_name ?? "").localeCompare(b.user_name ?? "");
    });

    return mapped;
  } catch (err) {
    console.error("[getChannelMembers]", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// 2. addChannelMember
// ---------------------------------------------------------------------------

/**
 * Add a user to a channel. Caller must be admin or manager of the collective.
 */
export async function addChannelMember(
  channelId: string,
  userId: string,
  role: string = "member"
): Promise<{ error: string | null }> {
  try {
    if (!channelId?.trim() || !userId?.trim()) {
      return { error: "Channel ID and user ID are required" };
    }
    if (!["member", "admin"].includes(role)) {
      return { error: "Invalid role" };
    }

    const user = await getAuthenticatedUser();
    if (!user) return { error: "Not authenticated" };

    const sb = createAdminClient();

    // Get channel's collective
    const { data: channel } = await sb
      .from("channels")
      .select("collective_id")
      .eq("id", channelId)
      .maybeSingle();

    if (!channel || !channel.collective_id) return { error: "Channel not found" };

    // Verify caller is admin or manager
    const membership = await verifyCollectiveMembership(
      sb,
      user.id,
      channel.collective_id
    );
    if (!membership) return { error: "Not a member of this collective" };
    if (membership.role !== "admin" && membership.role !== "owner" && membership.role !== "promoter") {
      return { error: "Only admins and managers can add channel members" };
    }

    // Check if user is already a member
    const { data: existing } = await sb
      .from("channel_members")
      .select("id")
      .eq("channel_id", channelId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) return { error: "User is already a member of this channel" };

    // Insert — role exists in DB but not in generated types, cast to bypass
    const { error: insertError } = await untypedFrom(sb, "channel_members")
      .insert({
        channel_id: channelId,
        user_id: userId,
        role,
      });

    if (insertError) {
      console.error("[addChannelMember] insert error:", insertError);
      return { error: "Failed to add member" };
    }

    revalidatePath("/dashboard/chat");
    return { error: null };
  } catch (err) {
    console.error("[addChannelMember]", err);
    return { error: "Something went wrong" };
  }
}

// ---------------------------------------------------------------------------
// 3. removeChannelMember
// ---------------------------------------------------------------------------

/**
 * Remove a user from a channel. Caller must be admin or manager.
 * Cannot remove yourself.
 */
export async function removeChannelMember(
  channelId: string,
  userId: string
): Promise<{ error: string | null }> {
  try {
    if (!channelId?.trim() || !userId?.trim()) {
      return { error: "Channel ID and user ID are required" };
    }

    const user = await getAuthenticatedUser();
    if (!user) return { error: "Not authenticated" };

    if (user.id === userId) {
      return { error: "You cannot remove yourself from a channel" };
    }

    const sb = createAdminClient();

    // Get channel's collective
    const { data: channel } = await sb
      .from("channels")
      .select("collective_id")
      .eq("id", channelId)
      .maybeSingle();

    if (!channel || !channel.collective_id) return { error: "Channel not found" };

    // Verify caller is admin or manager
    const membership = await verifyCollectiveMembership(
      sb,
      user.id,
      channel.collective_id
    );
    if (!membership) return { error: "Not a member of this collective" };
    if (membership.role !== "admin" && membership.role !== "owner" && membership.role !== "promoter") {
      return { error: "Only admins and managers can remove channel members" };
    }

    // Delete the membership
    const { error: deleteError } = await sb
      .from("channel_members")
      .delete()
      .eq("channel_id", channelId)
      .eq("user_id", userId);

    if (deleteError) {
      console.error("[removeChannelMember] delete error:", deleteError);
      return { error: "Failed to remove member" };
    }

    revalidatePath("/dashboard/chat");
    return { error: null };
  } catch (err) {
    console.error("[removeChannelMember]", err);
    return { error: "Something went wrong" };
  }
}

// ---------------------------------------------------------------------------
// 4. searchInvitableUsers
// ---------------------------------------------------------------------------

/**
 * Search users who can be invited to a channel.
 * - General/team channels: collective_members not yet in the channel.
 * - Event channels: collective_members + event_artists not yet in the channel.
 */
export async function searchInvitableUsers(
  channelId: string,
  query: string
): Promise<InvitableUser[]> {
  try {
    if (!channelId?.trim()) return [];

    const user = await getAuthenticatedUser();
    if (!user) return [];

    const sb = createAdminClient();

    // Get channel details
    const { data: channel } = await sb
      .from("channels")
      .select("id, type, collective_id")
      .eq("id", channelId)
      .maybeSingle() as {
        data: { id: string; type: string; collective_id: string | null } | null;
      };

    if (!channel || !channel.collective_id) return [];

    // Verify caller is a member of the collective
    const membership = await verifyCollectiveMembership(
      sb,
      user.id,
      channel.collective_id
    );
    if (!membership) return [];

    // Get existing channel member user_ids to exclude
    const { data: existingMembers } = await sb
      .from("channel_members")
      .select("user_id")
      .eq("channel_id", channelId);

    const existingUserIds = new Set(
      existingMembers?.map((m) => m.user_id) ?? []
    );

    const results: InvitableUser[] = [];

    // Always include collective_members who aren't in the channel yet
    let teamQuery = sb
      .from("collective_members")
      .select("user_id, role, users!inner(id, full_name, email)")
      .eq("collective_id", channel.collective_id)
      .is("deleted_at", null);

    if (query?.trim()) {
      const sanitized = sanitizePostgRESTInput(query.slice(0, 100));
      if (sanitized) {
        teamQuery = teamQuery.or(
          `users.full_name.ilike.%${sanitized}%,users.email.ilike.%${sanitized}%`
        );
      }
    }

    const { data: teamMembers } = await teamQuery.limit(50);

    if (teamMembers) {
      for (const tm of teamMembers) {
        const u = tm.users as unknown as {
          id: string;
          full_name: string | null;
          email: string | null;
        };
        if (u && !existingUserIds.has(tm.user_id)) {
          results.push({
            id: tm.user_id,
            name: u.full_name ?? null,
            email: u.email ?? null,
            role: tm.role ?? null,
            source: "team",
          });
          existingUserIds.add(tm.user_id); // prevent duplicates
        }
      }
    }

    // TODO: needs schema decision — event_id was dropped from channels in the schema rebuild.
    // We can no longer look up event_artists for an event channel without a separate
    // events lookup by channel name. Skip this enrichment for now.
    // if (channel.type === "event") { ... look up artists by event title ... }

    // For event channels with a search query, also search platform-wide artists and collectives
    if (channel.type === "event" && query?.trim()) {
      const sanitized = sanitizePostgRESTInput(query.slice(0, 100));

      if (sanitized) {

        // Search platform artist profiles by bio/slug. artist_profiles links
        // to parties; we then resolve the user via users.party_id.
        const { data: platformArtistProfiles } = await sb
          .from("artist_profiles")
          .select("id, party_id, slug")
          .eq("is_active", true)
          .ilike("slug", `%${sanitized}%`)
          .limit(20);

        if (platformArtistProfiles && platformArtistProfiles.length > 0) {
          const artistPartyIds = platformArtistProfiles.map((ap) => ap.party_id);
          const { data: artistProfileUsers } = await sb
            .from("users")
            .select("id, party_id, full_name, email")
            .in("party_id", artistPartyIds);

          const artistPartyToUser = new Map(
            (artistProfileUsers ?? []).map((u) => [u.party_id, u])
          );

          for (const ap of platformArtistProfiles) {
            const u = artistPartyToUser.get(ap.party_id);
            if (u && !existingUserIds.has(u.id)) {
              results.push({
                id: u.id,
                name: u.full_name ?? ap.slug ?? null,
                email: u.email ?? null,
                role: "artist",
                source: "platform_artist",
              });
              existingUserIds.add(u.id);
            }
          }
        }

        // Also search by user full_name/email for artist users
        const { data: artistUsersByName } = await sb
          .from("users")
          .select("id, party_id, full_name, email")
          .or(`full_name.ilike.%${sanitized}%,email.ilike.%${sanitized}%`)
          .not("party_id", "is", null)
          .limit(20);

        if (artistUsersByName) {
          // Only include if they have an artist_profile
          const candidatePartyIds = artistUsersByName
            .map((u) => u.party_id)
            .filter((p): p is string => p !== null);
          if (candidatePartyIds.length > 0) {
            const { data: confirmedProfiles } = await sb
              .from("artist_profiles")
              .select("party_id")
              .in("party_id", candidatePartyIds)
              .eq("is_active", true);
            const confirmedPartySet = new Set(
              (confirmedProfiles ?? []).map((ap) => ap.party_id)
            );
            for (const u of artistUsersByName) {
              if (u.party_id && confirmedPartySet.has(u.party_id) && !existingUserIds.has(u.id)) {
                results.push({
                  id: u.id,
                  name: u.full_name ?? null,
                  email: u.email ?? null,
                  role: "artist",
                  source: "platform_artist",
                });
                existingUserIds.add(u.id);
              }
            }
          }
        }

        // Search platform collectives by name
        const { data: platformCollectives } = await sb
          .from("collectives")
          .select("id, name, collective_members!inner(user_id, role, users!inner(id, full_name, email))")
          .ilike("name", `%${sanitized}%`)
          .neq("id", channel.collective_id ?? "")
          .limit(10);

        if (platformCollectives) {
          for (const collective of platformCollectives) {
            const members = collective.collective_members as unknown as Array<{
              user_id: string;
              role: string;
              users: { id: string; full_name: string | null; email: string | null };
            }>;
            // Add the admin/owner of the collective
            const collectiveAdmin = members?.find((m) => m.role === "admin" || m.role === "owner");
            if (collectiveAdmin && !existingUserIds.has(collectiveAdmin.user_id)) {
              results.push({
                id: collectiveAdmin.user_id,
                name: collective.name ?? collectiveAdmin.users?.full_name ?? null,
                email: collectiveAdmin.users?.email ?? null,
                role: "collective",
                source: "platform_collective",
              });
              existingUserIds.add(collectiveAdmin.user_id);
            }
          }
        }
      }
    }

    return results;
  } catch (err) {
    console.error("[searchInvitableUsers]", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// 5. syncTeamMembers
// ---------------------------------------------------------------------------

/**
 * Auto-sync all active collective members to the general channel.
 * Uses ON CONFLICT DO NOTHING so existing members are not affected.
 */
export async function syncTeamMembers(
  collectiveId: string
): Promise<{ error: string | null }> {
  try {
    if (!collectiveId?.trim()) return { error: "Collective ID is required" };

    const user = await getAuthenticatedUser();
    if (!user) return { error: "Not authenticated" };

    const sb = createAdminClient();

    // Verify caller is a member
    const membership = await verifyCollectiveMembership(
      sb,
      user.id,
      collectiveId
    );
    if (!membership) return { error: "Not a member of this collective" };

    // Find the general channel
    const { data: generalChannel } = await sb
      .from("channels")
      .select("id")
      .eq("collective_id", collectiveId)
      .eq("type", "general")
      .limit(1)
      .maybeSingle();

    if (!generalChannel) return { error: "General channel not found" };

    // Get all active collective members
    const { data: members } = await sb
      .from("collective_members")
      .select("user_id, role")
      .eq("collective_id", collectiveId)
      .is("deleted_at", null);

    if (!members || members.length === 0) return { error: null };

    // Upsert into channel_members (ON CONFLICT DO NOTHING)
    const rows = members.map((m) => ({
      channel_id: generalChannel.id,
      user_id: m.user_id,
      role: m.role ?? "member",
    }));

    // role exists in DB but not in generated types — cast to bypass
    const { error: upsertError } = await untypedFrom(sb, "channel_members")
      .upsert(rows, { onConflict: "channel_id,user_id", ignoreDuplicates: true });

    if (upsertError) {
      console.error("[syncTeamMembers] upsert error:", upsertError);
      return { error: "Failed to sync members" };
    }

    revalidatePath("/dashboard/chat");
    return { error: null };
  } catch (err) {
    console.error("[syncTeamMembers]", err);
    return { error: "Something went wrong" };
  }
}

// ---------------------------------------------------------------------------
// 6. syncEventMembers
// ---------------------------------------------------------------------------

/**
 * Auto-sync lineup artists + team members to the event channel.
 * Called when an artist is added to a lineup.
 */
export async function syncEventMembers(
  eventId: string
): Promise<{ error: string | null }> {
  try {
    if (!eventId?.trim()) return { error: "Event ID is required" };

    const user = await getAuthenticatedUser();
    if (!user) return { error: "Not authenticated" };

    const sb = createAdminClient();

    // event_id was dropped from channels in the schema rebuild.
    // Look up the event channel by collective_id + type='event' + name=event.title.
    const { data: eventRow } = await sb
      .from("events")
      .select("title, collective_id")
      .eq("id", eventId)
      .maybeSingle();
    if (!eventRow) return { error: "Event not found" };

    const { data: eventChannel } = await sb
      .from("channels")
      .select("id, collective_id")
      .eq("collective_id", eventRow.collective_id)
      .eq("type", "event")
      .eq("name", eventRow.title)
      .maybeSingle();

    if (!eventChannel || !eventChannel.collective_id) return { error: "Event channel not found" };

    // Verify caller is a member of the collective
    const membership = await verifyCollectiveMembership(
      sb,
      user.id,
      eventChannel.collective_id
    );
    if (!membership) return { error: "Not a member of this collective" };

    // Get collective members (collective_id is guaranteed non-null by the guard above)
    const { data: teamMembers } = await sb
      .from("collective_members")
      .select("user_id, role")
      .eq("collective_id", eventChannel.collective_id)
      .is("deleted_at", null);

    // Get event artists that have a linked party (and therefore potentially a user)
    const { data: eventArtists } = await sb
      .from("event_artists")
      .select("id, party_id")
      .eq("event_id", eventId)
      .not("party_id", "is", null);

    const rows: { channel_id: string; user_id: string; role: string }[] = [];
    const seenUserIds = new Set<string>();

    // Add team members
    if (teamMembers) {
      for (const m of teamMembers) {
        if (!seenUserIds.has(m.user_id)) {
          rows.push({
            channel_id: eventChannel.id,
            user_id: m.user_id,
            role: m.role ?? "member",
          });
          seenUserIds.add(m.user_id);
        }
      }
    }

    // Add event artists with linked user accounts (via party_id → users.party_id)
    if (eventArtists && eventArtists.length > 0) {
      const artistPartyIds = eventArtists
        .map((ea) => ea.party_id)
        .filter((p): p is string => p !== null);

      if (artistPartyIds.length > 0) {
        const { data: artistUsers } = await sb
          .from("users")
          .select("id, party_id")
          .in("party_id", artistPartyIds);

        for (const u of artistUsers ?? []) {
          if (!seenUserIds.has(u.id)) {
            rows.push({
              channel_id: eventChannel.id,
              user_id: u.id,
              role: "artist",
            });
            seenUserIds.add(u.id);
          }
        }
      }
    }

    if (rows.length === 0) return { error: null };

    // role exists in DB but not in generated types — cast to bypass
    const { error: upsertError } = await untypedFrom(sb, "channel_members")
      .upsert(rows, { onConflict: "channel_id,user_id", ignoreDuplicates: true });

    if (upsertError) {
      console.error("[syncEventMembers] upsert error:", upsertError);
      return { error: "Failed to sync event members" };
    }

    revalidatePath("/dashboard/chat");
    return { error: null };
  } catch (err) {
    console.error("[syncEventMembers]", err);
    return { error: "Something went wrong" };
  }
}

// ---------------------------------------------------------------------------
// 7. updatePresence
// ---------------------------------------------------------------------------

/**
 * Update the current user's online status and last_seen_at in a channel.
 */
export async function updatePresence(
  channelId: string,
  isOnline: boolean
): Promise<{ error: string | null }> {
  try {
    if (!channelId?.trim()) return { error: "Channel ID is required" };

    const user = await getAuthenticatedUser();
    if (!user) return { error: "Not authenticated" };

    const sb = createAdminClient();

    // is_online and last_seen_at exist in DB but not in generated types — cast.
    const { error: updateError } = await untypedFrom(sb, "channel_members")
      .update({
        is_online: isOnline,
        last_seen_at: new Date().toISOString(),
      })
      .eq("channel_id", channelId)
      .eq("user_id", user.id);

    if (updateError) {
      console.error("[updatePresence] update error:", updateError);
      return { error: "Failed to update presence" };
    }

    return { error: null };
  } catch (err) {
    console.error("[updatePresence]", err);
    return { error: "Something went wrong" };
  }
}
