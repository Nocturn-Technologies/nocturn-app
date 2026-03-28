# Discover Marketplace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Discover Marketplace tab in the Nocturn dashboard where collectives can find and contact DJs, photographers, videographers, sound/lighting production, sponsors, venues, and other collectives — and where those service providers can list themselves.

**Architecture:** Four-phase build. Phase 1 creates the database tables and expands user types. Phase 2 updates the signup flow and adds a marketplace profile onboarding form. Phase 3 builds the Discover browse UI with search/filter/contact. Phase 4 adds embedded analytics and AI recommendations. Each phase produces working, testable software.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (PostgreSQL + RLS), Tailwind CSS v4, shadcn/ui, Resend (email), PostHog (analytics), Lucide icons.

---

## Codebase Context

**Key patterns you must follow:**

1. **Server actions** use `"use server"` + `createAdminClient()` from `@/lib/supabase/config` to bypass RLS. Client reads use `createClient()` from `@/lib/supabase/client`.
2. **Database types** live in `src/lib/supabase/database.types.ts`. Every new table needs Row/Insert/Update/Relationships types added manually (Supabase codegen is not wired up).
3. **Migrations** go in `supabase/migrations/YYYYMMDD_feature_name.sql` and are applied via Supabase MCP `apply_migration()`.
4. **Dashboard nav** is defined in `src/components/dashboard-shell.tsx` with separate arrays for collective users (`sidebarNavItems`) and promoter users (`promoterSidebarItems`). The shell checks `activeColl?.role === "promoter"` to switch.
5. **User type routing** happens in `src/app/(auth)/signup/page.tsx` (type selection), `src/app/actions/auth.ts` (signup action + auto-collective creation), and `src/app/(dashboard)/layout.tsx` (onboarding redirect).
6. **Discovery page pattern** — follow `src/app/(dashboard)/dashboard/venues/page.tsx`: two-tab UI (Discover + Saved), debounced search, horizontal chip filters, optimistic save/unsave, responsive grid, detail sheet.
7. **Dark theme only.** Use shadcn CSS variables: `bg-card`, `text-foreground`, `text-muted-foreground`, `bg-accent`. Brand: `bg-nocturn` (#7B2FF7), `text-nocturn`, `bg-nocturn/10`.
8. **Mobile-first.** 44px min tap targets. Bottom tab bar on mobile, sidebar on desktop.
9. **PostHog** — import `posthog` from `posthog-js`, call `posthog.capture("event_name", { properties })` in client components for custom events.
10. **Supabase queries** — use `.maybeSingle()` not `.single()` where 0 rows possible. Null-guard with `?.` and `??`. Prices in dollars, not cents.
11. **eslint pattern** — Supabase `.from("new_table")` returns `never` type until database.types.ts is updated. Use `(admin.from("table") as any)` with `// eslint-disable-next-line @typescript-eslint/no-explicit-any` above it.

---

## File Map

### Phase 1: Database + User Types
| Action | File | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/20260328_marketplace.sql` | Tables: marketplace_profiles, marketplace_inquiries. Indexes, RLS policies. Expand user_type CHECK constraint. |
| Modify | `src/lib/supabase/database.types.ts` | Add Row/Insert/Update types for marketplace_profiles and marketplace_inquiries. |

### Phase 2: Signup Flow Expansion
| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/app/(auth)/signup/page.tsx` | Add 5 new user types to the type selector grid. Update routing. |
| Modify | `src/app/actions/auth.ts` | Accept new user_types. Auto-create personal collective for all non-collective types (like promoter pattern). |
| Create | `src/app/onboarding/marketplace/page.tsx` | Post-signup marketplace profile builder (display name, city, bio, genres/services, rate, portfolio). |
| Create | `src/app/actions/marketplace.ts` | Server actions: createMarketplaceProfile, updateMarketplaceProfile, getMarketplaceProfile, searchProfiles, saveProfile, unsaveProfile, sendInquiry. |
| Modify | `src/app/(dashboard)/layout.tsx` | Allow new user types to skip collective onboarding (same pattern as promoter). |

### Phase 3: Discover Tab
| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/components/dashboard-shell.tsx` | Add "Discover" nav item to all user type nav arrays. |
| Create | `src/app/(dashboard)/dashboard/discover/page.tsx` | Main discover page: category tabs, search, city filter, profile card grid, save/contact. |
| Create | `src/app/(dashboard)/dashboard/discover/profile-card.tsx` | Reusable profile card component for the grid. |
| Create | `src/app/(dashboard)/dashboard/discover/[slug]/page.tsx` | Full profile detail page with bio, links, portfolio, contact button. |
| Create | `src/app/(dashboard)/dashboard/discover/contact-dialog.tsx` | Contact/inquiry dialog: event selector, message field, PostHog tracking. |
| Create | `src/app/api/marketplace-inquiry-email/route.ts` | API route to send inquiry notification email via Resend. |

### Phase 4: Analytics + AI Recommendations
| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/app/(dashboard)/dashboard/discover/[slug]/page.tsx` | Add "Performance with your collective" section for artists. |
| Modify | `src/app/(dashboard)/dashboard/discover/page.tsx` | Add "Recommended for you" section at top. |
| Create | `src/app/actions/marketplace-analytics.ts` | Server action: getProfilePerformance, getRecommendations (Claude-powered). |
| Modify | `src/app/(dashboard)/dashboard/page.tsx` | Add marketplace stats (profile views, inquiries) for non-collective user types. |

---

## Phase 1: Database + User Types

### Task 1: Create migration SQL

**Files:**
- Create: `supabase/migrations/20260328_marketplace.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Expand user_type CHECK constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_user_type_check;
ALTER TABLE users ADD CONSTRAINT users_user_type_check CHECK (
  user_type IN (
    'collective', 'promoter', 'artist', 'venue',
    'photographer', 'videographer', 'sound_production',
    'lighting_production', 'sponsor'
  )
);

-- Marketplace profiles
CREATE TABLE marketplace_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  user_type text NOT NULL,
  display_name text NOT NULL,
  slug text UNIQUE NOT NULL,
  bio text,
  avatar_url text,
  cover_photo_url text,
  city text NOT NULL,
  instagram_handle text,
  website_url text,
  soundcloud_url text,
  spotify_url text,
  genres text[] DEFAULT '{}',
  services text[] DEFAULT '{}',
  rate_range text,
  availability text,
  portfolio_urls text[] DEFAULT '{}',
  past_venues text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  is_verified boolean DEFAULT false,
  is_active boolean DEFAULT true
);

CREATE INDEX idx_marketplace_profiles_type ON marketplace_profiles(user_type);
CREATE INDEX idx_marketplace_profiles_city ON marketplace_profiles(city);
CREATE INDEX idx_marketplace_profiles_genres ON marketplace_profiles USING gin(genres);
CREATE UNIQUE INDEX idx_marketplace_profiles_user ON marketplace_profiles(user_id);

ALTER TABLE marketplace_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active profiles"
  ON marketplace_profiles FOR SELECT USING (is_active = true);
CREATE POLICY "Users can insert own profile"
  ON marketplace_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile"
  ON marketplace_profiles FOR UPDATE USING (auth.uid() = user_id);

-- Marketplace inquiries
CREATE TABLE marketplace_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid REFERENCES users(id) NOT NULL,
  to_profile_id uuid REFERENCES marketplace_profiles(id) NOT NULL,
  event_id uuid REFERENCES events(id),
  message text,
  inquiry_type text NOT NULL DEFAULT 'contact',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_inquiries_to ON marketplace_inquiries(to_profile_id);
CREATE INDEX idx_inquiries_from ON marketplace_inquiries(from_user_id);

ALTER TABLE marketplace_inquiries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sender can view own inquiries"
  ON marketplace_inquiries FOR SELECT USING (auth.uid() = from_user_id);
CREATE POLICY "Receiver can view inquiries to them"
  ON marketplace_inquiries FOR SELECT USING (
    auth.uid() = (SELECT user_id FROM marketplace_profiles WHERE id = to_profile_id)
  );
CREATE POLICY "Authenticated users can create"
  ON marketplace_inquiries FOR INSERT WITH CHECK (auth.uid() = from_user_id);

-- Saved profiles (bookmarks)
CREATE TABLE marketplace_saved (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  profile_id uuid REFERENCES marketplace_profiles(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, profile_id)
);

ALTER TABLE marketplace_saved ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own saves"
  ON marketplace_saved FOR ALL USING (auth.uid() = user_id);
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Run: `apply_migration` with name `20260328_marketplace` and the SQL above.
Expected: Migration applied successfully.

- [ ] **Step 3: Verify tables exist**

Run SQL: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'marketplace%' ORDER BY table_name;`
Expected: marketplace_inquiries, marketplace_profiles, marketplace_saved

- [ ] **Step 4: Verify user_type constraint**

Run SQL: `SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'users_user_type_check';`
Expected: Shows all 9 allowed types.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260328_marketplace.sql
git commit -m "feat: add marketplace_profiles, marketplace_inquiries, marketplace_saved tables"
```

---

### Task 2: Add TypeScript types for new tables

**Files:**
- Modify: `src/lib/supabase/database.types.ts`

- [ ] **Step 1: Add marketplace_profiles types**

Find the `Tables: {` section in database.types.ts. Add after the last table definition (before the closing `}`):

```typescript
marketplace_profiles: {
  Row: {
    id: string;
    user_id: string;
    user_type: string;
    display_name: string;
    slug: string;
    bio: string | null;
    avatar_url: string | null;
    cover_photo_url: string | null;
    city: string;
    instagram_handle: string | null;
    website_url: string | null;
    soundcloud_url: string | null;
    spotify_url: string | null;
    genres: string[];
    services: string[];
    rate_range: string | null;
    availability: string | null;
    portfolio_urls: string[];
    past_venues: string[];
    created_at: string;
    updated_at: string;
    is_verified: boolean;
    is_active: boolean;
  };
  Insert: {
    id?: string;
    user_id: string;
    user_type: string;
    display_name: string;
    slug: string;
    bio?: string | null;
    avatar_url?: string | null;
    cover_photo_url?: string | null;
    city: string;
    instagram_handle?: string | null;
    website_url?: string | null;
    soundcloud_url?: string | null;
    spotify_url?: string | null;
    genres?: string[];
    services?: string[];
    rate_range?: string | null;
    availability?: string | null;
    portfolio_urls?: string[];
    past_venues?: string[];
    is_verified?: boolean;
    is_active?: boolean;
  };
  Update: {
    id?: string;
    user_id?: string;
    user_type?: string;
    display_name?: string;
    slug?: string;
    bio?: string | null;
    avatar_url?: string | null;
    cover_photo_url?: string | null;
    city?: string;
    instagram_handle?: string | null;
    website_url?: string | null;
    soundcloud_url?: string | null;
    spotify_url?: string | null;
    genres?: string[];
    services?: string[];
    rate_range?: string | null;
    availability?: string | null;
    portfolio_urls?: string[];
    past_venues?: string[];
    is_verified?: boolean;
    is_active?: boolean;
  };
  Relationships: [
    {
      foreignKeyName: "marketplace_profiles_user_id_fkey";
      columns: ["user_id"];
      isOneToOne: true;
      referencedRelation: "users";
      referencedColumns: ["id"];
    }
  ];
};
marketplace_inquiries: {
  Row: {
    id: string;
    from_user_id: string;
    to_profile_id: string;
    event_id: string | null;
    message: string | null;
    inquiry_type: string;
    status: string;
    created_at: string;
  };
  Insert: {
    id?: string;
    from_user_id: string;
    to_profile_id: string;
    event_id?: string | null;
    message?: string | null;
    inquiry_type?: string;
    status?: string;
  };
  Update: {
    id?: string;
    from_user_id?: string;
    to_profile_id?: string;
    event_id?: string | null;
    message?: string | null;
    inquiry_type?: string;
    status?: string;
  };
  Relationships: [
    {
      foreignKeyName: "marketplace_inquiries_from_user_id_fkey";
      columns: ["from_user_id"];
      isOneToOne: false;
      referencedRelation: "users";
      referencedColumns: ["id"];
    },
    {
      foreignKeyName: "marketplace_inquiries_to_profile_id_fkey";
      columns: ["to_profile_id"];
      isOneToOne: false;
      referencedRelation: "marketplace_profiles";
      referencedColumns: ["id"];
    },
    {
      foreignKeyName: "marketplace_inquiries_event_id_fkey";
      columns: ["event_id"];
      isOneToOne: false;
      referencedRelation: "events";
      referencedColumns: ["id"];
    }
  ];
};
marketplace_saved: {
  Row: {
    id: string;
    user_id: string;
    profile_id: string;
    created_at: string;
  };
  Insert: {
    id?: string;
    user_id: string;
    profile_id: string;
  };
  Update: {
    id?: string;
    user_id?: string;
    profile_id?: string;
  };
  Relationships: [
    {
      foreignKeyName: "marketplace_saved_user_id_fkey";
      columns: ["user_id"];
      isOneToOne: false;
      referencedRelation: "users";
      referencedColumns: ["id"];
    },
    {
      foreignKeyName: "marketplace_saved_profile_id_fkey";
      columns: ["profile_id"];
      isOneToOne: false;
      referencedRelation: "marketplace_profiles";
      referencedColumns: ["id"];
    }
  ];
};
```

- [ ] **Step 2: Run build to verify types compile**

Run: `npx next build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/database.types.ts
git commit -m "feat: add TypeScript types for marketplace tables"
```

---

## Phase 2: Signup Flow Expansion

### Task 3: Create marketplace server actions

**Files:**
- Create: `src/app/actions/marketplace.ts`

- [ ] **Step 1: Write the server actions file**

This file needs these actions:
- `createMarketplaceProfile(data)` — creates a profile row, generates slug from display_name + random suffix
- `updateMarketplaceProfile(data)` — updates own profile
- `getMarketplaceProfile(userId)` — fetches own profile
- `getProfileBySlug(slug)` — fetches any active profile by slug (for detail page)
- `searchProfiles({ query, type, city, page })` — search with filters, paginated (20 per page)
- `saveProfile(profileId)` — bookmark a profile
- `unsaveProfile(profileId)` — remove bookmark
- `getSavedProfiles()` — list saved profiles
- `sendInquiry({ toProfileId, eventId, message, inquiryType })` — create inquiry + trigger email

```typescript
"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { revalidatePath } from "next/cache";

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// ── Genre and Service Constants ──

export const GENRE_OPTIONS = [
  "tech-house", "house", "minimal", "afro-house", "deep-house",
  "melodic-techno", "hard-techno", "drum-and-bass", "dubstep",
  "garage", "disco", "amapiano", "hip-hop", "r-and-b",
  "latin", "open-format", "multi-genre",
] as const;

export const SERVICES_BY_TYPE: Record<string, string[]> = {
  artist: ["dj-set", "live-pa", "b2b", "production", "vocalist"],
  photographer: ["event-photo", "portrait", "bts", "drone", "content-creation"],
  videographer: ["event-recap", "aftermovie", "drone", "livestream", "content-creation"],
  sound_production: ["pa-system", "sound-engineer", "dj-equipment", "monitors"],
  lighting_production: ["stage-lighting", "lasers", "led-walls", "visuals-vj", "haze-fog"],
  sponsor: ["beverage", "apparel", "tech", "media", "lifestyle"],
};

// ── Create Profile ──

export async function createMarketplaceProfile(data: {
  displayName: string;
  city: string;
  bio?: string;
  instagramHandle?: string;
  websiteUrl?: string;
  soundcloudUrl?: string;
  spotifyUrl?: string;
  genres?: string[];
  services?: string[];
  rateRange?: string;
  availability?: string;
  portfolioUrls?: string[];
  pastVenues?: string[];
}): Promise<{ error: string | null; slug: string | null }> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in", slug: null };

  const admin = createAdminClient();

  // Get user type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: userRow } = await (admin.from("users") as any)
    .select("user_type")
    .eq("id", user.id)
    .maybeSingle();

  if (!userRow) return { error: "User not found", slug: null };
  const userType = (userRow as { user_type: string }).user_type;

  // Check if profile already exists
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (admin.from("marketplace_profiles") as any)
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) return { error: "Profile already exists", slug: null };

  const slug = slugify(data.displayName) + "-" + Math.random().toString(36).slice(2, 8);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin.from("marketplace_profiles") as any).insert({
    user_id: user.id,
    user_type: userType,
    display_name: data.displayName,
    slug,
    bio: data.bio || null,
    city: data.city,
    instagram_handle: data.instagramHandle || null,
    website_url: data.websiteUrl || null,
    soundcloud_url: data.soundcloudUrl || null,
    spotify_url: data.spotifyUrl || null,
    genres: data.genres ?? [],
    services: data.services ?? [],
    rate_range: data.rateRange || null,
    availability: data.availability || null,
    portfolio_urls: data.portfolioUrls ?? [],
    past_venues: data.pastVenues ?? [],
  });

  if (error) return { error: (error as { message: string }).message, slug: null };
  return { error: null, slug };
}

