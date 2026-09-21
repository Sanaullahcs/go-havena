"use client";

import { useEffect, useState } from "react";
import { ResidentFeatureToggles } from "@/components/admin/resident-feature-toggles";
import {
  fetchCommunityResidentFeatures,
  saveCommunityResidentFeatures,
} from "@/lib/api/resident-features";
import { apiError } from "@/lib/api/client";
import { flagsFromPayload, type ResidentFeatureItem } from "@/lib/resident-features";
import { toastError, toastSuccess } from "@/lib/alert";

export function AdjustFeatureSetModal({
  communityId,
  communityName,
  onClose,
}: {
  communityId: number;
  communityName: string;
  onClose: () => void;
}) {
  const [catalog, setCatalog] = useState<ResidentFeatureItem[]>([]);
  const [values, setValues] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchCommunityResidentFeatures(communityId)
      .then((payload) => {
        if (cancelled) return;
        setCatalog(payload.catalog ?? []);
        setValues(flagsFromPayload(payload));
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(apiError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [communityId]);

  const onSave = async () => {
    setSaving(true);
    try {
      const payload = await saveCommunityResidentFeatures(communityId, values);
      setValues(flagsFromPayload(payload));
      toastSuccess("Feature set updated.");
      onClose();
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex shrink-0 items-start justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-600">Adjust Feature Set</p>
            <h3 className="text-[15px] font-bold text-slate-900">{communityName}</h3>
            <p className="mt-0.5 text-[12.5px] text-slate-500">
              Enable or disable resident modules for this community. All features are on by default.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <p className="text-sm text-slate-500">Loading current feature set…</p>
          ) : error ? (
            <p className="text-sm font-medium text-red-600">{error}</p>
          ) : (
            <ResidentFeatureToggles
              catalog={catalog}
              values={values}
              onChange={(key, enabled) => setValues((current) => ({ ...current, [key]: enabled }))}
              disabled={saving}
            />
          )}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 bg-white px-6 py-4">
          <button type="button" onClick={onClose} className="nl-btn-secondary" disabled={saving}>
            Cancel
          </button>
          <button type="button" onClick={() => void onSave()} className="nl-btn-primary" disabled={saving || loading || Boolean(error)}>
            {saving ? "Saving…" : "Save feature set"}
          </button>
        </div>
      </div>
    </div>
  );
}
