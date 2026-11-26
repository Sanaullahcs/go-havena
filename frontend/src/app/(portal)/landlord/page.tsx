"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageLoader, PageError } from "@/components/shared/page-states";
import { apiError, apiFieldErrors } from "@/lib/api/client";
import { toastError, toastSuccess } from "@/lib/alert";
import { getUser } from "@/lib/auth/session";
import {
  billStatusLabel,
  claimLandlordOwnership,
  decideLandlordAdvisory,
  fetchLandlordPortfolio,
  occupancyLabel,
  updateLandlordOccupancy,
  type LandlordOccupancy,
  type LandlordPortfolioPayload,
} from "@/lib/api/landlord";
import { uploadUtilityBill } from "@/lib/api/profile";

const OCCUPANCY_OPTIONS: LandlordOccupancy[] = ["live_here", "rented", "vacant"];

export default function LandlordDashboardPage() {
  const communityId = getUser()?.active_context_community_id ?? undefined;
  const [payload, setPayload] = useState<LandlordPortfolioPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimOpen, setClaimOpen] = useState(false);
  const [unitNumber, setUnitNumber] = useState("");
  const [isNewUnit, setIsNewUnit] = useState(true);
  const [occupancy, setOccupancy] = useState<LandlordOccupancy>("rented");
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [communities, setCommunities] = useState<Array<{ id: number; name: string }>>([]);
  const [selectedCommunityId, setSelectedCommunityId] = useState<number | undefined>(communityId);
  const [proofFile, setProofFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchLandlordPortfolio(selectedCommunityId);
      setPayload(res.data);
      setCommunities(res.meta.landlord_communities ?? []);
      if (!selectedCommunityId && res.meta.landlord_communities?.[0]) {
        setSelectedCommunityId(res.meta.landlord_communities[0].id);
      }
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }, [selectedCommunityId]);

  useEffect(() => {
    void load();
  }, [load]);

  const access = payload?.access;
  const showDashboard = Boolean(access?.landlord_dashboard || (payload?.pending_claims?.length ?? 0) > 0);

  const headline = useMemo(() => {
    if (!access) return "Landlord";
    if (access.landlord_dashboard && access.resident) return "Landlord & resident";
    if (access.landlord_dashboard) return "Landlord portfolio";
    return "Become a landlord";
  }, [access]);

  async function submitClaim() {
    setSubmitting(true);
    setFieldErrors({});
    try {
      let proofUrl = "";
      if (proofFile) {
        const uploaded = await uploadUtilityBill(proofFile);
        proofUrl = uploaded.utility_bill_url;
      }
      if (!proofUrl) {
        setFieldErrors({ proof_url: "Upload an ownership proof." });
        setSubmitting(false);
        return;
      }
      await claimLandlordOwnership({
        unit_number: unitNumber.trim(),
        is_new_unit: isNewUnit,
        occupancy,
        community_id: selectedCommunityId,
        proof_url: proofUrl,
      });
      toastSuccess("Ownership claim submitted for admin review.");
      setClaimOpen(false);
      setUnitNumber("");
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

  if (loading) return <PageLoader label="Loading landlord portfolio…" />;
  if (error) return <PageError message={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Landlord</p>
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{headline}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Manage units you own in this community. Rented units show resident rosters and bill status (view-only). Vacant and
            owner-occupied units you own can be paid from here when approved.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setClaimOpen((v) => !v)}
            className="rounded-lg bg-[#1B4F8A] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#163f6e]"
          >
            {claimOpen ? "Close claim form" : showDashboard ? "Claim another unit" : "Become a landlord"}
          </button>
          <Link
            href="/property"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Property & bills
          </Link>
        </div>
      </div>

      {communities.length > 1 ? (
        <label className="block max-w-sm text-sm">
          <span className="mb-1 block font-medium text-slate-700">Landlord community</span>
          <select
            className="w-full rounded-lg border border-slate-200 px-3 py-2"
            value={selectedCommunityId ?? ""}
            onChange={(e) => setSelectedCommunityId(Number(e.target.value))}
          >
            {communities.map((community) => (
              <option key={community.id} value={community.id}>
                {community.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {(payload?.advisory_reviews?.length ?? 0) > 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Tenant requests (advisory)</h2>
          <p className="mt-1 text-xs text-slate-500">Your decision does not block the community admin.</p>
          <ul className="mt-3 space-y-2">
            {payload!.advisory_reviews!.map((review) => (
              <li key={review.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span>
                  Unit {review.unit_number}: {review.display_name || review.email}
                  {review.resident_status ? ` · ${review.resident_status}` : ""}
                </span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white"
                    onClick={() => void decideLandlordAdvisory(review.id, "approved").then(() => load())}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold"
                    onClick={() => void decideLandlordAdvisory(review.id, "rejected", "Not recognized").then(() => load())}
                  >
                    Reject
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {claimOpen ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-sm font-semibold text-slate-900">Claim unit ownership</h2>
          <p className="mt-1 text-sm text-slate-500">An admin must approve before landlord tools apply to this unit.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium text-slate-700">Unit number</span>
              <input
                value={unitNumber}
                onChange={(e) => setUnitNumber(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="e.g. 302"
              />
              {fieldErrors.unit_number ? (
                <span className="mt-1 block text-xs text-red-600">{fieldErrors.unit_number}</span>
              ) : null}
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={isNewUnit} onChange={(e) => setIsNewUnit(e.target.checked)} />
              This is a new unit not yet in the directory
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Ownership proof</span>
              <input type="file" accept="image/*,.pdf" onChange={(e) => setProofFile(e.target.files?.[0] ?? null)} />
              {fieldErrors.proof_url ? <span className="mt-1 block text-xs text-red-600">{fieldErrors.proof_url}</span> : null}
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">How is this unit used?</span>
              <select
                value={occupancy}
                onChange={(e) => setOccupancy(e.target.value as LandlordOccupancy)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {OCCUPANCY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {occupancyLabel(opt)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            disabled={submitting || !unitNumber.trim()}
            onClick={() => void submitClaim()}
            className="mt-4 rounded-lg bg-[#1B4F8A] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit for review"}
          </button>
        </section>
      ) : null}

      {(payload?.pending_claims?.length ?? 0) > 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
          <h2 className="text-sm font-semibold text-amber-900">Pending admin review</h2>
          <ul className="mt-2 space-y-1 text-sm text-amber-900/90">
            {payload!.pending_claims.map((row) => (
              <li key={row.id}>
                Unit <strong>{row.unit_number}</strong> · {occupancyLabel(row.occupancy)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!showDashboard ? (
        <section className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
          <p className="text-sm text-slate-600">
            You do not have approved landlord units in this community yet. Use <strong>Become a landlord</strong> to claim a unit.
          </p>
        </section>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
            <h2 className="text-sm font-semibold text-slate-900">Your owned units</h2>
            <p className="text-xs text-slate-500">{access?.landlord_unit_count ?? 0} approved</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Unit</th>
                  <th className="px-4 py-3 font-semibold">Occupancy</th>
                  <th className="px-4 py-3 font-semibold">Residents</th>
                  <th className="px-4 py-3 font-semibold">Bills</th>
                  <th className="px-4 py-3 font-semibold">Pay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(payload?.landlord_units ?? []).map((unit) => (
                  <tr key={unit.unit_id} className="text-slate-700">
                    <td className="px-4 py-3 font-medium text-slate-900">{unit.unit_number}</td>
                    <td className="px-4 py-3">
                      <select
                        className="rounded border border-slate-200 px-2 py-1 text-xs"
                        value={unit.occupancy}
                        onChange={(e) => {
                          if (!unit.ownership_id) return;
                          void updateLandlordOccupancy(unit.ownership_id, e.target.value as LandlordOccupancy, selectedCommunityId)
                            .then(() => load())
                            .catch((err) => toastError(apiError(err)));
                        }}
                      >
                        {OCCUPANCY_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>{occupancyLabel(opt)}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      {unit.occupancy === "rented" ? (
                        <div>
                          <div className="text-xs text-slate-500">
                            Billing contact: {unit.billing_contact?.name || "Not set"}
                          </div>
                          <ul className="mt-1 space-y-0.5">
                            {(unit.residents ?? []).map((person) => (
                              <li key={person.id}>
                                {person.name || person.email} · {person.status}
                                {person.is_billing_contact ? " · billing" : ""}
                              </li>
                            ))}
                            {(unit.residents ?? []).length === 0 ? <li className="text-slate-400">No residents yet</li> : null}
                          </ul>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {billStatusLabel(unit.bill_status)}
                      {unit.bill_status?.detail === "view_only" ? (
                        <span className="ml-1 text-xs text-slate-400">(view only)</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      {unit.landlord_can_pay_bills ? (
                        <Link href="/property" className="text-[#1B4F8A] hover:underline">
                          Pay in Property
                        </Link>
                      ) : unit.landlord_bill_status_only ? (
                        <span className="text-xs text-slate-500">Cannot pay rented-unit bills here</span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}