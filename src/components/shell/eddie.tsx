"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Bot, X } from "lucide-react";
import { useState } from "react";
import { EddiePanel } from "./eddie-panel";

export function EddieButton() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        aria-label="Abrir Eddie, asistente"
        className="fixed bottom-20 right-4 z-30 grid size-14 place-items-center rounded-full bg-primary text-white shadow-lg hover:brightness-110 md:bottom-6 md:right-6"
      >
        <Bot className="size-6" aria-hidden />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <Dialog.Content
          aria-describedby="eddie-desc"
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-surface shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-border p-4">
            <div>
              <Dialog.Title className="text-base font-semibold">Eddie</Dialog.Title>
              <Dialog.Description id="eddie-desc" className="text-xs text-muted">
                Eddie propone, tú confirmas.
              </Dialog.Description>
            </div>
            <Dialog.Close aria-label="Cerrar Eddie" className="rounded-md p-2 hover:bg-bg">
              <X className="size-5" aria-hidden />
            </Dialog.Close>
          </div>
          {open && <EddiePanel />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
