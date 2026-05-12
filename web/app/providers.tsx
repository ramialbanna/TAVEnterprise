"use client";

import { useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { makeQueryClient } from "@/lib/query";

/**
 * Client-side context providers for the whole app:
 *   - next-themes: class-based light/dark (`<html class="dark">`), default light, no system follow.
 *   - TanStack Query: one client per browser session (created in useState so it survives re-renders
 *     but is never shared across requests on the server).
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}
