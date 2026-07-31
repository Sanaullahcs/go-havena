import api from "./client";

export interface CommunityRule {
  id: number;
  community_id: number;
  title: string;
  category: string;
  description: string;
  severity: "important" | "standard" | "info";
  requires_acknowledgment: boolean;
  status: "active" | "inactive";
  acknowledged: boolean;
  needs_action: boolean;
  acknowledgment_count?: number;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface RuleCategory {
  name: string;
  count: number;
}

export interface AdminRulesResponse {
  data: CommunityRule[];
  categories: RuleCategory[];
  total: number;
}

export type RuleForm = {
  title: string;
  category: string;
  description: string;
  severity: CommunityRule["severity"];
  requires_acknowledgment: boolean;
  status: "active" | "inactive";
};

export async function fetchAdminRules(params?: {
  status?: string;
  category?: string;
  severity?: string;
  search?: string;
}): Promise<AdminRulesResponse> {
  const p = new URLSearchParams();
  if (params?.status && params.status !== "all") p.set("status", params.status);
  if (params?.category) p.set("category", params.category);
  if (params?.severity) p.set("severity", params.severity);
  if (params?.search?.trim()) p.set("search", params.search.trim());
  const res = await api.get(`/v1/admin/community-rules?${p.toString()}`);
  return res.data as AdminRulesResponse;
}

export async function createRule(payload: RuleForm): Promise<CommunityRule> {
  const res = await api.post("/v1/admin/community-rules", payload);
  return res.data.data as CommunityRule;
}

export async function updateRule(id: number, payload: Partial<RuleForm>): Promise<CommunityRule> {
  const res = await api.patch(`/v1/admin/community-rules/${id}`, payload);
  return res.data.data as CommunityRule;
}

export async function deleteRule(id: number): Promise<void> {
  await api.delete(`/v1/admin/community-rules/${id}`);
}

export async function createRuleCategory(name: string): Promise<RuleCategory> {
  const res = await api.post("/v1/admin/community-rules/categories", { name });
  return res.data.data as RuleCategory;
}

export async function deleteRuleCategory(name: string): Promise<void> {
  const p = new URLSearchParams({ name });
  await api.delete(`/v1/admin/community-rules/categories?${p.toString()}`);
}
