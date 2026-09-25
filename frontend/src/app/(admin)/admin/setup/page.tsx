"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, ChevronLeft, ChevronRight, Lock, MapPin, Plus, Search, X } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  fetchPublicCountries,
  fetchPublicCountryStates,
  fetchPublicStateCities,
  resolvePublicLocation,
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
import { confirmAdminSignOutAndRedirect } from "@/lib/auth/sign-out";
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
  const [countryFilter, setCountryFilter] = useState<Country | null>(null);
  const [stateFilter, setStateFilter] = useState<State | null>(null);
  const [cityFilter, setCityFilter] = useState<City | null>(null);
  const [createCity, setCreateCity] = useState("");
  const [selectedRegion, setSelectedRegion] = useState<PublicRegion | null>(null);

  const [communities, setCommunities] = useState<PublicCommunity[]>([]);
  const [communitiesLoaded, setCommunitiesLoaded] = useState(false);
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
    void resolvePublicLocation({
      ...(countryFilter?.id ? { country_id: countryFilter.id } : {}),
      state_id: stateFilter.id,
      ...(cityFilter?.name ? { city: cityFilter.name } : {}),
    })
      .then((res) => {
        if (cancelled || !res.data) return;
        setRegions([{
          id: res.data.id,
          title: res.data.title,
          area: res.data.area,
          state_id: res.data.state_id,
          state_name: res.data.state_name,
          country_id: res.data.country_id,
          country_name: res.data.country_name,
          status: res.data.status,
        }]);
      })
      .catch(() => {
        if (!cancelled) setFormError("Could not open that location. Try again.");
      })
      .finally(() => {
        if (!cancelled) setRegionsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [countryFilter?.id, stateFilter?.id, cityFilter?.name]);

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
        description: description.trim() || undefined,
        region_id: selectedRegion.id,
        city: createCity.trim() || cityFilter?.name || undefined,
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

  const nameErr =
    name.length >= COMMUNITY_SETUP_NAME_MAX
      ? COMMUNITY_SETUP_NAME_MAX_MESSAGE
      : showError("name", liveErrors);
  const addressErr = showError("address", liveErrors);
  const regionLabel = selectedRegion?.title ?? "your region";

  if (view === "regions") {
    return (
      <div className="w-full min-w-0">
        <section className="mx-auto w-full max-w-[26rem] overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white">
          <header className="px-6 pb-1 pt-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Find your area
            </p>
            <h1 className="mt-2 font-[family-name:var(--font-brand)] text-[1.55rem] font-bold leading-[1.15] tracking-tight text-[#1B4F8A]">
              Where do you operate?
            </h1>
            <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
              Country, then state, then city. Residents use this same path.
            </p>
          </header>
          <div className="px-6 pb-6 pt-5">
            {formError ? (
              <div
                className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
                role="alert"
              >
                {formError}
              </div>
            ) : null}
            <RegionList
              loading={!regionsLoaded}
              regions={regions}
              country={countryFilter}
              state={stateFilter}
              city={cityFilter}
              onApplyFilter={({ country, state, city }) => {
                setCountryFilter(country);
                setStateFilter(state);
                setCityFilter(city);
                setSelectedRegion(null);
              }}
              onSelect={selectRegion}
            />
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0">
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)] lg:gap-10">
        <aside className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#1B4F8A]">
            {view === "communities" ? "Select community" : "Add community"}
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-brand)] text-[1.75rem] font-bold tracking-tight text-slate-900 sm:text-[2.1rem]">
            {view === "communities" ? "Select your community" : "Request to add a community"}
          </h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-600 sm:text-[15px]">
            {view === "communities"
              ? `Communities in ${regionLabel}. Choose one without an admin, or request to add a new one.`
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

        <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_12px_36px_-22px_rgba(27,79,138,0.4)]">
          <div className="p-4 sm:p-5 lg:p-6">
          {formError ? (
            <div
              className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
              role="alert"
            >
              {formError}
            </div>
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
                hint="Enter the community name your residents will recognize."
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
                  maxLength={COMMUNITY_SETUP_NAME_MAX}
                  onChange={(e) => {
                    setName(e.target.value.slice(0, COMMUNITY_SETUP_NAME_MAX));
                    clearError("name");
                    setFormError(null);
                  }}
                  onBlur={() => touch("name")}
                  placeholder="e.g. Palm Court HOA"
                  aria-invalid={Boolean(nameErr)}
                />
              </OnboardingField>

              <CityField
                stateId={selectedRegion.state_id ?? stateFilter?.id ?? null}
                value={createCity}
                onChange={setCreateCity}
              />

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
                <textarea
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
                <p className="text-right text-[11px] tabular-nums text-slate-500">
                  {description.length} / 1000
                </p>
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
  loading,
  regions,
  country,
  state,
  city,
  onApplyFilter,
  onSelect,
}: {
  loading: boolean;
  regions: PublicRegion[];
  country: Country | null;
  state: State | null;
  city: City | null;
  onApplyFilter: (next: { country: Country | null; state: State | null; city: City | null }) => void;
  onSelect: (region: PublicRegion) => void;
}) {
  const [countries, setCountries] = useState<Country[]>([]);
  const [states, setStates] = useState<State[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [loadingStates, setLoadingStates] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    if (!country?.id) {
      setStates([]);
      return;
    }
    let cancelled = false;
    setLoadingStates(true);
    void fetchPublicCountryStates(country.id)
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
  }, [country?.id]);

  useEffect(() => {
    if (!state?.id) {
      setCities([]);
      return;
    }
    let cancelled = false;
    setLoadingCities(true);
    void fetchPublicStateCities(state.id)
      .then((res) => {
        if (!cancelled) setCities(res.data ?? []);
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

  const countryOptions = useMemo(
    () => countries.map((item) => ({ value: String(item.id), label: item.name })),
    [countries],
  );
  const stateOptions = useMemo(
    () => states.map((item) => ({ value: String(item.id), label: item.name })),
    [states],
  );
  const cityOptions = useMemo(
    () => cities.map((item) => ({ value: item.name, label: item.name })),
    [cities],
  );

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
            ? "Pinning this city…"
            : "";

  const fields = [
    {
      key: "country",
      label: "Country",
      value: country ? String(country.id) : "",
      options: countryOptions,
      placeholder: loadingCountries ? "Loading…" : "Where in the world?",
      searchPlaceholder: "Search countries…",
      emptyMessage: "No countries match.",
      disabled: loadingCountries,
      allowCustom: false,
      onChange: (value: string) => applyLocation(value, "", ""),
      done: Boolean(country),
      open: true,
    },
    {
      key: "state",
      label: "State",
      value: state ? String(state.id) : "",
      options: stateOptions,
      placeholder: !country ? "Pick a country first" : loadingStates ? "Loading…" : "Which state?",
      searchPlaceholder: "Search states…",
      emptyMessage: "No states match.",
      disabled: !country || loadingStates,
      allowCustom: false,
      onChange: (value: string) => applyLocation(country ? String(country.id) : "", value, ""),
      done: Boolean(state),
      open: Boolean(country),
    },
    {
      key: "city",
      label: "City",
      value: city?.name ?? "",
      options: cityOptions,
      placeholder: !state ? "Pick a state first" : loadingCities ? "Loading…" : "Which city?",
      searchPlaceholder: "Search cities…",
      emptyMessage: "No cities match.",
      disabled: !state || loadingCities,
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

      {readyRegion ? (
        <div className="mt-5 flex items-center gap-3 border-t border-slate-100 pt-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E8F0F7] text-[#1B4F8A]">
            <MapPin className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold text-slate-900">
              {readyRegion.area || readyRegion.title}
            </p>
            <p className="truncate text-[12px] text-slate-400">
              {[readyRegion.state_name, readyRegion.country_name].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onApplyFilter({ country: null, state: null, city: null })}
            className="text-[12px] font-medium text-slate-400 hover:text-slate-700"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => onSelect(readyRegion)}
            className="inline-flex h-9 items-center gap-1 rounded-full bg-[#1B4F8A] px-3.5 text-[12px] font-semibold text-white"
          >
            Continue
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
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

function CityField({
  stateId,
  value,
  onChange,
}: {
  stateId: number | null;
  value: string;
  onChange: (next: string) => void;
}) {
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!stateId) {
      setCities([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchPublicStateCities(stateId)
      .then((res) => {
        if (!cancelled) setCities(res.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setCities([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [stateId]);

  return (
    <OnboardingField
      id="community-city"
      label="City"
      hint="Choose the city residents will search for"
    >
      <SearchableSelect
        value={value}
        onChange={onChange}
        options={cities.map((item) => ({ value: item.name, label: item.name }))}
        placeholder={
          !stateId
            ? "Select a region first"
            : loading
              ? "Loading cities…"
              : "Select city"
        }
        searchPlaceholder="Search cities…"
        emptyMessage="No cities match your search."
        searchable
        allowCustom
        disabled={!stateId || loading}
      />
    </OnboardingField>
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
