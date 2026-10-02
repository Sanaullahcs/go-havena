"use client";

import { ClearableInput } from "@/components/admin/clearable-field";

import { useMemo, type ReactNode } from "react";
import { Globe, MapPin, Plus } from "lucide-react";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import { inputClass } from "@/lib/admin/form-validation-utils";
import type { Country, State } from "@/lib/api/geography";

export function toCountryOptions(countries: Country[]): SearchableSelectOption[] {
  return countries.map((country) => ({
    value: String(country.id),
    label: country.name,
    description: `${country.code}${country.billing_exempt ? " · No billing required" : ""}`,
  }));
}

export function toStateOptions(states: State[]): SearchableSelectOption[] {
  return states.map((state) => ({
    value: String(state.id),
    label: state.name,
  }));
}

type RegionGeographyFieldsProps = {
  countries: Country[];
  states: State[];
  countryId: number | "";
  stateId: number | "";
  onCountryChange: (countryId: number | "") => void;
  onStateChange: (stateId: number | "") => void;
  countryError?: string;
  stateError?: string;
  onCountryBlur?: () => void;
  onStateBlur?: () => void;
  newStateName?: string;
  onNewStateNameChange?: (value: string) => void;
  onCreateState?: () => void;
  creatingState?: boolean;
};

export function RegionGeographyFields({
  countries,
  states,
  countryId,
  stateId,
  onCountryChange,
  onStateChange,
  countryError,
  stateError,
  onCountryBlur,
  onStateBlur,
  newStateName = "",
  onNewStateNameChange,
  onCreateState,
  creatingState = false,
}: RegionGeographyFieldsProps) {
  const countryOptions = useMemo(() => toCountryOptions(countries), [countries]);
  const stateOptions = useMemo(() => toStateOptions(states), [states]);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Country" required icon={<Globe size={14} />} error={countryError}>
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
          emptyMessage="No countries match your search."
          searchable
          error={countryError ?? null}
        />
      </Field>

      <Field label="State / Province" required icon={<MapPin size={14} />} error={stateError}>
        <SearchableSelect
          className="w-full"
          value={stateId === "" ? "" : String(stateId)}
          onChange={(value) => {
            onStateChange(value ? Number(value) : "");
            onStateBlur?.();
          }}
          options={stateOptions}
          placeholder={countryId ? "Select state / province" : "Choose country first"}
          searchPlaceholder="Search states…"
          emptyMessage={countryId ? "No states found. Add one below." : "Select a country first."}
          searchable
          disabled={!countryId}
          error={stateError ?? null}
        />
      </Field>

      {countryId && states.length === 0 && onCreateState ? (
        <div className="sm:col-span-2">
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-3">
            <p className="text-[12px] font-medium text-slate-600">No states for this country yet</p>
            <p className="mt-0.5 text-[11px] text-slate-500">Add the first state or province, then create the region.</p>
            <div className="mt-3 flex gap-2">
              <ClearableInput
                className={inputClass(undefined, "nl-input flex-1")}
                placeholder="e.g. Punjab, Ontario, Bavaria"
                value={newStateName}
                onChange={(e) => onNewStateNameChange?.(e.target.value)}
              />
              <button
                type="button"
                className="nl-btn-secondary shrink-0"
                onClick={onCreateState}
                disabled={creatingState || newStateName.trim().length < 2}
              >
                <Plus size={14} />
                {creatingState ? "Adding…" : "Add state"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
        <span className="flex items-center gap-1.5 text-[13px] font-medium text-slate-700">
          {icon ? <span className="text-slate-400">{icon}</span> : null}
          {label}
          {required ? <span className="text-red-500"> *</span> : null}
        </span>
      ) : null}
      {children}
      {error ? <span className="block text-[11px] font-medium text-red-600">{error}</span> : null}
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
