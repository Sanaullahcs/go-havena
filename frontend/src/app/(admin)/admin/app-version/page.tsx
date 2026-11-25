"use client";

import { ClearableInput } from "@/components/admin/clearable-field";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, Save, Send } from "lucide-react";
import { PageError, PageLoader } from "@/components/shared/page-states";
import { confirmAction, toastError, toastSuccess } from "@/lib/alert";
import { apiError } from "@/lib/api/client";
import {
  fetchAppVersionSettings,
  sendAppUpdateNotification,
  updateAppVersionSettings,
  type AppPlatformVersionSettings,
  type AppVersionSettings,
} from "@/lib/api/app-version";

type PlatformForm = {
  latest_version: string;
  minimum_version: string;
  force_update: boolean;
  store_url: string;
};

type FormState = {
  ios: PlatformForm;
  android: PlatformForm;
};

function toForm(data: AppVersionSettings): FormState {
  return {
    ios: {
      latest_version: data.ios.latest_version ?? "",
      minimum_version: data.ios.minimum_version ?? "",
      force_update: !!data.ios.force_update,
      store_url: data.ios.store_url ?? "",
    },
    android: {
      latest_version: data.android.latest_version ?? "",
      minimum_version: data.android.minimum_version ?? "",
      force_update: !!data.android.force_update,
      store_url: data.android.store_url ?? "",
    },
  };
}

function formsEqual(a: FormState, b: FormState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function isSemverLike(value: string): boolean {
  return /^\d+(\.\d+){0,3}$/.test(value.trim());
}

function PlatformCard({
  title,
  storeLabel,
  value,
  onChange,
}: {
  title: string;
  storeLabel: string;
  value: PlatformForm;
  onChange: (next: PlatformForm) => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="nl-eyebrow">Platform</p>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        </div>
        <Download className="h-5 w-5 text-slate-400" aria-hidden />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">Latest Version</span>
          <ClearableInput
            className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm shadow-sm outline-none transition focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
            value={value.latest_version}
            onChange={(e) => onChange({ ...value, latest_version: e.target.value })}
            placeholder="1.0.2"
            inputMode="decimal"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">Minimum Supported Version</span>
          <ClearableInput
            className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm shadow-sm outline-none transition focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
            value={value.minimum_version}
            onChange={(e) => onChange({ ...value, minimum_version: e.target.value })}
            placeholder="1.0.2"
            inputMode="decimal"
          />
        </label>
      </div>

      <label className="mt-4 block space-y-1.5">
        <span className="text-sm font-medium text-slate-700">{storeLabel}</span>
        <ClearableInput
          className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm shadow-sm outline-none transition focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
          value={value.store_url}
          onChange={(e) => onChange({ ...value, store_url: e.target.value })}
          placeholder="https://"
        />
      </label>

      <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-slate-800">Force Update</p>
          <p className="text-xs text-slate-500">
            Only enable after the store build is publicly available. Never auto-enabled by version edits.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={value.force_update}
          onClick={() => onChange({ ...value, force_update: !value.force_update })}
          className={[
            "relative h-7 w-12 shrink-0 rounded-full transition-colors",
            value.force_update ? "bg-emerald-500" : "bg-slate-300",
          ].join(" ")}
        >
          <span
            className={[
              "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform",
              value.force_update ? "translate-x-5" : "translate-x-0.5",
            ].join(" ")}
          />
        </button>
      </div>
    </section>
  );
}

export default function AppVersionAdminPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saved, setSaved] = useState<FormState | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAppVersionSettings();
      const next = toForm(data);
      setForm(next);
      setSaved(next);
      setUpdatedAt(data.updated_at ?? null);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => {
    if (!form || !saved) return false;
    return !formsEqual(form, saved);
  }, [form, saved]);

  const validationError = useMemo(() => {
    if (!form) return null;
    for (const platform of ["ios", "android"] as const) {
      const row = form[platform];
      if (!isSemverLike(row.latest_version) || !isSemverLike(row.minimum_version)) {
        return `${platform === "ios" ? "iOS" : "Android"} versions must look like 1.0.2`;
      }
      try {
        // eslint-disable-next-line no-new
        new URL(row.store_url);
      } catch {
        return `${platform === "ios" ? "iOS" : "Android"} store URL is invalid`;
      }
    }
    return null;
  }, [form]);

  async function onSave() {
    if (!form || validationError) {
      toastError(validationError || "Fix the form before saving.");
      return;
    }
    setSaving(true);
    try {
      const payload: Omit<AppVersionSettings, "updated_at"> = {
        ios: form.ios as AppPlatformVersionSettings,
        android: form.android as AppPlatformVersionSettings,
      };
      const data = await updateAppVersionSettings(payload);
      const next = toForm(data);
      setForm(next);
      setSaved(next);
      setUpdatedAt(data.updated_at ?? null);
      toastSuccess("App version settings saved.");
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSaving(false);
    }
  }

  async function onSendNotification() {
    const ok = await confirmAction({
      title: "Send update notification?",
      text: "This sends an Expo push (“Havena Update Available”) to registered iOS and Android devices. It does not enable Force Update.",
      confirmText: "Send notification",
    });
    if (!ok.isConfirmed) return;

    setSending(true);
    try {
      const result = await sendAppUpdateNotification("all");
      toastSuccess(
        `Update notification sent to ${result.users_notified} user${result.users_notified === 1 ? "" : "s"} (${result.tokens_targeted} tokens).`,
      );
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSending(false);
    }
  }

  if (loading) return <PageLoader label="Loading app version settings…" />;
  if (error || !form) return <PageError message={error || "Unable to load settings."} onRetry={load} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="nl-eyebrow">System Admin</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">App Version Management</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Configure latest and minimum versions per platform. Force Update stays off unless you turn it on after the
            store build is live.
          </p>
          {updatedAt ? (
            <p className="mt-1 text-xs text-slate-400">Last updated {new Date(updatedAt).toLocaleString()}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="nl-btn-secondary inline-flex items-center gap-2" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            type="button"
            className="nl-btn-secondary inline-flex items-center gap-2"
            disabled={sending}
            onClick={() => void onSendNotification()}
          >
            <Send className="h-4 w-4" />
            {sending ? "Sending…" : "Send Update Notification"}
          </button>
          <button
            type="button"
            className="nl-btn-primary inline-flex items-center gap-2"
            disabled={saving || !dirty || !!validationError}
            onClick={() => void onSave()}
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      {validationError ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {validationError}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <PlatformCard
          title="iOS"
          storeLabel="App Store URL"
          value={form.ios}
          onChange={(ios) => setForm((prev) => (prev ? { ...prev, ios } : prev))}
        />
        <PlatformCard
          title="Android"
          storeLabel="Google Play Store URL"
          value={form.android}
          onChange={(android) => setForm((prev) => (prev ? { ...prev, android } : prev))}
        />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
        <p className="font-medium text-slate-800">Safe release order</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Build and publish the new app version to App Store / Play Store.</li>
          <li>Confirm the store listing is publicly available.</li>
          <li>Update Latest (and Minimum, if needed) here.</li>
          <li>Optionally enable Force Update, then send the update notification.</li>
        </ol>
      </section>
    </div>
  );
}