// ── Update Profile ──

export async function updateMarketplaceProfile(data: {
  displayName?: string;
  bio?: string;
  city?: string;
  instagramHandle?: string;
  websiteUrl?: string;
  soundcloudUrl?: string;
  spotifyUrl?: string;
  genres?: string[];
  services?: string[];
  rateRange?: string;
  availability?: string;
  portfolioUrls?: string[];
  pastVenues?: string[];
  avatarUrl?: string;
  coverPhotoUrl?: string;
}): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in" };

  const admin = createAdminClient();

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (data.displayName !== undefined) updateData.display_name = data.displayName;
  if (data.bio !== undefined) updateData.bio = data.bio || null;
  if (data.city !== undefined) updateData.city = data.city;
  if (data.instagramHandle !== undefined) updateData.instagram_handle = data.instagramHandle || null;
  if (data.websiteUrl !== undefined) updateData.website_url = data.websiteUrl || null;
  if (data.soundcloudUrl !== undefined) updateData.soundcloud_url = data.soundcloudUrl || null;
  if (data.spotifyUrl !== undefined) updateData.spotify_url = data.spotifyUrl || null;
  if (data.genres !== undefined) updateData.genres = data.genres;
  if (data.services !== undefined) updateData.services = data.services;
  if (data.rateRange !== undefined) updateData.rate_range = data.rateRange || null;
  if (data.availability !== undefined) updateData.availability = data.availability || null;
  if (data.portfolioUrls !== undefined) updateData.portfolio_urls = data.portfolioUrls;
  if (data.pastVenues !== undefined) updateData.past_venues = data.pastVenues;
  if (data.avatarUrl !== undefined) updateData.avatar_url = data.avatarUrl || null;
  if (data.coverPhotoUrl !== undefined) updateData.cover_photo_url = data.coverPhotoUrl || null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin.from("marketplace_profiles") as any)
    .update(updateData)
    .eq("user_id", user.id);

  if (error) return { error: (error as { message: string }).message };
  revalidatePath("/dashboard/discover");
  return { error: null };
}

