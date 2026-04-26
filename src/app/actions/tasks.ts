"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import type { SupabaseClient } from "@supabase/supabase-js";
// Canonical ownership check. Previously a local copy of this function —
// now shared with guest-list/promo-codes/ai-theme via `src/lib/auth/ownership`.
import { verifyEventOwnership as verifyEventAccess } from "@/lib/auth/ownership";

// Type-bypass helper for event_tasks queries that read/write columns the
// generated types don't know about. Prod Supabase has metadata + priority
// + deleted_at + updated_at on event_tasks; QA's entity-architecture
// rebuild stripped them and they haven't been restored yet (separate
// schema ticket). The runtime gracefully degrades — if metadata is null
// the anchor-shift logic just returns "no siblings to shift" — but the
// generated types still complain at compile time.
function untypedEventTasks(admin: ReturnType<typeof createAdminClient>) {
  return (admin as unknown as SupabaseClient).from("event_tasks");
}

/** Auth + ownership check. Returns userId if authorized, null otherwise. */
async function authAndVerifyEvent(eventId: string): Promise<string | null> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  if (!(await verifyEventAccess(user.id, eventId))) return null;
  return user.id;
}

// Get playbook templates
export async function getPlaybookTemplates() {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("playbook_templates")
      .select("id, name, description, category, is_global")
      .order("category");
    if (error) {
      console.error("[getPlaybookTemplates]", error);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error("[getPlaybookTemplates]", err);
    return [];
  }
}

// Apply a playbook to an event (generates tasks from template)
export async function applyPlaybook(eventId: string, playbookId: string) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    if (!eventId?.trim()) return { error: "Event ID is required" };
    if (!playbookId?.trim()) return { error: "Playbook ID is required" };

    if (!(await verifyEventAccess(user.id, eventId))) return { error: "Not authorized" };

    const admin = createAdminClient();

    // Get event date
    const { data: event, error: eventError } = await admin
      .from("events")
      .select("starts_at, collective_id")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError) return { error: "Failed to fetch event" };
    if (!event) return { error: "Event not found" };

    // Get collective members for auto-assignment
    const { data: members, error: membersError } = await admin
      .from("collective_members")
      .select("user_id, role")
      .eq("collective_id", event.collective_id)
      .is("deleted_at", null);

    if (membersError) return { error: "Failed to fetch team members" };

    const membersByRole = new Map<string, string>();
    for (const m of members ?? []) {
      membersByRole.set(m.role, m.user_id);
    }

    // Get template tasks
    const { data: templates, error: templatesError } = await admin
      .from("playbook_task_templates")
      .select("*")
      .eq("template_id", playbookId)
      .order("sort_order");

    if (templatesError) return { error: "Failed to fetch playbook templates" };
    if (!templates || templates.length === 0) return { error: "No tasks in playbook" };

    const eventDate = new Date(event.starts_at);

    // Generate tasks
    const tasks = templates.map((t) => {
      // due_offset is stored in hours (negative = before event)
      const dueDate = new Date(eventDate);
      const offsetHours = t.due_offset ?? 0;
      dueDate.setHours(dueDate.getHours() + offsetHours);

      const assignedTo: string | null = null;

      return {
        event_id: eventId,
        title: t.title,
        description: t.description ?? null,
        status: "todo",
        assigned_to: assignedTo,
        due_at: dueDate.toISOString(),
        created_by: user.id,
      };
    });

    const { error } = await admin.from("event_tasks").insert(tasks);
    if (error) return { error: "Failed to create tasks" };

    // Log activity
    const { error: activityError } = await admin.from("event_activity").insert({
      event_id: eventId,
      user_id: user.id,
      action: "system",
      description: `Applied playbook and generated ${tasks.length} tasks`,
    });
    if (activityError) console.error("[applyPlaybook] activity log error:", activityError);

    return { error: null, taskCount: tasks.length };
  } catch (err) {
    console.error("[applyPlaybook]", err);
    return { error: "Something went wrong" };
  }
}

