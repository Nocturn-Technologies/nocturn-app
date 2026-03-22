"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createCollective } from "@/app/actions/auth";
import { generateOnboardingSuggestions } from "@/app/actions/ai-onboarding";
import { useTypewriter } from "@/lib/typewriter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Check, ArrowRight } from "lucide-react";
import { NocturnLogo } from "@/components/nocturn-logo";

type Step = "welcome" | "name" | "city" | "thinking" | "suggestions" | "creating" | "done";

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function AiBubble({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-start gap-3 animate-fade-in-up ${className}`}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-nocturn/20 animate-pulse-glow">
        <Sparkles className="h-4 w-4 text-nocturn" />
      </div>
      <div className="rounded-2xl rounded-tl-sm bg-card border border-border px-4 py-3 max-w-md">
        {children}
      </div>
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex items-start gap-3 animate-fade-in-up">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-nocturn/20 animate-pulse-glow">
        <Sparkles className="h-4 w-4 text-nocturn" />
      </div>
      <div className="rounded-2xl rounded-tl-sm bg-card border border-border px-5 py-4">
        <div className="flex gap-1.5">
          <div className="thinking-dot" />
          <div className="thinking-dot" />
          <div className="thinking-dot" />
        </div>
      </div>
    </div>
  );
}

function TypewriterBubble({ text, onComplete }: { text: string; onComplete?: () => void }) {
  const { displayedText, isComplete } = useTypewriter(text, 25);

  useEffect(() => {
    if (isComplete && onComplete) onComplete();
  }, [isComplete, onComplete]);

  return (
    <AiBubble>
      <p className="text-sm leading-relaxed">
        {displayedText}
        {!isComplete && <span className="inline-block w-0.5 h-4 bg-nocturn ml-0.5 animate-pulse" />}
      </p>
    </AiBubble>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("welcome");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [city, setCity] = useState("");
  const [bio, setBio] = useState("");
  const [instagramCaption, setInstagramCaption] = useState("");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [instagram, setInstagram] = useState("");
  const [showExtras, setShowExtras] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [welcomeDone, setWelcomeDone] = useState(false);

  // Auto-advance from welcome
  useEffect(() => {
    if (step === "welcome" && welcomeDone) {
      const timer = setTimeout(() => setStep("name"), 1500);
      return () => clearTimeout(timer);
    }
  }, [step, welcomeDone]);

  // Call AI when entering thinking step
  useEffect(() => {
    if (step === "thinking") {
      generateOnboardingSuggestions(name, city).then((result) => {
        setBio(result.bio);
        setInstagramCaption(result.instagramCaption);
        setWelcomeMessage(result.welcomeMessage);
        // Minimum 2s for the thinking feel
        setTimeout(() => setStep("suggestions"), 2000);
      });
    }
  }, [step, name, city]);

  async function handleCreate() {
    setStep("creating");
    setError(null);

    const result = await createCollective({
      name,
      slug,
      description: bio || null,
      city,
      instagram: instagram || null,
      website: null,
    });

    if (result.error) {
      setError(result.error);
      setStep("suggestions");
      return;
    }

    setStep("done");
    setTimeout(() => {
      router.push("/dashboard");
      router.refresh();
    }, 2000);
  }

  function handleNameChange(value: string) {
    setName(value);
    setSlug(slugify(value));
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-lg space-y-6">

        {/* Logo */}
        <div className="flex justify-center animate-fade-in-up">
          <NocturnLogo size="md" />
        </div>

        {/* Chat area */}
        <div className="space-y-4 min-h-[400px]">

          {/* Step: Welcome */}
          {step === "welcome" && (
            <TypewriterBubble
              text="Hey! I'm Nocturn — your AI-powered nightlife operating system. Let's set up your collective in under a minute. ✨"
              onComplete={() => setWelcomeDone(true)}
            />
          )}

          {/* Step: Name */}
          {step === "name" && (
            <>
              <AiBubble>
                <p className="text-sm">What&apos;s your collective called?</p>
              </AiBubble>
              <div className="ml-11 animate-fade-in-up delay-200 space-y-3">
                <Input
                  placeholder="e.g. Midnight Society"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="text-base"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && name.trim()) setStep("city");
                  }}
                />
                {slug && (
                  <p className="text-xs text-muted-foreground animate-fade-in-up">
                    nocturn.app/<span className="text-nocturn">{slug}</span>
                  </p>
                )}
                <Button
                  onClick={() => setStep("city")}
                  disabled={!name.trim()}
                  className="bg-nocturn hover:bg-nocturn-light"
                  size="sm"
                >
                  Continue
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </div>
            </>
          )}

          {/* Step: City */}
          {step === "city" && (
            <>
              <AiBubble>
                <p className="text-sm">
                  Nice — <span className="font-medium text-nocturn">{name}</span>! Where are you based?
                </p>
              </AiBubble>
              <div className="ml-11 animate-fade-in-up delay-200 space-y-3">
                <Input
                  placeholder="e.g. Toronto"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="text-base"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && city.trim()) setStep("thinking");
                  }}
                />
                <Button
                  onClick={() => setStep("thinking")}
                  disabled={!city.trim()}
                  className="bg-nocturn hover:bg-nocturn-light"
                  size="sm"
                >
                  Continue
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </div>
            </>
          )}

          {/* Step: Thinking */}
          {step === "thinking" && (
            <>
              <AiBubble>
                <p className="text-sm">
                  Setting up <span className="font-medium text-nocturn">{name}</span> in {city}...
                </p>
              </AiBubble>
              <ThinkingDots />
            </>
          )}

          {/* Step: Suggestions */}
          {step === "suggestions" && (
            <>
              {welcomeMessage && (
                <AiBubble>
                  <p className="text-sm font-medium">{welcomeMessage}</p>
                </AiBubble>
              )}

              <AiBubble className="delay-200">
                <p className="text-sm text-muted-foreground mb-1">Here&apos;s a bio I wrote for you:</p>
              </AiBubble>

              <div className="ml-11 animate-scale-in delay-300">
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full rounded-xl border bg-card px-4 py-3 text-sm leading-relaxed resize-none focus:border-nocturn focus:ring-1 focus:ring-nocturn"
                  rows={2}
                />
              </div>

              <AiBubble className="delay-400">
                <p className="text-sm text-muted-foreground mb-2">And a launch caption for Instagram:</p>
                <div className="rounded-lg bg-nocturn/5 border border-nocturn/20 p-3 text-sm whitespace-pre-line">
                  {instagramCaption}
                </div>
              </AiBubble>

              {/* Optional extras */}
              <div className="ml-11 space-y-3 animate-fade-in-up delay-500">
                {!showExtras ? (
                  <button
                    onClick={() => setShowExtras(true)}
                    className="text-xs text-nocturn hover:underline"
                  >
                    + Add Instagram handle
                  </button>
                ) : (
                  <div className="animate-fade-in-up space-y-2">
                    <Input
                      placeholder="@yourcollective"
                      value={instagram}
                      onChange={(e) => setInstagram(e.target.value)}
                      className="text-sm"
                    />
                  </div>
                )}

                {error && (
                  <p className="text-sm text-destructive animate-fade-in-up">{error}</p>
                )}

                <Button
                  onClick={handleCreate}
                  className="w-full bg-nocturn hover:bg-nocturn-light py-5 text-base"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Launch {name}
                </Button>
              </div>
            </>
          )}

          {/* Step: Creating */}
          {step === "creating" && (
            <AiBubble>
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-nocturn border-t-transparent" />
                <p className="text-sm">Setting up your collective...</p>
              </div>
            </AiBubble>
          )}

          {/* Step: Done */}
          {step === "done" && (
            <div className="flex flex-col items-center gap-4 py-12 animate-scale-in">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 animate-pulse-glow" style={{ animationDuration: "1.5s" }}>
                <Check className="h-8 w-8 text-green-500" />
              </div>
              <div className="text-center">
                <h2 className="text-xl font-bold">You&apos;re all set!</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Taking you to your dashboard...
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
