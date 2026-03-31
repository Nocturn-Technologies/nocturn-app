"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ContactDialog } from "../contact-dialog";
import { saveProfile, unsaveProfile, isProfileSaved } from "@/app/actions/marketplace";
import { haptic } from "@/lib/haptics";
import { Heart, MessageSquare, Loader2 } from "lucide-react";

interface ProfileActionsProps {
  profileId: string;
  profileName: string;
}

export function ProfileActions({ profileId, profileName }: ProfileActionsProps) {
  const [contactOpen, setContactOpen] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Check if this specific profile is saved (lightweight query)
  useEffect(() => {
    isProfileSaved(profileId).then(setIsSaved);
  }, [profileId]);

  async function handleToggleSave() {
    if (saving) return;
    haptic("light");
    setSaving(true);
    setSaveError(null);

    try {
      if (isSaved) {
        setIsSaved(false);
        const { error } = await unsaveProfile(profileId);
        if (error) {
          setIsSaved(true);
          setSaveError(error);
          setTimeout(() => setSaveError(null), 3000);
        }
      } else {
        setIsSaved(true);
        const { error } = await saveProfile(profileId);
        if (error) {
          setIsSaved(false);
          setSaveError(error);
          setTimeout(() => setSaveError(null), 3000);
        }
      }
    } catch {
      setSaveError("Something went wrong");
      setTimeout(() => setSaveError(null), 3000);
    }

    setSaving(false);
  }

  return (
    <>
      <div className="flex gap-3">
        <Button
          className="flex-1 bg-nocturn hover:bg-nocturn-light text-white min-h-[44px]"
          onClick={() => setContactOpen(true)}
        >
          <MessageSquare className="mr-2 h-4 w-4" />
          Contact
        </Button>
        <Button
          variant="outline"
          className={`min-h-[44px] min-w-[44px] ${
            isSaved
              ? "text-red-400 border-red-400/30 hover:bg-red-400/10"
              : ""
          }`}
          onClick={handleToggleSave}
          disabled={saving}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Heart
              className={`h-4 w-4 ${isSaved ? "fill-red-400" : ""}`}
            />
          )}
          <span className="ml-2">{isSaved ? "Saved" : "Save"}</span>
        </Button>
      </div>

      {saveError && (
        <p className="text-xs text-destructive mt-2">{saveError}</p>
      )}

      <ContactDialog
        profileId={profileId}
        profileName={profileName}
        open={contactOpen}
        onOpenChange={setContactOpen}
      />
    </>
  );
}
