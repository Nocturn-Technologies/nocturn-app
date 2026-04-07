"use client";

import { useState, useEffect, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sparkles,
  Plus,
  Check,
  Circle,
  Clock,
  AlertTriangle,
  ArrowLeft,
  ListChecks,
  MessageSquare,
  Send,
  ChevronDown,
  ChevronRight,
  Loader2,
  Copy,
  Image,
  UserPlus,
  CalendarClock,
} from "lucide-react";
import Link from "next/link";
import {
  getEventTasks,
  createEventTask,
  updateTaskStatus,
  updateTaskDetails,
  getEventMembers,
  postEventMessage,
  getEventActivity,
  getAITaskSuggestions,
} from "@/app/actions/tasks";

// ─── Constants ────────────────────────────────────────────────────────────────

const statusIcons: Record<string, React.ReactNode> = {
  todo: <Circle className="h-4 w-4 text-muted-foreground" />,
  in_progress: <Clock className="h-4 w-4 text-blue-500" />,
  done: <Check className="h-4 w-4 text-green-500" />,
  blocked: <AlertTriangle className="h-4 w-4 text-red-500" />,
};

const priorityColors: Record<string, string> = {
  low: "text-muted-foreground",
  medium: "text-foreground",
  high: "text-amber-400",
  urgent: "text-red-500",
};

