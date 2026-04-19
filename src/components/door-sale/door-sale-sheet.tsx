"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { CreditCard, DollarSign, Gift, Minus, Plus, ArrowLeft, CheckCircle2, AlertTriangle, Copy, Check } from "lucide-react";
import { haptic } from "@/lib/haptics";
import {
  recordCashSale,
  recordCompSale,
  generateDoorBuyLink,
} from "@/app/actions/door-sale";
import Image from "next/image";

interface Tier {
  id: string;
  name: string;
  price: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  onSaleComplete?: () => void;
}

type Step = "mode-select" | "card-qr" | "cash-form" | "comp-form" | "success";
type SaleMode = "card" | "cash" | "comp";

function formatMoney(dollars: number): string {
  return `$${dollars.toFixed(2)}`;
}

export function DoorSaleSheet({ open, onOpenChange, eventId, onSaleComplete }: Props) {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [loadingTiers, setLoadingTiers] = useState(true);
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [step, setStep] = useState<Step>("mode-select");
  const [mode, setMode] = useState<SaleMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Card-QR specific
  const [qrData, setQrData] = useState<{ url: string; qrDataUrl: string; nonce: string; totalCents: number; expiresAt: string } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // Cash/comp form inputs
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [compReason, setCompReason] = useState("");

  // Success summary
  const [successSummary, setSuccessSummary] = useState<{ mode: SaleMode; qty: number; overCapacity?: boolean } | null>(null);

  // Load tiers when sheet opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function load() {
      setLoadingTiers(true);
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("ticket_tiers")
          .select("id, name, price, sort_order")
          .eq("event_id", eventId)
          .order("sort_order", { ascending: true });

        if (cancelled) return;

        const list = (data || []).map((t) => ({
          id: t.id as string,
          name: t.name as string,
          price: Number(t.price) || 0,
        }));
        setTiers(list);
        if (list.length > 0 && !selectedTierId) setSelectedTierId(list[0].id);
      } catch (err) {
        console.error("[door-sale-sheet] tier load error:", err);
      } finally {
        if (!cancelled) setLoadingTiers(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [open, eventId, selectedTierId]);

  // Reset to mode-select when sheet closes
  useEffect(() => {
    if (!open) {
      setStep("mode-select");
      setMode(null);
      setError(null);
      setQrData(null);
      setBuyerEmail("");
      setBuyerName("");
      setCompReason("");
      setSuccessSummary(null);
      setQuantity(1);
    }
  }, [open]);

  const selectedTier = useMemo(
    () => tiers.find((t) => t.id === selectedTierId) ?? null,
    [tiers, selectedTierId]
  );

  // Listen for realtime ticket inserts while card QR is visible — auto-close sheet on paid
  useEffect(() => {
    if (step !== "card-qr" || !qrData) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`door-buy-watch:${qrData.nonce}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tickets",
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          const meta = (payload.new as Record<string, unknown>).metadata as Record<string, unknown> | null;
          // The pending ticket's ticket_token is also a nonce, not the QR nonce,
          // but the webhook-update carries registration_type=door_card once fulfilled.
          if (meta?.registration_type === "door_card" && (payload.new as Record<string, unknown>).status === "paid") {
            haptic("success");
            setSuccessSummary({ mode: "card", qty: quantity });
            setStep("success");
            onSaleComplete?.();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [step, qrData, eventId, quantity, onSaleComplete]);

  // Also expire the QR when past expiresAt (visual feedback)
  const [qrExpired, setQrExpired] = useState(false);
  useEffect(() => {
    if (!qrData) return;
    setQrExpired(false);
    const ms = new Date(qrData.expiresAt).getTime() - Date.now();
    if (ms <= 0) {
      setQrExpired(true);
      return;
    }
    const t = setTimeout(() => setQrExpired(true), ms);
    return () => clearTimeout(t);
  }, [qrData]);

  const handleSelectMode = useCallback(
    async (chosen: SaleMode) => {
      if (!selectedTier) {
        setError("Pick a tier first");
        return;
      }
      setMode(chosen);
      setError(null);

      if (chosen === "card") {
        setSubmitting(true);
        const res = await generateDoorBuyLink({
          eventId,
          tierId: selectedTier.id,
          quantity,
        });
        setSubmitting(false);
        if (!res.success || !res.qrDataUrl || !res.url) {
          setError(res.error || "Failed to create payment link");
          setMode(null);
          return;
        }
        setQrData({
          url: res.url,
          qrDataUrl: res.qrDataUrl,
          nonce: res.nonce!,
          totalCents: res.totalCents || 0,
          expiresAt: res.expiresAt!,
        });
        setStep("card-qr");
      } else if (chosen === "cash") {
        setStep("cash-form");
      } else if (chosen === "comp") {
        setStep("comp-form");
      }
    },
    [selectedTier, eventId, quantity]
  );

  const handleCashSubmit = useCallback(async () => {
    if (!selectedTier) return;
    setSubmitting(true);
    setError(null);
    const res = await recordCashSale({
      eventId,
      tierId: selectedTier.id,
      quantity,
      buyerEmail: buyerEmail.trim() || undefined,
      buyerName: buyerName.trim() || undefined,
    });
    setSubmitting(false);
    if (!res.success) {
      setError(res.error || "Failed to record sale");
      return;
    }
    haptic("success");
    setSuccessSummary({ mode: "cash", qty: quantity, overCapacity: res.overCapacity });
    setStep("success");
    onSaleComplete?.();
  }, [selectedTier, eventId, quantity, buyerEmail, buyerName, onSaleComplete]);

  const handleCompSubmit = useCallback(async () => {
    if (!selectedTier) return;
    const reason = compReason.trim();
    if (reason.length < 3) {
      setError("Reason is required (e.g. 'DJ +1')");
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await recordCompSale({
      eventId,
      tierId: selectedTier.id,
      quantity,
      reason,
      buyerEmail: buyerEmail.trim() || undefined,
      buyerName: buyerName.trim() || undefined,
    });
    setSubmitting(false);
    if (!res.success) {
      setError(res.error || "Failed to record comp");
      return;
    }
    haptic("success");
    setSuccessSummary({ mode: "comp", qty: quantity, overCapacity: res.overCapacity });
    setStep("success");
    onSaleComplete?.();
  }, [selectedTier, eventId, quantity, compReason, buyerEmail, buyerName, onSaleComplete]);

  const serviceFeeCents = useMemo(() => {
    if (!selectedTier) return 0;
    const priceCents = Math.round(selectedTier.price * 100);
    return Math.round(priceCents * 0.07) + 50;
  }, [selectedTier]);

  const cardTotalCents = useMemo(() => {
    if (!selectedTier) return 0;
    const priceCents = Math.round(selectedTier.price * 100);
    return (priceCents + serviceFeeCents) * quantity;
  }, [selectedTier, serviceFeeCents, quantity]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 font-heading">
            {step !== "mode-select" && step !== "success" && (
              <button
                onClick={() => {
                  setStep("mode-select");
                  setMode(null);
                  setError(null);
                  setQrData(null);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted"
                aria-label="Back"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <span>
              {step === "mode-select" && "Sell at the Door"}
              {step === "card-qr" && "Scan to Pay"}
              {step === "cash-form" && "Cash Sale"}
              {step === "comp-form" && "Comp Ticket"}
              {step === "success" && "Done"}
            </span>
          </SheetTitle>
        </SheetHeader>

        <div className="p-4 pt-0 pb-8 space-y-4">
          {/* ── Mode select ───────────────────────────────────────────── */}
          {step === "mode-select" && (
            <>
              {/* Tier pills */}
              {loadingTiers ? (
                <p className="text-sm text-muted-foreground">Loading tiers…</p>
              ) : tiers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No ticket tiers for this event.</p>
              ) : (
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Tier</Label>
                  <div className="flex flex-wrap gap-2">
                    {tiers.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedTierId(t.id)}
                        className={`rounded-full px-4 py-2 text-sm font-medium transition-colors min-h-[44px] ${
                          selectedTierId === t.id
                            ? "bg-nocturn text-white"
                            : "bg-muted text-foreground hover:bg-muted/80"
                        }`}
                      >
                        {t.name} · {formatMoney(t.price)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quantity stepper */}
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Quantity</Label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="flex h-12 w-12 items-center justify-center rounded-lg border border-border disabled:opacity-40"
                    disabled={quantity <= 1}
                    aria-label="Decrease quantity"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="text-2xl font-bold font-heading tabular-nums w-10 text-center">{quantity}</span>
                  <button
                    onClick={() => setQuantity((q) => Math.min(4, q + 1))}
                    className="flex h-12 w-12 items-center justify-center rounded-lg border border-border disabled:opacity-40"
                    disabled={quantity >= 4}
                    aria-label="Increase quantity"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                  {selectedTier && (
                    <div className="ml-auto text-right">
                      <p className="text-xs text-muted-foreground">Buyer pays</p>
                      <p className="text-lg font-bold text-nocturn tabular-nums">{formatMoney(cardTotalCents / 100)}</p>
                    </div>
                  )}
                </div>
              </div>

              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                  {error}
                </div>
              )}

              {/* Three action buttons — Card primary */}
              <div className="space-y-2 pt-2">
                <Button
                  onClick={() => handleSelectMode("card")}
                  disabled={!selectedTier || submitting}
                  className="w-full h-14 text-base font-semibold gap-2"
                >
                  <CreditCard className="h-5 w-5" />
                  {submitting && mode === "card" ? "Preparing…" : "Card — Show QR to buyer"}
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={() => handleSelectMode("cash")}
                    disabled={!selectedTier || submitting}
                    variant="outline"
                    className="h-12 gap-2"
                  >
                    <DollarSign className="h-4 w-4" />
                    Cash
                  </Button>
                  <Button
                    onClick={() => handleSelectMode("comp")}
                    disabled={!selectedTier || submitting}
                    variant="outline"
                    className="h-12 gap-2"
                  >
                    <Gift className="h-4 w-4" />
                    Comp
                  </Button>
                </div>
              </div>

              <p className="text-[11px] text-center text-muted-foreground">
                Cash &amp; comp don&apos;t charge a Nocturn fee. Each sale is logged with your name for reconciliation.
              </p>
            </>
          )}

          {/* ── Card QR ────────────────────────────────────────────────── */}
          {step === "card-qr" && qrData && selectedTier && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-white p-3 mx-auto w-full max-w-[320px]">
                <Image
                  src={qrData.qrDataUrl}
                  alt="Scan to pay"
                  width={640}
                  height={640}
                  className="w-full h-auto"
                  unoptimized
                />
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold font-heading text-nocturn tabular-nums">
                  {formatMoney(cardTotalCents / 100)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {selectedTier.name} × {quantity} &middot; includes fees
                </p>
              </div>
              {qrExpired ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-400 text-center">
                  This link expired. Go back and tap Card again.
                </div>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(qrData.url);
                        setLinkCopied(true);
                        setTimeout(() => setLinkCopied(false), 2000);
                      } catch {
                        /* clipboard blocked — non-fatal */
                      }
                    }}
                    className="w-full h-11 gap-2"
                  >
                    {linkCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {linkCopied ? "Copied" : "Copy link instead"}
                  </Button>
                  <p className="text-xs text-center text-muted-foreground">
                    Have the buyer scan with their phone camera, or tap Copy link to text/AirDrop it. Link expires in 10 minutes. This sheet will update when they pay.
                  </p>
                </>
              )}
            </div>
          )}

          {/* ── Cash form ──────────────────────────────────────────────── */}
          {step === "cash-form" && selectedTier && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-background/40 p-4 text-center">
                <p className="text-xs text-muted-foreground">Collect from buyer</p>
                <p className="text-3xl font-bold font-heading text-foreground tabular-nums">
                  {formatMoney(selectedTier.price * quantity)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedTier.name} × {quantity} &middot; no Nocturn fee
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cash-name">Buyer name (optional)</Label>
                <Input id="cash-name" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="For door list" disabled={submitting} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cash-email">Email (optional)</Label>
                <Input id="cash-email" type="email" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} placeholder="For your fan list" disabled={submitting} />
              </div>

              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>
              )}

              <Button onClick={handleCashSubmit} disabled={submitting} className="w-full h-14 text-base font-semibold">
                {submitting ? "Recording…" : `Confirm — cash received (${formatMoney(selectedTier.price * quantity)})`}
              </Button>
              <p className="text-[11px] text-center text-muted-foreground">
                This will admit the buyer immediately and log the sale for reconciliation.
              </p>
            </div>
          )}

          {/* ── Comp form ──────────────────────────────────────────────── */}
          {step === "comp-form" && selectedTier && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-background/40 p-4 text-center">
                <p className="text-xs text-muted-foreground">Free entry — comp</p>
                <p className="text-3xl font-bold font-heading text-foreground">
                  {selectedTier.name} × {quantity}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="comp-reason">Reason (required)</Label>
                <Input
                  id="comp-reason"
                  value={compReason}
                  onChange={(e) => setCompReason(e.target.value)}
                  placeholder="DJ +1, door trade, VIP, etc."
                  maxLength={120}
                  disabled={submitting}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="comp-name">Buyer name (optional)</Label>
                <Input id="comp-name" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="For door list" disabled={submitting} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="comp-email">Email (optional)</Label>
                <Input id="comp-email" type="email" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} placeholder="For your fan list" disabled={submitting} />
              </div>

              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>
              )}

              <Button onClick={handleCompSubmit} disabled={submitting || compReason.trim().length < 3} className="w-full h-14 text-base font-semibold">
                {submitting ? "Recording…" : `Comp ${quantity} ticket${quantity > 1 ? "s" : ""}`}
              </Button>
            </div>
          )}

          {/* ── Success ────────────────────────────────────────────────── */}
          {step === "success" && successSummary && selectedTier && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15">
                <CheckCircle2 className="h-9 w-9 text-emerald-400" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-2xl font-bold font-heading text-emerald-400">
                  {successSummary.mode === "card" && "Buyer paid"}
                  {successSummary.mode === "cash" && "Cash recorded"}
                  {successSummary.mode === "comp" && "Comped"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {selectedTier.name} × {successSummary.qty}
                </p>
              </div>
              {successSummary.overCapacity && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400 flex items-start gap-2 text-left">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>This tier was sold out. Sale logged for reconciliation.</span>
                </div>
              )}
              <Button onClick={() => onOpenChange(false)} className="w-full h-12">
                Back to scanning
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
