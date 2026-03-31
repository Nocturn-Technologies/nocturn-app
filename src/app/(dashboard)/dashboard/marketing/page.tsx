import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Instagram, MessageSquare, Mail, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function MarketingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading">Promo</h1>
        <p className="text-sm text-muted-foreground">
          Flyers, social, email — your brand, always on
        </p>
      </div>

      {/* Agent hero card */}
      <Card className="overflow-hidden border-nocturn/20">
        <div className="relative bg-gradient-to-br from-nocturn/20 via-nocturn/10 to-transparent p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-nocturn/20">
              <Sparkles className="h-6 w-6 text-nocturn" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold">Nocturn Promo</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Generate flyers, social posts, and email blasts for your events.
                Pick an event and describe the vibe — Nocturn handles the rest.
              </p>
              <Link href="/dashboard/events" className="mt-4 inline-block">
                <Button className="bg-nocturn hover:bg-nocturn-light">
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate Content
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </Card>

      {/* Channel cards */}
      <h2 className="text-lg font-semibold font-heading">Content Channels</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <ChannelCard
          icon={<Instagram className="h-5 w-5" />}
          title="Instagram"
          description="Captions, stories, reels scripts"
          count={0}
        />
        <ChannelCard
          icon={<MessageSquare className="h-5 w-5" />}
          title="Twitter / X"
          description="Threads, announcements, hype posts"
          count={0}
        />
        <Link href="/dashboard/marketing/email">
          <ChannelCard
            icon={<Mail className="h-5 w-5" />}
            title="Email"
            description="Event announcements, recaps, promos"
            count={0}
          />
        </Link>
        <ChannelCard
          icon={<Sparkles className="h-5 w-5" />}
          title="Press / Bio"
          description="Artist bios, event descriptions, press kits"
          count={0}
        />
      </div>

      {/* Recent generations — empty state */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Generations</CardTitle>
          <CardDescription>Your AI-generated content will appear here</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-2 py-8">
          <Sparkles className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No content generated yet. Create an event first, then generate marketing content.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function ChannelCard({
  icon,
  title,
  description,
  count,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  count: number;
}) {
  return (
    <Card className="transition-colors hover:border-nocturn/30">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-nocturn/10 text-nocturn">
          {icon}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <span className="text-xs text-muted-foreground">{count} posts</span>
      </CardContent>
    </Card>
  );
}
