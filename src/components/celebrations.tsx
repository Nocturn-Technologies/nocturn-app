"use client";

import { useCallback } from "react";

// 🎉 Full-screen confetti burst — use on event publish, first ticket sale, etc.
export function useConfetti() {
  const fire = useCallback(async (options?: { emoji?: boolean; duration?: number }) => {
    // Dynamic import to avoid SSR crash
    const confetti = (await import("canvas-confetti")).default;

    const duration = options?.duration ?? 3000;
    const end = Date.now() + duration;

    const colors = ["#7B2FF7", "#9D5CFF", "#E9DEFF", "#FFFFFF", "#F59E0B"];

    function frame() {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.7 },
        colors,
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.7 },
        colors,
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    }

    // Initial big burst
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors,
    });

    frame();
  }, []);

  return fire;
}

// 💰 Ka-ching animation for ticket sales — smaller, focused burst
export function useKaChing() {
  const fire = useCallback(async () => {
    const confetti = (await import("canvas-confetti")).default;
    confetti({
      particleCount: 30,
      spread: 50,
      origin: { y: 0.8, x: 0.5 },
      colors: ["#22c55e", "#4ade80", "#86efac", "#F59E0B", "#FFFFFF"],
      gravity: 1.5,
      scalar: 0.8,
    });
  }, []);

  return fire;
}

// 🎟️ Post-purchase share card generator
export async function generateTicketShareCard(event: {
  title: string;
  date: string;
  venue: string;
  tierName: string;
  quantity: number;
  accentColor?: string;
}): Promise<string> {
  const canvas = document.createElement("canvas");
  const W = 1080;
  const H = 1920; // 9:16 Instagram story
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  const accent = event.accentColor || "#7B2FF7";

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#09090B");
  grad.addColorStop(0.4, "#0F0F12");
  grad.addColorStop(1, "#09090B");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Accent glow circle
  const glowGrad = ctx.createRadialGradient(W / 2, H * 0.35, 0, W / 2, H * 0.35, 400);
  glowGrad.addColorStop(0, accent + "30");
  glowGrad.addColorStop(1, "transparent");
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";

  // "I'M GOING" header
  ctx.fillStyle = accent;
  ctx.font = "bold 32px 'Arial', sans-serif";
  ctx.letterSpacing = "12px";
  ctx.fillText("I'M GOING", W / 2, H * 0.25);

  // Decorative line
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W * 0.3, H * 0.28);
  ctx.lineTo(W * 0.7, H * 0.28);
  ctx.stroke();

  // Event title — BIG
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "900 72px 'Arial Black', 'Helvetica Neue', sans-serif";
  ctx.letterSpacing = "2px";

  // Word wrap the title
  const words = event.title.split(" ");
  const lines: string[] = [];
  let currentLine = "";
  for (const word of words) {
    const test = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(test.toUpperCase()).width > W - 160) {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = test;
    }
  }
  if (currentLine) lines.push(currentLine);

  const titleStartY = H * 0.38;
  const titleLineHeight = 85;
  lines.forEach((line, i) => {
    ctx.fillText(line.toUpperCase(), W / 2, titleStartY + i * titleLineHeight, W - 120);
  });

  // Date
  const infoY = titleStartY + lines.length * titleLineHeight + 60;
  ctx.fillStyle = accent;
  ctx.font = "bold 36px 'Helvetica Neue', Arial, sans-serif";
  ctx.letterSpacing = "6px";
  ctx.fillText(event.date.toUpperCase(), W / 2, infoY);

  // Venue
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = "500 28px 'Helvetica Neue', Arial, sans-serif";
  ctx.letterSpacing = "4px";
  ctx.fillText(event.venue.toUpperCase(), W / 2, infoY + 50);

  // Ticket info
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.font = "500 24px 'Helvetica Neue', Arial, sans-serif";
  ctx.letterSpacing = "3px";
  const ticketText = event.quantity > 1
    ? `${event.quantity} × ${event.tierName.toUpperCase()}`
    : event.tierName.toUpperCase();
  ctx.fillText(ticketText, W / 2, infoY + 110);

  // Ticket emoji / icon area
  ctx.font = "80px serif";
  ctx.fillText("🎟️", W / 2, H * 0.72);

  // "Powered by nocturn." footer
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.font = "500 20px 'Helvetica Neue', Arial, sans-serif";
  ctx.letterSpacing = "2px";
  ctx.fillText("POWERED BY", W / 2, H - 120);
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = "bold 24px 'Helvetica Neue', Arial, sans-serif";
  ctx.fillText("🌙 nocturn.", W / 2, H - 85);

  return canvas.toDataURL("image/png", 0.92);
}
