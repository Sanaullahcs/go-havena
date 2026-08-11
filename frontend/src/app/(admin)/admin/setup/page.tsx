"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  canAccessCommunityDashboard,
  clearSession,
  getManagedCommunityId,
  getToken,
  getUser,
  setSession,
  type WebUser,
} from "@/lib/auth/session";
import { fetchPublicRegions, selfServeCreateCommunity } from "@/lib/api/communities";
import { apiError } from "@/lib/api/client";

function SetupInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planHint = searchParams.get("plan");
  const intervalHint = searchParams.get("interval") === "year" ? "year" : "month";

  const [regions, setRegions] = useState<Array<{ id: number; title: string }>>([]);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [regionId, setRegionId] = useState("");
  const [estimated, setEstimated] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    if (canAccessCommunityDashboard(user) || getManagedCommunityId(user)) {
      router.replace(
        planHint
          ? `/admin/billing?plan=${encodeURIComponent(planHint)}&interval=${intervalHint}`
          : "/admin/billing",
      );
    }
  }, [router, planHint, intervalHint]);

  useEffect(() => {
    void fetchPublicRegions()
      .then((rows) => {
        const active = rows.filter((r) => !r.status || r.status === "active");
        setRegions(active.map((r) => ({ id: r.id, title: r.title })));
        if (active[0]) setRegionId(String(active[0].id));
      })
      .catch(() => setError("Could not load regions. Refresh and try again."));
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);

    const trimmedName = name.trim();
    const trimmedAddress = address.trim();
    const rid = Number(regionId);
    if (trimmedName.length < 2) {
      setError("Enter your community name.");
      return;
    }
    if (trimmedAddress.length < 5) {
      setError("Enter a full community address.");
      return;
    }
    if (!rid) {
      setError("Select a region.");
      return;
    }

    setBusy(true);
    try {
      const res = await selfServeCreateCommunity({
        community_name: trimmedName,
        address: trimmedAddress,
        region_id: rid,
        estimated_residents: estimated ? Number(estimated) : undefined,
      });

      const token = getToken();
      const current = getUser();
      if (token && current) {
        const nextUser: WebUser = {
          ...current,
          role: "community_admin",
          community_admin_status: "approved",
          community_id: res.data.community.id,
          memberships: [
            {
              id: res.data.membership.id,
              community_id: res.data.membership.community_id,
              role: res.data.membership.role,
              status: res.data.membership.status,
              community: { id: res.data.community.id, name: res.data.community.name },
            },
          ],
        };
        setSession(token, nextUser);
      }

      router.replace(
        planHint
          ? `/admin/billing?plan=${encodeURIComponent(planHint)}&interval=${intervalHint}`
          : "/admin/billing",
      );
    } catch (err) {
      setError(apiError(err));
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center px-1 py-8">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-teal-700">Step 2 of 3</p>
      <h1 className="mt-2 font-[family-name:var(--font-brand)] text-3xl font-bold tracking-tight text-slate-900">
        Create your community
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        Tell us where you operate. Next you’ll choose a seat plan
        {planHint ? ` (${planHint})` : ""} and invite residents.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-slate-700">Community name</span>
          <input
            className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none ring-teal-600/30 focus:ring-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Florida Main Street"
            required
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-slate-700">Address</span>
          <input
            className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none ring-teal-600/30 focus:ring-2"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street, city, state"
            required
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-slate-700">Region</span>
          <select
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-teal-600/30 focus:ring-2"
            value={regionId}
            onChange={(e) => setRegionId(e.target.value)}
            required
          >
            {regions.length === 0 ? <option value="">Loading regions…</option> : null}
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-slate-700">
            Estimated residents <span className="font-normal text-slate-400">(optional)</span>
          </span>
          <input
            type="number"
            min={1}
            className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none ring-teal-600/30 focus:ring-2"
            value={estimated}
            onChange={(e) => setEstimated(e.target.value)}
            placeholder="Helps recommend a seat plan"
          />
        </label>

        <button
          type="submit"
          disabled={busy || regions.length === 0}
          className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-teal-600 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-60"
        >
          {busy ? "Creating…" : planHint ? `Continue to ${planHint} checkout` : "Continue to billing"}
        </button>

        <button
          type="button"
          className="w-full text-center text-xs font-semibold text-slate-500 hover:text-slate-800"
          onClick={() => {
            clearSession();
            router.replace("/login");
          }}
        >
          Sign out
        </button>
      </form>
    </div>
  );
}

export default function CommunitySetupPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-sm text-slate-500">Loading…</div>}>
      <SetupInner />
    </Suspense>
  );
}
