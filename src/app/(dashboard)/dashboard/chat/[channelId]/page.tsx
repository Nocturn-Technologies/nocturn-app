"use client";

import { useEffect, useState, useRef, useCallback, memo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, Send, Sparkles, DollarSign, Loader2, Check, Users } from "lucide-react";
import { EventCardLive } from "@/components/event-card-live";
import { MicButton, VoicePlayback, mimeToExt } from "@/components/voice-note";
import { ChatMemberList } from "@/components/chat/member-list";
import { InviteMemberModal } from "@/components/chat/invite-member-modal";

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
  type: "general" | "event" | "collab";
}

export default function ChatRoomPage() {
  const params = useParams();
  // TODO(audit): add isValidUUID(channelId) guard here or in a layout.tsx — currently relies solely on RLS
  const channelId = params.channelId as string;
  const supabase = createClient();

  const [userId, setUserId] = useState<string | null>(null);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [aiTyping, setAiTyping] = useState(false);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connecting');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [memberPanelOpen, setMemberPanelOpen] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [memberCount, setMemberCount] = useState(0);
  const memberListKeyRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const subscriptionRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const reconnectCountRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const initialLoadDoneRef = useRef(false);

  // Get current user + check admin role
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      // Check if user is admin/manager in any of their collectives
      const { data: memberships } = await supabase
        .from("collective_members")
        .select("role")
        .eq("user_id", user.id)
        .is("deleted_at", null);
      const adminRoles = ["admin", "owner", "promoter"];
      setIsAdmin(memberships?.some((m) => adminRoles.includes(m.role)) ?? false);
    });
  }, [supabase]);

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Load channel info + messages, then start realtime subscription
  // Sequencing prevents the race condition where realtime fires before initial load completes
  useEffect(() => {
    if (!channelId) return;
    mountedRef.current = true;
    initialLoadDoneRef.current = false;

    // Load channel metadata
    supabase
      .from("channels")
      .select("*")
      .eq("id", channelId)
      .maybeSingle()
      .then(({ data }) => {
        if (data && mountedRef.current) setChannel(data as Channel);
      });

    // Load messages, THEN start realtime subscription
    supabase
      .from("messages")
      .select("*")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (!mountedRef.current) return;
        setMessages((data ?? []) as Message[]);
        setLoading(false);
        initialLoadDoneRef.current = true;
        setTimeout(scrollToBottom, 100);
        // Start realtime only after initial load is done
        startSubscription();
      });

    const startSubscription = () => {
      // Clean up any existing subscription
      if (subscriptionRef.current) {
        try { supabase.removeChannel(subscriptionRef.current); } catch { /* already removed */ }
        subscriptionRef.current = null;
      }

      if (!mountedRef.current) return;
      setConnectionStatus('connecting');

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
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            if (mountedRef.current) {
              setConnectionStatus('connected');
              reconnectCountRef.current = 0;
            }
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn("[chat] Realtime disconnected, will reconnect...");
            if (!mountedRef.current) return;
            setConnectionStatus('disconnected');
            const delay = Math.min(1000 * Math.pow(2, reconnectCountRef.current), 30000);
            reconnectCountRef.current += 1;
            reconnectTimerRef.current = setTimeout(() => {
              if (mountedRef.current) startSubscription();
            }, delay);
          }
        });

      subscriptionRef.current = sub;
    };

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (subscriptionRef.current) {
        try { supabase.removeChannel(subscriptionRef.current); } catch { /* already removed */ }
        subscriptionRef.current = null;
      }
      reconnectCountRef.current = 0;
    };
  }, [channelId, scrollToBottom, supabase]);

  // Fetch real user names for message authors
  const fetchedUserIdsRef = useRef(new Set<string>());
  useEffect(() => {
    const unknownIds = [...new Set(messages.map((m) => m.user_id))]
      .filter((id) => id && id !== "00000000-0000-0000-0000-000000000000" && !fetchedUserIdsRef.current.has(id));

    if (unknownIds.length === 0) return;
    unknownIds.forEach((id) => fetchedUserIdsRef.current.add(id));

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
  }, [messages, supabase]);

  // Scroll on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages.length, scrollToBottom]);

  // Send text message — AI responds to everything
  const sendMessage = async () => {
    if (!input.trim() || !userId || !channelId) return;

    const content = input.trim();
    const optimisticId = crypto.randomUUID();

    // Optimistic: add message to state immediately
    const optimisticMsg: Message = {
      id: optimisticId,
      channel_id: channelId,
      user_id: userId,
      content,
      type: "text",
      voice_url: null,
      voice_duration: null,
      metadata: null,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setInput("");

    // Send to server in background — don't block UI
    supabase
      .from("messages")
      .insert({
        channel_id: channelId,
        user_id: userId,
        content,
        type: "text",
      })
      .select()
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error("[chat] Failed to send message:", error);
          // Remove optimistic message on failure
          setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
          setInput(content); // Restore input so user can retry
          return;
        }
        // Replace optimistic message with server-confirmed one
        // (Realtime dedup will handle if the subscription delivers it first)
        if (data) {
          setMessages((prev) => {
            const withoutOptimistic = prev.filter((m) => m.id !== optimisticId);
            const alreadyDelivered = withoutOptimistic.some((m) => m.id === data.id);
            if (alreadyDelivered) return withoutOptimistic;
            return [...withoutOptimistic, data as Message];
          });
        }
      });

    // AI responds based on channel type:
    // - General channel: always responds (copilot mode)
    // - Event/collab channels: only responds when invoked with @ai, @nocturn, /ai, or /nocturn
    const shouldTriggerAI =
      channel?.type === "general" ||
      /^[@/](ai|nocturn)\b/i.test(content) ||
      /\b@(ai|nocturn)\b/i.test(content);

    if (shouldTriggerAI && !aiTyping) {
      setAiTyping(true);
      scrollToBottom();
      try {
        // Strip the @ai / @nocturn prefix before sending to AI
        const aiInput = content.replace(/^[@/](ai|nocturn)\s*/i, "").replace(/\b@(ai|nocturn)\b/i, "").trim() || content;
        await generateAIResponse(aiInput);
      } finally {
        setAiTyping(false);
      }
    }
  };

  // Generate AI response using real Claude API + event data
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
      const { content: aiContent, messageId: aiMessageId } = await generateChatResponse(channelId, userMessage, recentMsgs);

      // Also add to local state directly (don't rely solely on Realtime)
      if (aiContent) {
        setMessages((prev) => {
          // Check if Realtime already delivered it using the server-assigned ID
          if (aiMessageId && prev.some((m) => m.id === aiMessageId)) {
            return prev;
          }
          return [
            ...prev,
            {
              id: aiMessageId || crypto.randomUUID(),
              channel_id: channelId,
              user_id: null as unknown as string,
              content: aiContent,
              type: "ai" as const,
              voice_url: null,
              voice_duration: null,
              metadata: null,
              created_at: new Date().toISOString(),
            },
          ];
        });
        scrollToBottom();
      }
    } catch (err) {
      console.error("[chat] AI response error:", err);
      const fallback = "I'm having trouble connecting right now. Try asking again in a moment.";
      // Show fallback in UI immediately
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          channel_id: channelId,
          user_id: null as unknown as string,
          content: fallback,
          type: "ai" as const,
          voice_url: null,
          voice_duration: null,
          metadata: null,
          created_at: new Date().toISOString(),
        },
      ]);
    }
  };

  // Add expense from AI suggestion — calls server action
  const handleAddExpense = async (description: string, amount: number, category: string) => {
    if (!channelId) return;
    try {
      const { addExpenseFromChat } = await import("@/app/actions/ai-chat");
      await addExpenseFromChat(channelId, description, amount, category);
    } catch (err) {
      console.error("[chat] Failed to add expense:", err);
    }
  };

  // Send voice message — upload blob to Supabase Storage, then insert message
  // TODO(audit): voice upload has no size/duration validation. Add 10MB + 5min caps.
  const handleSendVoice = async (blob: Blob, duration: number) => {
    if (!userId || !channelId) return;

    // Upload to Supabase Storage — use the blob's actual MIME type (mp4 on iOS, webm on Chrome)
    const ext = mimeToExt(blob.type);
    const contentType = blob.type || "audio/webm";
    const fileName = `voice/${channelId}/${userId}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("recordings")
      .upload(fileName, blob, { contentType, upsert: false });

    if (uploadError) {
      console.error("[voice] Upload failed:", uploadError.message);
      setVoiceError("Voice message failed to upload. Please try again.");
      setTimeout(() => setVoiceError(null), 5000);
      return;
    }

    // TODO(audit): switch to createSignedUrl() with 1-hour expiry — bucket is now private
    const { data: urlData } = supabase.storage
      .from("recordings")
      .getPublicUrl(fileName);
    const voiceUrl = urlData.publicUrl;

    const { data, error: insertError } = await supabase
      .from("messages")
      .insert({
        channel_id: channelId,
        user_id: userId,
        content: "",
        type: "voice",
        voice_url: voiceUrl,
        voice_duration: duration,
      })
      .select()
      .maybeSingle();

    if (insertError) {
      console.error("[voice] Message insert failed:", insertError.message);
      setVoiceError("Voice message failed to send. Please try again.");
      setTimeout(() => setVoiceError(null), 5000);
      return;
    }

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
    <div className="flex h-[calc(100dvh-3.5rem-60px)] md:h-[calc(100dvh-1.5rem)] -m-4 md:-m-6 animate-in fade-in duration-300 overflow-x-hidden">
    <div className="flex flex-col flex-1 min-w-0">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 h-14 bg-card/95 backdrop-blur-lg border-b border-border shrink-0 z-10">
        <Link
          href="/dashboard/chat"
          className="w-11 h-11 flex items-center justify-center -ml-2 md:hidden rounded-xl transition-colors duration-200 hover:bg-accent active:bg-accent/80 active:scale-95"
        >
          <ArrowLeft size={22} />
        </Link>
        <Link
          href="/dashboard/chat"
          className="hidden md:flex items-center justify-center w-9 h-9 rounded-xl hover:bg-accent active:bg-accent/80 -ml-1 transition-colors duration-200"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold truncate text-[15px] font-heading">
            {channel?.name ?? "Chat"}
          </h1>
          {channel?.type === "event" && (
            <p className="text-[11px] text-nocturn font-medium">Event Channel</p>
          )}
        </div>
        <button
          onClick={() => setMemberPanelOpen((v) => !v)}
          className="w-11 h-11 flex items-center justify-center rounded-xl hover:bg-accent active:bg-accent/80 transition-colors duration-200 relative"
          aria-label="Toggle members"
        >
          <Users size={18} />
          {memberCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-nocturn flex items-center justify-center px-1">
              <span className="text-[11px] font-bold text-white">{memberCount}</span>
            </span>
          )}
        </button>
      </header>

      {/* Connection status banner */}
      {connectionStatus === 'disconnected' && (
        <div className="shrink-0 bg-amber-500/15 border-b border-amber-500/20 px-4 py-1.5 text-center animate-in fade-in slide-in-from-top-1 duration-200">
          <span className="text-xs text-amber-400 font-medium">Reconnecting...</span>
        </div>
      )}

      {/* Voice upload error */}
      {voiceError && (
        <div className="shrink-0 bg-red-500/15 border-b border-red-500/20 px-4 py-1.5 text-center animate-in fade-in slide-in-from-top-1 duration-200">
          <span className="text-xs text-red-400 font-medium">{voiceError}</span>
        </div>
      )}

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
          <div className="space-y-4 py-4 px-1">
            {/* Skeleton: incoming message */}
            <div className="flex justify-start">
              <div className="max-w-[75%] space-y-1.5">
                <div className="h-3 w-16 rounded bg-muted-foreground/10 animate-pulse" />
                <div className="rounded-2xl rounded-tl-md bg-card/60 px-4 py-3 space-y-2">
                  <div className="h-3 w-48 rounded bg-muted-foreground/10 animate-pulse" />
                  <div className="h-3 w-36 rounded bg-muted-foreground/10 animate-pulse" />
                </div>
              </div>
            </div>
            {/* Skeleton: own message */}
            <div className="flex justify-end">
              <div className="max-w-[65%] space-y-1.5">
                <div className="rounded-2xl rounded-tr-md bg-nocturn/10 px-4 py-3 space-y-2">
                  <div className="h-3 w-40 rounded bg-nocturn/10 animate-pulse" />
                  <div className="h-3 w-24 rounded bg-nocturn/10 animate-pulse" />
                </div>
              </div>
            </div>
            {/* Skeleton: AI message */}
            <div className="flex justify-start">
              <div className="max-w-[85%] space-y-1.5">
                <div className="flex items-center gap-1.5 ml-1">
                  <div className="h-3 w-3 rounded-full bg-nocturn/10 animate-pulse" />
                  <div className="h-3 w-20 rounded bg-nocturn/10 animate-pulse" />
                </div>
                <div className="rounded-2xl rounded-tl-md bg-nocturn/5 px-4 py-3 space-y-2">
                  <div className="h-3 w-56 rounded bg-nocturn/10 animate-pulse" />
                  <div className="h-3 w-44 rounded bg-nocturn/10 animate-pulse" />
                  <div className="h-3 w-32 rounded bg-nocturn/10 animate-pulse" />
                </div>
              </div>
            </div>
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
                  className="rounded-full border border-nocturn/20 bg-nocturn/5 px-3 py-1.5 text-xs font-medium text-nocturn hover:bg-nocturn/10 hover:border-nocturn/30 active:bg-nocturn/15 active:scale-[0.97] transition-all duration-200 min-h-[44px]"
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
              onAddExpense={channel?.type === "event" ? handleAddExpense : undefined}
            />
          ))
        )}
        {/* Typing indicator */}
        {aiTyping && (
          <div className="flex justify-start animate-in fade-in slide-in-from-bottom-1 duration-200">
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
              placeholder={channel?.type === "general" ? "Ask Nocturn anything..." : "Message your team... (@ai for Nocturn)"}
              className="w-full bg-transparent text-[16px] placeholder:text-muted-foreground/70 resize-none outline-none max-h-[120px] leading-5"
              rows={1}
              style={{ fontSize: "16px" }}
            />
          </div>

          <button
            onClick={sendMessage}
            disabled={!input.trim()}
            aria-label="Send message"
            className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-all duration-200 ${
              input.trim()
                ? "bg-nocturn hover:bg-nocturn/90 active:bg-nocturn/80 active:scale-95"
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

    {/* Member Sidebar (desktop) + Bottom Sheet (mobile) */}
    <ChatMemberList
      channelId={channelId}
      channelType={channel?.type ?? "general"}
      isOpen={memberPanelOpen}
      onToggle={() => setMemberPanelOpen((v) => !v)}
      onInvite={() => setInviteModalOpen(true)}
      currentUserId={userId}
      isAdmin={isAdmin}
      onMemberCountChange={setMemberCount}
      key={memberListKeyRef.current}
    />

    {/* Invite Member Modal */}
    <InviteMemberModal
      channelId={channelId}
      collectiveId={channel?.collective_id ?? null}
      isOpen={inviteModalOpen}
      onClose={() => setInviteModalOpen(false)}
      onMemberAdded={() => {
        memberListKeyRef.current += 1;
      }}
    />
    </div>
  );
}

/* ── Expense Action Button ── */
function ExpenseActionButton({
  description,
  amount,
  category,
  onAdd,
}: {
  description: string;
  amount: number;
  category: string;
  onAdd: (description: string, amount: number, category: string) => Promise<void>;
}) {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");

  if (!Number.isFinite(amount) || amount <= 0) return null;

  return (
    <button
      disabled={state !== "idle"}
      onClick={async () => {
        setState("loading");
        await onAdd(description, amount, category);
        setState("done");
      }}
      className={`ml-1 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-all ${
        state === "done"
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          : "border-nocturn/20 bg-nocturn/5 text-nocturn hover:bg-nocturn/10 hover:border-nocturn/30 active:scale-[0.97]"
      }`}
    >
      {state === "loading" ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : state === "done" ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <DollarSign className="h-3.5 w-3.5" />
      )}
      {state === "done"
        ? "Expense added"
        : `Add expense: ${description} — $${amount.toFixed(2)}`}
    </button>
  );
}

/* ── Message Bubble ── */
const MessageBubble = memo(function MessageBubble({
  msg,
  isOwn,
  userName,
  formatTime,
  onFollowUp,
  onAddExpense,
}: {
  msg: Message;
  isOwn: boolean;
  userName: string;
  formatTime: (d: string) => string;
  onFollowUp?: (text: string) => void;
  onAddExpense?: (description: string, amount: number, category: string) => Promise<void>;
}) {
  // System messages
  if (msg.type === "system") {
    return (
      <div className="flex justify-center py-1 animate-in fade-in duration-200">
        <span className="text-[12px] text-muted-foreground/70 text-center px-3">
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

    // Parse expense block from AI message: [EXPENSE:description|amount|category]
    const expenseMatch = msg.content.match(/\[EXPENSE:([^|]+)\|([^|]+)\|([^\]]+)\]/);
    const expenseParsed = expenseMatch
      ? { description: expenseMatch[1], amount: parseFloat(expenseMatch[2]), category: expenseMatch[3] }
      : null;
    // Strip expense block from displayed content
    const displayContent = msg.content.replace(/\[EXPENSE:[^\]]+\]/g, "").trim();

    return (
      <div className="flex justify-start animate-in fade-in slide-in-from-bottom-1 duration-200">
        <div className="max-w-[88%] space-y-2">
          <div className="flex items-center gap-1.5 mb-1 ml-1">
            <Sparkles size={12} className="text-nocturn" />
            <span className="text-[11px] text-nocturn font-medium">
              Nocturn AI
            </span>
          </div>
          <div className="rounded-2xl rounded-tl-md px-4 py-3 bg-nocturn/10 space-y-1">
            <div className="text-[14px] leading-relaxed text-white/90 break-words overflow-hidden">
              {renderAIContent(displayContent)}
            </div>
          </div>

          {/* Expense action button */}
          {expenseParsed && onAddExpense && (
            <ExpenseActionButton
              description={expenseParsed.description}
              amount={expenseParsed.amount}
              category={expenseParsed.category}
              onAdd={onAddExpense}
            />
          )}

          {/* Follow-up suggestions */}
          {followUps.length > 0 && (
            <div className="flex flex-wrap gap-1.5 ml-1">
              {followUps.map((q) => (
                <button
                  key={q}
                  onClick={() => onFollowUp?.(q)}
                  className="text-[11px] rounded-full border border-nocturn/20 bg-nocturn/5 px-2.5 py-2 text-nocturn hover:bg-nocturn/10 hover:border-nocturn/30 active:bg-nocturn/15 active:scale-[0.97] transition-all duration-200 min-h-[44px]"
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
      <div className={`flex ${isOwn ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-1 duration-200`}>
        <div className="max-w-[75%]">
          {!isOwn && (
            <span className="text-[11px] text-muted-foreground ml-1 mb-0.5 block">
              {userName}
            </span>
          )}
          <div
            className={`rounded-2xl px-3.5 py-2.5 transition-colors duration-200 ${
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
    <div className={`flex ${isOwn ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-1 duration-200`}>
      <div className="max-w-[80%]">
        {!isOwn && (
          <span className="text-[11px] text-muted-foreground ml-1 mb-0.5 block">
            {userName}
          </span>
        )}
        <div
          className={`rounded-2xl px-3.5 py-2.5 transition-colors duration-200 ${
            isOwn
              ? "bg-nocturn rounded-tr-md"
              : "bg-card border border-border rounded-tl-md"
          }`}
        >
          <p className="text-[14px] leading-relaxed whitespace-pre-wrap break-words overflow-hidden">
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
});