// ── Get Own Profile ──

export async function getMarketplaceProfile() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin.from("marketplace_profiles") as any)
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  return data;
}

// ── Get Profile by Slug ──

export async function getProfileBySlug(slug: string) {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin.from("marketplace_profiles") as any)
    .select("*, users(email, full_name)")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  return data;
}

// ── Search Profiles ──

export async function searchProfiles(filters: {
  query?: string;
  type?: string;
  city?: string;
  page?: number;
}): Promise<{ profiles: Record<string, unknown>[]; total: number }> {
  const admin = createAdminClient();
  const pageSize = 20;
  const page = filters.page ?? 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (admin.from("marketplace_profiles") as any)
    .select("*", { count: "exact" })
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1);

  if (filters.type && filters.type !== "all") {
    q = q.eq("user_type", filters.type);
  }
  if (filters.city) {
    q = q.ilike("city", `%${filters.city}%`);
  }
  if (filters.query) {
    q = q.or(`display_name.ilike.%${filters.query}%,bio.ilike.%${filters.query}%`);
  }

  const { data, count } = await q;
  return {
    profiles: (data ?? []) as Record<string, unknown>[],
    total: (count ?? 0) as number,
  };
}

// ── Save / Unsave Profile ──

export async function saveProfile(profileId: string): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in" };

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin.from("marketplace_saved") as any).insert({
    user_id: user.id,
    profile_id: profileId,
  });

  if (error && (error as { code: string }).code === "23505") {
    return { error: null }; // Already saved, idempotent
  }
  if (error) return { error: (error as { message: string }).message };
  return { error: null };
}