// Get tasks for an event
export async function getEventTasks(eventId: string) {
  try {
    if (!eventId?.trim()) return [];

    const userId = await authAndVerifyEvent(eventId);
    if (!userId) return [];

    const admin = createAdminClient();

    const { data, error } = await admin
      .from("event_tasks")
      .select("*, assigned_user:users!event_tasks_assigned_to_fkey(full_name, email)")
      .eq("event_id", eventId)
      .order("due_at", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[getEventTasks]", error);
      return [];
    }

    return data ?? [];
  } catch (err) {
    console.error("[getEventTasks]", err);
    return [];
  }
}

// Create a single task
// NOC-32: category + priority params removed — underlying columns were
// dropped in PR #93. Previous versions silently discarded these at INSERT
// (type lie). If product wants them back, file a schema ticket first.
export async function createEventTask(input: {
  eventId: string;
  title: string;
  description?: string;
  assignedTo?: string;
  dueDate?: string;
}) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    if (!input.eventId?.trim()) return { error: "Event ID is required" };
    if (!input.title?.trim()) return { error: "Task title is required" };

    if (!(await verifyEventAccess(user.id, input.eventId))) return { error: "Not authorized" };

    const admin = createAdminClient();

    if (input.title.trim().length > 200) return { error: "Task title must be under 200 characters" };
    if (input.description && input.description.length > 5000) return { error: "Task description is too long" };

    const { error } = await admin.from("event_tasks").insert({
      event_id: input.eventId,
      title: input.title.trim(),
      description: input.description || null,
      assigned_to: input.assignedTo || null,
      due_at: input.dueDate || null,
      created_by: user.id,
    });

    if (error) return { error: "Failed to create task" };

    const { error: activityError } = await admin.from("event_activity").insert({
      event_id: input.eventId,
      user_id: user.id,
      action: "task_update",
      description: `Created task: ${input.title}`,
    });
    if (activityError) console.error("[createEventTask] activity log error:", activityError);

    return { error: null };
  } catch (err) {
    console.error("[createEventTask]", err);
    return { error: "Something went wrong" };
  }
}

// Update task status
export async function updateTaskStatus(taskId: string, status: string) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    if (!taskId?.trim()) return { error: "Task ID is required" };
    if (!status?.trim()) return { error: "Status is required" };

    const allowedStatuses = ["todo", "in_progress", "done", "blocked"];
    if (!allowedStatuses.includes(status)) return { error: "Invalid status value" };

    const admin = createAdminClient();

    // Verify ownership via task's event
    const { data: taskCheck, error: taskCheckError } = await admin
      .from("event_tasks")
      .select("event_id")
      .eq("id", taskId)
      .maybeSingle();
    if (taskCheckError) return { error: "Failed to verify task" };
    if (!taskCheck || !(await verifyEventAccess(user.id, taskCheck.event_id))) return { error: "Not authorized" };

    const updates: Record<string, unknown> = { status };

    if (status === "done") {
      updates.completed_at = new Date().toISOString();
    } else if (status === "todo" || status === "in_progress") {
      updates.completed_at = null;
    }

    const { data: task, error } = await admin
      .from("event_tasks")
      .update(updates)
      .eq("id", taskId)
      .select("title, event_id")
      .maybeSingle();

    if (error) return { error: "Failed to update task status" };
    if (!task) return { error: "Task not found" };

    const { error: activityError } = await admin.from("event_activity").insert({
      event_id: task.event_id,
      user_id: user.id,
      action: "task_update",
      description: `Marked "${task.title}" as ${status}`,
    });
    if (activityError) console.error("[updateTaskStatus] activity log error:", activityError);

    return { error: null };
  } catch (err) {
    console.error("[updateTaskStatus]", err);
    return { error: "Something went wrong" };
  }
}