const categoryConfig: Record<string, { color: string; label: string; emoji: string }> = {
  marketing: { color: "bg-purple-500/10 text-purple-400 border-purple-500/20", label: "Marketing", emoji: "📣" },
  content: { color: "bg-pink-500/10 text-pink-400 border-pink-500/20", label: "Content", emoji: "📸" },
  logistics: { color: "bg-blue-500/10 text-blue-400 border-blue-500/20", label: "Logistics", emoji: "🔧" },
  talent: { color: "bg-orange-500/10 text-orange-400 border-orange-500/20", label: "Talent", emoji: "🎤" },
  finance: { color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", label: "Finance", emoji: "💰" },
  production: { color: "bg-amber-500/10 text-amber-400 border-amber-500/20", label: "Production", emoji: "🎛️" },
  general: { color: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20", label: "General", emoji: "📋" },
};

const platformEmoji: Record<string, string> = {
  instagram: "📸",
  email: "📧",
  story: "📱",
  all: "📢",
};

type Task = Record<string, unknown>;
type Activity = Record<string, unknown>;
type Member = { id: string; name: string; role: string };
type Suggestion = { title: string; description: string; category: string; priority: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCategory(task: Task): string {
  return ((task.metadata as Record<string, unknown>)?.category as string) ?? "general";
}

function getDueAt(task: Task): string | null {
  return (task.due_at as string) ?? null;
}

function isOverdue(task: Task): boolean {
  const due = getDueAt(task);
  if (!due || task.status === "done") return false;
  return new Date(due) < new Date();
}

function relativeDue(task: Task): string {
  const due = getDueAt(task);
  if (!due) return "";
  const d = new Date(due);
  const now = new Date();
  const diff = Math.ceil((d.getTime() - now.getTime()) / 86400000);
  if (diff < -1) return `${Math.abs(diff)}d overdue`;
  if (diff === -1) return "Yesterday";
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff <= 7) return `${diff}d`;
  return d.toLocaleDateString("en", { month: "short", day: "numeric" });
}

// ─── Main Component ───────────────────────────────────────────────────────────

function EventTasksPageInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const eventId = params.eventId as string;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"tasks" | "content" | "feed">(() => {
    const tab = searchParams.get("tab");
    return tab === "content" ? "content" : "tasks";
  });

  // New task form
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("general");
  const [newDueDate, setNewDueDate] = useState("");
  const [adding, setAdding] = useState(false);

  // Message
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadAll();
  }, [eventId]);

  async function loadAll() {
    setLoading(true);
    const [t, m, a, s] = await Promise.all([
      getEventTasks(eventId),
      getEventMembers(eventId),
      getEventActivity(eventId),
      getAITaskSuggestions(eventId),
    ]);
    setTasks(t);
    setMembers(m);
    setActivity(a);
    setSuggestions(s);
    setLoading(false);
  }

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    await createEventTask({
      eventId,
      title: newTitle,
      category: newCategory,
      dueDate: newDueDate || undefined,
    });
    setNewTitle("");
    setNewDueDate("");
    setShowNewTask(false);
    await loadAll();
    setAdding(false);
  }

  async function handleStatusChange(taskId: string, newStatus: string) {
    await updateTaskStatus(taskId, newStatus);
    await loadAll();
  }

  async function handleAssign(taskId: string, userId: string | null) {
    await updateTaskDetails(taskId, { assignedTo: userId });
    await loadAll();
  }

  async function handleSetDue(taskId: string, dueDate: string | null) {
    await updateTaskDetails(taskId, { dueAt: dueDate ? new Date(dueDate).toISOString() : null });
    await loadAll();
  }

  async function handleAddSuggestion(suggestion: Suggestion) {
    await createEventTask({
      eventId,
      title: suggestion.title,
      description: suggestion.description,
      category: suggestion.category,
      priority: suggestion.priority,
    });
    await loadAll();
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    await postEventMessage(eventId, message);
    setMessage("");
    const a = await getEventActivity(eventId);
    setActivity(a);
    setSending(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-nocturn/10 animate-pulse-glow">
            <Sparkles className="h-6 w-6 text-nocturn" />
          </div>
          <p className="text-sm text-muted-foreground">Loading tasks...</p>
        </div>
      </div>
    );
  }

  // Filters
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [filterOwner, setFilterOwner] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Split tasks
  const opsTasks = tasks.filter(
    (t) => ((t.metadata as Record<string, unknown>)?.task_type as string) !== "content"
  );
  const contentTasks = tasks.filter(
    (t) => ((t.metadata as Record<string, unknown>)?.task_type as string) === "content"
  );
  const doneTasks = tasks.filter((t) => t.status === "done");
  const progress = tasks.length > 0 ? Math.round((doneTasks.length / tasks.length) * 100) : 0;

  // Priority sort weight — urgent/high first, then overdue, then by due date
  const priorityWeight: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

  function sortTasks(list: Task[]): Task[] {
    return [...list].sort((a, b) => {
      // 1. Incomplete before done
      const aDone = a.status === "done" ? 1 : 0;
      const bDone = b.status === "done" ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;

      // 2. Overdue first
      const aOverdue = isOverdue(a) ? 0 : 1;
      const bOverdue = isOverdue(b) ? 0 : 1;
      if (aOverdue !== bOverdue) return aOverdue - bOverdue;

      // 3. Priority (urgent > high > medium > low)
      const aPri = priorityWeight[(a.priority as string) ?? "medium"] ?? 2;
      const bPri = priorityWeight[(b.priority as string) ?? "medium"] ?? 2;
      if (aPri !== bPri) return aPri - bPri;

      // 4. Due date
      const da = getDueAt(a);
      const db = getDueAt(b);
      if (da && db) {
        const diff = new Date(da).getTime() - new Date(db).getTime();
        return sortDir === "asc" ? diff : -diff;
      }
      if (!da && !db) return 0;
      if (!da) return 1;
      return -1;
    });
  }

  // Apply filters to ops tasks
  const filteredOps = opsTasks.filter((t) => {
    if (filterCategory && getCategory(t) !== filterCategory) return false;
    if (filterOwner && (t.assigned_to as string) !== filterOwner) return false;
    return true;
  });

  // Group filtered ops tasks by category
  const opsCategories = Object.keys(categoryConfig);
  const opsByCategory = filterCategory
    ? [{ category: filterCategory, tasks: sortTasks(filteredOps) }].filter((g) => g.tasks.length > 0)
    : opsCategories
        .map((cat) => ({
          category: cat,
          tasks: sortTasks(filteredOps.filter((t) => getCategory(t) === cat)),
        }))
        .filter((g) => g.tasks.length > 0);

  // Apply filters to content tasks
  const filteredContent = contentTasks.filter((t) => {
    if (filterOwner && (t.assigned_to as string) !== filterOwner) return false;
    return true;
  });
  const contentSorted = sortTasks(filteredContent);

  // Unique owners who have assigned tasks
  const assignedOwners = Array.from(
    new Set(tasks.map((t) => t.assigned_to as string).filter(Boolean))
  ).map((id) => {
    const member = members.find((m) => m.id === id);
    const user = tasks.find((t) => (t.assigned_to as string) === id)?.assigned_user as unknown as { full_name: string; email: string } | null;
    return { id, name: member?.name ?? user?.full_name ?? user?.email ?? "Unknown" };
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/dashboard/events/${eventId}`}>
          <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold font-heading">Event Playbook</h1>
          <p className="text-sm text-muted-foreground">Tasks, content & delegation</p>
        </div>
      </div>

      {/* Progress bar */}
      {tasks.length > 0 && (
        <div className="animate-fade-in-up">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-muted-foreground">{doneTasks.length} of {tasks.length} tasks done</span>
            <span className="font-bold text-nocturn">{progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-nocturn transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        <button
          onClick={() => setActiveTab("tasks")}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors min-h-[44px] ${activeTab === "tasks" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
        >
          <ListChecks className="inline h-4 w-4 mr-1" /> Tasks
        </button>
        <button
          onClick={() => setActiveTab("content")}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors min-h-[44px] ${activeTab === "content" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
        >
          <Image className="inline h-4 w-4 mr-1" /> Content
        </button>
        <button
          onClick={() => setActiveTab("feed")}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors min-h-[44px] ${activeTab === "feed" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
        >
          <MessageSquare className="inline h-4 w-4 mr-1" /> Activity
        </button>
      </div>

      {/* ═══ TASKS TAB ═══ */}
      {activeTab === "tasks" && (
        <div className="space-y-5">
          {/* Filters */}
          <div className="space-y-2">
            {/* Category legend — clickable to filter */}
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(categoryConfig).map(([key, cfg]) => {
                const count = opsTasks.filter((t) => getCategory(t) === key).length;
                if (count === 0) return null;
                const isActive = filterCategory === key;
                return (
                  <button
                    key={key}
                    onClick={() => setFilterCategory(isActive ? null : key)}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all active:scale-95 min-h-[32px] ${
                      isActive
                        ? cfg.color + " ring-1 ring-white/20 shadow-sm"
                        : filterCategory && !isActive
                        ? "opacity-40 " + cfg.color
                        : cfg.color
                    }`}
                  >
                    {cfg.emoji} {cfg.label}
                    <span className="text-[9px] opacity-70">{count}</span>
                  </button>
                );
              })}
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 text-amber-400 px-2 py-0.5 text-[10px] font-medium">
                ⚡ High priority
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-red-500/20 bg-red-500/10 text-red-400 px-2 py-0.5 text-[10px] font-medium">
                🔴 Overdue
              </span>
            </div>

            {/* Owner filter + sort controls */}
            <div className="flex items-center gap-2 flex-wrap">
              {assignedOwners.length > 0 && (
                <select
                  className="rounded-lg border bg-background px-2.5 py-1.5 text-xs min-h-[36px]"
                  value={filterOwner ?? ""}
                  onChange={(e) => setFilterOwner(e.target.value || null)}
                >
                  <option value="">All owners</option>
                  {assignedOwners.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              )}
              <button
                onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
                className="inline-flex items-center gap-1 rounded-lg border bg-background px-2.5 py-1.5 text-xs min-h-[36px] hover:border-white/20 transition-colors"
              >
                <CalendarClock className="h-3 w-3 text-muted-foreground" />
                Due {sortDir === "asc" ? "↑ earliest" : "↓ latest"}
              </button>
              {(filterCategory || filterOwner) && (
                <button
                  onClick={() => { setFilterCategory(null); setFilterOwner(null); }}
                  className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {/* Add Task */}
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="min-h-[44px]" onClick={() => setShowNewTask(!showNewTask)}>
              <Plus className="mr-1 h-3 w-3" /> Add Task
            </Button>
          </div>

          {showNewTask && (
            <form onSubmit={handleCreateTask} className="animate-scale-in rounded-lg border p-3 space-y-3">
              <Input
                placeholder="Task title..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                required
                autoFocus
              />
              <div className="flex gap-2">
                <select
                  className="rounded-md border bg-background px-2 py-1.5 text-sm flex-1"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                >
                  {Object.entries(categoryConfig).map(([key, cfg]) => (
                    <option key={key} value={key}>{cfg.emoji} {cfg.label}</option>
                  ))}
                </select>
                <Input type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} className="flex-1" />
                <Button type="submit" size="sm" className="min-h-[44px] bg-nocturn hover:bg-nocturn-light" disabled={adding}>
                  {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
                </Button>
              </div>
            </form>
          )}

          {/* AI Suggestions */}
          {suggestions.length > 0 && (
            <Card className="border-l-4 border-l-nocturn animate-fade-in-up">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-nocturn animate-text-glow" /> Nocturn Suggests
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {suggestions.map((s, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-nocturn/5 border border-nocturn/10 p-2.5">
                    <div>
                      <p className="text-sm font-medium">{s.title}</p>
                      <p className="text-xs text-muted-foreground">{s.description}</p>
                    </div>
                    <Button size="sm" variant="ghost" className="text-nocturn hover:bg-nocturn/10 shrink-0" onClick={() => handleAddSuggestion(s)}>
                      <Plus className="h-3 w-3 mr-1" /> Add
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Task list grouped by category */}
          {opsTasks.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-4 py-12">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-nocturn/10">
                  <ListChecks className="h-8 w-8 text-nocturn" />
                </div>
                <div className="text-center">
                  <p className="font-medium">No tasks yet</p>
                  <p className="text-sm text-muted-foreground">Add tasks manually or create an event with a playbook.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-5">
              {opsByCategory.map(({ category, tasks: catTasks }) => {
                const cfg = categoryConfig[category] ?? categoryConfig.general;
                const doneCat = catTasks.filter((t) => t.status === "done").length;
                return (
                  <CategoryGroup
                    key={category}
                    config={cfg}
                    tasks={catTasks}
                    doneCount={doneCat}
                    members={members}
                    onStatusChange={handleStatusChange}
                    onAssign={handleAssign}
                    onSetDue={handleSetDue}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ CONTENT TAB ═══ */}
      {activeTab === "content" && (
        <div className="space-y-4">
          {/* Legend for content platforms */}
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-pink-500/20 bg-pink-500/10 text-pink-400 px-2 py-0.5 text-[10px] font-medium">
              📸 Instagram Feed
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/20 bg-violet-500/10 text-violet-400 px-2 py-0.5 text-[10px] font-medium">
              📱 IG Story
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/20 bg-blue-500/10 text-blue-400 px-2 py-0.5 text-[10px] font-medium">
              📧 Email
            </span>
          </div>

          {contentSorted.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-4 py-12">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-nocturn/10">
                  <Image className="h-8 w-8 text-nocturn" />
                </div>
                <div className="text-center">
                  <p className="font-medium">No content plan yet</p>
                  <p className="text-sm text-muted-foreground">Create an event with a playbook to generate your promo schedule.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {contentSorted.map((task) => (
                <ContentTaskCard
                  key={task.id as string}
                  task={task}
                  members={members}
                  onStatusChange={handleStatusChange}
                  onAssign={handleAssign}
                  onSetDue={handleSetDue}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ ACTIVITY TAB ═══ */}
      {activeTab === "feed" && (
        <div className="space-y-4">
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <Input placeholder="Post an update..." value={message} onChange={(e) => setMessage(e.target.value)} className="flex-1" />
            <Button type="submit" size="icon" className="bg-nocturn hover:bg-nocturn-light shrink-0" disabled={sending || !message.trim()}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>

          {activity.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-4 py-12">
                <MessageSquare className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No activity yet. Post the first update!</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {activity.map((item) => {
                const user = item.users as unknown as { full_name: string; email: string } | null;
                const isSystem = (item.action as string) === "system" || (item.action as string) === "task_update";
                return (
                  <div key={item.id as string} className={`flex gap-3 animate-fade-in-up ${isSystem ? "opacity-70" : ""}`}>
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${isSystem ? "bg-muted text-muted-foreground" : "bg-nocturn text-white"}`}>
                      {isSystem ? "⚡" : (user?.full_name?.[0] ?? "?").toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{isSystem ? "Nocturn" : user?.full_name ?? user?.email ?? "Unknown"}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(item.created_at as string).toLocaleString("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{String(item.description)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function EventTasksPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-nocturn/10 animate-pulse-glow">
              <Sparkles className="h-6 w-6 text-nocturn" />
            </div>
            <p className="text-sm text-muted-foreground">Loading tasks...</p>
          </div>
        </div>
      }
    >
      <EventTasksPageInner />
    </Suspense>
  );
}

// ─── Category Group ───────────────────────────────────────────────────────────

function CategoryGroup({
  config,
  tasks,
  doneCount,
  members,
  onStatusChange,
  onAssign,
  onSetDue,
}: {
  config: { color: string; label: string; emoji: string };
  tasks: Task[];
  doneCount: number;
  members: Member[];
  onStatusChange: (taskId: string, status: string) => void;
  onAssign: (taskId: string, userId: string | null) => void;
  onSetDue: (taskId: string, dueDate: string | null) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 text-sm font-semibold mb-2 hover:text-foreground transition-colors w-full"
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        <span className="text-base">{config.emoji}</span>
        <span>{config.label}</span>
        <span className="text-xs font-normal text-muted-foreground">
          {doneCount}/{tasks.length}
        </span>
        <div className="flex-1 h-1 rounded-full bg-muted ml-2 overflow-hidden">
          <div
            className="h-full rounded-full bg-nocturn transition-all duration-300"
            style={{ width: tasks.length > 0 ? `${(doneCount / tasks.length) * 100}%` : "0%" }}
          />
        </div>
      </button>
      {!collapsed && (
        <div className="space-y-1.5 ml-1">
          {tasks.map((task) => (
            <TaskCard
              key={task.id as string}
              task={task}
              members={members}
              onStatusChange={onStatusChange}
              onAssign={onAssign}
              onSetDue={onSetDue}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Task Card (with inline assign + due date) ───────────────────────────────

function TaskCard({
  task,
  members,
  onStatusChange,
  onAssign,
  onSetDue,
}: {
  task: Task;
  members: Member[];
  onStatusChange: (taskId: string, status: string) => void;
  onAssign: (taskId: string, userId: string | null) => void;
  onSetDue: (taskId: string, dueDate: string | null) => void;
}) {
  const [showActions, setShowActions] = useState(false);
  const isDone = task.status === "done";
  const nextStatus = task.status === "todo" ? "in_progress" : task.status === "in_progress" ? "done" : "todo";
  const assignee = task.assigned_user as unknown as { full_name: string; email: string } | null;
  const overdue = isOverdue(task);
  const dueLabel = relativeDue(task);

  return (
    <div
      className={`rounded-lg border p-3 transition-all duration-200 hover:border-nocturn/20 ${isDone ? "opacity-50" : ""} ${overdue ? "border-red-500/30 bg-red-500/5" : ""}`}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={() => onStatusChange(task.id as string, nextStatus)}
          className="shrink-0 mt-0.5 min-w-[20px] min-h-[20px]"
        >
          {statusIcons[task.status as string]}
        </button>
        <div className="flex-1 min-w-0" onClick={() => setShowActions(!showActions)}>
          <p className={`text-sm font-medium cursor-pointer ${isDone ? "line-through text-muted-foreground" : priorityColors[task.priority as string] ?? ""}`}>
            {String(task.title)}
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {dueLabel && (
              <span className={`text-[10px] font-medium ${overdue ? "text-red-400" : "text-muted-foreground"}`}>
                {overdue ? "🔴 " : ""}{dueLabel}
              </span>
            )}
            {assignee && (
              <span className="text-[10px] text-muted-foreground">
                → {assignee.full_name ?? assignee.email}
              </span>
            )}
            {typeof task.description === "string" && task.description && (
              <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">{task.description}</span>
            )}
          </div>
        </div>
      </div>

      {/* Inline actions — assign + due date */}
      {showActions && !isDone && (
        <div className="mt-2 pt-2 border-t border-white/5 flex flex-wrap gap-2 animate-fade-in-up">
          <div className="flex items-center gap-1.5">
            <UserPlus className="h-3 w-3 text-muted-foreground" />
            <select
              className="rounded-md border bg-background px-2 py-1 text-xs min-h-[32px]"
              value={(task.assigned_to as string) ?? ""}
              onChange={(e) => onAssign(task.id as string, e.target.value || null)}
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <CalendarClock className="h-3 w-3 text-muted-foreground" />
            <input
              type="date"
              className="rounded-md border bg-background px-2 py-1 text-xs min-h-[32px]"
              value={getDueAt(task) ? new Date(getDueAt(task)!).toISOString().slice(0, 10) : ""}
              onChange={(e) => onSetDue(task.id as string, e.target.value || null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Content Task Card ────────────────────────────────────────────────────────

function ContentTaskCard({
  task,
  members,
  onStatusChange,
  onAssign,
  onSetDue,
}: {
  task: Task;
  members: Member[];
  onStatusChange: (taskId: string, status: string) => void;
  onAssign: (taskId: string, userId: string | null) => void;
  onSetDue: (taskId: string, dueDate: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showActions, setShowActions] = useState(false);

  const meta = (task.metadata as Record<string, unknown>) ?? {};
  const platform = (meta.platform as string) ?? "";
  const phase = (meta.phase as string) ?? "";
  const caption = (meta.caption as string) ?? "";
  const hashtags = (meta.hashtags as string[]) ?? [];
  const tip = (meta.tip as string) ?? "";
  const isDone = task.status === "done";
  const overdue = isOverdue(task);
  const dueLabel = relativeDue(task);
  const assignee = task.assigned_user as unknown as { full_name: string; email: string } | null;

  const emoji = platformEmoji[platform.toLowerCase()] ?? "📸";

  const platformColor: Record<string, string> = {
    instagram: "border-pink-500/20",
    story: "border-violet-500/20",
    email: "border-blue-500/20",
  };

  async function handleCopyCaption() {
    await navigator.clipboard.writeText(caption);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={`rounded-lg border p-3 space-y-2 transition-all duration-200 ${isDone ? "opacity-50" : ""} ${overdue ? "border-red-500/30 bg-red-500/5" : platformColor[platform.toLowerCase()] ?? ""}`}>
      {/* Top row */}
      <div className="flex items-start gap-3">
        <span className="text-lg shrink-0 mt-0.5">{emoji}</span>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setShowActions(!showActions)}>
          <p className={`text-sm font-medium ${isDone ? "line-through text-muted-foreground" : ""}`}>
            {String(task.title)}
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="rounded-full bg-white/5 border border-white/10 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {phase}
            </span>
            {dueLabel && (
              <span className={`text-[10px] font-medium ${overdue ? "text-red-400" : "text-muted-foreground"}`}>
                {overdue ? "🔴 " : ""}{dueLabel}
              </span>
            )}
            {assignee && (
              <span className="text-[10px] text-muted-foreground">→ {assignee.full_name ?? assignee.email}</span>
            )}
          </div>
        </div>
        <Button
          size="sm"
          variant={isDone ? "default" : "outline"}
          className={`min-h-[44px] min-w-[44px] shrink-0 ${isDone ? "bg-green-600 hover:bg-green-700 text-white" : ""}`}
          onClick={() => onStatusChange(task.id as string, isDone ? "todo" : "done")}
        >
          {isDone ? <><Check className="h-3 w-3 mr-1" /> Posted</> : <Circle className="h-3 w-3" />}
        </Button>
      </div>

      {/* Assign + due date actions */}
      {showActions && !isDone && (
        <div className="flex flex-wrap gap-2 animate-fade-in-up">
          <div className="flex items-center gap-1.5">
            <UserPlus className="h-3 w-3 text-muted-foreground" />
            <select
              className="rounded-md border bg-background px-2 py-1 text-xs min-h-[32px]"
              value={(task.assigned_to as string) ?? ""}
              onChange={(e) => onAssign(task.id as string, e.target.value || null)}
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <CalendarClock className="h-3 w-3 text-muted-foreground" />
            <input
              type="date"
              className="rounded-md border bg-background px-2 py-1 text-xs min-h-[32px]"
              value={getDueAt(task) ? new Date(getDueAt(task)!).toISOString().slice(0, 10) : ""}
              onChange={(e) => onSetDue(task.id as string, e.target.value || null)}
            />
          </div>
        </div>
      )}

      {/* Caption */}
      {caption && (
        <div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors min-h-[36px]"
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Caption
          </button>
          {expanded ? (
            <div className="mt-1 space-y-2">
              <p className="text-sm text-foreground whitespace-pre-wrap">{caption}</p>
              <Button size="sm" variant="ghost" className="text-xs text-muted-foreground hover:text-foreground min-h-[36px]" onClick={handleCopyCaption}>
                <Copy className="h-3 w-3 mr-1" />
                {copied ? "Copied!" : "Copy caption"}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{caption}</p>
          )}
        </div>
      )}

      {/* Hashtags */}
      {hashtags.length > 0 && expanded && (
        <div className="flex flex-wrap gap-1">
          {hashtags.map((tag, i) => (
            <span key={i} className="rounded-full bg-nocturn/10 text-nocturn px-2 py-0.5 text-[10px] font-medium">
              {tag.startsWith("#") ? tag : `#${tag}`}
            </span>
          ))}
        </div>
      )}

      {/* Pro tip */}
      {tip && expanded && (
        <div className="rounded-md bg-muted/50 border border-border px-3 py-2">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Pro tip:</span> {tip}
          </p>
        </div>
      )}
    </div>
  );
}
