"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { rateLimitStrict } from "@/lib/rate-limit";

export async function signUpUser(formData: {
  email: string;
  password: string;
  fullName: string;
  userType?: string;
}) {
  try {
  // Input validation
  if (!formData.email?.trim()) return { error: "Email is required" };
  if (!formData.password || formData.password.length < 8) return { error: "Password must be at least 8 characters" };
  if (!formData.fullName?.trim()) return { error: "Full name is required" };
  if (formData.fullName.length > 200) return { error: "Full name must be 200 characters or fewer" };
  if (formData.email.length > 320) return { error: "Email is too long" };

  // Rate limit: 3 attempts per 5 minutes per email
  const rl = await rateLimitStrict(`signup:${formData.email}`, 3, 5 * 60 * 1000);
  if (!rl.success) {
    return { error: "Too many signup attempts. Please try again in a few minutes." };
  }

  const admin = createAdminClient();
  const userType = formData.userType ?? "collective";

  // Beta gate: all new signups require manual approval.
  const requiresApproval = true;
  const isApproved = false;

  // Create user with auto-confirm via admin API (no email confirmation needed)
  const { data: newUser, error: createError } = await admin.auth.admin.createUser({
    email: formData.email,
    password: formData.password,
    email_confirm: true,
    user_metadata: { full_name: formData.fullName, user_type: userType },
  });

  if (createError) {
    console.error("[signup] createUser failed:", {
      message: createError.message,
      status: "status" in createError ? createError.status : undefined,
      code: "code" in createError ? createError.code : undefined,
      name: createError.name,
    });
    // Surface specific errors to the user instead of a generic failure.
    const msg = (createError.message ?? "").toLowerCase();
    if (
      msg.includes("already been registered") ||
      msg.includes("email_exists") ||
      msg.includes("already exists") ||
      msg.includes("user already registered")
    ) {
      return { error: "That email is already registered. Try signing in instead." };
    }
    if (msg.includes("password")) {
      return { error: "Password must be at least 8 characters." };
    }
    if (msg.includes("email") && msg.includes("invalid")) {
      return { error: "Please enter a valid email address." };
    }
    if (msg.includes("rate limit") || msg.includes("too many")) {
      return { error: "Too many signup attempts. Please wait a few minutes and try again." };
    }
    if (
      msg.includes("invalid api key") ||
      msg.includes("invalid jwt") ||
      msg.includes("unauthorized") ||
      msg.includes("forbidden")
    ) {
      return { error: "Signup is temporarily unavailable due to a server configuration issue." };
    }
    return { error: "Failed to create account. Please try again." };
  }

  const userId = newUser.user.id;

  // Insert public.users row
  const { error: usersInsertError } = await admin.from("users")
    .upsert(
      {
        id: userId,
        email: formData.email,
        full_name: formData.fullName,
        is_approved: isApproved,
      },
      { onConflict: "id" }
    );
  if (usersInsertError) {
    console.error("[signup] users insert failed:", usersInsertError.message);
  }

  // Create a parties record (person) and link it to the user
  const { data: personParty, error: personPartyError } = await admin
    .from("parties")
    .insert({ type: "person", display_name: formData.fullName })
    .select("id")
    .maybeSingle();
  if (personPartyError) {
    console.error("[signup] parties insert failed:", personPartyError.message);
  }
  if (personParty) {
    await admin.from("users").update({ party_id: personParty.id }).eq("id", userId);
    await admin.from("party_roles").insert({
      party_id: personParty.id,
      role: "platform_user",
      collective_id: null,
    });
  }

  // For all non-collective types: auto-create a personal collective so they satisfy the
  // dashboard layout's "must have ≥1 collective membership" requirement
  if (userType !== "collective") {
    const firstName = formData.fullName.split(" ")[0] || "My";
    const collectiveName = `${firstName}'s ${
      userType === "promoter" ? "Promos" : userType === "host" ? "Events" : "Profile"
    }`;
    // Use 12 chars of UUID to reduce slug collision risk
    const slug = `${firstName.toLowerCase().replace(/[^a-z0-9]/g, "")}-${userType.replace("_", "-")}-${userId.replace(/-/g, "").slice(0, 12)}`;
    const { data: collective, error: collectiveError } = await admin
      .from("collectives")
      .insert({
        name: collectiveName,
        slug,
      })
      .select("id")
      .maybeSingle();

    if (collectiveError) {
      console.error(`[signup] Failed to create ${userType} collective:`, collectiveError.message);
      // Non-fatal — user can still use the app, dashboard layout handles missing collective
    }

    if (collective) {
      const { error: memberError } = await admin.from("collective_members").insert({
        collective_id: collective.id,
        user_id: userId,
        role: userType === "promoter" ? "promoter" : userType === "host" ? "owner" : "admin",
      });
      if (memberError) {
        console.error(`[signup] Failed to add ${userType} as collective member:`, memberError.message);
      }
    }
  }

  // Await email sends — Vercel's serverless lambda freezes the moment this
  // action returns, killing any in-flight fetch(). Previously these were
  // fire-and-forget (`.catch(() => {})`) which ate the promise AND the
  // error, so silent Resend 422s (from the wrong FROM address) were
  // completely invisible. `Promise.allSettled` keeps one failure from
  // blocking the other, and lets the user finish signup even if email
  // delivery fails.
  const emailTasks: Promise<unknown>[] = [
    sendWelcomeEmail(formData.email, formData.fullName, userType),
  ];
  if (requiresApproval) {
    emailTasks.push(
      sendApprovalRequestEmail(userId, formData.email, formData.fullName, userType)
    );
  }
  await Promise.allSettled(emailTasks);

  // Sign in the user so they get a session cookie
  const supabase = await createServerClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: formData.email,
    password: formData.password,
  });

  if (signInError) {
    console.error("[signUpUser] sign-in after signup failed:", signInError.message);
    return { error: "Account created but sign-in failed. Please try logging in." };
  }

  return { error: null };
  } catch (err) {
    console.error("[signUpUser] Unexpected error:", err);
    return { error: "Something went wrong" };
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function sendWelcomeEmail(email: string, name: string, userType: string) {
  // Route through the shared sendEmail helper so welcome emails get:
  //   - retries (3 attempts, 1s backoff, 4xx vs 5xx awareness)
  //   - consistent FROM address (RESEND_FROM_EMAIL via FROM_EMAIL constant)
  //   - dev-mode skip guard
  //
  // Previously this fired a raw fetch() to Resend with the literal FROM
  // `Nocturn <nocturn@trynocturn.com>` which does NOT match the verified
  // identity `noreply@trynocturn.com` — every welcome email was being
  // silently rejected with a 422 and the `catch {}` was eating the error.
  const { sendEmail } = await import("@/lib/email/send");
  const safeName = escapeHtml(name.split(" ")[0]);

  const typeMessages: Record<string, string> = {
    collective: "You're all set to create events, sell tickets, and grow your collective. Start by creating your first event — our AI will help you set everything up.",
    host: "You're ready to throw your first night. Create an event, invite your people, and collect RSVPs in minutes. Want to sell tickets later? Flip the switch whenever you're ready.",
    promoter: "You're ready to start promoting. Find events, grab your link, and share it with your network. Every ticket sold through your link is tracked automatically.",
    artist: "Your profile is live on the Nocturn directory. Collectives in your city can now discover and book you. Fill out your SoundCloud and Spotify to stand out.",
    venue: "Your venue is listed on Nocturn. Promoters can now find your space and reach out for bookings. Add your capacity and pricing to attract the right events.",
    photographer: "Your photography profile is live on the Nocturn marketplace. Start getting discovered by collectives and promoters.",
    videographer: "Your videography profile is live on the Nocturn marketplace. Start getting discovered by collectives and promoters.",
    sound_production: "Your sound & production profile is live on the Nocturn marketplace. Connect with event organizers looking for audio services.",
    lighting_production: "Your lighting & visuals profile is live on the Nocturn marketplace. Connect with event organizers looking for production services.",
    sponsor: "Your brand profile is live on the Nocturn marketplace. Discover partnership opportunities with collectives and events.",
    artist_manager: "Your artist management profile is live on the Nocturn marketplace. Connect with talent and event organizers.",
    tour_manager: "Your tour management profile is live on the Nocturn marketplace. Connect with artists and event organizers.",
    booking_agent: "Your booking agent profile is live on the Nocturn marketplace. Discover talent and venues looking for bookings.",
    event_staff: "Your event staff profile is live on the Nocturn marketplace. Get discovered by collectives looking for crew.",
    mc_host: "Your MC & host profile is live on the Nocturn marketplace. Get booked for events and shows.",
    graphic_designer: "Your design profile is live on the Nocturn marketplace. Connect with collectives looking for creative work.",
    pr_publicist: "Your PR profile is live on the Nocturn marketplace. Connect with artists and collectives looking for media outreach.",
  };

  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; background: #09090B; color: #FAFAFA;">
      <div style="margin-bottom: 32px;">
        <span style="color: #7B2FF7; font-weight: 700; font-size: 20px;">nocturn.</span>
      </div>
      <h1 style="font-size: 28px; font-weight: 800; margin: 0 0 16px; line-height: 1.2;">
        Welcome, ${safeName}.
      </h1>
      <p style="color: #A1A1AA; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
        ${typeMessages[userType] || typeMessages.collective}
      </p>
      <a href="https://app.trynocturn.com/dashboard" style="display: inline-block; background: #7B2FF7; color: white; padding: 12px 28px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 14px;">
        Open Nocturn
      </a>
      <p style="color: #71717A; font-size: 12px; margin-top: 40px; line-height: 1.5;">
        You run the night. Nocturn runs the business.<br>
        <a href="https://trynocturn.com" style="color: #7B2FF7; text-decoration: none;">trynocturn.com</a>
      </p>
    </div>
  `;

  const result = await sendEmail({
    to: email,
    subject: `Welcome to Nocturn, ${safeName}`,
    html,
  });
  if (result.error) {
    console.error("[signup] welcome email failed:", result.error);
  }
}

// TODO(audit): enforce slug regex /^[a-z0-9][a-z0-9-]{1,79}$/, sanitize instagram/website, trim description
export async function createCollective(formData: {
  name: string;
  slug: string;
  description: string | null;
  city: string;
  instagram: string | null;
  website: string | null;
}) {
  try {
  // Required field validation
  if (!formData.name?.trim()) return { error: "Collective name is required" };
  if (!formData.slug?.trim()) return { error: "Slug is required" };
  if (!formData.city?.trim()) return { error: "City is required" };

  // Input length validation
  if (formData.name.length > 100) {
    return { error: "Collective name must be 100 characters or fewer." };
  }
  if (formData.slug.length > 100) {
    return { error: "Slug must be 100 characters or fewer." };
  }
  // description, instagram, website are accepted for backwards-compatibility but not persisted
  if (formData.city.length > 100) {
    return { error: "City must be 100 characters or fewer." };
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.error("createCollective: No user session found");
    return { error: "You must be logged in. Please refresh the page and try again." };
  }

  // Rate limit: 5 per minute per user
  const rl = await rateLimitStrict(`createCollective:${user.id}`, 5, 60 * 1000);
  if (!rl.success) {
    return { error: "Too many requests. Please try again in a minute." };
  }

  // Use admin client to bypass RLS for initial collective + member creation
  const admin = createAdminClient();

  // Ensure user record exists in users table (FK requirement)
  const { data: existingUser } = await admin
    .from("users")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!existingUser) {
    await admin.from("users").insert({
      id: user.id,
      email: user.email ?? "",
      full_name: user.user_metadata?.full_name ?? (user.email ? user.email.split("@")[0] : "User"),
      is_approved: true,
    });
  }

  // Pre-check: collective name / slug must be unique. Check both because two
  // visually-different names can collide on slug ("Midnight Society" and
  // "midnight society" both slugify to "midnight-society"), and two
  // visually-similar names can have different slugs ("MidnightSociety" vs
  // "Midnight Society"). Surface a clear, actionable error in either case
  // instead of letting the DB unique constraint fire as a generic 500.
  const { data: existingBySlug } = await admin
    .from("collectives")
    .select("id")
    .eq("slug", formData.slug)
    .maybeSingle();

  if (existingBySlug) {
    return { error: "That collective name is already taken. Try a different one." };
  }

  const { data: existingByName } = await admin
    .from("collectives")
    .select("id")
    .ilike("name", formData.name)
    .maybeSingle();

  if (existingByName) {
    return { error: "That collective name is already taken. Try a different one." };
  }

  // Create collective
  const { data: collective, error: collectiveError } = await admin
    .from("collectives")
    .insert({
      name: formData.name,
      slug: formData.slug,
      city: formData.city,
    })
    .select("id")
    .maybeSingle();

  if (collectiveError) {
    console.error("[createCollective] insert error:", collectiveError.message);
    // Race condition: another signup grabbed the slug between our pre-check
    // and the insert. Postgres unique-constraint violations come back as
    // code 23505. Surface the same friendly message either way.
    const msg = collectiveError.message.toLowerCase();
    if (
      collectiveError.code === "23505" ||
      msg.includes("duplicate key") ||
      msg.includes("unique constraint") ||
      msg.includes("already exists")
    ) {
      return { error: "That collective name is already taken. Try a different one." };
    }
    return { error: "Failed to create collective" };
  }
  if (!collective) return { error: "Failed to create collective" };

  // Create a parties record (organization) for this collective and link it
  const { data: orgParty, error: orgPartyError } = await admin
    .from("parties")
    .insert({ type: "organization", display_name: formData.name })
    .select("id")
    .maybeSingle();
  if (orgPartyError) {
    console.error("[createCollective] parties insert error:", orgPartyError.message);
  }
  if (orgParty) {
    await admin.from("collectives").update({ party_id: orgParty.id }).eq("id", collective.id);
    await admin.from("party_roles").insert({
      party_id: orgParty.id,
      role: "collective",
      collective_id: collective.id,
    });
  }

  // Add user as admin
  const { error: memberError } = await admin
    .from("collective_members")
    .insert({
      collective_id: collective.id,
      user_id: user.id,
      role: "admin",
    });

  if (memberError) {
    console.error("[createCollective] member insert error:", memberError.message);
    return { error: "Failed to add you as admin" };
  }

  // Seed a #general channel so the team chat isn't empty on first load.
  // Best-effort — the Messages page also has a lazy-create fallback, but
  // landing on a populated chat is a better first impression than an empty
  // state asking the operator to create a conversation themselves.
  const { error: channelError } = await admin
    .from("channels")
    .insert({ collective_id: collective.id, name: "General", type: "general", created_by: user.id });
  if (channelError) {
    console.error("[createCollective] general channel seed error (non-blocking):", channelError.message);
  }

  return { error: null };
  } catch (err) {
    console.error("[createCollective] Unexpected error:", err);
    return { error: "Something went wrong" };
  }
}

async function sendApprovalRequestEmail(userId: string, email: string, name: string, userType: string) {
  // Same treatment as sendWelcomeEmail: route through the shared helper so
  // we get retries, a consistent verified FROM, and errors we can actually
  // see. The previous raw-fetch version hardcoded `nocturn@trynocturn.com`
  // — not the verified Resend identity — and wrapped everything in an
  // empty catch, so approval notifications were silently dropping and
  // Shawn was only finding out about new signups via Supabase dashboard.
  const { sendEmail } = await import("@/lib/email/send");

  // Use HMAC-signed tokens instead of raw secret in URLs
  const { generateApprovalUrls } = await import("@/app/api/approve-user/route");
  const { approveUrl } = generateApprovalUrls(userId);
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);

  const adminEmail = process.env.ADMIN_EMAIL || "shawn@trynocturn.com";

  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 24px; background: #09090B; color: #FAFAFA;">
      <div style="margin-bottom: 32px;">
        <span style="color: #7B2FF7; font-weight: 700; font-size: 20px;">nocturn.</span>
        <span style="color: #71717A; font-size: 14px; margin-left: 8px;">Account Approval</span>
      </div>
      <h1 style="font-size: 24px; font-weight: 800; margin: 0 0 16px;">
        New ${userType} signup
      </h1>
      <div style="background: #18181B; border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <p style="color: #FAFAFA; font-size: 16px; font-weight: 600; margin: 0 0 4px;">${safeName}</p>
        <p style="color: #A1A1AA; font-size: 14px; margin: 0 0 4px;">${safeEmail}</p>
        <p style="color: #71717A; font-size: 13px; margin: 0;">Type: ${userType}</p>
      </div>
      <div style="display: flex; gap: 12px;">
        <a href="${approveUrl}" style="display: inline-block; background: #2DD4BF; color: #09090B; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 700; font-size: 15px;">
          Approve
        </a>
      </div>
      <p style="color: #71717A; font-size: 12px; margin-top: 32px;">
        Click Approve to give them full access.
      </p>
    </div>
  `;

  const result = await sendEmail({
    to: adminEmail,
    subject: `New ${userType} signup needs approval: ${name}`,
    html,
  });
  if (result.error) {
    console.error("[signup] approval request email failed:", result.error);
  }
}
