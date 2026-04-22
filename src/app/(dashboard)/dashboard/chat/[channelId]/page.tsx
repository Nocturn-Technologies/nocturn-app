import { ChatPausedNotice } from "@/components/chat-paused-notice";

// Chat paused — see NOC-31. Channel detail route gated alongside the
// list route. Old links resolve to the paused notice rather than 404.
export default function ChatRoomPage() {
  return <ChatPausedNotice />;
}
