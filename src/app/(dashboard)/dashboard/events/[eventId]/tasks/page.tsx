"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
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
} from "lucide-react";
import Link from "next/link";
import {
  getEventTasks,
  getPlaybookTemplates,
  applyPlaybook,
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

type Task = Record<string, unknown>;
type Activity = Record<string, unknown>;
type Suggestion = { title: string; description: string; category: string; priority: string };

export default function EventTasksPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [playbooks, setPlaybooks] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"tasks" | "feed">("tasks");

  // New task form
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("general");
  const [newDueDate, setNewDueDate] = useState("");
  const [adding, setAdding] = useState(false);

  // Message
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  // Playbook
  const [showPlaybooks, setShowPlaybooks] = useState(false);
  const [applyingPlaybook, setApplyingPlaybook] = useState(false);

  useEffect(() => {
    loadAll();
  }, [eventId]);

  async function loadAll() {
    setLoading(true);
    const [t, a, p, s] = await Promise.all([
      getEventTasks(eventId),
      getEventActivity(eventId),
      getPlaybookTemplates(),
      getAITaskSuggestions(eventId),
    ]);
    setTasks(t);
    setActivity(a);
    setPlaybooks(p);
    setSuggestions(s);
    setLoading(false);
  }

  async function handleApplyPlaybook(playbookId: string) {
    setApplyingPlaybook(true);
    await applyPlaybook(eventId, playbookId);
    setShowPlaybooks(false);
    await loadAll();
    setApplyingPlaybook(false);
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/dashboard/events/${eventId}`}>
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Event Playbook</h1>
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
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${activeTab === "tasks" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
        >
          <ListChecks className="inline h-4 w-4 mr-1" /> Tasks
        </button>
        <button
          onClick={() => setActiveTab("feed")}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${activeTab === "feed" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
        >
          <MessageSquare className="inline h-4 w-4 mr-1" /> Activity
        </button>
      </div>

      {activeTab === "tasks" && (
        <div className="space-y-4">
          {/* Actions bar */}
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => setShowNewTask(!showNewTask)}>
              <Plus className="mr-1 h-3 w-3" /> Add Task
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowPlaybooks(!showPlaybooks)}>
              <ListChecks className="mr-1 h-3 w-3" /> Apply Playbook
            </Button>
          </div>

          {/* Playbook selector */}
          {showPlaybooks && (
            <Card className="animate-scale-in border-nocturn/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-nocturn" /> Choose a Playbook
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {playbooks.map((pb) => (
                  <button
                    key={pb.id as string}
                    onClick={() => handleApplyPlaybook(pb.id as string)}
                    disabled={applyingPlaybook}
                    className="w-full flex items-center justify-between rounded-lg border p-3 text-left hover:border-nocturn/30 transition-colors"
                  >
                    <div>
                      <p className="font-medium text-sm">{pb.name as string}</p>
                      <p className="text-xs text-muted-foreground">{pb.description as string}</p>
                    </div>
                    {applyingPlaybook ? (
                      <Loader2 className="h-4 w-4 animate-spin text-nocturn" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                ))}
              </CardContent>
            </Card>
          )}

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
                <Button type="submit" size="sm" className="bg-nocturn hover:bg-nocturn-light" disabled={adding}>
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
                    Apply a playbook to auto-generate tasks, or add them manually.
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
                      {isSystem ? "⚡" : (user?.full_name?.[0] ?? "?").toUpperCase()}
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
                      <p className="text-sm text-muted-foreground">{item.content as string}</p>
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
                    {task.title as string}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${categoryColors[task.category as string] ?? categoryColors.general}`}>
                      {task.category as string}
                    </span>
                    {task.due_date && (
                      <span className="text-[10px] text-muted-foreground">
                        Due {new Date(task.due_date as string).toLocaleDateString("en", { month: "short", day: "numeric" })}
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
