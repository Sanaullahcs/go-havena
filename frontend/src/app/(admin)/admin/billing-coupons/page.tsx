"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AdminActionsMenu } from "@/components/admin/admin-actions-menu";
import { ThemedSelect } from "@/components/ui/themed-select";
import {
  AdminBadge,
  DataTable,
  DtCell,
  DtHead,
  DtPagination,
  DtRow,
  DtTable,
} from "@/components/admin/ui";
import { confirmAction, toastError, toastSuccess } from "@/lib/alert";
import { formatMoney } from "@/lib/api/billing";
import {
  createSubscriptionCoupon,
  fetchSubscriptionCoupons,
  setSubscriptionCouponStatus,
  updateSubscriptionCoupon,
  type SubscriptionCoupon,
} from "@/lib/api/subscription-coupons";
import { apiError, apiFieldErrors } from "@/lib/api/client";
import { PageError, PageLoader } from "@/components/shared/page-states";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useTouchedFieldErrors } from "@/hooks/use-touched-field-errors";
import { validateCouponForm } from "@/lib/admin/coupon-form-validation";
import {
  datetimeLocalToIso,
  formatAdminDateTime,
  isoToDatetimeLocal,
} from "@/lib/admin/datetime-local";
import { hasFieldErrors, inputClass } from "@/lib/admin/form-validation-utils";
import { ADMIN_TABLE_PAGE_SIZE } from "@/lib/admin/table-pagination";

type StatusFilter = "all" | "active" | "inactive";

const emptyForm = {
  code: "",
  name: "",
  description: "",
  discount_type: "percent" as "percent" | "fixed",
  percent_off: "20",
  amount_off: "100",
  discount_duration: "once" as "once" | "repeating" | "forever",
  discount_months: "3",
  valid_from: "",
  valid_until: "",
  max_redemptions: "",
  applicable_plan_slugs: "",
  is_active: true,
};

function durationLabel(coupon: SubscriptionCoupon): string {
  if (coupon.discount_duration === "once") return "Once";
  if (coupon.discount_duration === "forever") return "Forever";
  return `${coupon.discount_months ?? 0} billing cycles`;
}

function discountLabel(coupon: SubscriptionCoupon): string {
  if (coupon.discount_type === "percent") return `${coupon.percent_off ?? 0}% off`;
  return `${formatMoney(coupon.amount_off_cents ?? 0, coupon.currency)} off`;
}

