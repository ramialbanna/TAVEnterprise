import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { SystemStatus } from "@/lib/app-api/schemas";
import { SecretsChecklist } from "./secrets-checklist";

const INTEL_WORKER: SystemStatus["intelWorker"] = {
  mode: "worker",
  binding: true,
  url: "https://tav-intelligence-worker.example.workers.dev",
};

describe("SecretsChecklist", () => {
  it("renders the fixed list of secret names", () => {
    render(<SecretsChecklist intelWorker={INTEL_WORKER} />);
    for (const name of [
      "APP_API_SECRET",
      "ADMIN_API_SECRET",
      "WEBHOOK_HMAC_SECRET",
      "INTEL_WORKER_SECRET",
      "MANHEIM_CLIENT_ID",
      "MANHEIM_CLIENT_SECRET",
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_FROM_NUMBER",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it("marks APP_API_SECRET as confirmed configured", () => {
    render(<SecretsChecklist intelWorker={INTEL_WORKER} />);
    expect(screen.getByText(/confirmed configured/i)).toBeInTheDocument();
  });

  it("renders the 'not visible here' label and never any secret-looking value", () => {
    const { container } = render(<SecretsChecklist intelWorker={INTEL_WORKER} />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/not visible here/i);
    // No KEY=value-style assignments.
    expect(text).not.toMatch(/=\s*\S/);
    // No bearer/authorization/api-key shaped strings.
    expect(text).not.toMatch(/bearer\s+\S/i);
    expect(text).not.toMatch(/authorization:/i);
    expect(text).not.toMatch(/api[_-]?key\s*[:=]/i);
    // No long random token-shaped tokens (>= 40 chars of base64/hex-ish).
    expect(text).not.toMatch(/\b[A-Za-z0-9_-]{40,}\b/);
  });

  it("infers INTEL_WORKER_SECRET configured when intel worker is routed", () => {
    render(<SecretsChecklist intelWorker={INTEL_WORKER} />);
    expect(screen.getByText(/inferred from system-status/i)).toBeInTheDocument();
  });

  it("treats INTEL_WORKER_SECRET as managed when intel worker is in direct mode", () => {
    render(
      <SecretsChecklist
        intelWorker={{ mode: "direct", binding: false, url: null }}
      />,
    );
    expect(screen.queryByText(/inferred from system-status/i)).toBeNull();
  });
});
