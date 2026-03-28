import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";

const torontoArtists = [
  { name: "deadmau5", genre: ["progressive house", "electro house", "techno"], instagram: "@deadmau5", soundcloud: "https://soundcloud.com/deadmau5", spotify: "https://open.spotify.com/artist/2CIMQHirSU0MQqyYHq0eOx", booking_email: null, default_fee: 50000, bio: "Grammy-nominated electronic music producer from Toronto. One of the biggest names in dance music." },
  { name: "Rezz", genre: ["midtempo", "electro", "bass"], instagram: "@officialrezz", soundcloud: "https://soundcloud.com/official-rezz", spotify: "https://open.spotify.com/artist/2aEOzTXDWJbj9eXjYNsuNV", booking_email: null, default_fee: 25000, bio: "Ukrainian-Canadian DJ from Niagara Falls. Dark, hypnotic midtempo and electro." },
  { name: "DJ Bambii", genre: ["dancehall", "club", "bass"], instagram: "@djbambii", soundcloud: "soundcloud.com/djbambii", spotify: "open.spotify.com/artist/5CbPQGnKEg0RqKKhZKpcAb", booking_email: null, default_fee: 1500, bio: "Toronto-born DJ and producer blending dancehall, club, and bass music. JUNO-nominated." },
  { name: "Kaytranada", genre: ["house", "r&b", "electronic"], instagram: "@kaaboreal", soundcloud: "soundcloud.com/kaytranada", spotify: "open.spotify.com/artist/6qgnBH6iDM91ipVXv28PGe", booking_email: null, default_fee: 15000, bio: "Grammy-winning producer and DJ from Montreal, frequent in Toronto club scenes." },
  { name: "Harrison", genre: ["house", "disco", "nu-disco"], instagram: "@harrisonbdp", soundcloud: "soundcloud.com/harrisonbdp", spotify: "open.spotify.com/artist/2VKxMJBIZn0fWjEF3wd0eR", booking_email: null, default_fee: 2000, bio: "Toronto house and disco producer. Known for feel-good dance floor energy." },
  { name: "Tyris Jones", genre: ["house", "afro house", "deep house"], instagram: "@tyrisjones", soundcloud: "soundcloud.com/tyrisjones", spotify: null, booking_email: null, default_fee: 800, bio: "Toronto DJ spinning afro house and deep house across the city's underground scene." },
  { name: "Desiire", genre: ["r&b", "soul", "electronic"], instagram: "@desiire_", soundcloud: "soundcloud.com/desiiremusic", spotify: "open.spotify.com/artist/1HU8M65cmMUysBv1gLm9xI", booking_email: null, default_fee: 1200, bio: "Toronto vocalist and electronic artist blending R&B with club textures." },
  { name: "Chris Lake", genre: ["tech house", "house"], instagram: "@chrislake", soundcloud: "soundcloud.com/chrislake", spotify: "open.spotify.com/artist/3RGLhK1IP9jnYFH4BRFJBS", booking_email: null, default_fee: 25000, bio: "UK-born, globally touring tech house DJ. Regular at Toronto festivals." },
  { name: "Blond:ish", genre: ["melodic house", "afro house", "organic house"], instagram: "@blaboreal", soundcloud: "soundcloud.com/blondish", spotify: "open.spotify.com/artist/3TXefsl3U6bJBgeFOooY1z", booking_email: null, default_fee: 8000, bio: "Montreal-based duo known for melodic house sets. Frequent in Toronto." },
  { name: "RYAN Playground", genre: ["electronic", "pop", "bass"], instagram: "@ryanplayground", soundcloud: "soundcloud.com/ryanplayground", spotify: "open.spotify.com/artist/71MwRiJisp3WsLb5KfGqaU", booking_email: null, default_fee: 3000, bio: "Montreal-Toronto electronic producer with playful, high-energy sets." },
  { name: "A Tribe Called Red", genre: ["electronic", "pow wow step", "indigenous"], instagram: "@atribecalledred", soundcloud: "soundcloud.com/a-tribe-called-red", spotify: "open.spotify.com/artist/1Y8AJCvVqI2pwVVWAHbBTq", booking_email: null, default_fee: 5000, bio: "Ottawa-based Indigenous electronic group. Pioneers of pow wow step. Major Toronto presence." },
  { name: "DJ Agile", genre: ["hip hop", "r&b", "open format"], instagram: "@djagile", soundcloud: "soundcloud.com/djagile", spotify: null, booking_email: null, default_fee: 2500, bio: "Toronto's go-to open format DJ. Residencies at top clubs across the city." },
  { name: "Nino Brown", genre: ["hip hop", "dancehall", "afrobeats"], instagram: "@djninobrown", soundcloud: "soundcloud.com/djninobrown", spotify: null, booking_email: null, default_fee: 3000, bio: "Toronto hip hop and dancehall DJ. Known for high-energy club sets." },
  { name: "Bad Gyal Jade", genre: ["dancehall", "soca", "afrobeats"], instagram: "@badgyaljade", soundcloud: "soundcloud.com/badgyaljade", spotify: null, booking_email: null, default_fee: 1000, bio: "Toronto dancehall and soca DJ bringing Caribbean energy to every set." },
  { name: "Tara Brooks", genre: ["techno", "progressive", "melodic techno"], instagram: "@tarabrooks", soundcloud: "soundcloud.com/tarabrooks", spotify: "open.spotify.com/artist/4s1DjfnRZ9MNJk4PZC2R88", booking_email: null, default_fee: 2000, bio: "Techno and progressive DJ. Regular at Toronto underground events." },
  { name: "Khotin", genre: ["ambient", "house", "lo-fi"], instagram: "@khotin", soundcloud: "soundcloud.com/khotin", spotify: "open.spotify.com/artist/0S3k8WwJj9VYsHMbWZhR3R", booking_email: null, default_fee: 1500, bio: "Edmonton-born, Toronto-based ambient and lo-fi house producer." },
  { name: "Jayemkayem", genre: ["house", "boogie", "funk"], instagram: "@jayemkayem", soundcloud: "soundcloud.com/jayemkayem", spotify: null, booking_email: null, default_fee: 800, bio: "Toronto selector specializing in house, boogie, and funk. Community favourite." },
  { name: "Vague Detail", genre: ["techno", "electro", "industrial"], instagram: "@vaguedetail", soundcloud: "soundcloud.com/vaguedetail", spotify: null, booking_email: null, default_fee: 600, bio: "Toronto techno and electro DJ. Underground warehouse regular." },
  { name: "Ace Dillinger", genre: ["house", "disco", "funk"], instagram: "@acedillinger", soundcloud: "soundcloud.com/acedillinger", spotify: null, booking_email: null, default_fee: 700, bio: "Toronto disco and house DJ. Known for vinyl-heavy, groove-focused sets." },
  { name: "Mobilize", genre: ["drum & bass", "jungle", "bass"], instagram: "@mobilizedj", soundcloud: "soundcloud.com/mobilize", spotify: null, booking_email: null, default_fee: 1000, bio: "Toronto drum & bass stalwart. Decades deep in the jungle/DnB scene." },
  { name: "Zuki", genre: ["afrobeats", "amapiano", "afro house"], instagram: "@zukidj", soundcloud: "soundcloud.com/zukidj", spotify: null, booking_email: null, default_fee: 800, bio: "Toronto-based Afrobeats and Amapiano DJ. Rising star in the city's African music scene." },
  { name: "Tezz", genre: ["hip hop", "trap", "open format"], instagram: "@djtezz", soundcloud: "soundcloud.com/djtezz", spotify: null, booking_email: null, default_fee: 1500, bio: "Toronto hip hop and trap DJ. Known for high-energy club nights." },
];

export async function POST() {
  // Block in production
  if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_SEED) {
    return NextResponse.json({ error: 'Seed routes disabled in production' }, { status: 403 });
  }

  // Auth check — only admins can seed data
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let inserted = 0;
  let skipped = 0;

  for (const artist of torontoArtists) {
    const slug = artist.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Math.random().toString(36).slice(2, 6);

    const { error } = await admin.from("artists").insert({
      name: artist.name,
      slug,
      bio: artist.bio,
      genre: artist.genre,
      instagram: artist.instagram,
      soundcloud: artist.soundcloud,
      spotify: artist.spotify,
      booking_email: artist.booking_email,
      default_fee: artist.default_fee,
      metadata: { location: "Toronto, ON" },
    });

    if (error) {
      skipped++;
    } else {
      inserted++;
    }
  }

  return NextResponse.json({
    message: `Seeded ${inserted} Toronto artists (${skipped} skipped)`,
    total: torontoArtists.length,
  });
}
