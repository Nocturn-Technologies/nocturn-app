import type { Contact, AggregateStats, ReachInsight } from "@/app/actions/contacts";
import type { PeopleContact } from "@/components/people/contact-list";

const now = Date.now();
const day = 24 * 60 * 60 * 1000;
const iso = (daysAgo: number) => new Date(now - daysAgo * day).toISOString();

const DEMO_COLLECTIVE_ID = "demo-collective";

function fan(
  idx: number,
  opts: {
    name: string;
    email: string;
    phone?: string;
    totalEvents: number;
    totalSpend: number;
    firstDaysAgo: number;
    lastDaysAgo: number;
    tags?: string[];
    referrals?: number;
  }
): Contact {
  return {
    id: `demo-fan-${idx}`,
    collectiveId: DEMO_COLLECTIVE_ID,
    contactType: "fan",
    email: opts.email,
    phone: opts.phone ?? null,
    fullName: opts.name,
    role: null,
    source: "ticket_purchase",
    sourceDetail: null,
    userId: null,
    artistId: null,
    marketplaceProfileId: null,
    tags: opts.tags ?? [],
    notes: null,
    followUpAt: null,
    totalEvents: opts.totalEvents,
    totalSpend: opts.totalSpend,
    firstSeenAt: iso(opts.firstDaysAgo),
    lastSeenAt: iso(opts.lastDaysAgo),
    metadata: opts.referrals ? { referrals_count: opts.referrals } : {},
    createdAt: iso(opts.firstDaysAgo),
    updatedAt: iso(opts.lastDaysAgo),
  };
}

