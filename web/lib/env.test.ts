import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// env.ts imports "server-only", which throws when imported outside the React-server
// bundler context (e.g. under vitest). Stub it so the module under test can load.
vi.mock("server-only", () => ({}));

describe("deriveEnvLabel", () => {
  it("returns PRODUCTION for a production Worker host", async () => {
    const { deriveEnvLabel } = await import("./env");
    expect(deriveEnvLabel("https://tav-aip-production.rami-1a9.workers.dev")).toBe("PRODUCTION");
  });

  it("returns STAGING for a staging Worker host", async () => {
    const { deriveEnvLabel } = await import("./env");
    expect(deriveEnvLabel("https://tav-aip-staging.rami-1a9.workers.dev")).toBe("STAGING");
  });

  it("returns LOCAL for localhost", async () => {
    const { deriveEnvLabel } = await import("./env");
    expect(deriveEnvLabel("http://localhost:8787")).toBe("LOCAL");
  });

  it("returns LOCAL for 127.0.0.1", async () => {
    const { deriveEnvLabel } = await import("./env");
    expect(deriveEnvLabel("http://127.0.0.1:8787")).toBe("LOCAL");
  });

  it("returns LOCAL for an unknown/custom host", async () => {
    const { deriveEnvLabel } = await import("./env");
    expect(deriveEnvLabel("https://intel.texasautovalue.com")).toBe("LOCAL");
  });

  it("returns LOCAL for a non-URL string (defensive)", async () => {
    const { deriveEnvLabel } = await import("./env");
    expect(deriveEnvLabel("not a url")).toBe("LOCAL");
  });
});

describe("serverEnv", () => {
  const ORIGINAL_ENV = process.env;

  const VALID = {
    APP_API_BASE_URL: "https://tav-aip-staging.rami-1a9.workers.dev",
    APP_API_SECRET: "staging-secret",
    AUTH_SECRET: "auth-secret",
    AUTH_GOOGLE_ID: "google-id",
    AUTH_GOOGLE_SECRET: "google-secret",
    ALLOWED_EMAIL_DOMAIN: "texasautovalue.com",
  };

  beforeEach(() => {
    vi.resetModules(); // drop env.ts's memoised cache between cases
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("parses a valid env and derives ENV_LABEL", async () => {
    Object.assign(process.env, VALID);
    const { serverEnv } = await import("./env");
    const env = serverEnv();
    expect(env.APP_API_BASE_URL).toBe(VALID.APP_API_BASE_URL);
    expect(env.APP_API_SECRET).toBe(VALID.APP_API_SECRET);
    expect(env.ALLOWED_EMAIL_DOMAIN).toBe("texasautovalue.com");
    expect(env.ENV_LABEL).toBe("STAGING");
  });

  it("defaults ALLOWED_EMAIL_DOMAIN to texasautovalue.com when omitted", async () => {
    Object.assign(process.env, VALID);
    delete process.env.ALLOWED_EMAIL_DOMAIN;
    const { serverEnv } = await import("./env");
    expect(serverEnv().ALLOWED_EMAIL_DOMAIN).toBe("texasautovalue.com");
  });

  it("throws when APP_API_SECRET is missing", async () => {
    Object.assign(process.env, VALID);
    delete process.env.APP_API_SECRET;
    const { serverEnv } = await import("./env");
    expect(() => serverEnv()).toThrow(/Invalid \/web environment/);
  });

  it("throws when APP_API_BASE_URL is not a URL", async () => {
    Object.assign(process.env, VALID, { APP_API_BASE_URL: "tav-aip-staging" });
    const { serverEnv } = await import("./env");
    expect(() => serverEnv()).toThrow(/Invalid \/web environment/);
  });
});
