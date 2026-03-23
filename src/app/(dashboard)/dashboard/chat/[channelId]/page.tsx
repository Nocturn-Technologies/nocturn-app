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
  const [userNames, setUserNames] = useState<Record<string, string>>({});
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

  // Fetch real user names for message authors
  useEffect(() => {
    const unknownIds = [...new Set(messages.map((m) => m.user_id))]
      .filter((id) => id && id !== "00000000-0000-0000-0000-000000000000" && !userNames[id]);

    if (unknownIds.length === 0) return;

    supabase
      .from("users")
      .select("id, full_name")
      .in("id", unknownIds)
      .then(({ data }) => {
        if (!data) return;
        setUserNames((prev) => {
          const next = { ...prev };
          for (const u of data) {
            if (u.full_name) next[u.id] = u.full_name.split(" ")[0];
          }
          return next;
        });
      });
  }, [messages, supabase, userNames]);

  // Scroll on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages.length, scrollToBottom]);

  // Send text message — AI responds to everything
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

    // AI always responds — this is a copilot, not a dumb chatroom
    if (!aiTyping) {
      setAiTyping(true);
      scrollToBottom();
      try {
        await generateAIResponse(content);
      } finally {
        setAiTyping(false);
      }
    }
  };

  // Generate AI response using real Claude API + event data
  // Server action inserts the AI message directly — realtime subscription picks it up
  const generateAIResponse = async (userMessage: string) => {
    if (!channelId) return;

    try {
      const { generateChatResponse } = await import("@/app/actions/ai-chat");

      // Build recent messages for context
      const recentMsgs = messages.slice(-10).map((m) => ({
        role: m.type === "ai" ? "assistant" : "user",
        content: m.content,
      }));

      // Server action generates response AND inserts it into DB
      // Realtime subscription will push the new message to the client
      await generateChatResponse(channelId, userMessage, recentMsgs);
    } catch (err) {
      console.error("[chat] AI response error:", err);
      // If server action completely fails, insert fallback client-side
      await supabase
        .from("messages")
        .insert({
          channel_id: channelId,
          user_id: null,
          content: "I'm having trouble connecting right now. Try asking again in a moment.",
          type: "ai",
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
    return userNames[msg.user_id] || "Team member";
  };

  // Suggested prompts for empty state
  const suggestedPrompts = [
    "How are ticket sales looking?",
    "Give me a revenue breakdown",
    "Who's on the lineup?",
    "Draft a promo caption",
    "What should I focus on today?",
  ];

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
          <div className="flex flex-col items-center justify-center py-8 px-4 space-y-6">
            <div className="text-center space-y-2">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-nocturn/10">
                <Sparkles size={28} className="text-nocturn" />
              </div>
              <p className="text-base font-semibold">Nocturn AI</p>
              <p className="text-sm text-muted-foreground max-w-[280px]">
                Your event ops copilot. Ask me anything about your events, sales, lineup, or marketing.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 max-w-sm">
              {suggestedPrompts.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => {
                    setInput(prompt);
                  }}
                  className="rounded-full border border-nocturn/20 bg-nocturn/5 px-3 py-1.5 text-xs font-medium text-nocturn hover:bg-nocturn/10 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              isOwn={isOwnMessage(msg)}
              userName={getUserName(msg)}
              formatTime={formatTime}
              onFollowUp={(text) => setInput(text)}
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
              placeholder="Ask Nocturn anything..."
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
  onFollowUp,
}: {
  msg: Message;
  isOwn: boolean;
  userName: string;
  formatTime: (d: string) => string;
  onFollowUp?: (text: string) => void;
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

  // AI messages — rich formatting with markdown-like rendering
  if (msg.type === "ai") {
    // Parse content into formatted blocks
    const renderAIContent = (text: string) => {
      // Parse bold markers into React elements (no dangerouslySetInnerHTML)
      const parseBold = (s: string) => {
        const parts = s.split(/\*\*(.*?)\*\*/g);
        return parts.map((part, j) =>
          j % 2 === 1 ? (
            <strong key={j} className="text-white font-semibold">{part}</strong>
          ) : (
            <span key={j}>{part}</span>
          )
        );
      };

      return text.split("\n").map((line, i) => {
        const clean = line.replace(/<[^>]*?>/g, "");

        // Bullet points
        if (clean.startsWith("- ") || clean.startsWith("• ")) {
          return (
            <div key={i} className="flex gap-2 items-start ml-1">
              <span className="text-nocturn mt-1 text-xs">●</span>
              <span className="flex-1">{parseBold(clean.replace(/^[-•]\s*/, ""))}</span>
            </div>
          );
        }

        // Numbered items
        const numMatch = clean.match(/^(\d+)[.)]\s*(.*)/);
        if (numMatch) {
          return (
            <div key={i} className="flex gap-2 items-start ml-1">
              <span className="text-nocturn text-xs font-bold min-w-[16px]">{numMatch[1]}.</span>
              <span className="flex-1">{parseBold(numMatch[2])}</span>
            </div>
          );
        }

        // Empty line = spacer
        if (clean.trim() === "") return <div key={i} className="h-2" />;

        // Regular text
        return (
          <span key={i} className="block">{parseBold(clean)}</span>
        );
      });
    };

    // Generate contextual follow-up suggestions
    const getFollowUps = (content: string): string[] => {
      const lower = content.toLowerCase();
      if (lower.includes("ticket") || lower.includes("sold") || lower.includes("revenue")) {
        return ["Show me a full breakdown", "Draft a promo to push sales"];
      }
      if (lower.includes("lineup") || lower.includes("artist") || lower.includes("dj")) {
        return ["What are the total artist fees?", "Draft a booking email"];
      }
      if (lower.includes("forecast") || lower.includes("profit") || lower.includes("break-even")) {
        return ["How do I improve these numbers?", "Compare to my last event"];
      }
      if (lower.includes("promo") || lower.includes("caption") || lower.includes("marketing")) {
        return ["Make it shorter", "Write an Instagram story version"];
      }
      return ["What should I focus on today?", "Give me a status update"];
    };

    const followUps = getFollowUps(msg.content);

    return (
      <div className="flex justify-start">
        <div className="max-w-[88%] space-y-2">
          <div className="flex items-center gap-1.5 mb-1 ml-1">
            <Sparkles size={12} className="text-nocturn" />
            <span className="text-[11px] text-nocturn font-medium">
              Nocturn AI
            </span>
          </div>
          <div className="rounded-2xl rounded-tl-md px-4 py-3 bg-nocturn/10 space-y-1">
            <div className="text-[14px] leading-relaxed text-white/90">
              {renderAIContent(msg.content)}
            </div>
          </div>

          {/* Follow-up suggestions */}
          {followUps.length > 0 && (
            <div className="flex flex-wrap gap-1.5 ml-1">
              {followUps.map((q) => (
                <button
                  key={q}
                  onClick={() => onFollowUp?.(q)}
                  className="text-[11px] rounded-full border border-nocturn/20 bg-nocturn/5 px-2.5 py-1 text-nocturn hover:bg-nocturn/10 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          <span className="text-[11px] text-muted-foreground/40 ml-1 block">
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
