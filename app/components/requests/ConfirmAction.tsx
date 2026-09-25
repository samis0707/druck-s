"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
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
 * Bestätigungsdialog mit kontrolliertem Zustand: Der Dialog bleibt während der Anfrage offen
 * (Button „Wird gesendet …“, nicht schließbar) und schließt danach bei Erfolg wie bei Fehler.
 * `onConfirm` meldet Erfolg/Fehler selbst per Toast; unerwartete Ausnahmen fängt die Komponente ab.
 */
export function ConfirmAction({
  triggerLabel,
  title,
  description,
  confirmLabel,
  pendingLabel = "Wird gesendet …",
  beforeOpen,
  onConfirm,
}: {
  triggerLabel: ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel?: string;
  /** Vorab-Prüfung; `false` hält den Dialog geschlossen (die Prüfung zeigt ihren Hinweis selbst). */
  beforeOpen?: () => boolean;
  onConfirm: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
    } catch {
      toast.add({ description: "Die Anfrage ist fehlgeschlagen — bitte erneut versuchen.", type: "error" });
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <>
      <Button
        onClick={() => {
          if (!beforeOpen || beforeOpen()) setOpen(true);
        }}
      >
        {triggerLabel}
      </Button>
      <AlertDialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={confirm} disabled={busy} aria-busy={busy}>
              {busy ? pendingLabel : confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
