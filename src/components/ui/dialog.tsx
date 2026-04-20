"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

function Dialog({ open, onOpenChange, children }: DialogProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const lastFocusedRef = React.useRef<HTMLElement | null>(null);
  const titleId = React.useId();

  // Lock body scroll while open
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Capture previously-focused element and restore on close
  React.useEffect(() => {
    if (!open) return;
    lastFocusedRef.current =
      (document.activeElement as HTMLElement | null) ?? null;

    // Focus the first focusable element inside the dialog (next tick so DOM is ready)
    const focusTimer = window.setTimeout(() => {
      const root = containerRef.current;
      if (!root) return;
      const focusables = root.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const first = focusables[0];
      if (first && typeof first.focus === "function") {
        first.focus();
      } else {
        // Fall back to focusing the container itself
        root.setAttribute("tabindex", "-1");
        root.focus();
      }
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      // Restore focus to the trigger element
      const last = lastFocusedRef.current;
      if (last && typeof last.focus === "function") {
        try {
          last.focus();
        } catch {
          // noop
        }
      }
    };
  }, [open]);

  // Keydown handler for Escape + focus trap
  React.useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onOpenChange(false);
        return;
      }
      if (e.key !== "Tab") return;
      const root = containerRef.current;
      if (!root) return;
      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute("aria-hidden"));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !root.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <DialogTitleIdContext.Provider value={titleId}>
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed inset-0 z-[70]"
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={() => onOpenChange(false)}
        />
        {children}
      </div>
    </DialogTitleIdContext.Provider>
  );
}

// Context to pass the title id from Dialog down to DialogTitle so it can attach
// the id, which makes aria-labelledby resolve correctly when a title is rendered.
const DialogTitleIdContext = React.createContext<string | null>(null);

function DialogContent({
  className,
  children,
  onClose,
  ...props
}: React.ComponentProps<"div"> & { onClose?: () => void }) {
  return (
    <div
      className={cn(
        "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-md rounded-2xl border border-white/[0.08] bg-[#12111a] p-6 shadow-2xl",
        className
      )}
      {...props}
    >
      {onClose && (
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      {children}
    </div>
  );
}

function DialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("mb-4 space-y-1", className)}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  id: idProp,
  ...props
}: React.ComponentProps<"h2">) {
  const ctxId = React.useContext(DialogTitleIdContext);
  const id = idProp ?? ctxId ?? undefined;
  return (
    <h2
      id={id}
      className={cn("text-lg font-semibold text-foreground", className)}
      {...props}
    />
  );
}

export { Dialog, DialogContent, DialogHeader, DialogTitle };
