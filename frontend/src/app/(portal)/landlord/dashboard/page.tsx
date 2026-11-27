"use client";

import { LandlordDashboardSkeleton } from "@/components/landlord/landlord-dashboard-skeleton";
import { LandlordDashboardView } from "@/components/landlord/landlord-dashboard-view";
import { PageError } from "@/components/shared/page-states";
import { useLandlordPortfolio } from "@/hooks/use-landlord-portfolio";

const EMPTY_STATS = {
  total_owned_units: 0,
  rented_units: 0,
  vacant_units: 0,
  self_occupied_units: 0,
  tenant_status: {
    is_also_tenant: false,
    summary: "",
    resident_unit_numbers: [] as string[],
  },
};

export default function LandlordDashboardPage() {
  const { payload, loading, error, communities, selectedCommunityId, load } = useLandlordPortfolio();

  if (loading) return <LandlordDashboardSkeleton />;
  if (error) return <PageError message={error} onRetry={() => void load()} />;

  const communityName =
    communities.find((community) => community.id === selectedCommunityId)?.name ??
    (communities.length === 1 ? communities[0]?.name : null);

  return (
    <LandlordDashboardView
      communityName={communityName}
      stats={payload?.dashboard_stats ?? EMPTY_STATS}
      points={payload?.occupancy_graph ?? []}
    />
  );
}