export async function unsaveProfile(profileId: string): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in" };

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin.from("marketplace_saved") as any)
    .delete()
    .eq("user_id", user.id)
    .eq("profile_id", profileId);

  if (error) return { error: (error as { message: string }).message };
  return { error: null };
}

export async function getSavedProfiles() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { profiles: [], savedIds: new Set<string>() };

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin.from("marketplace_saved") as any)
    .select("profile_id, marketplace_profiles(*)")
    .eq("user_id", user.id);

  const profiles = (data ?? []).map((d: { marketplace_profiles: Record<string, unknown> }) => d.marketplace_profiles);
  const savedIds = new Set((data ?? []).map((d: { profile_id: string }) => d.profile_id));

  return { profiles, savedIds };
}

// ── Send Inquiry ──

export async function sendInquiry(data: {
  toProfileId: string;
  eventId?: string;
  message: string;
  inquiryType?: string;
}): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in" };

  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin.from("marketplace_inquiries") as any).insert({
    from_user_id: user.id,
    to_profile_id: data.toProfileId,
    event_id: data.eventId || null,
    message: data.message || null,
    inquiry_type: data.inquiryType || "contact",
    status: "pending",
  });

  if (error) return { error: (error as { message: string }).message };

  // Fire-and-forget: send notification email
  try {
    // Get profile owner's email
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (admin.from("marketplace_profiles") as any)
      .select("display_name, user_id, users(email, full_name)")
      .eq("id", data.toProfileId)
      .maybeSingle();

    if (profile) {
      const ownerEmail = (profile as { users: { email: string } }).users?.email;
      if (ownerEmail) {
        // Get sender name
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: sender } = await (admin.from("users") as any)
          .select("full_name")
          .eq("id", user.id)
          .maybeSingle();

        const senderName = (sender as { full_name: string } | null)?.full_name ?? "Someone";

        void fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/marketplace-inquiry-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: ownerEmail,
            profileName: (profile as { display_name: string }).display_name,
            senderName,
            message: data.message,
          }),
        }).catch(() => {});
      }
    }
  } catch {
    // Non-blocking — inquiry is saved even if email fails
  }

  return { error: null };
}
```

- [ ] **Step 2: Run build to verify**

Run: `npx next build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/marketplace.ts
git commit -m "feat: add marketplace server actions (CRUD, search, save, inquiry)"
```

---

### Task 4: Update signup page with new user types

**Files:**
- Modify: `src/app/(auth)/signup/page.tsx`

- [ ] **Step 1: Expand UserType and type cards**

In the signup page, find the `UserType` type definition and the `typeCards` array. Replace them:

```typescript
type UserType = "collective" | "promoter" | "artist" | "venue" | "photographer" | "videographer" | "sound_production" | "lighting_production" | "sponsor";
```

Update the type selection cards array to include all 9 types. Group them with a "List yourself on the marketplace" subheading for the new types. Each card needs: `{ type, icon, label, description }`.

New cards to add:
- `{ type: "photographer", icon: Camera, label: "Photographer", description: "Showcase your portfolio and get booked for events" }`
- `{ type: "videographer", icon: Video, label: "Videographer", description: "Event recaps, aftermovies, and livestreams" }`
- `{ type: "sound_production", icon: Speaker, label: "Sound & Production", description: "PA systems, sound engineering, DJ equipment" }`
- `{ type: "lighting_production", icon: Lightbulb, label: "Lighting & Visuals", description: "Stage lighting, lasers, LED walls, VJ" }`
- `{ type: "sponsor", icon: BadgeDollarSign, label: "Sponsor / Brand", description: "Connect with events and collectives for partnerships" }`

Import the new icons: `Camera, Video, Speaker, Lightbulb, BadgeDollarSign` from lucide-react.

- [ ] **Step 2: Update post-signup routing**

In the signup success handler, add routing for new types. All new marketplace types should redirect to `/onboarding/marketplace`:

```typescript
const marketplaceTypes = ["photographer", "videographer", "sound_production", "lighting_production", "sponsor"];
if (marketplaceTypes.includes(selectedType)) {
  router.push("/onboarding/marketplace");
} else if (selectedType === "promoter") {
  router.push("/dashboard/promote");
} else if (selectedType === "artist") {
  router.push("/onboarding/marketplace"); // Artists also get marketplace profile
} else if (selectedType === "venue") {
  router.push("/onboarding/marketplace"); // Venues too
} else {
  router.push("/onboarding");
}
```

- [ ] **Step 3: Layout the type selector as two groups**

In the JSX, split the cards into two sections:
1. **Primary** (above): Collective card — larger, featured
2. **Also list yourself** (below): Grid of remaining 8 types with smaller cards

- [ ] **Step 4: Run build to verify**

Run: `npx next build`

- [ ] **Step 5: Commit**

```bash
git add src/app/(auth)/signup/page.tsx
git commit -m "feat: add 5 new marketplace user types to signup flow"
```

---

### Task 5: Update auth action to handle new types

**Files:**
- Modify: `src/app/actions/auth.ts`

- [ ] **Step 1: Expand accepted user types**

Update the `signUpUser` function's userType parameter type:

```typescript
userType?: "collective" | "promoter" | "artist" | "venue" | "photographer" | "videographer" | "sound_production" | "lighting_production" | "sponsor";
```

- [ ] **Step 2: Auto-create personal collective for all non-collective types**

The promoter already gets an auto-created collective. Extend this pattern to ALL non-collective user types so the dashboard layout works (it requires at least one collective_member row):

```typescript
const nonCollectiveTypes = ["promoter", "artist", "venue", "photographer", "videographer", "sound_production", "lighting_production", "sponsor"];
if (nonCollectiveTypes.includes(userType)) {
  const firstName = formData.fullName.split(" ")[0] || "My";
  const slug = `${firstName.toLowerCase().replace(/[^a-z0-9]/g, "")}-${userType.replace("_", "-")}-${newUser.user.id.replace(/-/g, "").slice(0, 12)}`;
  const { data: collective } = await admin.from("collectives").insert({
    name: `${firstName}'s ${userType === "promoter" ? "Promos" : "Profile"}`,
    slug,
    description: null,
    metadata: { auto_created: true, user_type: userType },
  }).select("id").single();

  if (collective) {
    await admin.from("collective_members").insert({
      collective_id: collective.id,
      user_id: newUser.user.id,
      role: userType,
    });
  }
}
```

- [ ] **Step 3: Update dashboard layout to skip onboarding for all marketplace types**

In `src/app/(dashboard)/layout.tsx`, update the onboarding redirect check:

```typescript
// Current: if (userType !== "promoter") { redirect("/onboarding"); }
// Change to:
const skipOnboarding = ["promoter", "artist", "venue", "photographer", "videographer", "sound_production", "lighting_production", "sponsor"];
if (!skipOnboarding.includes(userType ?? "")) {
  redirect("/onboarding");
}
```

- [ ] **Step 4: Run build to verify**

Run: `npx next build`

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/auth.ts src/app/(dashboard)/layout.tsx
git commit -m "feat: handle all marketplace user types in signup + auto-collective creation"
```