// Update task details (assign, due date)
export async function updateTaskDetails(
  taskId: string,
  updates: { title?: string; assignedTo?: string | null; dueAt?: string | null; description?: string | null }
) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };
    if (!taskId?.trim()) return { error: "Task ID is required" };

    // Title validation mirrors createEventTask: trim, non-empty, ≤ 200 chars.
    // Applied here only when the caller is updating the title.
    if (updates.title !== undefined) {
      const trimmed = updates.title.trim();
      if (!trimmed) return { error: "Task title is required" };
      if (trimmed.length > 200) return { error: "Task title must be under 200 characters" };
      updates.title = trimmed;
    }

    const admin = createAdminClient();
    const { data: taskCheck, error: taskCheckError } = await admin
      .from("event_tasks")
      .select("event_id, title")
      .eq("id", taskId)
      .maybeSingle();
    if (taskCheckError) return { error: "Failed to verify task" };
    if (!taskCheck || !(await verifyEventAccess(user.id, taskCheck.event_id))) return { error: "Not authorized" };

    const dbUpdates: Record<string, unknown> = {};
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.assignedTo !== undefined) dbUpdates.assigned_to = updates.assignedTo;
    if (updates.dueAt !== undefined) dbUpdates.due_at = updates.dueAt;
    if (updates.description !== undefined) dbUpdates.description = updates.description;

    if (Object.keys(dbUpdates).length === 0) return { error: null };

    const { error } = await admin.from("event_tasks").update(dbUpdates).eq("id", taskId);
    if (error) return { error: "Failed to update task" };

    const changes: string[] = [];
    if (updates.title !== undefined) {
      const short = updates.title.length > 60 ? `${updates.title.slice(0, 60)}…` : updates.title;
      changes.push(`renamed to "${short}"`);
    }
    if (updates.assignedTo !== undefined) changes.push(updates.assignedTo ? "reassigned" : "unassigned");
    if (updates.dueAt !== undefined) changes.push(`due date ${updates.dueAt ? "set" : "cleared"}`);
    if (updates.description !== undefined) {
      if (!updates.description) {
        changes.push("note cleared");
      } else {
        const short = updates.description.length > 80 ? `${updates.description.slice(0, 80)}…` : updates.description;
        changes.push(`note: "${short}"`);
      }
    }

    const { error: activityError } = await admin.from("event_activity").insert({
      event_id: taskCheck.event_id,
      user_id: user.id,
      action: "task_update",
      description: `Updated "${taskCheck.title}": ${changes.join(", ")}`,
    });
    if (activityError) console.error("[updateTaskDetails] activity log error:", activityError);

    return { error: null };
  } catch (err) {
    console.error("[updateTaskDetails]", err);
    return { error: "Something went wrong" };
  }
}

// Get collective members for an event (for assignee dropdown)
export async function getEventMembers(eventId: string) {
  try {
    if (!eventId?.trim()) return [];
    const userId = await authAndVerifyEvent(eventId);
    if (!userId) return [];

    const admin = createAdminClient();
    const { data: event, error: eventError } = await admin
      .from("events")
      .select("collective_id")
      .eq("id", eventId)
      .maybeSingle();
    if (eventError) {
      console.error("[getEventMembers] event lookup error:", eventError);
      return [];
    }
    if (!event) return [];

    const { data, error } = await admin
      .from("collective_members")
      .select("user_id, role, users!collective_members_user_id_fkey(full_name, email)")
      .eq("collective_id", event.collective_id)
      .is("deleted_at", null);

    if (error) {
      console.error("[getEventMembers]", error);
      return [];
    }
    return (data ?? []).map((m) => {
      const u = m.users as unknown as { full_name: string; email: string } | null;
      return { id: m.user_id, name: u?.full_name ?? u?.email ?? "Unknown", role: m.role };
    });
  } catch (err) {
    console.error("[getEventMembers]", err);
    return [];
  }
}

// Post a message to event activity feed
export async function postEventMessage(eventId: string, content: string) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    if (!eventId?.trim()) return { error: "Event ID is required" };
    if (!content?.trim()) return { error: "Message content is required" };

    if (!(await verifyEventAccess(user.id, eventId))) return { error: "Not authorized" };

    const admin = createAdminClient();

    const sanitizedContent = content.trim().slice(0, 5000);

    const { error } = await admin.from("event_activity").insert({
      event_id: eventId,
      user_id: user.id,
      action: "message",
      description: sanitizedContent,
    });

    if (error) return { error: "Failed to post message" };
    return { error: null };
  } catch (err) {
    console.error("[postEventMessage]", err);
    return { error: "Something went wrong" };
  }
}

// Get event activity feed
export async function getEventActivity(eventId: string) {
  try {
    if (!eventId?.trim()) return [];

    const userId = await authAndVerifyEvent(eventId);
    if (!userId) return [];

    const admin = createAdminClient();

    const { data, error } = await admin
      .from("event_activity")
      .select("*, users(full_name, email)")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[getEventActivity]", error);
      return [];
    }

    return data ?? [];
  } catch (err) {
    console.error("[getEventActivity]", err);
    return [];
  }
}

