import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  FileText,
  MessageSquare,
  CheckCircle,
  DollarSign,
  Activity,
  Shield,
  Radar,
  Bell,
} from "lucide-react";

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
  { label: "Trace Tail", href: "/admin/live/traces", icon: Radar },
  { label: "Alerts", href: "/admin/alerts", icon: Bell },
];

export function Sidebar() {
  const [location] = useLocation();

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 bg-[#fafafa] border-r border-[#e5e5e5] flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-[#e5e5e5]">
        <span className="text-lg font-semibold text-[#181818] tracking-tight">
          Koda Admin
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 overflow-y-auto">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive =
              location === item.href ||
              (item.href !== "/admin" && location.startsWith(item.href));

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                    isActive
                      ? "bg-[#181818] text-white"
                      : "text-[#525252] hover:bg-[#e5e5e5] hover:text-[#181818]"
                  )}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-[#e5e5e5]">
        <p className="text-xs text-[#a3a3a3]">Koda Analytics v1.0</p>
      </div>
    </aside>
  );
}

export default Sidebar;
