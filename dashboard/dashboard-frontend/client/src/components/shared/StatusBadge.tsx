/**
 * StatusBadge - Status Indicator Component
 * Swiss Brutalist Tech Design
 * Minimal colored badges for status display
 */

import { cn } from "@/lib/utils";

type BadgeVariant = "success" | "warning" | "error" | "info" | "neutral";

interface StatusBadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  success: "badge-success",
  warning: "badge-warning",
  error: "badge-error",
  info: "badge-info",
  neutral: "badge-neutral",
};

export function StatusBadge({ variant, children, className }: StatusBadgeProps) {
  return (
    <span className={cn(variantClasses[variant], className)}>
      {children}
    </span>
  );
}

/**
 * Helper function to get badge variant from status string
 */
export function getStatusVariant(status: string): BadgeVariant {
  const statusLower = status.toLowerCase();
  
  if (["success", "ready", "indexed", "active", "completed", "healthy"].includes(statusLower)) {
    return "success";
  }
  if (["warning", "processing", "pending", "degraded"].includes(statusLower)) {
    return "warning";
  }
  if (["error", "failed", "critical", "offline"].includes(statusLower)) {
    return "error";
  }
  if (["info", "new", "updated"].includes(statusLower)) {
    return "info";
  }
  return "neutral";
}
