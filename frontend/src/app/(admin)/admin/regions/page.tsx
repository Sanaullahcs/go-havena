"use client";

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
import { confirmDelete, toastError, toastSuccess } from "@/lib/alert";
import {
  createRegion,
  deleteRegion,
  fetchRegions,
  updateRegion,
  type Region,
} from "@/lib/api/regions";
import { apiError } from "@/lib/api/client";
import { PageError, PageLoader } from "@/components/shared/page-states";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ADMIN_TABLE_PAGE_SIZE } from "@/lib/admin/table-pagination";
import { useTouchedFieldErrors } from "@/hooks/use-touched-field-errors";
import { validateRegionForm } from "@/lib/admin/region-form-validation";
import { hasFieldErrors, inputClass } from "@/lib/admin/form-validation-utils";

type StatusFilter = "all" | "active" | "inactive";

const emptyForm = {
  title: "",
  area: "",
  state: "",
  users_label: "0 users",
  sort_order: 0,
  status: "active" as Region["status"],
};

export default function RegionsPage() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 450);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
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
      const res = await fetchRegions(params);
      setRegions(res.data);
      setTotal(res.meta.total);
      setLastPage(res.meta.last_page ?? 1);
    } catch (err) {
      setError(apiError(err));
    } finally {
      hasLoadedOnce.current = true;
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [debouncedSearch, statusFilter, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  const isSearchPending = searchInput.trim() !== debouncedSearch.trim();

  const stats = useMemo(() => {
    const active = regions.filter((r) => r.status === "active").length;
    const inactive = regions.filter((r) => r.status === "inactive").length;
    return { active, inactive };
  }, [regions]);

  const statusFilters = useMemo(
    () => [
      { key: "all" as StatusFilter, label: "All", count: total },
      { key: "active" as StatusFilter, label: "Active", count: stats.active },
      { key: "inactive" as StatusFilter, label: "Inactive", count: stats.inactive },
    ],
    [total, stats.active, stats.inactive],
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
      title: region.title,
      area: region.area,
      state: region.state ?? "",
      users_label: region.users_label,
      sort_order: region.sort_order,
      status: region.status,
    });
    resetTouched();
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!validateOnSubmit(liveErrors)) return;

    setSubmitting(true);
    try {
      const payload = {
        title: form.title.trim(),
        area: form.area.trim(),
        state: form.state.trim() || undefined,
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
      await load(true);
    } catch (err) {
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

    try {
      await deleteRegion(region.id);
      toastSuccess("Region deleted.");
      await load(true);
    } catch (err) {
      toastError(apiError(err));
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
            Add and manage regions shown during mobile signup and community requests.
          </p>
        </div>
        <button type="button" onClick={openCreate} className="nl-btn-primary">
          <IcoPlus /> Add Region
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Total Regions"
          value={String(total)}
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
        {refreshing ? (
          <div
            className="pointer-events-none absolute inset-0 z-20 flex items-start justify-center rounded-xl bg-white/55 pt-24 backdrop-blur-[1px]"
            aria-live="polite"
            aria-busy="true"
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-[12px] font-medium text-slate-600 shadow-sm">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
              Updating results…
            </span>
          </div>
        ) : null}

        <DataTable
          title="All Regions"
          totalCount={total}
          visibleCount={regions.length}
          search={searchInput}
          onSearch={setSearchInput}
          searching={isSearchPending || refreshing}
          searchPlaceholder="Search title, area, state…"
          filters={statusFilters}
          activeFilter={statusFilter}
          onFilter={setStatusFilter}
          isEmpty={regions.length === 0}
          empty="No regions match your filters."
        >
          <DtTable>
            <DtHead
              cols={[
                { label: "Title" },
                { label: "Area" },
                { label: "State" },
                { label: "Users label" },
                { label: "Status" },
                { label: "Order" },
                { label: "", right: true },
              ]}
            />
            <tbody>
              {regions.map((region) => (
                <DtRow key={region.id} muted={region.status === "inactive"}>
                  <DtCell first>
                    <p className="font-semibold text-slate-900">{region.title}</p>
                  </DtCell>
                  <DtCell>{region.area}</DtCell>
                  <DtCell nowrap muted>
                    {region.state || "—"}
                  </DtCell>
                  <DtCell nowrap muted>
                    {region.users_label}
                  </DtCell>
                  <DtCell nowrap>
                    <AdminBadge tone={region.status === "active" ? "green" : "slate"}>
                      {region.status === "active" ? "Active" : "Inactive"}
                    </AdminBadge>
                  </DtCell>
                  <DtCell nowrap muted>
                    {region.sort_order}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-6 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-600">
                {editing ? "Edit region" : "New region"}
              </p>
              <h3 className="mt-1 text-xl font-bold text-slate-900">
                {editing ? "Update Region" : "Add Region"}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Regions appear in the mobile app onboarding flow.
              </p>
            </div>

            <div className="space-y-4 px-6 py-5">
              <Field label="Title" required error={showError("title", liveErrors)}>
                <input
                  className={inputClass(showError("title", liveErrors), "nl-input w-full")}
                  placeholder="Florida - Miami-Dade County"
                  value={form.title}
                  onChange={(e) => {
                    clearError("title");
                    setForm({ ...form, title: e.target.value });
                  }}
                  onBlur={() => touch("title")}
                />
              </Field>
              <Field label="Area" required error={showError("area", liveErrors)}>
                <input
                  className={inputClass(showError("area", liveErrors), "nl-input w-full")}
                  placeholder="Miami-Dade County"
                  value={form.area}
                  onChange={(e) => {
                    clearError("area");
                    setForm({ ...form, area: e.target.value });
                  }}
                  onBlur={() => touch("area")}
                />
              </Field>
              <Field label="State">
                <input
                  className="nl-input w-full"
                  placeholder="Florida"
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value })}
                />
              </Field>
              <Field label="Users label">
                <input
                  className="nl-input w-full"
                  placeholder="12,450 users"
                  value={form.users_label}
                  onChange={(e) => setForm({ ...form, users_label: e.target.value })}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Sort order">
                  <input
                    className="nl-input w-full"
                    type="number"
                    min={0}
                    value={form.sort_order}
                    onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Status">
                  <select
                    className="nl-input nl-select w-full"
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as Region["status"] })}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </Field>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
              <button
                type="button"
                className="nl-btn-secondary"
                onClick={() => setModalOpen(false)}
                disabled={submitting}
              >
                Cancel
              </button>
              <button type="button" className="nl-btn-primary" onClick={handleSave} disabled={submitting || !canSubmitForm}>
                {submitting ? "Saving…" : editing ? "Save changes" : "Create region"}
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
