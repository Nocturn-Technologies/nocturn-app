"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { revalidatePath } from "next/cache";
import { sanitizePostgRESTInput } from "@/lib/utils";

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

    // Fetch channel members joined with users table
    const { data: members, error: membersError } = await sb
      .from("channel_members")
      .select(
        "id, channel_id, user_id, role, joined_at, last_seen_at, is_online, users!inner(full_name, email, avatar_url)"
      )
      .eq("channel_id", channelId);

    if (membersError) {
      console.error("[getChannelMembers] query error:", membersError.message);
      return [];
    }

    if (!members || members.length === 0) return [];

    const mapped: ChatMember[] = members.map((m) => {
      const u = m.users as unknown as {
        full_name: string | null;
        email: string | null;
        avatar_url: string | null;
      };
      return {
        id: m.id,
        channel_id: m.channel_id,
        user_id: m.user_id,
        role: m.role,
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

    // Insert
    const { error: insertError } = await sb
      .from("channel_members")
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
      .select("id, type, collective_id, event_id")
      .eq("id", channelId)
      .maybeSingle();

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

    // For event channels, also include event_artists
    if (channel.type === "event" && channel.event_id) {
      let artistQuery = sb
        .from("event_artists")
        .select(
          "artist_id, status, artists!inner(id, user_id, name, users(id, full_name, email))"
        )
        .eq("event_id", channel.event_id);

      const { data: eventArtists } = await artistQuery.limit(50);

      if (eventArtists) {
        for (const ea of eventArtists) {
          const artist = ea.artists as unknown as {
            id: string;
            user_id: string | null;
            name: string | null;
            users: {
              id: string;
              full_name: string | null;
              email: string | null;
            } | null;
          };

          // Only include artists who have a linked user account
          if (artist?.user_id && !existingUserIds.has(artist.user_id)) {
            // Apply search filter for artists too
            if (query?.trim()) {
              const lowerQuery = query.toLowerCase().trim();
              const nameMatch =
                artist.name?.toLowerCase().includes(lowerQuery) ||
                artist.users?.full_name?.toLowerCase().includes(lowerQuery) ||
                artist.users?.email?.toLowerCase().includes(lowerQuery);
              if (!nameMatch) continue;
            }

            results.push({
              id: artist.user_id,
              name:
                artist.users?.full_name ?? artist.name ?? null,
              email: artist.users?.email ?? null,
              role: "artist",
              source: "artist",
            });
            existingUserIds.add(artist.user_id);
          }
        }
      }
    }

    // For event channels with a search query, also search platform-wide artists and collectives
    if (channel.type === "event" && query?.trim()) {
      const sanitized = sanitizePostgRESTInput(query.slice(0, 100));

      if (sanitized) {

        // Search platform artists by name (PostgREST .or() can't cross into joined tables)
        const { data: platformArtists } = await sb
          .from("artists")
          .select("id, user_id, name, users!inner(id, full_name, email)")
          .not("user_id", "is", null)
          .ilike("name", `%${sanitized}%`)
          .limit(20);

        if (platformArtists) {
          for (const artist of platformArtists) {
            const u = artist.users as unknown as {
              id: string;
              full_name: string | null;
              email: string | null;
            };
            if (artist.user_id && !existingUserIds.has(artist.user_id)) {
              results.push({
                id: artist.user_id,
                name: u?.full_name ?? artist.name ?? null,
                email: u?.email ?? null,
                role: "artist",
                source: "platform_artist",
              });
              existingUserIds.add(artist.user_id);
            }
          }
        }

        // Also search artists by user email/name (separate query)
        const { data: platformArtistsByUser } = await sb
          .from("artists")
          .select("id, user_id, name, users!inner(id, full_name, email)")
          .not("user_id", "is", null)
          .or(`full_name.ilike.%${sanitized}%,email.ilike.%${sanitized}%`, { referencedTable: "users" })
          .limit(20);

        if (platformArtistsByUser) {
          for (const artist of platformArtistsByUser) {
            const u = artist.users as unknown as {
              id: string;
              full_name: string | null;
              email: string | null;
            };
            if (artist.user_id && !existingUserIds.has(artist.user_id)) {
              results.push({
                id: artist.user_id,
                name: u?.full_name ?? artist.name ?? null,
                email: u?.email ?? null,
                role: "artist",
                source: "platform_artist",
              });
              existingUserIds.add(artist.user_id);
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
            const admin = members?.find((m) => m.role === "admin" || m.role === "owner");
            if (admin && !existingUserIds.has(admin.user_id)) {
              results.push({
                id: admin.user_id,
                name: collective.name ?? admin.users?.full_name ?? null,
                email: admin.users?.email ?? null,
                role: "collective",
                source: "platform_collective",
              });
              existingUserIds.add(admin.user_id);
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

    const { error: upsertError } = await sb
      .from("channel_members")
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

    // Find the event channel
    const { data: eventChannel } = await sb
      .from("channels")
      .select("id, collective_id")
      .eq("event_id", eventId)
      .eq("type", "event")
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
      .eq("collective_id", eventChannel.collective_id!)
      .is("deleted_at", null);

    // Get event artists that have linked user accounts
    const { data: eventArtists } = await sb
      .from("event_artists")
      .select("artist_id, artists!inner(user_id)")
      .eq("event_id", eventId);

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

    // Add event artists with linked user accounts
    if (eventArtists) {
      for (const ea of eventArtists) {
        const artist = ea.artists as unknown as { user_id: string | null };
        if (artist?.user_id && !seenUserIds.has(artist.user_id)) {
          rows.push({
            channel_id: eventChannel.id,
            user_id: artist.user_id,
            role: "artist",
          });
          seenUserIds.add(artist.user_id);
        }
      }
    }

    if (rows.length === 0) return { error: null };

    const { error: upsertError } = await sb
      .from("channel_members")
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

    const { error: updateError } = await sb
      .from("channel_members")
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
