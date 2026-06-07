"use client";

import { SidebarNavNew } from "./sidebar-nav-new";

export function SidebarNav({
  labels,
  onNavigate,
}: {
  labels: "responsive" | "always";
  onNavigate?: () => void;
}) {
  return <SidebarNavNew labels={labels} onNavigate={onNavigate} />;
}
