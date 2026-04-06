"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { generateContentPlaybook, type ContentPlaybook, type PlaybookPost, type OpsTask } from "@/app/actions/content-playbook";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Copy,
  Check,
  Instagram,
  Twitter,
  Mail,
  Film,
  Clock,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Hash,
  CheckCircle2,
  Circle,
  AlertTriangle,
} from "lucide-react";

const platformConfig: Record<
  PlaybookPost["platform"],
  { label: string; icon: typeof Instagram; color: string; bg: string }
> = {
  instagram: { label: "Instagram", icon: Instagram, color: "text-pink-400", bg: "bg-pink-400/10" },
  twitter: { label: "Twitter/X", icon: Twitter, color: "text-blue-400", bg: "bg-blue-400/10" },
  email: { label: "Email", icon: Mail, color: "text-green-400", bg: "bg-green-400/10" },
  story: { label: "IG Story", icon: Film, color: "text-amber-400", bg: "bg-amber-400/10" },
  all: { label: "All Platforms", icon: Sparkles, color: "text-nocturn", bg: "bg-nocturn/10" },
};

const phaseEmoji: Record<string, string> = {
  "Plan & Book": "📋",
  "Announce": "📢",
  "Build Hype": "🔥",
  "Urgency": "⚡",
  "Final Push": "🚀",
  "Day-Of": "🌙",
  "Recap": "📸",
};

