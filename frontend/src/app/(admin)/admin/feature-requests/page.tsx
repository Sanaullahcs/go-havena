"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchFeatureDisableRequests, reviewFeatureDisableRequest } from "@/lib/api/resident-features";
import { apiError } from "@/lib/api/client";
import type { FeatureDisableRequest } from "@/lib/resident-features";
import { PageError, PageLoader } from "@/components/shared/page-states";
import { toastError, toastSuccess } from "@/lib/alert";

const REASON_PREVIEW_LENGTH = 180;

function formatWhen(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function reasonPreview(reason: string) {
  const text = reason.trim();
  if (text.length <= REASON_PREVIEW_LENGTH) return { preview: text, truncated: false };
  const cut = text.slice(0, REASON_PREVIEW_LENGTH);
  const boundary = cut.lastIndexOf(" ");
  const preview = (boundary > 80 ? cut.slice(0, boundary) : cut).trimEnd();
  return { preview: `${preview}…`, truncated: true };
}

export default function FeatureDisableRequestsPage() {
  const [rows, setRows] = useState<FeatureDisableRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [viewing, setViewing] = useState<FeatureDisableRequest | null>(null);
  const loadGeneration = useRef(0);

  const load = useCallback(async (silent = false) => {
    const generation = ++loadGeneration.current;
    if (!silent) setLoading(true);
    try {
      const next = await fetchFeatureDisableRequests("pending");
      if (generation !== loadGeneration.current) return;
      setRows(next);
      setError(null);
    } catch (err) {
      if (generation !== loadGeneration.current) return;
      if (!silent) setError(apiError(err));
    } finally {
      if (generation === loadGeneration.current && !silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 5000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const review = async (row: FeatureDisableRequest, decision: "approve" | "reject") => {
    const enabling = row.action === "enable";
    setBusyId(row.id);
    try {
      await reviewFeatureDisableRequest(row.id, decision);
      loadGeneration.current += 1;
      setRows((current) => current.filter((item) => item.id !== row.id));
      toastSuccess(
        decision === "approve"
          ? enabling
            ? "Feature turned on for that community."
            : "Feature turned off for that community."
          : enabling
            ? "Request rejected. The feature stays off."
            : "Request rejected. The feature stays on.",
      );
      void load(true);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <PageLoader variant="table" />;
  if (error) return <PageError message={error} />;

  return (
    <div className="space-y-5">
      <div>
        <p className="nl-eyebrow" style={{ color: "#1B4F8A" }}>System Admin</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Feature requests</h1>
        <p className="mt-1 text-sm text-slate-500">
          {rows.length === 0
            ? "No pending requests. New requests show up here automatically."
            : `${rows.length} pending ${rows.length === 1 ? "request" : "requests"}. Approving applies the requested change. Rejecting leaves the feature as it is.`}
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
          No pending requests.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[1200px] table-fixed text-left text-sm">
            <colgroup>
              <col style={{ width: "14%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "110px" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "280px" }} />
              <col style={{ width: "156px" }} />
              <col style={{ width: "96px" }} />
              <col style={{ width: "176px" }} />
            </colgroup>
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Community</th>
                <th className="px-4 py-3 font-semibold">Feature</th>
                <th className="px-4 py-3 font-semibold">Action</th>
                <th className="px-4 py-3 font-semibold">Requested by</th>
                <th className="px-4 py-3 font-semibold">Reason</th>
                <th className="px-4 py-3 font-semibold">Requested</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Review</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const reason = reasonPreview(row.reason || "");
                const enabling = row.action === "enable";
                return (
                <tr key={row.id} className="border-t border-slate-100 align-top">
                  <td className="overflow-hidden px-4 py-3 font-medium text-slate-900">
                    <span className="block break-words [overflow-wrap:anywhere]">{row.community_name || "—"}</span>
                  </td>
                  <td className="overflow-hidden px-4 py-3">
                    <span className="block break-words [overflow-wrap:anywhere]">{row.feature_name}</span>
                  </td>
                  <td className="overflow-hidden px-4 py-3 font-semibold text-slate-800">
                    {enabling ? "Enable" : "Disable"}
                  </td>
                  <td className="overflow-hidden px-4 py-3">
                    <span className="block break-words [overflow-wrap:anywhere]">{row.requested_by || "—"}</span>
                  </td>
                  <td className="max-w-[280px] overflow-hidden px-4 py-3 text-slate-600">
                    <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{reason.preview || "—"}</p>
                    {reason.truncated ? (
                      <button
                        type="button"
                        className="mt-1 text-xs font-semibold text-[#1B4F8A] hover:underline"
                        onClick={() => setViewing(row)}
                      >
                        View more
                      </button>
                    ) : null}
                  </td>
                  <td className="overflow-hidden px-4 py-3 text-slate-600">
                    <span className="block break-words [overflow-wrap:anywhere]">{formatWhen(row.requested_at)}</span>
                  </td>
                  <td className="overflow-hidden px-4 py-3 font-semibold capitalize text-amber-700">{row.status}</td>
                  <td className="overflow-hidden px-3 py-3">
                    <div className="flex flex-col items-stretch gap-2">
                      <button
                        type="button"
                        className="whitespace-nowrap rounded-lg bg-[#1B4F8A] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                        disabled={busyId === row.id}
                        onClick={() => void review(row, "approve")}
                      >
                        {enabling ? "Approve Enable" : "Approve Disable"}
                      </button>
                      <button
                        type="button"
                        className="whitespace-nowrap rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
                        disabled={busyId === row.id}
                        onClick={() => void review(row, "reject")}
                      >
                        Reject Request
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {viewing ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="feature-request-reason-title">
            <h2 id="feature-request-reason-title" className="text-lg font-bold text-slate-900">{viewing.action === "enable" ? "Enable" : "Disable"} reason</h2>
            <p className="mt-1 text-sm text-slate-500">
              {viewing.feature_name} · {viewing.community_name || "Community"}
            </p>
            <p className="mt-4 max-h-[50vh] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700 [overflow-wrap:anywhere]">
              {viewing.reason}
            </p>
            <div className="mt-5 flex justify-end">
              <button type="button" className="nl-btn-secondary" onClick={() => setViewing(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
