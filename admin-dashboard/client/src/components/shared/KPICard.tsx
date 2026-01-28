/**
 * KPICard - Key Performance Indicator Card
 * Swiss Brutalist Tech Design
 * Displays a single metric with label and optional trend
 */

import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface KPICardProps {
  label: string;
  value: string | number;
  subValue?: string;
  trend?: {
    value: number;
    label?: string;
  };
  className?: string;
}

export function KPICard({ label, value, subValue, trend, className }: KPICardProps) {
  const getTrendIcon = () => {
    if (!trend) return null;
    if (trend.value > 0) return <TrendingUp className="w-3 h-3" />;
    if (trend.value < 0) return <TrendingDown className="w-3 h-3" />;
    return <Minus className="w-3 h-3" />;
  };

  const getTrendColor = () => {
    if (!trend) return "";
    if (trend.value > 0) return "text-[oklch(0.45_0.15_145)]";
    if (trend.value < 0) return "text-[oklch(0.45_0.15_25)]";
    return "text-muted-foreground";
  };

  return (
    <div className={cn("kpi-card", className)}>
      <p className="label-uppercase mb-3">{label}</p>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold data-value">{value}</span>
        {subValue && (
          <span className="text-sm text-muted-foreground">{subValue}</span>
        )}
      </div>
      {trend && (
        <div className={cn("flex items-center gap-1 mt-2 text-xs", getTrendColor())}>
          {getTrendIcon()}
          <span className="font-medium">
            {trend.value > 0 ? "+" : ""}
            {trend.value}%
          </span>
          {trend.label && (
            <span className="text-muted-foreground ml-1">{trend.label}</span>
          )}
        </div>
      )}
    </div>
  );
}
