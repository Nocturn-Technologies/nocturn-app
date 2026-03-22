import QRCode from "qrcode";

export interface ShareCardEvent {
  title: string;
  date: string; // e.g. "SAT APR 25 \u2022 10PM"
  venue: string; // e.g. "CODA \u2022 Toronto"
  price: string; // e.g. "$25+"
  flyerUrl?: string | null;
  publicUrl: string;
}

const CARD_W = 1080;
const CARD_H = 1920;
const BG = "#09090B";
const PURPLE = "#7B2FF7";
const PURPLE_LIGHT = "#9D5CFF";
const WHITE = "#FFFFFF";
const WATERMARK = "nocturn.";

/**
 * Wrap text across multiple lines for a given max width.
 * Returns array of lines.
 */
function wrapText(
  ctx: OffscreenCanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Round-rect helper for OffscreenCanvas.
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

export async function generateShareCard(event: ShareCardEvent): Promise<Blob> {
  const canvas = new OffscreenCanvas(CARD_W, CARD_H);
  const ctx = canvas.getContext("2d")!;

  // ── Background ──
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Subtle purple gradient at top
  const topGrad = ctx.createLinearGradient(0, 0, CARD_W, CARD_H * 0.4);
  topGrad.addColorStop(0, `${PURPLE}40`);
  topGrad.addColorStop(0.5, `${PURPLE}10`);
  topGrad.addColorStop(1, "transparent");
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, CARD_W, CARD_H * 0.5);

  // ── Flyer or gradient fallback ──
  const imgY = 120;
  const imgW = CARD_W - 120;
  const imgH = 900;
  const imgX = 60;

  if (event.flyerUrl) {
    try {
      const resp = await fetch(event.flyerUrl);
      const blob = await resp.blob();
      const bitmap = await createImageBitmap(blob);

      // Draw rounded clip
      ctx.save();
      roundRect(ctx, imgX, imgY, imgW, imgH, 32);
      ctx.clip();

      // Cover-fit the image
      const scale = Math.max(imgW / bitmap.width, imgH / bitmap.height);
      const sw = imgW / scale;
      const sh = imgH / scale;
      const sx = (bitmap.width - sw) / 2;
      const sy = (bitmap.height - sh) / 2;
      ctx.drawImage(bitmap, sx, sy, sw, sh, imgX, imgY, imgW, imgH);

      ctx.restore();
    } catch {
      // Flyer load failed, draw gradient fallback
      drawGradientFallback(ctx, imgX, imgY, imgW, imgH);
    }
  } else {
    drawGradientFallback(ctx, imgX, imgY, imgW, imgH);
  }

  // ── Title ──
  let textY = imgY + imgH + 80;
  ctx.fillStyle = WHITE;
  ctx.font = "bold 72px 'Space Grotesk', 'Inter', sans-serif";
  ctx.textAlign = "left";

  const titleLines = wrapText(ctx, event.title, CARD_W - 120);
  for (const line of titleLines) {
    ctx.fillText(line, 60, textY);
    textY += 90;
  }

  // ── Date ──
  textY += 20;
  ctx.font = "600 42px 'Space Grotesk', 'Inter', sans-serif";
  ctx.fillStyle = `${WHITE}CC`;
  ctx.fillText(event.date, 60, textY);

  // ── Venue ──
  textY += 64;
  ctx.font = "500 38px 'Inter', sans-serif";
  ctx.fillStyle = `${WHITE}99`;
  ctx.fillText(event.venue, 60, textY);

  // ── Price ──
  textY += 64;
  ctx.font = "bold 44px 'Space Grotesk', 'Inter', sans-serif";
  ctx.fillStyle = PURPLE_LIGHT;
  ctx.fillText(event.price, 60, textY);

  // ── QR Code ──
  const qrSize = 180;
  const qrX = CARD_W - 60 - qrSize;
  const qrY = CARD_H - 360;
  try {
    const qrDataUrl = await QRCode.toDataURL(event.publicUrl, {
      width: qrSize,
      margin: 1,
      color: { dark: "#FFFFFF", light: "#00000000" },
    });
    const resp = await fetch(qrDataUrl);
    const blob = await resp.blob();
    const bitmap = await createImageBitmap(blob);
    ctx.drawImage(bitmap, qrX, qrY, qrSize, qrSize);
  } catch {
    // QR generation failed; show URL text instead
    ctx.font = "28px 'Inter', sans-serif";
    ctx.fillStyle = `${WHITE}66`;
    ctx.textAlign = "right";
    ctx.fillText(event.publicUrl, CARD_W - 60, qrY + qrSize / 2);
    ctx.textAlign = "left";
  }

  // Ticket link under QR
  ctx.font = "24px 'Inter', sans-serif";
  ctx.fillStyle = `${WHITE}50`;
  ctx.textAlign = "center";
  ctx.fillText("Scan for tickets", qrX + qrSize / 2, qrY + qrSize + 36);
  ctx.textAlign = "left";

  // ── Watermark ──
  ctx.font = "bold 36px 'Space Grotesk', 'Inter', sans-serif";
  ctx.fillStyle = PURPLE;
  ctx.textAlign = "left";
  ctx.fillText(WATERMARK, 60, CARD_H - 60);

  // ── URL at bottom right ──
  ctx.font = "24px 'Inter', sans-serif";
  ctx.fillStyle = `${WHITE}40`;
  ctx.textAlign = "right";
  const shortUrl = event.publicUrl.replace(/^https?:\/\//, "");
  ctx.fillText(shortUrl, CARD_W - 60, CARD_H - 64);
  ctx.textAlign = "left";

  // Export
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return blob;
}

function drawGradientFallback(
  ctx: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
) {
  ctx.save();
  roundRect(ctx, x, y, w, h, 32);
  ctx.clip();

  const grad = ctx.createLinearGradient(x, y, x + w, y + h);
  grad.addColorStop(0, PURPLE);
  grad.addColorStop(0.5, `${PURPLE}80`);
  grad.addColorStop(1, BG);
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);

  // Decorative circles
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = WHITE;
  ctx.beginPath();
  ctx.arc(x + w * 0.7, y + h * 0.3, 200, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + w * 0.2, y + h * 0.7, 150, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.restore();
}
