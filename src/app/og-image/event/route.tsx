import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

// Sanitize text for OG image rendering — strip HTML/script tags
function sanitizeText(str: string): string {
  return str.replace(/[<>&"']/g, (c) => {
    const map: Record<string, string> = { "<": "", ">": "", "&": "&", '"': "", "'": "" };
    return map[c] ?? c;
  }).trim();
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const title = sanitizeText((searchParams.get("title") || "Event").slice(0, 100));
  const collective = sanitizeText((searchParams.get("collective") || "").slice(0, 50));
  const date = sanitizeText((searchParams.get("date") || "").slice(0, 50));
  const venue = sanitizeText((searchParams.get("venue") || "").slice(0, 50));
  const price = sanitizeText((searchParams.get("price") || "").slice(0, 20));
  const flyer = searchParams.get("flyer") || "";

  // When a flyer exists, use a split layout: flyer left + text right.
  // This prevents portrait flyers from being cropped unreadably by social
  // platforms that enforce 1.91:1 aspect ratio on summary_large_image cards.
  if (flyer && flyer.startsWith("http")) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            background: "#09090B",
            color: "white",
            fontFamily: "sans-serif",
          }}
        >
          {/* Left panel: flyer image (contained, not cropped) */}
          <div
            style={{
              width: "40%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              background: "linear-gradient(180deg, #1a0a2e 0%, #09090B 100%)",
              position: "relative",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={flyer}
              alt=""
              width={480}
              height={630}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          </div>

          {/* Right panel: event details */}
          <div
            style={{
              width: "60%",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              padding: "48px 52px",
            }}
          >
            {/* Top: Collective + branding */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: "#7B2FF7",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    fontWeight: 700,
                  }}
                >
                  {collective.charAt(0).toUpperCase()}
                </div>
                <span style={{ fontSize: 18, color: "#a1a1aa", fontWeight: 500 }}>
                  {collective}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 15, color: "#71717a" }}>🌙</span>
                <span style={{ fontSize: 15, color: "#71717a", fontWeight: 600 }}>nocturn.</span>
              </div>
            </div>

            {/* Center: title */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1, justifyContent: "center" }}>
              <h1
                style={{
                  fontSize: title.length > 25 ? 42 : 52,
                  fontWeight: 800,
                  lineHeight: 1.1,
                  letterSpacing: -1.5,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {title}
              </h1>
            </div>

            {/* Bottom: date, venue, price */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {date && (
                  <span style={{ fontSize: 20, fontWeight: 600, color: "#e4e4e7" }}>
                    {date}
                  </span>
                )}
                {venue && (
                  <span style={{ fontSize: 16, color: "#a1a1aa" }}>
                    {venue}
                  </span>
                )}
              </div>
              {price && (
                <div
                  style={{
                    background: "#7B2FF7",
                    borderRadius: 10,
                    padding: "10px 20px",
                    fontSize: 18,
                    fontWeight: 700,
                  }}
                >
                  {price}
                </div>
              )}
            </div>
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }

  // No flyer: full-width text layout (original design)
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(145deg, #09090B 0%, #1a0a2e 50%, #09090B 100%)",
          color: "white",
          fontFamily: "sans-serif",
          padding: "60px",
        }}
      >
        {/* Top: Collective + Nocturn branding */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: "#7B2FF7",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
                fontWeight: 700,
              }}
            >
              {collective.charAt(0).toUpperCase()}
            </div>
            <span style={{ fontSize: 22, color: "#a1a1aa", fontWeight: 500 }}>
              {collective}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18, color: "#71717a" }}>🌙</span>
            <span style={{ fontSize: 18, color: "#71717a", fontWeight: 600 }}>nocturn.</span>
          </div>
        </div>

        {/* Center: Event title */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1, justifyContent: "center" }}>
          <h1
            style={{
              fontSize: title.length > 30 ? 56 : 72,
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: -2,
              maxWidth: "90%",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {title}
          </h1>
        </div>

        {/* Bottom: Date, venue, price */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {date && (
              <span style={{ fontSize: 24, fontWeight: 600, color: "#e4e4e7" }}>
                {date}
              </span>
            )}
            {venue && (
              <span style={{ fontSize: 20, color: "#a1a1aa" }}>
                {venue}
              </span>
            )}
          </div>
          {price && (
            <div
              style={{
                background: "#7B2FF7",
                borderRadius: 12,
                padding: "12px 24px",
                fontSize: 22,
                fontWeight: 700,
              }}
            >
              {price}
            </div>
          )}
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
