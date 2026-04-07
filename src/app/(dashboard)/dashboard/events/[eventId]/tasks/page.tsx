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
} from "lucide-react";
import Link from "next/link";
import {
  getEventTasks,
  createEventTask,
  updateTaskStatus,
  postEventMessage,
  getEventActivity,
  getAITaskSuggestions,
} from "@/app/actions/tasks";

const statusIcons: Record<string, React.ReactNode> = {
  todo: <Circle className="h-4 w-4 text-muted-foreground" />,
  in_progress: <Clock className="h-4 w-4 text-blue-500" />,
  done: <Check className="h-4 w-4 text-green-500" />,
  blocked: <AlertTriangle className="h-4 w-4 text-red-500" />,
};

const priorityColors: Record<string, string> = {
  low: "text-muted-foreground",
  medium: "text-foreground",
  high: "text-nocturn-amber",
  urgent: "text-red-500",
};

const categoryColors: Record<string, string> = {
  marketing: "bg-nocturn/10 text-nocturn",
  logistics: "bg-blue-500/10 text-blue-500",
  talent: "bg-nocturn-coral/10 text-nocturn-coral",
  finance: "bg-nocturn-teal/10 text-nocturn-teal",
  production: "bg-nocturn-amber/10 text-nocturn-amber",
  general: "bg-muted text-muted-foreground",
};

const platformEmoji: Record<string, string> = {
  instagram: "\ud83d\udcf8",
  twitter: "\ud83d\udc26",
  x: "\ud83d\udc26",
  email: "\ud83d\udce7",
  ig_story: "\ud83d\udcf1",
  story: "\ud83d\udcf1",
};

const phaseColors: Record<string, string> = {
  hype: "bg-nocturn/10 text-nocturn",
  announce: "bg-blue-500/10 text-blue-500",
  push: "bg-nocturn-amber/10 text-nocturn-amber",
  reminder: "bg-nocturn-coral/10 text-nocturn-coral",
  recap: "bg-nocturn-teal/10 text-nocturn-teal",
};

type Task = Record<string, unknown>;
type Activity = Record<string, unknown>;
type Suggestion = { title: string; description: string; category: string; priority: string };

function EventTasksPageInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const eventId = params.eventId as string;

  const [tasks, setTasks] = useState<Task[]>([]);
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
    const [t, a, s] = await Promise.all([
      getEventTasks(eventId),
      getEventActivity(eventId),
      getAITaskSuggestions(eventId),
    ]);
    setTasks(t);
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

  const todoTasks = tasks.filter((t) => t.status === "todo");
  const inProgressTasks = tasks.filter((t) => t.status === "in_progress");
  const doneTasks = tasks.filter((t) => t.status === "done");
  const progress = tasks.length > 0 ? Math.round((doneTasks.length / tasks.length) * 100) : 0;

  // Content tasks
  const contentTasks = tasks.filter(
    (t) => ((t.metadata as Record<string, unknown>)?.task_type as string) === "content"
  );
  const contentByPhase = contentTasks.reduce<Record<string, Task[]>>((acc, t) => {
    const phase = ((t.metadata as Record<string, unknown>)?.phase as string) ?? "other";
    if (!acc[phase]) acc[phase] = [];
    acc[phase].push(t);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/dashboard/events/${eventId}`}>
          <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold font-heading">Event Playbook</h1>
          <p className="text-sm text-muted-foreground">Tasks, delegation & updates</p>
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
          <ListChecks className="inline h-4 w-4 mr-1" /> All Tasks
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

      {activeTab === "tasks" && (
        <div className="space-y-4">
          {/* Actions bar */}
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="min-h-[44px]" onClick={() => setShowNewTask(!showNewTask)}>
              <Plus className="mr-1 h-3 w-3" /> Add Task
            </Button>
          </div>

          {/* New task form */}
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
                  <option value="general">General</option>
                  <option value="marketing">Marketing</option>
                  <option value="logistics">Logistics</option>
                  <option value="talent">Talent</option>
                  <option value="finance">Finance</option>
                  <option value="production">Production</option>
                </select>
                <Input
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  className="flex-1"
                />
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
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-nocturn hover:bg-nocturn/10 shrink-0"
                      onClick={() => handleAddSuggestion(s)}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Add
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Task list */}
          {tasks.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-4 py-12">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-nocturn/10">
                  <ListChecks className="h-8 w-8 text-nocturn" />
                </div>
                <div className="text-center">
                  <p className="font-medium">No tasks yet</p>
                  <p className="text-sm text-muted-foreground">
                    Add tasks manually or create an event with a playbook to auto-generate them.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* To Do */}
              {todoTasks.length > 0 && (
                <TaskGroup title="To Do" count={todoTasks.length} tasks={todoTasks} onStatusChange={handleStatusChange} />
              )}
              {/* In Progress */}
              {inProgressTasks.length > 0 && (
                <TaskGroup title="In Progress" count={inProgressTasks.length} tasks={inProgressTasks} onStatusChange={handleStatusChange} />
              )}
              {/* Done */}
              {doneTasks.length > 0 && (
                <TaskGroup title="Done" count={doneTasks.length} tasks={doneTasks} onStatusChange={handleStatusChange} defaultCollapsed />
              )}
            </div>
          )}
        </div>
      )}

      {/* Content Tab */}
      {activeTab === "content" && (
        <div className="space-y-4">
          {contentTasks.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-4 py-12">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-nocturn/10">
                  <Image className="h-8 w-8 text-nocturn" />
                </div>
                <div className="text-center">
                  <p className="font-medium">No content plan yet</p>
                  <p className="text-sm text-muted-foreground">
                    Create an event and pick a playbook to generate your promo schedule.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            Object.entries(contentByPhase).map(([phase, phaseTasks]) => (
              <div key={phase} className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground capitalize">{phase} Phase</h3>
                <div className="space-y-2">
                  {phaseTasks.map((task) => (
                    <ContentTaskCard
                      key={task.id as string}
                      task={task}
                      onStatusChange={handleStatusChange}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Activity Feed */}
      {activeTab === "feed" && (
        <div className="space-y-4">
          {/* Message input */}
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <Input
              placeholder="Post an update..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="flex-1"
            />
            <Button
              type="submit"
              size="icon"
              className="bg-nocturn hover:bg-nocturn-light shrink-0"
              disabled={sending || !message.trim()}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>

          {/* Feed */}
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
                const isSystem = item.type === "system" || item.type === "task_update";
                return (
                  <div key={item.id as string} className={`flex gap-3 animate-fade-in-up ${isSystem ? "opacity-70" : ""}`}>
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${isSystem ? "bg-muted text-muted-foreground" : "bg-nocturn text-white"}`}>
                      {isSystem ? "\u26a1" : (user?.full_name?.[0] ?? "?").toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {isSystem ? "Nocturn" : user?.full_name ?? user?.email ?? "Unknown"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(item.created_at as string).toLocaleString("en", {
                            month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{String(item.content)}</p>
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

function ContentTaskCard({
  task,
  onStatusChange,
}: {
  task: Task;
  onStatusChange: (taskId: string, status: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const meta = (task.metadata as Record<string, unknown>) ?? {};
  const platform = (meta.platform as string) ?? "";
  const phase = (meta.phase as string) ?? "";
  const caption = (meta.caption as string) ?? "";
  const hashtags = (meta.hashtags as string[]) ?? [];
  const tip = (meta.tip as string) ?? "";
  const isDone = task.status === "done";

  const emoji = platformEmoji[platform.toLowerCase()] ?? "\ud83d\udcf8";
  const phaseColor = phaseColors[phase.toLowerCase()] ?? "bg-muted text-muted-foreground";

  async function handleCopyCaption() {
    await navigator.clipboard.writeText(caption);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleToggleStatus() {
    onStatusChange(task.id as string, isDone ? "todo" : "done");
  }

  return (
    <Card className={`transition-colors ${isDone ? "opacity-60" : ""}`}>
      <CardContent className="p-3 space-y-2">
        {/* Top row: emoji + title + phase badge + status toggle */}
        <div className="flex items-start gap-3">
          <span className="text-lg shrink-0 mt-0.5">{emoji}</span>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium ${isDone ? "line-through" : ""}`}>
              {String(task.title)}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${phaseColor}`}>
                {phase}
              </span>
              {typeof task.due_date === "string" && task.due_date && (
                <span className="text-[10px] text-muted-foreground">
                  Due {new Date(task.due_date).toLocaleDateString("en", { month: "short", day: "numeric" })}
                </span>
              )}
            </div>
          </div>
          <Button
            size="sm"
            variant={isDone ? "default" : "outline"}
            className={`min-h-[44px] min-w-[44px] shrink-0 ${isDone ? "bg-green-600 hover:bg-green-700 text-white" : ""}`}
            onClick={handleToggleStatus}
          >
            {isDone ? (
              <><Check className="h-3 w-3 mr-1" /> Posted</>
            ) : (
              <Circle className="h-3 w-3" />
            )}
          </Button>
        </div>

        {/* Caption */}
        {caption && (
          <div>
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors min-h-[44px]"
            >
              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Caption
            </button>
            {expanded ? (
              <div className="mt-1 space-y-2">
                <p className="text-sm text-foreground whitespace-pre-wrap">{caption}</p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs text-muted-foreground hover:text-foreground min-h-[44px]"
                  onClick={handleCopyCaption}
                >
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
        {hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {hashtags.map((tag, i) => (
              <span
                key={i}
                className="rounded-full bg-nocturn/10 text-nocturn px-2 py-0.5 text-[10px] font-medium"
              >
                {tag.startsWith("#") ? tag : `#${tag}`}
              </span>
            ))}
          </div>
        )}

        {/* Pro tip */}
        {tip && (
          <div className="rounded-md bg-muted/50 border border-border px-3 py-2">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Pro tip:</span> {tip}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TaskGroup({
  title,
  count,
  tasks,
  onStatusChange,
  defaultCollapsed = false,
}: {
  title: string;
  count: number;
  tasks: Task[];
  onStatusChange: (taskId: string, status: string) => void;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-2 hover:text-foreground transition-colors"
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        {title} <span className="text-xs font-normal">({count})</span>
      </button>
      {!collapsed && (
        <div className="space-y-1.5">
          {tasks.map((task) => {
            const assignee = task.assigned_user as unknown as { full_name: string; email: string } | null;
            const nextStatus = task.status === "todo" ? "in_progress" : task.status === "in_progress" ? "done" : "todo";
            const category = ((task.metadata as Record<string, unknown>)?.category as string) ?? "general";

            return (
              <div
                key={task.id as string}
                className={`flex items-center gap-3 rounded-lg border p-3 transition-colors hover:border-nocturn/20 ${task.status === "done" ? "opacity-60" : ""}`}
              >
                <button onClick={() => onStatusChange(task.id as string, nextStatus)} className="shrink-0">
                  {statusIcons[task.status as string]}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${task.status === "done" ? "line-through" : ""} ${priorityColors[task.priority as string] ?? ""}`}>
                    {String(task.title)}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${categoryColors[category] ?? categoryColors.general}`}>
                      {category}
                    </span>
                    {typeof task.due_date === "string" && task.due_date && (
                      <span className="text-[10px] text-muted-foreground">
                        Due {new Date(task.due_date).toLocaleDateString("en", { month: "short", day: "numeric" })}
                      </span>
                    )}
                    {assignee && (
                      <span className="text-[10px] text-muted-foreground">
                        → {assignee.full_name ?? assignee.email}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