export default function BillingCouponsPage() {
  const [coupons, setCoupons] = useState<SubscriptionCoupon[]>([]);
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
  const [editing, setEditing] = useState<SubscriptionCoupon | null>(null);
  const [form, setForm] = useState(emptyForm);
  const { touch, clearError, showError, validateOnSubmit, resetTouched } = useTouchedFieldErrors();
  const [submitting, setSubmitting] = useState(false);
  const hasLoadedOnce = useRef(false);

  const liveErrors = useMemo(() => validateCouponForm(form), [form]);
  const canSubmitForm = !hasFieldErrors(liveErrors);

  const load = useCallback(async (silent = false) => {
    if (!hasLoadedOnce.current) setInitialLoading(true);
    else if (!silent) setRefreshing(true);
    setError(null);
    try {
      const params: Record<string, unknown> = { page, per_page: ADMIN_TABLE_PAGE_SIZE };
      if (debouncedSearch.trim()) params.q = debouncedSearch.trim();
      if (statusFilter !== "all") params.status = statusFilter;
      const res = await fetchSubscriptionCoupons(params);
      setCoupons(res.data);
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

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    resetTouched();
    setModalOpen(true);
  };

  const openEdit = (coupon: SubscriptionCoupon) => {
    setEditing(coupon);
    setForm({
      code: coupon.code,
      name: coupon.name,
      description: coupon.description ?? "",
      discount_type: coupon.discount_type,
      percent_off: String(coupon.percent_off ?? 20),
      amount_off: String((coupon.amount_off_cents ?? 0) / 100),
      discount_duration: coupon.discount_duration,
      discount_months: String(coupon.discount_months ?? 3),
      valid_from: isoToDatetimeLocal(coupon.valid_from),
      valid_until: isoToDatetimeLocal(coupon.valid_until),
      max_redemptions: coupon.max_redemptions ? String(coupon.max_redemptions) : "",
      applicable_plan_slugs: (coupon.applicable_plan_slugs ?? []).join(", "),
      is_active: coupon.is_active,
    });
    resetTouched();
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!validateOnSubmit(liveErrors)) return;

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        discount_type: form.discount_type,
        discount_duration: form.discount_duration,
        is_active: form.is_active,
        valid_from: datetimeLocalToIso(form.valid_from),
        valid_until: datetimeLocalToIso(form.valid_until),
        max_redemptions: form.max_redemptions ? Number(form.max_redemptions) : null,
        applicable_plan_slugs: form.applicable_plan_slugs
          ? form.applicable_plan_slugs.split(",").map((s) => s.trim()).filter(Boolean)
          : null,
      };

      if (form.discount_type === "percent") {
        payload.percent_off = Number(form.percent_off);
      } else {
        payload.amount_off_cents = Math.round(Number(form.amount_off) * 100);
      }

      if (form.discount_duration === "repeating") {
        payload.discount_months = Number(form.discount_months);
      }

      if (editing) {
        await updateSubscriptionCoupon(editing.id, payload);
        toastSuccess("Coupon updated. Existing redemptions keep their original terms.");
      } else {
        await createSubscriptionCoupon(payload);
        toastSuccess("Coupon created.");
      }

      setModalOpen(false);
      load(true);
    } catch (err) {
      const serverErrors = apiFieldErrors(err);
      if (hasFieldErrors(serverErrors)) {
        validateOnSubmit({ ...liveErrors, ...serverErrors });
      } else {
        toastError(apiError(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (coupon: SubscriptionCoupon) => {
    const next = !coupon.is_active;
    const result = await confirmAction({
      title: next ? "Activate this coupon?" : "Deactivate this coupon?",
      text: next
        ? "Community admins can redeem this code at checkout."
        : "Existing subscribers keep their discount. New redemptions will be blocked.",
      confirmText: next ? "Activate coupon" : "Deactivate coupon",
      icon: "question",
      color: next ? "green" : "amber",
    });
    if (!result.isConfirmed) return;

    try {
      await setSubscriptionCouponStatus(coupon.id, next);
      toastSuccess(next ? "Coupon activated." : "Coupon deactivated.");
      load(true);
    } catch (err) {
      toastError(apiError(err));
    }
  };

  const statusFilters = useMemo(
    () => [
      { key: "all" as StatusFilter, label: "All", count: total },
      { key: "active" as StatusFilter, label: "Active", count: coupons.filter((c) => c.is_active).length },
      { key: "inactive" as StatusFilter, label: "Inactive", count: coupons.filter((c) => !c.is_active).length },
    ],
    [total, coupons],
  );

  const isSearchPending = searchInput.trim() !== debouncedSearch.trim();

  if (initialLoading) return <PageLoader text="Loading coupons…" skeleton />;
  if (error && coupons.length === 0) return <PageError message={error} onRetry={() => load()} />;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-teal-700">Billing</p>
          <h1 className="text-2xl font-bold text-slate-900">Subscription coupons</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Create promo codes for community checkout. Discounts apply after the 30-day trial on paid invoices.
            Editing a coupon only affects future redemptions.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex h-10 items-center justify-center rounded-xl bg-teal-600 px-4 text-sm font-semibold text-white hover:bg-teal-700"
        >
          New coupon
        </button>
      </header>

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
          title="Subscription Coupons"
          totalCount={total}
          visibleCount={coupons.length}
          search={searchInput}
          onSearch={setSearchInput}
          searching={isSearchPending || refreshing}
          searchPlaceholder="Search code or name…"
          filters={statusFilters}
          activeFilter={statusFilter}
          onFilter={setStatusFilter}
          isEmpty={coupons.length === 0}
          empty="No coupons match your filters."
        >
          <DtTable>
            <DtHead
              cols={[
                { label: "Code" },
                { label: "Discount" },
                { label: "Duration" },
                { label: "Validity" },
                { label: "Redemptions" },
                { label: "Status" },
                { label: "", right: true },
              ]}
            />
            <tbody>
              {coupons.map((coupon) => (
                <DtRow key={coupon.id} muted={!coupon.is_active}>
                  <DtCell first>
                    <p className="font-semibold text-slate-900">{coupon.code}</p>
                    <p className="mt-0.5 text-[12px] text-slate-500">{coupon.name}</p>
                  </DtCell>
                  <DtCell nowrap>{discountLabel(coupon)}</DtCell>
                  <DtCell nowrap>{durationLabel(coupon)}</DtCell>
                  <DtCell>
                    <p className="text-[12px] text-slate-600">
                      {coupon.valid_from ? formatAdminDateTime(coupon.valid_from) : "Any time"}
                      {" → "}
                      {coupon.valid_until ? formatAdminDateTime(coupon.valid_until) : "No end"}
                    </p>
                  </DtCell>
                  <DtCell nowrap muted>
                    {coupon.reserved_redemptions}
                    {coupon.max_redemptions ? ` / ${coupon.max_redemptions}` : ""}
                  </DtCell>
                  <DtCell nowrap>
                    <AdminBadge tone={coupon.is_active ? "green" : "slate"}>
                      {coupon.is_active ? "Active" : "Inactive"}
                    </AdminBadge>
                  </DtCell>
                  <DtCell last right>
                    <AdminActionsMenu
                      actions={[
                        { label: "Edit", icon: "edit", onClick: () => openEdit(coupon) },
                        {
                          label: coupon.is_active ? "Deactivate" : "Activate",
                          icon: coupon.is_active ? "ban" : "approve",
                          tone: coupon.is_active ? "warning" : "success",
                          onClick: () => handleToggle(coupon),
                        },
                      ]}
                    />
                  </DtCell>
                </DtRow>
              ))}
            </tbody>
          </DtTable>
          <DtPagination
            showing={coupons.length}
            total={total}
            page={page}
            lastPage={lastPage}
            onPageChange={setPage}
          />
        </DataTable>
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-6 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-600">
                {editing ? "Edit coupon" : "New coupon"}
              </p>
              <h3 className="mt-1 text-xl font-bold text-slate-900">
                {editing ? "Update coupon" : "Create coupon"}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {editing
                  ? "Changes apply to future redemptions only. Existing subscribers keep their locked discount."
                  : "Community admins can apply this code at checkout after approval."}
              </p>
            </div>

            <div className="space-y-4 px-6 py-5">
              <Field label="Code" required error={showError("code", liveErrors)}>
                <input
                  className={inputClass(
                    showError("code", liveErrors),
                    editing
                      ? "nl-input w-full cursor-not-allowed bg-slate-50 font-mono uppercase text-slate-600"
                      : "nl-input w-full font-mono uppercase",
                  )}
                  placeholder="SUMMER26"
                  value={form.code}
                  readOnly={Boolean(editing)}
                  onBlur={() => touch("code")}
                  onChange={(e) => {
                    clearError("code");
                    setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }));
                  }}
                />
              </Field>
              {editing ? (
                <p className="-mt-2 text-[11px] text-slate-500">
                  Code can’t be changed after creation — Stripe promotion codes are immutable, and existing checkouts already reference this exact code. Create a new coupon if you need a different code.
                </p>
              ) : (
                <p className="-mt-2 text-[11px] text-slate-500">
                  Must be unique — community admins type this exact code at checkout. Existing code in your account: check the coupons table first.
                </p>
              )}

              <Field label="Name" required error={showError("name", liveErrors)}>
                <input
                  className={inputClass(showError("name", liveErrors), "nl-input w-full")}
                  placeholder="Launch promotion"
                  value={form.name}
                  onBlur={() => touch("name")}
                  onChange={(e) => {
                    clearError("name");
                    setForm((f) => ({ ...f, name: e.target.value }));
                  }}
                />
              </Field>

              <Field label="Description">
                <textarea
                  className="nl-input min-h-[72px] w-full resize-y"
                  placeholder="Optional internal note for admins."
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Discount type" required>
                  <ThemedSelect
                    value={form.discount_type}
                    fieldKey="discount_type"
                    onChange={(value) => {
                      touch("discount_type");
                      clearError("percent_off");
                      clearError("amount_off");
                      setForm((f) => ({ ...f, discount_type: value as "percent" | "fixed" }));
                    }}
                    options={[
                      { value: "percent", label: "Percent off" },
                      { value: "fixed", label: "Fixed amount off" },
                    ]}
                  />
                </Field>

                {form.discount_type === "percent" ? (
                  <Field label="Percent off" required error={showError("percent_off", liveErrors)}>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      className={inputClass(showError("percent_off", liveErrors), "nl-input w-full")}
                      placeholder="20"
                      value={form.percent_off}
                      onBlur={() => touch("percent_off")}
                      onChange={(e) => {
                        clearError("percent_off");
                        setForm((f) => ({ ...f, percent_off: e.target.value }));
                      }}
                    />
                  </Field>
                ) : (
                  <Field label="Amount off (USD)" required error={showError("amount_off", liveErrors)}>
                    <input
                      inputMode="decimal"
                      className={inputClass(showError("amount_off", liveErrors), "nl-input w-full")}
                      placeholder="100"
                      value={form.amount_off}
                      onBlur={() => touch("amount_off")}
                      onChange={(e) => {
                        clearError("amount_off");
                        setForm((f) => ({ ...f, amount_off: e.target.value }));
                      }}
                    />
                  </Field>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Discount duration" required>
                  <ThemedSelect
                    value={form.discount_duration}
                    fieldKey="discount_duration"
                    onChange={(value) => {
                      touch("discount_duration");
                      clearError("discount_months");
                      setForm((f) => ({
                        ...f,
                        discount_duration: value as "once" | "repeating" | "forever",
                      }));
                    }}
                    options={[
                      { value: "once", label: "Once (first paid invoice)" },
                      { value: "repeating", label: "Repeating billing cycles" },
                      { value: "forever", label: "Forever" },
                    ]}
                  />
                </Field>

                {form.discount_duration === "repeating" ? (
                  <Field label="Billing cycles" required error={showError("discount_months", liveErrors)}>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      className={inputClass(showError("discount_months", liveErrors), "nl-input w-full")}
                      placeholder="3"
                      value={form.discount_months}
                      onBlur={() => touch("discount_months")}
                      onChange={(e) => {
                        clearError("discount_months");
                        setForm((f) => ({ ...f, discount_months: e.target.value }));
                      }}
                    />
                  </Field>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Valid from" error={showError("valid_from", liveErrors)}>
                  <input
                    type="datetime-local"
                    className={inputClass(showError("valid_from", liveErrors), "nl-input w-full")}
                    value={form.valid_from}
                    onBlur={() => touch("valid_from")}
                    onChange={(e) => {
                      clearError("valid_from");
                      clearError("valid_until");
                      setForm((f) => ({ ...f, valid_from: e.target.value }));
                    }}
                  />
                </Field>
                <Field label="Valid until" error={showError("valid_until", liveErrors)}>
                  <input
                    type="datetime-local"
                    className={inputClass(showError("valid_until", liveErrors), "nl-input w-full")}
                    value={form.valid_until}
                    onBlur={() => touch("valid_until")}
                    onChange={(e) => {
                      clearError("valid_until");
                      setForm((f) => ({ ...f, valid_until: e.target.value }));
                    }}
                  />
                </Field>
              </div>
              <p className="-mt-2 text-[11px] text-slate-500">
                Times use your local timezone. Leave both empty for no start or end limit.
              </p>

              <Field label="Max redemptions" error={showError("max_redemptions", liveErrors)}>
                <input
                  type="number"
                  min={1}
                  className={inputClass(showError("max_redemptions", liveErrors), "nl-input w-full")}
                  placeholder="Unlimited"
                  value={form.max_redemptions}
                  onBlur={() => touch("max_redemptions")}
                  onChange={(e) => {
                    clearError("max_redemptions");
                    setForm((f) => ({ ...f, max_redemptions: e.target.value }));
                  }}
                />
              </Field>

              <Field label="Plan slugs (comma-separated)">
                <input
                  className="nl-input w-full"
                  placeholder="starter, growth"
                  value={form.applicable_plan_slugs}
                  onChange={(e) => setForm((f) => ({ ...f, applicable_plan_slugs: e.target.value }))}
                />
              </Field>
              <p className="-mt-2 text-[11px] text-slate-500">
                Restrict to specific plans, or leave empty for all plans.
              </p>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
              <button type="button" className="nl-btn-secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="nl-btn-primary"
                disabled={submitting || !canSubmitForm}
                onClick={() => void handleSave()}
              >
                {submitting ? "Saving…" : editing ? "Save changes" : "Create coupon"}
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
