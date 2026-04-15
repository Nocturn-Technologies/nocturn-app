"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
};

type ConfirmState = ConfirmOptions & {
  resolver: (v: boolean) => void;
};

export function useConfirm() {
  const [state, setState] = React.useState<ConfirmState | null>(null);

  const confirm = React.useCallback(
    (opts: ConfirmOptions): Promise<boolean> => {
      return new Promise((resolve) => {
        setState({ ...opts, resolver: resolve });
      });
    },
    []
  );

  const handleResult = (result: boolean) => {
    state?.resolver(result);
    setState(null);
  };

  const confirmDialog = (
    <Dialog open={!!state} onOpenChange={(o) => !o && handleResult(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{state?.title ?? ""}</DialogTitle>
          {state?.description && (
            <p className="text-sm text-muted-foreground mt-2">{state.description}</p>
          )}
        </DialogHeader>
        <div className="mt-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button
            variant="outline"
            size="xl"
            onClick={() => handleResult(false)}
          >
            {state?.cancelText ?? "Cancel"}
          </Button>
          <Button
            variant={state?.destructive ? "destructive" : "nocturn"}
            size="xl"
            onClick={() => handleResult(true)}
          >
            {state?.confirmText ?? "Confirm"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  return { confirm, confirmDialog };
}
