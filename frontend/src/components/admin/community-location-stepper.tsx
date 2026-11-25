"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  fetchPublicCountries,
  fetchPublicCountryStates,
  fetchPublicStateCities,
  searchPublicCityRegion,
  type City,
  type Country,
  type PublicCityRegion,
  type State,
} from "@/lib/api/geography";

let cachedCountries: Country[] | null = null;
const statesCache = new Map<number, State[]>();
const citiesCache = new Map<number, City[]>();

export type ResolvedServiceRegion = {
  id: number;
  title: string;
  area: string;
  state_name: string | null;
  country_name: string | null;
};

type CommunityLocationStepperProps = {
  onResolved: (region: ResolvedServiceRegion | null) => void;
  /** Pre-select when requester already linked a region row (optional). */
  seedArea?: string | null;
};

export function CommunityLocationStepper({ onResolved, seedArea }: CommunityLocationStepperProps) {
  const [countries, setCountries] = useState<Country[]>(() => cachedCountries ?? []);
  const [states, setStates] = useState<State[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [country, setCountry] = useState<Country | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [city, setCity] = useState<City | null>(null);
  const [loadingCountries, setLoadingCountries] = useState(() => !cachedCountries?.length);
  const [loadingStates, setLoadingStates] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState<ResolvedServiceRegion | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const onResolvedRef = useRef(onResolved);
  onResolvedRef.current = onResolved;

  useEffect(() => {
    if (cachedCountries?.length) return;
    let cancelled = false;
    setLoadingCountries(true);
    void fetchPublicCountries()
      .then((res) => {
        if (cancelled) return;
        cachedCountries = res.data ?? [];
        setCountries(cachedCountries);
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
    const cached = statesCache.get(country.id);
    if (cached?.length) {
      setStates(cached);
      return;
    }
    let cancelled = false;
    setLoadingStates(true);
    void fetchPublicCountryStates(country.id)
      .then((res) => {
        if (cancelled) return;
        const list = res.data ?? [];
        statesCache.set(country.id, list);
        setStates(list);
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
    const cached = citiesCache.get(state.id);
    if (cached?.length) {
      setCities(cached);
      return;
    }
    let cancelled = false;
    setLoadingCities(true);
    void fetchPublicStateCities(state.id)
      .then((res) => {
        if (cancelled) return;
        const list = res.data ?? [];
        citiesCache.set(state.id, list);
        setCities(list);
      })
      .finally(() => {
        if (!cancelled) setLoadingCities(false);
      });
    return () => {
      cancelled = true;
    };
  }, [state?.id]);

  useEffect(() => {
    if (!state?.id || !city?.name?.trim()) {
      setResolved(null);
      setResolveError(null);
      onResolvedRef.current(null);
      return;
    }

    let cancelled = false;
    setResolving(true);
    setResolveError(null);
    setResolved(null);
    onResolvedRef.current(null);

    void searchPublicCityRegion({
      ...(country?.id ? { country_id: country.id } : {}),
      state_id: state.id,
      city: city.name.trim(),
    })
      .then((res) => {
        if (cancelled) return;
        const row = res.data as PublicCityRegion;
        const next: ResolvedServiceRegion = {
          id: row.id,
          title: row.hierarchy_label ?? row.title,
          area: row.area,
          state_name: row.state_name,
          country_name: row.country_name,
        };
        setResolved(next);
        onResolvedRef.current(next);
      })
      .catch(() => {
        if (cancelled) return;
        setResolveError(
          seedArea && city.name.toLowerCase() === seedArea.toLowerCase()
            ? "No service region for this city yet. Add it under System Admin → Regions, then try again."
            : "No service region in this city. Pick another city or create the region first.",
        );
        onResolvedRef.current(null);
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });

    return () => {
      cancelled = true;
    };
  }, [country?.id, state?.id, city?.name, seedArea]);

  const countryOptions = useMemo(
    () => countries.map((item) => ({ value: String(item.id), label: item.name })),
    [countries],
  );
  const stateOptions = useMemo(
    () => states.map((item) => ({ value: String(item.id), label: item.name })),
    [states],
  );
  const cityOptions = useMemo(() => {
    const base = cities.map((item) => ({ value: item.name, label: item.name }));
    const name = city?.name?.trim();
    if (name && !base.some((opt) => opt.value === name)) {
      return [{ value: name, label: name }, ...base];
    }
    return base;
  }, [cities, city]);

  const hint = !country
    ? "Country, then state, then city — same path community admins use at signup."
    : !state
      ? `Choose a state in ${country.name}.`
      : loadingCities
        ? "Loading cities…"
        : !city
          ? `Choose a city in ${state.name}.`
          : resolving
            ? "Checking service region…"
            : resolveError
              ? resolveError
              : resolved
                ? ""
                : "Select a city to match a service region.";

  const fields = [
    {
      key: "country",
      label: "Country",
      value: country ? String(country.id) : "",
      valueLabel: country?.name,
      options: countryOptions,
      placeholder: loadingCountries ? "Loading…" : "Select country",
      disabled: loadingCountries && !country,
      done: Boolean(country),
      open: true,
      onChange: (value: string) => {
        const next = countries.find((c) => String(c.id) === value) ?? null;
        setCountry(next);
        setState(null);
        setCity(null);
      },
    },
    {
      key: "state",
      label: "State / province",
      value: state ? String(state.id) : "",
      valueLabel: state?.name,
      options: stateOptions,
      placeholder: !country ? "Pick country first" : loadingStates ? "Loading…" : "Select state",
      disabled: !country || (loadingStates && !state),
      done: Boolean(state),
      open: Boolean(country),
      onChange: (value: string) => {
        const next = states.find((s) => String(s.id) === value) ?? null;
        setState(next);
        setCity(null);
      },
    },
    {
      key: "city",
      label: "City",
      value: city?.name ?? "",
      valueLabel: city?.name,
      options: cityOptions,
      placeholder: !state ? "Pick state first" : loadingCities ? "Loading…" : "Select city",
      disabled: !state || (loadingCities && !city),
      done: Boolean(city),
      open: Boolean(state),
      allowCustom: true,
      onChange: (value: string) => {
        const next =
          cities.find((c) => c.name === value)
          ?? (value ? { id: 0, state_id: state?.id ?? 0, name: value } : null);
        setCity(next);
      },
    },
  ] as const;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Service area</p>
      {hint ? (
        <p className={`mt-2 text-[12px] leading-relaxed ${resolveError ? "text-red-600" : "text-slate-500"}`}>
          {hint}
        </p>
      ) : null}
      <ol className="mt-3 space-y-0">
        {fields.map((field, index) => (
          <li key={field.key} className={`relative flex gap-3 ${field.open ? "" : "opacity-40"}`}>
            <span className="flex w-5 shrink-0 flex-col items-center">
              <span
                className={`mt-2 h-2.5 w-2.5 rounded-full ${
                  field.done
                    ? "bg-teal-600"
                    : field.open
                      ? "border border-teal-600 bg-white"
                      : "border border-slate-300 bg-white"
                }`}
              />
              {index < fields.length - 1 ? <span className="w-px flex-1 bg-slate-200" /> : null}
            </span>
            <label className={`min-w-0 flex-1 ${index < fields.length - 1 ? "pb-3" : ""}`}>
              <span className="mb-1 block text-[11px] font-semibold text-slate-600">{field.label}</span>
              <SearchableSelect
                className="w-full"
                value={field.value}
                valueLabel={field.valueLabel}
                onChange={field.onChange}
                options={field.options}
                placeholder={field.placeholder}
                searchPlaceholder="Search…"
                emptyMessage="No matches."
                searchable
                allowCustom={"allowCustom" in field ? field.allowCustom : false}
                disabled={field.disabled}
              />
            </label>
          </li>
        ))}
      </ol>

      {resolved ? (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-teal-100 bg-white px-3 py-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700">
            <MapPin className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{resolved.title}</p>
            <p className="truncate text-xs text-slate-500">
              {[resolved.area, resolved.state_name, resolved.country_name].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}