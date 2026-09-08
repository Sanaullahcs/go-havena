"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, ChevronLeft, ChevronRight, ListFilter, Lock, MapPin, Plus, Search, X } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  fetchPublicCountries,
  fetchPublicCountryStates,
  type Country,
  type State,
} from "@/lib/api/geography";
import { OnboardingField } from "@/components/admin/onboarding/onboarding-ui";
import {
  canAccessCommunityDashboard,
  getCommunityAdminNextStep,
  getToken,
  getUser,
  setSession,
} from "@/lib/auth/session";
import { communityAdminOnboardingPath } from "@/lib/admin/community-admin-onboarding";
import { confirmAdminSignOutAndRedirect } from "@/lib/auth/sign-out";
import {
  fetchPublicRegions,
  joinCommunity,
  searchPublicCommunities,
  selfServeCreateCommunity,
  type PublicCommunity,
  type PublicRegion,
} from "@/lib/api/communities";
import { fetchMe, meToSessionUser, updateMe } from "@/lib/api/profile";
import { apiError } from "@/lib/api/client";
import { useTouchedFieldErrors } from "@/hooks/use-touched-field-errors";
import { validateCommunitySetupForm } from "@/lib/admin/community-setup-validation";
import { inputClass } from "@/lib/admin/form-validation-utils";

type SetupView = "regions" | "communities" | "add";

function SetupInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planHint = searchParams.get("plan");
  const intervalHint = searchParams.get("interval") === "year" ? "year" : "month";
  const planQuery = planHint
    ? `?plan=${encodeURIComponent(planHint)}&interval=${intervalHint}`
    : "";

  const [view, setView] = useState<SetupView>("regions");
  const [regions, setRegions] = useState<PublicRegion[]>([]);
  const [regionsLoaded, setRegionsLoaded] = useState(false);
  const [regionQuery, setRegionQuery] = useState("");
  const [debouncedRegionQuery, setDebouncedRegionQuery] = useState("");
  const [countryFilter, setCountryFilter] = useState<Country | null>(null);
  const [stateFilter, setStateFilter] = useState<State | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<PublicRegion | null>(null);

  const [communities, setCommunities] = useState<PublicCommunity[]>([]);
  const [communitiesLoaded, setCommunitiesLoaded] = useState(false);
  const [communityQuery, setCommunityQuery] = useState("");
  const [debouncedCommunityQuery, setDebouncedCommunityQuery] = useState("");

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectingId, setSelectingId] = useState<number | null>(null);

  const { touch, clearError, showError, validateOnSubmit } = useTouchedFieldErrors();

  const liveErrors = useMemo(
    () =>
      validateCommunitySetupForm({
        regionId: selectedRegion ? String(selectedRegion.id) : "",
        name,
        address,
        regionsLoaded: true,
      }),
    [selectedRegion, name, address],
  );

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedRegionQuery(regionQuery.trim()), 350);
    return () => clearTimeout(timer);
  }, [regionQuery]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedCommunityQuery(communityQuery.trim()), 350);
    return () => clearTimeout(timer);
  }, [communityQuery]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace(planHint ? `/login${planQuery}` : "/login");
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
      router.replace(planQuery ? `${path}${planQuery}` : path);
    }
  }, [router, planHint, planQuery]);

  useEffect(() => {
    let cancelled = false;
    setRegionsLoaded(false);
    void fetchPublicRegions({
      ...(debouncedRegionQuery ? { q: debouncedRegionQuery } : {}),
      ...(countryFilter?.id ? { country_id: countryFilter.id } : {}),
      ...(stateFilter?.id ? { state_id: stateFilter.id } : {}),
    })
      .then((rows) => {
        if (cancelled) return;
        setRegions(rows.filter((r) => !r.status || r.status === "active"));
      })
      .catch(() => {
        if (!cancelled) setFormError("Could not load regions. Refresh and try again.");
      })
      .finally(() => {
        if (!cancelled) setRegionsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedRegionQuery, countryFilter?.id, stateFilter?.id]);

  useEffect(() => {
    if (!selectedRegion) return;
    let cancelled = false;
    setCommunitiesLoaded(false);
    void searchPublicCommunities({
      region_id: selectedRegion.id,
      ...(debouncedCommunityQuery ? { q: debouncedCommunityQuery } : {}),
    })
      .then((rows) => {
        if (!cancelled) setCommunities(rows);
      })
      .catch(() => {
        if (!cancelled) setFormError("Could not load communities. Refresh and try again.");
      })
      .finally(() => {
        if (!cancelled) setCommunitiesLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRegion, debouncedCommunityQuery]);

  const syncSessionFromMe = async () => {
    const token = getToken();
    const current = getUser();
    const me = await fetchMe();
    if (token && current) {
      setSession(token, { ...current, ...meToSessionUser(me) });
    }
    return me;
  };

  const goToProfile = () => {
    router.replace(`/admin/complete-profile${planQuery}`);
  };

  const selectRegion = (region: PublicRegion) => {
    setFormError(null);
    setSelectedRegion(region);
    setCommunityQuery("");
    setDebouncedCommunityQuery("");
    setView("communities");
    void updateMe({ region_id: region.id }).catch(() => undefined);
  };

  const selectCommunity = async (community: PublicCommunity) => {
    if (busy || selectingId || community.has_admin) return;
    setFormError(null);
    setSelectingId(community.id);
    try {
      await joinCommunity(community.id);
      await syncSessionFromMe();
      goToProfile();
    } catch (err) {
      setFormError(apiError(err));
      setSelectingId(null);
    }
  };

  const onAddSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !selectedRegion) return;
    setFormError(null);
    if (!validateOnSubmit(liveErrors)) return;

    setBusy(true);
    try {
      await selfServeCreateCommunity({
        community_name: name.trim(),
        address: address.trim(),
        region_id: selectedRegion.id,
      });
      await syncSessionFromMe();
      goToProfile();
    } catch (err) {
      setFormError(apiError(err));
      setBusy(false);
    }
  };

  const nameErr = showError("name", liveErrors);
  const addressErr = showError("address", liveErrors);
  const regionLabel = selectedRegion?.title ?? "your region";

  return (
    <div className="w-full min-w-0">
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[minmax(18rem,26rem)_minmax(0,1fr)]">
        <aside className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#1B4F8A]">
            {view === "regions" ? "Choose region" : view === "communities" ? "Select community" : "Add community"}
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-brand)] text-[1.75rem] font-bold tracking-tight text-slate-900 sm:text-[2.1rem]">
            {view === "regions"
              ? "Where do you operate?"
              : view === "communities"
                ? "Select your community"
                : "Request to add a community"}
          </h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-600 sm:text-[15px]">
            {view === "regions"
              ? "Search or filter by country and state, then pick your region. Next you’ll see communities already listed there — or add a new one."
              : view === "communities"
                ? `Communities in ${regionLabel}. Choose one without an admin, or request to add a new community.`
                : `Tell us the community name and address for ${regionLabel}. We’ll submit it for review.`}
          </p>
          {selectedRegion ? (
            <button
              type="button"
              onClick={() => {
                setView("regions");
                setFormError(null);
              }}
              className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#1B4F8A]/15 bg-[#E8F0F7] px-3 py-1.5 text-[12px] font-semibold text-[#1B4F8A]"
            >
              <MapPin className="h-3.5 w-3.5" aria-hidden />
              {selectedRegion.title}
              <span className="font-medium text-slate-500">Change</span>
            </button>
          ) : null}
        </aside>

        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 lg:p-8">
          {formError ? (
            <div
              className="mb-5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
              role="alert"
            >
              {formError}
            </div>
          ) : null}

          {view === "regions" ? (
            <RegionList
              query={regionQuery}
              onQueryChange={setRegionQuery}
              loading={!regionsLoaded}
              regions={regions}
              searching={regionQuery.trim() !== debouncedRegionQuery}
              country={countryFilter}
              state={stateFilter}
              onApplyFilter={({ country, state }) => {
                setCountryFilter(country);
                setStateFilter(state);
              }}
              onSelect={selectRegion}
            />
          ) : null}

          {view === "communities" && selectedRegion ? (
            <CommunityList
              regionTitle={selectedRegion.title}
              query={communityQuery}
              onQueryChange={setCommunityQuery}
              loading={!communitiesLoaded}
              communities={communities}
              searching={communityQuery.trim() !== debouncedCommunityQuery}
              selectingId={selectingId}
              onSelect={selectCommunity}
              onAdd={() => {
                setFormError(null);
                setView("add");
              }}
            />
          ) : null}

          {view === "add" && selectedRegion ? (
            <form onSubmit={onAddSubmit} noValidate className="space-y-5">
              <button
                type="button"
                onClick={() => {
                  setView("communities");
                  setFormError(null);
                }}
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-600 transition hover:text-slate-900"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
                Back to communities
              </button>

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
                    "h-12 w-full rounded-xl border border-slate-200 px-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#1B4F8A] focus:ring-2 focus:ring-[#1B4F8A]/20",
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
                    "h-12 w-full rounded-xl border border-slate-200 px-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#1B4F8A] focus:ring-2 focus:ring-[#1B4F8A]/20",
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
                />
              </OnboardingField>

              <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  className="order-2 text-center text-xs font-semibold text-slate-500 transition hover:text-slate-800 sm:order-1 sm:text-left"
                  onClick={() => {
                    void confirmAdminSignOutAndRedirect(router);
                  }}
                >
                  Sign out
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="order-1 inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#1B4F8A] px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-[#163A66] focus:outline-none focus:ring-2 focus:ring-[#1B4F8A]/30 disabled:cursor-not-allowed disabled:opacity-60 sm:order-2 sm:w-auto sm:min-w-[14rem]"
                >
                  {busy ? "Submitting…" : "Continue to profile"}
                </button>
              </div>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SearchField({
  value,
  onChange,
  placeholder,
  searching,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  searching?: boolean;
}) {
  return (
    <label className="relative block">
      <Search
        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50/70 py-0 pl-10 pr-10 text-sm leading-[48px] text-slate-900 outline-none placeholder:leading-[48px] placeholder:text-slate-400 [appearance:textfield] [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
      />
      {searching ? (
        <span className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-slate-200 border-t-[#1B4F8A]" />
      ) : value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 hover:text-slate-700"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </label>
  );
}

function RegionList({
  query,
  onQueryChange,
  loading,
  regions,
  searching,
  country,
  state,
  onApplyFilter,
  onSelect,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  loading: boolean;
  regions: PublicRegion[];
  searching: boolean;
  country: Country | null;
  state: State | null;
  onApplyFilter: (next: { country: Country | null; state: State | null }) => void;
  onSelect: (region: PublicRegion) => void;
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftCountryId, setDraftCountryId] = useState("");
  const [draftStateId, setDraftStateId] = useState("");
  const [countries, setCountries] = useState<Country[]>([]);
  const [states, setStates] = useState<State[]>([]);
  const [loadingCountries, setLoadingCountries] = useState(false);
  const [loadingStates, setLoadingStates] = useState(false);

  const activeFilterCount = (country ? 1 : 0) + (state ? 1 : 0);

  useEffect(() => {
    if (!filterOpen) return;
    setDraftCountryId(country ? String(country.id) : "");
    setDraftStateId(state ? String(state.id) : "");
  }, [filterOpen, country, state]);

  useEffect(() => {
    if (!filterOpen) return;
    let cancelled = false;
    setLoadingCountries(true);
    void fetchPublicCountries()
      .then((res) => {
        if (!cancelled) setCountries(res.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setCountries([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingCountries(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filterOpen]);

  useEffect(() => {
    if (!filterOpen || !draftCountryId) {
      setStates([]);
      return;
    }
    let cancelled = false;
    setLoadingStates(true);
    void fetchPublicCountryStates(Number(draftCountryId))
      .then((res) => {
        if (!cancelled) setStates(res.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setStates([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingStates(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filterOpen, draftCountryId]);

  const countryOptions = useMemo(
    () => countries.map((item) => ({ value: String(item.id), label: item.name })),
    [countries],
  );
  const stateOptions = useMemo(
    () => states.map((item) => ({ value: String(item.id), label: item.name })),
    [states],
  );

  const applyDraft = (nextCountryId: string, nextStateId: string) => {
    const nextCountry =
      countries.find((item) => String(item.id) === nextCountryId)
      ?? (country && String(country.id) === nextCountryId ? country : null);
    const nextState =
      states.find((item) => String(item.id) === nextStateId)
      ?? (state && String(state.id) === nextStateId ? state : null);
    onApplyFilter({ country: nextCountry, state: nextState });
    setFilterOpen(false);
  };

  return (
    <div className="flex min-h-0 flex-col">
      <div className="shrink-0 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="min-w-0 flex-1">
            <SearchField
              value={query}
              onChange={onQueryChange}
              placeholder="Search regions…"
              searching={searching}
            />
          </div>
          <button
            type="button"
            onClick={() => setFilterOpen((open) => !open)}
            aria-expanded={filterOpen}
            aria-label="Filter regions"
            className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border transition ${
              activeFilterCount > 0 || filterOpen
                ? "border-teal-400 bg-teal-50 text-teal-700"
                : "border-slate-200 bg-white text-[#1B4F8A] hover:border-[#1B4F8A]/35"
            }`}
          >
            <ListFilter className="h-5 w-5" aria-hidden />
            {activeFilterCount > 0 ? (
              <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-teal-500 px-1 text-[9px] font-bold text-white">
                {activeFilterCount}
              </span>
            ) : null}
          </button>
        </div>

        {filterOpen ? (
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            <p className="text-[12px] leading-relaxed text-slate-500">
              Search by country and state. Leave empty to see all regions.
            </p>
            <SearchableSelect
              value={draftCountryId}
              onChange={(value) => {
                setDraftCountryId(value);
                setDraftStateId("");
              }}
              options={countryOptions}
              placeholder={loadingCountries ? "Loading countries…" : "Select country"}
              searchPlaceholder="Search countries…"
              emptyMessage="No countries match your search."
              searchable
              disabled={loadingCountries}
            />
            <SearchableSelect
              value={draftStateId}
              onChange={setDraftStateId}
              options={stateOptions}
              placeholder={
                !draftCountryId
                  ? "Select a country first"
                  : loadingStates
                    ? "Loading states…"
                    : "Select state"
              }
              searchPlaceholder="Search states…"
              emptyMessage="No states match your search."
              searchable
              disabled={!draftCountryId || loadingStates}
            />
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setDraftCountryId("");
                  setDraftStateId("");
                  onApplyFilter({ country: null, state: null });
                  setFilterOpen(false);
                }}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3.5 text-[13px] font-semibold text-slate-700"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => applyDraft(draftCountryId, draftStateId)}
                className="inline-flex h-10 flex-1 items-center justify-center rounded-xl bg-[#1B4F8A] px-4 text-[13px] font-semibold text-white"
              >
                Apply
              </button>
            </div>
          </div>
        ) : null}

        {!loading && regions.length > 0 ? (
          <p className="text-[12px] font-medium text-slate-500">
            {regions.length} {regions.length === 1 ? "region" : "regions"}
            {country ? ` in ${state?.name ?? country.name}` : ""}
            {query.trim() ? " matched" : ""}
          </p>
        ) : null}
      </div>

      {loading ? (
        <p className="mt-8 text-center text-sm text-slate-500">Loading regions…</p>
      ) : regions.length === 0 ? (
        <p className="mt-8 text-center text-sm text-slate-500">
          {query || country
            ? "No regions match that search. Try a different country or state, or clear the filter."
            : "No regions available yet."}
        </p>
      ) : (
        <div
          className="mt-3 max-h-[min(28rem,55vh)] overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white [scrollbar-width:thin]"
          role="listbox"
          aria-label="Regions"
        >
          <ul className="divide-y divide-slate-100">
            {regions.map((region) => (
              <li key={region.id}>
                <button
                  type="button"
                  role="option"
                  onClick={() => onSelect(region)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-[#F4F8FC] focus:bg-[#F4F8FC] focus:outline-none"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E8F0F7] text-[#1B4F8A]">
                    <MapPin className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900">
                      {region.title}
                    </span>
                    {region.area ? (
                      <span className="mt-0.5 block truncate text-[12px] text-slate-500">
                        {region.area}
                      </span>
                    ) : null}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CommunityList({
  regionTitle,
  query,
  onQueryChange,
  loading,
  communities,
  searching,
  selectingId,
  onSelect,
  onAdd,
}: {
  regionTitle: string;
  query: string;
  onQueryChange: (value: string) => void;
  loading: boolean;
  communities: PublicCommunity[];
  searching: boolean;
  selectingId: number | null;
  onSelect: (community: PublicCommunity) => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-col">
      <div className="shrink-0 space-y-3">
        <SearchField
          value={query}
          onChange={onQueryChange}
          placeholder="Search communities…"
          searching={searching}
        />
        {!loading && communities.length > 0 ? (
          <p className="text-[12px] font-medium text-slate-500">
            {communities.length} {communities.length === 1 ? "community" : "communities"} in {regionTitle}
          </p>
        ) : null}
      </div>

      {loading ? (
        <p className="mt-8 text-center text-sm text-slate-500">Loading communities…</p>
      ) : communities.length === 0 ? (
        <div className="mt-8 flex flex-col items-center px-4 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#E8F0F7] text-[#1B4F8A]">
            <Building2 className="h-5 w-5" aria-hidden />
          </span>
          <p className="mt-3 text-sm font-semibold text-slate-900">No communities listed yet</p>
          <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-slate-500">
            {query
              ? "Try a different search, or request to add your community."
              : `Nothing is listed in ${regionTitle} yet. Request to add yours.`}
          </p>
          <button
            type="button"
            onClick={onAdd}
            className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-[#1B4F8A] px-4 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Request to add community
          </button>
        </div>
      ) : (
        <>
          <div className="mt-3 max-h-[min(26rem,50vh)] overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white [scrollbar-width:thin]">
            <ul className="divide-y divide-slate-100">
              {communities.map((community) => {
                const taken = community.has_admin;
                const selecting = selectingId === community.id;
                return (
                  <li key={community.id}>
                    <button
                      type="button"
                      disabled={taken || selectingId !== null}
                      onClick={() => onSelect(community)}
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition ${
                        taken
                          ? "cursor-not-allowed bg-slate-50/80 opacity-70"
                          : "hover:bg-[#F4F8FC] focus:bg-[#F4F8FC] focus:outline-none"
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                          taken ? "bg-slate-100 text-slate-400" : "bg-[#E8F0F7] text-[#1B4F8A]"
                        }`}
                      >
                        {taken ? (
                          <Lock className="h-3.5 w-3.5" aria-hidden />
                        ) : (
                          <Building2 className="h-3.5 w-3.5" aria-hidden />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-900">
                          {community.name}
                        </span>
                        <span className="mt-0.5 block truncate text-[12px] text-slate-500">
                          {taken
                            ? "Already has an admin"
                            : community.address || "Available — claim as admin"}
                        </span>
                      </span>
                      {selecting ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-[#1B4F8A]" />
                      ) : taken ? null : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <button
            type="button"
            onClick={onAdd}
            className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#1B4F8A]/35 bg-[#F4F8FC] px-4 text-sm font-semibold text-[#1B4F8A] transition hover:border-[#1B4F8A]/55 hover:bg-[#E8F0F7]"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Request to add a community
          </button>
        </>
      )}
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
