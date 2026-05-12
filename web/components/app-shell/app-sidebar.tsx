"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { SidebarNav } from "./sidebar-nav";

/** Static sidebar: hidden < md, icon rail md→xl, full panel ≥ xl. */
export function AppSidebar() {
  return (
    <aside className="hidden shrink-0 border-r border-border bg-card md:block md:w-[4.5rem] xl:w-60">
      <SidebarNav labels="responsive" />
    </aside>
  );
}

/** Off-canvas sidebar for < md. Controlled by the topbar hamburger. */
export function MobileSidebar({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 md:hidden" />
        <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-60 border-r border-border bg-card shadow-lg outline-none md:hidden">
          <Dialog.Title className="sr-only">Navigation</Dialog.Title>
          <Dialog.Close
            aria-label="Close navigation"
            className="absolute right-2 top-3 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </Dialog.Close>
          <SidebarNav labels="always" onNavigate={() => onOpenChange(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
