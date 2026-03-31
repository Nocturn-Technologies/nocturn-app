// Event templates — pre-built configurations based on vibe/genre selection
// Used during onboarding to pre-fill the event creation card

export type VibeKey = "deep_melodic" | "peak_time" | "underground" | "afro_amapiano" | "experimental" | "open_format";

export interface VibeOption {
  key: VibeKey;
  label: string;
  subgenres: string[];
  emoji: string;
  vibeTags: string[];
  accentColor: string;
}

export interface EventTemplate {
  id: string;
  label: string;
  titlePattern: string;
  description: string;
  vibeTags: string[];
  suggestedTiers: Array<{
    name: string;
    price: number;
  }>;
  defaultDoorTime: string; // e.g. "22:00"
  vibes: VibeKey[]; // which vibe selections surface this template
}

export const VIBE_OPTIONS: VibeOption[] = [
  {
    key: "deep_melodic",
    label: "Deep & Melodic",
    subgenres: ["Deep House", "Melodic Techno", "Progressive", "Organic House"],
    emoji: "🌙",
    vibeTags: ["deep-house", "melodic-techno", "progressive"],
    accentColor: "#7B2FF7",
  },
  {
    key: "peak_time",
    label: "Peak Time",
    subgenres: ["Tech House", "Big Room", "Mainstage", "Festival House"],
    emoji: "🔥",
    vibeTags: ["tech-house", "big-room", "mainstage"],
    accentColor: "#FF6B2C",
  },
  {
    key: "underground",
    label: "Underground",
    subgenres: ["Warehouse Techno", "Minimal", "Raw", "Acid"],
    emoji: "🏠",
    vibeTags: ["techno", "minimal", "warehouse", "acid"],
    accentColor: "#9D5CFF",
  },
  {
    key: "afro_amapiano",
    label: "Afro & Amapiano",
    subgenres: ["Afro House", "Amapiano", "Afrobeats", "Percussive"],
    emoji: "✨",
    vibeTags: ["afro-house", "amapiano", "afrobeats"],
    accentColor: "#F5C542",
  },
  {
    key: "experimental",
    label: "Experimental",
    subgenres: ["Breaks", "Electro", "Left-field Bass", "IDM"],
    emoji: "🎨",
    vibeTags: ["breaks", "electro", "bass", "experimental"],
    accentColor: "#2DD4BF",
  },
  {
    key: "open_format",
    label: "Open Format",
    subgenres: ["House", "Hip Hop", "R&B", "Genre-fluid"],
    emoji: "🎤",
    vibeTags: ["open-format", "house", "hiphop", "rnb"],
    accentColor: "#FB7185",
  },
];

