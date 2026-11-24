"use client";

import { ClearableInput } from "@/components/admin/clearable-field";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AdminActionsMenu } from "@/components/admin/admin-actions-menu";
import {
  AdminBadge,
  DataTable,
  DtCell,
  DtHead,
  DtPagination,
  DtRow,
  DtTable,
  StatTile,
} from "@/components/admin/ui";
import { alertWarning, confirmDelete, toastError, toastSuccess } from "@/lib/alert";
import { Check, X } from "lucide-react";
import {
  createRegion,
  deleteRegion,
  fetchRegions,
  updateRegion,
  type Region,
} from "@/lib/api/regions";
import { RegionFilterBar, RegionGeographyFields } from "@/components/admin/region-geography-fields";
import {
  fetchCountries,
  fetchPublicStateCities,
  fetchStates,
  type City,
  type Country,
  type State,
} from "@/lib/api/geography";
import { apiError } from "@/lib/api/client";
import { PageError, PageLoader } from "@/components/shared/page-states";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { adminTableBusy, isAdminSearchPending } from "@/lib/admin/table-loading";
import { ADMIN_TABLE_PAGE_SIZE } from "@/lib/admin/table-pagination";
import { useTouchedFieldErrors } from "@/hooks/use-touched-field-errors";
import {
  DUPLICATE_REGION_TITLE,
  duplicateRegionPopupMessage,
  findDuplicateCityRegion,
  isDuplicateRegionApiError,
  validateRegionForm,
} from "@/lib/admin/region-form-validation";
import { hasFieldErrors, inputClass } from "@/lib/admin/form-validation-utils";

type StatusFilter = "all" | "active" | "inactive";
type GeographyFilter = "all" | number;

const emptyForm = {
  country_id: "" as number | "",
  state_id: "" as number | "",
  city: "",
  title: "",
  users_label: "0 users",
  sort_order: 0,
  status: "active" as Region["status"],
};

