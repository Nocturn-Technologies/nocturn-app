import { ChatPausedNotice } from "@/components/chat-paused-notice";

// Chat paused — see NOC-31. The previous 1100-line implementation is in
// git history; restore from the commit before the gate when the redesign
// lands.
export default function ChatPage() {
  return <ChatPausedNotice />;
}
