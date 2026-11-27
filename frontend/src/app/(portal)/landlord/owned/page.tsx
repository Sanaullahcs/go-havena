"use client";

import { LandlordOwnedUnitsSkeleton } from "@/components/landlord/landlord-owned-units-skeleton";
import { LandlordOwnedUnitsView } from "@/components/landlord/landlord-owned-units-view";
import { PageError } from "@/components/shared/page-states";
import { useLandlordPortfolio } from "@/hooks/use-landlord-portfolio";

const EMPTY_PAYLOAD = {
  access: {
    resident: false,
    landlord_dashboard: true,
    owner_only: false,
    landlord_enabled: true,
    primary_residence_unit_id: null,
    landlord_unit_count: 0,
    approved_ownership_count: 0,
    landlord_units: [],
  },
  pending_claims: [],
  landlord_units: [],
  advisory_reviews: [],
  occupancy_graph: [],
};

export default function LandlordOwnedUnitsPage() {
  const { payload, loading, error, communities, selectedCommunityId, load } = useLandlordPortfolio();

  if (loading) return <LandlordOwnedUnitsSkeleton />;
  if (error && !payload) return <PageError message={error} onRetry={() => void load()} />;

  const communityName =
    communities.find((community) => community.id === selectedCommunityId)?.name ??
    (communities.length === 1 ? communities[0]?.name : null);

  return (
    <LandlordOwnedUnitsView
      communityName={communityName}
      payload={payload ?? EMPTY_PAYLOAD}
      onChanged={() => load()}
    />
  );
}
