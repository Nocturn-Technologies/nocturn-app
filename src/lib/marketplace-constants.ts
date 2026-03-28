// Marketplace constants — shared between server actions and client components

export const GENRE_OPTIONS = [
  "tech-house",
  "house",
  "minimal",
  "afro-house",
  "deep-house",
  "melodic-techno",
  "hard-techno",
  "drum-and-bass",
  "dubstep",
  "garage",
  "disco",
  "amapiano",
  "hip-hop",
  "r-and-b",
  "latin",
  "open-format",
  "multi-genre",
] as const;

export const SERVICES_BY_TYPE: Record<string, string[]> = {
  artist: ["dj-set", "live-pa", "b2b", "production", "vocalist"],
  photographer: ["event-photo", "portrait", "bts", "drone", "content-creation"],
  videographer: [
    "event-recap",
    "aftermovie",
    "drone",
    "livestream",
    "content-creation",
  ],
  sound_production: [
    "pa-system",
    "sound-engineer",
    "dj-equipment",
    "monitors",
  ],
  lighting_production: [
    "stage-lighting",
    "lasers",
    "led-walls",
    "visuals-vj",
    "haze-fog",
  ],
  sponsor: ["beverage", "apparel", "tech", "media", "lifestyle"],
};

export const TYPE_LABELS: Record<string, string> = {
  artist: "DJ / Artist",
  venue: "Venue",
  collective: "Collective",
  promoter: "Promoter",
  photographer: "Photographer",
  videographer: "Videographer",
  sound_production: "Sound & Production",
  lighting_production: "Lighting & Visuals",
  sponsor: "Sponsor / Brand",
};

/** Short labels for compact UI (cards, chips) */
export const TYPE_LABELS_SHORT: Record<string, string> = {
  artist: "DJ / Artist",
  venue: "Venue",
  collective: "Collective",
  promoter: "Promoter",
  photographer: "Photo",
  videographer: "Video",
  sound_production: "Sound",
  lighting_production: "Lighting",
  sponsor: "Sponsor",
};

export const TYPE_BADGE_COLORS: Record<string, string> = {
  artist: "bg-nocturn/10 text-nocturn",
  venue: "bg-emerald-500/10 text-emerald-400",
  collective: "bg-blue-500/10 text-blue-400",
  promoter: "bg-amber-500/10 text-amber-400",
  photographer: "bg-pink-500/10 text-pink-400",
  videographer: "bg-red-500/10 text-red-400",
  sound_production: "bg-cyan-500/10 text-cyan-400",
  lighting_production: "bg-yellow-500/10 text-yellow-400",
  sponsor: "bg-green-500/10 text-green-400",
};
