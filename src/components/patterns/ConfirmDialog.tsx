import { useCallback, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * The one "are you sure?" — in place of `window.confirm`, whose grey system box
 * was the only screen in the product drawn by the browser instead of by us.
 *
 *   const [confirm, confirmDialog] = useConfirm();
 *   onClick={async () => { if (await confirm({ title: "End this ad now?" })) end(); }}
 *   …and render {confirmDialog} once in the component.
 */
export interface ConfirmOptions {
  title: string;
  description?: string;
  /** The verb on the button that goes ahead — "Delete", "End ad". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red button for something that cannot be taken back. Default true. */
  destructive?: boolean;
}

export function useConfirm(): [(opts: ConfirmOptions) => Promise<boolean>, JSX.Element] {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => { resolver.current = resolve; });
  }, []);

  const settle = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpts(null);
  };

  const dialog = (
    <AlertDialog open={!!opts} onOpenChange={(open) => { if (!open) settle(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{opts?.title}</AlertDialogTitle>
          {opts?.description && <AlertDialogDescription>{opts.description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>{opts?.cancelLabel ?? "Cancel"}</AlertDialogCancel>
          <AlertDialogAction
            variant={opts?.destructive === false ? "primary" : "destructive"}
            onClick={() => settle(true)}
          >
            {opts?.confirmLabel ?? "Confirm"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return [confirm, dialog];
}
