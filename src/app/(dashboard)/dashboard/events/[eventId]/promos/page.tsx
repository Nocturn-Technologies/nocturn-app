"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  Plus,
  Tag,
  Loader2,
  ToggleLeft,
  ToggleRight,
  Percent,
  DollarSign,
  Copy,
  Check,
} from "lucide-react";
import Link from "next/link";
import {
  createPromoCode,
  getPromoCodes,
  togglePromoCode,
  type PromoCode,
} from "@/app/actions/promo-codes";

export default function PromosPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Form state
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [discountValue, setDiscountValue] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [promoterId, setPromoterId] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  useEffect(() => {
    loadCodes();
  }, [eventId]);

  async function loadCodes() {
    setLoading(true);
    const data = await getPromoCodes(eventId);
    setCodes(data);
    setLoading(false);
  }

  function resetForm() {
    setCode("");
    setDiscountType("percentage");
    setDiscountValue("");
    setMaxUses("");
    setPromoterId("");
    setExpiresAt("");
    setFormError(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!code.trim()) {
      setFormError("Code is required");
      return;
    }

    const value = parseFloat(discountValue);
    if (isNaN(value) || value <= 0) {
      setFormError("Discount value must be greater than 0");
      return;
    }

    if (discountType === "percentage" && value > 100) {
      setFormError("Percentage discount cannot exceed 100%");
      return;
    }

    setSaving(true);
    const result = await createPromoCode({
      eventId,
      code: code.trim(),
      discountType,
      discountValue: value,
      maxUses: maxUses ? parseInt(maxUses) : null,
      promoterId: promoterId.trim() || null,
      expiresAt: expiresAt || null,
    });

    if (result.error) {
      setFormError(result.error);
      setSaving(false);
      return;
    }

    resetForm();
    setShowForm(false);
    await loadCodes();
    setSaving(false);
  }

  async function handleToggle(codeId: string, currentActive: boolean) {
    await togglePromoCode(codeId, !currentActive);
    await loadCodes();
  }

  function handleCopy(promoCode: string, id: string) {
    navigator.clipboard.writeText(promoCode);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-nocturn/10 animate-pulse-glow">
            <Tag className="h-6 w-6 text-nocturn" />
          </div>
          <p className="text-sm text-muted-foreground">Loading promo codes...</p>
        </div>
      </div>
    );
  }

  const totalUses = codes.reduce((sum, c) => sum + c.current_uses, 0);
  const activeCodes = codes.filter((c) => c.is_active).length;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/dashboard/events/${eventId}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Promo Codes</h1>
          <p className="text-sm text-muted-foreground">
            Create discount codes for this event
          </p>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold text-nocturn">{codes.length}</p>
            <p className="text-xs text-muted-foreground">Total Codes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold text-green-500">{activeCodes}</p>
            <p className="text-xs text-muted-foreground">Active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold">{totalUses}</p>
            <p className="text-xs text-muted-foreground">Total Uses</p>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setShowForm(!showForm);
            if (showForm) resetForm();
          }}
        >
          <Plus className="mr-1 h-3 w-3" />
          {showForm ? "Cancel" : "New Promo Code"}
        </Button>
      </div>

      {/* Create Form */}
      {showForm && (
        <Card className="animate-scale-in border-nocturn/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Tag className="h-4 w-4 text-nocturn" />
              Create Promo Code
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              {formError && (
                <div className="rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-500">
                  {formError}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="code">Code</Label>
                <Input
                  id="code"
                  placeholder="e.g. VIP20, EARLYBIRD"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  required
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Discount Type</Label>
                  <div className="flex gap-1 rounded-lg bg-muted p-1">
                    <button
                      type="button"
                      onClick={() => setDiscountType("percentage")}
                      className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                        discountType === "percentage"
                          ? "bg-background shadow-sm"
                          : "text-muted-foreground"
                      }`}
                    >
                      <Percent className="inline h-3 w-3 mr-1" />
                      Percent
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiscountType("fixed")}
                      className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                        discountType === "fixed"
                          ? "bg-background shadow-sm"
                          : "text-muted-foreground"
                      }`}
                    >
                      <DollarSign className="inline h-3 w-3 mr-1" />
                      Fixed
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="discountValue">
                    {discountType === "percentage" ? "Discount (%)" : "Discount ($)"}
                  </Label>
                  <Input
                    id="discountValue"
                    type="number"
                    min="0"
                    max={discountType === "percentage" ? "100" : undefined}
                    step={discountType === "percentage" ? "1" : "0.01"}
                    placeholder={discountType === "percentage" ? "20" : "10.00"}
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="maxUses">Max Uses (optional)</Label>
                  <Input
                    id="maxUses"
                    type="number"
                    min="1"
                    placeholder="Unlimited"
                    value={maxUses}
                    onChange={(e) => setMaxUses(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expiresAt">Expires At (optional)</Label>
                  <Input
                    id="expiresAt"
                    type="datetime-local"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="promoterId">Promoter ID (optional)</Label>
                <Input
                  id="promoterId"
                  placeholder="Link to a promoter"
                  value={promoterId}
                  onChange={(e) => setPromoterId(e.target.value)}
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-nocturn hover:bg-nocturn-light"
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Tag className="h-4 w-4 mr-2" />
                )}
                Create Promo Code
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Code List */}
      {codes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-nocturn/10">
              <Tag className="h-8 w-8 text-nocturn" />
            </div>
            <div className="text-center">
              <p className="font-medium">No promo codes yet</p>
              <p className="text-sm text-muted-foreground">
                Create your first promo code to offer discounts.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {codes.map((promo) => {
            const isExpired =
              promo.expires_at && new Date(promo.expires_at) < new Date();
            const isMaxedOut =
              promo.max_uses !== null && promo.current_uses >= promo.max_uses;
            const effectivelyActive =
              promo.is_active && !isExpired && !isMaxedOut;

            return (
              <Card
                key={promo.id}
                className={`transition-colors ${
                  !effectivelyActive ? "opacity-60" : ""
                }`}
              >
                <CardContent className="flex items-center gap-4 py-4">
                  {/* Toggle */}
                  <button
                    onClick={() => handleToggle(promo.id, promo.is_active)}
                    className="shrink-0"
                    title={promo.is_active ? "Deactivate" : "Activate"}
                  >
                    {promo.is_active ? (
                      <ToggleRight className="h-6 w-6 text-green-500" />
                    ) : (
                      <ToggleLeft className="h-6 w-6 text-muted-foreground" />
                    )}
                  </button>

                  {/* Code info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm">
                        {promo.code}
                      </span>
                      <button
                        onClick={() => handleCopy(promo.code, promo.id)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        title="Copy code"
                      >
                        {copiedId === promo.id ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="rounded-full bg-nocturn/10 text-nocturn px-2 py-0.5 text-[10px] font-medium">
                        {promo.discount_type === "percentage"
                          ? `${promo.discount_value}% off`
                          : `$${promo.discount_value.toFixed(2)} off`}
                      </span>
                      {isExpired && (
                        <span className="rounded-full bg-red-500/10 text-red-500 px-2 py-0.5 text-[10px] font-medium">
                          Expired
                        </span>
                      )}
                      {isMaxedOut && (
                        <span className="rounded-full bg-yellow-500/10 text-yellow-500 px-2 py-0.5 text-[10px] font-medium">
                          Maxed Out
                        </span>
                      )}
                      {promo.promoter_id && (
                        <span className="text-[10px] text-muted-foreground">
                          Promoter linked
                        </span>
                      )}
                      {promo.expires_at && !isExpired && (
                        <span className="text-[10px] text-muted-foreground">
                          Expires{" "}
                          {new Date(promo.expires_at).toLocaleDateString("en", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Usage */}
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold">
                      {promo.current_uses}
                      {promo.max_uses !== null && (
                        <span className="text-muted-foreground font-normal">
                          {" "}
                          / {promo.max_uses}
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] text-muted-foreground">uses</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
