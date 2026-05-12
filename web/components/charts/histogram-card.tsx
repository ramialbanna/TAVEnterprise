"use client";

import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";

import { AXIS_PROPS, GRID_PROPS, TOOLTIP_CONTENT_STYLE, seriesColor } from "./chart-theme";
import { ChartFrame } from "./chart-frame";

export interface HistogramBucket {
  /** The bucket's display label, e.g. `"$0–1k"` or `"30–45 days"`. */
  bucketLabel: string;
  count: number;
}

export interface HistogramCardProps {
  title: string;
  /** PRE-BUCKETED data — the card renders bars over it; it does not bucket raw values. */
  data: HistogramBucket[];
  /** Minimum buckets required to draw; below this → "Not enough data". Default 1. */
  minPoints?: number;
  /** Bar fill — a CSS colour, a palette index 1-5, or a status key. Default `--color-chart-2`. */
  fill?: string | number;
  caption?: ReactNode;
  height?: number;
  ariaLabel?: string;
  className?: string;
}

/**
 * A titled card wrapping a Recharts histogram (bars over pre-bucketed `{ bucketLabel,
 * count }` data), with explicit empty / insufficient-data states and an sr-only data
 * table. Bucketing is the caller's job — this component never derives buckets.
 */
export function HistogramCard({
  title,
  data,
  minPoints = 1,
  fill = 2,
  caption,
  height,
  ariaLabel,
  className,
}: HistogramCardProps) {
  return (
    <ChartFrame
      title={title}
      caption={caption}
      className={className}
      rows={data.map((b) => ({ label: b.bucketLabel, value: b.count }))}
      minPoints={minPoints}
      categoryLabel="Bucket"
      valueLabel="Count"
      ariaLabel={ariaLabel}
      height={height}
    >
      <BarChart data={data}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="bucketLabel" interval={0} {...AXIS_PROPS} />
        <YAxis width={40} allowDecimals={false} {...AXIS_PROPS} />
        <Tooltip cursor={{ fill: "var(--color-muted)", opacity: 0.4 }} contentStyle={TOOLTIP_CONTENT_STYLE} />
        <Bar dataKey="count" fill={seriesColor(fill)} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ChartFrame>
  );
}
