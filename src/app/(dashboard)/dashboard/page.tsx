import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Sparkles, DollarSign, ArrowRight } from "lucide-react";
import Link from "next/link";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("users")
    .select("full_name")
    .eq("id", user!.id)
    .single();

  // Get user's collectives
  const { data: memberships } = await supabase
    .from("collective_members")
    .select("collective_id")
    .eq("user_id", user!.id);

  const collectiveIds = memberships?.map((m) => m.collective_id) ?? [];

  // Fetch upcoming events
  let eventCount = 0;
  if (collectiveIds.length > 0) {
    const { count } = await supabase
      .from("events")
      .select("*", { count: "exact", head: true })
      .in("collective_id", collectiveIds)
      .gte("date", new Date().toISOString());
    eventCount = count ?? 0;
  }

  const firstName = profile?.full_name?.split(" ")[0] ?? "there";
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold">
          {greeting}, {firstName}
        </h1>
        <p className="text-sm text-muted-foreground">
          Here&apos;s what&apos;s happening with your collective.
        </p>
      </div>

      {/* Quick stats — matches prototype */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-card">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-nocturn">{eventCount}</p>
            <p className="text-xs text-muted-foreground">Upcoming</p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">$0</p>
            <p className="text-xs text-muted-foreground">This Month</p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">0</p>
            <p className="text-xs text-muted-foreground">Posts</p>
          </CardContent>
        </Card>
      </div>

      {/* Featured event card — empty state */}
      <Card className="overflow-hidden">
        <div className="relative h-32 bg-gradient-to-br from-nocturn/20 to-nocturn-glow/10">
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">No upcoming events yet</p>
          </div>
        </div>
        <CardContent className="p-4">
          <Link
            href="/dashboard/events"
            className="flex items-center justify-between text-sm font-medium text-nocturn hover:underline"
          >
            Create your first event
            <ArrowRight className="h-4 w-4" />
          </Link>
        </CardContent>
      </Card>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/dashboard/marketing">
          <Card className="transition-colors hover:border-nocturn/30">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-nocturn/10">
                <Sparkles className="h-5 w-5 text-nocturn" />
              </div>
              <div>
                <p className="text-sm font-medium">Marketing</p>
                <p className="text-xs text-muted-foreground">Generate content</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/finance">
          <Card className="transition-colors hover:border-nocturn/30">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-nocturn-teal/10">
                <DollarSign className="h-5 w-5 text-nocturn-teal" />
              </div>
              <div>
                <p className="text-sm font-medium">Finance</p>
                <p className="text-xs text-muted-foreground">View settlements</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Activity feed — empty state */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <div className="flex flex-col items-center gap-2 py-6">
            <Calendar className="h-8 w-8 text-muted-foreground/50" />
            <p>No activity yet. Create an event to get started.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
