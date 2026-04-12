"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Sparkles, X, Send, Loader2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { askNocturn } from "@/app/actions/ask-nocturn";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface AskNocturnProps {
  collectiveId: string;
}

export function AskNocturn({ collectiveId }: AskNocturnProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Hide floating button on pages where it overlaps with input areas
  const hiddenPaths = ["/dashboard/chat", "/dashboard/events/new", "/dashboard/marketing"];
  const shouldHideButton = !open && hiddenPaths.some((p) => pathname.startsWith(p));
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    if (shouldHideButton && open) setOpen(false);
  }, [shouldHideButton, open]);

  // Focus input when drawer opens
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  const handleSend = useCallback(async () => {
    const question = input.trim();
    if (!question || loading) return;

    const userMessage: Message = { id: crypto.randomUUID(), role: "user", content: question };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      // Send last 6 messages as history context
      const history = [...messages, userMessage].slice(-6);
      const response = await askNocturn(question, collectiveId, history);
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: response }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: "Something went wrong. Try again in a moment." },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, collectiveId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* ── Floating trigger button (hidden on chat/event-creation pages) ── */}
      {!open && !shouldHideButton && (
        <button
          onClick={() => setOpen(true)}
          className="fixed z-[55] bottom-[calc(env(safe-area-inset-bottom)+80px)] right-4 md:bottom-6 md:right-6 h-12 w-12 rounded-full bg-gradient-to-br from-nocturn to-nocturn-light shadow-lg shadow-nocturn/30 flex items-center justify-center transition-transform hover:scale-105 active:scale-95 animate-pulse-subtle"
          aria-label="Ask Nocturn AI"
        >
          <span className="text-base">🌙</span>
        </button>
      )}

      {/* ── Backdrop (mobile only) ── */}
      {open && (
        <div
          className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm md:bg-black/40 transition-opacity"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ── Chat drawer ── */}
      {open && (
        <div
          className={
            "fixed z-[75] flex flex-col bg-card/95 backdrop-blur-2xl border-white/[0.08] " +
            // Mobile: bottom sheet
            "inset-x-0 bottom-0 h-[80vh] rounded-t-3xl border-t " +
            // Desktop: right panel
            "md:inset-x-auto md:right-0 md:top-0 md:bottom-0 md:h-full md:w-[400px] md:rounded-none md:border-l md:border-t-0 " +
            "animate-slide-in-up md:animate-none"
          }
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-nocturn to-nocturn-light flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">Ask Nocturn</h2>
                <p className="text-[11px] text-muted-foreground">AI assistant</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="h-10 w-10 min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center hover:bg-white/[0.06] transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          {/* Drag handle (mobile) */}
          <div className="flex justify-center pt-1 md:hidden">
            <div className="w-10 h-1 rounded-full bg-white/20" />
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-smooth px-4 py-3 space-y-3">
            {messages.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <div className="h-12 w-12 rounded-full bg-nocturn/10 flex items-center justify-center mb-3">
                  <Sparkles className="h-6 w-6 text-nocturn" />
                </div>
                <p className="text-sm font-medium text-foreground mb-1">What can I help with?</p>
                <p className="text-xs text-muted-foreground mb-4">
                  Ask about your events, revenue, audience, or anything Nocturn.
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {[
                    "How many tickets sold this week?",
                    "What's my total revenue?",
                    "Where do I see settlements?",
                    "Write me an IG caption",
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => {
                        setInput(suggestion);
                        setTimeout(() => inputRef.current?.focus(), 0);
                      }}
                      className="rounded-full border border-nocturn/20 bg-nocturn/5 px-3 py-1.5 text-xs font-medium text-nocturn hover:bg-nocturn/10 transition-colors min-h-[36px]"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, _i) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div className="max-w-[85%]">
                  <div
                    className={`rounded-2xl px-3.5 py-2.5 ${
                      msg.role === "user"
                        ? "bg-nocturn rounded-tr-md"
                        : "bg-card border border-border rounded-tl-md"
                    }`}
                  >
                    <p className="text-[14px] leading-relaxed whitespace-pre-wrap">
                      {msg.content}
                    </p>
                  </div>
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <div className="flex justify-start">
                <div className="max-w-[85%]">
                  <div className="rounded-2xl rounded-tl-md px-3.5 py-2.5 bg-nocturn/10">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-nocturn rounded-full animate-bounce [animation-delay:0ms]" />
                      <span className="w-1.5 h-1.5 bg-nocturn rounded-full animate-bounce [animation-delay:150ms]" />
                      <span className="w-1.5 h-1.5 bg-nocturn rounded-full animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="shrink-0 border-t border-white/[0.06] p-3 pb-[max(env(safe-area-inset-bottom),12px)] md:pb-3">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything..."
                className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-nocturn/40 focus:ring-1 focus:ring-nocturn/20 transition-colors"
                disabled={loading}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className={`h-10 w-10 min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center transition-all shrink-0 ${
                  input.trim() && !loading
                    ? "bg-nocturn hover:bg-nocturn/90 text-white"
                    : "bg-white/[0.04] text-muted-foreground"
                }`}
                aria-label="Send"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
