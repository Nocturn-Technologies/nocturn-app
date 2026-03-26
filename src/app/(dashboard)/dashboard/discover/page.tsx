"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import {
  MapPin,
  Music,
  CalendarRange,
  Users,
  ArrowRight,
  Search,
} from "lucide-react";

const sections = [
  {
    href: "/dashboard/venues",
    label: "Venues",
    description: "Find and save venues in your city",
    icon: MapPin,
    color: "text-nocturn",
    bg: "bg-nocturn/10",
  },
  {
    href: "/dashboard/artists",
    label: "Artists",
    description: "Browse DJs and book talent for your events",
    icon: Music,
    color: "text-amber-400",
    bg: "bg-amber-400/10",
  },
  {
    href: "/dashboard/calendar",
    label: "Calendar",
    description: "Find the best nights to throw — heat map view",
    icon: CalendarRange,
    color: "text-green-400",
    bg: "bg-green-400/10",
  },
  {
    href: "/dashboard/chat",
    label: "Collabs",
    description: "Connect with other collectives in your city",
    icon: Users,
    color: "text-blue-400",
    bg: "bg-blue-400/10",
  },
];

export default function DiscoverPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Discover</h1>
        <p className="text-sm text-muted-foreground">
          Venues, artists, and the best nights to throw
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <Link key={section.href} href={section.href}>
              <Card className="group cursor-pointer transition-all hover:border-white/10 hover:bg-card/80">
                <CardContent className="p-5 flex items-start gap-4">
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${section.bg}`}>
                    <Icon className={`h-5 w-5 ${section.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold">{section.label}</p>
                      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {section.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
