"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en" className="dark">
      <body
        style={{
          margin: 0,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          backgroundColor: "#09090B",
          color: "#FAFAFA",
        }}
      >
        <div
          style={{
            display: "flex",
            minHeight: "100vh",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          <div
            style={{
              maxWidth: "28rem",
              width: "100%",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: "4rem",
                height: "4rem",
                margin: "0 auto 1.5rem",
                borderRadius: "50%",
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.5rem",
              }}
            >
              !
            </div>
            <h2
              style={{
                fontSize: "1.25rem",
                fontWeight: 700,
                marginBottom: "0.5rem",
              }}
            >
              Something went wrong
            </h2>
            <p
              style={{
                fontSize: "0.875rem",
                color: "#A1A1AA",
                marginBottom: "1.5rem",
              }}
            >
              An unexpected error occurred. Our team has been notified.
            </p>
            <button
              onClick={reset}
              style={{
                padding: "0.5rem 1.5rem",
                backgroundColor: "#7B2FF7",
                color: "#FAFAFA",
                border: "none",
                borderRadius: "0.375rem",
                fontSize: "0.875rem",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
