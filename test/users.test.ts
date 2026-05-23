import { describe, it, expect } from "vitest";
import {
  getOrCreateUserByEmail,
  listActiveUsers,
  UserInactiveError,
} from "../src/persistence/users";

type Row = Record<string, unknown>;

function makeDb(state: {
  users?: Row[];
  insertError?: unknown;
  selectError?: unknown;
}) {
  const users = [...(state.users ?? [])];

  return {
    from(table: string) {
      if (table !== "users") throw new Error(`unexpected table: ${table}`);
      return {
        select(_cols?: string) {
          return {
            eq(col: string, val: unknown) {
              return {
                maybeSingle: async () => {
                  if (state.selectError) {
                    return { data: null, error: state.selectError };
                  }
                  const row = users.find((u) => u[col] === val) ?? null;
                  return { data: row, error: null };
                },
                order(_col: string, _opts?: { ascending?: boolean }) {
                  return Promise.resolve({
                    data: users.filter((u) => u.is_active === true),
                    error: null,
                  });
                },
              };
            },
            order(_col: string, _opts?: { ascending?: boolean }) {
              return Promise.resolve({
                data: users.filter((u) => u.is_active === true),
                error: null,
              });
            },
          };
        },
        insert(row: Row) {
          return {
            select(_cols?: string) {
              return {
                single: async () => {
                  if (state.insertError) {
                    return { data: null, error: state.insertError };
                  }
                  const inserted = {
                    id: "user-new",
                    created_at: "2026-05-22T00:00:00.000Z",
                    updated_at: "2026-05-22T00:00:00.000Z",
                    role: "closer",
                    is_active: true,
                    ...row,
                  };
                  users.push(inserted);
                  return { data: inserted, error: null };
                },
              };
            },
          };
        },
        update(patch: Row) {
          return {
            eq(_col: string, id: unknown) {
              return {
                select(_cols?: string) {
                  return {
                    single: async () => {
                      const idx = users.findIndex((u) => u.id === id);
                      if (idx < 0) return { data: null, error: { message: "not found" } };
                      users[idx] = { ...users[idx], ...patch, updated_at: "2026-05-22T01:00:00.000Z" };
                      return { data: users[idx], error: null };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

describe("getOrCreateUserByEmail", () => {
  it("inserts a new closer on first sight", async () => {
    const db = makeDb({ users: [] });
    const user = await getOrCreateUserByEmail(db as never, {
      email: "Alice@texasautovalue.com",
      displayName: "Alice Adams",
    });
    expect(user.email).toBe("alice@texasautovalue.com");
    expect(user.displayName).toBe("Alice Adams");
    expect(user.role).toBe("closer");
    expect(user.isActive).toBe(true);
  });

  it("returns an existing active user without inserting", async () => {
    const db = makeDb({
      users: [{
        id: "user-1",
        email: "alice@texasautovalue.com",
        display_name: "Alice Adams",
        role: "admin",
        is_active: true,
        created_at: "2026-05-01T00:00:00.000Z",
        updated_at: "2026-05-01T00:00:00.000Z",
      }],
    });
    const user = await getOrCreateUserByEmail(db as never, {
      email: "alice@texasautovalue.com",
      displayName: "Alice Adams",
    });
    expect(user.id).toBe("user-1");
    expect(user.role).toBe("admin");
  });

  it("updates display_name when the session name changes", async () => {
    const db = makeDb({
      users: [{
        id: "user-1",
        email: "alice@texasautovalue.com",
        display_name: "Alice",
        role: "closer",
        is_active: true,
        created_at: "2026-05-01T00:00:00.000Z",
        updated_at: "2026-05-01T00:00:00.000Z",
      }],
    });
    const user = await getOrCreateUserByEmail(db as never, {
      email: "alice@texasautovalue.com",
      displayName: "Alice Adams",
    });
    expect(user.displayName).toBe("Alice Adams");
  });

  it("throws UserInactiveError for deactivated users", async () => {
    const db = makeDb({
      users: [{
        id: "user-1",
        email: "alice@texasautovalue.com",
        display_name: "Alice Adams",
        role: "closer",
        is_active: false,
        created_at: "2026-05-01T00:00:00.000Z",
        updated_at: "2026-05-01T00:00:00.000Z",
      }],
    });
    await expect(
      getOrCreateUserByEmail(db as never, {
        email: "alice@texasautovalue.com",
        displayName: "Alice Adams",
      }),
    ).rejects.toBeInstanceOf(UserInactiveError);
  });
});

describe("listActiveUsers", () => {
  it("returns active users sorted by the query layer", async () => {
    const db = makeDb({
      users: [
        {
          id: "u1",
          email: "alice@texasautovalue.com",
          display_name: "Alice Adams",
          role: "admin",
          is_active: true,
        },
        {
          id: "u2",
          email: "bob@texasautovalue.com",
          display_name: "Bob Buyer",
          role: "closer",
          is_active: false,
        },
      ],
    });
    const users = await listActiveUsers(db as never);
    expect(users).toEqual([
      {
        id: "u1",
        email: "alice@texasautovalue.com",
        displayName: "Alice Adams",
        role: "admin",
      },
    ]);
  });
});
