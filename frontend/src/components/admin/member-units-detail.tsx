"use client";

import type { ReactNode } from "react";
import { Building2, FileText, Home, KeyRound } from "lucide-react";
import { UtilityBillPreview } from "@/components/admin/utility-bill-preview";
import { statusLabel, type MembershipStatus } from "@/lib/api/members";

export type MemberUnitDetail = {
  id?: number | null;
  unit_number: string;
  association_status?: string | null;
  is_billing_contact?: boolean;
  residence_type?: string | null;
  utility_bill_url?: string | null;
  occupancy?: "live_here" | "rented" | "vacant" | string | null;
  approval_status?: "pending" | "approved" | "rejected" | string | null;
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

function occupancyMeta(value?: string | null): {
  label: string;
  badgeClass: string;
  accentClass: string;
  icon: typeof Home;
} {
  switch (value) {
    case "vacant":
      return {
        label: "Vacant",
        badgeClass: "bg-amber-50 text-amber-900 ring-amber-200/90",
        accentClass: "border-l-amber-400",
        icon: KeyRound,
      };
    case "rented":
      return {
        label: "Rented out",
        badgeClass: "bg-sky-50 text-sky-900 ring-sky-200/90",
        accentClass: "border-l-sky-500",
        icon: Building2,
      };
    case "live_here":
      return {
        label: "Lives here",
        badgeClass: "bg-emerald-50 text-emerald-900 ring-emerald-200/90",
        accentClass: "border-l-emerald-500",
        icon: Home,
      };
    default:
      return {
        label: "—",
        badgeClass: "bg-slate-100 text-slate-600 ring-slate-200/90",
        accentClass: "border-l-slate-300",
        icon: Home,
      };
  }
}

function approvalMeta(value?: string | null): { label: string } {
  switch (value) {
    case "approved":
      return { label: "Approved" };
    case "pending":
      return { label: "Pending" };
    case "rejected":
      return { label: "Rejected" };
    default:
      return { label: "—" };
  }
}

function associationStatusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Pending review";
    case "invite":
      return "Invited";
    case "rejected":
      return "Rejected";
    case "left":
      return "Left";
    case "ownership":
      return "Landlord ownership";
    case "active":
      return "Active residence";
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

type MemberUnitsDetailProps = {
  units?: MemberUnitDetail[] | null;
  communities?: MemberCommunityDetail[] | null;
  fallbackUnitNumber?: string | null;
  fallbackResidenceType?: string | null;
  fallbackUtilityBillUrl?: string | null;
  busyPackageId?: number | null;
  onApprovePackage?: (packageId: number, unitNumber: string, communityId?: number | null) => void;
  onRejectPackage?: (packageId: number, unitNumber: string, communityId?: number | null) => void;
};

function StatChip({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`min-w-0 flex-1 rounded-lg border border-slate-100 bg-white px-2.5 py-2 ${className}`}>
      <p className="text-[9px] font-semibold uppercase tracking-[0.06em] text-slate-400">{label}</p>
      <p className="mt-0.5 truncate text-[12px] font-semibold text-slate-800">{value}</p>
    </div>
  );
}

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
  onApprovePackage?: (packageId: number, unitNumber: string, communityId?: number | null) => void;
  onRejectPackage?: (packageId: number, unitNumber: string, communityId?: number | null) => void;
}) {
  const pendingPackageId =
    unit.association_status === "pending" && unit.package_id ? Number(unit.package_id) : null;
  const showReview = pendingPackageId !== null && (onApprovePackage || onRejectPackage);
  const busy = busyPackageId !== null && busyPackageId === pendingPackageId;

  const occ = occupancyMeta(unit.occupancy);
  const OccIcon = occ.icon;
  const isOwnership = unit.association_status === "ownership";
  const accent =
    isOwnership && unit.occupancy
      ? occ.accentClass
      : unit.association_status === "active"
        ? "border-l-emerald-500"
        : unit.association_status === "pending"
          ? "border-l-amber-400"
          : occ.accentClass;

  const approval = approvalMeta(unit.approval_status);
  const residence = unit.residence_type || fallbackResidenceType || "—";
  const hasDoc = Boolean(unit.utility_bill_url || (showFallbackBill && fallbackUtilityBillUrl));

  return (
    <article
      key={`${unit.id ?? unit.unit_number}-${index}`}
      className={`overflow-hidden rounded-xl border border-slate-200/90 border-l-[3px] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] ${accent}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#E8F1FB] text-[#1B4F8A]">
              <OccIcon className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            </span>
            <div>
              <p className="font-mono text-[17px] font-bold leading-none tracking-tight text-slate-900">{unit.unit_number}</p>
              <p className="mt-1 text-[11px] font-medium text-slate-500">
                {unit.association_status ? associationStatusLabel(unit.association_status) : "Unit"}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {unit.occupancy ? (
            <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${occ.badgeClass}`}>
              {occ.label}
            </span>
          ) : null}
          {unit.is_billing_contact ? (
            <span className="rounded-md bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-800 ring-1 ring-inset ring-teal-100">
              Billing
            </span>
          ) : null}
          {unit.association_status &&
          unit.association_status !== "active" &&
          unit.association_status !== "ownership" &&
          !unit.approval_status ? (
            <span
              className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${
                unit.association_status === "rejected"
                  ? "bg-rose-50 text-rose-700 ring-rose-100"
                  : "bg-amber-50 text-amber-800 ring-amber-100"
              }`}
            >
              {associationStatusLabel(unit.association_status)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3">
        <StatChip label="Occupancy" value={unit.occupancy ? occ.label : "—"} />
        <StatChip label="Approval" value={approval.label} />
        <StatChip label="Residence type" value={String(residence)} />
      </div>

      <div className="border-t border-slate-100 px-4 py-3.5">
        <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-400">
          <FileText className="h-3.5 w-3.5" aria-hidden />
          Proof & documents
        </p>
        {hasDoc ? (
          <div className="overflow-hidden rounded-lg border border-slate-200/80 bg-slate-50/50 p-2">
            <UtilityBillPreview
              url={unit.utility_bill_url || (showFallbackBill ? fallbackUtilityBillUrl : null) || null}
              compact
            />
          </div>
        ) : isOwnership ? (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-3 py-2.5 text-[12px] text-slate-500">
            No residency document — landlord ownership record.
          </p>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/80 p-2">
            <UtilityBillPreview url={null} compact />
          </div>
        )}

        {showReview && pendingPackageId ? (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
            {onApprovePackage ? (
              <button
                type="button"
                className="nl-btn-primary !px-3 !py-1.5 !text-[12px]"
                disabled={busy}
                onClick={() => onApprovePackage(pendingPackageId, unit.unit_number, unit.community_id)}
              >
                {busy ? "Working…" : "Approve request"}
              </button>
            ) : null}
            {onRejectPackage ? (
              <button
                type="button"
                className="nl-btn-secondary !border-red-200 !px-3 !py-1.5 !text-[12px] !text-red-700 hover:!bg-red-50"
                disabled={busy}
                onClick={() => onRejectPackage(pendingPackageId, unit.unit_number, unit.community_id)}
              >
                Reject
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function ProfileRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-slate-50 pb-2 last:border-0 sm:flex-row sm:gap-3">
      <span className="w-full shrink-0 text-[12px] font-semibold text-slate-500 sm:w-24">{label}</span>
      <span className="min-w-0 break-words text-[13px] text-slate-800">{value || "—"}</span>
    </div>
  );
}

function UnitsSectionShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-b from-slate-50/40 to-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-100 bg-white/80 px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#E8F1FB] text-[#1B4F8A]">
          <Building2 className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        </span>
        <h4 className="text-[12px] font-bold uppercase tracking-[0.08em] text-slate-600">{title}</h4>
      </div>
      <div className="space-y-3 p-4">{children}</div>
    </section>
  );
}

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
      <div className="space-y-4">
        {communityRows.map((community, communityIndex) => {
          const communityUnits = community.units ?? [];
          return (
            <div
              key={`${community.id ?? community.name ?? "community"}-${communityIndex}`}
              className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
                <p className="text-[13px] font-bold text-slate-900">{community.name?.trim() || "Community"}</p>
                {community.status ? (
                  <span className="rounded-full bg-white px-2.5 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200/80">
                    {statusLabel(community.status as MembershipStatus)}
                  </span>
                ) : null}
              </div>
              <div className="space-y-3 p-4">
                {communityUnits.length === 0 ? (
                  <p className="text-center text-[12.5px] text-slate-400">No units in this community</p>
                ) : (
                  communityUnits.map((unit, index) => (
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
                  ))
                )}
              </div>
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
    return (
      <UnitsSectionShell title="Units & properties">
        <p className="py-4 text-center text-[13px] text-slate-500">No approved units linked yet.</p>
      </UnitsSectionShell>
    );
  }

  return (
    <UnitsSectionShell title={unitRows.length > 1 ? "Units & properties" : "Unit & property"}>
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
    </UnitsSectionShell>
  );
}

export { ProfileRow };