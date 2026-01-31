/**
 * AdminLayout - Koda Admin Dashboard
 * Fixed sidebar navigation with main content area
 * Black/White/Gray minimalist design with Plus Jakarta Sans
 * Includes: Global search, environment selector, date range picker, export, system health
 */

import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Users,
  FileText,
  MessageSquare,
  CheckCircle,
  DollarSign,
  Activity,
  Shield,
  Radio,
  Search,
  Download,
  ChevronDown,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TimeRange, Environment } from "@/types/admin";

// ============================================================================
// Navigation Items
// ============================================================================

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard },
  { label: "Users", href: "/admin/users", icon: Users },
  { label: "Files", href: "/admin/files", icon: FileText },
  { label: "Queries", href: "/admin/queries", icon: MessageSquare },
  { label: "Answer Quality", href: "/admin/quality", icon: CheckCircle },
  { label: "LLM / Cost", href: "/admin/llm", icon: DollarSign },
  { label: "Reliability", href: "/admin/reliability", icon: Activity },
  { label: "Security", href: "/admin/security", icon: Shield },
  { label: "Live", href: "/admin/live", icon: Radio },
];

// ============================================================================
// Time Range Options
// ============================================================================

const timeRangeOptions: { value: TimeRange; label: string }[] = [
  { value: "24h", label: "Last 24h" },
  { value: "7d", label: "Last 7d" },
  { value: "30d", label: "Last 30d" },
  { value: "90d", label: "Last 90d" },
  { value: "custom", label: "Custom" },
];

// ============================================================================
// Environment Options
// ============================================================================

const envOptions: { value: Environment; label: string }[] = [
  { value: "prod", label: "Production" },
  { value: "staging", label: "Staging" },
  { value: "dev", label: "Development" },
  { value: "local", label: "Local" },
];

// ============================================================================
// System Health Indicator
// ============================================================================

