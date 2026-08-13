"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  OnboardingField,
} from "@/components/admin/onboarding/onboarding-ui";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  canAccessCommunityDashboard,
  getCommunityAdminNextStep,
  getToken,
  getUser,
  setSession,
  type WebUser,
} from "@/lib/auth/session";
import { communityAdminOnboardingPath } from "@/lib/admin/community-admin-onboarding";
import { confirmAdminSignOutAndRedirect } from "@/lib/auth/sign-out";
import { fetchPublicRegions, selfServeCreateCommunity } from "@/lib/api/communities";
import { apiError } from "@/lib/api/client";
import { useTouchedFieldErrors } from "@/hooks/use-touched-field-errors";
import { validateCommunitySetupForm } from "@/lib/admin/community-setup-validation";
import { inputClass } from "@/lib/admin/form-validation-utils";

function SetupInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planHint = searchParams.get("plan");
  const intervalHint = searchParams.get("interval") === "year" ? "year" : "month";

  const [regions, setRegions] = useState<
    Array<{ id: number; title: string; area?: string; state?: string | null }>
  >([]);
  const [regionsLoaded, setRegionsLoaded] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [regionId, setRegionId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { touch, clearError, showError, validateOnSubmit } = useTouchedFieldErrors();

  const liveErrors = useMemo(
    () =>
      validateCommunitySetupForm({
        regionId,
        name,
        address,
        regionsLoaded,
      }),
    [regionId, name, address, regionsLoaded],
  );

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace(
        planHint
          ? `/login?plan=${encodeURIComponent(planHint)}&interval=${intervalHint}`
          : "/login",
      );
      return;
    }

    const user = getUser();
    const step = getCommunityAdminNextStep(user);
    if (canAccessCommunityDashboard(user)) {
      router.replace("/admin");
      return;
    }
    if (step !== "link_community") {
      const path = communityAdminOnboardingPath(step);
      router.replace(
        planHint
          ? `${path}?plan=${encodeURIComponent(planHint)}&interval=${intervalHint}`
          : path,
      );
    }
  }, [router, planHint, intervalHint]);

  useEffect(() => {
    void fetchPublicRegions()
      .then((rows) => {
        const active = rows.filter((r) => !r.status || r.status === "active");
        setRegions(active.map((r) => ({ id: r.id, title: r.title, area: r.area, state: r.state })));
        if (active[0]) setRegionId(String(active[0].id));
      })
      .catch(() => setFormError("Could not load regions. Refresh and try again."))
      .finally(() => setRegionsLoaded(true));
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setFormError(null);

    if (!validateOnSubmit(liveErrors)) return;

    const trimmedName = name.trim();
    const trimmedAddress = address.trim();
    const rid = Number(regionId);

    setBusy(true);
    try {
      const res = await selfServeCreateCommunity({
        community_name: trimmedName,
        address: trimmedAddress,
        region_id: rid,
      });

      const token = getToken();
      const current = getUser();
      if (token && current) {
        const nextUser: WebUser = {
          ...current,
          role: "community_admin",
          community_admin_status: current.community_admin_status ?? "pending",
          community_id: res.data.community.id,
          memberships: [
            {
              id: res.data.membership.id,
              community_id: res.data.membership.community_id,
              role: res.data.membership.role,
              status: res.data.membership.status,
              community: {
                id: res.data.community.id,
                name: res.data.community.name,
                review_status: res.data.community.review_status,
              },
            },
          ],
          access: res.data.access ?? current.access ?? null,
        };
        setSession(token, nextUser);
      }

      router.replace(
        planHint
          ? `/admin/complete-profile?plan=${encodeURIComponent(planHint)}&interval=${intervalHint}`
          : "/admin/complete-profile",
      );
    } catch (err) {
      setFormError(apiError(err));
      setBusy(false);
    }
  };

  const regionOptions = useMemo(
    () =>
      regions.map((r) => ({
        value: String(r.id),
        label: r.title,
        description: [r.area, r.state].filter(Boolean).join(" · ") || undefined,
      })),
    [regions],
  );

  const regionErr = showError("regionId", liveErrors);
  const nameErr = showError("name", liveErrors);
  const addressErr = showError("address", liveErrors);

  return (
    <div className="mx-auto w-full min-w-0 max-w-lg px-0">
      <div className="mt-1 sm:mt-2">
        <h1 className="font-[family-name:var(--font-brand)] text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
          Create your community
        </h1>
        <p className="mt-1.5 text-sm leading-snug text-slate-600">
          Tell us where you operate. Next you&apos;ll complete your profile, then start your free trial
          {planHint ? ` with the ${planHint} plan` : ""}.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        noValidate
        className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:mt-5 sm:p-5"
      >
        {formError ? (
          <div
            className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
            role="alert"
          >
            {formError}
          </div>
        ) : null}

        <OnboardingField
          id="community-region"
          label="Region"
          required
          error={regionErr}
          hint="Where your community is located"
        >
          <SearchableSelect
            id="community-region"
            value={regionId}
            onChange={(value) => {
              setRegionId(value);
              clearError("regionId");
              setFormError(null);
              touch("regionId");
            }}
            options={regionOptions}
            placeholder={
              !regionsLoaded
                ? "Loading regions…"
                : regions.length === 0
                  ? "No regions available"
                  : "Select a region"
            }
            emptyMessage="No regions available."
            searchable={false}
            disabled={!regionsLoaded || regions.length === 0}
            error={regionErr}
            className="[&_.nl-picker-trigger]:rounded-xl [&_.nl-picker-trigger-open]:!border-teal-500 [&_.nl-picker-trigger-open]:!shadow-[0_0_0_3px_rgba(13,148,136,0.12)] [&_.nl-picker-trigger:focus-visible]:!border-teal-500 [&_.nl-picker-trigger:focus-visible]:!shadow-[0_0_0_3px_rgba(13,148,136,0.12)] [&_.nl-picker-trigger.has-value]:!border-teal-500/40 [&_.nl-picker-trigger.has-value]:bg-teal-50/30"
          />
        </OnboardingField>

        <OnboardingField
          id="community-name"
          label="Community name"
          required
          error={nameErr}
          hint="The name residents will recognize"
        >
          <input
            id="community-name"
            type="text"
            autoComplete="organization"
            className={inputClass(
              nameErr,
              "h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-600/20",
            )}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              clearError("name");
              setFormError(null);
            }}
            onBlur={() => touch("name")}
            placeholder="e.g. Palm Court HOA"
            aria-invalid={Boolean(nameErr)}
            aria-describedby={nameErr ? "community-name-error" : undefined}
          />
        </OnboardingField>

        <OnboardingField
          id="community-address"
          label="Address"
          required
          error={addressErr}
          hint="Street, city, and state"
        >
          <input
            id="community-address"
            type="text"
            autoComplete="street-address"
            className={inputClass(
              addressErr,
              "h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-600/20",
            )}
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              clearError("address");
              setFormError(null);
            }}
            onBlur={() => touch("address")}
            placeholder="100 Palm Ave, Miami, FL"
            aria-invalid={Boolean(addressErr)}
            aria-describedby={addressErr ? "community-address-error" : undefined}
          />
        </OnboardingField>

        <div className="space-y-3 pt-1">
          <button
            type="submit"
            disabled={busy || !regionsLoaded || regions.length === 0}
            className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-teal-600 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-600/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy
              ? "Creating community…"
              : "Continue to profile"}
          </button>

          <button
            type="button"
            className="w-full py-2 text-center text-xs font-semibold text-slate-500 transition hover:text-slate-800"
            onClick={() => {
              void confirmAdminSignOutAndRedirect(router);
            }}
          >
            Sign out
          </button>
        </div>
      </form>
    </div>
  );
}

export default function CommunitySetupPage() {
  return (
    <Suspense
      fallback={
        <div className="py-16 text-center text-sm text-slate-500">Loading setup…</div>
      }
    >
      <SetupInner />
    </Suspense>
  );
}
