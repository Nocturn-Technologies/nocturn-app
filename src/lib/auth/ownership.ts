/**
 * Canonical ownership checks.
 *
 * Three near-identical `verifyEventAccess` implementations existed inline
 * across `tasks.ts`, `guest-list.ts`, `promo-codes.ts`, and `ai-theme.ts`.
 * Each one diverged in subtle ways — one cached `createAdminClient()`,
 * another returned a `{ error, userId }` tuple, the promo-codes variant
 * used the server client (RLS-subject) and re-derived the user internally,
 * and ai-theme returned the event row itself. Same intent, three bugs
 * waiting to drift apart.
 *
 * This module is the single source of truth. Keep per-file wrappers thin —
 * call `verifyEventOwnership` / `verifyCollectiveOwnership` directly from
 * server actions. All queries run through the admin client (bypassing RLS)
 * so membership is validated against the canonical `collective_members`
 * table regardless of the caller's session state; we still require a
 * `userId` argument so the caller must have already authenticated.
 */

import { createAdminClient } from "@/lib/supabase/config";

/**
 * True if `userId` is an active (non-deleted) member of the collective
 * that owns `eventId`. Returns false on any error or missing row — the
 * callers treat this as "deny" which is the safe default.
 */
export async function verifyEventOwnership(
  userId: string,
  eventId: string
): Promise<boolean> {
  if (!userId || !eventId) return false;
  try {
    const admin = createAdminClient();
    const { data: event, error: eventError } = await admin
      .from("events")
      .select("collective_id")
      .eq("id", eventId)
      .maybeSingle();
    if (eventError) {
      console.error("[verifyEventOwnership] event lookup error:", eventError);
      return false;
    }
    if (!event) return false;
    const { count, error: memberError } = await admin
      .from("collective_members")
      .select("*", { count: "exact", head: true })
      .eq("collective_id", event.collective_id)
      .eq("user_id", userId)
      .is("deleted_at", null);
    if (memberError) {
      console.error("[verifyEventOwnership] membership lookup error:", memberError);
      return false;
    }
    return (count ?? 0) > 0;
  } catch (err) {
    console.error("[verifyEventOwnership]", err);
    return false;
  }
}

/**
 * True if `userId` is an active member of `collectiveId`. Used by actions
 * that scope to a collective directly (settings, invitations, campaigns)
 * rather than through an event.
 */
export async function verifyCollectiveOwnership(
  userId: string,
  collectiveId: string
): Promise<boolean> {
  if (!userId || !collectiveId) return false;
  try {
    const admin = createAdminClient();
    const { count, error } = await admin
      .from("collective_members")
      .select("*", { count: "exact", head: true })
      .eq("collective_id", collectiveId)
      .eq("user_id", userId)
      .is("deleted_at", null);
    if (error) {
      console.error("[verifyCollectiveOwnership] lookup error:", error);
      return false;
    }
    return (count ?? 0) > 0;
  } catch (err) {
    console.error("[verifyCollectiveOwnership]", err);
    return false;
  }
}

/**
 * Role-gated variant. Useful for "admin-only" server actions (payouts,
 * deletes, member removal). Returns false if user is a member but not in
 * the allowed roles list.
 */
export async function verifyCollectiveRole(
  userId: string,
  collectiveId: string,
  allowedRoles: readonly string[]
): Promise<boolean> {
  if (!userId || !collectiveId || allowedRoles.length === 0) return false;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("collective_members")
      .select("role")
      .eq("collective_id", collectiveId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      console.error("[verifyCollectiveRole] lookup error:", error);
      return false;
    }
    if (!data?.role) return false;
    return allowedRoles.includes(data.role);
  } catch (err) {
    console.error("[verifyCollectiveRole]", err);
    return false;
  }
}
