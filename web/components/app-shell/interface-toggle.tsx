"use client";

import { Check, PanelsTopLeft } from "lucide-react";

import { useInterface, type InterfaceMode } from "@/lib/interface/interface-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const OPTIONS: { mode: InterfaceMode; label: string }[] = [
  { mode: "classic", label: "Classic" },
  { mode: "new", label: "New" },
];

export function InterfaceToggle() {
  const { interfaceMode, setInterfaceMode } = useInterface();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Choose interface"
          title={`Interface: ${interfaceMode === "classic" ? "Classic" : "New"}`}
          className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <PanelsTopLeft className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        {OPTIONS.map(({ mode, label }) => (
          <DropdownMenuItem key={mode} onClick={() => setInterfaceMode(mode)}>
            <span className="flex w-full items-center justify-between gap-3">
              {label}
              {interfaceMode === mode ? <Check className="size-4 text-primary" /> : null}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
