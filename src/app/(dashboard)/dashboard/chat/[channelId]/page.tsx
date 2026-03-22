"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, Info, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EventCardLive } from "@/components/event-card-live";
import { MicButton, VoicePlayback } from "@/components/voice-note";

interface Message {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  type: "text" | "voice" | "ai" | "system" | "event_card";
  voice_url: string | null;
  voice_duration: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface Channel {
  id: string;
  collective_id: string;
  event_id: string | null;
  name: string;
  type: "general" | "event";
}

export default function ChatRoomPage() {
  const params = useParams();
  const channelId = params.channelId as string;
  const supabase = createClient();

  const [userId, setUserId] = useState<string | null>(null);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [aiTyping, setAiTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Get current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, [supabase]);

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Load channel info + messages
  useEffect(() => {
    if (!channelId) return;

    supabase
      .from("channels")
      .select("*")
      .eq("id", channelId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setChannel(data as Channel);
      });

    supabase
      .from("messages")
      .select("*")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        setMessages((data ?? []) as Message[]);
        setLoading(false);
        setTimeout(scrollToBottom, 100);
      });
  }, [channelId, scrollToBottom, supabase]);

  // Real-time subscription
  useEffect(() => {
    if (!channelId) return;

    const sub = supabase
      .channel(`room:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          setMessages((prev) => {
            const existing = prev.find(
              (m) => m.id === (payload.new as Message).id
            );
            if (existing) return prev;
            return [...prev, payload.new as Message];
          });
          setTimeout(scrollToBottom, 50);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sub);
    };
  }, [channelId, scrollToBottom, supabase]);

  // Scroll on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages.length, scrollToBottom]);

  // Detect if a message looks like a question
  const looksLikeQuestion = (text: string): boolean => {
    const trimmed = text.trim();
    if (trimmed.includes("?")) return true;
    const questionStarters = /^(who|what|when|where|why|how|can|should|is|are|do|does|will)\b/i;
    return questionStarters.test(trimmed);
  };

  // Send text message
  const sendMessage = async () => {
    if (!input.trim() || !userId || !channelId) return;

    const content = input.trim();
    setInput("");

    const { data } = await supabase
      .from("messages")
      .insert({
        channel_id: channelId,
        user_id: userId,
        content,
        type: "text",
      })
      .select()
      .single();

    if (data) {
      setMessages((prev) => {
        const exists = prev.find((m) => m.id === data.id);
        if (exists) return prev;
        return [...prev, data as Message];
      });
    }

    // Auto-respond: explicit @nocturn OR question detection
    const shouldRespond =
      content.toLowerCase().includes("@nocturn") || looksLikeQuestion(content);

    if (shouldRespond) {
      // Show typing indicator after a short delay
      setTimeout(() => {
        setAiTyping(true);
        scrollToBottom();
      }, 500);

      // Generate response after 1.5s
      setTimeout(() => {
        setAiTyping(false);
        generateAIResponse(content);
      }, 1500);
    }
  };

  // Generate smart AI response based on keywords
  const generateAIResponse = async (userMessage: string) => {
    if (!channelId) return;

    const lower = userMessage.toLowerCase();
    let aiContent: string;

    // Financial questions
    if (
      lower.includes("money") || lower.includes("revenue") || lower.includes("cost") ||
      lower.includes("p&l") || lower.includes("profit") || lower.includes("numbers") ||
      lower.includes("budget") || lower.includes("spend") || lower.includes("price")
    ) {
      aiContent =
        "Here's your financial summary:\n\n" +
        "Projected Revenue: $12,400\n" +
        "Total Costs: $7,850\n" +
        " - Venue: $3,000\n" +
        " - Artist Fees: $3,500\n" +
        " - Production: $1,350\n\n" +
        "Estimated Profit: $4,550 (36.7% margin)\n\n" +
        "You're trending above your target. Keep pushing ticket sales this week.";
    }
    // Lineup / artist / DJ questions
    else if (
      lower.includes("who") || lower.includes("artist") || lower.includes("dj") ||
      lower.includes("lineup") || lower.includes("performer") || lower.includes("talent")
    ) {
      aiContent =
        "Here's the current lineup:\n\n" +
        "1. DJ Mara — Headliner (confirmed)\n" +
        "2. KVSH — Support (confirmed)\n" +
        "3. Local opener — TBD (2 candidates)\n\n" +
        "Headliner fee: $3,500 | Support: $1,200\n" +
        "All riders submitted. Sound check at 4pm day-of.\n\n" +
        "Want me to draft an offer to one of the local opener candidates?";
    }
    // Schedule / time questions
    else if (
      lower.includes("when") || lower.includes("time") || lower.includes("date") ||
      lower.includes("schedule") || lower.includes("doors")
    ) {
      aiContent =
        "Here's the event timeline:\n\n" +
        "Doors: 10:00 PM\n" +
        "Local Opener: 10:30 PM - 11:30 PM\n" +
        "Support (KVSH): 11:45 PM - 1:00 AM\n" +
        "Headliner (DJ Mara): 1:15 AM - 3:00 AM\n\n" +
        "Sound check: 4:00 PM\n" +
        "Load-in: 6:00 PM\n\n" +
        "Should I share this with the team?";
    }
    // Venue / location questions
    else if (
      lower.includes("where") || lower.includes("venue") || lower.includes("location") ||
      lower.includes("address") || lower.includes("club")
    ) {
      aiContent =
        "Venue: Elsewhere (Zone One)\n" +
        "Address: 599 Johnson Ave, Brooklyn, NY 11237\n\n" +
        "Capacity: 300 (standing)\n" +
        "Sound: L-Acoustics K2 system\n" +
        "Deposit: $3,000 (paid)\n" +
        "Curfew: 4:00 AM\n\n" +
        "Green room and backstage confirmed. Want me to send load-in details to the artists?";
    }
    // Tickets / capacity / sales
    else if (
      lower.includes("ticket") || lower.includes("capacity") || lower.includes("sold") ||
      lower.includes("sales") || lower.includes("ga") || lower.includes("vip")
    ) {
      aiContent =
        "Ticket sales breakdown:\n\n" +
        "GA ($25): 97/200 sold\n" +
        "VIP ($60): 30/50 sold\n" +
        "Total: 127/300 (42%)\n\n" +
        "Revenue so far: $4,225\n" +
        "Projected at current pace: $8,900\n\n" +
        "Tip: Last push with an IG story countdown usually drives 15-20% more sales in the final week.";
    }
    // Promo / marketing
    else if (
      lower.includes("draft") || lower.includes("promo") || lower.includes("caption") ||
      lower.includes("marketing") || lower.includes("post") || lower.includes("flyer")
    ) {
      aiContent =
        "Here's a promo draft:\n\n" +
        "The night you've been waiting for is almost here. " +
        "Join us for an unforgettable lineup, immersive vibes, and a crowd that gets it. " +
        "Limited tickets remaining — don't sleep on this one.\n\n" +
        "Early bird pricing ends Friday. Link in bio.\n\n" +
        "Want me to create variations for IG stories and Twitter?";
    }
    // Default helpful response
    else {
      aiContent =
        "I'm on it! Based on your event details, here are my recommendations:\n\n" +
        "1. Focus on ticket sales — you're at 42% with 2 weeks to go\n" +
        "2. The venue confirmed sound and lighting specs\n" +
        "3. Consider adding a VIP tier to boost revenue\n\n" +
        "What would you like me to dig into?";
    }

    const { data } = await supabase
      .from("messages")
      .insert({
        channel_id: channelId,
        user_id: "00000000-0000-0000-0000-000000000000",
        content: aiContent,
        type: "ai",
      })
      .select()
      .single();

    if (data) {
      setMessages((prev) => {
        const exists = prev.find((m) => m.id === data.id);
        if (exists) return prev;
        return [...prev, data as Message];
      });
    }
  };

  // Send voice message
  const handleSendVoice = async (duration: number) => {
    if (!userId || !channelId) return;

    const { data } = await supabase
      .from("messages")
      .insert({
        channel_id: channelId,
        user_id: userId,
        content: "",
        type: "voice",
        voice_url: `mock://voice/${Date.now()}`,
        voice_duration: duration,
      })
      .select()
      .single();

    if (data) {
      setMessages((prev) => {
        const exists = prev.find((m) => m.id === data.id);
        if (exists) return prev;
        return [...prev, data as Message];
      });
    }
  };

  // Format timestamp
  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" });
  };

  // Get user display name
  const getUserName = (msg: Message) => {
    if (msg.type === "ai") return "Nocturn AI";
    if (msg.user_id === userId) return "You";
    return `User ${msg.user_id?.slice(0, 6) ?? "unknown"}`;
  };

  const isOwnMessage = (msg: Message) => msg.user_id === userId;

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] md:h-[calc(100vh-1.5rem)] -m-4 md:-m-6">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 h-14 bg-card/95 backdrop-blur-lg border-b border-border shrink-0 z-10">
        <Link
          href="/dashboard/chat"
          className="w-11 h-11 flex items-center justify-center -ml-2 md:hidden"
        >
          <ArrowLeft size={22} />
        </Link>
        <Link
          href="/dashboard/chat"
          className="hidden md:flex items-center justify-center w-9 h-9 rounded-md hover:bg-accent -ml-1"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold truncate text-[15px]">
            {channel?.name ?? "Chat"}
          </h1>
          {channel?.type === "event" && (
            <p className="text-[11px] text-nocturn">Event Channel</p>
          )}
        </div>
        <Button variant="ghost" size="icon" className="-mr-2">
          <Info size={20} className="text-muted-foreground" />
        </Button>
      </header>

      {/* Event Card (for event channels) */}
      {channel?.type === "event" && channel.event_id && (
        <EventCardLive
          channelId={channel.id}
          eventId={channel.event_id}
        />
      )}

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-2"
      >
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-nocturn border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12">
            <Sparkles
              size={32}
              className="text-nocturn/40 mx-auto mb-2"
            />
            <p className="text-sm text-muted-foreground/50">
              Start the conversation
            </p>
            <p className="text-xs text-muted-foreground/30 mt-1">
              Ask a question and Nocturn AI will help
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              isOwn={isOwnMessage(msg)}
              userName={getUserName(msg)}
              formatTime={formatTime}
            />
          ))
        )}
        {/* Typing indicator */}
        {aiTyping && (
          <div className="flex justify-start">
            <div className="max-w-[85%]">
              <div className="flex items-center gap-1.5 mb-1 ml-1">
                <Sparkles size={12} className="text-nocturn" />
                <span className="text-[11px] text-nocturn font-medium">
                  Nocturn AI
                </span>
              </div>
              <div className="rounded-2xl rounded-tl-md px-3.5 py-2.5 bg-nocturn/10">
                <p className="text-[14px] leading-relaxed text-muted-foreground flex items-center gap-1">
                  Nocturn is thinking
                  <span className="inline-flex gap-0.5">
                    <span className="w-1 h-1 bg-nocturn rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-1 h-1 bg-nocturn rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-1 h-1 bg-nocturn rounded-full animate-bounce [animation-delay:300ms]" />
                  </span>
                </p>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <div className="shrink-0 border-t border-border bg-card/95 backdrop-blur-lg px-3 py-2 pb-safe">
        <div className="flex items-end gap-2">
          <MicButton onSendVoice={handleSendVoice} />

          <div className="flex-1 flex items-end bg-accent rounded-xl px-3 py-2.5 min-h-[44px]">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Message... ask a question for AI help"
              className="w-full bg-transparent text-[16px] placeholder:text-muted-foreground/50 resize-none outline-none max-h-[120px] leading-5"
              rows={1}
              style={{ fontSize: "16px" }}
            />
          </div>

          <button
            onClick={sendMessage}
            disabled={!input.trim()}
            className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
              input.trim()
                ? "bg-nocturn hover:bg-nocturn/90"
                : "bg-accent"
            }`}
          >
            <Send
              size={18}
              className={
                input.trim()
                  ? "text-white"
                  : "text-muted-foreground/50"
              }
            />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Message Bubble ── */
function MessageBubble({
  msg,
  isOwn,
  userName,
  formatTime,
}: {
  msg: Message;
  isOwn: boolean;
  userName: string;
  formatTime: (d: string) => string;
}) {
  // System messages
  if (msg.type === "system") {
    return (
      <div className="flex justify-center py-1">
        <span className="text-[12px] text-muted-foreground/60 text-center px-3">
          {msg.content}
        </span>
      </div>
    );
  }

  // AI messages
  if (msg.type === "ai") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%]">
          <div className="flex items-center gap-1.5 mb-1 ml-1">
            <Sparkles size={12} className="text-nocturn" />
            <span className="text-[11px] text-nocturn font-medium">
              Nocturn AI
            </span>
          </div>
          <div className="rounded-2xl rounded-tl-md px-3.5 py-2.5 bg-nocturn/10">
            <p className="text-[14px] leading-relaxed whitespace-pre-wrap">
              {msg.content}
            </p>
          </div>
          <span className="text-[11px] text-muted-foreground/40 ml-1 mt-0.5 block">
            {formatTime(msg.created_at)}
          </span>
        </div>
      </div>
    );
  }

  // Voice messages
  if (msg.type === "voice") {
    return (
      <div className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
        <div className="max-w-[75%]">
          {!isOwn && (
            <span className="text-[11px] text-muted-foreground ml-1 mb-0.5 block">
              {userName}
            </span>
          )}
          <div
            className={`rounded-2xl px-3.5 py-2.5 ${
              isOwn
                ? "bg-nocturn rounded-tr-md"
                : "bg-card border border-border rounded-tl-md"
            }`}
          >
            <VoicePlayback
              voiceUrl={msg.voice_url ?? undefined}
              voiceDuration={msg.voice_duration ?? 0}
              isOwn={isOwn}
            />
          </div>
          <span
            className={`text-[11px] text-muted-foreground/40 mt-0.5 block ${
              isOwn ? "text-right mr-1" : "ml-1"
            }`}
          >
            {formatTime(msg.created_at)}
          </span>
        </div>
      </div>
    );
  }

  // Regular text messages
  return (
    <div className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[80%]">
        {!isOwn && (
          <span className="text-[11px] text-muted-foreground ml-1 mb-0.5 block">
            {userName}
          </span>
        )}
        <div
          className={`rounded-2xl px-3.5 py-2.5 ${
            isOwn
              ? "bg-nocturn rounded-tr-md"
              : "bg-card border border-border rounded-tl-md"
          }`}
        >
          <p className="text-[14px] leading-relaxed whitespace-pre-wrap">
            {msg.content}
          </p>
        </div>
        <span
          className={`text-[11px] text-muted-foreground/40 mt-0.5 block ${
            isOwn ? "text-right mr-1" : "ml-1"
          }`}
        >
          {formatTime(msg.created_at)}
        </span>
      </div>
    </div>
  );
}
