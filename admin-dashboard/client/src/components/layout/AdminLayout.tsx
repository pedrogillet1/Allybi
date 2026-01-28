/**
 * AdminLayout - Swiss Brutalist Tech Design
 * Fixed sidebar navigation with main content area
 * Pure white/black minimalist aesthetic
 */

import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Users,
  FileText,
  MessageSquare,
  CheckCircle,
  Cpu,
  Activity,
  Shield,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AdminLayoutProps {
  children: React.ReactNode;
}

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
  { label: "LLM / Cost", href: "/admin/llm", icon: Cpu },
  { label: "Reliability", href: "/admin/reliability", icon: Activity },
  { label: "Security", href: "/admin/security", icon: Shield },
];

export function AdminLayout({ children }: AdminLayoutProps) {
  const [location] = useLocation();

  const isActive = (href: string) => {
    if (href === "/admin") {
      return location === "/admin" || location === "/admin/";
    }
    return location.startsWith(href);
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-60 border-r border-border bg-sidebar flex flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-border">
          <Link href="/admin" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-foreground flex items-center justify-center">
              <span className="text-background font-bold text-sm">K</span>
            </div>
            <span className="font-semibold text-foreground tracking-tight">
              Koda Admin
            </span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3">
          <div className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors duration-150",
                      active
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                    {active && <ChevronRight className="w-4 h-4 ml-auto" />}
                  </div>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Koda Analytics v1.0
          </p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="animate-fade-in">{children}</div>
      </main>
    </div>
  );
}
