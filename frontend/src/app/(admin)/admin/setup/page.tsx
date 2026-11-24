"use client";

import { ClearableInput, ClearableTextarea } from "@/components/admin/clearable-field";

import {
  FormEvent,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
  type UIEvent,
} from "react";
import type { LucideIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  ChevronRight,
  Lock,
  MapPin,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
} from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  fetchPublicCountries,
  fetchPublicCountryStates,
  fetchPublicStateCities,
  findOrEnsureCityRegionForCommunityAdmin,
  type City,
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
import {
  joinCommunity,
  searchPublicCommunities,
  selfServeCreateCommunity,
  type PublicCommunity,
  type PublicRegion,
} from "@/lib/api/communities";
import { fetchMe, meToSessionUser, updateMe } from "@/lib/api/profile";
import { apiError } from "@/lib/api/client";
import { useTouchedFieldErrors } from "@/hooks/use-touched-field-errors";
import {
  COMMUNITY_SETUP_NAME_MAX,
  COMMUNITY_SETUP_NAME_MAX_MESSAGE,
  validateCommunitySetupForm,
} from "@/lib/admin/community-setup-validation";
import { inputClass } from "@/lib/admin/form-validation-utils";
import { CommunityAddressPicker } from "@/components/admin/community-address-picker";
import { formatRegionPlaceLabel } from "@/lib/admin/region-display";

const COMMUNITIES_PAGE_SIZE = 4;
const COMMUNITIES_VISIBLE_ROWS = 4;

function SetupInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planHint = searchParams.get("plan");
  const intervalHint = searchParams.get("interval") === "year" ? "year" : "month";
  const planQuery = planHint
    ? `?plan=${encodeURIComponent(planHint)}&interval=${intervalHint}`
    : "";

  const [showAddForm, setShowAddForm] = useState(false);
  const [regions, setRegions] = useState<PublicRegion[]>([]);
  const [regionsLoaded, setRegionsLoaded] = useState(false);
  const [countryFilter, setCountryFilter] = useState<Country | null>(null);
  const [stateFilter, setStateFilter] = useState<State | null>(null);
  const [cityFilter, setCityFilter] = useState<City | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<PublicRegion | null>(null);

  const [communities, setCommunities] = useState<PublicCommunity[]>([]);
  const [communitiesLoaded, setCommunitiesLoaded] = useState(false);
  const [communitiesPage, setCommunitiesPage] = useState(1);
  const [communitiesHasMore, setCommunitiesHasMore] = useState(false);
  const [communitiesTotal, setCommunitiesTotal] = useState(0);
  const [communitiesLoadingMore, setCommunitiesLoadingMore] = useState(false);
  const communitiesLoadMoreLock = useRef(false);
  const [communityQuery, setCommunityQuery] = useState("");
  const [debouncedCommunityQuery, setDebouncedCommunityQuery] = useState("");

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
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
    if (!stateFilter?.id || !cityFilter?.name) {
      setRegions([]);
      setRegionsLoaded(true);
      return;
    }

    let cancelled = false;
    setRegionsLoaded(false);
    void findOrEnsureCityRegionForCommunityAdmin({
      ...(countryFilter?.id ? { country_id: countryFilter.id } : {}),
      state_id: stateFilter.id,
      city: cityFilter.name,
    })
      .then((res) => {
        if (cancelled) return;
        if (!res.data) {
          setRegions([]);
          return;
        }
        setRegions([{
          id: res.data.id,
          title: res.data.hierarchy_label ?? res.data.title,
          area: res.data.area,
          state_id: res.data.state_id,
          state_name: res.data.state_name,
          country_id: res.data.country_id,
          country_name: res.data.country_name,
          status: res.data.status,
        }]);
      })
      .catch(() => {
        if (!cancelled) setRegions([]);
      })
      .finally(() => {
        if (!cancelled) setRegionsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [countryFilter?.id, stateFilter?.id, cityFilter?.name]);

  useEffect(() => {
    if (!regionsLoaded || !cityFilter?.name) {
      if (!cityFilter?.name) setSelectedRegion(null);
      return;
    }
    const found = regions[0];
    if (found) {
      setSelectedRegion((prev) => {
        if (prev?.id === found.id) return prev;
        void updateMe({ region_id: found.id }).catch(() => undefined);
        return found;
      });
      setShowAddForm(false);
    } else {
      setSelectedRegion(null);
    }
  }, [regions, regionsLoaded, cityFilter?.name]);

  const resetCommunitiesList = useCallback(() => {
    setCommunities([]);
    setCommunitiesPage(1);
    setCommunitiesHasMore(false);
    setCommunitiesTotal(0);
    setCommunitiesLoaded(false);
    setCommunitiesLoadingMore(false);
    communitiesLoadMoreLock.current = false;
  }, []);

  useEffect(() => {
    if (!selectedRegion) return;
    let cancelled = false;
    resetCommunitiesList();
    void searchPublicCommunities({
      region_id: selectedRegion.id,
      ...(debouncedCommunityQuery ? { q: debouncedCommunityQuery } : {}),
      page: 1,
      per_page: COMMUNITIES_PAGE_SIZE,
    })
      .then(({ data, meta }) => {
        if (cancelled) return;
        setCommunities(data);
        setCommunitiesPage(meta.current_page);
        setCommunitiesHasMore(meta.has_more);
        setCommunitiesTotal(meta.total);
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
  }, [selectedRegion, debouncedCommunityQuery, resetCommunitiesList]);

  const loadMoreCommunities = useCallback(async () => {
    if (
      !selectedRegion
      || !communitiesHasMore
      || communitiesLoadingMore
      || !communitiesLoaded
      || communitiesLoadMoreLock.current
    ) {
      return;
    }
    communitiesLoadMoreLock.current = true;
    setCommunitiesLoadingMore(true);
    const nextPage = communitiesPage + 1;
    try {
      const { data, meta } = await searchPublicCommunities({
        region_id: selectedRegion.id,
        ...(debouncedCommunityQuery ? { q: debouncedCommunityQuery } : {}),
        page: nextPage,
        per_page: COMMUNITIES_PAGE_SIZE,
      });
      setCommunities((prev) => [...prev, ...data]);
      setCommunitiesPage(meta.current_page);
      setCommunitiesHasMore(meta.has_more);
      setCommunitiesTotal(meta.total);
    } catch {
      setFormError("Could not load more communities. Try again.");
    } finally {
      setCommunitiesLoadingMore(false);
      communitiesLoadMoreLock.current = false;
    }
  }, [
    selectedRegion,
    debouncedCommunityQuery,
    communitiesHasMore,
    communitiesLoadingMore,
    communitiesLoaded,
    communitiesPage,
  ]);

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
        description: description.trim() || undefined,
        region_id: selectedRegion.id,
        city: (cityFilter?.name ?? selectedRegion.area ?? "").trim() || undefined,
        latitude,
        longitude,
      });
      await syncSessionFromMe();
      goToProfile();
    } catch (err) {
      setFormError(apiError(err));
      setBusy(false);
    }
  };

  const nameOverLimit = name.length > COMMUNITY_SETUP_NAME_MAX;
  const nameErr =
    showError("name", liveErrors) ??
    (nameOverLimit ? COMMUNITY_SETUP_NAME_MAX_MESSAGE : undefined);
  const addressErr = showError("address", liveErrors);
  const regionPlaceLabel = formatRegionPlaceLabel(selectedRegion);

  const cityChosen = Boolean(cityFilter?.name?.trim());
  const regionSearchPending = cityChosen && !regionsLoaded;
  const regionSearchComplete = cityChosen && regionsLoaded;
  const regionFound = Boolean(selectedRegion);
  const showWelcome = !cityChosen;
  const showNoRegion = regionSearchComplete && !regionFound;

  const hasLocationFilters = Boolean(countryFilter || stateFilter || cityFilter);

  const clearRegionSearch = () => {
    setFormError(null);
    setCountryFilter(null);
    setStateFilter(null);
    setCityFilter(null);
    setRegions([]);
    setRegionsLoaded(true);
    setSelectedRegion(null);
    setCommunities([]);
    setCommunitiesPage(1);
    setCommunitiesHasMore(false);
    setCommunitiesTotal(0);
    setCommunitiesLoaded(false);
    setCommunitiesLoadingMore(false);
    communitiesLoadMoreLock.current = false;
    setShowAddForm(false);
    setCommunityQuery("");
    setDebouncedCommunityQuery("");
    setName("");
    setAddress("");
    setDescription("");
    setLatitude(null);
    setLongitude(null);
  };

  const applyLocationFilter = (next: {
    country: Country | null;
    state: State | null;
    city: City | null;
  }) => {
    setFormError(null);
    setCountryFilter(next.country);
    setStateFilter(next.state);
    setCityFilter(next.city);
    setSelectedRegion(null);
    setShowAddForm(false);
    setCommunityQuery("");
    setDebouncedCommunityQuery("");
    if (!next.city?.name?.trim()) {
      resetCommunitiesList();
    }
  };

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
      <section className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-1 flex-col overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white shadow-[0_16px_48px_-28px_rgba(27,79,138,0.35)]">
        <header className="shrink-0 border-b border-slate-100 px-6 pb-3 pt-5 lg:px-8 lg:pt-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Community admin setup
          </p>
          {showAddForm && selectedRegion ? (
            <div className="mt-2 flex min-w-0 items-center gap-3">
              <SetupOutlineAction
                icon={ArrowLeft}
                onClick={() => {
                  setShowAddForm(false);
                  setFormError(null);
                }}
                ariaLabel="Back to community list"
              >
                Back
              </SetupOutlineAction>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Request community
                </p>
                <h1 className="truncate font-[family-name:var(--font-brand)] text-[1.25rem] font-bold leading-tight tracking-tight text-[#1B4F8A] lg:text-[1.45rem]">
                  {regionPlaceLabel}
                </h1>
              </div>
            </div>
          ) : (
            <>
              <h1 className="mt-2 font-[family-name:var(--font-brand)] text-[1.55rem] font-bold leading-[1.15] tracking-tight text-[#1B4F8A] lg:text-[1.75rem]">
                Find your region & community
              </h1>
              <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-slate-500">
                Choose your location on the left. Communities and requests appear on the right — no extra steps.
              </p>
            </>
          )}
        </header>

        <div className="grid min-h-0 flex-1 overflow-hidden max-lg:grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[minmax(0,18.5rem)_1fr] lg:divide-x lg:divide-slate-100">
          <aside className="shrink-0 border-b border-slate-100 px-6 py-5 lg:min-h-0 lg:overflow-hidden lg:border-b-0 lg:px-6 lg:py-6">
            <div className="mb-4 flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Region search
              </p>
              {hasLocationFilters ? (
                <SetupOutlineAction
                  icon={RotateCcw}
                  onClick={clearRegionSearch}
                  ariaLabel="Clear region search and start over"
                >
                  Clear search
                </SetupOutlineAction>
              ) : null}
            </div>
            <RegionList
              loading={!regionsLoaded}
              regions={regions}
              country={countryFilter}
              state={stateFilter}
              city={cityFilter}
              selectedRegion={selectedRegion}
              onApplyFilter={applyLocationFilter}
            />
          </aside>

          <main
            className={[
              "flex min-h-0 flex-1 flex-col overflow-hidden px-6 lg:px-8",
              showAddForm && selectedRegion ? "py-3 lg:py-4" : "py-5 lg:py-6",
            ].join(" ")}
          >
            {formError ? (
              <div
                className="mb-3 shrink-0 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
                role="alert"
              >
                {formError}
              </div>
            ) : null}

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {showWelcome ? (
                <SetupWelcomePanel />
              ) : regionSearchPending ? (
                <SetupLoadingPanel message="Finding or setting up your region…" />
              ) : showNoRegion ? (
                <SetupNoRegionPanel />
              ) : showAddForm && selectedRegion ? (
                <form onSubmit={onAddSubmit} noValidate className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain py-0.5 pr-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]">
              <OnboardingField
                id="community-name"
                label="Community name"
                required
                error={nameErr}
                hint="Enter the community name your residents will recognize."
              >
                <ClearableInput
                  id="community-name"
                  type="text"
                  autoComplete="organization"
                  className={inputClass(
                    nameErr,
                    "h-12 w-full rounded-xl border border-slate-200 px-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#1B4F8A] focus:ring-2 focus:ring-[#1B4F8A]/20",
                  )}
                  value={name}
                  maxLength={nameOverLimit ? undefined : COMMUNITY_SETUP_NAME_MAX}
                  onChange={(e) => {
                    setName(e.target.value);
                    clearError("name");
                    setFormError(null);
                  }}
                  onBlur={() => touch("name")}
                  placeholder="e.g. Palm Court HOA"
                  aria-invalid={Boolean(nameErr)}
                />
                {name.length > 0 ? (
                  <p
                    className={`text-right text-[11px] tabular-nums ${
                      name.length > COMMUNITY_SETUP_NAME_MAX ? "text-red-600" : "text-slate-500"
                    }`}
                  >
                    {name.length} / {COMMUNITY_SETUP_NAME_MAX}
                  </p>
                ) : null}
              </OnboardingField>

              <OnboardingField
                id="community-address"
                label="Address"
                required
                error={addressErr}
                hint="Street, city, and state"
              >
                <CommunityAddressPicker
                  id="community-address"
                  value={{ address, latitude, longitude }}
                  inputClassName={inputClass(
                    addressErr,
                    "h-12 w-full rounded-xl border border-slate-200 px-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#1B4F8A] focus:ring-2 focus:ring-[#1B4F8A]/20",
                  )}
                  placeholder="100 Palm Ave, Miami, FL"
                  onBlur={() => touch("address")}
                  onChange={(next) => {
                    setAddress(next.address);
                    setLatitude(next.latitude);
                    setLongitude(next.longitude);
                    clearError("address");
                    setFormError(null);
                  }}
                />
              </OnboardingField>

              <OnboardingField
                id="community-description"
                label="Description"
                hint="Optional notes about this community"
              >
                <ClearableTextarea
                  id="community-description"
                  rows={3}
                  maxLength={1000}
                  className="min-h-[88px] w-full resize-none rounded-xl border border-slate-200 px-3.5 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#1B4F8A] focus:ring-2 focus:ring-[#1B4F8A]/20"
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    setFormError(null);
                  }}
                  placeholder="Optional notes about this community"
                />
                {description.length > 0 ? (
                  <p className="text-right text-[11px] tabular-nums text-slate-500">
                    {description.length} / 1000
                  </p>
                ) : null}
              </OnboardingField>

                  </div>

                  <div className="mt-2 flex shrink-0 justify-end border-t border-slate-100 bg-white pt-3">
                    <button
                      type="submit"
                      disabled={busy}
                      className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#1B4F8A] px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-[#163A66] focus:outline-none focus:ring-2 focus:ring-[#1B4F8A]/30 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-[14rem]"
                    >
                      {busy ? "Submitting…" : "Continue to profile"}
                    </button>
                  </div>
                </form>
              ) : selectedRegion ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  <CommunityList
                    key={selectedRegion.id}
                    className="min-h-0 flex-1"
                    regionTitle={regionPlaceLabel}
                    query={communityQuery}
                    onQueryChange={setCommunityQuery}
                    loading={!communitiesLoaded}
                    loadingMore={communitiesLoadingMore}
                    hasMore={communitiesHasMore}
                    total={communitiesTotal}
                    communities={communities}
                    searching={communityQuery.trim() !== debouncedCommunityQuery}
                    selectingId={selectingId}
                    onSelect={selectCommunity}
                    onLoadMore={loadMoreCommunities}
                    onAdd={() => {
                      setFormError(null);
                      setShowAddForm(true);
                    }}
                  />
                </div>
              ) : null}
            </div>
          </main>
        </div>
      </section>
    </div>
  );
}

