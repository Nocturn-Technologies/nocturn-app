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
import { Users, Music, MapPin, ArrowLeft } from "lucide-react";

type UserType = "collective" | "artist" | "venue";

const USER_TYPES: Array<{ type: UserType; icon: typeof Users; label: string; description: string }> = [
  {
    type: "collective",
    icon: Users,
    label: "Collective / Promoter",
    description: "Run events, sell tickets, manage your crew",
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

    // Route based on user type
    if (userType === "collective") {
      router.push("/onboarding");
    } else if (userType === "artist") {
      router.push("/dashboard/artists/me");
    } else {
      router.push("/dashboard/venues/me");
    }
    router.refresh();
  }

  if (step === "type") {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Join Nocturn</CardTitle>
          <CardDescription>How do you want to use the platform?</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {USER_TYPES.map(({ type, icon: Icon, label, description }) => (
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

  const selectedType = USER_TYPES.find((t) => t.type === userType)!;

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
                "Your full name"
              }
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
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