export default function RegionsPage() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0 });
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 450);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [countryFilter, setCountryFilter] = useState<GeographyFilter>("all");
  const [stateFilter, setStateFilter] = useState<GeographyFilter>("all");
  const [countries, setCountries] = useState<Country[]>([]);
  const [states, setStates] = useState<State[]>([]);
  const [formStates, setFormStates] = useState<State[]>([]);
  const [formStatesLoading, setFormStatesLoading] = useState(false);
  const [formCities, setFormCities] = useState<City[]>([]);
  const [formCitiesLoading, setFormCitiesLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Region | null>(null);
  const [form, setForm] = useState(emptyForm);
  const { touch, clearError, showError, validateOnSubmit, resetTouched } = useTouchedFieldErrors();
  const [submitting, setSubmitting] = useState(false);
  const hasLoadedOnce = useRef(false);

  const liveErrors = useMemo(() => validateRegionForm(form), [form]);
  const canSubmitForm = !hasFieldErrors(liveErrors);

  const load = useCallback(async (silent = false) => {
    if (!hasLoadedOnce.current) {
      setInitialLoading(true);
    } else if (!silent) {
      setRefreshing(true);
    }
    setError(null);
    try {
      const params: Record<string, unknown> = { page, per_page: ADMIN_TABLE_PAGE_SIZE };
      if (debouncedSearch.trim()) params.q = debouncedSearch.trim();
      if (statusFilter !== "all") params.status = statusFilter;
      if (countryFilter !== "all") params.country_id = countryFilter;
      if (stateFilter !== "all") params.state_id = stateFilter;
      const res = await fetchRegions(params);
      setRegions(res.data);
      setTotal(res.meta.total);
      setLastPage(res.meta.last_page ?? 1);
      if (res.meta.stats) {
        setStats(res.meta.stats);
      }
    } catch (err) {
      setError(apiError(err));
    } finally {
      hasLoadedOnce.current = true;
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [debouncedSearch, statusFilter, countryFilter, stateFilter, page]);

  useEffect(() => {
    fetchCountries()
      .then((res) => setCountries(res.data))
      .catch(() => setCountries([]));
  }, []);

  useEffect(() => {
    if (countryFilter === "all") {
      setStates([]);
      setStateFilter("all");
      return;
    }

    fetchStates({ country_id: countryFilter, status: "active" })
      .then((res) => setStates(res.data))
      .catch(() => setStates([]));
  }, [countryFilter]);

  useEffect(() => {
    if (!form.country_id) {
      setFormStates([]);
      setFormStatesLoading(false);
      return;
    }

    let cancelled = false;
    setFormStatesLoading(true);
    setFormStates([]);
    fetchStates({ country_id: Number(form.country_id), status: "active" })
      .then((res) => {
        if (!cancelled) setFormStates(res.data);
      })
      .catch(() => {
        if (!cancelled) setFormStates([]);
      })
      .finally(() => {
        if (!cancelled) setFormStatesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [form.country_id]);

  useEffect(() => {
    if (!form.state_id) {
      setFormCities([]);
      setFormCitiesLoading(false);
      return;
    }

    let cancelled = false;
    setFormCitiesLoading(true);
    setFormCities([]);
    fetchPublicStateCities(Number(form.state_id))
      .then((res) => {
        if (!cancelled) setFormCities(res.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setFormCities([]);
      })
      .finally(() => {
        if (!cancelled) setFormCitiesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [form.state_id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, countryFilter, stateFilter]);

  const isSearchPending = isAdminSearchPending(searchInput, debouncedSearch);

  const statusFilters = useMemo(
    () => [
      { key: "all" as StatusFilter, label: "All", count: stats.total },
      { key: "active" as StatusFilter, label: "Active", count: stats.active },
      { key: "inactive" as StatusFilter, label: "Inactive", count: stats.inactive },
    ],
    [stats.total, stats.active, stats.inactive],
  );

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    resetTouched();
    setModalOpen(true);
  };

  const openEdit = (region: Region) => {
    setEditing(region);
    setForm({
      country_id: region.country_id ?? "",
      state_id: region.state_id ?? "",
      city: region.is_city_level === false ? "" : region.area,
      title: region.title,
      users_label: region.users_label,
      sort_order: region.sort_order,
      status: region.status,
    });
    resetTouched();
    setModalOpen(true);
  };

  const suggestTitle = useCallback(
    (city: string) => {
      if (editing || !city.trim()) return;
      const country = countries.find((c) => c.id === Number(form.country_id));
      const state = formStates.find((s) => s.id === Number(form.state_id));
      if (!country || !state) return;
      const next = `${country.name} - ${state.name} - ${city.trim()}`;
      setForm((prev) => (prev.title.trim() ? prev : { ...prev, title: next }));
    },
    [countries, editing, form.country_id, form.state_id, formStates],
  );

  const handleSave = async () => {
    if (!validateOnSubmit(liveErrors)) return;

    setSubmitting(true);
    try {
      const stateId = Number(form.state_id);
      const city = form.city.trim();
      const duplicate = await findDuplicateCityRegion(stateId, city, editing?.id ?? null);
      if (duplicate) {
        await alertWarning(DUPLICATE_REGION_TITLE, duplicateRegionPopupMessage(duplicate.title));
        return;
      }

      const payload = {
        title: form.title.trim(),
        area: city,
        state_id: stateId,
        users_label: form.users_label.trim() || "0 users",
        sort_order: Number(form.sort_order) || 0,
        status: form.status,
      };

      if (editing) {
        await updateRegion(editing.id, payload);
        toastSuccess("Region updated.");
      } else {
        await createRegion(payload);
        toastSuccess("Region created.");
      }
      setModalOpen(false);
      const filtersActive =
        countryFilter !== "all" || stateFilter !== "all" || searchInput.trim() !== "";
      setSearchInput("");
      setCountryFilter("all");
      setStateFilter("all");
      setPage(1);
      if (!filtersActive) {
        await load(true);
      }
    } catch (err) {
      if (isDuplicateRegionApiError(err)) {
        await alertWarning(DUPLICATE_REGION_TITLE, duplicateRegionPopupMessage(form.title.trim()));
        return;
      }
      toastError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (region: Region) => {
    const result = await confirmDelete({
      title: "Delete region?",
      text: `Remove <strong>${region.title}</strong> from the mobile onboarding list.`,
      confirmText: "Delete region",
    });
    if (!result.isConfirmed) return;

    setSubmitting(true);
    try {
      await deleteRegion(region.id);
      toastSuccess("Region deleted.");
      await load(true);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (initialLoading) return <PageLoader skeleton />;
  if (error && regions.length === 0) return <PageError message={error} onRetry={() => load()} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="nl-eyebrow">System Admin</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Regions</h2>
          <p className="mt-1 text-sm text-slate-500">
            Manage regions by country and state. Pakistan regions do not require subscription or card.
          </p>
        </div>
        <button type="button" onClick={openCreate} className="nl-btn-primary">
          <IcoPlus /> Add Region
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Total Regions"
          value={String(stats.total)}
          hint="All regions"
          tone="blue"
          icon={<IcoGlobe />}
        />
        <StatTile
          label="Active"
          value={String(stats.active)}
          hint="Visible in mobile app"
          tone="green"
          icon={<IcoCheck />}
        />
        <StatTile
          label="Inactive"
          value={String(stats.inactive)}
          hint="Hidden from onboarding"
          tone="slate"
          icon={<IcoPause />}
        />
      </div>

      <div className="relative">
        <DataTable
          title="All Regions"
          totalCount={total}
          visibleCount={regions.length}
          search={searchInput}
          onSearch={setSearchInput}
          searching={isSearchPending}
          loading={adminTableBusy(refreshing, submitting)}
          searchPlaceholder="Search title, area, country…"
          filters={statusFilters}
          activeFilter={statusFilter}
          onFilter={setStatusFilter}
          isEmpty={regions.length === 0}
          empty={
            countryFilter !== "all" || stateFilter !== "all" || searchInput.trim()
              ? "No regions match these country/state filters. Clear the filters to see all regions."
              : "No regions yet. Click Add Region to create one."
          }
          toolbar={
            <RegionFilterBar
              countries={countries}
              states={states}
              countryFilter={countryFilter}
              stateFilter={stateFilter}
              onCountryFilterChange={setCountryFilter}
              onStateFilterChange={setStateFilter}
            />
          }
        >
          <DtTable>
            <DtHead
              cols={[
                { label: "Title" },
                { label: "Country" },
                { label: "State" },
                { label: "City" },
                { label: "Billing" },
                { label: "Status" },
                { label: "", right: true },
              ]}
            />
            <tbody>
              {regions.map((region) => (
                <DtRow key={region.id} muted={region.status === "inactive"}>
                  <DtCell first>
                    <p className="font-semibold text-slate-900">{region.title}</p>
                    <p className="text-xs text-slate-500">{region.users_label}</p>
                  </DtCell>
                  <DtCell nowrap>{region.country_name || "—"}</DtCell>
                  <DtCell nowrap muted>
                    {region.state_name || region.state || "—"}
                  </DtCell>
                  <DtCell>{region.area}</DtCell>
                  <DtCell nowrap>
                    <AdminBadge tone={region.billing_exempt ? "green" : "blue"}>
                      {region.billing_exempt ? "Exempt" : "Required"}
                    </AdminBadge>
                  </DtCell>
                  <DtCell nowrap>
                    <AdminBadge tone={region.status === "active" ? "green" : "slate"}>
                      {region.status === "active" ? "Active" : "Inactive"}
                    </AdminBadge>
                  </DtCell>
                  <DtCell last right>
                    <AdminActionsMenu
                      actions={[
                        { label: "Edit", icon: "edit", onClick: () => openEdit(region) },
                        { label: "Delete", icon: "delete", tone: "danger", onClick: () => handleDelete(region) },
                      ]}
                    />
                  </DtCell>
                </DtRow>
              ))}
            </tbody>
          </DtTable>
          <DtPagination
            showing={regions.length}
            total={total}
            page={page}
            lastPage={lastPage}
            onPageChange={setPage}
          />
        </DataTable>
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-[3px]">
          <div className="my-auto flex max-h-[min(92vh,720px)] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-white/20 bg-white shadow-[0_24px_80px_-12px_rgba(15,23,42,0.35)]">
            <div className="shrink-0 px-6 pb-2 pt-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-teal-600">
                    {editing ? "Edit" : "New"} region
                  </p>
                  <h3 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
                    {editing ? "Update service area" : "Add service area"}
                  </h3>
                </div>
                <button
                  type="button"
                  className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                  onClick={() => setModalOpen(false)}
                  disabled={submitting}
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
                Same path community admins use: country, state, then city.
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              <div className="rounded-2xl bg-gradient-to-b from-slate-50/90 to-white p-4 ring-1 ring-slate-100">
                <RegionGeographyFields
                  countries={countries}
                  states={formStates}
                  cities={formCities}
                  countryId={form.country_id}
                  stateId={form.state_id}
                  city={form.city}
                  loadingStates={formStatesLoading}
                  loadingCities={formCitiesLoading}
                  countryError={showError("country_id", liveErrors)}
                  stateError={showError("state_id", liveErrors)}
                  cityError={showError("city", liveErrors)}
                  onCountryChange={(countryId) => {
                    clearError("country_id");
                    clearError("state_id");
                    clearError("city");
                    setForm((prev) => ({ ...prev, country_id: countryId, state_id: "", city: "" }));
                  }}
                  onStateChange={(stateId) => {
                    clearError("state_id");
                    clearError("city");
                    setForm((prev) => ({ ...prev, state_id: stateId, city: "" }));
                  }}
                  onCityChange={(cityName) => {
                    clearError("city");
                    setForm((prev) => ({ ...prev, city: cityName }));
                    suggestTitle(cityName);
                  }}
                  onCountryBlur={() => touch("country_id")}
                  onStateBlur={() => touch("state_id")}
                  onCityBlur={() => touch("city")}
                />
              </div>

              <div className="mt-5 space-y-4">
                <Field label="Display title" required error={showError("title", liveErrors)}>
                  <ClearableInput
                    className={inputClass(showError("title", liveErrors), "nl-input w-full")}
                    placeholder="Pakistan - Punjab - Lahore"
                    value={form.title}
                    onChange={(e) => {
                      clearError("title");
                      setForm({ ...form, title: e.target.value });
                    }}
                    onBlur={() => touch("title")}
                  />
                </Field>

                <div className="space-y-1.5">
                  <span className="text-[13px] font-medium text-slate-600">Visibility</span>
                  <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100/80 p-1">
                    {(["active", "inactive"] as const).map((value) => {
                      const selected = form.status === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                            selected
                              ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80"
                              : "text-slate-500 hover:text-slate-700"
                          }`}
                          onClick={() => setForm({ ...form, status: value })}
                        >
                          {value === "active" ? "Active" : "Inactive"}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 gap-2 border-t border-slate-100 px-6 py-4">
              <button
                type="button"
                className="nl-btn-secondary flex-1"
                onClick={() => setModalOpen(false)}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="nl-btn-primary flex-[1.2]"
                onClick={handleSave}
                disabled={submitting || !canSubmitForm}
              >
                <Check />
                {submitting ? "Saving…" : editing ? "Save" : "Create"}
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
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[13px] font-medium text-slate-700">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </span>
      {children}
      {error ? <span className="block text-[11px] font-medium text-red-600">{error}</span> : null}
    </label>
  );
}
function IcoPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IcoGlobe() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 12h18M12 3c2.5 2.8 4 6 4 9s-1.5 6.2-4 9M12 3c-2.5 2.8-4 6-4 9s1.5 6.2 4 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IcoCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 12l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IcoPause() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10 9v6M14 9v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
