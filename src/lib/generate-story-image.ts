/**
 * Round-rect helper for OffscreenCanvas (roundRect not available on OffscreenCanvasRenderingContext2D).
 */
function roundRect(
  ctx: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/**
 * Generate a 1080x1920 branded image for IG Story sharing.
 * Uses OffscreenCanvas for server-safe rendering.
 */
export async function generateStoryImage(data: {
  eventTitle: string;
  date: string;
  time: string;
  venue: string;
  tierName: string;
  collectiveName: string;
  qrDataUrl?: string;
}): Promise<Blob | null> {
  try {
    const canvas = new OffscreenCanvas(1080, 1920);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Background — dark gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 1080, 1920);
    bgGrad.addColorStop(0, "#0a0015");
    bgGrad.addColorStop(0.4, "#09090B");
    bgGrad.addColorStop(1, "#09090B");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1080, 1920);

    // Purple accent glow — top right
    const glowGrad = ctx.createRadialGradient(900, 200, 0, 900, 200, 600);
    glowGrad.addColorStop(0, "rgba(123, 47, 247, 0.15)");
    glowGrad.addColorStop(1, "transparent");
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, 1080, 1920);

    // Second glow — bottom left
    const glow2 = ctx.createRadialGradient(200, 1600, 0, 200, 1600, 500);
    glow2.addColorStop(0, "rgba(123, 47, 247, 0.08)");
    glow2.addColorStop(1, "transparent");
    ctx.fillStyle = glow2;
    ctx.fillRect(0, 0, 1080, 1920);

    // Nocturn brand — top
    ctx.fillStyle = "#7B2FF7";
    ctx.font = "bold 28px sans-serif";
    ctx.fillText("nocturn.", 80, 120);

    // "I'm going to" label
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.font = "500 32px sans-serif";
    ctx.fillText("I'm going to", 80, 500);

    // Event title — huge
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "900 96px sans-serif";
    const words = data.eventTitle.split(" ");
    let y = 620;
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      const metrics = ctx.measureText(test);
      if (metrics.width > 900 && line) {
        ctx.fillText(line, 80, y);
        y += 110;
        line = word;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, 80, y);

    // Date + Time + Venue
    const infoY = y + 100;
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "600 36px sans-serif";
    ctx.fillText(data.date, 80, infoY);
    ctx.fillText(data.time, 80, infoY + 52);
    ctx.fillText(data.venue, 80, infoY + 104);

    // Tier badge
    ctx.fillStyle = "rgba(123, 47, 247, 0.15)";
    const badgeY = infoY + 170;
    const badgeText = data.tierName;
    ctx.font = "700 28px sans-serif";
    const badgeWidth = ctx.measureText(badgeText).width + 40;
    roundRect(ctx, 80, badgeY - 30, badgeWidth, 50, 25);
    ctx.fill();
    ctx.fillStyle = "#7B2FF7";
    ctx.fillText(badgeText, 100, badgeY);

    // QR code area — bottom center
    if (data.qrDataUrl) {
      // Draw white rounded rect behind QR
      ctx.fillStyle = "#FFFFFF";
      roundRect(ctx, 340, 1400, 400, 400, 20);
      ctx.fill();

      // Load and draw QR
      const qrImg = new Image();
      qrImg.src = data.qrDataUrl;
      await new Promise<void>((resolve) => {
        qrImg.onload = () => {
          ctx.drawImage(qrImg, 360, 1420, 360, 360);
          resolve();
        };
        qrImg.onerror = () => resolve();
      });
    }

    // "Scan to get yours" text — bottom
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.font = "500 24px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Scan to get yours", 540, 1860);
    ctx.textAlign = "left";

    return await canvas.convertToBlob({ type: "image/png" });
  } catch {
    return null;
  }
}
