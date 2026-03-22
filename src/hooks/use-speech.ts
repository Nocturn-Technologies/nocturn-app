"use client";

import { useState, useCallback, useRef } from "react";

export function useSpeech() {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const startListening = useCallback(() => {
    const SpeechRecognitionCtor =
      typeof window !== "undefined"
        ? window.SpeechRecognition || window.webkitSpeechRecognition
        : null;

    if (!SpeechRecognitionCtor) return;

    // Stop any existing session
    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }

    const recognition = new SpeechRecognitionCtor();
    recognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onstart = () => setListening(true);
    recognition.onresult = (e: SpeechRecognitionEvent) => {
      const result = e.results[0][0].transcript;
      setTranscript(result);
      setListening(false);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognition.start();
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setListening(false);
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript("");
  }, []);

  return { listening, transcript, startListening, stopListening, clearTranscript };
}
