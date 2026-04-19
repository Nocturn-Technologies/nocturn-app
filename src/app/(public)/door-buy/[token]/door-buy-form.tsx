"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  doorBuyToken: string;
  eventId: string;
  tierId: string;
  quantity: number;
}

export function DoorBuyForm({ doorBuyToken, eventId, tierId, quantity }: Props) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          tierId,
          quantity,
          buyerEmail: email.trim(),
          buyerPhone: phone.trim(),
          doorBuyToken,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error || "Something went wrong. Ask door staff to try again.");
        setSubmitting(false);
        return;
      }

      window.location.href = data.url as string;
    } catch {
      setError("Network error. Check your connection and try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          required
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={submitting}
        />
        <p className="text-xs text-muted-foreground">We&apos;ll email your ticket QR here.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="phone">Phone</Label>
        <Input
          id="phone"
          type="tel"
          required
          inputMode="tel"
          autoComplete="tel"
          placeholder="+1 555 123 4567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={submitting}
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={submitting}>
        {submitting ? "Opening secure checkout…" : "Continue to payment"}
      </Button>

      <p className="text-[11px] text-center text-muted-foreground leading-relaxed">
        Payment is processed securely by Stripe. Your ticket QR is sent to your email immediately after payment.
      </p>
    </form>
  );
}