export const DEMO_FANS: Contact[] = [
  fan(1, { name: "Maya Chen", email: "maya.chen@gmail.com", phone: "+14162223301", totalEvents: 4, totalSpend: 128, firstDaysAgo: 180, lastDaysAgo: 7, tags: ["ambassador"], referrals: 6 }),
  fan(2, { name: "Jordan Ali", email: "jordanali@outlook.com", totalEvents: 4, totalSpend: 112, firstDaysAgo: 170, lastDaysAgo: 5, tags: ["ambassador"], referrals: 4 }),
  fan(3, { name: "Sienna Park", email: "siennap@gmail.com", phone: "+14165550198", totalEvents: 4, totalSpend: 140, firstDaysAgo: 210, lastDaysAgo: 7 }),
  fan(4, { name: "Ethan Wright", email: "ewright@proton.me", totalEvents: 3, totalSpend: 95, firstDaysAgo: 140, lastDaysAgo: 14 }),
  fan(5, { name: "Priya Raman", email: "priya.r@gmail.com", phone: "+14167770445", totalEvents: 3, totalSpend: 86, firstDaysAgo: 120, lastDaysAgo: 14 }),
  fan(6, { name: "Marcus Vega", email: "mvega@icloud.com", totalEvents: 3, totalSpend: 84, firstDaysAgo: 95, lastDaysAgo: 7 }),
  fan(7, { name: "Nadia Johnston", email: "nadia.j@gmail.com", totalEvents: 2, totalSpend: 60, firstDaysAgo: 85, lastDaysAgo: 14 }),
  fan(8, { name: "Kai Nakamura", email: "kainaka@gmail.com", phone: "+14161113322", totalEvents: 2, totalSpend: 58, firstDaysAgo: 75, lastDaysAgo: 21 }),
  fan(9, { name: "Olivia Bloom", email: "oliviab@gmail.com", totalEvents: 2, totalSpend: 52, firstDaysAgo: 70, lastDaysAgo: 35 }),
  fan(10, { name: "Rahul Shah", email: "rshah@gmail.com", totalEvents: 2, totalSpend: 55, firstDaysAgo: 68, lastDaysAgo: 14 }),
  fan(11, { name: "Tessa Moreau", email: "tessam@gmail.com", totalEvents: 2, totalSpend: 62, firstDaysAgo: 58, lastDaysAgo: 21 }),
  fan(12, { name: "Liam Osei", email: "liamo@gmail.com", phone: "+14168889911", totalEvents: 2, totalSpend: 56, firstDaysAgo: 52, lastDaysAgo: 7 }),
  fan(13, { name: "Zara Hussein", email: "zara.h@gmail.com", totalEvents: 2, totalSpend: 60, firstDaysAgo: 48, lastDaysAgo: 14 }),
  fan(14, { name: "Devon Cruz", email: "devonc@gmail.com", totalEvents: 1, totalSpend: 28, firstDaysAgo: 40, lastDaysAgo: 40 }),
  fan(15, { name: "Harper Quinn", email: "harperq@gmail.com", totalEvents: 1, totalSpend: 25, firstDaysAgo: 35, lastDaysAgo: 35 }),
  fan(16, { name: "Riley Sato", email: "rileys@gmail.com", totalEvents: 1, totalSpend: 28, firstDaysAgo: 30, lastDaysAgo: 30 }),
  fan(17, { name: "Isla Fontaine", email: "islaf@gmail.com", totalEvents: 1, totalSpend: 22, firstDaysAgo: 28, lastDaysAgo: 28 }),
  fan(18, { name: "Benji Lowe", email: "benjilowe@gmail.com", totalEvents: 1, totalSpend: 28, firstDaysAgo: 25, lastDaysAgo: 25 }),
  fan(19, { name: "Camila Rios", email: "camilar@gmail.com", totalEvents: 1, totalSpend: 25, firstDaysAgo: 22, lastDaysAgo: 22 }),
  fan(20, { name: "Noah Abrams", email: "noaha@gmail.com", totalEvents: 1, totalSpend: 28, firstDaysAgo: 20, lastDaysAgo: 20 }),
  fan(21, { name: "Amelie Brun", email: "ameliebrun@gmail.com", totalEvents: 1, totalSpend: 22, firstDaysAgo: 18, lastDaysAgo: 18 }),
  fan(22, { name: "Zion Mbeki", email: "zionm@gmail.com", totalEvents: 1, totalSpend: 28, firstDaysAgo: 14, lastDaysAgo: 14 }),
  fan(23, { name: "Sage Callahan", email: "sagec@gmail.com", totalEvents: 1, totalSpend: 22, firstDaysAgo: 12, lastDaysAgo: 12 }),
  fan(24, { name: "Finn O'Hara", email: "finnoh@gmail.com", totalEvents: 1, totalSpend: 28, firstDaysAgo: 10, lastDaysAgo: 10 }),
  fan(25, { name: "Aria Delgado", email: "ariad@gmail.com", totalEvents: 1, totalSpend: 28, firstDaysAgo: 8, lastDaysAgo: 8 }),
  fan(26, { name: "Theo Blackwood", email: "theob@gmail.com", totalEvents: 1, totalSpend: 22, firstDaysAgo: 5, lastDaysAgo: 5 }),
  fan(27, { name: "Jasmine Pike", email: "jasminep@gmail.com", totalEvents: 1, totalSpend: 28, firstDaysAgo: 3, lastDaysAgo: 3 }),
  fan(28, { name: "Cassius Wynn", email: "cassiusw@gmail.com", totalEvents: 1, totalSpend: 22, firstDaysAgo: 2, lastDaysAgo: 2 }),
  fan(29, { name: "Luna Voss", email: "lunav@gmail.com", totalEvents: 1, totalSpend: 28, firstDaysAgo: 1, lastDaysAgo: 1 }),
  fan(30, { name: "Wren Takahashi", email: "wrent@gmail.com", totalEvents: 1, totalSpend: 28, firstDaysAgo: 1, lastDaysAgo: 1 }),
  fan(31, { name: "Avi Klein", email: "avik@gmail.com", totalEvents: 1, totalSpend: 22, firstDaysAgo: 55, lastDaysAgo: 55 }),
  fan(32, { name: "Magnolia Chen", email: "magnoliac@gmail.com", totalEvents: 1, totalSpend: 25, firstDaysAgo: 72, lastDaysAgo: 72 }),
  fan(33, { name: "Dashiell Reeve", email: "dashr@gmail.com", totalEvents: 1, totalSpend: 22, firstDaysAgo: 80, lastDaysAgo: 80 }),
];

const totalRevenue = DEMO_FANS.reduce((s, f) => s + f.totalSpend, 0);
const repeatFans = DEMO_FANS.filter((f) => f.totalEvents >= 2).length;
const newThisMonth = DEMO_FANS.filter(
  (f) => new Date(f.createdAt).getTime() > now - 30 * day
).length;

export const DEMO_AGG_STATS: AggregateStats = {
  totalRevenue,
  avgSpend: totalRevenue / DEMO_FANS.length,
  repeatRate: (repeatFans / DEMO_FANS.length) * 100,
  newThisMonth,
};

