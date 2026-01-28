/**
 * TabNav - Tab Navigation Component
 * Swiss Brutalist Tech Design
 * Horizontal tabs for detail page sections
 */

import { cn } from "@/lib/utils";

interface Tab {
  id: string;
  label: string;
}

interface TabNavProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
}

export function TabNav({ tabs, activeTab, onTabChange, className }: TabNavProps) {
  return (
    <div className={cn("border-b border-border", className)}>
      <nav className="flex gap-0 -mb-px">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "px-4 py-3 text-sm font-medium border-b-2 transition-colors duration-150",
              activeTab === tab.id
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            )}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
