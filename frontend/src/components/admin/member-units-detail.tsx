"use client";

import type { ReactNode } from "react";
import { UtilityBillPreview } from "@/components/admin/utility-bill-preview";
import { statusLabel, type MembershipStatus } from "@/lib/api/members";

export type MemberUnitDetail = {
  id?: number | null;
  unit_number: string;
  association_status?: string | null;
  is_billing_contact?: boolean;
  residence_type?: string | null;
  utility_bill_url?: string | null;
  /** Pending registration package id — enables Approve/Reject in profile. */
  package_id?: number | null;
  community_id?: number | null;
  community_name?: string | null;
};

export type MemberCommunityDetail = {
  id?: number | null;
  name?: string | null;
  status?: MembershipStatus | string | null;
  membership_id?: number | null;
  units?: MemberUnitDetail[] | null;
};

function ProfileRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-slate-50 pb-2 last:border-0 sm:flex-row sm:gap-3">
      <span className="w-full shrink-0 text-[12px] font-semibold text-slate-500 sm:w-24">{label}</span>
      <span className="min-w-0 break-words text-[13px] text-slate-800">{value || "—"}</span>
    </div>
  );
}

type MemberUnitsDetailProps = {
  units?: MemberUnitDetail[] | null;
  communities?: MemberCommunityDetail[] | null;
  fallbackUnitNumber?: string | null;
  fallbackResidenceType?: string | null;
  fallbackUtilityBillUrl?: string | null;
  busyPackageId?: number | null;
  onApprovePackage?: (packageId: number, unitNumber: string) => void;
  onRejectPackage?: (packageId: number, unitNumber: string) => void;
};

function UnitDetailCard({
  unit,
  index,
  fallbackResidenceType,
  fallbackUtilityBillUrl,
  showFallbackBill,
  busyPackageId,
  onApprovePackage,
  onRejectPackage,
}: {
  unit: MemberUnitDetail;
  index: number;
  fallbackResidenceType?: string | null;
  fallbackUtilityBillUrl?: string | null;
  showFallbackBill: boolean;
  busyPackageId?: number | null;
  onApprovePackage?: (packageId: number, unitNumber: string) => void;
  onRejectPackage?: (packageId: number, unitNumber: string) => void;
}) {
  const pendingPackageId =
    unit.association_status === "pending" && unit.package_id ? Number(unit.package_id) : null;
  const showReview = pendingPackageId !== null && (onApprovePackage || onRejectPackage);
  const busy = busyPackageId !== null && busyPackageId === pendingPackageId;

  return (
    <div
      key={`${unit.id ?? unit.unit_number}-${index}`}
      className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[13px] font-semibold text-slate-900">{unit.unit_number}</span>
        {unit.is_billing_contact ? (
          <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-700">
            Billing contact
          </span>
        ) : null}
        {unit.association_status && unit.association_status !== "active" ? (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${
              unit.association_status === "rejected"
                ? "bg-rose-50 text-rose-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            {unit.association_status}
          </span>
        ) : null}
      </div>
      <div className="mt-2 space-y-2">
        <ProfileRow
          label="Residence"
          value={unit.residence_type || fallbackResidenceType || "—"}
        />
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Utility bill / lease
          </p>
          <UtilityBillPreview
            url={unit.utility_bill_url || (showFallbackBill ? fallbackUtilityBillUrl : null) || null}
            compact
          />
        </div>
        {showReview && pendingPackageId ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {onApprovePackage ? (
              <button
                type="button"
                className="nl-btn-primary !px-3 !py-1.5 !text-[12px]"
                disabled={busy}
                onClick={() => onApprovePackage(pendingPackageId, unit.unit_number)}
              >
                {busy ? "Working…" : "Approve"}
              </button>
            ) : null}
            {onRejectPackage ? (
              <button
                type="button"
                className="nl-btn-secondary !border-red-200 !px-3 !py-1.5 !text-[12px] !text-red-700 hover:!bg-red-50"
                disabled={busy}
                onClick={() => onRejectPackage(pendingPackageId, unit.unit_number)}
              >
                Reject
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Profile / detail panel: one card per unit with residence + utility bill.
 * When `communities` is provided, units are grouped under each community.
 */
export function MemberUnitsDetail({
  units,
  communities,
  fallbackUnitNumber,
  fallbackResidenceType,
  fallbackUtilityBillUrl,
  busyPackageId = null,
  onApprovePackage,
  onRejectPackage,
}: MemberUnitsDetailProps) {
  const communityRows = (communities ?? []).filter(
    (community) => community?.id || community?.name || (community?.units ?? []).length > 0,
  );

  if (communityRows.length > 0) {
    return (
      <div className="space-y-3 pt-1">
        {communityRows.map((community, communityIndex) => {
          const communityUnits = community.units ?? [];
          return (
            <div
              key={`${community.id ?? community.name ?? "community"}-${communityIndex}`}
              className="rounded-xl border border-slate-200 bg-white px-3 py-3"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <p className="text-[13px] font-semibold text-slate-900">
                  {community.name?.trim() || "Community"}
                </p>
                {community.status ? (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                    {statusLabel(community.status as MembershipStatus)}
                  </span>
                ) : null}
              </div>
              {communityUnits.length === 0 ? (
                <p className="text-[12.5px] text-slate-400">No units in this community</p>
              ) : (
                <div className="space-y-2">
                  {communityUnits.map((unit, index) => (
                    <UnitDetailCard
                      key={`${unit.id ?? unit.unit_number}-${index}`}
                      unit={unit}
                      index={index}
                      fallbackResidenceType={fallbackResidenceType}
                      fallbackUtilityBillUrl={fallbackUtilityBillUrl}
                      showFallbackBill={communityRows.length === 1 && communityUnits.length === 1}
                      busyPackageId={busyPackageId}
                      onApprovePackage={onApprovePackage}
                      onRejectPackage={onRejectPackage}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  const unitRows: MemberUnitDetail[] =
    units && units.length > 0
      ? units
      : fallbackUnitNumber
        ? [
            {
              id: null,
              unit_number: fallbackUnitNumber,
              association_status: "active",
              is_billing_contact: false,
              residence_type: fallbackResidenceType,
              utility_bill_url: fallbackUtilityBillUrl,
            },
          ]
        : [];

  if (unitRows.length === 0) {
    return <ProfileRow label="Unit" value="—" />;
  }

  return (
    <div className="space-y-3 pt-1">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {unitRows.length > 1 ? "Units" : "Unit"}
      </p>
      {unitRows.map((unit, index) => (
        <UnitDetailCard
          key={`${unit.id ?? unit.unit_number}-${index}`}
          unit={unit}
          index={index}
          fallbackResidenceType={fallbackResidenceType}
          fallbackUtilityBillUrl={fallbackUtilityBillUrl}
          showFallbackBill={unitRows.length === 1}
          busyPackageId={busyPackageId}
          onApprovePackage={onApprovePackage}
          onRejectPackage={onRejectPackage}
        />
      ))}
    </div>
  );
}
