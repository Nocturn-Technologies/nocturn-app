"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, MessageSquare, Calendar, User } from "lucide-react";

interface Inquiry {
  id: string;
  message: string | null;
  inquiry_type: string;
  status: string;
  created_at: string;
  from_user: { full_name: string; email: string } | null;
  event: { title: string } | null;
}

export default function InquiriesPage() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInquiries();
  }, []);

  async function loadInquiries() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get marketplace profile first
    const { data: profile } = await supabase
      .from("marketplace_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile) {
      setLoading(false);
      return;
    }

    // Get inquiries for this profile
    const { data } = await supabase
      .from("marketplace_inquiries")
      .select("id, message, inquiry_type, status, created_at, from_user_id")
      .eq("to_profile_id", profile.id)
      .order("created_at", { ascending: false });

    // Fetch sender names
    const enriched: Inquiry[] = [];
    for (const inq of data ?? []) {
      const { data: sender } = await supabase
        .from("users")
        .select("full_name, email")
        .eq("id", inq.from_user_id)
        .maybeSingle();

      enriched.push({
        id: inq.id,
        message: inq.message,
        inquiry_type: inq.inquiry_type,
        status: inq.status,
        created_at: inq.created_at,
        from_user: sender ? { full_name: sender.full_name, email: sender.email } : null,
        event: null,
      });
    }

    setInquiries(enriched);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-nocturn" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Inquiries</h1>
        <p className="text-sm text-muted-foreground">
          Messages from collectives and promoters who want to work with you
        </p>
      </div>

      {inquiries.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-nocturn/10 flex items-center justify-center mb-4">
            <MessageSquare className="h-6 w-6 text-nocturn" />
          </div>
          <h3 className="font-semibold text-lg mb-1">No inquiries yet</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            When collectives find you on Discover and want to work together, their messages will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {inquiries.map((inq) => (
            <div
              key={inq.id}
              className="rounded-xl border border-border bg-card p-4 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-nocturn/20 flex items-center justify-center">
                    <User className="h-4 w-4 text-nocturn" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">
                      {inq.from_user?.full_name ?? "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {inq.from_user?.email}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    inq.status === "pending"
                      ? "bg-amber-500/10 text-amber-400"
                      : inq.status === "accepted"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-zinc-500/10 text-zinc-400"
                  }`}>
                    {inq.status}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(inq.created_at).toLocaleDateString("en", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              </div>

              {inq.message && (
                <div className="bg-background rounded-lg p-3 text-sm text-foreground/90">
                  {inq.message}
                </div>
              )}

              {inq.inquiry_type !== "general" && (
                <p className="text-xs text-muted-foreground">
                  Type: {inq.inquiry_type}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
