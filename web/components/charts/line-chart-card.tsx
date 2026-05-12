"use client";

import type { ReactNode } from "react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";

import { AXIS_PROPS, GRID_PROPS, TOOLTIP_CONTENT_STYLE, seriesColor } from "./chart-theme";
import { ChartFrame } from "./chart-frame";

export interface LineChartDatum {
  label: string;
  value: number;
}

export type LineChartVariant = "line" | "area";

export interface LineChartCardProps {
  title: string;
  /** Already-shaped ordered series (e.g. one point per month). Not transformed here. */
  data: LineChartDatum[];
  /** `"line"` (default) or `"area"` (filled). */
  variant?: LineChartVariant;
  /** Minimum points required to draw a trend; below this → "Not enough data". Default 2. */
  minPoints?: number;
  /** Stroke colour — a CSS colour, a palette index 1-5, or a status key. Default `--color-chart-1`. */
  stroke?: string | number;
  valueLabel?: string;
  categoryLabel?: string;
  caption?: ReactNode;
  height?: number;
  ariaLabel?: string;
  className?: string;
}

/**
 * A titled card wrapping a Recharts line (or filled area) chart, with explicit empty /
 * insufficient-data states and an sr-only data table. Used for trend series such as the
 * monthly gross-profit line; consumes an already-shaped `{ label, value }[]`.
 */
export function LineChartCard({
  title,
  data,
  variant = "line",
  minPoints = 2,
  stroke,
  valueLabel = "Value",
  categoryLabel = "Period",
  caption,
  height,
  ariaLabel,
  className,
}: LineChartCardProps) {
  const color = seriesColor(stroke);

  const chart =
    variant === "area" ? (
      <AreaChart data={data}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="label" {...AXIS_PROPS} />
        <YAxis width={48} {...AXIS_PROPS} />
        <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} />
        <Area dataKey="value" stroke={color} strokeWidth={2} fill={color} fillOpacity={0.15} />
      </AreaChart>
    ) : (
      <LineChart data={data}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="label" {...AXIS_PROPS} />
        <YAxis width={48} {...AXIS_PROPS} />
        <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} />
        <Line dataKey="value" stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
      </LineChart>
    );

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
      {chart}
    </ChartFrame>
  );
}
