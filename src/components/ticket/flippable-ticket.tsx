"use client";

import { useState } from "react";
import { Calendar, Clock, MapPin, RotateCw, Share2, Download } from "lucide-react";
import { haptic } from "@/lib/haptics";

interface FlippableTicketProps {
  eventTitle: string;
  eventDate: string | null;
  eventTime: string | null;
  doorsTime: string | null;
  venueName: string | null;
  venueAddress: string | null;
  venueCity: string | null;
  tierName: string;
  pricePaid: number;
  attendeeName: string | null;
  attendeeEmail: string;
  purchaseDate: string;
  status: string;
  isCheckedIn: boolean;
  checkedInAt: string | null;
  qrCode: string | null;
  ticketToken: string;
}

export function FlippableTicket(props: FlippableTicketProps) {
  const [isFlipped, setIsFlipped] = useState(false);

  function handleFlip() {
    haptic("medium");
    setIsFlipped(!isFlipped);
  }

  async function handleShare() {
    haptic("success");

    // Try native share first
    if (navigator.share) {
      try {
        await navigator.share({
          title: `My ticket to ${props.eventTitle}`,
          text: `I'm going to ${props.eventTitle}! 🎶`,
          url: window.location.href,
        });
        return;
      } catch {
        // User cancelled or API not available
      }
    }

    // Fallback: copy link
    try {
      await navigator.clipboard.writeText(window.location.href);
      alert("Ticket link copied!");
    } catch {
      // Clipboard not available
    }
  }

  async function handleAddToStory() {
    haptic("success");

    // Generate a story-sized image via canvas
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Background
    ctx.fillStyle = "#09090B";
    ctx.fillRect(0, 0, 1080, 1920);

    // Purple gradient accent
    const grad = ctx.createRadialGradient(800, 300, 0, 800, 300, 600);
    grad.addColorStop(0, "rgba(123, 47, 247, 0.25)");
    grad.addColorStop(1, "transparent");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1080, 1920);

    // "I'M GOING" label
    ctx.font = "bold 32px system-ui, sans-serif";
    ctx.fillStyle = "#7B2FF7";
    ctx.letterSpacing = "6px";
    ctx.textAlign = "center";
    ctx.fillText("I'M GOING", 540, 400);

    // Event title
    ctx.font = "bold 72px system-ui, sans-serif";
    ctx.fillStyle = "#FAFAFA";
    ctx.letterSpacing = "0px";

    // Word wrap title
    const words = props.eventTitle.split(" ");
    let line = "";
    let y = 520;
    for (const word of words) {
      const test = line + (line ? " " : "") + word;
      if (ctx.measureText(test).width > 900) {
        ctx.fillText(line, 540, y);
        line = word;
        y += 85;
      } else {
        line = test;
      }
    }
    ctx.fillText(line, 540, y);

    // Date + venue
    ctx.font = "500 36px system-ui, sans-serif";
    ctx.fillStyle = "#A1A1AA";
    if (props.eventDate) {
      ctx.fillText(props.eventDate, 540, y + 100);
    }
    if (props.venueName) {
      ctx.fillText(props.venueName, 540, y + 150);
    }

    // QR code (if available, draw it)
    if (props.qrCode) {
      try {
        const qrImg = new Image();
        qrImg.crossOrigin = "anonymous";
        await new Promise<void>((resolve, reject) => {
          qrImg.onload = () => resolve();
          qrImg.onerror = () => reject();
          qrImg.src = props.qrCode!;
        });
        // White background for QR
        ctx.fillStyle = "#FFFFFF";
        const qrSize = 300;
        const qrX = (1080 - qrSize) / 2;
        const qrY = y + 220;
        ctx.beginPath();
        ctx.roundRect(qrX - 20, qrY - 20, qrSize + 40, qrSize + 40, 20);
        ctx.fill();
        ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
      } catch {
        // QR draw failed, skip
      }
    }

    // Nocturn watermark
    ctx.font = "bold 28px system-ui, sans-serif";
    ctx.fillStyle = "#7B2FF7";
    ctx.fillText("nocturn.", 540, 1820);

    // Convert to blob and share
    canvas.toBlob(async (blob) => {
      if (!blob) return;

      const file = new File([blob], "nocturn-ticket.png", { type: "image/png" });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `${props.eventTitle} — Nocturn`,
          });
          return;
        } catch {
          // Cancelled
        }
      }

      // Fallback: download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "nocturn-ticket.png";
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  return (
    <div className="space-y-5">
      {/* Flippable card */}
      <div
        className="ticket-perspective cursor-pointer"
        onClick={handleFlip}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && handleFlip()}
      >
        <div className={`ticket-inner ${isFlipped ? "flipped" : ""}`}>
          {/* ═══ FRONT FACE ═══ */}
          <div className="ticket-front">
            <div className="rounded-2xl border border-white/[0.08] bg-[#111114] overflow-hidden holo-shimmer animate-ticket-drop">
              {/* Perforated tear edge */}
              <div className="ticket-tear" />

              {/* Purple header band */}
              <div className="relative bg-gradient-to-r from-[#7B2FF7] to-[#9D5CFF] px-6 py-5">
                <h2 className="text-xl font-bold font-heading text-white tracking-tight">
                  {props.eventTitle}
                </h2>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                    {props.tierName}
                  </span>
                  {props.pricePaid > 0 && (
                    <span className="text-white/70 text-sm">${props.pricePaid.toFixed(2)}</span>
                  )}
                </div>
              </div>

              {/* Event details */}
              <div className="px-6 py-5 space-y-3.5">
                {props.eventDate && (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-nocturn/10 flex items-center justify-center shrink-0">
                      <Calendar className="w-4 h-4 text-nocturn" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{props.eventDate}</p>
                      <p className="text-xs text-white/40">
                        {props.doorsTime ? `Doors ${props.doorsTime}` : ""}
                        {props.doorsTime && props.eventTime ? " · " : ""}
                        {props.eventTime ? `Starts ${props.eventTime}` : ""}
                      </p>
                    </div>
                  </div>
                )}

                {props.venueName && (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-nocturn/10 flex items-center justify-center shrink-0">
                      <MapPin className="w-4 h-4 text-nocturn" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{props.venueName}</p>
                      {props.venueAddress && (
                        <p className="text-xs text-white/40">
                          {props.venueAddress}{props.venueCity ? `, ${props.venueCity}` : ""}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Dashed separator with cutouts */}
              <div className="relative px-6">
                <div className="border-t border-dashed border-white/10" />
                <div className="absolute -left-3 -top-3 w-6 h-6 rounded-full bg-[#09090B]" />
                <div className="absolute -right-3 -top-3 w-6 h-6 rounded-full bg-[#09090B]" />
              </div>

              {/* Attendee + flip hint */}
              <div className="px-6 py-4 flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-white/30 uppercase tracking-wider">Attendee</p>
                  <p className="text-sm font-medium text-white">
                    {props.attendeeName || props.attendeeEmail}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-white/30">
                  <RotateCw className="w-3.5 h-3.5 animate-pulse" />
                  <span className="text-[10px]">Tap for QR</span>
                </div>
              </div>
            </div>
          </div>

          {/* ═══ BACK FACE ═══ */}
          <div className="ticket-back">
            <div className="rounded-2xl border border-white/[0.08] bg-[#111114] overflow-hidden h-full">
              <div className="ticket-tear" />

              <div className="flex flex-col items-center justify-center h-full px-6 py-8 space-y-5">
                {props.isCheckedIn ? (
                  <>
                    <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center">
                      <span className="text-4xl">✅</span>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-white">Checked In</p>
                      <p className="text-sm text-white/40 mt-1">
                        {props.checkedInAt ? new Date(props.checkedInAt).toLocaleString("en-US") : ""}
                      </p>
                    </div>
                  </>
                ) : props.qrCode ? (
                  <>
                    <p className="text-[10px] text-white/30 uppercase tracking-[0.2em] font-semibold">
                      Scan at the door
                    </p>
                    <div className="bg-white rounded-xl p-4">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={props.qrCode}
                        alt="QR Code"
                        width={260}
                        height={260}
                        className="w-[220px] h-[220px] sm:w-[260px] sm:h-[260px]"
                      />
                    </div>
                    <p className="text-xs text-white/30 text-center">
                      Show this to door staff for entry
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-white/40">QR code unavailable</p>
                )}

                {/* Flip back hint */}
                <div className="flex items-center gap-1.5 text-white/20 pt-2">
                  <RotateCw className="w-3.5 h-3.5" />
                  <span className="text-[10px]">Tap to flip back</span>
                </div>
              </div>

              {/* Nocturn watermark */}
              <div className="absolute bottom-4 left-0 right-0 text-center">
                <span className="text-[11px] text-white/10 font-heading font-bold">nocturn.</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={(e) => { e.stopPropagation(); handleAddToStory(); }}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#7B2FF7] to-[#9D5CFF] px-4 py-3.5 text-sm font-semibold text-white transition-all hover:brightness-110 active:scale-[0.98]"
        >
          <Share2 className="w-4 h-4" />
          Share to Story
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); handleShare(); }}
          className="flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3.5 text-sm font-medium text-white/70 transition-all hover:bg-white/[0.08] active:scale-[0.98]"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>

      {/* Ticket reference */}
      <p className="text-center text-[10px] text-white/15 break-all tracking-wide">
        {props.ticketToken}
      </p>
    </div>
  );
}
