"use client";

import { useMemo, useState } from "react";
import { PageError } from "@/components/shared/page-states";
import { ClaimUnitDialog, type ClaimUnitDraft } from "@/components/landlord/claim-unit-dialog";
import { LandlordPropertiesSkeleton } from "@/components/landlord/landlord-properties-skeleton";
import {
  LandlordPropertiesView,
  namesForUnit,
  type PropertyRow,
} from "@/components/landlord/landlord-properties-view";
import { apiError, apiFieldErrors } from "@/lib/api/client";
import { toastError, toastSuccess } from "@/lib/alert";
import {
  cancelBillingContactTransfer,
  claimLandlordOwnership,
  requestBillingContactTransfer,
  updateLandlordOccupancy,
  type LandlordOccupancy,
  type LandlordPortfolioUnit,
} from "@/lib/api/landlord";
import { uploadUtilityBill } from "@/lib/api/profile";
import { useLandlordPortfolio } from "@/hooks/use-landlord-portfolio";

const OCCUPANCY_OPTIONS: LandlordOccupancy[] = ["live_here", "rented", "vacant"];

function ownedRows(units: LandlordPortfolioUnit[]): PropertyRow[] {
  return units.map((unit) => ({
    key: `owned-${unit.unit_id}`,
    unitNumber: unit.unit_number,
    phase: "approved",
    occupancy: unit.occupancy,
    residentCount: unit.resident_count ?? namesForUnit(unit).length,
    residentNames: namesForUnit(unit),
    billingContact: unit.billing_contact?.name?.trim() || null,
    claimedAt: unit.claimed_at ?? null,
    unitId: unit.unit_id,
    isBillingContact: Boolean(unit.is_billing_contact),
    nominees: (unit.residents ?? [])
      .filter((resident) => resident.status === "active" && !resident.is_billing_contact)
      .map((resident) => ({
        id: resident.id,
        name: resident.name?.trim() || resident.email || "Resident",
      })),
    unitResidents: (unit.residents ?? [])
      .filter((resident) => resident.status === "active")
      .map((resident) => ({
        id: resident.id,
        name: resident.name?.trim() || resident.email || "Resident",
        isBillingContact: Boolean(resident.is_billing_contact),
      })),
    outgoingTransfer: unit.outgoing_billing_transfer
      ? {
          id: unit.outgoing_billing_transfer.id,
          nomineeName: unit.outgoing_billing_transfer.nominee?.name?.trim() || "Resident",
        }
      : null,
    ownershipId: unit.ownership_id,
    canPay: Boolean(unit.landlord_can_pay_bills),
  }));
}

export default function LandlordPropertiesPage() {
  const {
    payload,
    loading,
    error,
    communities,
    selectedCommunityId,
    setSelectedCommunityId,
    load,
  } = useLandlordPortfolio();

  const [claimOpen, setClaimOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const owned = payload?.owned_units?.length
    ? payload.owned_units
    : (payload?.access.owned_units ?? payload?.landlord_units ?? []);
  const pendingClaims = payload?.pending_claims ?? [];
  const stats = payload?.dashboard_stats;

  const rows = useMemo(() => {
    const approved = ownedRows(owned).sort((a, b) =>
      a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true }),
    );
    const pending: PropertyRow[] = pendingClaims.map((claim) => ({
      key: `pending-${claim.id}`,
      unitNumber: claim.unit_number,
      phase: "pending",
      occupancy: claim.occupancy,
      residentCount: 0,
      residentNames: [],
      billingContact: null,
      claimedAt: claim.created_at ?? null,
      unitId: claim.unit_id,
      isBillingContact: false,
      nominees: [],
      unitResidents: [],
      outgoingTransfer: null,
      canPay: false,
    }));
    return [...approved, ...pending];
  }, [owned, pendingClaims]);

  async function submitClaim(draft: ClaimUnitDraft) {
    setSubmitting(true);
    setFieldErrors({});
    try {
      let proofUrl = "";
      if (draft.proofFile) {
        const uploaded = await uploadUtilityBill(draft.proofFile);
        proofUrl = uploaded.utility_bill_url;
      }
      if (!proofUrl) {
        setFieldErrors({ proof_url: "Upload an ownership proof." });
        setSubmitting(false);
        return;
      }
      await claimLandlordOwnership({
        unit_number: draft.unitNumber.trim(),
        is_new_unit: draft.isNewUnit,
        occupancy: draft.occupancy,
        community_id: selectedCommunityId,
        proof_url: proofUrl,
      });
      toastSuccess("Ownership claim submitted for admin review.");
      setClaimOpen(false);
      await load();
    } catch (err) {
      const fields = apiFieldErrors(err);
      if (Object.keys(fields).length) {
        setFieldErrors(fields);
      } else {
        toastError(apiError(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function changeOccupancy(ownershipId: number, next: LandlordOccupancy) {
    await updateLandlordOccupancy(ownershipId, next, selectedCommunityId);
    toastSuccess("Unit status updated.");
    await load();
  }

  async function requestTransfer(unitId: number, nomineeUserId: number) {
    await requestBillingContactTransfer(unitId, nomineeUserId);
    toastSuccess("Billing contact request sent.");
    await load();
  }

  async function cancelTransfer(requestId: number) {
    await cancelBillingContactTransfer(requestId);
    toastSuccess("Billing contact request withdrawn.");
    await load();
  }

  if (loading) return <LandlordPropertiesSkeleton />;
  if (error && !payload) return <PageError message={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-4">
      {communities.length > 1 ? (
        <label className="block max-w-xs text-sm">
          <span className="mb-1 block text-[12px] font-medium text-slate-500">Community</span>
          <select
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            value={selectedCommunityId ?? ""}
            onChange={(event) => setSelectedCommunityId(Number(event.target.value))}
          >
            {communities.map((community) => (
              <option key={community.id} value={community.id}>
                {community.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <LandlordPropertiesView
        totalOwned={stats?.total_owned_units ?? owned.length}
        rented={stats?.rented_units ?? owned.filter((unit) => unit.occupancy === "rented").length}
        vacant={stats?.vacant_units ?? owned.filter((unit) => unit.occupancy === "vacant").length}
        pending={pendingClaims.length}
        livingIn={stats?.self_occupied_units ?? owned.filter((unit) => unit.occupancy === "live_here").length}
        rows={rows}
        occupancyOptions={OCCUPANCY_OPTIONS}
        onOccupancyChange={changeOccupancy}
        onRequestBillingTransfer={requestTransfer}
        onCancelBillingTransfer={cancelTransfer}
        headerAction={(
          <button
            type="button"
            onClick={() => setClaimOpen(true)}
            className="rounded-lg bg-[#1B4F8A] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#163f6e]"
          >
            Claim a unit
          </button>
        )}
        claimForm={(
          <ClaimUnitDialog
            open={claimOpen}
            submitting={submitting}
            communityId={selectedCommunityId ?? communities[0]?.id}
            unavailableUnitNumbers={rows.map((row) => row.unitNumber)}
            fieldErrors={fieldErrors}
            onClose={() => {
              if (!submitting) setClaimOpen(false);
            }}
            onSubmit={(draft) => void submitClaim(draft)}
          />
        )}
      />
    </div>
  );
}
