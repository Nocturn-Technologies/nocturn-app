import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DollarSign, TrendingUp, Receipt, AlertCircle } from "lucide-react";
import Link from "next/link";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";

function createAdminClient() {
  return createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export default async function FinancePage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const admin = createAdminClient();

  // Get user's collectives
  const { data: memberships } = await admin
    .from("collective_members")
    .select("collective_id")
    .eq("user_id", user!.id)
    .is("deleted_at", null);

  const collectiveIds = memberships?.map((m) => m.collective_id) ?? [];

  // Get all settlements
  let settlements: Array<{
    id: string;
    event_id: string;
    status: string;
    gross_revenue: number;
    net_revenue: number;
    profit: number;
    platform_fee: number;
    stripe_fees: number;
    total_artist_fees: number;
    total_expenses: number;
    created_at: string;
    events: { title: string; starts_at: string } | null;
  }> = [];

  if (collectiveIds.length > 0) {
    const { data } = await admin
      .from("settlements")
      .select("*, events(title, starts_at)")
      .in("collective_id", collectiveIds)
      .order("created_at", { ascending: false });
    settlements = (data ?? []) as unknown as typeof settlements;
  }

  // Get completed events without settlements
  let unsettledEvents: Array<{ id: string; title: string; starts_at: string }> = [];

  if (collectiveIds.length > 0) {
    const settledEventIds = settlements.map((s) => s.event_id);
    const { data } = await admin
      .from("events")
      .select("id, title, starts_at")
      .in("collective_id", collectiveIds)
      .eq("status", "completed")
      .order("starts_at", { ascending: false });

    unsettledEvents = ((data ?? []) as typeof unsettledEvents).filter(
      (e) => !settledEventIds.includes(e.id)
    );
  }

  // Summary stats
  const totalRevenue = settlements.reduce((s, r) => s + Number(r.gross_revenue), 0);
  const totalProfit = settlements.reduce((s, r) => s + Number(r.profit), 0);
  const pendingSettlements = settlements.filter((s) => s.status === "draft").length;

  const statusColors: Record<string, string> = {
    draft: "bg-yellow-500/10 text-yellow-500",
    approved: "bg-blue-500/10 text-blue-500",
    paid: "bg-green-500/10 text-green-500",
    disputed: "bg-red-500/10 text-red-500",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Money</h1>
        <p className="text-sm text-muted-foreground">
          Splits, settlements, and P&amp;L — know where every dollar went
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
              <DollarSign className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Revenue</p>
              <p className="text-xl font-bold">${totalRevenue.toFixed(2)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-nocturn/10">
              <TrendingUp className="h-5 w-5 text-nocturn" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Net Profit</p>
              <p className="text-xl font-bold">${totalProfit.toFixed(2)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-500/10">
              <Receipt className="h-5 w-5 text-yellow-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pending</p>
              <p className="text-xl font-bold">{pendingSettlements}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Unsettled events */}
      {unsettledEvents.length > 0 && (
        <Card className="border-yellow-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="h-4 w-4 text-yellow-500" />
              Events Awaiting Settlement
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {unsettledEvents.map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div>
                  <p className="font-medium">{event.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(event.starts_at).toLocaleDateString("en", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <Link href={`/dashboard/finance/${event.id}`}>
                  <Button size="sm" className="bg-nocturn hover:bg-nocturn-light">
                    Generate Settlement
                  </Button>
                </Link>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Settlement history */}
      {settlements.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Settlement History</h2>
          <div className="space-y-2">
            {settlements.map((s) => {
              const event = s.events as unknown as { title: string; starts_at: string } | null;
              return (
                <Link key={s.id} href={`/dashboard/finance/${s.event_id}`}>
                  <Card className="transition-colors hover:border-nocturn/30">
                    <CardContent className="flex items-center justify-between p-4">
                      <div>
                        <p className="font-medium">{event?.title ?? "Unknown Event"}</p>
                        <p className="text-xs text-muted-foreground">
                          {event?.starts_at
                            ? new Date(event.starts_at).toLocaleDateString("en", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })
                            : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="font-bold text-nocturn">
                            ${Number(s.gross_revenue).toFixed(2)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Profit: ${Number(s.profit).toFixed(2)}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                            statusColors[s.status] ?? ""
                          }`}
                        >
                          {s.status}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      ) : (
        unsettledEvents.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-12">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-nocturn/10">
                <DollarSign className="h-8 w-8 text-nocturn" />
              </div>
              <div className="text-center">
                <p className="font-medium">No settlements yet</p>
                <p className="text-sm text-muted-foreground">
                  Settlements are generated after events are marked as completed.
                </p>
              </div>
            </CardContent>
          </Card>
        )
      )}
    </div>
  );
}
