/**
 * PageHeader - Page Title and Actions
 * Swiss Brutalist Tech Design
 * Consistent header structure across all admin pages
 */

import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

interface PageHeaderProps {
  title: string;
  description?: string;
  backLink?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  backLink,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-start justify-between py-6 px-8 border-b border-border bg-background",
        className
      )}
    >
      <div className="flex items-start gap-4">
        {backLink && (
          <Link href={backLink}>
            <button className="mt-1 p-1 hover:bg-muted transition-colors duration-150">
              <ArrowLeft className="w-5 h-5 text-muted-foreground" />
            </button>
          </Link>
        )}
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
