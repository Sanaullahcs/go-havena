import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  Ban,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  FileText,
  GraduationCap,
  LayoutGrid,
  Map,
  MessageSquare,
  RefreshCw,
  Shield,
  ShoppingCart,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";

/** Consistent stroke/size for dashboard Lucide icons */
export const DASHBOARD_ICON = "h-4 w-4";
export const DASHBOARD_ICON_LG = "h-5 w-5";

export function dashIcon(Icon: LucideIcon, className = DASHBOARD_ICON) {
  if (!Icon) return null;
  return <Icon className={className} strokeWidth={2} aria-hidden />;
}

export {
  Activity,
  AlertTriangle,
  Ban,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  FileText,
  GraduationCap,
  LayoutGrid,
  Map,
  MessageSquare,
  RefreshCw,
  Shield,
  ShoppingCart,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
};
