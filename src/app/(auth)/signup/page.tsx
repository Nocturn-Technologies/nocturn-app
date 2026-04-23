"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signUpUser } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Users,
  Music,
  MapPin,
  ArrowLeft,
  Megaphone,
  Camera,
  Video,
  Speaker,
  Lightbulb,
  BadgeDollarSign,
  Briefcase,
  Plane,
  CalendarCheck,
  UserCheck,
  Mic,
  Palette,
  Newspaper,
  Loader2,
  PartyPopper,
} from "lucide-react";

type UserType =
  | "collective"
  | "host"
  | "promoter"
  | "artist"
  | "venue"
  | "photographer"
  | "videographer"
  | "sound_production"
  | "lighting_production"
  | "sponsor"
  | "artist_manager"
  | "tour_manager"
  | "booking_agent"
  | "event_staff"
  | "mc_host"
  | "graphic_designer"
  | "pr_publicist";

const USER_TYPES: Array<{
  type: UserType;
  icon: typeof Users;
  label: string;
  description: string;
  tagline?: string;
}> = [
  {
    type: "collective",
    icon: Users,
    label: "Collective",
    description: "Run regular nights with a crew. Full platform: tickets, settlement, marketing, team chat, marketplace.",
    tagline: "Most popular",
  },
  {
    type: "host",
    icon: PartyPopper,
    label: "Host",
    description: "Throwing a one-off. Free event, invite friends, collect RSVPs in minutes. No approval needed.",
  },
  {
    type: "promoter",
    icon: Megaphone,
    label: "Promoter",
    description: "Selling tickets under your brand. Grow your audience, track sales, get paid.",
  },
  {
    type: "artist",
    icon: Music,
    label: "Artist / DJ",
    description: "Build your profile, get discovered, get booked.",
  },
  {
    type: "venue",
    icon: MapPin,
    label: "Venue",
    description: "List your space, manage bookings, connect with promoters.",
  },
  {
    type: "artist_manager",
    icon: Briefcase,
    label: "Artist Manager",
    description: "Manage bookings, deals, and career growth for artists.",
  },
  {
    type: "tour_manager",
    icon: Plane,
    label: "Tour Manager",
    description: "Handle logistics, travel, and hospitality for touring acts.",
  },
  {
    type: "booking_agent",
    icon: CalendarCheck,
    label: "Booking Agent",
    description: "Book talent for venues, clubs, and festivals.",
  },
  {
    type: "photographer",
    icon: Camera,
    label: "Photographer",
    description: "Showcase your portfolio and get booked for events.",
  },
  {
    type: "videographer",
    icon: Video,
    label: "Videographer",
    description: "Event recaps, aftermovies, and livestreams.",
  },
  {
    type: "mc_host",
    icon: Mic,
    label: "MC / Host",
    description: "Emcee events, hype crowds, host shows.",
  },
  {
    type: "graphic_designer",
    icon: Palette,
    label: "Graphic Designer",
    description: "Flyers, branding, merch, and social media assets.",
  },
  {
    type: "sound_production",
    icon: Speaker,
    label: "Sound & Production",
    description: "PA systems, sound engineering, DJ equipment.",
  },
  {
    type: "lighting_production",
    icon: Lightbulb,
    label: "Lighting & Visuals",
    description: "Stage lighting, lasers, LED walls, VJ.",
  },
  {
    type: "event_staff",
    icon: UserCheck,
    label: "Event Staff",
    description: "Bartenders, security, door staff, barbacks.",
  },
  {
    type: "pr_publicist",
    icon: Newspaper,
    label: "PR / Publicist",
    description: "Press coverage, media outreach, social strategy.",
  },
  {
    type: "sponsor",
    icon: BadgeDollarSign,
    label: "Sponsor / Brand",
    description: "Connect with events and collectives for partnerships.",
  },
];

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<"type" | "form">("type");
  const [userType, setUserType] = useState<UserType>("collective");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signUpUser({ email, password, fullName, userType });

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    router.push("/pending-approval");
    router.refresh();
  }

  const primaryTypes = USER_TYPES.filter((t) =>
    ["collective", "host", "promoter"].includes(t.type)
  );
  const marketplaceTypes = USER_TYPES.filter(
    (t) => !["collective", "host", "promoter"].includes(t.type)
  );

  if (step === "type") {
    return (
      <Card>
        <CardHeader className="text-center pb-4">
          <CardTitle className="text-xl">Join Nocturn</CardTitle>
          <CardDescription className="text-sm">
            Pick what fits you best — you can add more later.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Primary: Event operators */}
          <div>
            <div className="section-label-mono mb-3 text-[11px]">
              01 / I THROW EVENTS
            </div>
            <div className="space-y-2">
              {primaryTypes.map(({ type, icon: Icon, label, description, tagline }) => (
                <button
                  key={type}
                  onClick={() => {
                    setUserType(type);
                    setStep("form");
                  }}
                  aria-label={`${label} — ${description}`}
                  className="group w-full flex items-start gap-3 rounded-xl border border-border p-3.5 text-left transition-all hover:border-nocturn/40 hover:bg-nocturn/5 active:scale-[0.98] min-h-[56px]"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-nocturn/[0.08] shrink-0 mt-0.5">
                    <Icon className="h-4 w-4 text-nocturn-glow" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-semibold text-sm text-foreground">{label}</p>
                      {tagline && (
                        <span className="text-[11px] font-mono font-medium uppercase tracking-wider text-nocturn-glow bg-nocturn/10 border border-nocturn/20 rounded-full px-2 py-0.5">
                          {tagline}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Marketplace section */}
          <div>
            <div className="section-label-mono mb-2 text-[11px]">
              02 / I WORK AT EVENTS
            </div>
            <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
              List yourself on the Discover marketplace. Get found by collectives, promoters, and venues.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {marketplaceTypes.map(({ type, icon: Icon, label }) => (
                <button
                  key={type}
                  onClick={() => {
                    setUserType(type);
                    setStep("form");
                  }}
                  aria-label={`Sign up as ${label}`}
                  className="flex items-center gap-2.5 rounded-lg border border-border p-2.5 text-left transition-all hover:border-nocturn/40 hover:bg-nocturn/5 active:scale-[0.98] min-h-[44px]"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-nocturn/[0.08] shrink-0">
                    <Icon className="h-3.5 w-3.5 text-nocturn-glow" strokeWidth={1.5} />
                  </div>
                  <p className="font-medium text-xs text-foreground leading-tight truncate">{label}</p>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
        <CardFooter className="justify-center pt-4">
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-nocturn-glow hover:underline">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    );
  }

  const selectedType = USER_TYPES.find((t) => t.type === userType) ?? USER_TYPES[0];

  return (
    <Card>
      <CardHeader>
        <button
          onClick={() => setStep("type")}
          className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors mb-3 min-h-[44px]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Change type
        </button>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-nocturn/[0.08]">
            <selectedType.icon className="h-4 w-4 text-nocturn-glow" strokeWidth={1.5} />
          </div>
          <div>
            <CardTitle className="text-lg">{selectedType.label}</CardTitle>
            <CardDescription className="text-xs leading-relaxed">{selectedType.description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSignup} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">
              {userType === "venue" ? "Venue name" : userType === "artist" ? "Artist / DJ name" : "Full name"}
            </Label>
            <Input
              id="fullName"
              type="text"
              placeholder={
                userType === "venue" ? "e.g. CODA Toronto" :
                userType === "artist" ? "e.g. DJ Shadow" :
                userType === "promoter" ? "Your name" :
                userType === "host" ? "Your name" :
                "Your full name"
              }
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              maxLength={100}
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              disabled={loading}
            />
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <Button type="submit" className="w-full bg-nocturn hover:bg-nocturn-light min-h-[44px]" disabled={loading}>
            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating account...</> : "Create account"}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-nocturn-glow hover:underline">
            Sign in
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
