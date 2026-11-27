"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Bot, X } from "lucide-react";
import { EmptyState } from "@/components/states/states";

export function EddieButton() {
  return (
    <Dialog.Root>
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
            <Dialog.Title className="text-base font-semibold">Eddie</Dialog.Title>
            <Dialog.Close aria-label="Cerrar Eddie" className="rounded-md p-2 hover:bg-bg">
              <X className="size-5" aria-hidden />
            </Dialog.Close>
          </div>
          <div className="flex-1 p-4">
            <Dialog.Description id="eddie-desc" className="sr-only">
              Estado del asistente Eddie
            </Dialog.Description>
            <EmptyState
              icon={Bot}
              title="Eddie aún no está conectado"
              description="El asistente estará disponible en la etapa 9. Por ahora no responde ni accede a tus datos."
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
