import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { IntelWorker, deriveIntelVerdict } from "./intel-worker";

describe("deriveIntelVerdict", () => {
  it("returns healthy + service-binding label when worker mode with binding", () => {
    const v = deriveIntelVerdict({ mode: "worker", binding: true, url: "https://x.workers.dev" });
    expect(v.status).toBe("healthy");
    expect(v.label).toMatch(/service binding active/i);
  });

  it("returns healthy + HTTP-routed label when worker mode with url only", () => {
    const v = deriveIntelVerdict({ mode: "worker", binding: false, url: "https://x.workers.dev" });
    expect(v.status).toBe("healthy");
    expect(v.label).toMatch(/http routed/i);
  });

  it("returns review + unrouted label when worker mode with neither binding nor url", () => {
    const v = deriveIntelVerdict({ mode: "worker", binding: false, url: null });
    expect(v.status).toBe("review");
    expect(v.label).toMatch(/unrouted/i);
  });

  it("returns review (degraded) + direct-mode label when mode is direct", () => {
    const v = deriveIntelVerdict({ mode: "direct", binding: false, url: null });
    expect(v.status).toBe("review");
    expect(v.label).toMatch(/direct mode/i);
  });
});

describe("IntelWorker", () => {
  it("renders healthy/service-binding pill + mode/binding/url rows", () => {
    render(
      <IntelWorker
        data={{ mode: "worker", binding: true, url: "https://intel.example.workers.dev" }}
      />,
    );
    expect(screen.getByText(/service binding active/i)).toBeInTheDocument();
    expect(screen.getByText("worker")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText(/intel\.example\.workers\.dev/i)).toBeInTheDocument();
  });

  it("renders degraded pill + 'none' url when direct mode with no binding/url", () => {
    render(<IntelWorker data={{ mode: "direct", binding: false, url: null }} />);
    expect(screen.getByText(/direct mode/i)).toBeInTheDocument();
    expect(screen.getByText("none")).toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument();
  });
});