export const EVENT_TEMPLATES: EventTemplate[] = [
  {
    id: "deep_sessions",
    label: "Deep Sessions",
    titlePattern: "{collective}: Deep Sessions",
    description: "An evening of deep, melodic sounds. Warm basslines, lush pads, and hypnotic grooves all night.",
    vibeTags: ["deep-house", "melodic", "groovy"],
    suggestedTiers: [
      { name: "Early Bird", price: 15 },
      { name: "General Admission", price: 25 },
      { name: "At the Door", price: 35 },
    ],
    defaultDoorTime: "22:00",
    vibes: ["deep_melodic", "open_format"],
  },
  {
    id: "techno_warehouse",
    label: "Warehouse Party",
    titlePattern: "{collective} — Location TBA",
    description: "Raw. Dark. Loud. An all-night techno experience in an industrial setting. Location sent day-of.",
    vibeTags: ["techno", "warehouse", "dark"],
    suggestedTiers: [
      { name: "Early Bird", price: 20 },
      { name: "General Admission", price: 30 },
      { name: "At the Door", price: 40 },
    ],
    defaultDoorTime: "23:00",
    vibes: ["underground", "experimental"],
  },
  {
    id: "tech_house_night",
    label: "Tech House Night",
    titlePattern: "{collective} presents: Tech House Night",
    description: "Peak time energy from open to close. Expect driving grooves, big drops, and a packed dance floor.",
    vibeTags: ["tech-house", "energy", "dance"],
    suggestedTiers: [
      { name: "Early Bird", price: 15 },
      { name: "General Admission", price: 25 },
      { name: "At the Door", price: 35 },
    ],
    defaultDoorTime: "22:00",
    vibes: ["peak_time", "underground"],
  },
  {
    id: "rooftop_sessions",
    label: "Rooftop Sessions",
    titlePattern: "{collective} Rooftop Sessions",
    description: "Sunset views, curated sounds, and premium cocktails. An elevated evening above the city.",
    vibeTags: ["rooftop", "sunset", "deep-house"],
    suggestedTiers: [
      { name: "General Admission", price: 30 },
      { name: "VIP Table", price: 75 },
    ],
    defaultDoorTime: "18:00",
    vibes: ["deep_melodic", "afro_amapiano"],
  },
  {
    id: "afro_night",
    label: "Afro Night",
    titlePattern: "{collective} presents: Afro Night",
    description: "Afro house, amapiano, and afrobeats all night. Percussive rhythms, infectious energy, non-stop movement.",
    vibeTags: ["afro-house", "amapiano", "afrobeats"],
    suggestedTiers: [
      { name: "Early Bird", price: 15 },
      { name: "General Admission", price: 25 },
      { name: "VIP", price: 45 },
    ],
    defaultDoorTime: "21:00",
    vibes: ["afro_amapiano", "open_format"],
  },
  {
    id: "day_party",
    label: "Day Party",
    titlePattern: "{collective} Day Party",
    description: "Good music, good people, good weather. The perfect daytime vibe before the sun goes down.",
    vibeTags: ["day-party", "outdoor", "vibes"],
    suggestedTiers: [
      { name: "Early Bird", price: 15 },
      { name: "General Admission", price: 25 },
    ],
    defaultDoorTime: "14:00",
    vibes: ["peak_time", "afro_amapiano", "open_format"],
  },
  {
    id: "breaks_electro",
    label: "Breaks & Electro",
    titlePattern: "{collective}: System Override",
    description: "Breaks, electro, and left-field bass. For the heads who like it weird and heavy.",
    vibeTags: ["breaks", "electro", "bass"],
    suggestedTiers: [
      { name: "Early Bird", price: 15 },
      { name: "General Admission", price: 25 },
    ],
    defaultDoorTime: "22:00",
    vibes: ["experimental", "underground"],
  },
  {
    id: "open_format_night",
    label: "Open Format Night",
    titlePattern: "{collective} presents: All Night Long",
    description: "No rules. House, hip hop, R&B, and everything in between. One DJ, all genres, all vibes.",
    vibeTags: ["open-format", "house", "rnb"],
    suggestedTiers: [
      { name: "Early Bird", price: 20 },
      { name: "General Admission", price: 30 },
      { name: "Bottle Service", price: 100 },
    ],
    defaultDoorTime: "21:00",
    vibes: ["open_format", "peak_time"],
  },
];

// Get templates relevant to a vibe selection
export function getTemplatesForVibe(vibe: VibeKey): EventTemplate[] {
  return EVENT_TEMPLATES.filter((t) => t.vibes.includes(vibe));
}

// Generate a suggested event title from a template + collective name
export function generateEventTitle(template: EventTemplate, collectiveName: string): string {
  return template.titlePattern.replace("{collective}", collectiveName);
}

// Get the next Saturday at a given time
export function getNextSaturday(doorTime: string = "22:00"): Date {
  const now = new Date();
  const daysUntilSat = (6 - now.getDay() + 7) % 7 || 7; // Always at least 1 week out
  const nextSat = new Date(now);
  nextSat.setDate(now.getDate() + daysUntilSat);
  const [hours, minutes] = doorTime.split(":").map(Number);
  nextSat.setHours(hours, minutes, 0, 0);
  return nextSat;
}