---

### Task 6: Build marketplace profile onboarding page

**Files:**
- Create: `src/app/onboarding/marketplace/page.tsx`

- [ ] **Step 1: Create the marketplace onboarding page**

This is a multi-step form (similar to existing onboarding) with these steps:
1. **Display name + City** (required fields)
2. **Bio + Instagram handle**
3. **Genres or Services** (tag picker — show genres for artists, services for others based on user_type)
4. **Rate range + Availability** (text fields)
5. **Portfolio links** (add up to 5 URLs)
6. **"You're listed!" confirmation** with link to their profile

The page should:
- Be a `"use client"` component
- Fetch the current user's `user_type` on mount to determine which tags to show
- Call `createMarketplaceProfile()` server action on submit
- Use the same visual style as `/onboarding` (AiBubble, NocturnLogo, dark theme)
- Pre-fill display_name from user's full_name
- Show genre tags for `artist` type, service tags for all others (from `SERVICES_BY_TYPE` in marketplace.ts)
- On completion, redirect to `/dashboard/discover/{slug}` to see their live profile

- [ ] **Step 2: Run build to verify**

Run: `npx next build`

- [ ] **Step 3: Commit**

```bash
git add src/app/onboarding/marketplace/page.tsx
git commit -m "feat: add marketplace profile onboarding flow"
```

