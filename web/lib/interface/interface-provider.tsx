"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

type InterfaceContextValue = {
  interfaceMode: "new";
};

const InterfaceContext = createContext<InterfaceContextValue | null>(null);

export function InterfaceProvider({ children }: { children: ReactNode }) {
  const value = useMemo(() => ({ interfaceMode: "new" as const }), []);
  return <InterfaceContext.Provider value={value}>{children}</InterfaceContext.Provider>;
}

export function useInterface(): InterfaceContextValue {
  const ctx = useContext(InterfaceContext);
  if (!ctx) throw new Error("useInterface must be used within InterfaceProvider");
  return ctx;
}
