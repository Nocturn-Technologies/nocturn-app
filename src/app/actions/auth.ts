"use server";

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

// Admin client with service role — only use on the server
function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function signUpUser(formData: {
  email: string;
  password: string;
  fullName: string;
}) {
  const admin = createAdminClient();

  // Create user with auto-confirm via admin API
  const { data: newUser, error: createError } = await admin.auth.admin.createUser({
    email: formData.email,
    password: formData.password,
    email_confirm: true,
    user_metadata: { full_name: formData.fullName },
  });

  if (createError) {
    return { error: createError.message };
  }

  // Insert into users table using service role (bypasses RLS)
  const { error: profileError } = await admin.from("users").insert({
    id: newUser.user.id,
    email: formData.email,
    full_name: formData.fullName,
  });

  if (profileError) {
    console.error("Profile creation error:", profileError);
    // Non-blocking — user is already created
  }

  // Now sign in the user so they get a session
  const supabase = await createServerClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: formData.email,
    password: formData.password,
  });

  if (signInError) {
    return { error: signInError.message };
  }

  return { error: null };
}

export async function createCollective(formData: {
  name: string;
  slug: string;
  description: string | null;
  city: string;
  instagram: string | null;
  website: string | null;
}) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.error("createCollective: No user session found");
    return { error: "You must be logged in. Please refresh the page and try again." };
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
      email: user.email!,
      full_name: user.user_metadata?.full_name ?? user.email!.split("@")[0],
    });
  }

  // Create collective
  const { data: collective, error: collectiveError } = await admin
    .from("collectives")
    .insert({
      name: formData.name,
      slug: formData.slug,
      description: formData.description,
      instagram: formData.instagram,
      website: formData.website,
      metadata: { city: formData.city },
    })
    .select("id")
    .single();

  if (collectiveError) {
    return { error: collectiveError.message };
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
    return { error: memberError.message };
  }

  return { error: null };
}
