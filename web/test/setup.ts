import { createElement, type ReactNode } from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";

import { server } from "./msw/server";

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