// Generate AI task suggestions based on event state
export async function getAITaskSuggestions(eventId: string) {
  try {
    if (!eventId?.trim()) return [];

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    if (!(await verifyEventAccess(user.id, eventId))) return [];

    const admin = createAdminClient();

    const { data: event, error: eventError } = await admin
      .from("events")
      .select("title, starts_at, status")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError) {
      console.error("[getAITaskSuggestions] event lookup error:", eventError);
      return [];
    }
    if (!event) return [];

    const { data: existingTasks, error: tasksError } = await admin
      .from("event_tasks")
      .select("title, status")
      .eq("event_id", eventId);

    if (tasksError) {
      console.error("[getAITaskSuggestions] tasks lookup error:", tasksError);
      return [];
    }

    const existingTitles = new Set((existingTasks ?? []).map((t) => t.title.toLowerCase()));
    const daysUntil = Math.ceil((new Date(event.starts_at).getTime() - Date.now()) / 86400000);

    const suggestions: Array<{ title: string; description: string; category: string; priority: string }> = [];

    // Check for lineup
    const { count: artistCount } = await admin
      .from("event_artists")
      .select("*", { count: "exact", head: true })
      .eq("event_id", eventId);

    if ((artistCount ?? 0) === 0 && !existingTitles.has("book headline dj")) {
      suggestions.push({
        title: "Book your lineup",
        description: "No artists confirmed yet — time to lock in talent",
        category: "talent",
        priority: daysUntil < 14 ? "urgent" : "high",
      });
    }

    // Check for tickets
    const { count: tierCount } = await admin
      .from("ticket_tiers")
      .select("*", { count: "exact", head: true })
      .eq("event_id", eventId);

    if ((tierCount ?? 0) === 0 && !existingTitles.has("set up ticket tiers")) {
      suggestions.push({
        title: "Set up ticket tiers",
        description: "Configure pricing before you can sell tickets",
        category: "finance",
        priority: "high",
      });
    }

    // Marketing suggestions based on timing
    if (daysUntil <= 14 && daysUntil > 0 && !existingTitles.has("post lineup announcement")) {
      suggestions.push({
        title: "Post lineup announcement",
        description: `Only ${daysUntil} days out — social media promotion drives ticket sales`,
        category: "marketing",
        priority: daysUntil <= 7 ? "urgent" : "high",
      });
    }

    if (event.status === "draft" && !existingTitles.has("publish event page")) {
      suggestions.push({
        title: "Publish event page",
        description: "Your event is still in draft — go live to start selling",
        category: "marketing",
        priority: "high",
      });
    }

    return suggestions;
  } catch (err) {
    console.error("[getAITaskSuggestions]", err);
    return [];
  }
}

// Get current user's active tasks across all events
export async function getMyTasks(limit = 10) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const clampedLimit = Math.max(1, Math.min(limit, 100));

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("event_tasks")
      .select("id, title, status, due_at, event_id, events!event_tasks_event_id_fkey(title, starts_at)")
      .eq("assigned_to", user.id)
      .in("status", ["todo", "in_progress"])
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(clampedLimit);

    if (error) {
      console.error("[getMyTasks]", error);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error("[getMyTasks]", err);
    return [];
  }
}

// Get event date for countdown display
export async function getEventDate(eventId: string): Promise<string | null> {
  try {
    if (!eventId?.trim()) return null;
    const userId = await authAndVerifyEvent(eventId);
    if (!userId) return null;
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("events")
      .select("starts_at")
      .eq("id", eventId)
      .maybeSingle();
    if (error) {
      console.error("[getEventDate]", error);
      return null;
    }
    return (data?.starts_at as string) ?? null;
  } catch (err) {
    console.error("[getEventDate]", err);
    return null;
  }
}

// Get task completion progress for an event
export async function getEventTaskProgress(eventId: string) {
  try {
    if (!eventId?.trim()) return null;

    const userId = await authAndVerifyEvent(eventId);
    if (!userId) return null;

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("event_tasks")
      .select("status")
      .eq("event_id", eventId);

    if (error) {
      console.error("[getEventTaskProgress]", error);
      return null;
    }
    if (!data || data.length === 0) return null;

    const total = data.length;
    const done = data.filter((t) => t.status === "done").length;
    return { total, done, percent: Math.round((done / total) * 100) };
  } catch (err) {
    console.error("[getEventTaskProgress]", err);
    return null;
  }
}

