"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { ContactList } from "@/components/people/contact-list";
import { ImportSheet } from "@/components/people/import-sheet";
import { ContactDetailSheet } from "@/components/people/contact-detail-sheet";
import { Button } from "@/components/ui/button";
import { Upload, MessageSquare } from "lucide-react";
import Link from "next/link";

export default function AudiencePage() {
  const [collectiveId, setCollectiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    null
  );
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch user's active collective
  useEffect(() => {
    async function fetchCollective() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: memberships } = await supabase
        .from("collective_members")
        .select("collective_id")
        .eq("user_id", user.id)
        .is("deleted_at", null);

      const id =
        (
          memberships as { collective_id: string }[] | null
        )?.[0]?.collective_id ?? null;
      setCollectiveId(id);
      setLoading(false);
    }
    fetchCollective();
  }, []);

  const handleImportComplete = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-nocturn border-t-transparent" />
          <p className="text-xs text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // No collective
  if (!collectiveId) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-muted-foreground">
          No collective found. Join or create one to manage your fans.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">
            Your Fans
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage and grow your audience
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link href="/dashboard/marketing">
            <Button
              variant="outline"
              size="sm"
              className="min-h-[44px] gap-1.5"
            >
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">DM Templates</span>
            </Button>
          </Link>
          <Button
            size="sm"
            className="min-h-[44px] gap-1.5 bg-nocturn hover:bg-nocturn-light text-white"
            onClick={() => setImportOpen(true)}
          >
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Import</span>
          </Button>
        </div>
      </div>

      {/* Contact list */}
      <ContactList
        key={refreshKey}
        collectiveId={collectiveId}
        contactType="fan"
        onContactClick={(id) => setSelectedContactId(id)}
      />

      {/* Import sheet */}
      <ImportSheet
        open={importOpen}
        onOpenChange={setImportOpen}
        collectiveId={collectiveId}
        contactType="fan"
        onImportComplete={handleImportComplete}
      />

      {/* Contact detail sheet */}
      <ContactDetailSheet
        contactId={selectedContactId}
        onClose={() => setSelectedContactId(null)}
        collectiveId={collectiveId}
        onContactUpdated={handleImportComplete}
      />
    </div>
  );
}
