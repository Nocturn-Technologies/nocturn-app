"use client";

import { useState } from "react";
import { Share2, Download, Loader2, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateShareCard, type ShareCardEvent } from "@/lib/generate-share-card";

interface ShareCardGeneratorProps {
  event: ShareCardEvent;
  /** Variant: "button" shows a simple icon button, "full" shows a labeled button */
  variant?: "button" | "full";
  /** Accent color for public page styling */
  accentColor?: string;
}

export function ShareCardGenerator({
  event,
  variant = "full",
  accentColor,
}: ShareCardGeneratorProps) {
  const [generating, setGenerating] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  async function handleGenerate() {
    if (generating) return;
    setGenerating(true);

    try {
      const blob = await generateShareCard(event);
      const file = new File([blob], `${slugify(event.title)}-share.png`, {
        type: "image/png",
      });

      // Try native share with file first
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({
            title: event.title,
            files: [file],
          });
          setGenerating(false);
          return;
        } catch {
          // User cancelled or share failed, fall through to download
        }
      }

      // Fallback: show preview and download
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      downloadBlob(blob, `${slugify(event.title)}-share.png`);
    } catch (err) {
      console.error("Share card generation failed:", err);
    } finally {
      setGenerating(false);
    }
  }

  function handleClose() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  }

  if (variant === "button") {
    return (
      <>
        <Button
          variant="outline"
          size="sm"
          onClick={handleGenerate}
          disabled={generating}
          className={
            accentColor
              ? "border-white/10 bg-white/5 text-white hover:bg-white/10"
              : ""
          }
        >
          {generating ? (
            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
          ) : (
            <ImageIcon className="mr-2 h-3 w-3" />
          )}
          Share Card
        </Button>

        {previewUrl && (
          <PreviewModal
            previewUrl={previewUrl}
            onClose={handleClose}
            event={event}
          />
        )}
      </>
    );
  }

  return (
    <div className="space-y-2">
      <h2
        className={`font-heading text-[10px] font-semibold uppercase tracking-[0.2em] ${
          accentColor ? "text-white/20" : "text-muted-foreground"
        }`}
      >
        Share as Story
      </h2>
      <button
        onClick={handleGenerate}
        disabled={generating}
        className={`flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
          accentColor
            ? "border-white/10 bg-white/5 text-white hover:bg-white/10"
            : "border-border bg-card text-foreground hover:bg-muted"
        }`}
      >
        {generating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Share2 className="h-4 w-4" />
            Generate Share Card
          </>
        )}
      </button>

      {previewUrl && (
        <PreviewModal
          previewUrl={previewUrl}
          onClose={handleClose}
          event={event}
        />
      )}
    </div>
  );
}

function PreviewModal({
  previewUrl,
  onClose,
  event,
}: {
  previewUrl: string;
  onClose: () => void;
  event: ShareCardEvent;
}) {
  async function handleDownload() {
    const resp = await fetch(previewUrl);
    const blob = await resp.blob();
    downloadBlob(blob, `${slugify(event.title)}-share.png`);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative max-h-[85vh] w-full max-w-xs overflow-hidden rounded-2xl bg-[#09090B] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt="Share card preview"
          className="w-full"
        />
        <div className="flex gap-2 p-3">
          <button
            onClick={handleDownload}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/20"
          >
            <Download className="h-4 w-4" />
            Save Image
          </button>
          <button
            onClick={onClose}
            className="rounded-xl bg-white/5 px-4 py-2.5 text-sm font-medium text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
