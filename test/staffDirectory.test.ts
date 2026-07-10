import { describe, it, expect } from "vitest";

import {
  createStaffDirectoryEntry,
  deactivateStaffDirectoryEntry,
  listStaffDirectory,
  StaffDirectoryError,
} from "../src/persistence/staffDirectory";

type DirRow = Record<string, unknown>;

function makeDb(initial: DirRow[] = []) {
  const rows = initial.map((r) => ({ ...r }));

  function filteredBuilder(start: DirRow[]) {
    let current = [...start];
    const api: {
      eq: (col: string, val: unknown) => typeof api;
      in: (col: string, vals: unknown[]) => typeof api;
      order: (col: string, opts?: { ascending?: boolean }) => typeof api;
      then: (
        onFulfilled?: (value: { data: DirRow[]; error: null }) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => Promise<unknown>;
    } = {
      eq(col, val) {
        current = current.filter((r) => r[col] === val);
        return api;
      },
      in(col, vals) {
        current = current.filter((r) => vals.includes(r[col]));
        return api;
      },
      order(col) {
        current = [...current].sort((a, b) =>
          String(a[col]).localeCompare(String(b[col])),
        );
        return api;
      },
      then(onFulfilled, onRejected) {
        return Promise.resolve({ data: current, error: null }).then(
          onFulfilled,
          onRejected,
        );
      },
    };
    return api;
  }

  return {
    from(table: string) {
      if (table !== "staff_directory") throw new Error(`unexpected table ${table}`);
      return {
        select(_cols?: string) {
          return filteredBuilder(rows);
        },
        insert(row: DirRow) {
          const duplicate = rows.some(
            (r) => r.display_name === row.display_name && r.role === row.role,
          );
          if (duplicate) {
            return {
              select() {
                return {
                  single: async () => ({
                    data: null,
                    error: { code: "23505", message: "duplicate" },
                  }),
                };
              },
            };
          }
          const created = {
            id: "entry-1",
            created_at: "2026-07-10T00:00:00.000Z",
            updated_at: "2026-07-10T00:00:00.000Z",
            deactivated_at: null,
            is_active: true,
            ...row,
          };
          rows.push(created);
          return {
            select() {
              return {
                single: async () => ({ data: created, error: null }),
              };
            },
          };
        },
        update(patch: DirRow) {
          return {
            eq(_col: string, id: string) {
              return {
                select() {
                  return {
                    maybeSingle: async () => {
                      const idx = rows.findIndex((r) => r.id === id);
                      if (idx < 0) return { data: null, error: null };
                      rows[idx] = { ...rows[idx], ...patch };
                      return { data: rows[idx], error: null };
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

const sample = (
  id: string,
  name: string,
  role: string,
  active = true,
): DirRow => ({
  id,
  display_name: name,
  role,
  is_active: active,
  created_at: "2026-07-10T00:00:00.000Z",
  updated_at: "2026-07-10T00:00:00.000Z",
  deactivated_at: active ? null : "2026-07-10T01:00:00.000Z",
});

describe("staffDirectory", () => {
  it("lists active salespeople including both-role entries", async () => {
    const db = makeDb([
      sample("1", "Carreon, Ruben", "salesperson"),
      sample("2", "Sharp, Tim", "both"),
      sample("3", "Inactive, Person", "salesperson", false),
    ]);

    const listed = await listStaffDirectory(db as never, { type: "salesperson" });
    expect(listed.map((e) => e.displayName)).toEqual(["Carreon, Ruben", "Sharp, Tim"]);
  });

  it("creates an entry", async () => {
    const db = makeDb();
    const entry = await createStaffDirectoryEntry(db as never, {
      displayName: "Wamble, Steven",
      role: "salesperson",
    });
    expect(entry.displayName).toBe("Wamble, Steven");
    expect(entry.role).toBe("salesperson");
  });

  it("rejects duplicate names for the same role", async () => {
    const db = makeDb([sample("1", "Wamble, Steven", "salesperson")]);
    await expect(
      createStaffDirectoryEntry(db as never, {
        displayName: "Wamble, Steven",
        role: "salesperson",
      }),
    ).rejects.toBeInstanceOf(StaffDirectoryError);
  });

  it("deactivates an entry", async () => {
    const db = makeDb([sample("entry-1", "Wamble, Steven", "salesperson")]);
    const updated = await deactivateStaffDirectoryEntry(db as never, "entry-1");
    expect(updated.isActive).toBe(false);
    expect(updated.deactivatedAt).toBeTruthy();
  });
});
