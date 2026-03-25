"use client";

import { useState } from "react";
import Image from "next/image";
import { Calendar, Clock, MapPin, Ticket, Check, QrCode } from "lucide-react";

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

  const handleFlip = () => {
    // Haptic feedback
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(10);
    }
    setIsFlipped(!isFlipped);
  };

  return (
    <div className="w-full max-w-[380px] mx-auto">
      {/* Flip hint */}
      <div className="text-center mb-4">
        <span className="text-[11px] text-white/25 font-medium tracking-wide uppercase">
          {isFlipped ? "Tap to see details" : "Tap to show QR"}
        </span>
      </div>

      {/* 3D flip container */}
      <div
        className="relative w-full cursor-pointer"
        style={{ perspective: "1200px" }}
        onClick={handleFlip}
      >
        <div
          className="relative w-full transition-transform duration-600 ease-in-out"
          style={{
            transformStyle: "preserve-3d",
            transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
            transitionDuration: "0.6s",
            transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          {/* ═══ FRONT FACE — Event Details ═══ */}
          <div
            className="relative w-full rounded-[24px] overflow-hidden"
            style={{ backfaceVisibility: "hidden" }}
          >
            {/* Perforated top edge */}
            <div className="absolute top-0 left-0 right-0 z-20 h-3 flex items-center justify-between px-2">
              {[...Array(20)].map((_, i) => (
                <div key={i} className="w-2 h-2 rounded-full bg-[#09090B]" />
              ))}
            </div>

            {/* Card body */}
            <div className="bg-gradient-to-br from-[#1a1a24] to-[#12121a] border border-white/[0.06] pt-6 pb-5 px-6">
              {/* Holographic shimmer */}
              <div className="absolute inset-0 opacity-[0.04] pointer-events-none overflow-hidden rounded-[24px]">
                <div
                  className="absolute inset-0"
                  style={{
                    background: "linear-gradient(105deg, transparent 30%, rgba(123,47,247,0.3) 45%, rgba(255,255,255,0.15) 50%, rgba(123,47,247,0.3) 55%, transparent 70%)",
                    backgroundSize: "200% 100%",
                    animation: "holoShimmer 3s ease-in-out infinite",
                  }}
                />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between mb-6 relative z-10">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#7B2FF7]" />
                  <span className="text-[10px] font-bold tracking-[0.25em] uppercase text-white/30">Nocturn</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Ticket className="h-3 w-3 text-white/20" />
                  <span className="text-[10px] font-semibold text-white/20 uppercase tracking-wider">
                    {props.tierName}
                  </span>
                </div>
              </div>

              {/* Event title */}
              <h2 className="font-heading text-[28px] sm:text-[32px] font-black tracking-[-0.04em] text-white leading-[0.95] mb-6 relative z-10">
                {props.eventTitle}
              </h2>

              {/* Details rows */}
              <div className="space-y-3 relative z-10">
                {props.eventDate && (
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-[#7B2FF7] shrink-0" />
                    <span className="text-[14px] text-white/50">{props.eventDate}</span>
                  </div>
                )}
                {props.eventTime && (
                  <div className="flex items-center gap-3">
                    <Clock className="h-4 w-4 text-[#7B2FF7] shrink-0" />
                    <span className="text-[14px] text-white/50">
                      {props.eventTime}
                      {props.doorsTime && <span className="text-white/25"> · Doors {props.doorsTime}</span>}
                    </span>
                  </div>
                )}
                {props.venueName && (
                  <div className="flex items-center gap-3">
                    <MapPin className="h-4 w-4 text-[#7B2FF7] shrink-0" />
                    <span className="text-[14px] text-white/50">
                      {props.venueName}
                      {props.venueCity && <span className="text-white/25"> · {props.venueCity}</span>}
                    </span>
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="my-5 border-t border-dashed border-white/[0.06] relative z-10" />

              {/* Bottom info */}
              <div className="flex items-center justify-between relative z-10">
                <div>
                  <p className="text-[11px] text-white/20 uppercase tracking-wider font-semibold mb-0.5">Attendee</p>
                  <p className="text-[13px] text-white/50 font-medium">{props.attendeeName || props.attendeeEmail}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-white/20 uppercase tracking-wider font-semibold mb-0.5">Paid</p>
                  <p className="text-[13px] text-white/50 font-medium">
                    {props.pricePaid === 0 ? "Free" : `$${props.pricePaid.toFixed(2)}`}
                  </p>
                </div>
              </div>

              {/* Status badge */}
              {props.isCheckedIn && (
                <div className="mt-4 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-green-500/10 border border-green-500/20 relative z-10">
                  <Check className="h-3.5 w-3.5 text-green-400" />
                  <span className="text-[11px] font-semibold text-green-400 uppercase tracking-wider">Checked In</span>
                </div>
              )}

              {/* Flip hint */}
              <div className="mt-4 flex items-center justify-center gap-1.5 relative z-10">
                <QrCode className="h-3 w-3 text-white/15" />
                <span className="text-[10px] text-white/15 font-medium">Tap to show QR code</span>
              </div>
            </div>
          </div>

          {/* ═══ BACK FACE — QR Code ═══ */}
          <div
            className="absolute inset-0 w-full rounded-[24px] overflow-hidden"
            style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          >
            {/* Perforated top edge */}
            <div className="absolute top-0 left-0 right-0 z-20 h-3 flex items-center justify-between px-2">
              {[...Array(20)].map((_, i) => (
                <div key={i} className="w-2 h-2 rounded-full bg-[#09090B]" />
              ))}
            </div>

            <div className="bg-gradient-to-br from-[#1a1a24] to-[#12121a] border border-white/[0.06] pt-6 pb-5 px-6 h-full flex flex-col items-center justify-center">
              {/* Header */}
              <div className="flex items-center gap-2 mb-6">
                <div className="w-2 h-2 rounded-full bg-[#7B2FF7]" />
                <span className="text-[10px] font-bold tracking-[0.25em] uppercase text-white/30">Scan at the door</span>
              </div>

              {/* QR Code */}
              {props.qrCode ? (
                <div className="rounded-xl bg-white p-4 mb-4">
                  <Image
                    src={props.qrCode}
                    alt="Ticket QR Code"
                    width={240}
                    height={240}
                    className="w-[240px] h-[240px] sm:w-[280px] sm:h-[280px]"
                    unoptimized
                  />
                </div>
              ) : (
                <div className="w-[240px] h-[240px] sm:w-[280px] sm:h-[280px] rounded-xl bg-white/5 flex items-center justify-center mb-4">
                  <QrCode className="h-12 w-12 text-white/20" />
                </div>
              )}

              {/* Ticket ID */}
              <p className="text-[10px] text-white/15 font-mono tracking-wider">
                {props.ticketToken.slice(0, 8)}...{props.ticketToken.slice(-4)}
              </p>

              {/* Flip hint */}
              <div className="mt-4 flex items-center justify-center gap-1.5">
                <Ticket className="h-3 w-3 text-white/15" />
                <span className="text-[10px] text-white/15 font-medium">Tap to see details</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Share to IG Story button */}
      <div className="mt-6 text-center">
        <button
          onClick={(e) => {
            e.stopPropagation();
            // Future: generate 1080x1920 story image
            if (navigator.share) {
              navigator.share({
                title: props.eventTitle,
                text: `I'm going to ${props.eventTitle}!`,
                url: `https://app.trynocturn.com/ticket/${props.ticketToken}`,
              }).catch(() => {});
            }
          }}
          className="inline-flex items-center gap-2 px-5 py-2.5 border border-white/[0.08] rounded-full text-[13px] text-white/40 font-medium hover:text-white/60 hover:border-white/15 transition-all"
        >
          Share to IG Story
        </button>
      </div>

      <style jsx>{`
        @keyframes holoShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
