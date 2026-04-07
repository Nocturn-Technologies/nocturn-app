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

export interface OpsTask {
  id: string;
  daysBefore: number;
  date: string;
  phase: string;
  task: string;
  detail: string;
  priority: "critical" | "high" | "normal";
  status: "upcoming" | "today" | "past" | "done";
}

export interface ContentPlaybook {
  eventTitle: string;
  eventDate: string;
  eventSize: "small" | "medium" | "large";
  totalPosts: number;
  totalTasks: number;
  phases: {
    name: string;
    weekLabel: string;
    posts: PlaybookPost[];
    tasks: OpsTask[];
  }[];
}

export function buildContentPlan(params: {
  eventDate: Date;
  daysUntil: number;
  title: string;
  venueName: string;
  city: string;
  collectiveName: string;
  vibeStr: string;
  lineupStr: string;
  lowestPrice: string;
  ticketLink: string;
  eventSize: "small" | "medium" | "large";
  startsAt: string;
  dressCode?: string;
}): { posts: PlaybookPost[]; tasks: OpsTask[] } {
  const {
    eventDate,
    daysUntil,
    title,
    venueName,
    city,
    collectiveName,
    vibeStr,
    lineupStr,
    lowestPrice,
    ticketLink,
    eventSize,
    startsAt,
    dressCode,
  } = params;

  const now = new Date();
  const posts: PlaybookPost[] = [];
  const tasks: OpsTask[] = [];
  let postIndex = 0;
  let taskIndex = 0;

  function addTask(
    daysBefore: number,
    phase: string,
    task: string,
    detail: string,
    priority: OpsTask["priority"]
  ) {
    const taskDate = new Date(eventDate.getTime() - daysBefore * 86400000);
    const isToday = Math.abs(taskDate.getTime() - now.getTime()) < 86400000;
    const isPast = taskDate < now && !isToday;

    tasks.push({
      id: `task-${taskIndex++}`,
      daysBefore,
      date: taskDate.toISOString().slice(0, 10),
      phase,
      task,
      detail,
      priority,
      status: isToday ? "today" : isPast ? "past" : "upcoming",
    });
  }

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

  // ── PHASE 0: Plan & Book (6-8 weeks out) ──

  if (daysUntil >= 40) {
    addTask(56, "Plan & Book", "Lock venue", `Confirm ${venueName} — get rental fee, bar minimum, deposit terms in writing`, "critical");
    addTask(50, "Plan & Book", "Set budget", "Define total budget, break-even ticket price, and profit targets", "critical");
    addTask(49, "Plan & Book", "Book headliner", `Confirm headliner — negotiate fee, travel, and hospitality. ${eventSize === "large" ? "For 300+ cap, budget $2-5K for talent." : "Keep it under $1K for this size."}`, "critical");
    addTask(45, "Plan & Book", "Confirm full lineup", "Lock all supporting acts, get promo photos and bios from each artist", "high");
    addTask(42, "Plan & Book", "Design flyer", "Brief your designer or generate one in Nocturn. Need: event name, date, venue, lineup, ticket link", "high");
    addTask(42, "Plan & Book", "Set up ticket tiers", "Create Early Bird, Tier 1, Tier 2, Tier 3 pricing in Nocturn", "critical");
    if (eventSize !== "small") {
      addTask(40, "Plan & Book", "Hire security", `${eventSize === "large" ? "3-4 security for 300+ cap" : "1-2 security for this size"}. Get quotes, confirm head count.`, "high");
      addTask(40, "Plan & Book", "Book sound engineer", "Confirm sound tech — get their rate and arrival time", "high");
    }
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

  // Ops tasks for hype phase
  if (daysUntil >= 12) {
    addTask(14, "Build Hype", "Artist spotlight content", "Get each artist to send a 30-sec video or DJ mix clip for stories", "normal");
    addTask(12, "Build Hype", "Tag all artists in posts", "Every lineup post should tag artists — they repost to their audience", "high");
    if (eventSize !== "small") {
      addTask(10, "Build Hype", "Confirm photographer", "Book event photographer — needed for recap content and future promo", "normal");
    }
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

  // Ops tasks for urgency phase
  if (daysUntil >= 5) {
    addTask(7, "Urgency", "Finalize set times", "Confirm exact set times with all artists. Share internally first.", "critical");
    addTask(7, "Urgency", "Confirm door staff", "Verify all door/check-in staff are confirmed for event night", "high");
    addTask(6, "Urgency", "Prep guest list", "Finalize comps, press, VIP list in Nocturn", "normal");
    addTask(5, "Urgency", "FAQ post prep", "Create an FAQ story: address, parking, dress code, age, re-entry", "normal");
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
      `Set times for ${title}:\n\n🕙 Doors: ${new Date(startsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}\n🎵 [Artist 1] — 11:00\n🎵 [Artist 2] — 12:30\n🔊 [Headliner] — 2:00\n\nSee you there.`,
      [],
      "Set times create commitment. People plan around them. Share as a clean graphic."
    );

    addPost(
      1,
      "Final Push",
      "email",
      `Subject: Tomorrow Night — ${title}\n\nHey {name},\n\nThis is it. ${title} is tomorrow at ${venueName}.\n\nDoors: ${new Date(startsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}\nDress code: ${dressCode ?? "Come as you are"}\n\nLast chance for tickets: ${ticketLink}\n\nBring your energy.\n\n— ${collectiveName}`,
      [],
      "This email has the highest open rate. Keep it short. Just the essentials."
    );
  }

  // Ops tasks for final push
  if (daysUntil >= 1) {
    addTask(3, "Final Push", "Share set times", "Post set times publicly — drives commitment from attendees", "high");
    addTask(2, "Final Push", "Print guest list", "Export guest list from Nocturn, have backup at door", "normal");
    addTask(1, "Final Push", "Day-before checklist", "Confirm: DJ arrival times, sound check time, security briefing, door open time, bar stock", "critical");
  }

  // ── PHASE 5: Day-Of ──

  addPost(
    0,
    "Day-Of",
    "story",
    `TONIGHT. ${title}.\n\n📍 ${venueName}\n🕙 Doors at ${new Date(startsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}\n\nLast tickets at the door (if we don't sell out first).\n\nSee you tonight. 🌙`,
    [],
    "Post 3-4 stories throughout the day building anticipation. Share prep, sound check, venue setup."
  );

  addPost(
    0,
    "Day-Of",
    "twitter",
    `Tonight. ${title}. ${venueName}. Doors ${new Date(startsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}. Last call. 🌙`,
    [],
    "Short and urgent. Link to tickets if still available."
  );

  // Ops tasks for day-of
  addTask(0, "Day-Of", "Sound check", "Be at venue 2-3 hours before doors for sound check and setup", "critical");
  addTask(0, "Day-Of", "Brief door staff", "Walk through check-in flow, cover charge rules, guest list process", "critical");
  addTask(0, "Day-Of", "Open Nocturn Live Mode", "Go to Events → Live Mode for real-time check-ins, capacity, and bar tracking", "high");
  addTask(0, "Day-Of", "Track bar sales", "If you have a bar minimum, log bar revenue hourly in Live Mode", "high");

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

  // Recap ops tasks
  addTask(-1, "Recap", "Settle finances", "Generate settlement in Nocturn — split revenue, log expenses, calculate net profit", "critical");
  addTask(-1, "Recap", "Collect photos/videos", "Get photos from photographer, attendees, and artists. Save best for next event promo", "high");
  addTask(-2, "Recap", "Thank artists", "DM or email every artist — thank them, share crowd photos, plant seed for next booking", "normal");
  addTask(-3, "Recap", "Review audience data", "Check Reach → Audience. Identify new Core fans and ambassador candidates", "high");
  addTask(-5, "Recap", "Seed next event", "Start planning the next one. Use calendar heat map to pick the best date", "normal");

  return { posts, tasks };
}
