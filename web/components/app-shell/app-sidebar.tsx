"use client";

import { Suspense } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useInterface } from "@/lib/interface/interface-provider";
import { SidebarNav } from "./sidebar-nav";

/** Static sidebar: Classic icon rail md→xl; New shows labels from md with full width. */
export function AppSidebar() {
  const { interfaceMode } = useInterface();
  const widthCls =
    interfaceMode === "new" ? "md:w-60" : "md:w-[4.5rem] xl:w-60";

  return (
    <aside className={`hidden shrink-0 border-r border-border bg-card md:block ${widthCls}`}>
      <Suspense fallback={<SidebarNavFallback />}>
        <SidebarNav labels="responsive" />
      </Suspense>
    </aside>
  );
}

/** Off-canvas sidebar for < md. Controlled by the topbar hamburger. */
export function MobileSidebar({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-60 max-w-[80vw] p-0 md:hidden">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <Suspense fallback={<SidebarNavFallback />}>
          <SidebarNav labels="always" onNavigate={() => onOpenChange(false)} />
        </Suspense>
      </SheetContent>
    </Sheet>
  );
}

function SidebarNavFallback() {
  return <div className="flex-1 p-3" aria-hidden />;
}
