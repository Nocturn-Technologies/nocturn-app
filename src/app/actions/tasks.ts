"use server";

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";

function createAdminClient() {
  return createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// Get playbook templates
export async function getPlaybookTemplates() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("playbook_templates")
    .select("id, name, description, event_type, is_default")
    .order("event_type");
  return data ?? [];
}

// Apply a playbook to an event (generates tasks from template)
export async function applyPlaybook(eventId: string, playbookId: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const admin = createAdminClient();

  // Get event date
  const { data: event } = await admin
    .from("events")
    .select("starts_at, collective_id")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) return { error: "Event not found" };

  // Get collective members for auto-assignment
  const { data: members } = await admin
    .from("collective_members")
    .select("user_id, role")
    .eq("collective_id", event.collective_id)
    .is("deleted_at", null);

  const membersByRole = new Map<string, string>();
  for (const m of members ?? []) {
    membersByRole.set(m.role, m.user_id);
  }

  // Get template tasks
  const { data: templates } = await admin
    .from("playbook_task_templates")
    .select("*")
    .eq("playbook_id", playbookId)
    .order("sort_order");

  if (!templates || templates.length === 0) return { error: "No tasks in playbook" };

  const eventDate = new Date(event.starts_at);

  // Generate tasks
  const tasks = templates.map((t, i) => {
    const dueDate = new Date(eventDate);
    dueDate.setDate(dueDate.getDate() + (t.days_before_event < 0 ? Math.abs(t.days_before_event) : -t.days_before_event));

    // Try to auto-assign based on role
    const assignedTo = t.default_role ? (membersByRole.get(t.default_role) || membersByRole.get("admin") || null) : null;

    return {
      event_id: eventId,
      title: t.title,
      description: t.description,
      category: t.category,
      status: "todo" as const,
      priority: t.days_before_event <= 3 ? "high" : "medium" as const,
      assigned_to: assignedTo,
      due_date: dueDate.toISOString().split("T")[0],
      sort_order: t.sort_order,
      created_by: user.id,
    };
  });

  const { error } = await admin.from("event_tasks").insert(tasks);
  if (error) return { error: error.message };

  // Log activity
  await admin.from("event_activity").insert({
    event_id: eventId,
    user_id: user.id,
    type: "system",
    content: `Applied playbook and generated ${tasks.length} tasks`,
  });

  return { error: null, taskCount: tasks.length };
}

// Get tasks for an event
export async function getEventTasks(eventId: string) {
  const admin = createAdminClient();

  const { data } = await admin
    .from("event_tasks")
    .select("*, assigned_user:users!event_tasks_assigned_to_fkey(full_name, email)")
    .eq("event_id", eventId)
    .order("due_date", { ascending: true })
    .order("sort_order", { ascending: true });

  return data ?? [];
}

// Create a single task
export async function createEventTask(input: {
  eventId: string;
  title: string;
  description?: string;
  category?: string;
  priority?: string;
  assignedTo?: string;
  dueDate?: string;
}) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const admin = createAdminClient();

  const { error } = await admin.from("event_tasks").insert({
    event_id: input.eventId,
    title: input.title,
    description: input.description || null,
    category: input.category || "general",
    priority: input.priority || "medium",
    assigned_to: input.assignedTo || null,
    due_date: input.dueDate || null,
    created_by: user.id,
  });

  if (error) return { error: error.message };

  await admin.from("event_activity").insert({
    event_id: input.eventId,
    user_id: user.id,
    type: "task_update",
    content: `Created task: ${input.title}`,
  });

  return { error: null };
}

// Update task status
export async function updateTaskStatus(taskId: string, status: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const admin = createAdminClient();

  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === "done") {
    updates.completed_at = new Date().toISOString();
    updates.completed_by = user.id;
  }

  const { data: task, error } = await admin
    .from("event_tasks")
    .update(updates)
    .eq("id", taskId)
    .select("title, event_id")
    .maybeSingle();

  if (error || !task) return { error: error?.message ?? "Task not found" };

  await admin.from("event_activity").insert({
    event_id: task.event_id,
    user_id: user.id,
    type: "task_update",
    content: `Marked "${task.title}" as ${status}`,
  });

  return { error: null };
}

// Assign a task
export async function assignTask(taskId: string, userId: string | null) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const admin = createAdminClient();

  const { data: task, error } = await admin
    .from("event_tasks")
    .update({ assigned_to: userId, updated_at: new Date().toISOString() })
    .eq("id", taskId)
    .select("title, event_id")
    .maybeSingle();

  if (error || !task) return { error: error?.message ?? "Task not found" };

  // Get assignee name
  let assigneeName = "Unassigned";
  if (userId) {
    const { data: assignee } = await admin.from("users").select("full_name").eq("id", userId).maybeSingle();
    assigneeName = assignee?.full_name || "someone";
  }

  await admin.from("event_activity").insert({
    event_id: task.event_id,
    user_id: user.id,
    type: "task_update",
    content: `Assigned "${task.title}" to ${assigneeName}`,
  });

  return { error: null };
}

// Post a message to event activity feed
export async function postEventMessage(eventId: string, content: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const admin = createAdminClient();

  const { error } = await admin.from("event_activity").insert({
    event_id: eventId,
    user_id: user.id,
    type: "message",
    content,
  });

  if (error) return { error: error.message };
  return { error: null };
}

// Get event activity feed
export async function getEventActivity(eventId: string) {
  const admin = createAdminClient();

  const { data } = await admin
    .from("event_activity")
    .select("*, users(full_name, email)")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(50);

  return data ?? [];
}

// Generate AI task suggestions based on event state
export async function getAITaskSuggestions(eventId: string) {
  const admin = createAdminClient();

  const { data: event } = await admin
    .from("events")
    .select("title, starts_at, status")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) return [];

  const { data: existingTasks } = await admin
    .from("event_tasks")
    .select("title, status")
    .eq("event_id", eventId);

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
}
