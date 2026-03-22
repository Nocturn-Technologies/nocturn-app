"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createEvent } from "@/app/actions/events";
import {
  parseEventDetails,
  type ParsedEventDetails,
} from "@/app/actions/ai-parse-event";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sparkles,
  ArrowLeft,
  Send,
  Check,
  Calendar,
  MapPin,
  Clock,
  Ticket,
  Users,
  Loader2,
  Pencil,
} from "lucide-react";
import Link from "next/link";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface Message {
  role: "ai" | "user";
  content: string;
}

// ─── Chat Bubbles ────────────────────────────────────────────────────────────

function AiBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 animate-fade-in-up">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#7B2FF7]/20">
        <Sparkles className="h-4 w-4 text-[#7B2FF7]" />
      </div>
      <div className="rounded-2xl rounded-tl-sm bg-zinc-900 border border-white/5 px-4 py-3 max-w-[85%]">
        {children}
      </div>
    </div>
  );
}

function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end animate-fade-in-up">
      <div className="rounded-2xl rounded-tr-sm bg-[#7B2FF7]/10 border border-[#7B2FF7]/20 px-4 py-3 max-w-[85%]">
        {children}
      </div>
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex items-start gap-3 animate-fade-in-up">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#7B2FF7]/20 animate-pulse">
        <Sparkles className="h-4 w-4 text-[#7B2FF7]" />
      </div>
      <div className="rounded-2xl rounded-tl-sm bg-zinc-900 border border-white/5 px-5 py-4">
        <div className="flex gap-1.5">
          <div className="w-2 h-2 rounded-full bg-zinc-500 animate-bounce [animation-delay:0ms]" />
          <div className="w-2 h-2 rounded-full bg-zinc-500 animate-bounce [animation-delay:150ms]" />
          <div className="w-2 h-2 rounded-full bg-zinc-500 animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}

// ─── Editable Field Row ──────────────────────────────────────────────────────

function EditableRow({
  label,
  value,
  icon: Icon,
  onSave,
  type = "text",
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  onSave: (value: string) => void;
  type?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  return (
    <div className="flex items-center gap-2 group">
      <Icon className="h-3.5 w-3.5 text-[#7B2FF7] shrink-0" />
      {editing ? (
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <input
            ref={inputRef}
            type={type}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onSave(editValue);
                setEditing(false);
              }
              if (e.key === "Escape") {
                setEditValue(value);
                setEditing(false);
              }
            }}
            onBlur={() => {
              onSave(editValue);
              setEditing(false);
            }}
            className="flex-1 min-w-0 bg-zinc-800 border border-white/10 rounded-md px-2 py-1 text-sm text-white outline-none focus:border-[#7B2FF7]/50"
          />
        </div>
      ) : (
        <button
          onClick={() => {
            setEditValue(value);
            setEditing(true);
          }}
          className="flex items-center gap-1.5 text-sm text-left min-w-0 group/row"
        >
          <span className="text-zinc-400 shrink-0">{label}:</span>
          <span className="font-medium text-white truncate">{value}</span>
          <Pencil className="h-3 w-3 text-zinc-600 opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0" />
        </button>
      )}
    </div>
  );
}

// ─── Confirmation Card ───────────────────────────────────────────────────────

