import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#09090B",
          color: "#FAFAFA",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Ambient purple glow — top left */}
        <div
          style={{
            position: "absolute",
            top: -200,
            left: -150,
            width: 800,
            height: 800,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(123,47,247,0.22) 0%, transparent 65%)",
          }}
        />
        {/* Ambient purple glow — bottom right */}
        <div
          style={{
            position: "absolute",
            bottom: -250,
            right: -150,
            width: 700,
            height: 700,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(168,85,247,0.18) 0%, transparent 65%)",
          }}
        />

        {/* Content container */}
        <div
          style={{
            position: "absolute",
            top: 72,
            left: 88,
            right: 88,
            bottom: 72,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          {/* Top row: wordmark + eyebrow pill */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              width: "100%",
            }}
          >
            {/* Wordmark */}
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <svg width="36" height="36" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="12" fill="#7B2FF7" />
                <circle cx="20" cy="14" r="10" fill="#09090B" />
              </svg>
              <div
                style={{
                  fontSize: 40,
                  fontWeight: 700,
                  letterSpacing: "-0.025em",
                  color: "#FAFAFA",
                  display: "flex",
                }}
              >
                nocturn<span style={{ color: "#7B2FF7" }}>.</span>
              </div>
            </div>

            {/* Eyebrow pill */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 16px",
                border: "1px solid rgba(255,255,255,0.14)",
                borderRadius: 100,
                fontSize: 13,
                color: "#A1A1AA",
                letterSpacing: "0.08em",
                background: "rgba(123,47,247,0.05)",
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "#C084FC",
                }}
              />
              THE AGENTIC WORK OS · NIGHTLIFE
            </div>
          </div>

          {/* Main headline */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: 96,
                fontWeight: 600,
                lineHeight: 0.96,
                letterSpacing: "-0.035em",
                color: "#FAFAFA",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div>You run the night.</div>
              <div style={{ color: "#C084FC" }}>
                Nocturn runs the business.
              </div>
            </div>
            <div
              style={{
                fontSize: 20,
                color: "#FAFAFA",
                marginTop: 28,
                letterSpacing: "0.01em",
                display: "flex",
              }}
            >
              Book the talent. Fill the room. Settle the night —{" "}
              <span style={{ color: "#C084FC", marginLeft: 8 }}>
                on autopilot.
              </span>
            </div>
          </div>

          {/* Bottom row */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 14,
              color: "#52525B",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            <div style={{ display: "flex", alignItems: "center" }}>
              <div
                style={{
                  width: 40,
                  height: 1,
                  background: "#7B2FF7",
                  marginRight: 14,
                }}
              />
              BUILT FOR OPERATORS · FREE TO START
            </div>
            <div style={{ color: "#C084FC", fontWeight: 500 }}>
              APP.TRYNOCTURN.COM
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
