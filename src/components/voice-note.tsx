"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, Square, Play, Pause } from "lucide-react";

/* ── Recording Hook ── */
interface RecordingState {
  isRecording: boolean;
  duration: number;
  start: () => void;
  stop: () => Promise<{ blob: Blob; duration: number } | null>;
}

export function useVoiceRecording(): RecordingState {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start();
      startTimeRef.current = Date.now();
      setIsRecording(true);
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 200);
    } catch {
      // Microphone permission denied
    }
  }, []);

  const stop = useCallback(
    async (): Promise<{ blob: Blob; duration: number } | null> => {
      if (!recorderRef.current || recorderRef.current.state === "inactive")
        return null;

      return new Promise((resolve) => {
        const recorder = recorderRef.current!;
        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          const dur = Math.floor(
            (Date.now() - startTimeRef.current) / 1000
          );

          recorder.stream.getTracks().forEach((t) => t.stop());

          if (timerRef.current) clearInterval(timerRef.current);
          setIsRecording(false);
          setDuration(0);
          resolve({ blob, duration: dur });
        };
        recorder.stop();
      });
    },
    []
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (
        recorderRef.current &&
        recorderRef.current.state !== "inactive"
      ) {
        recorderRef.current.stop();
        recorderRef.current.stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  return { isRecording, duration, start, stop };
}

/* ── Recording Indicator ── */
export function RecordingIndicator({ duration }: { duration: number }) {
  const formatDur = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/15">
      <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
      <span className="text-xs font-medium text-red-400">
        {formatDur(duration)}
      </span>
      {/* Waveform bars */}
      <div className="flex items-center gap-[3px] h-7">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="w-[3px] rounded-full bg-red-400/70 animate-pulse"
            style={{
              animationDelay: `${i * 0.08}s`,
              height: `${6 + Math.random() * 16}px`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Voice Playback (with real audio) ── */
interface VoicePlaybackProps {
  voiceUrl?: string;
  voiceDuration: number;
  isOwn: boolean;
}

export function VoicePlayback({ voiceUrl, voiceDuration, isOwn }: VoicePlaybackProps) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const formatDur = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s) % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // Real audio URL check — skip mock URLs
  const hasRealAudio = voiceUrl && !voiceUrl.startsWith("mock://");

  const updateProgress = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.duration && !isNaN(audio.duration)) {
      setProgress((audio.currentTime / audio.duration) * 100);
    }
    if (playing) {
      animFrameRef.current = requestAnimationFrame(updateProgress);
    }
  }, [playing]);

  const togglePlay = async () => {
    if (!hasRealAudio) return;

    // Create audio element on first play
    if (!audioRef.current) {
      const audio = new Audio(voiceUrl);
      audio.preload = "auto";
      audio.onended = () => {
        setPlaying(false);
        setProgress(0);
      };
      audio.onerror = () => {
        setPlaying(false);
        setProgress(0);
      };
      audioRef.current = audio;
    }

    const audio = audioRef.current;

    if (playing) {
      audio.pause();
      setPlaying(false);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    } else {
      try {
        await audio.play();
        setPlaying(true);
        animFrameRef.current = requestAnimationFrame(updateProgress);
      } catch {
        // Playback failed (autoplay blocked, etc)
        setPlaying(false);
      }
    }
  };

  // Start progress tracking when playing
  useEffect(() => {
    if (playing) {
      animFrameRef.current = requestAnimationFrame(updateProgress);
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [playing, updateProgress]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  const barColor = isOwn ? "bg-white/50" : "bg-nocturn/50";
  const barActiveColor = isOwn ? "bg-white" : "bg-nocturn";

  // Deterministic waveform heights
  const barHeights = [
    4, 8, 12, 6, 16, 10, 20, 8, 14, 6, 18, 10, 4, 12, 8, 16, 6, 20, 10, 14,
    8, 12, 6, 4,
  ];

  // Show current time when playing, total duration otherwise
  const displayTime = playing && audioRef.current
    ? formatDur(audioRef.current.currentTime)
    : formatDur(voiceDuration);

  return (
    <div className="flex items-center gap-2 min-w-[160px]">
      <button
        onClick={togglePlay}
        disabled={!hasRealAudio}
        aria-label={playing ? "Pause voice message" : "Play voice message"}
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-opacity ${
          !hasRealAudio ? "opacity-40 cursor-not-allowed" : ""
        }`}
        style={{
          background: isOwn
            ? "rgba(255,255,255,0.2)"
            : "rgba(123,47,247,0.2)",
        }}
      >
        {playing ? (
          <Pause
            size={14}
            className={isOwn ? "text-white" : "text-nocturn"}
          />
        ) : (
          <Play
            size={14}
            className={isOwn ? "text-white" : "text-nocturn"}
          />
        )}
      </button>

      {/* Waveform */}
      <div className="flex items-center gap-[2px] h-6 flex-1">
        {barHeights.map((h, i) => {
          const pct = (i / barHeights.length) * 100;
          return (
            <div
              key={i}
              className={`w-[2px] rounded-full transition-colors ${
                pct < progress ? barActiveColor : barColor
              }`}
              style={{ height: `${h}px` }}
            />
          );
        })}
      </div>

      <span
        className={`text-[11px] ${
          isOwn ? "text-white/70" : "text-muted-foreground"
        }`}
      >
        {displayTime}
      </span>
    </div>
  );
}

/* ── Mic Button for Chat Input Bar ── */
interface MicButtonProps {
  onSendVoice: (blob: Blob, duration: number) => void;
}

export function MicButton({ onSendVoice }: MicButtonProps) {
  const { isRecording, duration, start, stop } = useVoiceRecording();

  const handlePress = async () => {
    if (isRecording) {
      const result = await stop();
      if (result && result.duration > 0) {
        onSendVoice(result.blob, result.duration);
      }
    } else {
      start();
    }
  };

  return (
    <div className="flex items-center gap-2">
      {isRecording && <RecordingIndicator duration={duration} />}
      <button
        onClick={handlePress}
        aria-label={isRecording ? "Stop recording" : "Start recording"}
        className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
          isRecording
            ? "bg-red-500"
            : "bg-accent hover:bg-accent/80"
        }`}
      >
        {isRecording ? (
          <Square size={16} className="text-white" />
        ) : (
          <Mic size={20} className="text-muted-foreground" />
        )}
      </button>
    </div>
  );
}