---

## Phase 3: Discover Tab

### Task 7: Add Discover to dashboard navigation

**Files:**
- Modify: `src/components/dashboard-shell.tsx`

- [ ] **Step 1: Import Compass icon**

Add `Compass` to the lucide-react import.

- [ ] **Step 2: Add Discover to all nav arrays**

Add to `sidebarNavItems` (after Chat):
```typescript
{ href: "/dashboard/discover", label: "Discover", icon: Compass },
```

Add to `promoterSidebarItems` (after Promote):
```typescript
{ href: "/dashboard/discover", label: "Discover", icon: Compass },
```

Add to `mobileTabItems` — replace the current 4th item or add as 5th. If mobile only supports 4 tabs, add "Discover" and move the least-used item to "More" drawer.

- [ ] **Step 3: Run build to verify**

Run: `npx next build`

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard-shell.tsx
git commit -m "feat: add Discover tab to dashboard navigation"
```

---

### Task 8: Build Discover main page

**Files:**
- Create: `src/app/(dashboard)/dashboard/discover/page.tsx`

- [ ] **Step 1: Create the discover page**

Structure (follow venues page pattern):
- **Category filter tabs** at top: "All", "DJs", "Venues", "Collectives", "Promoters", "Photographers", "Videographers", "Sound", "Lighting", "Sponsors" — horizontal scrollable chips
- **Search bar** + **City filter** below tabs
- **Two-tab toggle**: "Discover" (browse) + "Saved" (bookmarks)
- **Profile card grid**: 2 columns mobile, 3 desktop (`grid-cols-2 md:grid-cols-3`)
- **Loading state**: Spinner
- **Empty state**: "No profiles found" with illustration

Map tab labels to `user_type` filter values:
```typescript
const CATEGORY_TABS = [
  { label: "All", value: "all" },
  { label: "DJs", value: "artist" },
  { label: "Venues", value: "venue" },
  { label: "Collectives", value: "collective" },
  { label: "Promoters", value: "promoter" },
  { label: "Photographers", value: "photographer" },
  { label: "Videographers", value: "videographer" },
  { label: "Sound", value: "sound_production" },
  { label: "Lighting", value: "lighting_production" },
  { label: "Sponsors", value: "sponsor" },
];
```

Use `searchProfiles()` server action with debounced query (200ms). Use `getSavedProfiles()` for saved tab.

PostHog tracking:
```typescript
posthog.capture("marketplace_search", { query, category: activeCategory, city: cityFilter });
```

- [ ] **Step 2: Run build to verify**

Run: `npx next build`

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/dashboard/discover/page.tsx
git commit -m "feat: build Discover marketplace browse page with search and filters"
```

---

### Task 9: Build profile card component

**Files:**
- Create: `src/app/(dashboard)/dashboard/discover/profile-card.tsx`

- [ ] **Step 1: Create the profile card**

A `"use client"` component that renders a marketplace profile as a card.

Props: `{ profile, isSaved, onSave, onUnsave }`