export const DEMO_SEGMENT_COUNTS: Record<string, number> = {
  core50: DEMO_FANS.filter((f) => f.totalEvents >= 4).length,
  ambassador: DEMO_FANS.filter((f) => f.tags.includes("ambassador")).length,
  repeat: DEMO_FANS.filter((f) => f.totalEvents >= 2 && !f.tags.includes("ambassador")).length,
  new: DEMO_FANS.filter((f) => f.totalEvents === 1).length,
  vip: 0,
};

const coreCount = DEMO_SEGMENT_COUNTS.core50;
const ambCount = DEMO_SEGMENT_COUNTS.ambassador;
const potentialAmbCount = DEMO_FANS.filter(
  (f) => f.totalEvents >= 2 && !f.tags.includes("ambassador")
).length;
const dormantCount = DEMO_FANS.filter(
  (f) => new Date(f.lastSeenAt).getTime() < now - 60 * day
).length;
const emailCount = DEMO_FANS.filter((f) => f.email).length;

export const DEMO_REACH_INSIGHTS: ReachInsight[] = [
  {
    id: "potential_ambassadors",
    icon: "⭐",
    title: `${potentialAmbCount} fans ready to become ambassadors`,
    description:
      "They've come to multiple events. Give them a unique promo code, early access to tickets, and ask them to post your flyer on their story.",
  },
  {
    id: "arm_ambassadors",
    icon: "🎯",
    title: `Arm your ${ambCount} ambassador${ambCount !== 1 ? "s" : ""} for the next event`,
    description:
      "Send them the flyer early, give them a \"friends of\" promo code (10-15% off), and ask them to post 3 days before. Each ambassador typically brings 3-5 ticket sales.",
    action: "Go to Promo Codes",
    actionType: "navigate",
    actionTarget: "/dashboard/events",
  },
  {
    id: "new_fans",
    icon: "📈",
    title: `${newThisMonth} new fans in the last 30 days`,
    description:
      "Your audience grew strongly this month. Keep pushing the social loop — post a recap reel from your last event to drive new followers.",
  },
  {
    id: "core_crew",
    icon: "💎",
    title: `${coreCount} fans came to every event`,
    description:
      "Your day-ones. They deserve VIP treatment — early ticket access, guest list +1, or a shoutout in your next event description. Loyalty breeds loyalty.",
    action: "Copy their emails",
    actionType: "copy_emails",
  },
  {
    id: "dormant_fans",
    icon: "😴",
    title: `${dormantCount} fans haven't come in 60+ days`,
    description:
      "Win them back. Send a \"we miss you\" DM with an exclusive early access link. Re-engagement campaigns convert at 15-25% for nightlife.",
    action: "Copy their emails",
    actionType: "copy_emails",
  },
  {
    id: "email_list",
    icon: "📧",
    title: `${emailCount} fans have emails — use them`,
    description:
      "Send a pre-event hype email 5 days before your next event. Email drives 20-30% of advance ticket sales for nightlife.",
    action: "Go to Email Marketing",
    actionType: "navigate",
    actionTarget: "/dashboard/marketing",
  },
];

export const DEMO_HEADLINE = `${coreCount} fans have been to every event — your core crew`;

export const DEMO_EVENTS = [
  { id: "demo-evt-1", title: "Deep Frequencies Vol. 3", starts_at: iso(18) },
  { id: "demo-evt-2", title: "Nocturnal Sounds: Opening Night", starts_at: iso(5) },
  { id: "demo-evt-3", title: "Warehouse Sessions 001", starts_at: iso(-7) },
  { id: "demo-evt-4", title: "House of Shadows", starts_at: iso(-21) },
];

export const DEMO_PEOPLE_CONTACTS: PeopleContact[] = DEMO_FANS.map((c) => ({
  id: c.id,
  email: c.email ?? "",
  name: c.fullName,
  phone: c.phone,
  instagram: null,
  soundcloud_url: null,
  spotify_url: null,
  avatar_url: null,
  contact_type: c.contactType,
  role: c.role,
  tags: c.tags,
  notes: c.notes,
  source: c.source,
  follow_up_at: c.followUpAt,
  total_events: c.totalEvents,
  total_spend: c.totalSpend,
  segment: c.tags.includes("ambassador")
    ? "ambassadors"
    : c.totalEvents >= 4
      ? "core50"
      : c.totalEvents >= 2
        ? "repeat"
        : "new",
  profile_id: null,
  created_at: c.createdAt,
  last_seen_at: c.lastSeenAt,
}));
