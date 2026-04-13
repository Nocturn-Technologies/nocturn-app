"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createCollective } from "@/app/actions/auth";
import { createOnboardingEvent } from "@/app/actions/onboarding-event";
import { checkCollectiveNameAvailability, type NameAvailability } from "@/app/actions/check-collective-name";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NocturnLogo } from "@/components/nocturn-logo";
import { VibePicker } from "@/components/onboarding/vibe-picker";
import { EventCard, createInitialEventData, type EventCardData } from "@/components/onboarding/event-card";
import { ShareScreen } from "@/components/onboarding/share-screen";
import { ArrowRight, ArrowLeft, Sparkles, Check, Loader2 } from "lucide-react";
import { type VibeKey, VIBE_OPTIONS } from "@/lib/event-templates";

type Step = "name_city" | "vibe" | "event" | "creating" | "share";

const STORAGE_KEY = "nocturn_onboarding";

function saveProgress(data: { step: Step; name: string; slug: string; city: string; selectedVibe: VibeKey | null; eventData: EventCardData | null }) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

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
  const [authChecked, setAuthChecked] = useState(false);
  const [isPaidEvent, setIsPaidEvent] = useState(false);

  // Live name availability check (debounced).
  // "idle" = nothing typed yet or just changed; "checking" = request in flight;
  // "available" = unique; "taken" = collision (Continue is blocked).
  const [nameCheck, setNameCheck] = useState<
    | { status: "idle" }
    | { status: "checking" }
    | NameAvailability
  >({ status: "idle" });

  // Restore progress from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.name) setName(data.name);
        if (data.slug) setSlug(data.slug);
        if (data.city) setCity(data.city);
        if (data.selectedVibe) setSelectedVibe(data.selectedVibe);
        if (data.eventData) {
          // Restore date as Date object
          setEventData({ ...data.eventData, date: new Date(data.eventData.date) });
        }
        // Restore to the step they were on (but not "creating" or "share")
        if (data.step && data.step !== "creating" && data.step !== "share") {
          setStep(data.step);
        }
      }
    } catch {}
  }, []);

  // Save progress whenever state changes (but not on terminal steps)
  useEffect(() => {
    if (step === "creating" || step === "share") return;
    saveProgress({ step, name, slug, city, selectedVibe, eventData });
  }, [step, name, slug, city, selectedVibe, eventData]);

  // Auth guard
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login");
      } else {
        setAuthChecked(true);
      }
    });
  }, [supabase, router]);

  function handleNameChange(value: string) {
    setName(value);
    setSlug(slugify(value));
    // Clear any "name taken" error as soon as the user edits the name.
    if (error) setError(null);
    // Reset live-check state — the debounce effect will re-run.
    setNameCheck({ status: "idle" });
  }

  // Debounced live availability check. Fires 400ms after the user stops
  // typing, only when the name is long enough to be worth checking.
  // The submit-time check in createCollective is still the source of truth
  // — this is purely UX so users catch collisions before clicking Continue.
  useEffect(() => {
    if (step !== "name_city") return;
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setNameCheck({ status: "idle" });
      return;
    }

    let cancelled = false;
    setNameCheck({ status: "checking" });

    const timer = setTimeout(async () => {
      try {
        const result = await checkCollectiveNameAvailability(trimmed);
        if (!cancelled) setNameCheck(result);
      } catch {
        if (!cancelled) setNameCheck({ status: "error", reason: "Could not check availability" });
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [name, step]);

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

    // 1. Create collective. If the name is taken, send the user back to
    // Screen 1 with a clear error so they can pick a different name.
    // (Previously this had "idempotency" logic that silently let users
    // join a collective they didn't create if RLS allowed reading it —
    // that's a security smell. Server-side createCollective now does a
    // pre-check + race-safe constraint handling, so we just trust its
    // error and route the user back to fix the name.)
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
      const isNameConflict = result.error.toLowerCase().includes("already taken");
      // Name conflict → back to Screen 1 to edit the name.
      // Anything else → back to wherever they were so they can retry.
      setStep(isNameConflict ? "name_city" : skipEvent ? "vibe" : "event");
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

    // Track if this is a paid event (created as draft, not live)
    if (!skipEvent && eventData && eventData.tierPrice > 0) {
      setIsPaidEvent(true);
    }

    localStorage.removeItem(STORAGE_KEY);
    setStep("share");
  }

  function handleSkipEvent() {
    setSkipEvent(true);
    handleCreate();
  }

  function goToDashboard() {
    localStorage.removeItem(STORAGE_KEY);
    router.push("/dashboard");
    router.refresh();
  }

  const currentStep = step === "name_city" ? 1 : step === "vibe" ? 2 : step === "event" ? 3 : step === "share" ? 3 : 0;
  const totalSteps = 3;

  // Show loading spinner until auth check completes
  if (!authChecked) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-3 border-nocturn border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-8">
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
                <h2 className="text-2xl font-bold font-heading tracking-tight">
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
                    <p className="text-xs text-muted-foreground px-1 flex items-center gap-2">
                      <span>
                        nocturn.app/<span className="text-nocturn font-medium">{slug}</span>
                      </span>
                      {nameCheck.status === "checking" && (
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                      )}
                      {nameCheck.status === "available" && (
                        <span className="flex items-center gap-1 text-emerald-500">
                          <Check className="h-3 w-3" />
                          Available
                        </span>
                      )}
                    </p>
                  )}
                  {nameCheck.status === "taken" && (
                    <p className="text-xs text-destructive px-1 animate-fade-in-up">
                      &ldquo;{nameCheck.conflictingName}&rdquo; is already taken — try a different name
                    </p>
                  )}
                </div>

                <Input
                  placeholder="Where are you based? (e.g. Toronto)"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="text-base h-12"
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      name.trim() &&
                      city.trim() &&
                      nameCheck.status !== "taken" &&
                      nameCheck.status !== "checking"
                    ) {
                      setStep("vibe");
                    }
                  }}
                />

                {error && (
                  <p className="text-sm text-destructive text-center animate-fade-in-up">{error}</p>
                )}

                <Button
                  onClick={() => setStep("vibe")}
                  disabled={
                    !name.trim() ||
                    !city.trim() ||
                    nameCheck.status === "taken" ||
                    nameCheck.status === "checking"
                  }
                  className="w-full bg-nocturn hover:bg-nocturn-light py-5 text-base min-h-[48px]"
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
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-white transition-colors min-h-[44px]"
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
                className="w-full bg-nocturn hover:bg-nocturn-light py-5 text-base min-h-[48px]"
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
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-white transition-colors min-h-[44px]"
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
                className="w-full bg-nocturn hover:bg-nocturn-light py-5 text-base min-h-[48px]"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Create Event
              </Button>

              <button
                onClick={handleSkipEvent}
                className="w-full text-center text-sm text-muted-foreground hover:text-white transition-colors min-h-[44px]"
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
              isPaidEvent={isPaidEvent}
              onDashboard={goToDashboard}
            />
          )}
        </div>
      </div>
    </div>
  );
}
