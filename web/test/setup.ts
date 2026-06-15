import { createElement, type ReactNode } from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest";

import { server } from "./msw/server";

/** In-memory localStorage for jsdom tests (Node 22+ can expose a broken global). */
function createStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

const localStorageMock = createStorageMock();

beforeEach(() => {
  localStorageMock.clear();
  Object.defineProperty(window, "localStorage", {
    value: localStorageMock,
    writable: true,
    configurable: true,
  });
});

/**
 * `next/link` pulls in the App Router context (`useRouter`) at render time, which isn't
 * mounted in a bare Vitest render. Stub it with a plain anchor so components that link
 * (e.g. the data-state ErrorState) render in isolation.
 */
vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...props }: { href: unknown; children: ReactNode }) =>
    createElement("a", { href: typeof href === "string" ? href : "#", ...props }, children),
}));

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());
