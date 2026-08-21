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
import { confirmAction, toastError, toastSuccess } from "@/lib/alert";
import { Check, X } from "lucide-react";
import {
  createSubscriptionPlan,
  fetchSubscriptionPlans,
  setSubscriptionPlanStatus,
  updateSubscriptionPlan,
  type SubscriptionPlan,
} from "@/lib/api/subscription-plans";
import { formatMoney } from "@/lib/api/billing";
import { apiError } from "@/lib/api/client";
import { PageError, PageLoader } from "@/components/shared/page-states";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ADMIN_TABLE_PAGE_SIZE } from "@/lib/admin/table-pagination";
import { useTouchedFieldErrors } from "@/hooks/use-touched-field-errors";
import {
  centsToDollarInput,
  dollarsToCents,
  validatePlanForm,
  yearlyFromMonthly,
} from "@/lib/admin/plan-form-validation";
import { hasFieldErrors, inputClass } from "@/lib/admin/form-validation-utils";

type StatusFilter = "all" | "active" | "inactive";

const emptyForm = {
  name: "",
  description: "",
  seat_limit: "50",
  price_monthly: "99",
  price_yearly: "990",
  trial_period_days: "30",
  sort_order: "0",
  is_active: true,
  is_recommended: false,
};

export default function BillingPlansPage() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [stripeConfigured, setStripeConfigured] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 450);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SubscriptionPlan | null>(null);
  const [form, setForm] = useState(emptyForm);
  const { touch, clearError, showError, validateOnSubmit, resetTouched } = useTouchedFieldErrors();
  const [submitting, setSubmitting] = useState(false);
  const hasLoadedOnce = useRef(false);

  const liveErrors = useMemo(() => validatePlanForm(form), [form]);
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
      const res = await fetchSubscriptionPlans(params);
      setPlans(res.data);
      setTotal(res.meta.total);
      setLastPage(res.meta.last_page ?? 1);
      setStripeConfigured(Boolean(res.meta.stripe_configured));
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
    const active = plans.filter((p) => p.is_active).length;
    const inactive = plans.filter((p) => !p.is_active).length;
    return { active, inactive };
  }, [plans]);

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

  const openEdit = (plan: SubscriptionPlan) => {
    setEditing(plan);
    setForm({
      name: plan.name,
      description: plan.description ?? "",
      seat_limit: String(plan.seat_limit),
      price_monthly: centsToDollarInput(plan.price_monthly_cents),
      price_yearly: centsToDollarInput(plan.price_yearly_cents),
      trial_period_days: String(plan.trial_period_days),
      sort_order: String(plan.sort_order),
      is_active: plan.is_active,
      is_recommended: plan.is_recommended,
    });
    resetTouched();
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!validateOnSubmit(liveErrors)) return;

    const monthly = dollarsToCents(form.price_monthly);
    const yearly = dollarsToCents(form.price_yearly);
    if (monthly === null || yearly === null) return;

    const priceChanged =
      Boolean(editing) &&
      (monthly !== editing!.price_monthly_cents || yearly !== editing!.price_yearly_cents);

    if (priceChanged) {
      const result = await confirmAction({
        title: "Create new Stripe prices?",
        text: "Existing subscribers keep their current Stripe price. New checkouts will use the updated amount.",
        confirmText: "Update pricing",
        icon: "info",
        color: "blue",
      });
      if (!result.isConfirmed) return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        seat_limit: Number.parseInt(form.seat_limit, 10),
        price_monthly_cents: monthly,
        price_yearly_cents: yearly,
        trial_period_days: Number.parseInt(form.trial_period_days, 10),
        sort_order: Number.parseInt(form.sort_order, 10) || 0,
        is_active: form.is_active,
        is_recommended: form.is_recommended,
      };

      if (editing) {
        await updateSubscriptionPlan(editing.id, payload);
        toastSuccess("Plan updated.");
      } else {
        await createSubscriptionPlan(payload);
        toastSuccess("Plan created.");
      }
      setModalOpen(false);
      await load(true);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (plan: SubscriptionPlan) => {
    const next = !plan.is_active;
    const result = await confirmAction({
      title: next ? "Activate this plan?" : "Deactivate this plan?",
      text: next
        ? "New community admins will be able to choose this plan at checkout."
        : "New signups will not see this plan. Existing subscribers keep their current subscription and Stripe price.",
      confirmText: next ? "Activate plan" : "Deactivate plan",
      icon: "question",
      color: next ? "green" : "amber",
    });
    if (!result.isConfirmed) return;

    try {
      await setSubscriptionPlanStatus(plan.id, next);
      toastSuccess(next ? "Plan activated." : "Plan deactivated.");
      await load(true);
    } catch (err) {
      toastError(apiError(err));
    }
  };

  if (initialLoading) return <PageLoader skeleton />;
  if (error && plans.length === 0) return <PageError message={error} onRetry={() => load()} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="nl-eyebrow">System Admin</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Billing & Plans</h2>
          <p className="mt-1 text-sm text-slate-500">
            Manage subscription plans, resident limits, trial length, and USD pricing. Stripe prices
            are versioned so current subscribers are not moved automatically.
          </p>
        </div>
        <button type="button" onClick={openCreate} className="nl-btn-primary">
          <IcoPlus /> Add Plan
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Total Plans"
          value={String(total)}
          hint="Catalog in the database"
          tone="blue"
          icon={<IcoCard />}
        />
        <StatTile
          label="Active"
          value={String(stats.active)}
          hint="Shown at community checkout"
          tone="green"
          icon={<IcoCheck />}
        />
        <StatTile
          label="Inactive"
          value={String(stats.inactive)}
          hint="Hidden from new signups"
          tone="slate"
          icon={<IcoPause />}
        />
      </div>

      {!stripeConfigured ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          Stripe keys are not configured. Plans still save here; checkout will use the local billing
          driver until Stripe is connected.
        </p>
      ) : null}

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
          title="Subscription Plans"
          totalCount={total}
          visibleCount={plans.length}
          search={searchInput}
          onSearch={setSearchInput}
          searching={isSearchPending || refreshing}
          searchPlaceholder="Search name or slug…"
          filters={statusFilters}
          activeFilter={statusFilter}
          onFilter={setStatusFilter}
          isEmpty={plans.length === 0}
          empty="No plans match your filters."
        >
          <DtTable>
            <DtHead
              cols={[
                { label: "Plan" },
                { label: "Seats" },
                { label: "Monthly" },
                { label: "Yearly" },
                { label: "Trial" },
                { label: "Subscribers" },
                { label: "Status" },
                { label: "", right: true },
              ]}
            />
            <tbody>
              {plans.map((plan) => (
                <DtRow key={plan.id} muted={!plan.is_active}>
                  <DtCell first>
                    <p className="font-semibold text-slate-900">{plan.name}</p>
                    <p className="mt-0.5 text-[12px] text-slate-500">{plan.description || plan.slug}</p>
                    {plan.is_recommended ? (
                      <span className="mt-1 inline-flex rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-700">
                        Recommended
                      </span>
                    ) : null}
                  </DtCell>
                  <DtCell nowrap>{plan.seat_limit.toLocaleString()}</DtCell>
                  <DtCell nowrap>{formatMoney(plan.price_monthly_cents, plan.currency)}</DtCell>
                  <DtCell nowrap>{formatMoney(plan.price_yearly_cents, plan.currency)}</DtCell>
                  <DtCell nowrap muted>
                    {plan.trial_period_days} days
                  </DtCell>
                  <DtCell nowrap muted>
                    {plan.subscriber_count}
                  </DtCell>
                  <DtCell nowrap>
                    <AdminBadge tone={plan.is_active ? "green" : "slate"}>
                      {plan.is_active ? "Active" : "Inactive"}
                    </AdminBadge>
                  </DtCell>
                  <DtCell last right>
                    <AdminActionsMenu
                      actions={[
                        { label: "Edit", icon: "edit", onClick: () => openEdit(plan) },
                        {
                          label: plan.is_active ? "Deactivate" : "Activate",
                          icon: plan.is_active ? "ban" : "approve",
                          tone: plan.is_active ? "warning" : "success",
                          onClick: () => handleToggle(plan),
                        },
                      ]}
                    />
                  </DtCell>
                </DtRow>
              ))}
            </tbody>
          </DtTable>
          <DtPagination
            showing={plans.length}
            total={total}
            page={page}
            lastPage={lastPage}
            onPageChange={setPage}
          />
        </DataTable>
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-6 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-600">
                {editing ? "Edit plan" : "New plan"}
              </p>
              <h3 className="mt-1 text-xl font-bold text-slate-900">
                {editing ? "Update Plan" : "Add Plan"}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {editing
                  ? "Changing prices creates new Stripe prices. Current subscribers keep the price they already have."
                  : "New subscribers will use this plan’s latest active Stripe prices."}
              </p>
            </div>

            <div className="space-y-4 px-6 py-5">
              <Field label="Name" required error={showError("name", liveErrors)}>
                <input
                  className={inputClass(showError("name", liveErrors), "nl-input w-full")}
                  placeholder="Growth"
                  value={form.name}
                  onBlur={() => touch("name")}
                  onChange={(e) => {
                    clearError("name");
                    setForm({ ...form, name: e.target.value });
                  }}
                />
              </Field>

              <Field label="Description">
                <textarea
                  className="nl-input min-h-[72px] w-full resize-y"
                  placeholder="For mid-size neighborhoods and HOAs."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Resident limit" required error={showError("seat_limit", liveErrors)}>
                  <input
                    type="number"
                    min={1}
                    className={inputClass(showError("seat_limit", liveErrors), "nl-input w-full")}
                    value={form.seat_limit}
                    onBlur={() => touch("seat_limit")}
                    onChange={(e) => {
                      clearError("seat_limit");
                      setForm({ ...form, seat_limit: e.target.value });
                    }}
                  />
                </Field>
                <Field label="Trial period (days)" required error={showError("trial_period_days", liveErrors)}>
                  <input
                    type="number"
                    min={0}
                    max={365}
                    className={inputClass(showError("trial_period_days", liveErrors), "nl-input w-full")}
                    value={form.trial_period_days}
                    onBlur={() => touch("trial_period_days")}
                    onChange={(e) => {
                      clearError("trial_period_days");
                      setForm({ ...form, trial_period_days: e.target.value });
                    }}
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Monthly price (USD)" required error={showError("price_monthly", liveErrors)}>
                  <input
                    inputMode="decimal"
                    className={inputClass(showError("price_monthly", liveErrors), "nl-input w-full")}
                    placeholder="99"
                    value={form.price_monthly}
                    onBlur={() => touch("price_monthly")}
                    onChange={(e) => {
                      clearError("price_monthly");
                      clearError("price_yearly");
                      const monthly = e.target.value;
                      setForm({
                        ...form,
                        price_monthly: monthly,
                        price_yearly: yearlyFromMonthly(monthly),
                      });
                    }}
                  />
                </Field>
                <Field label="Yearly price (USD)" required error={showError("price_yearly", liveErrors)}>
                  <input
                    inputMode="decimal"
                    className={inputClass(showError("price_yearly", liveErrors), "nl-input w-full")}
                    placeholder="990"
                    value={form.price_yearly}
                    onBlur={() => touch("price_yearly")}
                    onChange={(e) => {
                      clearError("price_yearly");
                      setForm({ ...form, price_yearly: e.target.value });
                    }}
                  />
                </Field>
              </div>
              <p className="-mt-2 text-[11px] text-slate-500">
                Yearly price fills in as 10× monthly. You can still edit it.
              </p>

              <Field label="Display order">
                <input
                  type="number"
                  min={0}
                  className="nl-input w-full"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                />
              </Field>

              <div className="flex flex-col gap-2.5">
                <label className="flex items-center gap-2 text-[13px] text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  />
                  Active — available for new checkouts
                </label>
                <label className="flex items-center gap-2 text-[13px] text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.is_recommended}
                    onChange={(e) => setForm({ ...form, is_recommended: e.target.checked })}
                  />
                  Recommended plan
                </label>
              </div>

              {editing?.stripe_product_id ? (
                <p className="rounded-xl bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
                  Stripe product {editing.stripe_product_id}
                  {editing.stripe_price_monthly ? ` · monthly ${editing.stripe_price_monthly}` : ""}
                  {editing.stripe_price_yearly ? ` · yearly ${editing.stripe_price_yearly}` : ""}
                </p>
              ) : null}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
              <button type="button" className="nl-btn-secondary" onClick={() => setModalOpen(false)}>
                <X />
                Cancel
              </button>
              <button
                type="button"
                className="nl-btn-primary"
                disabled={submitting || !canSubmitForm}
                onClick={() => void handleSave()}
              >
                <Check />
                {submitting ? "Saving…" : editing ? "Save changes" : "Create plan"}
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

function IcoCard() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 10h18M7 15h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
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
