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
import { Users, Music, MapPin, ArrowLeft, Megaphone, Camera, Video, Speaker, Lightbulb, BadgeDollarSign, Briefcase, Plane, CalendarCheck, UserCheck, Mic, Palette, Newspaper } from "lucide-react";

type UserType = "collective" | "promoter" | "artist" | "venue" | "photographer" | "videographer" | "sound_production" | "lighting_production" | "sponsor" | "artist_manager" | "tour_manager" | "booking_agent" | "event_staff" | "mc_host" | "graphic_designer" | "pr_publicist";

const USER_TYPES: Array<{ type: UserType; icon: typeof Users; label: string; description: string }> = [
  {
    type: "collective",
    icon: Users,
    label: "Collective",
    description: "Run events, sell tickets, manage your crew",
  },
  {
    type: "promoter",
    icon: Megaphone,
    label: "Promoter",
    description: "Sell tickets, track your sales, grow your network",
  },
  {
    type: "artist",
    icon: Music,
    label: "Artist / DJ",
    description: "Build your profile, get discovered, get booked",
  },
  {
    type: "venue",
    icon: MapPin,
    label: "Venue",
    description: "List your space, manage bookings, connect with promoters",
  },
  {
    type: "artist_manager",
    icon: Briefcase,
    label: "Artist Manager",
    description: "Manage bookings, deals, and career growth for artists",
  },
  {
    type: "tour_manager",
    icon: Plane,
    label: "Tour Manager",
    description: "Handle logistics, travel, and hospitality for touring acts",
  },
  {
    type: "booking_agent",
    icon: CalendarCheck,
    label: "Booking Agent",
    description: "Book talent for venues, clubs, and festivals",
  },
  {
    type: "photographer",
    icon: Camera,
    label: "Photographer",
    description: "Showcase your portfolio and get booked for events",
  },
  {
    type: "videographer",
    icon: Video,
    label: "Videographer",
    description: "Event recaps, aftermovies, and livestreams",
  },
  {
    type: "mc_host",
    icon: Mic,
    label: "MC / Host",
    description: "Emcee events, hype crowds, host shows",
  },
  {
    type: "graphic_designer",
    icon: Palette,
    label: "Graphic Designer",
    description: "Flyers, branding, merch, and social media assets",
  },
  {
    type: "sound_production",
    icon: Speaker,
    label: "Sound & Production",
    description: "PA systems, sound engineering, DJ equipment",
  },
  {
    type: "lighting_production",
    icon: Lightbulb,
    label: "Lighting & Visuals",
    description: "Stage lighting, lasers, LED walls, VJ",
  },
  {
    type: "event_staff",
    icon: UserCheck,
    label: "Event Staff",
    description: "Bartenders, security, door staff, barbacks",
  },
  {
    type: "pr_publicist",
    icon: Newspaper,
    label: "PR / Publicist",
    description: "Press coverage, media outreach, social strategy",
  },
  {
    type: "sponsor",
    icon: BadgeDollarSign,
    label: "Sponsor / Brand",
    description: "Connect with events and collectives for partnerships",
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

    // Route based on user type — collectives and promoters need approval
    if (userType === "collective" || userType === "promoter") {
      router.push("/pending-approval");
    } else {
      router.push("/onboarding/marketplace");
    }
    router.refresh();
  }

  // Split into primary types (full cards) and marketplace types (compact grid)
  const primaryTypes = USER_TYPES.filter((t) =>
    ["collective", "promoter"].includes(t.type)
  );
  const marketplaceTypes = USER_TYPES.filter(
    (t) => !["collective", "promoter"].includes(t.type)
  );

  if (step === "type") {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Join Nocturn</CardTitle>
          <CardDescription>How do you want to use the platform?</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Primary: Collective & Promoter — full-width cards */}
          <div className="space-y-3">
            {primaryTypes.map(({ type, icon: Icon, label, description }) => (
              <button
                key={type}
                onClick={() => {
                  setUserType(type);
                  setStep("form");
                }}
                className={`w-full flex items-center gap-4 rounded-xl border p-4 text-left transition-all hover:border-nocturn/50 hover:bg-nocturn/5 active:scale-[0.98] ${
                  userType === type ? "border-nocturn bg-nocturn/10" : "border-border"
                }`}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-nocturn/20 shrink-0">
                  <Icon className="h-6 w-6 text-nocturn" />
                </div>
                <div>
                  <p className="font-semibold text-white">{label}</p>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground uppercase tracking-wider">
              List yourself on the marketplace
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Marketplace types — compact 2-column grid */}
          <div className="grid grid-cols-2 gap-2">
            {marketplaceTypes.map(({ type, icon: Icon, label }) => (
              <button
                key={type}
                onClick={() => {
                  setUserType(type);
                  setStep("form");
                }}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all hover:border-nocturn/50 hover:bg-nocturn/5 active:scale-[0.98] min-h-[56px] ${
                  userType === type ? "border-nocturn bg-nocturn/10" : "border-border"
                }`}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-nocturn/20 shrink-0">
                  <Icon className="h-4 w-4 text-nocturn" />
                </div>
                <p className="font-medium text-sm text-white leading-tight">{label}</p>
              </button>
            ))}
          </div>
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-nocturn hover:underline">
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
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-white transition-colors mb-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Change type
        </button>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-nocturn/20">
            <selectedType.icon className="h-5 w-5 text-nocturn" />
          </div>
          <div>
            <CardTitle>{selectedType.label}</CardTitle>
            <CardDescription>{selectedType.description}</CardDescription>
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
                "Your full name"
              }
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
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
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              disabled={loading}
            />
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <Button type="submit" className="w-full bg-nocturn hover:bg-nocturn-light" disabled={loading}>
            {loading ? "Creating account..." : "Create account"}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-nocturn hover:underline">
            Sign in
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
