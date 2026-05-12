"use client";

import type { ReactElement, ReactNode } from "react";
import { ResponsiveContainer } from "recharts";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DEFAULT_CHART_HEIGHT } from "./chart-theme";

export interface ChartValueRow {
  label: string;
  value: string | number;
}

/**
 * Internal shell for the chart cards (`components/charts` only). Renders a titled card
 * with a caption slot, switches between three body states — `empty` (`rows` is `[]`),
 * `insufficient` (`rows.length < minPoints`), and the chart — and, when the chart shows,
 * also emits an always-present `sr-only` data table so the figures are available to
 * assistive tech (and to tests) regardless of the SVG's rendered size.
 */
export function ChartFrame({
  title,
  caption,
  rows,
  minPoints = 1,
  categoryLabel = "Category",
  valueLabel = "Value",
  ariaLabel,
  emptyMessage = "No data to display.",
  insufficientMessage,
  height = DEFAULT_CHART_HEIGHT,
  className,
  children,
}: {
  title: string;
  caption?: ReactNode;
  rows: ChartValueRow[];
  minPoints?: number;
  categoryLabel?: string;
  valueLabel?: string;
  ariaLabel?: string;
  emptyMessage?: string;
  insufficientMessage?: string;
  height?: number;
  className?: string;
  /** A single Recharts chart element (the child `ResponsiveContainer` expects). */
  children: ReactElement;
}) {
  const n = rows.length;
  const state: "empty" | "insufficient" | "ok" =
    n === 0 ? "empty" : n < minPoints ? "insufficient" : "ok";
  const insufficient =
    insufficientMessage ??
    `Not enough data yet — need at least ${minPoints} data point${minPoints === 1 ? "" : "s"}.`;
  const label = ariaLabel ?? title;

  return (
    <Card className={cn("min-w-0", className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {caption ? <p className="text-xs text-text-subtle">{caption}</p> : null}
      </CardHeader>
      <CardContent>
        {state === "empty" ? (
          <ChartMessage>{emptyMessage}</ChartMessage>
        ) : state === "insufficient" ? (
          <ChartMessage>{insufficient}</ChartMessage>
        ) : (
          <figure className="m-0" aria-label={label}>
            <ResponsiveContainer width="100%" height={height}>
              {children}
            </ResponsiveContainer>
            <figcaption className="sr-only">
              <table aria-label={`${label} — underlying data`}>
                <thead>
                  <tr>
                    <th scope="col">{categoryLabel}</th>
                    <th scope="col">{valueLabel}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={`${row.label}-${i}`}>
                      <th scope="row">{row.label}</th>
                      <td>{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </figcaption>
          </figure>
        )}
      </CardContent>
    </Card>
  );
}

function ChartMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border bg-surface-sunken px-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
