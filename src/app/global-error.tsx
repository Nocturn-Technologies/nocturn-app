"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ backgroundColor: "#09090B", color: "#FAFAFA", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "24px" }}>
          <h1 style={{ color: "#7B2FF7", fontSize: "24px", fontWeight: 700, marginBottom: "8px" }}>nocturn.</h1>
          <h2 style={{ fontSize: "20px", fontWeight: 600, marginBottom: "8px" }}>Something went wrong</h2>
          <p style={{ color: "#A1A1AA", fontSize: "14px", marginBottom: "24px" }}>
            {error.message || "An unexpected error occurred."}
          </p>
          <button
            onClick={reset}
            style={{ backgroundColor: "#7B2FF7", color: "#fff", border: "none", borderRadius: "8px", padding: "12px 24px", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
