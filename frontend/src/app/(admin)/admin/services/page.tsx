"use client";

import { FormEvent, useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import { Droplets, Plus, Receipt, Users, UserCheck, X } from "lucide-react";
import { AdminActionsMenu } from "@/components/admin/admin-actions-menu";
import { noticeFieldsForSave, PropertyServiceFormModal } from "@/components/admin/property-service-form-modal";
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
import { PageError, PageLoader } from "@/components/shared/page-states";
import { ThemedSelect } from "@/components/ui/themed-select";
import { confirmAction, confirmDelete, toastError, toastSuccess } from "@/lib/alert";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ADMIN_TABLE_PAGE_SIZE } from "@/lib/admin/table-pagination";
import { adminClientTableBusy, isAdminSearchPending } from "@/lib/admin/table-loading";
import { apiError } from "@/lib/api/client";
import { formatCommunityMoney } from "@/lib/money";
import {
  approveServiceSubscription,
  createPropertyService,
  deletePropertyService,
  fetchAdminPropertyServices,
  fetchServiceSubscriptions,
  rejectServiceSubscription,
  SERVICE_CATEGORY_OPTIONS,
  serviceCategoryLabel,
  updatePropertyService,
  type PropertyService,
  type PropertyServiceForm,
  type ServiceSubscription,
} from "@/lib/api/property-services";

type TypeFilter = "all" | "automatic" | "optional";

type ScheduleFilter =
  | "all"
  | "automatic_monthly"
  | "automatic_yearly"
  | "one_time"
  | "optional_monthly"
  | "optional_yearly";

const SCHEDULE_FILTERS: ScheduleFilter[] = [
  "all",
  "automatic_monthly",
  "automatic_yearly",
  "one_time",
  "optional_monthly",
  "optional_yearly",
];

const SUBSCRIPTIONS_PAGE_SIZE = 6;

const emptyForm: PropertyServiceForm = {
  name: "",
  category: "water",
  custom_category: "",
  description: "",
  icon_key: "droplet",
  status: "active",
  application_type: "automatic",
  billing_frequency: "monthly",
  amount_type: "fixed",
  amount: 0,
  due_day: 10,
  first_billing_month: new Date().toISOString().slice(0, 7),
  payment_instructions: "",
  require_payment_proof: true,
  require_acknowledgement: false,
  auto_generate_bills: true,
  send_notice: true,
  send_notification: true,
  notice_title: "{{service}} — Unit {{unit}}",
  notice_body: "",
  requires_admin_approval: false,
  max_subscribers: null,
  unsubscribe_mode: "end_of_period",
};

function serviceToForm(service: PropertyService): PropertyServiceForm {
  return {
    name: service.name,
    category: (SERVICE_CATEGORY_OPTIONS.some((item) => item.value === service.category)
      ? service.category
      : "water") as PropertyServiceForm["category"],
    custom_category: service.custom_category ?? "",
    description: service.description ?? "",
    icon_key: service.icon_key ?? "droplet",
    status: service.status === "inactive" ? "inactive" : "active",
    application_type: service.application_type,
    billing_frequency: service.billing_frequency === "one_time"
      ? "one_time"
      : service.billing_frequency === "yearly"
        ? "yearly"
        : "monthly",
    amount_type: service.amount_type === "variable" ? "variable" : "fixed",
    amount: service.amount ?? 0,
    due_day: service.due_day ?? 10,
    first_billing_month: service.first_billing_month ?? new Date().toISOString().slice(0, 7),
    payment_instructions: service.payment_instructions ?? "",
    require_payment_proof: service.require_payment_proof,
    require_acknowledgement: service.require_acknowledgement,
    auto_generate_bills: service.auto_generate_bills,
    send_notice: service.send_notice,
    send_notification: service.send_notification,
    notice_title: service.notice_title ?? "",
    notice_body: service.notice_body ?? "",
    requires_admin_approval: service.requires_admin_approval,
    max_subscribers: service.max_subscribers ?? null,
    unsubscribe_mode: service.unsubscribe_mode === "immediate" ? "immediate" : "end_of_period",
  };
}

function amountLabel(service: Pick<PropertyService, "amount_type" | "amount">) {
  if (service.amount_type === "variable" || service.amount == null) return "Variable";
  return formatCommunityMoney(service.amount);
}

function frequencyLabel(service: PropertyService) {
  if (service.billing_frequency === "one_time") return "One-time";
  if (service.billing_frequency === "yearly") return "Yearly";
  return "Monthly";
}