function SystemHealthIndicator() {
  // In production, this would use useSystemHealth() hook
  const status: "healthy" | "degraded" | "unhealthy" = "healthy";

  const statusColor = {
    healthy: "bg-[#22c55e]",
    degraded: "bg-[#f59e0b]",
    unhealthy: "bg-[#ef4444]",
  };

  const statusText = {
    healthy: "All systems operational",
    degraded: "Some services degraded",
    unhealthy: "System issues detected",
  };

  return (
    <div className="group relative flex items-center gap-2 px-4 py-3 text-xs text-[#6B7280] cursor-default">
      <div className={cn("w-2 h-2 rounded-full", statusColor[status])} />
      <span>System Health</span>
      
      {/* Tooltip */}
      <div className="absolute bottom-full left-2 mb-2 hidden group-hover:block z-50">
        <div className="bg-[#111111] text-white text-xs rounded-md px-3 py-2 shadow-lg whitespace-nowrap">
          {statusText[status]}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Global Search
// ============================================================================

function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen(true);
        inputRef.current?.focus();
      }
      if (e.key === "Escape") {
        setIsOpen(false);
        setQuery("");
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B7280]" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search users, docs, queries... (⌘K)"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className="w-72 pl-9 pr-3 py-2 text-sm bg-[#F5F5F5] border border-[#E6E6EC] rounded-md focus:outline-none focus:ring-1 focus:ring-[#111111] placeholder:text-[#6B7280]"
        />
        {query && (
          <button
            onClick={() => {
              setQuery("");
              setIsOpen(false);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2"
          >
            <X className="w-4 h-4 text-[#6B7280]" />
          </button>
        )}
      </div>

      {/* Search Results Dropdown */}
      {isOpen && query.length >= 2 && (
        <div className="absolute top-full left-0 mt-2 w-80 bg-white border border-[#E6E6EC] rounded-md shadow-lg z-50 max-h-96 overflow-y-auto">
          <div className="p-4 text-sm text-[#6B7280]">
            Search functionality will connect to API
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Export Button
// ============================================================================

function ExportButton() {
  const [isOpen, setIsOpen] = useState(false);

  const handleExport = (format: "csv" | "json") => {
    // In production, this would use useExport() hook
    console.log(`Exporting as ${format}`);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-[#E6E6EC] rounded-md hover:bg-[#F5F5F5]"
      >
        <Download className="w-4 h-4" />
        <span>Export</span>
        <ChevronDown className="w-3 h-3" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full right-0 mt-2 w-32 bg-white border border-[#E6E6EC] rounded-md shadow-lg z-50">
            <button
              onClick={() => handleExport("csv")}
              className="block w-full px-4 py-2 text-sm text-left hover:bg-[#F5F5F5]"
            >
              Export CSV
            </button>
            <button
              onClick={() => handleExport("json")}
              className="block w-full px-4 py-2 text-sm text-left hover:bg-[#F5F5F5]"
            >
              Export JSON
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Dropdown Select
// ============================================================================

interface SelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}

function Select<T extends string>({ value, onChange, options }: SelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-[#E6E6EC] rounded-md hover:bg-[#F5F5F5] min-w-[120px]"
      >
        <span>{selected?.label}</span>
        <ChevronDown className="w-3 h-3 ml-auto" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 mt-2 w-40 bg-white border border-[#E6E6EC] rounded-md shadow-lg z-50">
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={cn(
                  "block w-full px-4 py-2 text-sm text-left hover:bg-[#F5F5F5]",
                  option.value === value && "bg-[#F5F5F5] font-medium"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Admin Layout
// ============================================================================

interface AdminLayoutProps {
  children: React.ReactNode;
  range?: TimeRange;
  onRangeChange?: (range: TimeRange) => void;
  env?: Environment;
  onEnvChange?: (env: Environment) => void;
  showControls?: boolean;
}

export function AdminLayout({
  children,
  range = "7d",
  onRangeChange,
  env = "prod",
  onEnvChange,
  showControls = true,
}: AdminLayoutProps) {
  const [location] = useLocation();

  const isActive = (href: string) => {
    if (href === "/admin") {
      return location === "/admin" || location === "/admin/";
    }
    return location.startsWith(href);
  };

  return (
    <div className="flex h-screen bg-white">
      {/* Sidebar */}
      <aside className="w-56 border-r border-[#E6E6EC] bg-[#FAFAFA] flex flex-col flex-shrink-0">
        {/* Logo */}
        <div className="h-16 flex items-center px-4 border-b border-[#E6E6EC]">
          <Link href="/admin" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#111111] rounded-md flex items-center justify-center">
              <span className="text-white font-bold text-sm">K</span>
            </div>
            <span className="font-semibold text-[#111111] tracking-tight">
              Koda Admin
            </span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 overflow-y-auto">
          <div className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                      active
                        ? "bg-[#111111] text-white"
                        : "text-[#6B7280] hover:bg-[#E6E6EC] hover:text-[#111111]"
                    )}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span>{item.label}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* System Health */}
        <div className="border-t border-[#E6E6EC]">
          <SystemHealthIndicator />
        </div>

        {/* Version */}
        <div className="px-4 py-3 text-xs text-[#6B7280] border-t border-[#E6E6EC]">
          Koda Analytics v1.0
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="h-16 border-b border-[#E6E6EC] flex items-center justify-between px-6 bg-white flex-shrink-0">
          <GlobalSearch />

          {showControls && (
            <div className="flex items-center gap-3">
              {onRangeChange && (
                <Select
                  value={range}
                  onChange={onRangeChange}
                  options={timeRangeOptions}
                />
              )}
              {onEnvChange && (
                <Select
                  value={env}
                  onChange={onEnvChange}
                  options={envOptions}
                />
              )}
              <ExportButton />
            </div>
          )}
        </header>

        {/* Page Content */}
        <main className="flex-1 p-6 overflow-auto bg-[#FAFAFA]">
          {children}
        </main>
      </div>
    </div>
  );
}

export default AdminLayout;