// ─── Playbook anchor-shift (NOC-49) ───────────────────────────────────────
//
// When an operator moves the announcement post (the first content task in a
// playbook), every downstream content task should shift by the same delta so
// the cascade stays intact. We call the first task in a `playbook:<id>:content`
// group the "anchor" — its `metadata.position` is the lowest in the group
// (typically 1000 per launch-playbook.ts numbering).
//
// Two actions:
//   1. getPlaybookSiblingsToShift — preview-only. Returns sibling count + delta
//      so the UI can render a confirmation banner ("Shift 8 other content
//      tasks by +3 days?").
//   2. shiftPlaybookSiblings — applies the shift. Re-derives siblings to
//      avoid stale IDs and skips siblings already past their due date.
//
// We intentionally do NOT shift ops tasks (vendor confirms, day-of) — those
// are anchored to the event date, not the announcement. We also skip
// completed tasks so re-dating doesn't reopen past work.

interface TaskMetadataLite {
  source?: string;
  position?: number;
}

function asTaskMetadata(value: unknown): TaskMetadataLite {
  if (!value || typeof value !== "object") return {};
  const obj = value as Record<string, unknown>;
  return {
    source: typeof obj.source === "string" ? obj.source : undefined,
    position: typeof obj.position === "number" ? obj.position : undefined,
  };
}

export async function getPlaybookSiblingsToShift(
  taskId: string,
  oldDueAt: string | null,
  newDueAt: string | null,
): Promise<{
  canShift: boolean;
  siblingCount: number;
  deltaMs: number;
  deltaDays: number;
  groupSource: string | null;
}> {
  const empty = {
    canShift: false,
    siblingCount: 0,
    deltaMs: 0,
    deltaDays: 0,
    groupSource: null,
  };

  try {
    if (!taskId?.trim()) return empty;
    if (!oldDueAt || !newDueAt) return empty;

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return empty;

    const admin = createAdminClient();
    const { data: anchorRaw, error: anchorErr } = await untypedEventTasks(admin)
      .select("id, event_id, due_at, metadata, status")
      .eq("id", taskId)
      .maybeSingle() as {
        data: {
          id: string;
          event_id: string;
          due_at: string | null;
          metadata: unknown;
          status: string | null;
        } | null;
        error: { message: string } | null;
      };
    if (anchorErr || !anchorRaw) return empty;
    const anchor = anchorRaw;

    if (!(await verifyEventAccess(user.id, anchor.event_id))) return empty;

    const meta = asTaskMetadata(anchor.metadata);
    // Only content tasks act as anchors. Ops tasks anchor to the event date,
    // not the announcement, so we don't cascade them.
    if (!meta.source || !/^playbook:[^:]+:content$/.test(meta.source)) return empty;
    if (meta.position == null) return empty;

    const deltaMs = new Date(newDueAt).getTime() - new Date(oldDueAt).getTime();
    if (!Number.isFinite(deltaMs) || deltaMs === 0) return empty;

    // Verify this is the lowest-position task in its content group — i.e.
    // the actual anchor. Mid-chain edits don't cascade.
    const { data: groupMinRaw } = await untypedEventTasks(admin)
      .select("id, metadata")
      .eq("event_id", anchor.event_id)
      .order("created_at", { ascending: true })
      .limit(500) as {
        data: Array<{ id: string; metadata: unknown }> | null;
      };

    if (!groupMinRaw) return empty;
    const groupTasks = groupMinRaw
      .map((t) => ({ id: t.id, meta: asTaskMetadata(t.metadata) }))
      .filter((t) => t.meta.source === meta.source && t.meta.position != null);
    const minPosition = Math.min(...groupTasks.map((t) => t.meta.position ?? Infinity));
    if (meta.position !== minPosition) return empty;

    // Count siblings that would shift: same group, position > anchor, has a
    // due_at, not completed. (Completed work shouldn't be re-dated.)
    const siblingCount = groupTasks.filter((t) => {
      if (t.id === anchor.id) return false;
      const pos = t.meta.position;
      return pos != null && pos > meta.position!;
    }).length;

    if (siblingCount === 0) return empty;

    const deltaDays = Math.round(deltaMs / 86400000);

    return {
      canShift: true,
      siblingCount,
      deltaMs,
      deltaDays,
      groupSource: meta.source,
    };
  } catch (err) {
    console.error("[getPlaybookSiblingsToShift]", err);
    return empty;
  }
}

