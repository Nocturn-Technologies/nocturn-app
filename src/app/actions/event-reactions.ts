"use server";

// event_reactions table was dropped in the 2026-04-19 schema rebuild.
// These are safe stubs so the public event page doesn't throw server errors.
// Re-implement when the table is restored.

export async function addReaction(_input: {
  eventId: string;
  emoji: string;
  fingerprint: string;
}) {
  return { error: null };
}

export async function getReactionsByFingerprint(
  _eventId: string,
  _fingerprint: string
): Promise<string[]> {
  return [];
}
