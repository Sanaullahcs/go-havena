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
  Check,
  ChevronRight,
  Lock,
  MapPin,
  Plus,
  RotateCcw,
  Search,
  Users,
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

  const requestFormOpen = showAddForm && Boolean(selectedRegion);

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
      <section
        className={[
          "relative mx-auto flex w-full max-w-6xl flex-1 flex-col rounded-[1.6rem] border border-slate-200/80 bg-white shadow-[0_16px_40px_-28px_rgba(27,79,138,0.35)]",
          requestFormOpen ? "min-h-0" : "h-full min-h-0 overflow-hidden",
        ].join(" ")}
      >
        <header className="relative shrink-0 px-5 pb-2 pt-5 sm:px-7">
          <SetupHeaderArt />
          <div className="flex gap-3">
            <span className="mt-0.5 h-11 w-1 shrink-0 rounded-full bg-[#2F6FE0]" aria-hidden />
            <div className="min-w-0 sm:pr-48">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                Community admin setup
              </p>
              <h1 className="mt-1 font-[family-name:var(--font-brand)] text-[1.55rem] font-bold leading-[1.15] tracking-tight text-[#0A2A43] lg:text-[1.85rem]">
                Find your <span className="text-[#2F6FE0]">region</span> & community
              </h1>
              <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-slate-500">
                Choose your location on the left. Communities and requests appear on the right.
              </p>
            </div>
          </div>
        </header>

        <div
          className={[
            "grid flex-1 gap-4 px-4 pb-4 pt-2 sm:px-6 sm:pb-5 max-lg:grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[minmax(0,20.5rem)_1fr]",
            requestFormOpen
              ? "min-h-0 lg:items-start"
              : "min-h-0 overflow-hidden lg:grid-rows-[minmax(0,1fr)]",
          ].join(" ")}
        >
          <aside className="flex max-h-full min-h-0 w-full flex-col self-start overflow-y-auto rounded-[1.25rem] border border-[#E3ECF6] bg-[#F7FAFE] px-4 py-4">
            <div className="mb-4 flex items-center justify-between gap-2">
              <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <MapPin className="h-3.5 w-3.5 text-[#1B4F8A]" aria-hidden />
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
              "flex min-h-0 min-w-0 flex-col px-1",
              requestFormOpen ? "py-1" : "h-full overflow-hidden py-0",
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

            <div
              className={[
                "flex flex-col",
                requestFormOpen ? "min-h-0" : "min-h-0 flex-1 overflow-hidden",
              ].join(" ")}
            >
              {showWelcome ? (
                <SetupWelcomePanel />
              ) : regionSearchPending ? (
                <SetupLoadingPanel message="Finding or setting up your region…" />
              ) : showNoRegion ? (
                <SetupNoRegionPanel />
              ) : showAddForm && selectedRegion ? (
                <form onSubmit={onAddSubmit} noValidate className="flex w-full flex-col self-start rounded-[1.25rem] border border-[#E6EEF8] bg-[#F7FAFE]">
                  <div className="flex items-start gap-3 px-4 pb-2 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddForm(false);
                        setFormError(null);
                      }}
                      aria-label="Back to community list"
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-[#1B4F8A]/25 hover:bg-[#F4F8FC] hover:text-[#1B4F8A] focus:outline-none focus:ring-2 focus:ring-[#1B4F8A]/20"
                    >
                      <ArrowLeft className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                    </button>
                    <div className="min-w-0">
                      <p className="font-[family-name:var(--font-brand)] text-lg font-semibold leading-tight text-[#0A2A43]">
                        Request a community
                      </p>
                      <p className="mt-0.5 text-[13px] leading-snug text-slate-500">
                        Add the name and address. We review the request before residents can join.
                      </p>
                    </div>
                  </div>
                  <div className="px-4 pb-4">
                    <div className="rounded-2xl border border-white bg-white p-4 shadow-sm">
                      <div className="flex flex-col gap-5">
                        <OnboardingField
                          id="community-name"
                          label="Community name"
                          required
                          error={nameErr}
                          hint="The name residents will recognize."
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
                          hint="Search, then drag the pin if it needs a nudge."
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
                      </div>
                      <div className="mt-4">
                        <OnboardingField
                          id="community-description"
                          label="Description"
                          hint="Optional. A short note helps us review the request."
                        >
                          <ClearableTextarea
                            id="community-description"
                            rows={3}
                            maxLength={1000}
                            className="min-h-[5.5rem] w-full resize-none rounded-xl border border-slate-200 px-3.5 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#1B4F8A] focus:ring-2 focus:ring-[#1B4F8A]/20"
                            value={description}
                            onChange={(e) => {
                              setDescription(e.target.value);
                              setFormError(null);
                            }}
                            placeholder="Optional note for the review"
                          />
                          {description.length > 0 ? (
                            <p className="text-right text-[11px] tabular-nums text-slate-500">
                              {description.length} / 1000
                            </p>
                          ) : null}
                        </OnboardingField>
                      </div>
                      <button
                        type="submit"
                        disabled={busy}
                        className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#1B4F8A] px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-[#163A66] focus:outline-none focus:ring-2 focus:ring-[#1B4F8A]/30 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {busy ? "Submitting…" : "Continue to profile"}
                      </button>
                    </div>
                  </div>
                </form>
              ) : selectedRegion ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  <CommunityList
                    key={selectedRegion.id}
                    className="min-h-0 flex-1"
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

