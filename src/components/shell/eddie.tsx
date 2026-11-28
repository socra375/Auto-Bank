"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Bot, X } from "lucide-react";
import { useState } from "react";
import { EddiePanel } from "./eddie-panel";

/** Topbar trigger + right-hand sheet. Radix Dialog supplies the modal semantics, focus trap and focus return. */
export function EddieButton() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="btn btn-secondary btn-sm">
        <Bot className="size-4 text-primary" aria-hidden />
        <span className="hidden sm:inline">Preguntar a Eddie</span>
        <span className="sm:hidden">Eddie</span>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay data-veil className="fixed inset-0 z-40 bg-[var(--overlay)]" />
        <Dialog.Content
          aria-describedby="eddie-desc"
          data-sheet="right"
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-surface shadow-[var(--shadow-pop)]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border p-4">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-primary-soft text-primary"><Bot className="size-5" aria-hidden /></span>
              <div>
                <Dialog.Title className="section-title">Eddie</Dialog.Title>
                <Dialog.Description id="eddie-desc" className="text-xs text-muted">Eddie propone, tú confirmas.</Dialog.Description>
              </div>
            </div>
            <Dialog.Close aria-label="Cerrar Eddie" className="icon-btn"><X className="size-5" aria-hidden /></Dialog.Close>
          </div>
          {open && <EddiePanel />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
