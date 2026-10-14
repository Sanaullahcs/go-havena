import api from "./client";

export interface AdminDashboardStats {
  total_members: number;
  pending_members: number;
  invitation_sent_members?: number;
  onboarding_members: number;
  pending_approval_total: number;
  banned_members: number;
  open_reports: number;
  active_listings: number;
  pending_listings: number;
  pending_bookings?: number;
  pending_amenity_reviews?: number;
  pending_amenity_payments?: number;
  pending_service_payments?: number;
  pending_businesses?: number;
  published_notices: number;
  upcoming_events?: number;
  total_posts: number;
  total_communities: number;
  active_regions: number;
  pending_community_requests: number;
  pending_posts: number;
  approved_posts: number;
  total_community_admins?: number;
  pending_community_admins?: number;
  approved_community_admins?: number;
  rejected_community_admins?: number;
  new_contact_submissions?: number;
  total_contact_submissions?: number;
}

export interface AdminDashboardPendingAction {
  type:
    | "membership"
    | "family_add_member"
    | "community_request"
    | "community_admin"
    | "post"
    | "notice"
    | "event"
    | "alert"
    | "listing"
    | "business"
    | "booking"
    | "amenity_review"
    | "amenity_payment"
    | "service_payment";
  amenity_id?: number;
  id: number;
  user_id?: number;
  community_id?: number;
  title: string;
  subtitle: string;
  detail: string | null;
  utility_bill_url?: string | null;
  created_at: string;
  action_label: string;
  action_href: string;
  family_add_member_request_id?: number | null;
  family_number?: string | null;
}

export interface AdminDashboardActivityPoint {
  date: string;
  count: number;
}

export interface AdminDashboardMemberGrowthPoint {
  month: string;
  count: number;
}

export interface AdminDashboardStatusPoint {
  status: string;
  count: number;
}

export interface AdminDashboardReportTypePoint {
  type: string;
  count: number;
}

export interface AdminDashboardReportsTrendPoint {
  date: string;
  filed: number;
  resolved: number;
}

export interface AdminDashboardTopCommunityPoint {
  id: number;
  name: string;
  region: string;
  members_count: number;
}

export interface AdminDashboardActivityLog {
  id: number;
  action: string;
  description: string;
  severity: string;
  log_type: string;
  user_name: string | null;
  created_at: string;
}

export interface AdminDashboardData {
  scope: {
    community_id: number | null;
    label: string;
  };
  stats: AdminDashboardStats;
  activity_chart: AdminDashboardActivityPoint[];
  member_growth: AdminDashboardMemberGrowthPoint[];
  member_status: AdminDashboardStatusPoint[];
  reports_by_type: AdminDashboardReportTypePoint[];
  reports_trend: AdminDashboardReportsTrendPoint[];
  top_communities_by_members: AdminDashboardTopCommunityPoint[];
  recent_activity: AdminDashboardActivityLog[];
  pending_actions: AdminDashboardPendingAction[];
  generated_at: string;
}

export async function fetchAdminStats(params?: { community_id?: number }) {
  const res = await api.get("/v1/admin/dashboard/stats", { params });
  const data = res.data.data as AdminDashboardData;

  return {
    ...data,
    top_communities_by_members: data.top_communities_by_members ?? [],
    pending_actions: data.pending_actions ?? [],
    recent_activity: data.recent_activity ?? [],
    activity_chart: data.activity_chart ?? [],
    member_growth: data.member_growth ?? [],
    member_status: data.member_status ?? [],
    reports_by_type: data.reports_by_type ?? [],
    reports_trend: data.reports_trend ?? [],
  };
}

export interface ResidentDashboardNotice {
  id: number;
  title: string;
  category?: string;
  published_at?: string | null;
  event_date?: string | null;
}

export interface ResidentDashboardActivityPoint {
  date: string;
  posts: number;
  likes: number;
}

export interface ResidentDashboardData {
  my_stats: {
    posts: number;
    bookings: number;
    saved_listings: number;
    likes_given: number;
    unread_notifs: number;
  };
  community_stats: {
    total_members: number;
    total_posts: number;
  };
  recent_notices: ResidentDashboardNotice[];
  personal_activity: ResidentDashboardActivityPoint[];
}

export async function fetchResidentStats(params?: { community_id?: number }) {
  const res = await api.get("/v1/dashboard/stats", { params });
  return res.data.data as ResidentDashboardData;
}
