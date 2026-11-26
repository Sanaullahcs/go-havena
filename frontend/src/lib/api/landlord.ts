import api from "./client";

export type LandlordOccupancy = "live_here" | "rented" | "vacant";

export type LandlordAccess = {
  resident: boolean;
  landlord_dashboard: boolean;
  owner_only: boolean;
  landlord_enabled: boolean;
  primary_residence_unit_id: number | null;
  landlord_unit_count: number;
  approved_ownership_count: number;
  landlord_units: Array<{
    unit_id: number;
    unit_number: string;
    occupancy: LandlordOccupancy;
    landlord_can_pay_bills?: boolean;
    landlord_bill_status_only?: boolean;
    resident_count?: number;
  }>;
};

export type LandlordBillStatus = {
  label: string;
  status: string | null;
  detail: string | null;
};

export type LandlordPortfolioUnit = {
  unit_id: number;
  unit_number: string;
  occupancy: LandlordOccupancy;
  landlord_can_pay_bills?: boolean;
  landlord_bill_status_only?: boolean;
  resident_count?: number;
  residents?: Array<{
    id: number;
    name?: string | null;
    email?: string | null;
    status?: string;
    is_billing_contact?: boolean;
  }>;
  billing_contact?: { id: number; name?: string | null } | null;
  bill_status?: LandlordBillStatus;
  ownership_id?: number;
};

export type LandlordPortfolioPayload = {
  access: LandlordAccess;
  pending_claims: Array<{
    id: number;
    unit_id: number;
    unit_number: string;
    occupancy: LandlordOccupancy;
    status: string;
    created_at: string;
  }>;
  landlord_units: LandlordPortfolioUnit[];
  advisory_reviews?: Array<{
    id: number;
    unit_number: string;
    email: string;
    display_name: string | null;
    resident_status?: string | null;
    created_at: string;
  }>;
};

export async function fetchLandlordAccess(communityId?: number): Promise<LandlordAccess> {
  const { data } = await api.get("/v1/landlord/access", {
    params: communityId ? { community_id: communityId } : undefined,
  });
  return data.data as LandlordAccess;
}

export async function fetchLandlordPortfolio(communityId?: number): Promise<{
  data: LandlordPortfolioPayload;
  meta: {
    landlord_community_ids: number[];
    landlord_communities?: Array<{ id: number; name: string }>;
    landlord_community_picker: boolean;
  };
}> {
  const res = await api.get("/v1/landlord/portfolio", {
    params: communityId ? { community_id: communityId } : undefined,
  });
  return { data: res.data.data as LandlordPortfolioPayload, meta: res.data.meta };
}

export async function enableLandlordMode(communityId?: number): Promise<LandlordAccess> {
  const { data } = await api.post("/v1/landlord/enable", null, {
    params: communityId ? { community_id: communityId } : undefined,
  });
  return data.data as LandlordAccess;
}

export type ClaimOwnershipInput = {
  unit_number: string;
  is_new_unit?: boolean;
  occupancy: LandlordOccupancy;
  community_id?: number;
};

export async function claimLandlordOwnership(body: ClaimOwnershipInput & { proof_url: string }) {
  const { data } = await api.post("/v1/landlord/ownership-claims", body);
  return data;
}

export async function updateLandlordOccupancy(ownershipId: number, occupancy: LandlordOccupancy, communityId?: number) {
  const { data } = await api.patch(`/v1/landlord/ownerships/${ownershipId}/occupancy`, { occupancy }, {
    params: communityId ? { community_id: communityId } : undefined,
  });
  return data;
}

export type AdvisoryReview = {
  id: number;
  unit_id: number;
  subject_user_id: number;
  status: string;
  created_at: string;
  unit_number: string;
  email: string;
  display_name: string | null;
  resident_status?: string | null;
};

export async function decideLandlordAdvisory(id: number, status: "approved" | "rejected", reason?: string) {
  const { data } = await api.post(`/v1/landlord/advisory-reviews/${id}`, { status, reason });
  return data;
}

export async function setPrimaryResidence(unitId: number, communityId?: number) {
  const { data } = await api.put("/v1/landlord/primary-residence", { unit_id: unitId }, {
    params: communityId ? { community_id: communityId } : undefined,
  });
  return data;
}

export type AdminOwnershipClaim = {
  id: number;
  unit_id: number;
  user_id: number;
  community_id?: number;
  occupancy: LandlordOccupancy;
  status: string;
  source: string | null;
  proof_url?: string | null;
  rejection_reason?: string | null;
  created_at: string;
  unit_number: string;
  email: string;
  phone?: string | null;
  display_name: string | null;
  billing_contact?: {
    id: number;
    name: string;
    email?: string | null;
    is_claimant?: boolean;
  } | null;
  resident_counts?: {
    active: number;
    pending: number;
    total: number;
  };
};

/** Vacant / rented portfolio claims only — not “I live here”. */
export function isAdminLandlordClaimsOccupancy(occupancy: string): boolean {
  return occupancy === "vacant" || occupancy === "rented";
}

export async function fetchAdminLandlordClaims(status = "pending"): Promise<AdminOwnershipClaim[]> {
  const { data } = await api.get("/v1/admin/landlord-ownership-claims", { params: { status } });
  return ((data.data ?? []) as AdminOwnershipClaim[]).filter((row) => isAdminLandlordClaimsOccupancy(row.occupancy));
}

export type AdminLandlordUnitResident = {
  id: number;
  name: string;
  email?: string | null;
  status: string;
  joined_at?: string | null;
  is_billing_contact?: boolean;
  is_claimant?: boolean;
};

export type AdminOwnershipClaimDetail = AdminOwnershipClaim & {
  reviewed_at?: string | null;
  reviewed_by_name?: string | null;
  claimant?: {
    display_name?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  unit?: {
    id: number;
    unit_number: string;
    kind?: string;
    billing_contact?: {
      id: number;
      name: string;
      email?: string | null;
      is_claimant?: boolean;
    } | null;
    resident_counts?: {
      active: number;
      pending: number;
      total: number;
    };
    residents?: AdminLandlordUnitResident[];
  };
};

export async function fetchAdminLandlordClaim(id: number): Promise<AdminOwnershipClaimDetail> {
  const { data } = await api.get(`/v1/admin/landlord-ownership-claims/${id}`);
  return (data.data ?? data) as AdminOwnershipClaimDetail;
}

export async function approveAdminLandlordClaim(id: number) {
  const { data } = await api.post(`/v1/admin/landlord-ownership-claims/${id}/approve`);
  return data;
}

export async function rejectAdminLandlordClaim(id: number, reason?: string) {
  const { data } = await api.post(`/v1/admin/landlord-ownership-claims/${id}/reject`, { reason });
  return data;
}

export function occupancyLabel(occupancy: LandlordOccupancy): string {
  if (occupancy === "live_here") return "I live here";
  if (occupancy === "rented") return "Rented out";
  return "Vacant";
}

export function billStatusLabel(status?: LandlordBillStatus | null): string {
  if (!status) return "—";
  const key = status.label;
  if (key === "paid") return "Paid";
  if (key === "unpaid") return "Unpaid";
  if (key === "overdue") return "Overdue";
  if (key === "no_bills_yet" || key === "no_bills") return "No bills yet";
  if (key === "unavailable") return "—";
  return key;
}