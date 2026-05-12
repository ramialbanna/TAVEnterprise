"use client";

import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";

import { AXIS_PROPS, GRID_PROPS, TOOLTIP_CONTENT_STYLE, seriesColor } from "./chart-theme";
import { ChartFrame } from "./chart-frame";

export interface BarChartDatum {
  label: string;
  value: number;
}

export interface BarChartCardProps {
  title: string;
  /** Already-shaped categorical series. The card does not transform it. */
  data: BarChartDatum[];
  /** Minimum bars required to draw; below this → "Not enough data". Default 1. */
  minPoints?: number;
  /** Bar fill — a CSS colour, a palette index 1-5, or a status key. Default `--color-chart-1`. */
  fill?: string | number;
  /** Header for the value column in the sr-only data table (e.g. "Gross"). */
  valueLabel?: string;
  /** Header for the category column in the sr-only data table (e.g. "Region"). */
  categoryLabel?: string;
  caption?: ReactNode;
  /** SVG height in px. Default 240. */
  height?: number;
  /** Accessible description; defaults to `title`. */
  ariaLabel?: string;
  className?: string;
}

/**
 * A titled card wrapping a vertical Recharts bar chart, with explicit empty /
 * insufficient-data states and an sr-only data table. Consumes an already-shaped
 * `{ label, value }[]` series — no bucketing or aggregation happens here.
 */
export function BarChartCard({
  title,
  data,
  minPoints = 1,
  fill,
  valueLabel = "Value",
  categoryLabel = "Category",
  caption,
  height,
  ariaLabel,
  className,
}: BarChartCardProps) {
  return (
    <ChartFrame
      title={title}
      caption={caption}
      className={className}
      rows={data.map((d) => ({ label: d.label, value: d.value }))}
      minPoints={minPoints}
      categoryLabel={categoryLabel}
      valueLabel={valueLabel}
      ariaLabel={ariaLabel}
      height={height}
    >
      <BarChart data={data}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="label" {...AXIS_PROPS} />
        <YAxis width={48} {...AXIS_PROPS} />
        <Tooltip cursor={{ fill: "var(--color-muted)", opacity: 0.4 }} contentStyle={TOOLTIP_CONTENT_STYLE} />
        <Bar dataKey="value" fill={seriesColor(fill)} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ChartFrame>
  );
}
