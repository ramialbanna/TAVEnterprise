"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  createStaffDirectoryEntry,
  deactivateStaffDirectoryEntry,
  getAppMe,
  listStaffDirectory,
  reactivateStaffDirectoryEntry,
} from "@/lib/app-api/client";
import { codeMessage } from "@/lib/app-api";
import type { StaffDirectoryRole } from "@/lib/app-api/schemas";
import { queryKeys } from "@/lib/query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Admin roster manager for salesperson / appraiser directory (item 53).
 */
export function StaffDirectoryAdmin() {
  const queryClient = useQueryClient();
  const meQuery = useQuery({
    queryKey: queryKeys.appMe,
    queryFn: () => getAppMe(),
  });
  const isAdmin = meQuery.data?.ok === true && meQuery.data.data.role === "admin";

  const directoryQuery = useQuery({
    queryKey: queryKeys.staffDirectory({ includeInactive: true }),
    queryFn: () => listStaffDirectory({ includeInactive: true }),
    enabled: isAdmin,
  });

  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<StaffDirectoryRole>("salesperson");
  const [filter, setFilter] = useState("");

  const createMutation = useMutation({
    mutationFn: () => createStaffDirectoryEntry({ displayName, role }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success("Added to directory");
        setDisplayName("");
        void queryClient.invalidateQueries({ queryKey: ["staff-directory"] });
        return;
      }
      if (!result.ok) toast.error(codeMessage(result.error));
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => deactivateStaffDirectoryEntry(id),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success("Deactivated");
        void queryClient.invalidateQueries({ queryKey: ["staff-directory"] });
        return;
      }
      if (!result.ok) toast.error(codeMessage(result.error));
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: (id: string) => reactivateStaffDirectoryEntry(id),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success("Reactivated");
        void queryClient.invalidateQueries({ queryKey: ["staff-directory"] });
        return;
      }
      if (!result.ok) toast.error(codeMessage(result.error));
    },
  });

  const entries = useMemo(() => {
    const rows = directoryQuery.data?.ok ? directoryQuery.data.data : [];
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.displayName.toLowerCase().includes(q) || r.role.toLowerCase().includes(q),
    );
  }, [directoryQuery.data, filter]);

  if (meQuery.isLoading) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">Loading…</CardContent>
      </Card>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Salesperson / Appraiser directory</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Closers pick from this list on opportunity detail. Deactivate instead of deleting so
          historical names still display.
        </p>

        <form
          className="grid gap-3 sm:grid-cols-[1fr_auto_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            if (!displayName.trim()) return;
            createMutation.mutate();
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="directory-name" className="text-xs text-muted-foreground">
              Name (Last, First)
            </Label>
            <Input
              id="directory-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Carreon, Ruben"
              className="h-9"
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="directory-role" className="text-xs text-muted-foreground">
              Role
            </Label>
            <select
              id="directory-role"
              className={selectClass}
              value={role}
              onChange={(e) => setRole(e.target.value as StaffDirectoryRole)}
            >
              <option value="salesperson">Salesperson</option>
              <option value="appraiser">Appraiser</option>
              <option value="both">Both</option>
            </select>
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={createMutation.isPending || !displayName.trim()}>
              {createMutation.isPending ? "Adding…" : "Add"}
            </Button>
          </div>
        </form>

        <div className="space-y-1">
          <Label htmlFor="directory-filter" className="text-xs text-muted-foreground">
            Filter
          </Label>
          <Input
            id="directory-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search names…"
            className="h-8 text-xs"
          />
        </div>

        {directoryQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading directory…</p>
        ) : !directoryQuery.data?.ok ? (
          <p className="text-sm text-status-error">Could not load directory.</p>
        ) : (
          <div className="max-h-80 overflow-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">{entry.displayName}</td>
                    <td className="px-3 py-2 capitalize">{entry.role}</td>
                    <td className="px-3 py-2">
                      {entry.isActive ? "Active" : "Inactive"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {entry.isActive ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={deactivateMutation.isPending}
                          onClick={() => deactivateMutation.mutate(entry.id)}
                        >
                          Deactivate
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={reactivateMutation.isPending}
                          onClick={() => reactivateMutation.mutate(entry.id)}
                        >
                          Reactivate
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