function SetupOutlineAction({
  icon: Icon,
  children,
  onClick,
  ariaLabel,
}: {
  icon: LucideIcon;
  children: ReactNode;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-600 shadow-sm transition hover:border-[#1B4F8A]/25 hover:bg-[#F4F8FC] hover:text-[#1B4F8A] focus:outline-none focus:ring-2 focus:ring-[#1B4F8A]/20"
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
      {children}
    </button>
  );
}

function SetupWelcomePanel() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-6 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E8F0F7] text-[#1B4F8A]">
        <Sparkles className="h-4 w-4" aria-hidden />
      </span>
      <h2 className="mt-4 text-base font-semibold text-slate-900">Search on the left</h2>
      <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-slate-500">
        Pick country, state, and city. Communities for your region will show here—you can join one or request a new
        listing.
      </p>
    </div>
  );
}

function SetupLoadingPanel({ message }: { message: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-6 text-center">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-[#1B4F8A]" />
      <p className="mt-4 text-sm text-slate-500">{message}</p>
    </div>
  );
}

function SetupNoRegionPanel() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-6 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
        <MapPin className="h-5 w-5" aria-hidden />
      </span>
      <p className="mt-4 text-sm font-semibold text-slate-900">No Region and Communities Found.</p>
      <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-slate-500">
        Try another city nearby, or contact support if you believe this area should be available.
      </p>
    </div>
  );
}

