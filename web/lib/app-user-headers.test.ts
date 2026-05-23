import { describe, expect, it } from "vitest";
import { buildAppUserHeaders, TAV_USER_EMAIL_HEADER, TAV_USER_NAME_HEADER } from "./app-user-headers";

describe("buildAppUserHeaders", () => {
  it("returns empty headers when session has no email", () => {
    expect(buildAppUserHeaders(null)).toEqual({});
    expect(buildAppUserHeaders({ user: {}, expires: "" })).toEqual({});
  });

  it("includes email and optional name from the Auth.js session", () => {
    expect(buildAppUserHeaders({
      user: {
        email: "alice@texasautovalue.com",
        name: "Alice Adams",
      },
      expires: "2026-05-22T00:00:00.000Z",
    })).toEqual({
      [TAV_USER_EMAIL_HEADER]: "alice@texasautovalue.com",
      [TAV_USER_NAME_HEADER]: "Alice Adams",
    });
  });

  it("omits the name header when the session name is blank", () => {
    expect(buildAppUserHeaders({
      user: { email: "alice@texasautovalue.com", name: "   " },
      expires: "2026-05-22T00:00:00.000Z",
    })).toEqual({
      [TAV_USER_EMAIL_HEADER]: "alice@texasautovalue.com",
    });
  });
});
