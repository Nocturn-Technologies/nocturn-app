import { ChatPausedNotice } from "@/components/chat-paused-notice";

// Per-event chat paused alongside top-level chat — see NOC-31.
export default function EventChatPage() {
  return <ChatPausedNotice />;
}
