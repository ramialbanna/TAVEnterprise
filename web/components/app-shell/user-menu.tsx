"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, LogOut } from "lucide-react";
import { signOutAction } from "./actions";

export type SessionUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

function initials(user: SessionUser): string {
  const base = user.name ?? user.email ?? "?";
  const parts = base.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function UserMenu({ user }: { user: SessionUser | null }) {
  if (!user) return null;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md px-1.5 py-1 text-sm text-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {user.image ? (
            // Avatar comes from Google's CDN; next/image would need remotePatterns config.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.image} alt="" className="size-7 rounded-full" />
          ) : (
            <span className="grid size-7 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
              {initials(user)}
            </span>
          )}
          <span className="hidden max-w-[10rem] truncate sm:inline">{user.name ?? user.email}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-56 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <div className="px-2 py-1.5">
            {user.name && <p className="truncate text-sm font-medium">{user.name}</p>}
            {user.email && <p className="truncate text-xs text-muted-foreground">{user.email}</p>}
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item asChild>
            <form action={signOutAction}>
              <button
                type="submit"
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent"
              >
                <LogOut className="size-4 text-muted-foreground" />
                Sign out
              </button>
            </form>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
