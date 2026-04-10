"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

/** Verify user has access to an event via collective membership */
async function verifyEventAccess(userId: string, eventId: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data: event, error: eventError } = await admin
      .from("events")
      .select("collective_id")
      .eq("id", eventId)
      .maybeSingle();
    if (eventError) {
      console.error("[verifyEventAccess] event lookup error:", eventError);
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
      console.error("[verifyEventAccess] membership lookup error:", memberError);
      return false;
    }
    return (count ?? 0) > 0;
  } catch (err) {
    console.error("[verifyEventAccess]", err);
    return false;
  }
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
      .eq("playbook_id", playbookId)
      .order("position");

    if (templatesError) return { error: "Failed to fetch playbook templates" };
    if (!templates || templates.length === 0) return { error: "No tasks in playbook" };

    const eventDate = new Date(event.starts_at);

    // Generate tasks
    const tasks = templates.map((t, _i) => {
      // due_offset_hours is stored in hours (negative = before event)
      const dueDate = new Date(eventDate);
      const offsetHours = t.due_offset_hours ?? 0;
      dueDate.setHours(dueDate.getHours() + offsetHours);

      // Try to auto-assign based on role
      const assignedTo = t.default_assignee_role ? (membersByRole.get(t.default_assignee_role) || membersByRole.get("admin") || null) : null;

      // Determine priority: tasks due within 72 hours of event are high priority
      const isHighPriority = Math.abs(offsetHours) <= 72;

      return {
        event_id: eventId,
        title: t.title,
        description: t.description,
        status: "todo",
        priority: isHighPriority ? "high" : "medium",
        assigned_to: assignedTo,
        due_at: dueDate.toISOString(),
        metadata: {
          created_by: user.id,
          source_template_id: t.id,
          position: t.position,
        },
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
// TODO(audit): validate priority/category enums, UUID-validate assignedTo
export async function createEventTask(input: {
  eventId: string;
  title: string;
  description?: string;
  category?: string;
  priority?: string;
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
      title: input.title,
      description: input.description || null,
      priority: input.priority || "medium",
      assigned_to: input.assignedTo || null,
      due_at: input.dueDate || null,
      metadata: {
        created_by: user.id,
        category: input.category || "general",
      },
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
    const { data: taskCheck, error: taskCheckError } = await admin.from("event_tasks").select("event_id").eq("id", taskId).maybeSingle();
    if (taskCheckError) return { error: "Failed to verify task" };
    if (!taskCheck || !(await verifyEventAccess(user.id, taskCheck.event_id))) return { error: "Not authorized" };

    const updates: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === "done") {
      updates.completed_at = new Date().toISOString();
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
// TODO(audit): validate priority/category enums, UUID-validate assignedTo
export async function updateTaskDetails(taskId: string, updates: { assignedTo?: string | null; dueAt?: string | null; description?: string | null }) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };
    if (!taskId?.trim()) return { error: "Task ID is required" };

    const admin = createAdminClient();
    const { data: taskCheck, error: taskCheckError } = await admin.from("event_tasks").select("event_id, title").eq("id", taskId).maybeSingle();
    if (taskCheckError) return { error: "Failed to verify task" };
    if (!taskCheck || !(await verifyEventAccess(user.id, taskCheck.event_id))) return { error: "Not authorized" };

    const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.assignedTo !== undefined) dbUpdates.assigned_to = updates.assignedTo;
    if (updates.dueAt !== undefined) dbUpdates.due_at = updates.dueAt;
    if (updates.description !== undefined) dbUpdates.description = updates.description;

    const { error } = await admin.from("event_tasks").update(dbUpdates).eq("id", taskId);
    if (error) return { error: "Failed to update task" };

    const changes: string[] = [];
    if (updates.assignedTo !== undefined) changes.push(updates.assignedTo ? "reassigned" : "unassigned");
    if (updates.dueAt !== undefined) changes.push(`due date ${updates.dueAt ? "set" : "cleared"}`);
    if (updates.description !== undefined) changes.push("note updated");

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
    const { data: event, error: eventError } = await admin.from("events").select("collective_id").eq("id", eventId).maybeSingle();
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

    const existingTitles = new Set((existingTasks ?? []).map(t => t.title.toLowerCase()));
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
      .select("id, title, status, priority, due_at, metadata, event_id, events!event_tasks_event_id_fkey(title, starts_at)")
      .eq("assigned_to", user.id)
      .in("status", ["todo", "in_progress"])
      .is("deleted_at", null)
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
    const { data, error } = await admin.from("events").select("starts_at").eq("id", eventId).maybeSingle();
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
      .eq("event_id", eventId)
      .is("deleted_at", null);

    if (error) {
      console.error("[getEventTaskProgress]", error);
      return null;
    }
    if (!data || data.length === 0) return null;

    const total = data.length;
    const done = data.filter(t => t.status === "done").length;
    return { total, done, percent: Math.round((done / total) * 100) };
  } catch (err) {
    console.error("[getEventTaskProgress]", err);
    return null;
  }
}
