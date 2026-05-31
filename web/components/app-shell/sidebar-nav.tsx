"use client";

import { useInterface } from "@/lib/interface/interface-provider";

import { SidebarNavClassic } from "./sidebar-nav-classic";
import { SidebarNavNew } from "./sidebar-nav-new";

export function SidebarNav({
  labels,
  onNavigate,
}: {
  labels: "responsive" | "always";
  onNavigate?: () => void;
}) {
  const { interfaceMode } = useInterface();

  if (interfaceMode === "new") {
    return <SidebarNavNew labels={labels} onNavigate={onNavigate} />;
  }

  return <SidebarNavClassic labels={labels} onNavigate={onNavigate} />;
}
