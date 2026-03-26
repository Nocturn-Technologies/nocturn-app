"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { getEventReferralStats, type ReferralStats } from "@/app/actions/referrals";
import {
  getAmbassadorConfig,
  saveAmbassadorConfig,
  type AmbassadorConfig,
  type AmbassadorRewardRule,
} from "@/app/actions/ambassador-config";
import { getPostEventInsights, type PostEventInsight } from "@/app/actions/audience";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Users,
  Trophy,
  Gift,
  Share2,
  Copy,
  Check,
  Settings,
  Plus,
  Trash2,
  Save,
  Star,
  Crown,
  UserPlus,
  Zap,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import Link from "next/link";

export default function ReferralsPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [stats, setStats] = useState<ReferralStats[]>([]);
  const [totalReferrals, setTotalReferrals] = useState(0);
  const [loading, setLoading] = useState(true);

  // Ambassador config
  const [config, setConfig] = useState<AmbassadorConfig | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Post-event insights
  const [insights, setInsights] = useState<PostEventInsight[]>([]);
  const [showInsights, setShowInsights] = useState(false);

  useEffect(() => {
    loadAll();
  }, [eventId]);

  async function loadAll() {
    const [statsResult, configResult, insightsResult] = await Promise.all([
      getEventReferralStats(eventId),
      getAmbassadorConfig(eventId),
      getPostEventInsights(eventId),
    ]);

    if (!statsResult.error) {
      setStats(statsResult.stats);
      setTotalReferrals(statsResult.totalReferrals);
    }
    if (!configResult.error) {
      setConfig(configResult.config);
    }
    if (!insightsResult.error) {
      setInsights(insightsResult.insights);
    }
    setLoading(false);
  }

  // ── Config management ──

  function addRule() {
    if (!config) return;
    const newRule: AmbassadorRewardRule = {
      id: `rule-${Date.now()}`,
      threshold: 3,
      rewardType: "free_ticket",
      rewardValue: "Free ticket to the next event",
      active: true,
    };
    setConfig({ ...config, rules: [...config.rules, newRule] });
  }

  function removeRule(ruleId: string) {
    if (!config) return;
    setConfig({
      ...config,
      rules: config.rules.filter((r) => r.id !== ruleId),
    });
  }

  function updateRule(
    ruleId: string,
    updates: Partial<AmbassadorRewardRule>
  ) {
    if (!config) return;
    setConfig({
      ...config,
      rules: config.rules.map((r) =>
        r.id === ruleId ? { ...r, ...updates } : r
      ),
    });
  }

  async function handleSaveConfig() {
    if (!config) return;
    setSaving(true);
    const result = await saveAmbassadorConfig(eventId, config);
    if (result.error) {
      setSaveMessage(`Error: ${result.error}`);
    } else {
      setSaveMessage("Saved!");
    }
    setSaving(false);
    setTimeout(() => setSaveMessage(null), 3000);
  }

  const ambassadors = stats.filter((s) => {
    // Use config threshold if available
    const minThreshold = config?.rules
      .filter((r) => r.active)
      .reduce((min, r) => Math.min(min, r.threshold), Infinity) ?? 5;
    return s.referralCount >= minThreshold;
  });

  const insightsByType = {
    core_fan: insights.filter((i) => i.type === "core_fan"),
    top_referrer: insights.filter((i) => i.type === "top_referrer"),
    repeat_attendee: insights.filter((i) => i.type === "repeat_attendee"),
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-nocturn border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/dashboard/events/${eventId}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Referrals & Ambassadors</h1>
          <p className="text-sm text-muted-foreground">
            Track who's bringing friends — reward your best promoters
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowConfig(!showConfig)}
          className="text-xs"
        >
          <Settings className="h-3 w-3 mr-1" />
          Rewards
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-nocturn">{totalReferrals}</p>
            <p className="text-xs text-muted-foreground">Referred Tickets</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-nocturn">{stats.length}</p>
            <p className="text-xs text-muted-foreground">Referrers</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-amber-400">{ambassadors.length}</p>
            <p className="text-xs text-muted-foreground">Ambassadors</p>
          </CardContent>
        </Card>
      </div>

      {/* Configurable Rewards Panel */}
      {showConfig && config && (
        <Card className="border-nocturn/30">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Gift className="h-4 w-4 text-nocturn" />
                Reward Rules
              </CardTitle>
              <div className="flex items-center gap-2">
                {saveMessage && (
                  <span
                    className={`text-xs ${
                      saveMessage.startsWith("Error")
                        ? "text-red-400"
                        : "text-green-400"
                    }`}
                  >
                    {saveMessage}
                  </span>
                )}
                <Button
                  size="sm"
                  onClick={handleSaveConfig}
                  disabled={saving}
                  className="text-xs bg-nocturn hover:bg-nocturn-light"
                >
                  <Save className="h-3 w-3 mr-1" />
                  {saving ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Set up automatic rewards for your top referrers. Each attendee
              gets a unique link to share.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {config.rules.map((rule) => (
              <div
                key={rule.id}
                className="flex items-start gap-3 rounded-lg border border-border p-3"
              >
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Bring</span>
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      value={rule.threshold}
                      onChange={(e) =>
                        updateRule(rule.id, {
                          threshold: parseInt(e.target.value) || 1,
                        })
                      }
                      className="w-16 h-7 text-xs text-center"
                    />
                    <span className="text-xs text-muted-foreground">
                      friends, get:
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={rule.rewardType}
                      onChange={(e) =>
                        updateRule(rule.id, {
                          rewardType: e.target.value as AmbassadorRewardRule["rewardType"],
                        })
                      }
                      className="h-7 rounded-md border border-border bg-background px-2 text-xs"
                    >
                      <option value="free_ticket">Free Ticket</option>
                      <option value="discount">Discount</option>
                      <option value="custom">Custom</option>
                    </select>
                    <Input
                      value={rule.rewardValue}
                      onChange={(e) =>
                        updateRule(rule.id, { rewardValue: e.target.value })
                      }
                      placeholder="Describe the reward..."
                      className="h-7 text-xs flex-1"
                    />
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-red-400"
                  onClick={() => removeRule(rule.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}

            <Button
              variant="outline"
              size="sm"
              onClick={addRule}
              className="w-full text-xs"
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Reward Tier
            </Button>
          </CardContent>
        </Card>
      )}

      {/* How it works — updated with config */}
      <Card className="border-nocturn/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Gift className="h-4 w-4 text-nocturn" />
            How Referrals Work
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Every ticket buyer gets a unique referral link. When their friends
            buy tickets using that link:
          </p>
          <div className="grid gap-2 mt-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-nocturn/20 flex items-center justify-center text-[10px] font-bold text-nocturn">
                1
              </div>
              <span>Each referral is tracked to the original buyer</span>
            </div>
            {config?.rules
              .filter((r) => r.active)
              .sort((a, b) => a.threshold - b.threshold)
              .map((rule) => (
                <div key={rule.id} className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-nocturn/20 flex items-center justify-center text-[10px] font-bold text-nocturn">
                    {rule.threshold}
                  </div>
                  <span>
                    At {rule.threshold} referrals:{" "}
                    <strong className="text-green-400">{rule.rewardValue}</strong>
                  </span>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* Post-Event Insights */}
      {insights.length > 0 && (
        <Card className="border-amber-400/20">
          <CardHeader className="pb-2">
            <button
              className="w-full flex items-center justify-between"
              onClick={() => setShowInsights(!showInsights)}
            >
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-400" />
                Post-Event Insights
                <Badge
                  variant="secondary"
                  className="text-[10px] bg-amber-400/10 text-amber-400"
                >
                  {insights.length}
                </Badge>
              </CardTitle>
              {showInsights ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            <p className="text-xs text-muted-foreground">
              Auto-identified repeat attendees, top referrers, and core fans
            </p>
          </CardHeader>
          {showInsights && (
            <CardContent className="space-y-4">
              {/* Core Fans */}
              {insightsByType.core_fan.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Crown className="h-3.5 w-3.5 text-amber-400" />
                    <p className="text-xs font-medium text-amber-400">
                      Core Fans
                    </p>
                  </div>
                  <div className="space-y-1">
                    {insightsByType.core_fan.map((insight) => (
                      <div
                        key={insight.email}
                        className="flex items-center gap-2 rounded-md bg-amber-400/5 px-3 py-2"
                      >
                        <Crown className="h-3 w-3 text-amber-400 shrink-0" />
                        <span className="text-xs font-medium truncate">
                          {insight.name ?? insight.email}
                        </span>
                        <span className="text-[10px] text-muted-foreground ml-auto whitespace-nowrap">
                          {insight.detail}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top Referrers */}
              {insightsByType.top_referrer.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Share2 className="h-3.5 w-3.5 text-nocturn" />
                    <p className="text-xs font-medium text-nocturn">
                      Top Referrers
                    </p>
                  </div>
                  <div className="space-y-1">
                    {insightsByType.top_referrer.map((insight) => (
                      <div
                        key={insight.email}
                        className="flex items-center gap-2 rounded-md bg-nocturn/5 px-3 py-2"
                      >
                        <Trophy className="h-3 w-3 text-nocturn shrink-0" />
                        <span className="text-xs font-medium truncate">
                          {insight.name ?? insight.email}
                        </span>
                        <span className="text-[10px] text-muted-foreground ml-auto whitespace-nowrap">
                          {insight.detail}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Repeat Attendees */}
              {insightsByType.repeat_attendee.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Star className="h-3.5 w-3.5 text-green-400" />
                    <p className="text-xs font-medium text-green-400">
                      Repeat Attendees
                    </p>
                  </div>
                  <div className="space-y-1">
                    {insightsByType.repeat_attendee.slice(0, 10).map((insight) => (
                      <div
                        key={insight.email}
                        className="flex items-center gap-2 rounded-md bg-green-400/5 px-3 py-2"
                      >
                        <UserPlus className="h-3 w-3 text-green-400 shrink-0" />
                        <span className="text-xs font-medium truncate">
                          {insight.name ?? insight.email}
                        </span>
                        <span className="text-[10px] text-muted-foreground ml-auto whitespace-nowrap">
                          {insight.detail}
                        </span>
                      </div>
                    ))}
                    {insightsByType.repeat_attendee.length > 10 && (
                      <p className="text-[10px] text-muted-foreground text-center py-1">
                        + {insightsByType.repeat_attendee.length - 10} more
                      </p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {/* Leaderboard */}
      {stats.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-nocturn/10">
              <Share2 className="h-8 w-8 text-nocturn" />
            </div>
            <div className="text-center">
              <p className="font-medium">No referrals yet</p>
              <p className="text-sm text-muted-foreground">
                When ticket buyers share their referral links and friends
                purchase tickets, they'll show up here.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-400" />
              Referral Leaderboard
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            {stats.map((s, i) => {
              // Find which rewards this person has earned
              const earnedRewards =
                config?.rules
                  .filter((r) => r.active && s.referralCount >= r.threshold)
                  .sort((a, b) => b.threshold - a.threshold) ?? [];

              const nextReward = config?.rules
                .filter((r) => r.active && s.referralCount < r.threshold)
                .sort((a, b) => a.threshold - b.threshold)[0];

              return (
                <div key={s.userId} className="flex items-center gap-3 py-3">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                      i === 0
                        ? "bg-amber-400/20 text-amber-400"
                        : i === 1
                        ? "bg-zinc-400/20 text-zinc-300"
                        : i === 2
                        ? "bg-orange-600/20 text-orange-400"
                        : "bg-zinc-800 text-zinc-500"
                    }`}
                  >
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{s.userName}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.referralCount} referral
                      {s.referralCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                  {earnedRewards.length > 0 ? (
                    <div className="text-right">
                      <span className="text-[10px] font-medium text-amber-400 bg-amber-400/10 px-2 py-1 rounded-full flex items-center gap-1">
                        <Trophy className="h-3 w-3" />
                        {earnedRewards[0].rewardType === "free_ticket"
                          ? "Free Ticket"
                          : earnedRewards[0].rewardType === "discount"
                          ? "Discount"
                          : "Reward"}
                      </span>
                    </div>
                  ) : nextReward ? (
                    <span className="text-[10px] text-zinc-500">
                      {nextReward.threshold - s.referralCount} more for{" "}
                      {nextReward.rewardType === "free_ticket"
                        ? "free ticket"
                        : nextReward.rewardValue.toLowerCase()}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
