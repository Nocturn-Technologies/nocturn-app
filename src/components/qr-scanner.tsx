"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

interface QrScannerProps {
  onScan: (decodedText: string) => void;
  paused?: boolean;
}

export function QrScanner({ onScan, paused }: QrScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const pausedRef = useRef(paused);
  const onScanRef = useRef(onScan);

  // Keep refs in sync so the callback reads the latest values
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!containerRef.current) return;

    const elementId = "qr-scanner-region";
    const scanner = new Html5Qrcode(elementId);
    scannerRef.current = scanner;

    // Responsive QR box — smaller on narrow screens
    const boxSize = typeof window !== "undefined" && window.innerWidth < 400 ? 200 : 250;

    scanner
      .start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: boxSize, height: boxSize },
          aspectRatio: 1,
        },
        (decodedText: string) => {
          if (!pausedRef.current) {
            onScanRef.current(decodedText);
          }
        },
        () => {
          // Ignore QR scan failures (no code found in frame)
        }
      )
      .then(() => {
        setStarted(true);
      })
      .catch((err: unknown) => {
        console.error("[qr-scanner] Failed to start:", err);
        setError(
          "Could not access camera. Please grant camera permission and try again."
        );
      });

    return () => {
      if (scanner.isScanning) {
        scanner.stop().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative w-full">
      <div
        id="qr-scanner-region"
        ref={containerRef}
        className="overflow-hidden rounded-xl"
      />
      {!started && !error && (
        <div className="flex h-[250px] sm:h-[300px] items-center justify-center rounded-xl border border-border bg-muted">
          <div className="flex flex-col items-center gap-2">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-nocturn border-t-transparent" />
            <p className="text-sm text-muted-foreground">Starting camera...</p>
          </div>
        </div>
      )}
      {error && (
        <div className="flex h-[250px] sm:h-[300px] items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5">
          <p className="max-w-xs px-4 text-center text-sm text-destructive">{error}</p>
        </div>
      )}
      {paused && started && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-background/60 backdrop-blur-sm">
          <p className="text-sm font-medium text-muted-foreground">
            Processing...
          </p>
        </div>
      )}
    </div>
  );
}