function SearchField({
  value,
  onChange,
  placeholder,
  searching,
  autoFocus,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  searching?: boolean;
  autoFocus?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  return (
    <label className="relative block">
      <Search
        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        aria-hidden
      />
      <ClearableInput
        ref={inputRef}
        type="search"
        value={value}
        hideClear={searching}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50/70 py-0 pl-10 pr-10 text-sm leading-[48px] text-slate-900 outline-none placeholder:leading-[48px] placeholder:text-slate-400 [appearance:textfield] [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
      />
      {searching ? (
        <span className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-slate-200 border-t-[#1B4F8A]" />
      ) : null}
    </label>
  );
}

let cachedPublicCountries: Country[] | null = null;
const statesCache = new Map<number, State[]>();
const citiesCache = new Map<number, City[]>();

function RegionList({
  loading,
  regions,
  country,
  state,
  city,
  selectedRegion,
  onApplyFilter,
}: {
  loading: boolean;
  regions: PublicRegion[];
  country: Country | null;
  state: State | null;
  city: City | null;
  selectedRegion: PublicRegion | null;
  onApplyFilter: (next: { country: Country | null; state: State | null; city: City | null }) => void;
}) {
  const [countries, setCountries] = useState<Country[]>(() => cachedPublicCountries ?? []);
  const [states, setStates] = useState<State[]>(() =>
    country?.id ? statesCache.get(country.id) ?? [] : [],
  );
  const [cities, setCities] = useState<City[]>(() =>
    state?.id ? citiesCache.get(state.id) ?? [] : [],
  );
  const [loadingCountries, setLoadingCountries] = useState(() => !cachedPublicCountries?.length);
  const [loadingStates, setLoadingStates] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);

  useEffect(() => {
    if (cachedPublicCountries?.length) {
      setCountries(cachedPublicCountries);
      setLoadingCountries(false);
      return undefined;
    }
    let cancelled = false;
    setLoadingCountries(true);
    void fetchPublicCountries()
      .then((res) => {
        if (cancelled) return;
        const list = res.data ?? [];
        cachedPublicCountries = list;
        setCountries(list);
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
  }, []);

  useEffect(() => {
    if (!country?.id) {
      setStates([]);
      setLoadingStates(false);
      return;
    }
    const cached = statesCache.get(country.id);
    if (cached?.length) {
      setStates(cached);
      setLoadingStates(false);
      return undefined;
    }
    let cancelled = false;
    setStates([]);
    setLoadingStates(true);
    void fetchPublicCountryStates(country.id)
      .then((res) => {
        if (cancelled) return;
        const list = res.data ?? [];
        statesCache.set(country.id, list);
        setStates(list);
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
  }, [country?.id]);

  useEffect(() => {
    if (!state?.id) {
      setCities([]);
      setLoadingCities(false);
      return;
    }
    const cached = citiesCache.get(state.id);
    if (cached?.length) {
      setCities(cached);
      setLoadingCities(false);
      return undefined;
    }
    let cancelled = false;
    setCities([]);
    setLoadingCities(true);
    void fetchPublicStateCities(state.id)
      .then((res) => {
        if (cancelled) return;
        const list = res.data ?? [];
        citiesCache.set(state.id, list);
        setCities(list);
      })
      .catch(() => {
        if (!cancelled) setCities([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingCities(false);
      });
    return () => {
      cancelled = true;
    };
  }, [state?.id]);

  const countryOptions = useMemo(() => {
    const base = countries.map((item) => ({ value: String(item.id), label: item.name }));
    if (country && !base.some((opt) => opt.value === String(country.id))) {
      return [{ value: String(country.id), label: country.name }, ...base];
    }
    return base;
  }, [countries, country]);

  const stateOptions = useMemo(() => {
    const base = states.map((item) => ({ value: String(item.id), label: item.name }));
    if (state && !base.some((opt) => opt.value === String(state.id))) {
      return [{ value: String(state.id), label: state.name }, ...base];
    }
    return base;
  }, [states, state]);

  const cityOptions = useMemo(() => {
    const base = cities.map((item) => ({ value: item.name, label: item.name }));
    const cityName = city?.name?.trim();
    if (cityName && !base.some((opt) => opt.value === cityName)) {
      return [{ value: cityName, label: cityName }, ...base];
    }
    return base;
  }, [cities, city]);

  const applyLocation = (nextCountryId: string, nextStateId: string, nextCity: string) => {
    const nextCountry =
      countries.find((item) => String(item.id) === nextCountryId)
      ?? (country && String(country.id) === nextCountryId ? country : null);
    const nextState =
      states.find((item) => String(item.id) === nextStateId)
      ?? (state && String(state.id) === nextStateId ? state : null);
    const nextCityRow =
      cities.find((item) => item.name === nextCity)
      ?? (city && city.name === nextCity ? city : nextCity ? { id: 0, state_id: Number(nextStateId) || 0, name: nextCity } : null);
    onApplyFilter({ country: nextCountry, state: nextState, city: nextCityRow });
  };

  const readyRegion = city && !loading ? regions[0] : null;
  const hint = !country
    ? "Start with a country."
    : !state
      ? `Now choose a state in ${country.name}.`
      : loadingCities
        ? `Loading cities in ${state.name}…`
        : !city
          ? `Now choose a city in ${state.name}.`
          : loading
            ? "Searching this city…"
            : readyRegion
              ? ""
              : "Preparing your region…";

  const fields = [
    {
      key: "country",
      label: "Country",
      value: country ? String(country.id) : "",
      valueLabel: country?.name,
      options: countryOptions,
      placeholder: loadingCountries ? "Loading…" : "Where in the world?",
      searchPlaceholder: "Search countries…",
      emptyMessage: "No countries match.",
      disabled: loadingCountries && !country,
      allowCustom: false,
      onChange: (value: string) => applyLocation(value, "", ""),
      done: Boolean(country),
      open: true,
    },
    {
      key: "state",
      label: "State",
      value: state ? String(state.id) : "",
      valueLabel: state?.name,
      options: stateOptions,
      placeholder: !country ? "Pick a country first" : loadingStates ? "Loading…" : "Which state?",
      searchPlaceholder: "Search states…",
      emptyMessage: "No states match.",
      disabled: !country || (loadingStates && !state),
      allowCustom: false,
      onChange: (value: string) => applyLocation(country ? String(country.id) : "", value, ""),
      done: Boolean(state),
      open: Boolean(country),
    },
    {
      key: "city",
      label: "City",
      value: city?.name ?? "",
      valueLabel: city?.name,
      options: cityOptions,
      placeholder: !state ? "Pick a state first" : loadingCities ? "Loading…" : "Which city?",
      searchPlaceholder: "Search cities…",
      emptyMessage: "No cities match.",
      disabled: !state || (loadingCities && !city),
      allowCustom: true,
      onChange: (value: string) => applyLocation(country ? String(country.id) : "", state ? String(state.id) : "", value),
      done: Boolean(city),
      open: Boolean(state),
    },
  ] as const;

  return (
    <div className="flex min-h-0 flex-col">
      {hint ? <p className="mb-4 text-[12px] text-slate-400">{hint}</p> : null}
      <ol className="space-y-0">
        {fields.map((field, index) => (
          <li key={field.key} className={`relative flex gap-3 ${field.open ? "" : "opacity-40"}`}>
            <span className="flex w-5 shrink-0 flex-col items-center">
              <span
                className={`mt-2 h-2.5 w-2.5 rounded-full ${
                  field.done
                    ? "bg-[#1B4F8A]"
                    : field.open
                      ? "border border-[#1B4F8A] bg-white"
                      : "border border-slate-300 bg-white"
                }`}
              />
              {index < fields.length - 1 ? <span className="w-px flex-1 bg-slate-200" /> : null}
            </span>
            <label className={`min-w-0 flex-1 ${index < fields.length - 1 ? "pb-4" : ""}`}>
              <span className="mb-1.5 block text-[11px] font-semibold text-slate-500">{field.label}</span>
              <SearchableSelect
                className="nl-picker-compact"
                value={field.value}
                valueLabel={field.valueLabel}
                onChange={field.onChange}
                options={field.options}
                placeholder={field.placeholder}
                searchPlaceholder={field.searchPlaceholder}
                emptyMessage={field.emptyMessage}
                searchable
                allowCustom={field.allowCustom}
                disabled={field.disabled}
              />
            </label>
          </li>
        ))}
      </ol>

      {readyRegion && selectedRegion ? (
        <div className="mt-5 flex items-center gap-3 rounded-xl border border-[#1B4F8A]/15 bg-[#F4F8FC] px-3 py-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[#1B4F8A] shadow-sm">
            <MapPin className="h-3.5 w-3.5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1B4F8A]/80">Region found</p>
            <p className="truncate text-[13px] font-semibold text-slate-900">
              {formatRegionPlaceLabel(readyRegion)}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CommunityListItemSkeleton() {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-3 py-3">
      <div className="h-9 w-9 shrink-0 animate-skeleton rounded-lg bg-gradient-to-r from-slate-200/80 via-slate-100 to-slate-200/80 bg-[length:200%_100%]" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-3.5 w-[58%] animate-skeleton rounded bg-gradient-to-r from-slate-200/80 via-slate-100 to-slate-200/80 bg-[length:200%_100%]" />
        <div className="h-3 w-[42%] animate-skeleton rounded bg-gradient-to-r from-slate-200/80 via-slate-100 to-slate-200/80 bg-[length:200%_100%]" />
      </div>
    </li>
  );
}

function CommunityListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <ul className="space-y-2" aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <CommunityListItemSkeleton key={index} />
      ))}
    </ul>
  );
}

function CommunityList({
  className,
  regionTitle,
  query,
  onQueryChange,
  loading,
  loadingMore,
  hasMore,
  total,
  communities,
  searching,
  selectingId,
  onSelect,
  onLoadMore,
  onAdd,
}: {
  className?: string;
  regionTitle: string;
  query: string;
  onQueryChange: (value: string) => void;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  total: number;
  communities: PublicCommunity[];
  searching: boolean;
  selectingId: number | null;
  onSelect: (community: PublicCommunity) => void;
  onLoadMore: () => void;
  onAdd: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const trimmedQuery = query.trim();
  const loadedCount = communities.length;
  const showSearchField = searchOpen || Boolean(trimmedQuery);

  useEffect(() => {
    if (!showSearchField) return;
    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [showSearchField]);

  useEffect(() => {
    if (loading || loadingMore || !hasMore) return;
    const element = scrollRef.current;
    if (!element) return;
    if (element.scrollHeight <= element.clientHeight + 8) {
      onLoadMore();
    }
  }, [communities.length, loading, loadingMore, hasMore, onLoadMore]);
  const resultLabel = (() => {
    if (loading && loadedCount === 0) return null;
    if (loadedCount === 0 && !loading) return null;
    if (trimmedQuery) {
      if (total > loadedCount) {
        return `${loadedCount} of ${total} matches for “${trimmedQuery}”`;
      }
      return `${total} ${total === 1 ? "match" : "matches"} for “${trimmedQuery}”`;
    }
    if (total > loadedCount) {
      return `Showing ${loadedCount} of ${total} communities`;
    }
    return `${total} ${total === 1 ? "community" : "communities"} in this region`;
  })();

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    if (loading || loadingMore || !hasMore) return;
    const element = event.currentTarget;
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (distanceFromBottom < 96) {
      onLoadMore();
    }
  };

  const showEmpty = !loading && communities.length === 0;

  const toggleSearch = () => {
    if (showSearchField) {
      if (trimmedQuery) onQueryChange("");
      setSearchOpen(false);
      return;
    }
    setSearchOpen(true);
  };

  return (
    <div className={`flex min-h-0 flex-col ${className ?? ""}`}>
      <div className="shrink-0">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Communities</p>
            <span className="text-slate-300" aria-hidden>
              ·
            </span>
            <p className="min-w-0 truncate text-sm font-semibold text-slate-900">{regionTitle}</p>
          </div>
          <button
            type="button"
            onClick={toggleSearch}
            aria-label={showSearchField ? "Hide community search" : "Search communities"}
            aria-expanded={showSearchField}
            className={[
              "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition focus:outline-none focus:ring-2 focus:ring-[#1B4F8A]/20",
              showSearchField
                ? "border-[#1B4F8A]/30 bg-[#F4F8FC] text-[#1B4F8A]"
                : "border-slate-200 bg-white text-slate-500 hover:border-[#1B4F8A]/25 hover:bg-[#F4F8FC] hover:text-[#1B4F8A]",
            ].join(" ")}
          >
            <Search className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          </button>
        </div>
        {showSearchField ? (
          <div className="mt-2">
            <SearchField
              inputRef={searchInputRef}
              autoFocus
              value={query}
              onChange={onQueryChange}
              placeholder="Search by community name…"
              searching={searching}
            />
          </div>
        ) : null}
        {resultLabel ? (
          <p className={`text-[12px] font-medium text-slate-500 ${showSearchField ? "mt-2" : "mt-1.5"}`}>
            {resultLabel}
          </p>
        ) : searching && !loading ? (
          <p className={`text-[12px] text-slate-400 ${showSearchField ? "mt-2" : "mt-1.5"}`}>
            Updating results…
          </p>
        ) : null}
      </div>

      <div
        ref={scrollRef}
        className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-xl border border-slate-100 bg-slate-50/30 py-2 pl-2 pr-0.5 [scrollbar-width:thin]"
        onScroll={handleScroll}
      >
        {loading && communities.length === 0 ? (
          <CommunityListSkeleton count={COMMUNITIES_VISIBLE_ROWS} />
        ) : showEmpty ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center">
            <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-[#E8F0F7] text-[#1B4F8A]">
              <Building2 className="h-4 w-4" aria-hidden />
            </span>
            <p className="mt-3 text-sm font-semibold text-slate-900">
              {trimmedQuery ? "No communities match your search" : "No communities listed yet"}
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
              {trimmedQuery
                ? "Try another name or request to add your community below."
                : `Nothing is listed in ${regionTitle} yet.`}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {communities.map((community) => {
              const taken = community.has_admin;
              const selecting = selectingId === community.id;
              return (
                <li key={community.id}>
                  <button
                    type="button"
                    disabled={taken || selectingId !== null}
                    onClick={() => onSelect(community)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${
                      taken
                        ? "cursor-not-allowed border-slate-200 bg-slate-50/90"
                        : "border-slate-200 bg-white hover:border-[#1B4F8A]/25 hover:bg-[#F4F8FC] focus:border-[#1B4F8A]/35 focus:bg-[#F4F8FC] focus:outline-none focus:ring-2 focus:ring-[#1B4F8A]/15"
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                        taken ? "bg-slate-100 text-slate-400" : "bg-[#E8F0F7] text-[#1B4F8A]"
                      }`}
                    >
                      {taken ? (
                        <Lock className="h-4 w-4" aria-hidden />
                      ) : (
                        <Building2 className="h-4 w-4" aria-hidden />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-slate-900">
                        {community.name}
                      </span>
                      {!taken && community.address ? (
                        <span className="mt-0.5 block truncate text-[12px] text-slate-500">
                          {community.address}
                        </span>
                      ) : null}
                    </span>
                    {selecting ? (
                      <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-200 border-t-[#1B4F8A]" />
                    ) : taken ? (
                      <span className="shrink-0 rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Has admin
                      </span>
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-[#1B4F8A]/40" aria-hidden />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {loadingMore ? (
          <div className="mt-2">
            <CommunityListSkeleton count={2} />
          </div>
        ) : null}
      </div>

      <footer className="mt-4 shrink-0 border-t border-slate-100 bg-white pt-4">
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#1B4F8A]/35 bg-[#F4F8FC] px-4 text-[13px] font-semibold text-[#1B4F8A] transition hover:border-[#1B4F8A]/55 hover:bg-[#E8F0F7]"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Request to Add Community
        </button>
      </footer>
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
