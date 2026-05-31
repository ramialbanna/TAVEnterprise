"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { useInterface } from "@/lib/interface/interface-provider";

/**
 * Analytics page is aimed at New-mode users; Classic users are sent to `/dashboard`.
 */
export function DashboardAnalyticsGate({ children }: { children: ReactNode }) {
  const { interfaceMode } = useInterface();
  const router = useRouter();

  useEffect(() => {
    if (interfaceMode === "classic") router.replace("/dashboard");
  }, [interfaceMode, router]);

  if (interfaceMode === "classic") return null;

  return <>{children}</>;
}
