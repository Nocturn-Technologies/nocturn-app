import posthog from "posthog-js";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY || "";
const _POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "";

export function initPostHog() {
  if (typeof window === "undefined") return;
  if (posthog.__loaded) return;
  if (!POSTHOG_KEY) return;

  posthog.init(POSTHOG_KEY, {
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    person_profiles: "identified_only",
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: true,
  });
}

export { posthog };
