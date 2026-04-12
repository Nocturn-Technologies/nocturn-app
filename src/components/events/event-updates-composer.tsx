"use client";

import { useState, useTransition } from "react";
import { Megaphone, Mail, Loader2, Trash2, Check } from "lucide-react";
import {
  postEventUpdate,
  deleteEventUpdate,
  type EventUpdate,
} from "@/app/actions/event-updates";

interface EventUpdatesComposerProps {
  eventId: string;
  initialUpdates: EventUpdate[];
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric" });
}

const MAX_LEN = 2000;

export function EventUpdatesComposer({ eventId, initialUpdates }: EventUpdatesComposerProps) {
  const [updates, setUpdates] = useState<EventUpdate[]>(initialUpdates);
  const [body, setBody] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function handlePost() {
    setError(null);
    setSuccess(null);
    const trimmed = body.trim();
    if (trimmed.length === 0) {
      setError("Write something first");
      return;
    }
    if (trimmed.length > MAX_LEN) {
      setError(`Message must be under ${MAX_LEN.toLocaleString()} characters`);
      return;
    }
    startTransition(async () => {
      const result = await postEventUpdate(eventId, trimmed, { sendEmail });
      if (result.error || !result.updateId) {
        setError(result.error ?? "Failed to post");
        return;
      }
      // Optimistically prepend
      const newUpdate: EventUpdate = {
        id: result.updateId,
        body: trimmed,
        author_name: null,
        created_at: new Date().toISOString(),
        email_sent: sendEmail,
        recipient_count: 0,
      };
      setUpdates((prev) => [newUpdate, ...prev]);
      setBody("");
      setSuccess(sendEmail ? "Posted and emailing attendees..." : "Posted.");
      // Auto-clear success after a few seconds
      setTimeout(() => setSuccess(null), 4000);
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this update? This cannot be undone.")) return;
    setDeletingId(id);
    startTransition(async () => {
      const result = await deleteEventUpdate(id);
      setDeletingId(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      setUpdates((prev) => prev.filter((u) => u.id !== id));
    });
  }

  const remaining = MAX_LEN - body.length;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Megaphone className="h-4 w-4 text-nocturn" />
        <h3 className="text-lg font-bold font-heading">Updates</h3>
        <span className="text-xs text-muted-foreground">({updates.length})</span>
      </div>

      <p className="text-xs text-muted-foreground -mt-2">
        Announce set time changes, weather, last-minute details. Attendees see this on the event page and (optionally) in their inbox.
      </p>

      <div className="space-y-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Heads up — doors moved to 10pm, see you soon 🔥"
          rows={4}
          maxLength={MAX_LEN + 100}
          className="w-full resize-none rounded-xl border border-border bg-background px-3 py-3 text-base md:text-sm placeholder:text-muted-foreground/60 outline-none focus:border-nocturn/40 transition-all min-h-[100px]"
        />
        <div className="flex items-center justify-between text-[11px]">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
              className="h-4 w-4 rounded border-border bg-background text-nocturn focus:ring-nocturn/30"
            />
            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Email to RSVPs & ticket holders</span>
          </label>
          <span className={remaining < 100 ? "text-amber-400" : "text-muted-foreground"}>
            {remaining}
          </span>
        </div>

        {error && (
          <p className="text-xs text-red-400" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className="text-xs text-green-400 flex items-center gap-1.5" role="status">
            <Check className="h-3 w-3" /> {success}
          </p>
        )}

        <button
          type="button"
          onClick={handlePost}
          disabled={pending || body.trim().length === 0}
          className="w-full rounded-xl bg-nocturn px-4 py-3 text-sm font-semibold text-white hover:bg-nocturn-light active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all min-h-[44px] flex items-center justify-center gap-2"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Post update"}
        </button>
      </div>

      {updates.length > 0 && (
        <div className="pt-2 border-t border-border space-y-2">
          {updates.map((u) => (
            <div
              key={u.id}
              className="rounded-xl border border-border bg-background p-3"
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{formatRelative(u.created_at)}</span>
                  {u.email_sent && (
                    <span
                      className="flex items-center gap-1"
                      title={`Emailed to ${u.recipient_count} ${u.recipient_count === 1 ? "person" : "people"}`}
                    >
                      <Mail className="h-2.5 w-2.5" />
                      {u.recipient_count}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(u.id)}
                  disabled={deletingId === u.id}
                  className="text-muted-foreground/50 hover:text-red-400 transition-colors p-1 -mt-1 -mr-1 disabled:opacity-50"
                  aria-label="Delete update"
                >
                  {deletingId === u.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                </button>
              </div>
              <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed break-words">
                {u.body}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
