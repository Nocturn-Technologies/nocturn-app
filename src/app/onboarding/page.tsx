"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createCollective } from "@/app/actions/auth";
import { createOnboardingEvent } from "@/app/actions/onboarding-event";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NocturnLogo } from "@/components/nocturn-logo";
import { VibePicker } from "@/components/onboarding/vibe-picker";
import { EventCard, createInitialEventData, type EventCardData } from "@/components/onboarding/event-card";
import { ShareScreen } from "@/components/onboarding/share-screen";
import { ArrowRight, ArrowLeft, Sparkles } from "lucide-react";
import { type VibeKey, VIBE_OPTIONS } from "@/lib/event-templates";

type Step = "name_city" | "vibe" | "event" | "creating" | "share";

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
  const [step, setStep] = useState<Step>("name_city");

  // Screen 1: Name + City
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [city, setCity] = useState("");

  // Screen 2: Vibe
  const [selectedVibe, setSelectedVibe] = useState<VibeKey | null>(null);

  // Screen 3: Event
  const [eventData, setEventData] = useState<EventCardData | null>(null);
  const [skipEvent, setSkipEvent] = useState(false);

  // Share screen
  const [createdEventSlug, setCreatedEventSlug] = useState("");

  const [error, setError] = useState<string | null>(null);

  // Auth guard
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push("/login");
    });
  }, [supabase, router]);

  function handleNameChange(value: string) {
    setName(value);
    setSlug(slugify(value));
  }

  // When vibe is selected, initialize event data
  function handleVibeSelect(vibe: VibeKey) {
    setSelectedVibe(vibe);
    setEventData(createInitialEventData(vibe, name));
  }

  async function handleCreate() {
    setStep("creating");
    setError(null);

    // Build bio from vibe selection
    const vibeOption = VIBE_OPTIONS.find((v) => v.key === selectedVibe);
    const bio = `${name} — curating ${vibeOption?.label.toLowerCase() ?? "unforgettable"} nights in ${city}.`;

    // 1. Create collective
    const result = await createCollective({
      name,
      slug,
      description: bio,
      city,
      instagram: null,
      website: null,
    });

    if (result.error) {
      setError(result.error);
      setStep(skipEvent ? "vibe" : "event");
      return;
    }

    // 2. Create event (if not skipped)
    if (!skipEvent && eventData) {
      const eventResult = await createOnboardingEvent({
        collectiveSlug: slug,
        title: eventData.title,
        startsAt: eventData.date.toISOString(),
        venue: eventData.venue || null,
        tierName: eventData.tierName,
        tierPrice: eventData.tierPrice,
        vibeTags: vibeOption?.vibeTags ?? [],
      });

      if (eventResult.error) {
        // Non-fatal — collective is created, event creation failed
        console.error("[onboarding] event creation failed:", eventResult.error);
        setCreatedEventSlug("");
      } else {
        setCreatedEventSlug(eventResult.eventSlug ?? "");
      }
    }

    setStep("share");
  }

  function handleSkipEvent() {
    setSkipEvent(true);
    handleCreate();
  }

  function goToDashboard() {
    router.push("/dashboard");
    router.refresh();
  }

  const currentStep = step === "name_city" ? 1 : step === "vibe" ? 2 : step === "event" ? 3 : 0;
  const totalSteps = 3;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-lg space-y-8">
        {/* Logo */}
        <div className="flex justify-center animate-fade-in-up">
          <NocturnLogo size="md" />
        </div>

        {/* Progress bar */}
        {currentStep > 0 && (
          <div className="flex items-center gap-2 animate-fade-in-up">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-all duration-500 ${
                  i < currentStep ? "bg-nocturn" : "bg-border"
                }`}
              />
            ))}
            <span className="text-xs text-muted-foreground ml-1">{currentStep}/{totalSteps}</span>
          </div>
        )}

        {/* Content */}
        <div className="min-h-[420px]">
          {/* Screen 1: Name + City */}
          {step === "name_city" && (
            <div className="space-y-6 animate-fade-in-up">
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold tracking-tight">
                  What&apos;s your collective called?
                </h2>
                <p className="text-sm text-muted-foreground">
                  You can always change this later
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Input
                    placeholder="e.g. Midnight Society"
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    className="text-base h-12"
                    autoFocus
                  />
                  {slug && (
                    <p className="text-xs text-muted-foreground px-1">
                      nocturn.app/<span className="text-nocturn font-medium">{slug}</span>
                    </p>
                  )}
                </div>

                <Input
                  placeholder="Where are you based? (e.g. Toronto)"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="text-base h-12"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && name.trim() && city.trim()) setStep("vibe");
                  }}
                />

                <Button
                  onClick={() => setStep("vibe")}
                  disabled={!name.trim() || !city.trim()}
                  className="w-full bg-nocturn hover:bg-nocturn-light py-5 text-base"
                >
                  Continue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Screen 2: Vibe Picker */}
          {step === "vibe" && (
            <div className="space-y-6">
              <button
                onClick={() => setStep("name_city")}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-white transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </button>

              <VibePicker
                collectiveName={name}
                selected={selectedVibe}
                onSelect={handleVibeSelect}
              />

              <Button
                onClick={() => setStep("event")}
                disabled={!selectedVibe}
                className="w-full bg-nocturn hover:bg-nocturn-light py-5 text-base"
              >
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Screen 3: Event Card */}
          {step === "event" && eventData && (
            <div className="space-y-6">
              <button
                onClick={() => setStep("vibe")}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-white transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </button>

              <EventCard
                collectiveName={name}
                vibe={selectedVibe!}
                data={eventData}
                onChange={setEventData}
              />

              {error && (
                <p className="text-sm text-destructive text-center animate-fade-in-up">{error}</p>
              )}

              <Button
                onClick={() => handleCreate()}
                className="w-full bg-nocturn hover:bg-nocturn-light py-5 text-base"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Create Event
              </Button>

              <button
                onClick={handleSkipEvent}
                className="w-full text-center text-sm text-muted-foreground hover:text-white transition-colors"
              >
                I&apos;ll do this later
              </button>
            </div>
          )}

          {/* Creating state */}
          {step === "creating" && (
            <div className="flex flex-col items-center gap-4 py-16 animate-fade-in-up">
              <div className="h-10 w-10 animate-spin rounded-full border-3 border-nocturn border-t-transparent" />
              <p className="text-sm text-muted-foreground">
                Setting up {name}...
              </p>
            </div>
          )}

          {/* Screen 4: Share */}
          {step === "share" && (
            <ShareScreen
              eventTitle={skipEvent ? name : eventData?.title ?? name}
              collectiveSlug={slug}
              eventSlug={createdEventSlug}
              onDashboard={goToDashboard}
            />
          )}
        </div>
      </div>
    </div>
  );
}
