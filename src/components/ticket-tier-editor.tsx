"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Check,
  X,
  Pencil,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  updateTicketTier,
  createTicketTier,
  deleteTicketTier,
  reorderTicketTiers,
} from "@/app/actions/ticket-tiers";

interface Tier {
  id: string;
  name: string;
  price: number;
  capacity: number;
  sort_order: number;
  sold: number;
}

interface TicketTierEditorProps {
  eventId: string;
  initialTiers: Tier[];
}

export function TicketTierEditor({
  eventId,
  initialTiers,
}: TicketTierEditorProps) {
  const [tiers, setTiers] = useState<Tier[]>(initialTiers);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{
    name: string;
    price: string;
    capacity: string;
  }>({ name: "", price: "", capacity: "" });
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTier, setNewTier] = useState({
    name: "",
    price: "",
    capacity: "",
  });
  const nameInputRef = useRef<HTMLInputElement>(null);
  const newNameInputRef = useRef<HTMLInputElement>(null);

  // Auto-clear feedback
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), feedback.type === "error" ? 5000 : 3000);
    return () => clearTimeout(timer);
  }, [feedback]);

  // Focus name input when editing starts
  useEffect(() => {
    if (editingId && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [editingId]);

  // Focus new tier name input
  useEffect(() => {
    if (showAddForm && newNameInputRef.current) {
      newNameInputRef.current.focus();
    }
  }, [showAddForm]);

  function startEditing(tier: Tier) {
    setEditingId(tier.id);
    setEditValues({
      name: tier.name,
      price: tier.price.toString(),
      capacity: tier.capacity.toString(),
    });
    setDeleteConfirmId(null);
  }

  function cancelEditing() {
    setEditingId(null);
    setEditValues({ name: "", price: "", capacity: "" });
  }

  function saveEditing(tierId: string) {
    const name = editValues.name.trim();
    const price = Math.round(parseFloat(editValues.price) * 100) / 100;
    const capacity = parseInt(editValues.capacity, 10);

    if (!name) {
      setFeedback({ type: "error", message: "Tier name is required." });
      return;
    }
    if (isNaN(price) || price < 0) {
      setFeedback({ type: "error", message: "Price must be $0 or more." });
      return;
    }
    if (isNaN(capacity) || capacity < 1) {
      setFeedback({
        type: "error",
        message: "Capacity must be at least 1.",
      });
      return;
    }

    const tier = tiers.find((t) => t.id === tierId);
    if (tier && capacity < tier.sold) {
      setFeedback({
        type: "error",
        message: `Capacity can't be less than ${tier.sold} (already sold).`,
      });
      return;
    }

    startTransition(async () => {
      const result = await updateTicketTier(tierId, { name, price, capacity });
      if (result.error) {
        setFeedback({ type: "error", message: result.error });
      } else {
        setTiers((prev) =>
          prev.map((t) =>
            t.id === tierId ? { ...t, name, price, capacity } : t
          )
        );
        setEditingId(null);
        setFeedback({ type: "success", message: "Tier updated." });
      }
    });
  }

  function handleAddTier() {
    const name = newTier.name.trim();
    const price = Math.round(parseFloat(newTier.price || "0") * 100) / 100;
    const capacity = parseInt(newTier.capacity, 10);

    if (!name) {
      setFeedback({ type: "error", message: "Tier name is required." });
      return;
    }
    if (isNaN(price) || price < 0) {
      setFeedback({ type: "error", message: "Price must be $0 or more." });
      return;
    }
    if (isNaN(capacity) || capacity < 1) {
      setFeedback({
        type: "error",
        message: "Capacity must be at least 1.",
      });
      return;
    }

    startTransition(async () => {
      const result = await createTicketTier(eventId, { name, price, capacity });
      if (result.error) {
        setFeedback({ type: "error", message: result.error });
      } else if (result.tier) {
        const tier = result.tier;
        setTiers((prev) => [
          ...prev,
          { ...tier, sold: 0, price: Number(tier.price) },
        ]);
        setNewTier({ name: "", price: "", capacity: "" });
        setShowAddForm(false);
        setFeedback({ type: "success", message: "Tier added." });
      }
    });
  }

  function handleDelete(tierId: string) {
    startTransition(async () => {
      const result = await deleteTicketTier(tierId);
      if (result.error) {
        setFeedback({ type: "error", message: result.error });
      } else {
        setTiers((prev) => prev.filter((t) => t.id !== tierId));
        setDeleteConfirmId(null);
        setFeedback({ type: "success", message: "Tier deleted." });
      }
    });
  }

  function handleMoveUp(index: number) {
    if (index === 0) return;
    const snapshot = [...tiers];
    const newTiers = [...tiers];
    [newTiers[index - 1], newTiers[index]] = [
      newTiers[index],
      newTiers[index - 1],
    ];
    setTiers(newTiers);

    startTransition(async () => {
      const result = await reorderTicketTiers(newTiers.map((t) => t.id));
      if (result.error) {
        setFeedback({ type: "error", message: result.error });
        setTiers(snapshot); // revert to captured snapshot
      }
    });
  }

  function handleMoveDown(index: number) {
    if (index === tiers.length - 1) return;
    const snapshot = [...tiers];
    const newTiers = [...tiers];
    [newTiers[index], newTiers[index + 1]] = [
      newTiers[index + 1],
      newTiers[index],
    ];
    setTiers(newTiers);

    startTransition(async () => {
      const result = await reorderTicketTiers(newTiers.map((t) => t.id));
      if (result.error) {
        setFeedback({ type: "error", message: result.error });
        setTiers(snapshot); // revert to captured snapshot
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent, tierId: string) {
    if (e.key === "Enter") {
      e.preventDefault();
      saveEditing(tierId);
    } else if (e.key === "Escape") {
      cancelEditing();
    }
  }

  const totalCapacity = tiers.reduce((sum, t) => sum + t.capacity, 0);
  const totalSold = tiers.reduce((sum, t) => sum + t.sold, 0);

  return (
    <div className="space-y-3">
      {/* Feedback Banner */}
      {feedback && (
        <div
          role="alert"
          aria-live="polite"
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm animate-in fade-in slide-in-from-top-1 duration-200 ${
            feedback.type === "success"
              ? "bg-green-500/10 text-green-400 border border-green-500/20"
              : "bg-red-500/10 text-red-400 border border-red-500/20"
          }`}
        >
          {feedback.type === "success" ? (
            <Check className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          )}
          {feedback.message}
        </div>
      )}

      {/* Tier List */}
      {tiers.map((tier, index) => (
        <div
          key={tier.id}
          className={`group rounded-xl border p-4 transition-all duration-200 ${
            editingId === tier.id
              ? "border-nocturn/50 bg-nocturn/5"
              : "border-border hover:border-nocturn/30"
          }`}
        >
          {editingId === tier.id ? (
            /* ── Editing Mode ── */
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Name
                  </label>
                  <Input
                    ref={nameInputRef}
                    value={editValues.name}
                    onChange={(e) =>
                      setEditValues((v) => ({ ...v, name: e.target.value }))
                    }
                    onKeyDown={(e) => handleKeyDown(e, tier.id)}
                    placeholder="e.g. Early Bird"
                    className="h-9 bg-background"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Price ($)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editValues.price}
                    onChange={(e) =>
                      setEditValues((v) => ({ ...v, price: e.target.value }))
                    }
                    onKeyDown={(e) => handleKeyDown(e, tier.id)}
                    placeholder="0.00"
                    className="h-9 bg-background"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Capacity
                  </label>
                  <Input
                    type="number"
                    min={tier.sold || 1}
                    value={editValues.capacity}
                    onChange={(e) =>
                      setEditValues((v) => ({
                        ...v,
                        capacity: e.target.value,
                      }))
                    }
                    onKeyDown={(e) => handleKeyDown(e, tier.id)}
                    placeholder="100"
                    className="h-9 bg-background"
                  />
                  {tier.sold > 0 && (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Min {tier.sold} (already sold)
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={cancelEditing}
                  disabled={isPending}
                  className="h-8 px-3 text-xs"
                >
                  <X className="mr-1 h-3 w-3" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => saveEditing(tier.id)}
                  disabled={isPending}
                  className="h-8 bg-nocturn px-3 text-xs hover:bg-nocturn-light"
                >
                  {isPending ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <Check className="mr-1 h-3 w-3" />
                  )}
                  Save
                </Button>
              </div>
            </div>
          ) : (
            /* ── Display Mode ── */
            <div className="flex items-center gap-3">
              {/* Reorder Arrows */}
              <div className="flex flex-col gap-0.5 shrink-0">
                <button
                  onClick={() => handleMoveUp(index)}
                  disabled={index === 0 || isPending}
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-20 disabled:cursor-default transition-colors"
                  aria-label="Move up"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleMoveDown(index)}
                  disabled={index === tiers.length - 1 || isPending}
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-20 disabled:cursor-default transition-colors"
                  aria-label="Move down"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Tier Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{tier.name}</p>
                  {tier.sold >= tier.capacity && tier.capacity > 0 && (
                    <Badge
                      variant="secondary"
                      className="bg-red-500/10 text-red-400 border-red-500/20 text-[10px] px-1.5 py-0"
                    >
                      Sold Out
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {tier.sold} / {tier.capacity} sold
                </p>
              </div>

              {/* Price */}
              <span className="shrink-0 text-sm font-semibold text-nocturn tabular-nums">
                {Number(tier.price) === 0
                  ? "Free"
                  : `$${Number(tier.price).toFixed(2)}`}
              </span>

              {/* Action Buttons */}
              <div className="flex items-center gap-1 shrink-0 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity duration-200">
                <button
                  onClick={() => startEditing(tier)}
                  disabled={isPending}
                  className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  aria-label="Edit tier"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>

                {deleteConfirmId === tier.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDelete(tier.id)}
                      disabled={isPending}
                      className="rounded-lg p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                      aria-label="Confirm delete"
                    >
                      {isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(null)}
                      disabled={isPending}
                      className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      aria-label="Cancel delete"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      if (tier.sold > 0) {
                        setFeedback({
                          type: "error",
                          message: `Can't delete "${tier.name}" — ${tier.sold} ticket${tier.sold > 1 ? "s" : ""} already sold.`,
                        });
                      } else {
                        setDeleteConfirmId(tier.id);
                      }
                    }}
                    disabled={isPending}
                    className="rounded-lg p-2 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    aria-label="Delete tier"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Add Tier Form */}
      {showAddForm ? (
        <div className="rounded-xl border border-dashed border-nocturn/40 bg-nocturn/5 p-4 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <p className="text-sm font-medium text-nocturn">New Tier</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Name
              </label>
              <Input
                ref={newNameInputRef}
                value={newTier.name}
                onChange={(e) =>
                  setNewTier((v) => ({ ...v, name: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddTier();
                  } else if (e.key === "Escape") {
                    setShowAddForm(false);
                    setNewTier({ name: "", price: "", capacity: "" });
                  }
                }}
                placeholder="e.g. VIP"
                className="h-9 bg-background"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Price ($)
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={newTier.price}
                onChange={(e) =>
                  setNewTier((v) => ({ ...v, price: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddTier();
                  } else if (e.key === "Escape") {
                    setShowAddForm(false);
                    setNewTier({ name: "", price: "", capacity: "" });
                  }
                }}
                placeholder="0.00"
                className="h-9 bg-background"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Capacity
              </label>
              <Input
                type="number"
                min="1"
                value={newTier.capacity}
                onChange={(e) =>
                  setNewTier((v) => ({ ...v, capacity: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddTier();
                  } else if (e.key === "Escape") {
                    setShowAddForm(false);
                    setNewTier({ name: "", price: "", capacity: "" });
                  }
                }}
                placeholder="100"
                className="h-9 bg-background"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowAddForm(false);
                setNewTier({ name: "", price: "", capacity: "" });
              }}
              disabled={isPending}
              className="h-8 px-3 text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleAddTier}
              disabled={isPending}
              className="h-8 bg-nocturn px-3 text-xs hover:bg-nocturn-light"
            >
              {isPending ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Plus className="mr-1 h-3 w-3" />
              )}
              Add Tier
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddForm(true)}
          className="w-full border-dashed border-muted-foreground/30 text-muted-foreground hover:text-foreground hover:border-nocturn/40 hover:bg-nocturn/5 transition-all duration-200"
        >
          <Plus className="mr-2 h-3.5 w-3.5" />
          Add Tier
        </Button>
      )}

      {/* Summary */}
      {tiers.length > 0 && (
        <div className="flex justify-between border-t border-border pt-3 text-sm">
          <span className="text-muted-foreground">Total</span>
          <span className="font-bold tabular-nums">
            {totalSold} / {totalCapacity} sold
          </span>
        </div>
      )}
    </div>
  );
}