export default function PlaybookPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const [playbook, setPlaybook] = useState<ContentPlaybook | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedPost, setExpandedPost] = useState<string | null>(null);
  const [filter, setFilter] = useState<PlaybookPost["platform"] | "all">("all");

  useEffect(() => {
    generateContentPlaybook(eventId).then((result) => {
      if (!result.error) setPlaybook(result.playbook);
      setLoading(false);
    });
  }, [eventId]);

  function copyCaption(text: string, id: string) {
    // Strip email formatting for clipboard
    const clean = text.replace(/Subject: .*\n\n/, "");
    navigator.clipboard.writeText(clean);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-nocturn border-t-transparent" />
      </div>
    );
  }

  if (!playbook) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Could not generate playbook for this event.</p>
      </div>
    );
  }

  const allPosts = playbook.phases.flatMap((p) => p.posts);
  const todayPosts = allPosts.filter((p) => p.status === "today");
  const upcomingPosts = allPosts.filter((p) => p.status === "upcoming");
  const filteredPhases = playbook.phases.map((phase) => ({
    ...phase,
    posts: filter === "all" ? phase.posts : phase.posts.filter((p) => p.platform === filter),
  })).filter((p) => p.posts.length > 0 || (p.tasks && p.tasks.length > 0));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-heading">Event Playbook</h1>
        <p className="text-sm text-muted-foreground">
          {playbook.totalPosts} posts + {playbook.totalTasks} ops tasks across {playbook.phases.length} phases
        </p>
      </div>

      {/* Today banner */}
      {todayPosts.length > 0 && (
        <Card className="border-nocturn/30 bg-nocturn/[0.06]">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-2 w-2 rounded-full bg-nocturn animate-pulse" />
              <p className="text-sm font-bold text-nocturn-light">Post Today</p>
            </div>
            <p className="text-xs text-muted-foreground">
              {todayPosts.length} post{todayPosts.length !== 1 ? "s" : ""} scheduled for today —{" "}
              {todayPosts.map((p) => platformConfig[p.platform].label).join(", ")}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xl font-bold text-nocturn">{todayPosts.length}</p>
            <p className="text-[10px] text-muted-foreground">Post Today</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xl font-bold">{upcomingPosts.length}</p>
            <p className="text-[10px] text-muted-foreground">Upcoming</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xl font-bold">{playbook.totalPosts}</p>
            <p className="text-[10px] text-muted-foreground">Total Posts</p>
          </CardContent>
        </Card>
      </div>

      {/* Platform filter */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {(["all", "instagram", "story", "twitter", "email"] as const).map((platform) => {
          const isAll = platform === "all";
          const conf = isAll ? null : platformConfig[platform];
          const count = isAll
            ? allPosts.length
            : allPosts.filter((p) => p.platform === platform).length;

          return (
            <button
              key={platform}
              onClick={() => setFilter(platform)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                filter === platform
                  ? "bg-card border border-border shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {isAll ? "All" : conf?.label ?? "All"}
              <span className="text-[10px] opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Timeline */}
      {filteredPhases.map((phase) => (
        <div key={phase.name}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">{phaseEmoji[phase.name] ?? "📋"}</span>
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              {phase.name}
            </h2>
            <div className="flex-1 h-px bg-border" />
          </div>
          {phase.weekLabel && (
            <p className="text-xs text-muted-foreground mb-3 ml-8">{phase.weekLabel}</p>
          )}

          {/* Ops Tasks */}
          {phase.tasks && phase.tasks.length > 0 && (
            <div className="mb-3 space-y-1.5">
              {phase.tasks.map((task: OpsTask) => (
                <div
                  key={task.id}
                  className={`flex items-start gap-2.5 px-3 py-2 rounded-lg ${
                    task.status === "past" ? "opacity-40" : ""
                  } ${task.status === "today" ? "bg-amber-400/5 border border-amber-400/10" : ""}`}
                >
                  {task.status === "past" ? (
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                  ) : task.priority === "critical" ? (
                    <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{task.task}</p>
                    <p className="text-xs text-muted-foreground">{task.detail}</p>
                  </div>
                  {task.status === "today" && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-400/20 text-amber-400 shrink-0">
                      TODAY
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Content Posts */}
          <div className="space-y-3">
            {phase.posts.map((post) => {
              const conf = platformConfig[post.platform];
              const Icon = conf.icon;
              const isExpanded = expandedPost === post.id;
              const isToday = post.status === "today";

              return (
                <Card
                  key={post.id}
                  className={`transition-all ${
                    isToday ? "border-nocturn/30 bg-nocturn/[0.04]" : ""
                  } ${post.status === "past" ? "opacity-50" : ""}`}
                >
                  <CardContent className="p-4">
                    {/* Header row */}
                    <button
                      className="w-full text-left"
                      onClick={() => setExpandedPost(isExpanded ? null : post.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${conf.bg}`}>
                          <Icon className={`h-4 w-4 ${conf.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{conf.label}</p>
                            {isToday && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-nocturn/20 text-nocturn">
                                TODAY
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>
                              {post.daysBefore > 0
                                ? `${post.daysBefore} days before`
                                : post.daysBefore === 0
                                  ? "Day of event"
                                  : `${Math.abs(post.daysBefore)} days after`}
                            </span>
                            <span>·</span>
                            <span>{new Date(post.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                          </div>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </button>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div className="mt-4 space-y-3">
                        {/* Caption */}
                        <div className="rounded-lg bg-zinc-900/50 p-3">
                          <p className="text-sm whitespace-pre-line leading-relaxed">{post.caption}</p>
                        </div>

                        {/* Hashtags */}
                        {post.hashtags.length > 0 && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <Hash className="h-3 w-3 text-muted-foreground" />
                            {post.hashtags.map((tag) => (
                              <span key={tag} className="text-xs text-nocturn">{tag}</span>
                            ))}
                          </div>
                        )}

                        {/* Pro tip */}
                        <div className="flex items-start gap-2 rounded-lg bg-amber-400/5 border border-amber-400/10 p-3">
                          <Lightbulb className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
                          <p className="text-xs text-amber-400/80">{post.tip}</p>
                        </div>

                        {/* Copy button */}
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => copyCaption(post.caption, post.id)}
                        >
                          {copiedId === post.id ? (
                            <>
                              <Check className="h-3.5 w-3.5 mr-1.5 text-green-400" />
                              Copied to clipboard
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5 mr-1.5" />
                              Copy Caption
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