function IllustratedEmpty({
  title,
  body,
  className,
}: {
  title: string;
  body: string;
  className?: string;
}) {
  return (
    <div className={`flex min-h-[16rem] min-w-0 flex-1 flex-col items-center justify-center rounded-[1.25rem] border border-[#E6EEF8] bg-[#F7FAFE] px-6 py-8 text-center ${className ?? ""}`}>
      <TownIllustration />
      <p className="mt-2 text-[1.35rem] font-bold tracking-tight text-[#0A2A43]">{title}</p>
      <p className="mt-2 max-w-md text-[14px] leading-relaxed text-slate-500">{body}</p>
    </div>
  );
}

function SetupWelcomePanel() {
  return (
    <IllustratedEmpty
      title="Search on the left"
      body="Choose a country, state, and city. Communities for that place will show here."
    />
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
    <IllustratedEmpty
      title="No region found"
      body="Try a nearby city. If this place should be available, contact support."
    />
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
    const base = countries.map((item) => ({
      value: String(item.id),
      label: item.name,
      iconUrl: flagImageUrl(item.code),
    }));
    if (country && !base.some((opt) => opt.value === String(country.id))) {
      return [{ value: String(country.id), label: country.name, iconUrl: flagImageUrl(country.code) }, ...base];
    }
    return base;
  }, [countries, country]);

  const stateOptions = useMemo(() => {
    const base = states.map((item) => ({
      value: String(item.id),
      label: item.name,
      iconUrl: country ? subdivisionFlagUrl(country.code, item.code) : undefined,
    }));
    if (state && !base.some((opt) => opt.value === String(state.id))) {
      return [{
        value: String(state.id),
        label: state.name,
        iconUrl: country ? subdivisionFlagUrl(country.code, state.code) : undefined,
      }, ...base];
    }
    return base;
  }, [states, state, country]);

  const cityOptions = useMemo(() => {
    const base = cities.map((item) => ({ value: item.name, label: item.name, iconUrl: CITY_ICON }));
    const cityName = city?.name?.trim();
    if (cityName && !base.some((opt) => opt.value === cityName)) {
      return [{ value: cityName, label: cityName, iconUrl: CITY_ICON }, ...base];
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
        <div className="mt-4 flex items-center gap-2.5 rounded-2xl border border-[#1B4F8A]/10 bg-white px-3 py-2.5 shadow-sm">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EEF4FF] text-[#1B4F8A]">
            <MapPin className="h-3.5 w-3.5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#1B4F8A]">Location confirmed</p>
            <p className="text-[13px] font-semibold leading-snug text-slate-900">
              Ready to choose a community
            </p>
          </div>
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1B4F8A] text-white">
            <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
          </span>
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
            <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <Users className="h-3.5 w-3.5 text-[#1B4F8A]" aria-hidden />
              Communities
            </p>
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

      {showEmpty ? (
        <CommunityEmptyState query={trimmedQuery} />
      ) : (
      <div
        ref={scrollRef}
        className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-2xl border border-[#0A2A43]/8 bg-[linear-gradient(180deg,#F8FBFE_0%,#FFFFFF_28%)] py-2 pl-2 pr-0.5 [scrollbar-width:thin]"
        onScroll={handleScroll}
      >
        {loading && communities.length === 0 ? (
          <CommunityListSkeleton count={COMMUNITIES_VISIBLE_ROWS} />
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
      )}

      <button
        type="button"
        onClick={onAdd}
        className="mt-4 inline-flex h-12 w-full shrink-0 items-center justify-center gap-2 rounded-2xl border border-dashed border-[#A9C4F2] bg-[#F4F8FF] px-4 text-[14px] font-semibold text-[#2F6FE0] transition hover:border-[#2F6FE0] hover:bg-[#EAF2FF]"
      >
        <Plus className="h-4 w-4" aria-hidden />
        Request to Add Community
      </button>
    </div>
  );
}

function CommunityEmptyState({ query }: { query: string }) {
  return (
    <IllustratedEmpty
      className="mt-3"
      title={query ? "No communities match your search" : "No communities listed yet"}
      body={
        query
          ? "Try another name, or request to add the community below."
          : "This location does not have a community yet. Request one below and we will review it before residents can join."
      }
    />
  );
}

const CITY_ICON =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="3" y="9" width="18" height="12" rx="2" fill="#EEF3F8" stroke="#8AA0B8" stroke-width="1.4"/><path d="M8 21v-7h3v7M13 21V11h3v10" stroke="#8AA0B8" stroke-width="1.2"/><rect x="9" y="3.5" width="6" height="5.5" rx="1" fill="#E4EBF3" stroke="#8AA0B8" stroke-width="1.2"/></svg>`,
  );

function flagImageUrl(code: string | null | undefined) {
  const cc = (code ?? "").trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(cc)) return undefined;
  return `https://flagcdn.com/w40/${cc}.png`;
}

function subdivisionFlagUrl(countryCode: string | null | undefined, stateCode: string | null | undefined) {
  const cc = (countryCode ?? "").trim().toLowerCase();
  const sc = (stateCode ?? "").trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(cc) || !/^[a-z0-9]{1,3}$/.test(sc)) return undefined;
  return `https://flagcdn.com/w40/${cc}-${sc}.png`;
}

function SetupHeaderArt() {
  return (
    <svg viewBox="0 0 240 96" className="pointer-events-none absolute right-6 top-3 hidden h-[5.4rem] w-auto sm:block" aria-hidden>
      <path d="M8 82c40-18 78-20 224-6v20H8Z" fill="#E8F2FB" />
      <path d="M176 14c0-7 10-7 10 0 0 6-5 8-5 14 0-6-5-8-5-14Z" fill="#2F6FE0" />
      <circle cx="181" cy="12" r="2.2" fill="#fff" />
      <rect x="36" y="52" width="26" height="26" rx="2" fill="#D5E4F5" />
      <polygon points="32,54 49,38 66,54" fill="#B7CCE4" />
      <rect x="86" y="44" width="36" height="34" rx="2" fill="#E7F1FB" stroke="#D3E2F2" />
      <polygon points="82,46 104,28 126,46" fill="#C5D6EA" />
      <rect x="148" y="36" width="48" height="42" rx="3" fill="#F4F8FC" stroke="#D5E3F2" />
      <polygon points="144,38 172,16 200,38" fill="#C9D9EC" />
      <rect x="160" y="48" width="8" height="8" rx="1" fill="#fff" stroke="#D5E3F2" />
      <rect x="174" y="48" width="8" height="8" rx="1" fill="#fff" stroke="#D5E3F2" />
      <rect x="160" y="60" width="8" height="8" rx="1" fill="#fff" stroke="#D5E3F2" />
      <rect x="174" y="60" width="8" height="8" rx="1" fill="#fff" stroke="#D5E3F2" />
      <circle cx="70" cy="66" r="8" fill="#C5E4D4" />
      <rect x="68" y="66" width="4" height="12" rx="1" fill="#8FB39A" />
      <circle cx="214" cy="62" r="8" fill="#C5E4D4" />
      <rect x="212" y="62" width="4" height="12" rx="1" fill="#8FB39A" />
    </svg>
  );
}

function TownIllustration() {
  return (
    <svg viewBox="0 0 240 128" className="h-32 w-auto" aria-hidden>
      <ellipse cx="120" cy="108" rx="86" ry="14" fill="#E7F0FA" />
      <path d="M46 86c20-26 40-28 62 0" fill="#F3F8FD" />
      <path d="M156 22l3.2 6.4 7 .8-5.2 4.6 1.5 6.8L156 37l-6.5 3.6 1.5-6.8-5.2-4.6 7-.8Z" fill="#8FB4F2" />
      <rect x="62" y="68" width="32" height="30" rx="2" fill="#D7E6F6" />
      <polygon points="56,70 78,50 100,70" fill="#B9CEE6" />
      <rect x="104" y="50" width="52" height="48" rx="3" fill="#F7FBFE" stroke="#D5E4F3" />
      <polygon points="98,52 130,26 162,52" fill="#C9D9EC" />
      <rect x="116" y="64" width="9" height="9" rx="1" fill="#fff" stroke="#E1EAF4" />
      <rect x="132" y="64" width="9" height="9" rx="1" fill="#fff" stroke="#E1EAF4" />
      <rect x="116" y="78" width="9" height="9" rx="1" fill="#fff" stroke="#E1EAF4" />
      <rect x="132" y="78" width="9" height="9" rx="1" fill="#fff" stroke="#E1EAF4" />
      <circle cx="48" cy="86" r="10" fill="#C7E6D6" />
      <rect x="46" y="86" width="4" height="14" rx="1" fill="#8FB39A" />
      <circle cx="186" cy="84" r="10" fill="#C7E6D6" />
      <rect x="184" y="84" width="4" height="14" rx="1" fill="#8FB39A" />
    </svg>
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