function serviceFrequency(service: PropertyService) {
  if (service.billing_frequency === "yearly") return "yearly";
  if (service.billing_frequency === "one_time") return "one_time";
  return "monthly";
}

function scheduleFilterLabel(filter: ScheduleFilter) {
  if (filter === "all") return "All schedules";
  if (filter === "automatic_monthly") return "Automatic · Monthly";
  if (filter === "automatic_yearly") return "Automatic · Yearly";
  if (filter === "one_time") return "One-time";
  if (filter === "optional_monthly") return "Optional · Monthly";
  return "Optional · Yearly";
}

function matchesScheduleFilter(service: PropertyService, filter: ScheduleFilter) {
  if (filter === "all") return true;
  const frequency = serviceFrequency(service);
  const type = service.application_type === "optional" ? "optional" : "automatic";
  if (filter === "one_time") return frequency === "one_time";
  if (filter === "automatic_monthly") return type === "automatic" && frequency === "monthly";
  if (filter === "automatic_yearly") return type === "automatic" && frequency === "yearly";
  if (filter === "optional_monthly") return type === "optional" && frequency === "monthly";
  return type === "optional" && frequency === "yearly";
}

export default function AdminServicesPage() {
  const [services, setServices] = useState<PropertyService[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 400);
  const isSearchPending = isAdminSearchPending(searchInput, debouncedSearch);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [scheduleFilter, setScheduleFilter] = useState<ScheduleFilter>("all");
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PropertyService | null>(null);
  const [viewing, setViewing] = useState<PropertyService | null>(null);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<PropertyServiceForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [subscriptionService, setSubscriptionService] = useState<PropertyService | null>(null);
  const [subscriptions, setSubscriptions] = useState<ServiceSubscription[]>([]);
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(false);
  const [subscriptionPage, setSubscriptionPage] = useState(1);

  async function load(silent = false) {
    if (silent) setRefreshing(true);
    try {
      setError(null);
      const rows = await fetchAdminPropertyServices();
      setServices(rows);
      setViewing((current) => (current ? rows.find((row) => row.id === current.id) ?? null : null));
      setEditing((current) => (current ? rows.find((row) => row.id === current.id) ?? null : null));
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const stats = useMemo(() => {
    const automatic = services.filter((service) => service.application_type === "automatic");
    const optional = services.filter((service) => service.application_type === "optional");
    return {
      automatic: automatic.length,
      optional: optional.length,
      automaticSubscribers: automatic.reduce((max, service) => Math.max(max, service.active_subscribers ?? 0), 0),
      optionalSubscribers: optional.reduce((sum, service) => sum + (service.subscriber_count ?? service.active_subscribers ?? 0), 0),
    };
  }, [services]);

  const scoped = useMemo(
    () => (typeFilter === "all"
      ? services
      : services.filter((service) => service.application_type === typeFilter)),
    [services, typeFilter],
  );

  const scheduleOptions = useMemo(
    () => SCHEDULE_FILTERS.map((filter) => ({
      value: filter,
      label: scheduleFilterLabel(filter),
    })),
    [],
  );

  const filtered = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    return scoped.filter((service) => {
      if (!matchesScheduleFilter(service, scheduleFilter)) return false;
      if (!query) return true;
      const haystack = [
        service.name,
        service.description,
        service.application_type,
        service.billing_frequency,
        service.status,
        service.amount_type,
        serviceCategoryLabel(service.category, service.custom_category),
        frequencyLabel(service),
        amountLabel(service),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [scoped, debouncedSearch, scheduleFilter]);

  const deferredFiltered = useDeferredValue(filtered);
  const isDeferredPending = deferredFiltered !== filtered;
  const tableBusy = adminClientTableBusy(isPending, isDeferredPending, searchInput, debouncedSearch, refreshing, saving);

  const lastPage = Math.max(1, Math.ceil(deferredFiltered.length / ADMIN_TABLE_PAGE_SIZE));
  const paged = useMemo(() => {
    const start = (page - 1) * ADMIN_TABLE_PAGE_SIZE;
    return deferredFiltered.slice(start, start + ADMIN_TABLE_PAGE_SIZE);
  }, [deferredFiltered, page]);

  useEffect(() => {
    if (page > lastPage) setPage(lastPage);
  }, [page, lastPage]);

  const filters = useMemo(() => ([
    { key: "all" as const, label: "All", count: services.length },
    { key: "automatic" as const, label: "Automatic", count: stats.automatic },
    { key: "optional" as const, label: "Optional", count: stats.optional },
  ]), [services.length, stats.automatic, stats.optional]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setStep(1);
    setOpen(true);
  }

  function openEdit(service: PropertyService) {
    setEditing(service);
    setForm(serviceToForm(service));
    setStep(1);
    setViewing(null);
    setOpen(true);
  }

  function closeForm() {
    setOpen(false);
    setEditing(null);
    setStep(1);
    setForm(emptyForm);
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload: PropertyServiceForm = {
        ...form,
        ...noticeFieldsForSave(form),
        custom_category: form.category === "other" ? String(form.custom_category ?? "").trim() : null,
        amount: form.amount_type === "variable" ? null : Number(form.amount || 0),
        max_subscribers: form.max_subscribers || null,
        requires_admin_approval: form.application_type === "optional",
        auto_generate_bills: form.billing_frequency !== "one_time",
      };
      if (editing) {
        await updatePropertyService(editing.id, payload);
        toastSuccess("Service updated.");
      } else {
        await createPropertyService(payload);
        toastSuccess("Service published.");
      }
      closeForm();
      await load(true);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus(service: PropertyService) {
    const nextStatus = service.status === "active" ? "inactive" : "active";
    const markingInactive = nextStatus === "inactive";
    const result = await confirmAction({
      title: markingInactive ? `Mark ${service.name} inactive?` : `Activate ${service.name}?`,
      text: markingInactive
        ? "No new bills will be generated and residents will not be able to subscribe. Existing bills and records stay unchanged."
        : "New bills will follow the normal billing cycle and residents can subscribe again.",
      confirmText: markingInactive ? "Mark inactive" : "Activate",
      icon: markingInactive ? "warning" : "question",
      color: markingInactive ? "amber" : "green",
    });
    if (!result.isConfirmed) return;
    setSaving(true);
    try {
      const updated = await updatePropertyService(service.id, { status: nextStatus });
      toastSuccess(markingInactive ? "Service marked inactive." : "Service activated.");
      if (viewing?.id === service.id) setViewing(updated);
      await load(true);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(service: PropertyService) {
    const result = await confirmDelete({
      title: `Delete ${service.name}?`,
      text: "Bills and subscriptions for this service will also be removed.",
      confirmText: "Delete",
    });
    if (!result.isConfirmed) return;
    setSaving(true);
    try {
      await deletePropertyService(service.id);
      toastSuccess("Service deleted.");
      if (viewing?.id === service.id) setViewing(null);
      if (subscriptionService?.id === service.id) {
        setSubscriptionService(null);
        setSubscriptions([]);
      }
      await load(true);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSaving(false);
    }
  }

  async function openSubscriptions(service: PropertyService) {
    setSubscriptionService(service);
    setSubscriptionPage(1);
    setSubscriptionsLoading(true);
    try {
      setSubscriptions(await fetchServiceSubscriptions(service.id));
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSubscriptionsLoading(false);
    }
  }

  async function refreshSubscriptions() {
    if (!subscriptionService) return;
    setSubscriptions(await fetchServiceSubscriptions(subscriptionService.id));
    await load(true);
  }

  const subscriptionLastPage = Math.max(1, Math.ceil(subscriptions.length / SUBSCRIPTIONS_PAGE_SIZE));
  const safeSubscriptionPage = Math.min(subscriptionPage, subscriptionLastPage);
  const pagedSubscriptions = subscriptions.slice(
    (safeSubscriptionPage - 1) * SUBSCRIPTIONS_PAGE_SIZE,
    safeSubscriptionPage * SUBSCRIPTIONS_PAGE_SIZE,
  );

  useEffect(() => {
    if (subscriptionPage > subscriptionLastPage) setSubscriptionPage(subscriptionLastPage);
  }, [subscriptionPage, subscriptionLastPage]);

  if (loading) return <PageLoader />;
  if (error) return <PageError message={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Unit billing</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Services</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Automatic services bill every residential unit. Optional services bill the unit billing contact only after you approve the subscription request.
          </p>
        </div>
        <button type="button" onClick={openCreate} className="nl-btn-primary inline-flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Create service
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Automatic services" value={String(stats.automatic)} icon={<Droplets className="h-4 w-4" />} />
        <StatTile label="Optional services" value={String(stats.optional)} icon={<Receipt className="h-4 w-4" />} tone="emerald" />
        <StatTile
          label="Automatic subscribers"
          value={String(stats.automaticSubscribers)}
          hint="Residential units billed automatically"
          icon={<Users className="h-4 w-4" />}
          tone="blue"
        />
        <StatTile
          label="Optional subscribers"
          value={String(stats.optionalSubscribers)}
          hint="Active and pending opt-in subscriptions"
          icon={<UserCheck className="h-4 w-4" />}
          tone="emerald"
        />
      </div>

      <DataTable
        title="Community services"
        totalCount={scoped.length}
        visibleCount={filtered.length}
        search={searchInput}
        onSearch={(value) => startTransition(() => { setSearchInput(value); setPage(1); })}
        searching={isSearchPending}
        searchPlaceholder="Search by service name, category, or type"
        searchClassName="min-w-[14rem] w-full max-w-[22rem] sm:w-[22rem] sm:max-w-[22rem]"
        filters={filters}
        activeFilter={typeFilter}
        onFilter={(key) => startTransition(() => {
          setTypeFilter(key as TypeFilter);
          setScheduleFilter("all");
          setPage(1);
        })}
        toolbar={
          <>
            <span className="hidden h-4 w-px shrink-0 bg-slate-200 sm:block" aria-hidden />
            <div className="nl-picker-compact w-[208px]">
              <ThemedSelect
                value={scheduleFilter}
                onChange={(value) => startTransition(() => {
                  setScheduleFilter(value as ScheduleFilter);
                  setPage(1);
                })}
                options={scheduleOptions}
                placeholder="All schedules"
              />
            </div>
          </>
        }
        loading={tableBusy}
        empty={
          scoped.length === 0
            ? typeFilter === "all"
              ? "No services yet. Create water, waste, parking, or another unit charge."
              : `No ${typeFilter} services yet.`
            : scheduleFilter !== "all" && !debouncedSearch.trim()
              ? `No ${scheduleFilterLabel(scheduleFilter).toLowerCase()} services in this tab.`
              : "No services match your filters."
        }
        isEmpty={deferredFiltered.length === 0}
      >
        <DtTable>
          <DtHead
            cols={[
              { label: "Service" },
              { label: "Type" },
              { label: "Category" },
              { label: "Amount" },
              { label: "Subscribers" },
              { label: "Status" },
              { label: "Actions", right: true },
            ]}
          />
          <tbody>
            {paged.map((service) => (
              <DtRow key={service.id} muted={service.status !== "active"}>
                <DtCell first>
                  <p className="font-semibold text-slate-900">{service.name}</p>
                  <p className="text-xs text-slate-400">
                    {frequencyLabel(service)}
                    {service.due_day ? ` · due day ${service.due_day}` : ""}
                  </p>
                </DtCell>
                <DtCell>
                  <AdminBadge tone={service.application_type === "automatic" ? "blue" : "emerald"}>
                    {service.application_type === "automatic" ? "Automatic" : "Optional"}
                  </AdminBadge>
                </DtCell>
                <DtCell muted>{serviceCategoryLabel(service.category, service.custom_category)}</DtCell>
                <DtCell nowrap>{amountLabel(service)}</DtCell>
                <DtCell nowrap>
                  {service.subscriber_count ?? service.active_subscribers ?? 0}
                  {service.application_type === "optional" && service.max_subscribers
                    ? ` / ${service.max_subscribers}`
                    : ""}
                  {(service.pending_subscribers ?? 0) > 0 ? (
                    <span className="ml-1 text-xs font-medium text-amber-600">
                      ({service.pending_subscribers} pending)
                    </span>
                  ) : null}
                </DtCell>
                <DtCell>
                  <AdminBadge tone={service.status === "active" ? "emerald" : "slate"}>
                    {service.status === "active" ? "Active" : "Inactive"}
                  </AdminBadge>
                </DtCell>
                <DtCell last right>
                  <AdminActionsMenu
                    disabled={saving}
                    actions={[
                      { label: "View service detail", icon: "view", onClick: () => setViewing(service) },
                      { label: "Edit", icon: "edit", onClick: () => openEdit(service) },
                      {
                        label: "Subscriptions",
                        icon: "view",
                        hidden: service.application_type !== "optional",
                        onClick: () => void openSubscriptions(service),
                      },
                      {
                        label: service.status === "active" ? "Inactive" : "Activate",
                        icon: service.status === "active" ? "ban" : "check",
                        tone: service.status === "active" ? "warning" : "success",
                        onClick: () => void handleToggleStatus(service),
                      },
                      {
                        label: "Delete",
                        icon: "delete",
                        tone: "danger",
                        onClick: () => void handleDelete(service),
                      },
                    ]}
                  />
                </DtCell>
              </DtRow>
            ))}
          </tbody>
        </DtTable>
        <DtPagination
          showing={paged.length}
          total={deferredFiltered.length}
          page={page}
          lastPage={lastPage}
          onPageChange={(nextPage) => startTransition(() => setPage(nextPage))}
        />
      </DataTable>

      {viewing && (
        <ModalShell
          onClose={() => setViewing(null)}
          title="Service detail"
          subtitle={viewing.name}
          footer={
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="nl-btn-secondary" onClick={() => setViewing(null)}>Close</button>
              <button type="button" className="nl-btn-primary" onClick={() => openEdit(viewing)}>Update</button>
            </div>
          }
        >
          <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
            <DetailRow label="Type" value={viewing.application_type === "automatic" ? "Automatic" : "Optional"} />
            <DetailRow label="Category" value={serviceCategoryLabel(viewing.category, viewing.custom_category)} />
            <DetailRow label="Status" value={viewing.status === "active" ? "Active" : "Inactive"} />
            <DetailRow label="Amount" value={amountLabel(viewing)} />
            <DetailRow label="Frequency" value={frequencyLabel(viewing)} />
            <DetailRow
              label="Due date"
              value={
                viewing.billing_frequency === "yearly"
                  ? (viewing.first_billing_month
                    ? new Date(`${viewing.first_billing_month.slice(0, 7)}-01`).toLocaleDateString("en-US", { month: "long", year: "numeric" })
                    : "—")
                  : viewing.first_billing_month && viewing.due_day
                    ? new Date(`${viewing.first_billing_month.slice(0, 7)}-${String(viewing.due_day).padStart(2, "0")}`).toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                    : (viewing.first_billing_month || "—")
              }
            />
            <DetailRow
              label="Subscribers"
              value={
                [
                  viewing.application_type === "optional" && viewing.max_subscribers
                    ? `${viewing.subscriber_count ?? viewing.active_subscribers ?? 0} / ${viewing.max_subscribers}`
                    : String(viewing.subscriber_count ?? viewing.active_subscribers ?? 0),
                  (viewing.pending_subscribers ?? 0) > 0 ? `${viewing.pending_subscribers} pending` : null,
                ].filter(Boolean).join(" · ")
              }
            />
            <DetailRow
              label="Approval required"
              value={viewing.application_type === "optional" || viewing.requires_admin_approval ? "Yes" : "No"}
            />
            <DetailRow label="Payment proof" value={viewing.require_payment_proof ? "Required" : "Optional"} />
            <div className="min-w-0 sm:col-span-2">
              <DetailRow label="Description" value={viewing.description || "—"} />
            </div>
            <div className="min-w-0 sm:col-span-2">
              <DetailRow label="Payment instructions" value={viewing.payment_instructions || "—"} />
            </div>
          </dl>
        </ModalShell>
      )}

      {open && (
        <PropertyServiceFormModal
          editing={Boolean(editing)}
          form={form}
          setForm={setForm}
          step={step}
          setStep={setStep}
          saving={saving}
          onClose={closeForm}
          onSubmit={handleSave}
        />
      )}

      {subscriptionService && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Subscriptions</h2>
                <p className="mt-0.5 text-sm text-slate-500">{subscriptionService.name}</p>
              </div>
              <button
                type="button"
                onClick={() => { setSubscriptionService(null); setSubscriptions([]); setSubscriptionPage(1); }}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-[20rem] flex-1 overflow-y-scroll px-5 py-4 [scrollbar-gutter:stable]">
              {subscriptionsLoading ? (
                <p className="py-8 text-center text-sm text-slate-500">Loading subscriptions…</p>
              ) : subscriptions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
                  <p className="text-sm font-semibold text-slate-800">No subscriptions yet</p>
                  <p className="mt-1 text-sm text-slate-500">Residents who opt in to this service will appear here.</p>
                </div>
              ) : (
                <div className="space-y-3 pr-1">
                  {pagedSubscriptions.map((item) => {
                    const subscription = subscriptionStatusMeta(item.status, item.status_label);
                    const bill = billStatusMeta(item.latest_bill);
                    return (
                      <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Unit</p>
                            <p className="mt-0.5 text-base font-bold text-slate-900">
                              {item.unit_number || "—"}
                            </p>
                            <p className="mt-0.5 text-sm text-slate-500">
                              {item.requester_name || "Billing contact"}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <AdminBadge tone={subscription.tone}>{subscription.label}</AdminBadge>
                            <AdminBadge tone={bill.tone}>{bill.label}</AdminBadge>
                          </div>
                        </div>

                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <div className="rounded-lg bg-slate-50 px-3 py-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Subscription</p>
                            <p className="mt-0.5 text-sm font-medium text-slate-800">{subscription.label}</p>
                          </div>
                          <div className="rounded-lg bg-slate-50 px-3 py-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Bill status</p>
                            <p className="mt-0.5 text-sm font-medium text-slate-800">{bill.label}</p>
                            {item.latest_bill?.billing_period_label || item.latest_bill?.amount != null ? (
                              <p className="mt-0.5 text-xs text-slate-500">
                                {[
                                  item.latest_bill.billing_period_label,
                                  item.latest_bill.amount != null ? formatCommunityMoney(item.latest_bill.amount) : null,
                                ].filter(Boolean).join(" · ")}
                              </p>
                            ) : null}
                            {item.latest_bill?.acknowledged_at ? (
                              <p className="mt-0.5 text-xs text-slate-500">
                                {(item.latest_bill.acknowledged_by_name || item.requester_name || "Member")}
                                {" acknowledged "}
                                {formatAcknowledgedAt(item.latest_bill.acknowledged_at)}
                                {item.latest_bill.title ? ` · ${item.latest_bill.title}` : ""}
                              </p>
                            ) : null}
                          </div>
                        </div>

                        {item.note ? (
                          <p className="mt-3 text-sm text-slate-500">Note: {item.note}</p>
                        ) : null}

                        {item.status === "pending" ? (
                          <div className="mt-4 flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              className="nl-btn-secondary text-rose-700"
                              onClick={async () => {
                                const ok = await confirmAction({ title: "Decline subscription?", confirmText: "Decline" });
                                if (ok.isConfirmed) {
                                  await rejectServiceSubscription(item.id);
                                  await refreshSubscriptions();
                                }
                              }}
                            >
                              Decline
                            </button>
                            <button
                              type="button"
                              className="nl-btn-primary"
                              onClick={async () => {
                                await approveServiceSubscription(item.id);
                                await refreshSubscriptions();
                              }}
                            >
                              Approve
                            </button>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>

            {subscriptions.length > 0 ? (
              <DtPagination
                showing={pagedSubscriptions.length}
                total={subscriptions.length}
                page={safeSubscriptionPage}
                lastPage={subscriptionLastPage}
                pageSize={SUBSCRIPTIONS_PAGE_SIZE}
                onPageChange={setSubscriptionPage}
              />
            ) : null}

            <div className="flex justify-end border-t border-slate-100 px-5 py-4">
              <button
                type="button"
                className="nl-btn-secondary"
                onClick={() => { setSubscriptionService(null); setSubscriptions([]); setSubscriptionPage(1); }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function subscriptionStatusMeta(status: string, label?: string | null) {
  if (status === "active") return { label: label || "Active", tone: "emerald" as const };
  if (status === "pending") return { label: label || "Pending", tone: "amber" as const };
  if (status === "rejected") return { label: label || "Declined", tone: "red" as const };
  if (status === "cancelled") return { label: label || "Cancelled", tone: "slate" as const };
  return { label: label || status, tone: "slate" as const };
}

function formatAcknowledgedAt(value?: string | null): string {
  if (!value) return "—";
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function billStatusMeta(bill?: ServiceSubscription["latest_bill"]) {
  if (!bill?.status) return { label: "No bill", tone: "slate" as const };
  if (bill.status === "paid") return { label: bill.status_label || "Paid", tone: "emerald" as const };
  if (bill.status === "acknowledged") return { label: bill.status_label || "Acknowledged", tone: "blue" as const };
  if (bill.status === "pending_verification") return { label: bill.status_label || "Pending verification", tone: "amber" as const };
  if (bill.status === "overdue" || bill.status === "rejected") {
    return { label: bill.status_label || (bill.status === "overdue" ? "Overdue" : "Rejected"), tone: "red" as const };
  }
  return { label: bill.status_label || "Unpaid", tone: "amber" as const };
}

function ModalShell({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex max-h-[min(40rem,calc(100dvh-2rem))] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
            {subtitle ? <p className="mt-0.5 break-words text-sm text-slate-500">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {footer ? <div className="shrink-0 border-t border-slate-100 px-5 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{value}</dd>
    </div>
  );
}
