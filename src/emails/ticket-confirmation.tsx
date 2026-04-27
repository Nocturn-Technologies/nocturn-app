import * as React from "react";
import Layout, { DetailRow, emailColors } from "./_layout";

export interface TicketConfirmationProps {
  eventTitle: string;
  eventDate: string;
  venueName: string;
  tierName: string;
  quantity: number;
  totalPrice: string;
  ticketLink: string;
  qrCodes?: string[];
}

export default function TicketConfirmation({
  eventTitle,
  eventDate,
  venueName,
  tierName,
  quantity,
  totalPrice,
  ticketLink,
  qrCodes,
}: TicketConfirmationProps) {
  const details: DetailRow[] = [
    { label: "When", value: eventDate },
    { label: "Where", value: venueName },
    { label: "Tickets", value: `${tierName} × ${quantity}` },
    { label: "Total paid", value: totalPrice },
  ];

  const hasQRs = qrCodes && qrCodes.length > 0;

  return (
    <Layout
      preheader={`Your ${quantity > 1 ? "tickets are" : "ticket is"} below. Save now or add to wallet — door scans straight from this email.`}
      eyebrow="Confirmed"
      eyebrowVariant="green"
      headline={`You're going to ${eventTitle}.`}
      intro={
        hasQRs
          ? `Show ${quantity > 1 ? "these QRs" : "this QR"} at the door. We've also attached ${quantity > 1 ? "them" : "it"} as a PNG.`
          : "Your QR is being generated. Tap below to view it."
      }
      hero={
        hasQRs ? (
          <div style={{ textAlign: "center" }}>
            {qrCodes!.map((qr, i) => (
              <div
                key={i}
                style={{
                  textAlign: "center",
                  margin: i === 0 ? "0" : "20px 0 0",
                  padding: "16px",
                  background: "#FFFFFF",
                  borderRadius: "12px",
                  display: "inline-block",
                }}
              >
                <img
                  src={qr}
                  alt={`Ticket ${i + 1} QR Code`}
                  width={220}
                  height={220}
                  style={{ display: "block" }}
                />
                <p
                  style={{
                    margin: "10px 0 0",
                    color: "#27272A",
                    fontSize: "11px",
                    fontWeight: 600,
                    letterSpacing: "0.4px",
                  }}
                >
                  {quantity > 1
                    ? `Ticket ${i + 1} of ${quantity}`
                    : "Show at door"}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p
            style={{
              color: emailColors.body,
              fontSize: "13px",
              textAlign: "center",
              padding: "12px",
              margin: 0,
            }}
          >
            Your QR is generating. Tap below to view it.
          </p>
        )
      }
      details={details}
      cta={{ label: "View your ticket  →", href: ticketLink }}
    />
  );
}
