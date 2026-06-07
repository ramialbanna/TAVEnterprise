"use client";

import { Suspense } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { SidebarNav } from "./sidebar-nav";

export function AppSidebar() {
  return (
    <aside className="hidden shrink-0 border-r border-border bg-card md:block md:w-60">
      <Suspense fallback={<SidebarNavFallback />}>
        <SidebarNav labels="responsive" />
      </Suspense>
    </aside>
  );
}

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
