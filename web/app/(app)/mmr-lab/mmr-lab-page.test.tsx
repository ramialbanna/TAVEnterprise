import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import MmrLabPage from "./page";

function ok(data: unknown) {
  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => vi.restoreAllMocks());

describe("MmrLabPage — buyer access (P1.1)", () => {
  it("renders MMR lab without ops guard redirect", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/app/mmr/catalog/years")) {
        return ok({ items: ["2026"], catalogState: "connected", cached: false, reason: null });
      }
      return ok({});
    });

    render(<MmrLabPage />);

    expect(screen.getByText(/^MMR$/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/enter vin/i)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "2026" })).toBeInTheDocument(),
    );
  });
});
