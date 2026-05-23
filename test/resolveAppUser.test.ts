import { describe, it, expect, vi, beforeEach } from "vitest";
import { TAV_USER_EMAIL_HEADER, TAV_USER_NAME_HEADER } from "../src/auth/userContext";
import { resolveAppUser } from "../src/auth/resolveAppUser";
import type { Env } from "../src/types/env";

vi.mock("../src/persistence/supabase", () => ({
  getSupabaseClient: vi.fn(() => ({})),
}));

vi.mock("../src/persistence/users", () => ({
  getOrCreateUserByEmail: vi.fn(),
  UserInactiveError: class UserInactiveError extends Error {
    code = "user_inactive";
  },
}));

import { getOrCreateUserByEmail, UserInactiveError } from "../src/persistence/users";

const env = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "key" } as Env;

function authedReq(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/app/me", { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveAppUser", () => {
  it("returns null when no identity headers are present", async () => {
    expect(await resolveAppUser(authedReq(), env)).toBeNull();
    expect(getOrCreateUserByEmail).not.toHaveBeenCalled();
  });

  it("resolves a user from X-TAV proxy headers", async () => {
    vi.mocked(getOrCreateUserByEmail).mockResolvedValue({
      id: "user-1",
      email: "alice@texasautovalue.com",
      displayName: "Alice Adams",
      role: "closer",
      isActive: true,
      createdAt: "2026-05-22T00:00:00.000Z",
      updatedAt: "2026-05-22T00:00:00.000Z",
    });

    const user = await resolveAppUser(
      authedReq({
        [TAV_USER_EMAIL_HEADER]: "alice@texasautovalue.com",
        [TAV_USER_NAME_HEADER]: "Alice Adams",
      }),
      env,
    );

    expect(user?.id).toBe("user-1");
    expect(getOrCreateUserByEmail).toHaveBeenCalledWith({}, {
      email: "alice@texasautovalue.com",
      displayName: "Alice Adams",
    });
  });

  it("returns null for inactive users", async () => {
    vi.mocked(getOrCreateUserByEmail).mockRejectedValue(new UserInactiveError("alice@texasautovalue.com"));
    const user = await resolveAppUser(
      authedReq({ [TAV_USER_EMAIL_HEADER]: "alice@texasautovalue.com" }),
      env,
    );
    expect(user).toBeNull();
  });
});
