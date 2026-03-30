"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const TORONTO_ARTISTS = [
  {
    name: "deadmau5",
    bio: "Grammy-nominated electronic music producer from Toronto. Known for progressive house and electro house.",
    genre: ["Progressive House", "Electro House", "Techno"],
    instagram: "@deadmau5",
    soundcloud: "https://soundcloud.com/deadmau5",
    spotify: "https://open.spotify.com/artist/2CIMQHirSU0MQqyYHq0eOx",
    booking_email: null,
    default_fee: 50000,
    location: "Toronto, ON",
  },
  {
    name: "Rezz",
    bio: "Ukrainian-Canadian DJ and producer from Niagara Falls. Dark, hypnotic midtempo and electro.",
    genre: ["Midtempo", "Electro", "Bass"],
    instagram: "@officialrezz",
    soundcloud: "https://soundcloud.com/official-rezz",
    spotify: "https://open.spotify.com/artist/2aEOzTXDWJbj9eXjYNsuNV",
    booking_email: null,
    default_fee: 25000,
    location: "Niagara Falls, ON",
  },
  {
    name: "Jayda G",
    bio: "Grammy-nominated DJ and producer. Deep house and disco with a science background.",
    genre: ["Deep House", "Disco", "House"],
    instagram: "@jaydagmusic",
    soundcloud: "https://soundcloud.com/jaydagmusic",
    spotify: "https://open.spotify.com/artist/3tEfJaBqeClrRJVIg4VLHX",
    booking_email: null,
    default_fee: 15000,
    location: "Vancouver / Toronto",
  },
  {
    name: "Hatiras",
    bio: "Toronto house music legend. Juno-nominated producer with decades in the scene.",
    genre: ["House", "Tech House", "Funky House"],
    instagram: "@hatiras",
    soundcloud: "https://soundcloud.com/hatiras",
    spotify: "https://open.spotify.com/artist/0Px2BLPO5IxCBzQMWevmVd",
    booking_email: null,
    default_fee: 3000,
    location: "Toronto, ON",
  },
  {
    name: "Carlo Lio",
    bio: "Toronto-based techno and tech house DJ. Resident at some of Toronto's best underground parties.",
    genre: ["Techno", "Tech House", "Minimal"],
    instagram: "@carlolio",
    soundcloud: "https://soundcloud.com/carlolio",
    spotify: "https://open.spotify.com/artist/6VBp1mHcDmwQWkLXjVcOBb",
    booking_email: null,
    default_fee: 2500,
    location: "Toronto, ON",
  },
  {
    name: "Tiga",
    bio: "Montreal-born DJ and label owner (Turbo Recordings). Electro, techno, and everything in between.",
    genre: ["Electro", "Techno", "Electroclash"],
    instagram: "@tigaofficial",
    soundcloud: "https://soundcloud.com/taborbeats",
    spotify: "https://open.spotify.com/artist/7pjnNJEYWCGP5z5AK11rZt",
    booking_email: null,
    default_fee: 10000,
    location: "Montreal, QC",
  },
  {
    name: "Kresnt",
    bio: "Toronto rapper and producer blending hip-hop with electronic production. Rising star in the city.",
    genre: ["Hip-Hop", "Electronic", "R&B"],
    instagram: "@kresnt",
    soundcloud: "https://soundcloud.com/kresnt",
    spotify: "https://open.spotify.com/artist/3I9h4fIBaBqbvBTmQRF5fN",
    booking_email: null,
    default_fee: 1500,
    location: "Toronto, ON",
  },
  {
    name: "Bambii",
    bio: "Toronto-based DJ and producer. Dancehall, club, and experimental bass music. Mixpak Records artist.",
    genre: ["Dancehall", "Club", "Bass"],
    instagram: "@byvmbii",
    soundcloud: "https://soundcloud.com/byvmbii",
    spotify: "https://open.spotify.com/artist/5RwUZcXFW2e3dJyGhyB9ld",
    booking_email: null,
    default_fee: 3000,
    location: "Toronto, ON",
  },
  {
    name: "DJ Manifest",
    bio: "Toronto hip-hop and open format DJ. Known for high-energy sets and smooth blending.",
    genre: ["Hip-Hop", "Open Format", "R&B"],
    instagram: "@djmanifest",
    soundcloud: "https://soundcloud.com/djmanifest",
    spotify: null,
    booking_email: null,
    default_fee: 1000,
    location: "Toronto, ON",
  },
  {
    name: "Lil Toro",
    bio: "Underground Toronto DJ specializing in amapiano, afrobeats, and global club sounds.",
    genre: ["Amapiano", "Afrobeats", "Global Club"],
    instagram: "@liltoro.dj",
    soundcloud: "https://soundcloud.com/liltoro",
    spotify: null,
    booking_email: null,
    default_fee: 800,
    location: "Toronto, ON",
  },
  {
    name: "RYAN Playground",
    bio: "Montreal/Toronto electronic producer. Dreamy future bass and experimental pop.",
    genre: ["Future Bass", "Electronic", "Experimental"],
    instagram: "@ryanplayground",
    soundcloud: "https://soundcloud.com/ryanplayground",
    spotify: "https://open.spotify.com/artist/7l0TxDFZCKoHNHvKwqtGmY",
    booking_email: null,
    default_fee: 5000,
    location: "Montreal / Toronto",
  },
  {
    name: "CMDZ",
    bio: "Toronto techno collective. Dark, driving warehouse techno sets.",
    genre: ["Techno", "Industrial Techno", "Dark Techno"],
    instagram: "@cmdzcrew",
    soundcloud: "https://soundcloud.com/cmdz",
    spotify: null,
    booking_email: null,
    default_fee: 1500,
    location: "Toronto, ON",
  },
];

export async function seedTorontoArtists(): Promise<{ error: string | null; count: number }> {
  if (!process.env.ALLOW_SEED) {
    return { error: "Seeding is disabled", count: 0 };
  }

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", count: 0 };

  const admin = createAdminClient();
  let added = 0;

  for (const artist of TORONTO_ARTISTS) {
    const slug = slugify(artist.name);

    // Check if already exists
    const { data: existing } = await admin
      .from("artists")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (existing) continue;

    await admin.from("artists").insert({
      name: artist.name,
      slug,
      bio: artist.bio,
      genre: artist.genre,
      instagram: artist.instagram,
      soundcloud: artist.soundcloud,
      spotify: artist.spotify,
      booking_email: artist.booking_email,
      default_fee: artist.default_fee,
      metadata: { location: artist.location },
    });

    added++;
  }

  return { error: null, count: added };
}