function EventConfirmationCard({
  data,
  onUpdate,
  onEdit,
  onCreate,
  creating,
  error,
}: {
  data: ParsedEventDetails;
  onUpdate: (field: keyof ParsedEventDetails, value: string | number) => void;
  onEdit: () => void;
  onCreate: () => void;
  creating: boolean;
  error: string | null;
}) {
  const dateDisplay = data.date
    ? (() => {
        try {
          const d = new Date(data.date + "T12:00:00");
          return d.toLocaleDateString("en", {
            weekday: "short",
            month: "short",
            day: "numeric",
          });
        } catch {
          return data.date;
        }
      })()
    : "";

  const timeDisplay = data.startTime
    ? (() => {
        const [h, m] = data.startTime!.split(":").map(Number);
        const period = h >= 12 ? "PM" : "AM";
        const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
        return m === 0
          ? `${hour12} ${period}`
          : `${hour12}:${String(m).padStart(2, "0")} ${period}`;
      })()
    : "";

  return (
    <div className="ml-11 rounded-xl border border-[#7B2FF7]/20 bg-zinc-900 overflow-hidden animate-scale-in">
      <div className="p-4 space-y-3">
        {/* Status badge */}
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
            <Check className="h-3 w-3 text-green-400" />
          </div>
          <span className="text-xs text-green-400 font-medium uppercase tracking-wider">
            Ready to create
          </span>
        </div>

        {/* Title */}
        <div className="group/title">
          <button
            onClick={() => {
              const newTitle = prompt("Event name:", data.title || "");
              if (newTitle) onUpdate("title", newTitle);
            }}
            className="text-lg font-bold text-white flex items-center gap-1.5"
          >
            {data.title || "Untitled Event"}
            <Pencil className="h-3 w-3 text-zinc-600 opacity-0 group-hover/title:opacity-100 transition-opacity" />
          </button>
        </div>

        {data.description && (
          <p className="text-sm text-zinc-400">{data.description}</p>
        )}

        {/* Details grid */}
        <div className="grid gap-2">
          {data.date && (
            <EditableRow
              label="When"
              value={`${dateDisplay}${timeDisplay ? ` at ${timeDisplay}` : ""}`}
              icon={Calendar}
              onSave={(val) => {
                // If user edits, try to keep it as-is for display
                // Real editing would need a date picker, but for now allow text
                onUpdate("date", data.date!);
              }}
            />
          )}

          {data.doorsOpen && (
            <EditableRow
              label="Doors"
              value={data.doorsOpen}
              icon={Clock}
              onSave={(val) => onUpdate("doorsOpen", val)}
            />
          )}

          {(data.venueName || data.venueCity) && (
            <EditableRow
              label="Where"
              value={[data.venueName, data.venueCity]
                .filter(Boolean)
                .join(", ")}
              icon={MapPin}
              onSave={(val) => {
                const parts = val.split(",").map((s) => s.trim());
                if (parts[0]) onUpdate("venueName", parts[0]);
                if (parts[1]) onUpdate("venueCity", parts[1]);
              }}
            />
          )}

          {data.ticketPrice !== undefined && (
            <EditableRow
              label="Price"
              value={
                data.ticketPrice === 0
                  ? "Free"
                  : `$${data.ticketPrice}${data.ticketTierName ? ` ${data.ticketTierName}` : " GA"}`
              }
              icon={Ticket}
              onSave={(val) => {
                const num = parseFloat(val.replace(/[^0-9.]/g, ""));
                if (!isNaN(num)) onUpdate("ticketPrice", num);
              }}
            />
          )}

          {data.venueCapacity && (
            <EditableRow
              label="Capacity"
              value={`${data.venueCapacity}`}
              icon={Users}
              onSave={(val) => {
                const num = parseInt(val.replace(/[^0-9]/g, ""));
                if (!isNaN(num)) onUpdate("venueCapacity", num);
              }}
            />
          )}
        </div>
      </div>

      {error && (
        <div className="mx-4 mb-3 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400 text-center">
          {error}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex border-t border-white/5">
        <button
          onClick={onEdit}
          className="flex-1 flex items-center justify-center gap-1.5 h-12 text-sm text-zinc-400 font-medium hover:text-white transition-colors border-r border-white/5"
        >
          <Pencil className="h-3.5 w-3.5" />
          Change something
        </button>
        <button
          onClick={onCreate}
          disabled={creating}
          className="flex-1 flex items-center justify-center gap-1.5 h-12 text-sm text-[#7B2FF7] font-semibold hover:text-white transition-colors"
        >
          {creating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" />
              Create Event
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

function getMissingFields(data: ParsedEventDetails): string[] {
  const missing: string[] = [];
  if (!data.title) missing.push("event name");
  if (!data.date) missing.push("date");
  if (!data.startTime) missing.push("start time");
  if (!data.venueName) missing.push("venue");
  if (!data.venueCity) missing.push("city");
  return missing;
}

export default function NewEventPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [eventData, setEventData] = useState<ParsedEventDetails>({});
  const [thinking, setThinking] = useState(false);
  const [phase, setPhase] = useState<"chat" | "review" | "creating" | "done">(
    "chat"
  );
  const [error, setError] = useState<string | null>(null);
  const [introShown, setIntroShown] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking, phase]);

  // Show intro message
  useEffect(() => {
    if (!introShown) {
      setIntroShown(true);
      setMessages([
        {
          role: "ai",
          content:
            'Describe your event and I\'ll set it up. Try something like:\n\n"Midnight Sessions at CODA, April 25 10pm, Toronto, $25"',
        },
      ]);
      setTimeout(() => inputRef.current?.focus(), 500);
    }
  }, [introShown]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || thinking) return;

    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setThinking(true);

    // Use the server action to parse (AI with local fallback)
    const currentData = { ...eventData };

    // If the user typed a short message with no numbers and we have no title yet,
    // hint that it might be a title
    if (!currentData.title && !userMsg.match(/\d/) && userMsg.length < 50) {
      currentData.title = userMsg;
    }

    const result = await parseEventDetails(userMsg, currentData);
    setEventData(result.parsed);
    setThinking(false);

    // Check what's still needed
    const missing = getMissingFields(result.parsed);

    if (missing.length === 0) {
      setMessages((prev) => [
        ...prev,
        { role: "ai", content: "Got it! Here's what I've set up:" },
      ]);
      setPhase("review");
    } else {
      setMessages((prev) => [...prev, { role: "ai", content: result.reply }]);
    }

    setTimeout(() => inputRef.current?.focus(), 100);
  }

  function handleUpdateField(
    field: keyof ParsedEventDetails,
    value: string | number
  ) {
    setEventData((prev) => ({ ...prev, [field]: value }));
  }

  function handleBackToChat() {
    setPhase("chat");
    setMessages((prev) => [
      ...prev,
      {
        role: "ai",
        content: "No problem — tell me what to change.",
      },
    ]);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  async function handleCreate() {
    setPhase("creating");
    setError(null);

    const d = eventData;
    const validTiers =
      d.ticketPrice !== undefined
        ? [
            {
              name: d.ticketTierName || "General Admission",
              price: d.ticketPrice,
              quantity: d.ticketQuantity || d.venueCapacity || 100,
            },
          ]
        : [];

    const result = await createEvent({
      title: d.title || "Untitled Event",
      slug: slugify(d.title || "untitled-event"),
      description: d.description || null,
      date: d.date || new Date().toISOString().split("T")[0],
      doorsOpen: d.doorsOpen || null,
      startTime: d.startTime || "22:00",
      endTime: d.endTime || null,
      venueName: d.venueName || "TBA",
      venueAddress: d.venueAddress || "",
      venueCity: d.venueCity || "",
      venueCapacity: d.venueCapacity || 0,
      tiers: validTiers,
    });

    if (result.error) {
      setError(result.error);
      setPhase("review");
      return;
    }

    setPhase("done");
    setTimeout(() => {
      router.push(`/dashboard/events/${result.eventId}`);
      router.refresh();
    }, 2000);
  }

  return (
    <div className="mx-auto max-w-lg flex flex-col h-[calc(100dvh-8rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 shrink-0">
        <Link href="/dashboard/events">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-lg font-bold font-[family-name:var(--font-space-grotesk)]">
          New Event
        </h1>
        <div className="ml-auto flex items-center gap-1.5 rounded-full bg-[#7B2FF7]/10 px-3 py-1">
          <Sparkles className="h-3 w-3 text-[#7B2FF7]" />
          <span className="text-xs font-medium text-[#7B2FF7]">AI</span>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4 min-h-0">
        {messages.map((msg, i) =>
          msg.role === "ai" ? (
            <AiBubble key={i}>
              <p className="text-sm leading-relaxed whitespace-pre-line">
                {msg.content}
              </p>
            </AiBubble>
          ) : (
            <UserBubble key={i}>
              <p className="text-sm">{msg.content}</p>
            </UserBubble>
          )
        )}

        {thinking && <ThinkingDots />}

        {/* Review card with editable fields */}
        {phase === "review" && (
          <EventConfirmationCard
            data={eventData}
            onUpdate={handleUpdateField}
            onEdit={handleBackToChat}
            onCreate={handleCreate}
            creating={false}
            error={error}
          />
        )}

        {/* Creating state */}
        {phase === "creating" && (
          <div className="ml-11 flex items-center gap-3 animate-fade-in-up">
            <Loader2 className="h-5 w-5 text-[#7B2FF7] animate-spin" />
            <span className="text-sm text-zinc-400">
              Creating your event...
            </span>
          </div>
        )}

        {/* Done state */}
        {phase === "done" && (
          <div className="flex flex-col items-center gap-4 py-12 animate-scale-in">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 animate-pulse">
              <Check className="h-8 w-8 text-green-500" />
            </div>
            <div className="text-center">
              <h2 className="text-xl font-bold font-[family-name:var(--font-space-grotesk)]">
                {eventData.title} is live!
              </h2>
              <p className="text-sm text-zinc-400 mt-1">
                Taking you to the event dashboard...
              </p>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input bar — only shown in chat phase */}
      {phase === "chat" && (
        <form
          onSubmit={handleSend}
          className="shrink-0 flex gap-2 border-t border-white/5 pt-3 pb-2"
          style={{
            paddingBottom: "max(env(safe-area-inset-bottom, 0px), 8px)",
          }}
        >
          <Input
            ref={inputRef}
            placeholder="Midnight Sessions at CODA, Apr 25 10pm..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 text-sm bg-zinc-900 border-white/10 focus:border-[#7B2FF7]/50"
            disabled={thinking}
          />
          <Button
            type="submit"
            size="icon"
            className="bg-[#7B2FF7] hover:bg-[#6B1FE7] shrink-0"
            disabled={!input.trim() || thinking}
          >
            {thinking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      )}
    </div>
  );
}