Layout:
- Cover photo area (120px tall, gradient fallback if no cover)
- Avatar circle overlapping cover/content boundary
- Display name (bold, truncated)
- Type badge (color-coded by user_type — use a color map)
- City
- Genre/service tags (max 3 visible, `+N more` if overflow)
- Rate range (if set)
- Bottom row: "Contact" button + heart/save toggle
- Entire card links to `/dashboard/discover/{slug}`

Type badge color map:
```typescript
const TYPE_COLORS: Record<string, string> = {
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
```

PostHog: capture `marketplace_profile_click` when card is clicked.

- [ ] **Step 2: Run build to verify**

Run: `npx next build`

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/dashboard/discover/profile-card.tsx
git commit -m "feat: add marketplace profile card component"
```

---

### Task 10: Build profile detail page

**Files:**
- Create: `src/app/(dashboard)/dashboard/discover/[slug]/page.tsx`

- [ ] **Step 1: Create the profile detail page**

Server component that fetches profile by slug via `getProfileBySlug()`.

Layout:
- Back button (ArrowLeft → /dashboard/discover)
- Cover photo (full width, 200px tall, gradient fallback)
- Avatar overlapping bottom of cover
- Display name + verified badge (if is_verified)
- Type badge + City
- Bio paragraph
- **Tags section**: All genres and/or services as chips
- **Rate range** (if set)
- **Availability** (if set)
- **Social links**: Instagram, SoundCloud, Spotify, Website — icon buttons
- **Portfolio**: List of URL cards (show domain + external link icon)
- **Past Venues**: Comma-separated list
- **Action buttons**: "Contact" (opens dialog) + "Save" (heart toggle)
- **404 handling**: If no profile found, show "Profile not found"

Import and render `ContactDialog` component (Task 11).

PostHog: capture `marketplace_profile_view` with `{ slug, user_type, city }`.

- [ ] **Step 2: Run build to verify**

Run: `npx next build`

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/dashboard/discover/[slug]/page.tsx
git commit -m "feat: add marketplace profile detail page"
```

---

### Task 11: Build contact/inquiry dialog

**Files:**
- Create: `src/app/(dashboard)/dashboard/discover/contact-dialog.tsx`

- [ ] **Step 1: Create the contact dialog**

A `"use client"` component using shadcn Dialog.

Props: `{ profileId, profileName, open, onOpenChange }`

Content:
- Dialog title: "Contact {profileName}"
- Optional event selector: dropdown of user's upcoming events (fetch via admin from events table)
- Message textarea (required, 500 char max)
- "Send Inquiry" button
- Loading state while sending
- Success state: "Your inquiry has been sent! They'll receive an email notification."
- Calls `sendInquiry()` server action

PostHog tracking on send:
```typescript
posthog.capture("marketplace_inquiry_sent", {
  category: profileType,
  city: profileCity,
  has_event: !!selectedEventId,
  source_page: "profile_detail",
});
```

- [ ] **Step 2: Run build to verify**

Run: `npx next build`

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/dashboard/discover/contact-dialog.tsx
git commit -m "feat: add marketplace contact/inquiry dialog"
```

---

### Task 12: Build inquiry notification email route

**Files:**
- Create: `src/app/api/marketplace-inquiry-email/route.ts`

- [ ] **Step 1: Create the email API route**

Simple POST handler that sends an email via Resend:

```typescript
import { NextResponse } from "next/server";

const RESEND_API_KEY = process.env.RESEND_API_KEY;

