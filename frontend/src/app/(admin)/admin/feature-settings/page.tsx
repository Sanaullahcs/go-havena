"use client";

import { useCallback, useEffect, useState } from "react";
import { FEATURES_UPDATED_EVENT, refreshFeatureSession } from "@/components/auth/feature-settings-sync";
import { fetchMyResidentFeatures, requestFeatureDisable, requestFeatureEnable } from "@/lib/api/resident-features";
import { apiError } from "@/lib/api/client";
import { getUser } from "@/lib/auth/session";
import {
  communityAdjustCatalog,
  featureRequestActionLabel,
  featureRequestStatusLabel,
  flagsFromPayload,
  groupedCatalog,
  type FeatureDisableRequest,
  type ResidentFeatureItem,
} from "@/lib/resident-features";
import { PageError, PageLoader } from "@/components/shared/page-states";
import { toastError, toastSuccess } from "@/lib/alert";

export default function AdjustFeaturesPage() {
  const [catalog, setCatalog] = useState<ResidentFeatureItem[]>([]);
  const [values, setValues] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<FeatureDisableRequest[]>([]);
  const [requests, setRequests] = useState<FeatureDisableRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<ResidentFeatureItem | null>(null);
  const [requestMode, setRequestMode] = useState<"disable" | "enable">("disable");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const applyPayload = (payload: Awaited<ReturnType<typeof fetchMyResidentFeatures>>) => {
    const catalog = communityAdjustCatalog(payload);
    setCatalog(catalog);
    setValues(flagsFromPayload({ ...payload, catalog }));
    setPending(payload.pending_requests ?? []);
    setRequests(payload.requests ?? payload.pending_requests ?? []);
  };

  const load = useCallback(async (silent = false) => {
    try {
      applyPayload(await fetchMyResidentFeatures());
      setError(null);
    } catch (err) {
      if (!silent) setError(apiError(err));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const sync = () => {
      const cached = getUser()?.resident_features;
      if (cached) applyPayload(cached);
      void load(true);
    };
    window.addEventListener(FEATURES_UPDATED_EVENT, sync);
    return () => window.removeEventListener(FEATURES_UPDATED_EVENT, sync);
  }, [load]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 8000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const pendingFor = (key: string) => pending.find((item) => item.feature_key === key && item.status === "pending");
  const latestFor = (key: string) => requests.find((item) => item.feature_key === key);

  const onToggle = (feature: ResidentFeatureItem, next: boolean) => {
    const current = values[feature.key] !== false;
    if (next === current || pendingFor(feature.key) || submitting) return;
    if (next) {
      if (feature.disabled_by !== "community_admin") return;
      setRequestMode("enable");
    } else {
      setRequestMode("disable");
    }
    setTarget(feature);
    setReason("");
  };

  const submit = async () => {
    if (!target) return;
    const text = reason.trim();
    if (text.length < 3) {
      toastError("Please provide a reason for this request.");
      return;
    }
    setSubmitting(true);
    try {
      const result = requestMode === "enable"
        ? await requestFeatureEnable(target.key, text)
        : await requestFeatureDisable(target.key, text);
      applyPayload(result.features);
      setTarget(null);
      toastSuccess(
        requestMode === "enable"
          ? "Request sent. The feature stays off until a system administrator approves it."
          : "Request sent. The feature stays on until a system administrator approves it.",
      );
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <PageLoader variant="cards" />;
  if (error && catalog.length === 0) return <PageError message={error} />;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <p className="nl-eyebrow" style={{ color: "#1B4F8A" }}>Settings</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Adjust Features</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Turning a feature off or back on sends a request to the system administrator. It stays in its current state until that request is approved.
          Features turned off by a system administrator are hidden here.
        </p>
      </div>

      {groupedCatalog(catalog).map((group) => (
        <section key={group.group} className="space-y-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{group.group_label}</p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {group.features.map((feature) => {
              const enabled = values[feature.key] !== false;
              const request = pendingFor(feature.key);
              const latest = request ?? latestFor(feature.key);
              const canReenable = !enabled && feature.disabled_by === "community_admin";
              const locked = Boolean(request) || submitting || (!enabled && !canReenable);
              return (
                <div key={feature.key} className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold text-slate-900">{feature.label}</p>
                    <p className="mt-0.5 text-[12.5px] leading-snug text-slate-500">{feature.description}</p>
                    {latest ? (
                      <p className={["mt-2 text-[12px] font-semibold", latest.status === "approved" ? "text-emerald-700" : latest.status === "rejected" ? "text-rose-700" : "text-amber-700"].join(" ")}>
                        {featureRequestActionLabel(latest.action)} · {featureRequestStatusLabel(latest.status)}
                      </p>
                    ) : null}
                    {canReenable && !request ? (
                      <p className="mt-2 text-[12px] font-semibold text-slate-500">Off — request to turn this back on</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    disabled={locked}
                    onClick={() => onToggle(feature, !enabled)}
                    className={[
                      "relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition",
                      enabled ? "bg-[#1B4F8A]" : "bg-slate-300",
                      locked ? "cursor-not-allowed opacity-70" : "cursor-pointer",
                    ].join(" ")}
                  >
                    <span className={["absolute top-0.5 h-5 w-5 rounded-full bg-white transition", enabled ? "left-5" : "left-0.5"].join(" ")} />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <section className="space-y-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Feature requests</p>
        {requests.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
            Requests you send show up here as Pending, Approved, or Rejected.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {requests.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-4 border-t border-slate-100 px-4 py-3 first:border-t-0">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-slate-900">{item.feature_name}</p>
                  <p className="mt-0.5 text-[12.5px] text-slate-500">{featureRequestActionLabel(item.action)} request</p>
                  {item.reason ? <p className="mt-1 whitespace-pre-wrap break-words text-[12.5px] text-slate-600 [overflow-wrap:anywhere]">{item.reason}</p> : null}
                </div>
                <div className="shrink-0 text-right">
                  <p className={["text-[12px] font-semibold", item.status === "approved" ? "text-emerald-700" : item.status === "rejected" ? "text-rose-700" : "text-amber-700"].join(" ")}>
                    {featureRequestStatusLabel(item.status)}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">{item.requested_at ? new Date(item.requested_at).toLocaleString() : ""}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {target ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900">{requestMode === "enable" ? "Enable" : "Disable"} {target.label}?</h2>
            <p className="mt-1 text-sm text-slate-500">Please provide a reason for this request. It stays {requestMode === "enable" ? "off" : "on"} until a system administrator approves it.</p>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="Reason / Description"
              className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#1B4F8A]"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="nl-btn-secondary" disabled={submitting} onClick={() => setTarget(null)}>
                Cancel
              </button>
              <button type="button" className="nl-btn-primary" disabled={submitting} onClick={() => void submit()}>
                {submitting ? "Submitting…" : "Submit Request"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