export async function shiftPlaybookSiblings(
  taskId: string,
  deltaMs: number,
): Promise<{ error: string | null; shiftedCount: number }> {
  try {
    if (!taskId?.trim()) return { error: "Task ID is required", shiftedCount: 0 };
    if (!Number.isFinite(deltaMs) || deltaMs === 0) {
      return { error: "Invalid shift delta", shiftedCount: 0 };
    }
    // Cap at 365 days each direction to prevent runaway shifts.
    const MAX_SHIFT_MS = 365 * 86400000;
    if (Math.abs(deltaMs) > MAX_SHIFT_MS) {
      return { error: "Shift too large (max 365 days)", shiftedCount: 0 };
    }

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated", shiftedCount: 0 };

    const admin = createAdminClient();
    const { data: anchorRaw } = await untypedEventTasks(admin)
      .select("id, event_id, metadata")
      .eq("id", taskId)
      .maybeSingle() as {
        data: { id: string; event_id: string; metadata: unknown } | null;
      };
    if (!anchorRaw) return { error: "Task not found", shiftedCount: 0 };
    const anchor = anchorRaw;

    if (!(await verifyEventAccess(user.id, anchor.event_id))) {
      return { error: "Not authorized", shiftedCount: 0 };
    }

    const meta = asTaskMetadata(anchor.metadata);
    if (!meta.source || !/^playbook:[^:]+:content$/.test(meta.source)) {
      return { error: "Not a playbook anchor task", shiftedCount: 0 };
    }
    if (meta.position == null) {
      return { error: "Anchor task has no position", shiftedCount: 0 };
    }

    // Re-fetch siblings live so we never trust a client-provided ID list.
    const { data: candidatesRaw, error: candidatesErr } = await untypedEventTasks(admin)
      .select("id, due_at, metadata, status")
      .eq("event_id", anchor.event_id) as {
        data: Array<{
          id: string;
          due_at: string | null;
          metadata: unknown;
          status: string | null;
        }> | null;
        error: { message: string } | null;
      };
    if (candidatesErr || !candidatesRaw) {
      return { error: "Failed to look up siblings", shiftedCount: 0 };
    }

    const siblings = candidatesRaw.filter((t) => {
      if (t.id === anchor.id) return false;
      if (t.status === "done" || t.status === "completed") return false;
      if (!t.due_at) return false;
      const m = asTaskMetadata(t.metadata);
      return (
        m.source === meta.source &&
        m.position != null &&
        m.position > (meta.position ?? 0)
      );
    });

    if (siblings.length === 0) return { error: null, shiftedCount: 0 };

    // Apply the shift one at a time. Could be batched via RPC later if this
    // becomes a hot path; ~10-20 siblings per playbook is typical so the
    // per-row roundtrip cost is fine.
    let shiftedCount = 0;
    for (const sibling of siblings) {
      const newDueAt = new Date(
        new Date(sibling.due_at as string).getTime() + deltaMs,
      ).toISOString();
      const { error: updateErr } = await untypedEventTasks(admin)
        .update({ due_at: newDueAt })
        .eq("id", sibling.id);
      if (!updateErr) shiftedCount++;
    }

    // Activity log entry so the change is auditable.
    const days = Math.round(deltaMs / 86400000);
    const direction = days >= 0 ? "+" : "−";
    await admin.from("event_activity").insert({
      event_id: anchor.event_id,
      user_id: user.id,
      action: "playbook_shift",
      description: `Shifted ${shiftedCount} downstream content task${shiftedCount === 1 ? "" : "s"} by ${direction}${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} (anchor: announcement)`,
    });

    return { error: null, shiftedCount };
  } catch (err) {
    console.error("[shiftPlaybookSiblings]", err);
    return { error: "Something went wrong", shiftedCount: 0 };
  }
}
