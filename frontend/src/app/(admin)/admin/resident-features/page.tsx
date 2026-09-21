"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ResidentFeatureToggles } from "@/components/admin/resident-feature-toggles";
import { fetchMyResidentFeatures, saveMyResidentFeatures } from "@/lib/api/resident-features";
import { fetchMe, meToSessionUser } from "@/lib/api/profile";
import { apiError } from "@/lib/api/client";
import { communityAdminOnboardingPath } from "@/lib/admin/community-admin-onboarding";
import { getCommunityAdminNextStep, getUser, updateUser } from "@/lib/auth/session";
import { flagsFromPayload, type ResidentFeatureItem } from "@/lib/resident-features";
import { PageError, PageLoader } from "@/components/shared/page-states";

export default function ResidentFeaturesOnboardingPage() {
  const router = useRouter();
  const [catalog, setCatalog] = useState<ResidentFeatureItem[]>([]);
  const [values, setValues] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMyResidentFeatures()
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
  }, []);

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = await saveMyResidentFeatures(values);
      setCatalog(payload.catalog ?? catalog);
      setValues(flagsFromPayload(payload));
      const me = await fetchMe();
      updateUser({ ...meToSessionUser(me), resident_features: payload });
      const step = getCommunityAdminNextStep(getUser());
      router.replace(communityAdminOnboardingPath(step));
    } catch (err) {
      setError(apiError(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageLoader variant="cards" />;
  if (error && catalog.length === 0) return <PageError message={error} />;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <p className="nl-eyebrow" style={{ color: "#1B4F8A" }}>Community setup</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Resident Features</h1>
        <p className="mt-1 text-sm text-slate-500">
          Choose which modules residents in this community can use. All features are enabled by default.
          Turn off anything you do not want to offer.
        </p>
      </div>

      {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

      <ResidentFeatureToggles
        catalog={catalog}
        values={values}
        onChange={(key, enabled) => setValues((current) => ({ ...current, [key]: enabled }))}
        disabled={saving}
      />

      <div className="flex justify-end">
        <button type="button" onClick={() => void onSave()} disabled={saving} className="nl-btn-primary">
          {saving ? "Saving…" : "Save and continue"}
        </button>
      </div>
    </div>
  );
}
