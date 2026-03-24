"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { getEventReferralStats, type ReferralStats } from "@/app/actions/referrals";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Users, Trophy, Gift, Share2, Copy, Check } from "lucide-react";
import Link from "next/link";

export default function ReferralsPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [stats, setStats] = useState<ReferralStats[]>([]);
  const [totalReferrals, setTotalReferrals] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, [eventId]);

  async function loadStats() {
    const result = await getEventReferralStats(eventId);
    if (!result.error) {
      setStats(result.stats);
      setTotalReferrals(result.totalReferrals);
    }
    setLoading(false);
  }

  const ambassadors = stats.filter((s) => s.rewardEarned);
  const totalAmbassadorTickets = ambassadors.reduce((s, a) => s + a.referralCount, 0);

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
        <div>
          <h1 className="text-2xl font-bold">Referrals & Ambassadors</h1>
          <p className="text-sm text-muted-foreground">
            Track who's bringing friends — reward your best promoters
          </p>
        </div>
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
            <p className="text-xs text-muted-foreground">Ambassadors (5+)</p>
          </CardContent>
        </Card>
      </div>

      {/* How it works */}
      <Card className="border-nocturn/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Gift className="h-4 w-4 text-nocturn" />
            How Referrals Work
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>Every ticket buyer gets a unique referral link. When their friends buy tickets using that link:</p>
          <div className="grid gap-2 mt-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-nocturn/20 flex items-center justify-center text-[10px] font-bold text-nocturn">1</div>
              <span>Each referral is tracked to the original buyer</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-nocturn/20 flex items-center justify-center text-[10px] font-bold text-nocturn">5</div>
              <span>At 5 referrals, they become an <strong className="text-amber-400">Ambassador</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-amber-400/20 flex items-center justify-center">
                <Trophy className="h-3 w-3 text-amber-400" />
              </div>
              <span>Ambassadors earn a <strong className="text-green-400">free ticket refund</strong> or 2 tickets to your next event</span>
            </div>
          </div>
        </CardContent>
      </Card>

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
                When ticket buyers share their referral links and friends purchase tickets, they'll show up here.
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
            {stats.map((s, i) => (
              <div key={s.userId} className="flex items-center gap-3 py-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                  i === 0 ? "bg-amber-400/20 text-amber-400" :
                  i === 1 ? "bg-zinc-400/20 text-zinc-300" :
                  i === 2 ? "bg-orange-600/20 text-orange-400" :
                  "bg-zinc-800 text-zinc-500"
                }`}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{s.userName}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.referralCount} referral{s.referralCount !== 1 ? "s" : ""}
                  </p>
                </div>
                {s.rewardEarned ? (
                  <span className="text-[10px] font-medium text-amber-400 bg-amber-400/10 px-2 py-1 rounded-full flex items-center gap-1">
                    <Trophy className="h-3 w-3" />
                    Ambassador
                  </span>
                ) : (
                  <span className="text-[10px] text-zinc-500">
                    {5 - s.referralCount} more to earn reward
                  </span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
