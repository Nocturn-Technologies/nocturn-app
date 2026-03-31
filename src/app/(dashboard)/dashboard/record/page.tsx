"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Mic,
  Square,
  ChevronDown,
  ChevronUp,
  Share2,
  Clock,
  CheckCircle2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { haptic } from "@/lib/haptics";
import { transcribeAudio, transcribeFromStorage } from "@/app/actions/transcribe";

// ─── Types ───────────────────────────────────────────────────────────

interface Recording {
  id: string;
  user_id: string;
  collective_id: string | null;
  duration_seconds: number | null;
  transcript: string | null;
  summary: string | null;
  action_items: string[] | null;
  key_decisions: string[] | null;
  audio_url: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ─── Waveform animation bars ─────────────────────────────────────────

function WaveformBars() {
  return (
    <div className="flex items-center justify-center gap-1 h-8">
      {Array.from({ length: 20 }).map((_, i) => (
        <div
          key={i}
          className="w-1 rounded-full bg-red-400 animate-pulse"
          style={{
            animationDelay: `${i * 0.07}s`,
            height: `${8 + Math.random() * 20}px`,
          }}
        />
      ))}
    </div>
  );
}

// ─── Recording Card ──────────────────────────────────────────────────

function RecordingCard({
  recording,
  onShare,
}: {
  recording: Recording;
  onShare: (r: Recording) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="overflow-hidden border-border">
      {/* Header — always visible */}
      <button
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-accent/50 transition-colors min-h-[56px]"
        onClick={() => setExpanded(!expanded)}
      >
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            recording.status === "done"
              ? "bg-nocturn/20"
              : recording.status === "processing"
              ? "bg-yellow-500/20"
              : "bg-red-500/20"
          }`}
        >
          {recording.status === "done" ? (
            <CheckCircle2 size={18} className="text-nocturn" />
          ) : recording.status === "processing" ? (
            <Loader2 size={18} className="text-yellow-400 animate-spin" />
          ) : (
            <AlertCircle size={18} className="text-red-400" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {recording.summary
              ? recording.summary.split(".")[0]
              : recording.status === "processing"
              ? "Processing call..."
              : "Recording failed"}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-muted-foreground">
              {formatDate(recording.created_at)}
            </span>
            {recording.duration_seconds != null && (
              <>
                <span className="text-xs text-muted-foreground">-</span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock size={10} />
                  {formatDuration(recording.duration_seconds)}
                </span>
              </>
            )}
            {(recording.action_items?.length ?? 0) > 0 && (
              <>
                <span className="text-xs text-muted-foreground">-</span>
                <span className="text-xs text-nocturn font-medium">
                  {recording.action_items!.length} action
                  {recording.action_items!.length !== 1 ? "s" : ""}
                </span>
              </>
            )}
          </div>
        </div>

        {recording.status === "done" && (
          <div className="shrink-0 text-muted-foreground">
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
        )}
      </button>

      {/* Expanded details */}
      {expanded && recording.status === "done" && (
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
          {recording.summary && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                Summary
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {recording.summary}
              </p>
            </div>
          )}

          {(recording.action_items?.length ?? 0) > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
                Action Items
              </p>
              <div className="space-y-1.5">
                {recording.action_items!.map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="w-5 h-5 rounded-md bg-nocturn/20 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-[10px] font-bold text-nocturn">
                        {i + 1}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(recording.key_decisions?.length ?? 0) > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
                Key Decisions
              </p>
              <div className="space-y-1">
                {recording.key_decisions!.map((d, i) => (
                  <p key={i} className="text-sm text-muted-foreground">
                    - {d}
                  </p>
                ))}
              </div>
            </div>
          )}

          <Button
            variant="outline"
            className="w-full border-green-600/30 text-green-400 hover:bg-green-600/10"
            onClick={() => onShare(recording)}
          >
            <Share2 size={16} className="mr-2" />
            Send to Team
          </Button>
        </div>
      )}
    </Card>
  );
}

// ─── Main Record Page ────────────────────────────────────────────────

export default function RecordPage() {
  const supabase = createClient();

  const [userId, setUserId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentRecordingIdRef = useRef<string | null>(null);

  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loadingRecordings, setLoadingRecordings] = useState(true);

  // Get current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, [supabase]);

  // Fetch past recordings
  const fetchRecordings = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("recordings")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setRecordings(data as Recording[]);
    setLoadingRecordings(false);
  }, [userId, supabase]);

  useEffect(() => {
    fetchRecordings();
  }, [fetchRecordings]);

  // Timer
  useEffect(() => {
    if (isRecording) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  const startRecording = async () => {
    haptic('medium');
    setPermissionError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.start(1000);
      setIsRecording(true);

      if (userId) {
        const { data: row, error: insertError } = await supabase
          .from("recordings")
          .insert({ user_id: userId, status: "recording" })
          .select("id")
          .maybeSingle();
        if (insertError) {
          console.error("[record] Failed to create recording row:", insertError.message);
          setPermissionError("Failed to start recording. Please try again.");
        } else if (row) {
          currentRecordingIdRef.current = row.id;
        }
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Could not access microphone";
      setPermissionError(msg);
    }
  };

  const stopRecording = async () => {
    haptic('success');
    const mr = mediaRecorderRef.current;
    if (!mr) return;

    // Wait for final data chunk before processing
    const audioReady = new Promise<void>((resolve) => {
      mr.onstop = () => resolve();
    });

    mr.stop();
    mr.stream.getTracks().forEach((t) => t.stop());
    await audioReady;

    setIsRecording(false);
    setIsProcessing(true);

    const durationSeconds = elapsed;
    const recordingId = currentRecordingIdRef.current;

    if (recordingId) {
      await supabase
        .from("recordings")
        .update({ status: "processing", duration_seconds: durationSeconds })
        .eq("id", recordingId);
    }

    await fetchRecordings();

    try {
      const audioBlob = new Blob(chunksRef.current, { type: mr.mimeType });
      const fileSizeMB = audioBlob.size / (1024 * 1024);

      let result;

      if (fileSizeMB > 3 || durationSeconds > 180) {
        // Long recording: upload to Supabase Storage, then transcribe server-side
        const storagePath = `${userId}/${recordingId ?? Date.now()}.webm`;

        const { error: uploadError } = await supabase.storage
          .from("recordings")
          .upload(storagePath, audioBlob, {
            contentType: mr.mimeType,
            upsert: true,
          });

        if (uploadError) {
          throw new Error(`Upload failed: ${uploadError.message}`);
        }

        // Update recording with audio URL
        if (recordingId) {
          const { data: urlData } = supabase.storage
            .from("recordings")
            .getPublicUrl(storagePath);
          await supabase
            .from("recordings")
            .update({ audio_url: urlData.publicUrl })
            .eq("id", recordingId);
        }

        // Transcribe from storage (server-side download + Whisper)
        result = await transcribeFromStorage(storagePath);
      } else {
        // Short recording: send as base64 (fast path)
        const arrayBuffer = await audioBlob.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(arrayBuffer).reduce(
            (data, byte) => data + String.fromCharCode(byte),
            ""
          )
        );
        result = await transcribeAudio(base64, mr.mimeType);
      }

      if (result.error) {
        throw new Error(result.error);
      }

      if (recordingId) {
        await supabase
          .from("recordings")
          .update({
            status: "done",
            transcript: result.transcript,
            summary: result.summary,
            action_items: result.action_items,
            key_decisions: result.key_decisions,
          })
          .eq("id", recordingId);
      }
    } catch (err) {
      console.error("Recording processing failed:", err);
      if (recordingId) {
        await supabase
          .from("recordings")
          .update({ status: "failed" })
          .eq("id", recordingId);
      }
    }

    currentRecordingIdRef.current = null;
    setIsProcessing(false);
    await fetchRecordings();
  };

  const shareRecording = (recording: Recording) => {
    const date = formatFullDate(recording.created_at);
    const actionItemsText = (recording.action_items ?? [])
      .map((item) => `- ${item}`)
      .join("\n");
    const decisionsText = (recording.key_decisions ?? [])
      .map((d) => `- ${d}`)
      .join("\n");

    const text = [
      `Call Notes - ${date}`,
      "",
      `Summary:`,
      recording.summary ?? "No summary available",
      "",
      ...((recording.action_items?.length ?? 0) > 0
        ? [`Action Items:`, actionItemsText, ""]
        : []),
      ...((recording.key_decisions?.length ?? 0) > 0
        ? [`Key Decisions:`, decisionsText, ""]
        : []),
      "Captured by Nocturn",
    ].join("\n");

    if (navigator.share) {
      navigator.share({ text }).catch(() => {
        window.open(
          `https://wa.me/?text=${encodeURIComponent(text)}`,
          "_blank"
        );
      });
    } else {
      window.open(
        `https://wa.me/?text=${encodeURIComponent(text)}`,
        "_blank"
      );
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold font-heading tracking-tight">Record</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Capture calls, meetings & ideas with AI notes
        </p>
      </div>

      {/* Record button area */}
      <div className="flex flex-col items-center py-8 md:py-12">
        {!isRecording && !isProcessing && (
          <p className="text-sm text-muted-foreground mb-6 text-center">
            Put your call on speaker, then tap record
          </p>
        )}

        {isRecording && (
          <div className="mb-4 space-y-3">
            <p className="text-center text-3xl font-mono font-bold text-red-400">
              {formatDuration(elapsed)}
            </p>
            <WaveformBars />
          </div>
        )}

        {isProcessing && (
          <div className="mb-6 flex flex-col items-center gap-3">
            <Loader2 size={28} className="text-nocturn animate-spin" />
            <p className="text-sm text-muted-foreground">
              Processing your call...
            </p>
          </div>
        )}

        {!isProcessing && (
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isProcessing}
            className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all ${
              isRecording
                ? "bg-red-500 shadow-lg shadow-red-500/40"
                : "bg-nocturn shadow-lg shadow-nocturn/40"
            }`}
          >
            {isRecording && (
              <span className="absolute inset-0 rounded-full bg-red-500/30 animate-ping" />
            )}
            {!isRecording && (
              <span className="absolute inset-0 rounded-full bg-nocturn/20 animate-pulse" />
            )}

            {isRecording ? (
              <Square size={28} className="text-white relative z-10" fill="white" />
            ) : (
              <Mic size={32} className="text-white relative z-10" />
            )}
          </button>
        )}

        {isRecording && (
          <p className="text-xs text-muted-foreground mt-3">
            Tap to stop recording
          </p>
        )}

        {permissionError && (
          <div className="mt-4 rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-center max-w-sm">
            <p className="text-xs text-red-400">{permissionError}</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Check your browser microphone permissions
            </p>
          </div>
        )}
      </div>

      {/* Past recordings */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Past Recordings
        </h2>

        {loadingRecordings ? (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-nocturn border-t-transparent rounded-full animate-spin" />
          </div>
        ) : recordings.length === 0 ? (
          <Card className="p-8 text-center border-border">
            <Mic size={32} className="text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Your call recordings and AI-generated notes will appear here.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {recordings.map((r) => (
              <RecordingCard
                key={r.id}
                recording={r}
                onShare={shareRecording}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
