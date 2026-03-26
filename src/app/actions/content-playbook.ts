"use server";

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";

function createAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface PlaybookPost {
  id: string;
  daysBefore: number;
  date: string; // ISO date
  phase: string;
  platform: "instagram" | "twitter" | "email" | "story" | "all";
  caption: string;
  hashtags: string[];
  tip: string;
  status: "upcoming" | "today" | "past";
}

export interface ContentPlaybook {
  eventTitle: string;
  eventDate: string;
  totalPosts: number;
  phases: {
    name: string;
    posts: PlaybookPost[];
  }[];
}

export async function generateContentPlaybook(eventId: string): Promise<{
  error: string | null;
  playbook: ContentPlaybook | null;
}> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", playbook: null };

  const admin = createAdminClient();

  // Get event details
  const { data: event } = await admin
    .from("events")
    .select("title, starts_at, description, vibe_tags, venues(name, city), collective_id, collectives(name)")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) return { error: "Event not found", playbook: null };

  const eventDate = new Date(event.starts_at);
  const now = new Date();
  const daysUntil = Math.ceil((eventDate.getTime() - now.getTime()) / 86400000);
  const venue = event.venues as unknown as { name: string; city: string } | null;
  const collective = event.collectives as unknown as { name: string } | null;
  const title = event.title;
  const venueName = venue?.name ?? "the venue";
  const city = venue?.city ?? "the city";
  const collectiveName = collective?.name ?? "the collective";
  const vibes = (event.vibe_tags as string[]) ?? [];
  const vibeStr = vibes.length > 0 ? vibes.slice(0, 3).join(", ") : "underground";

  // Get lineup
  const { data: lineup } = await admin
    .from("event_artists")
    .select("artists(name)")
    .eq("event_id", eventId);

  const artistNames = (lineup ?? [])
    .map((l) => (l.artists as unknown as { name: string })?.name)
    .filter(Boolean);

  const lineupStr = artistNames.length > 0
    ? artistNames.join(", ")
    : "a curated lineup";

  // Get ticket info
  const { data: tiers } = await admin
    .from("ticket_tiers")
    .select("name, price")
    .eq("event_id", eventId)
    .order("price", { ascending: true })
    .limit(1);

  const lowestPrice = tiers?.[0]?.price ? `$${Number(tiers[0].price).toFixed(0)}` : "limited";
  const ticketLink = `app.trynocturn.com/e/${event.collective_id}/${eventId}`;

  // Build playbook phases
  const posts: PlaybookPost[] = [];
  let postIndex = 0;

  function addPost(
    daysBefore: number,
    phase: string,
    platform: PlaybookPost["platform"],
    caption: string,
    hashtags: string[],
    tip: string
  ) {
    const postDate = new Date(eventDate.getTime() - daysBefore * 86400000);
    const isToday = Math.abs(postDate.getTime() - now.getTime()) < 86400000;
    const isPast = postDate < now && !isToday;

    posts.push({
      id: `post-${postIndex++}`,
      daysBefore,
      date: postDate.toISOString().slice(0, 10),
      phase,
      platform,
      caption,
      hashtags,
      tip,
      status: isToday ? "today" : isPast ? "past" : "upcoming",
    });
  }

  // ── PHASE 1: Announce (4 weeks out) ──

  if (daysUntil >= 25) {
    addPost(
      28,
      "Announce",
      "instagram",
      `Something's coming. ${title} — ${eventDate.toLocaleDateString("en-US", { month: "long", day: "numeric" })} at ${venueName}. Early bird tickets live now. Link in bio.`,
      [`#${city.toLowerCase().replace(/\s/g, "")}nightlife`, `#${vibeStr.split(",")[0]?.trim().replace(/\s/g, "")}`, "#newshow"],
      "Post between 6-8pm when your audience is scrolling. Use a teaser image, not the full flyer."
    );

    addPost(
      26,
      "Announce",
      "story",
      `🎫 Early bird just dropped for ${title}\n\n${eventDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}\n📍 ${venueName}\n💰 From ${lowestPrice}\n\nSwipe up or tap link in bio`,
      [],
      "Use the countdown sticker. Add a poll: 'You coming?' Yes/Maybe — drives engagement."
    );

    addPost(
      25,
      "Announce",
      "twitter",
      `${title} — ${eventDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} at ${venueName}. ${lineupStr}. Early birds won't last. 🎫`,
      [`#${city.toLowerCase().replace(/\s/g, "")}`, "#livemusic"],
      "Keep it short. Twitter rewards brevity. Pin the tweet."
    );

    addPost(
      24,
      "Announce",
      "email",
      `Subject: ${title} — Early Bird Tickets Live\n\nHey {name},\n\nWe've been working on something special. ${title} is happening ${eventDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} at ${venueName}.\n\nLineup: ${lineupStr}\nVibe: ${vibeStr}\n\nEarly bird tickets are live now at ${lowestPrice}. These always sell out first.\n\nGrab yours: ${ticketLink}\n\n— ${collectiveName}`,
      [],
      "Send to your full list. Subject line is everything — keep it simple and direct."
    );
  }

  // ── PHASE 2: Build Hype (2 weeks out) ──

  if (daysUntil >= 12) {
    addPost(
      14,
      "Build Hype",
      "instagram",
      `${title} is two weeks away. ${lineupStr} at ${venueName}. This is the one you don't want to miss.\n\nTier 1 tickets still available — won't last the week.\n\nLink in bio 🎫`,
      [`#${city.toLowerCase().replace(/\s/g, "")}events`, `#${vibeStr.split(",")[0]?.trim().replace(/\s/g, "")}`, "#nightout"],
      "Post the full flyer now. Tag every artist on the lineup — they'll repost to their audience."
    );

    addPost(
      12,
      "Build Hype",
      "story",
      `Two weeks. ${title}.\n\nWho are you bringing? 👇\n\nDrop a name and tag them.`,
      [],
      "Use the question sticker or mention sticker. User-generated tags = free reach."
    );

    addPost(
      10,
      "Build Hype",
      "twitter",
      `Two weeks until ${title}. ${venueName}. ${lineupStr}. If you know, you know.`,
      [],
      "Quote-tweet your original announcement. Builds on existing engagement."
    );
  }

  // ── PHASE 3: Urgency (1 week out) ──

  if (daysUntil >= 5) {
    addPost(
      7,
      "Urgency",
      "instagram",
      `One week out. ${title} at ${venueName}.\n\nTickets are moving. We're not restocking.\n\nThis is your window. Link in bio.`,
      [`#${city.toLowerCase().replace(/\s/g, "")}`, "#lastchance", "#limitedtickets"],
      "Show social proof — 'X tickets sold' or 'X people going'. Scarcity drives action."
    );

    addPost(
      7,
      "Urgency",
      "email",
      `Subject: ${title} — One Week Out\n\nHey {name},\n\n${title} is next ${eventDate.toLocaleDateString("en-US", { weekday: "long" })}. We've already moved a lot of tickets and the current tier won't last much longer.\n\nIf you're coming, now is the time. Prices go up when this tier sells out.\n\nGet tickets: ${ticketLink}\n\nSee you there.\n\n— ${collectiveName}`,
      [],
      "Send to people who opened the first email but didn't buy. Resend with a different subject to non-openers."
    );

    addPost(
      5,
      "Urgency",
      "story",
      `5 days. ${title}.\n\n🔥 Ticket update: [X] sold, [Y] remaining\n\nDon't sleep on this one.`,
      [],
      "Update the actual numbers. Real scarcity > fake urgency. Screenshot the ticket count from your dashboard."
    );
  }

  // ── PHASE 4: Final Push (3 days) ──

  if (daysUntil >= 1) {
    addPost(
      3,
      "Final Push",
      "instagram",
      `This ${eventDate.toLocaleDateString("en-US", { weekday: "long" })}. ${title}. ${venueName}.\n\nSet times dropping tomorrow. Last tickets at current price.\n\nBring your crew. Link in bio.`,
      [`#${city.toLowerCase().replace(/\s/g, "")}`, `#this${eventDate.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase()}`],
      "Post a behind-the-scenes video or sound check clip. Makes it feel real and imminent."
    );

    addPost(
      2,
      "Final Push",
      "story",
      `Set times for ${title}:\n\n🕙 Doors: ${new Date(event.starts_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}\n🎵 [Artist 1] — 11:00\n🎵 [Artist 2] — 12:30\n🔊 [Headliner] — 2:00\n\nSee you there.`,
      [],
      "Set times create commitment. People plan around them. Share as a clean graphic."
    );

    addPost(
      1,
      "Final Push",
      "email",
      `Subject: Tomorrow Night — ${title}\n\nHey {name},\n\nThis is it. ${title} is tomorrow at ${venueName}.\n\nDoors: ${new Date(event.starts_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}\nDress code: ${(event as unknown as { metadata?: { dress_code?: string } })?.metadata?.dress_code ?? "Come as you are"}\n\nLast chance for tickets: ${ticketLink}\n\nBring your energy.\n\n— ${collectiveName}`,
      [],
      "This email has the highest open rate. Keep it short. Just the essentials."
    );
  }

  // ── PHASE 5: Day-Of ──

  addPost(
    0,
    "Day-Of",
    "story",
    `TONIGHT. ${title}.\n\n📍 ${venueName}\n🕙 Doors at ${new Date(event.starts_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}\n\nLast tickets at the door (if we don't sell out first).\n\nSee you tonight. 🌙`,
    [],
    "Post 3-4 stories throughout the day building anticipation. Share prep, sound check, venue setup."
  );

  addPost(
    0,
    "Day-Of",
    "twitter",
    `Tonight. ${title}. ${venueName}. Doors ${new Date(event.starts_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}. Last call. 🌙`,
    [],
    "Short and urgent. Link to tickets if still available."
  );

  // ── PHASE 6: Post-Event Recap ──

  addPost(
    -1,
    "Recap",
    "instagram",
    `${title} — what a night. Thank you to everyone who came through and made it special.\n\nPhotos dropping this week. Tag us in yours.\n\nNext one coming soon. Stay tuned. 🌙\n\n— ${collectiveName}`,
    [`#${city.toLowerCase().replace(/\s/g, "")}nightlife`, "#recap", `#${collectiveName.toLowerCase().replace(/\s/g, "")}`],
    "Post within 24 hours while the energy is fresh. Use the best crowd photo. Thank your artists by tagging them."
  );

  addPost(
    -3,
    "Recap",
    "email",
    `Subject: Thanks for Last Night\n\nHey {name},\n\nThank you for being part of ${title}. Nights like that are why we do this.\n\nPhotos are up — check them out and tag yourself.\n\nWant to know first about the next one? You're already on the list.\n\nSee you soon.\n\n— ${collectiveName}`,
    [],
    "Include a photo gallery link. Ask them to follow your socials if they haven't. Plant the seed for the next event."
  );

  // Group by phase
  const phaseOrder = ["Announce", "Build Hype", "Urgency", "Final Push", "Day-Of", "Recap"];
  const phases = phaseOrder
    .map((name) => ({
      name,
      posts: posts.filter((p) => p.phase === name),
    }))
    .filter((p) => p.posts.length > 0);

  return {
    error: null,
    playbook: {
      eventTitle: title,
      eventDate: event.starts_at,
      totalPosts: posts.length,
      phases,
    },
  };
}
