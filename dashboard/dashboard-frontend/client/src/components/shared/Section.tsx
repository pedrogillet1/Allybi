/**
 * Section - Content Section Component
 * Swiss Brutalist Tech Design
 * Groups content with optional title and border
 */

import { cn } from "@/lib/utils";

interface SectionProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

export function Section({
  title,
  description,
  children,
  className,
  contentClassName,
}: SectionProps) {
  return (
    <section className={cn("border border-border bg-card", className)}>
      {(title || description) && (
        <div className="px-6 py-4 border-b border-border">
          {title && (
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
          )}
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      )}
      <div className={cn("p-6", contentClassName)}>{children}</div>
    </section>
  );
}