export async function POST(request: Request) {
  if (!RESEND_API_KEY || RESEND_API_KEY === "your_resend_api_key") {
    return NextResponse.json({ error: "Email not configured" }, { status: 503 });
  }

  const { to, profileName, senderName, message } = await request.json();

  if (!to || !profileName || !senderName) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Nocturn <noreply@trynocturn.com>",
        to,
        subject: `${senderName} wants to connect on Nocturn`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #7B2FF7;">New inquiry for ${escapeHtml(profileName)}</h2>
            <p><strong>${escapeHtml(senderName)}</strong> sent you a message on Nocturn:</p>
            <blockquote style="border-left: 3px solid #7B2FF7; padding-left: 12px; margin: 16px 0; color: #555;">
              ${escapeHtml(message || "No message provided.")}
            </blockquote>
            <p>
              <a href="https://app.trynocturn.com/dashboard" style="display: inline-block; background: #7B2FF7; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                View on Nocturn
              </a>
            </p>
            <p style="color: #888; font-size: 12px; margin-top: 24px;">Nocturn — You run the night. Nocturn runs the business.</p>
          </div>
        `,
      }),
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
```

- [ ] **Step 2: Run build to verify**

Run: `npx next build`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/marketplace-inquiry-email/route.ts
git commit -m "feat: add marketplace inquiry email notification"
```

---

## Phase 4: Analytics + AI Recommendations

### Task 13: Add artist performance to profile detail page

**Files:**
- Create: `src/app/actions/marketplace-analytics.ts`
- Modify: `src/app/(dashboard)/dashboard/discover/[slug]/page.tsx`

- [ ] **Step 1: Create the analytics server action**

```typescript
"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

export async function getProfilePerformanceWithCollective(profileUserId: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();

  // Get viewer's collective
  const { data: membership } = await (admin.from("collective_members") as any)
    .select("collective_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) return null;
  const collectiveId = (membership as { collective_id: string }).collective_id;

  // Find artist record linked to this profile user
  const { data: artist } = await (admin.from("artists") as any)
    .select("id")
    .eq("user_id", profileUserId)
    .maybeSingle();

  if (!artist) return null;
  const artistId = (artist as { id: string }).id;

  // Get collective's events
  const { data: events } = await (admin.from("events") as any)
    .select("id")
    .eq("collective_id", collectiveId);

  if (!events || (events as { id: string }[]).length === 0) return null;
  const eventIds = (events as { id: string }[]).map(e => e.id);

  // Get bookings for this artist at these events
  const { data: bookings } = await (admin.from("event_artists") as any)
    .select("event_id, events(starts_at, title)")
    .eq("artist_id", artistId)
    .in("event_id", eventIds)
    .neq("status", "cancelled");

  if (!bookings || (bookings as unknown[]).length === 0) return null;

  // Get tickets for those events
  const bookedEventIds = [...new Set((bookings as { event_id: string }[]).map(b => b.event_id))];
  const { data: tickets } = await (admin.from("tickets") as any)
    .select("id, event_id")
    .in("event_id", bookedEventIds)
    .neq("status", "refunded");

  const ticketsByEvent: Record<string, number> = {};
  for (const t of (tickets ?? []) as { event_id: string }[]) {
    ticketsByEvent[t.event_id] = (ticketsByEvent[t.event_id] || 0) + 1;
  }

  const totalEvents = bookedEventIds.length;
  const totalTickets = Object.values(ticketsByEvent).reduce((s, n) => s + n, 0);
  const avgPerEvent = totalEvents > 0 ? Math.round(totalTickets / totalEvents) : 0;

  // Last booked
  const sortedBookings = (bookings as { events: { starts_at: string; title: string } }[])
    .filter(b => b.events?.starts_at)
    .sort((a, b) => new Date(b.events.starts_at).getTime() - new Date(a.events.starts_at).getTime());

  const lastBooked = sortedBookings[0]?.events?.starts_at ?? null;

  return {
    totalEvents,
    totalTickets,
    avgPerEvent,
    lastBooked,
  };
}

export async function getRecommendations(): Promise<{ recommendations: string[] }> {
  // Placeholder: In Phase 4 this will call Claude to generate recommendations
  // based on the collective's past events, genres, and city
  return { recommendations: [] };
}
```

- [ ] **Step 2: Add performance section to profile detail page**

In the `[slug]/page.tsx`, after the profile info section, add a "Performance with your collective" card that shows the stats returned by `getProfilePerformanceWithCollective()`. Only render it if the profile is an artist/DJ type AND there's data to show.

```tsx
{performance && (
  <Card className="rounded-2xl border-nocturn/20">
    <CardHeader>
      <CardTitle className="text-base flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-nocturn" />
        Performance with your collective
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-2xl font-bold">{performance.totalEvents}</p>
          <p className="text-xs text-muted-foreground">Events played</p>
        </div>
        <div>
          <p className="text-2xl font-bold">{performance.totalTickets}</p>
          <p className="text-xs text-muted-foreground">Tickets sold</p>
        </div>
        <div>
          <p className="text-2xl font-bold">{performance.avgPerEvent}</p>
          <p className="text-xs text-muted-foreground">Avg per event</p>
        </div>
        <div>
          <p className="text-sm">{lastBookedFormatted}</p>
          <p className="text-xs text-muted-foreground">Last booked</p>
        </div>
      </div>
    </CardContent>
  </Card>
)}
```

- [ ] **Step 3: Run build to verify**

Run: `npx next build`

- [ ] **Step 4: Commit**

```bash
git add src/app/actions/marketplace-analytics.ts src/app/(dashboard)/dashboard/discover/[slug]/page.tsx
git commit -m "feat: add artist performance analytics to marketplace profile"
```

---

### Task 14: Add marketplace dashboard stats for non-collective users

**Files:**
- Modify: `src/app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Check user type on dashboard home**

On the main dashboard page, check the user's type. If they're a marketplace type (not collective), show:
- Profile views nudge: "Complete your profile to get discovered"
- Inquiries received count
- "Edit your profile" quick link → `/onboarding/marketplace` or a dedicated edit page

This is a lightweight addition — read their marketplace_profile, count inquiries where `to_profile_id` matches their profile, and display a small card.

- [ ] **Step 2: Run build to verify**

Run: `npx next build`

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/dashboard/page.tsx
git commit -m "feat: show marketplace stats on dashboard for non-collective users"
```

---

### Task 15: Final build check + cleanup

- [ ] **Step 1: Run full build**

Run: `npx next build`
Expected: Clean build with no errors. Verify all new routes appear:
- `/dashboard/discover`
- `/dashboard/discover/[slug]`
- `/onboarding/marketplace`
- `/api/marketplace-inquiry-email`

- [ ] **Step 2: Verify routes in build output**

Check the build output includes:
```
├ ƒ /dashboard/discover
├ ƒ /dashboard/discover/[slug]
├ ○ /onboarding/marketplace
├ ƒ /api/marketplace-inquiry-email
```

- [ ] **Step 3: Commit all remaining changes**

```bash
git add -A
git commit -m "feat: complete Discover Marketplace (Phase 1-4)"
```

---

## What's NOT built (by design)

Per spec, these are explicitly deferred:
- No payments or booking flow — just contact/inquiry
- No reviews or ratings
- No automated matching algorithm — just search + AI recommendations (placeholder)
- No chat between marketplace users — email notifications only
- No Stripe Connect for marketplace transactions
- AI recommendations in Phase 4 uses a placeholder — implement with Claude API in a follow-up
