"use client";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-60 max-w-[80vw] p-0 md:hidden">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SidebarNav labels="always" onNavigate={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}
