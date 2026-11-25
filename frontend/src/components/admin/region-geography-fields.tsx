"use client";

import { useMemo, type ReactNode } from "react";
import { Building2, Globe, MapPin } from "lucide-react";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import type { City, Country, State } from "@/lib/api/geography";

export function toCountryOptions(countries: Country[]): SearchableSelectOption[] {
  return countries.map((country) => ({
    value: String(country.id),
    label: country.name,
    description: country.billing_exempt ? "No billing" : undefined,
  }));
}

export function toStateOptions(states: State[]): SearchableSelectOption[] {
  return states.map((state) => ({
    value: String(state.id),
    label: state.name,
  }));
}

export function toCityOptions(cities: City[], currentCity?: string): SearchableSelectOption[] {
  const base = cities.map((city) => ({
    value: city.name,
    label: city.name,
  }));
  const name = currentCity?.trim();
  if (name && !base.some((opt) => opt.value.toLowerCase() === name.toLowerCase())) {
    return [{ value: name, label: name }, ...base];
  }
  return base;
}

type RegionGeographyFieldsProps = {
  countries: Country[];
  states: State[];
  cities: City[];
  countryId: number | "";
  stateId: number | "";
  city: string;
  loadingStates?: boolean;
  loadingCities?: boolean;
  onCountryChange: (countryId: number | "") => void;
  onStateChange: (stateId: number | "") => void;
  onCityChange: (city: string) => void;
  countryError?: string;
  stateError?: string;
  cityError?: string;
  onCountryBlur?: () => void;
  onStateBlur?: () => void;
  onCityBlur?: () => void;
};

export function RegionGeographyFields({
  countries,
  states,
  cities,
  countryId,
  stateId,
  city,
  loadingStates = false,
  loadingCities = false,
  onCountryChange,
  onStateChange,
  onCityChange,
  countryError,
  stateError,
  cityError,
  onCountryBlur,
  onStateBlur,
  onCityBlur,
}: RegionGeographyFieldsProps) {
  const countryOptions = useMemo(() => toCountryOptions(countries), [countries]);
  const stateOptions = useMemo(() => toStateOptions(states), [states]);
  const cityOptions = useMemo(() => toCityOptions(cities, city), [cities, city]);

  const statePlaceholder = !countryId
    ? "Choose country first"
    : loadingStates
      ? "Loading states…"
      : "Select state / province";

  const cityPlaceholder = !stateId
    ? "Choose state first"
    : loadingCities
      ? "Loading cities…"
      : cityOptions.length
        ? "Select city"
        : "Search or type a city";

  return (
    <div className="space-y-3">
      <Field label="Country" required icon={<Globe size={15} />} error={countryError}>
        <SearchableSelect
          className="w-full"
          value={countryId === "" ? "" : String(countryId)}
          onChange={(value) => {
            onCountryChange(value ? Number(value) : "");
            onCountryBlur?.();
          }}
          options={countryOptions}
          placeholder="Select country"
          searchPlaceholder="Search countries…"
          emptyMessage="No countries match."
          searchable
          error={countryError ?? null}
        />
      </Field>

      <Field label="State / province" required icon={<MapPin size={15} />} error={stateError}>
        <SearchableSelect
          className="w-full"
          value={stateId === "" ? "" : String(stateId)}
          onChange={(value) => {
            onStateChange(value ? Number(value) : "");
            onStateBlur?.();
          }}
          options={stateOptions}
          placeholder={statePlaceholder}
          searchPlaceholder="Search states…"
          emptyMessage={loadingStates ? "Loading…" : countryId ? "No states in this country." : "Select a country first."}
          searchable
          disabled={!countryId || loadingStates}
          error={stateError ?? null}
        />
      </Field>

      <Field label="City" required icon={<Building2 size={15} />} error={cityError}>
        <SearchableSelect
          className="w-full"
          value={city}
          onChange={(value) => onCityChange(value)}
          onBlur={onCityBlur}
          options={cityOptions}
          placeholder={cityPlaceholder}
          searchPlaceholder="Search cities…"
          emptyMessage={loadingCities ? "Loading city list…" : "Type a city name to add it."}
          searchable
          combobox
          allowCustom
          disabled={!stateId || loadingCities}
          error={cityError ?? null}
          valueLabel={city || undefined}
        />
      </Field>
    </div>
  );
}

function Field({
  label,
  required,
  icon,
  error,
  children,
}: {
  label?: string;
  required?: boolean;
  icon?: React.ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0 space-y-1.5">
      {label ? (
        <span className="flex items-center gap-2 text-[13px] font-medium text-slate-600">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500">{icon}</span>
          {label}
          {required ? <span className="text-red-500">*</span> : null}
        </span>
      ) : null}
      {children}
      {error ? <span className="block pl-9 text-[11px] font-medium text-red-600">{error}</span> : null}
    </label>
  );
}

type RegionFilterBarProps = {
  countries: Country[];
  states: State[];
  countryFilter: "all" | number;
  stateFilter: "all" | number;
  onCountryFilterChange: (value: "all" | number) => void;
  onStateFilterChange: (value: "all" | number) => void;
};

export function RegionFilterBar({
  countries,
  states,
  countryFilter,
  stateFilter,
  onCountryFilterChange,
  onStateFilterChange,
}: RegionFilterBarProps) {
  const countryOptions = useMemo(
    () => [{ value: "all", label: "All countries", description: `${countries.length} available` }, ...toCountryOptions(countries)],
    [countries],
  );

  const stateOptions = useMemo(
    () => [{ value: "all", label: "All states" }, ...toStateOptions(states)],
    [states],
  );

  const filtersActive = countryFilter !== "all" || stateFilter !== "all";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="hidden h-4 w-px shrink-0 bg-slate-200 sm:block" aria-hidden />
      <SearchableSelect
        className="nl-picker-compact w-[172px]"
        value={countryFilter === "all" ? "all" : String(countryFilter)}
        onChange={(value) => {
          onCountryFilterChange(value === "all" || !value ? "all" : Number(value));
          onStateFilterChange("all");
        }}
        options={countryOptions}
        placeholder="All countries"
        searchPlaceholder="Filter countries…"
        emptyMessage="No countries match."
        searchable
      />
      <SearchableSelect
        className="nl-picker-compact w-[160px]"
        value={stateFilter === "all" ? "all" : String(stateFilter)}
        onChange={(value) => onStateFilterChange(value === "all" || !value ? "all" : Number(value))}
        options={stateOptions}
        placeholder="All states"
        searchPlaceholder="Filter states…"
        emptyMessage="No states match."
        searchable
        disabled={countryFilter === "all"}
      />
      {filtersActive ? (
        <button
          type="button"
          className="h-8 rounded-lg px-2.5 text-[12px] font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
          onClick={() => {
            onCountryFilterChange("all");
            onStateFilterChange("all");
          }}
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}