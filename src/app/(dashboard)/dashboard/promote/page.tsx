import { getPromoterDashboard } from "@/app/actions/promoter";
import { getPromoterExternalEvents } from "@/app/actions/external-events";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Ticket, Megaphone, CalendarDays, Link2, MousePointerClick } from "lucide-react";
import { CopyLinkButton } from "./copy-link-button";
import { ExternalEventsSection } from "./external-events-section";

export default async function PromotePage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ stats, myEvents, browseEvents }, externalEvents] = await Promise.all([
    getPromoterDashboard(),
    getPromoterExternalEvents(),
  ]);

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com";
  const totalClicks = externalEvents.reduce((sum, e) => sum + e.clickCount, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading">Promote</h1>
        <p className="text-sm text-muted-foreground">
          Share your link, sell tickets, track everything
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground font-medium">Tickets Sold</span>
              <Ticket className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold">{stats.totalTickets}</p>
            <p className="text-xs text-muted-foreground">via your links</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground font-medium">Events</span>
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold">{stats.totalEvents + externalEvents.length}</p>
            <p className="text-xs text-muted-foreground">promoted</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground font-medium">Link Clicks</span>
              <MousePointerClick className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold">{totalClicks}</p>
            <p className="text-xs text-muted-foreground">external events</p>
          </CardContent>
        </Card>
      </div>

      {/* Your Nocturn Events (with sales) */}
      {myEvents.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-nocturn" />
              Your Nocturn Events
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {myEvents.map((event) => (
              <div key={event.eventId} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{event.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(event.startsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    {" · "}
                    <span className="text-nocturn font-medium">{event.ticketsSold} sold</span>
                  </p>
                </div>
                <CopyLinkButton
                  url={`${APP_URL}/e/${event.collectiveSlug}/${event.eventSlug}`}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* External Events */}
      <ExternalEventsSection initialEvents={externalEvents} appUrl={APP_URL} />

      {/* Browse Nocturn Events */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Link2 className="h-4 w-4 text-nocturn" />
            Find Nocturn Events to Promote
          </CardTitle>
        </CardHeader>
        <CardContent>
          {browseEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No upcoming events right now. Check back soon.
            </p>
          ) : (
            <div className="space-y-2">
              {browseEvents.map((event) => (
                <div key={event.eventId} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{event.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(event.startsAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      {event.venueName && ` · ${event.venueName}`}
                    </p>
                  </div>
                  <CopyLinkButton
                    url={`${APP_URL}/e/${event.collectiveSlug}/${event.eventSlug}`}
                    label="Get Link"
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
