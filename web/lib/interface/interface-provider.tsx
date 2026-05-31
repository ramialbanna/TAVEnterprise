"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type InterfaceMode = "classic" | "new";

const STORAGE_KEY = "tav.interface";

type InterfaceContextValue = {
  interfaceMode: InterfaceMode;
  setInterfaceMode: (mode: InterfaceMode) => void;
};

const InterfaceContext = createContext<InterfaceContextValue | null>(null);

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readStoredMode(): InterfaceMode {
  if (typeof window === "undefined") return "classic";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "new" ? "new" : "classic";
}

function getSnapshot(): InterfaceMode {
  return readStoredMode();
}

function getServerSnapshot(): InterfaceMode {
  return "classic";
}

function emitChange() {
  listeners.forEach((listener) => listener());
}

export function InterfaceProvider({ children }: { children: ReactNode }) {
  const interfaceMode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setInterfaceMode = useCallback((mode: InterfaceMode) => {
    window.localStorage.setItem(STORAGE_KEY, mode);
    emitChange();
  }, []);

  const value = useMemo(
    () => ({ interfaceMode, setInterfaceMode }),
    [interfaceMode, setInterfaceMode],
  );

  return <InterfaceContext.Provider value={value}>{children}</InterfaceContext.Provider>;
}

export function useInterface(): InterfaceContextValue {
  const ctx = useContext(InterfaceContext);
  if (!ctx) {
    throw new Error("useInterface must be used within InterfaceProvider");
  }
  return ctx;
}
