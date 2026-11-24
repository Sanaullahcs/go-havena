"use client";

import { ClearableInput, ClearableTextarea } from "@/components/admin/clearable-field";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  approveCommunityRequest,
  createAdminCommunity,
  fetchAdminCommunities,
  fetchAdminCommunitiesList,
  releaseCommunityAdmin,
  fetchCommunityRequests,
  rejectCommunityRequest,
  updateAdminCommunity,
  updateCommunityStatus,
  type AdminCommunity,
  type AdminCommunityPlaidConnection,
  type AdminCommunityStats,
  type CommunityRequest,
} from "@/lib/api/communities";
import { AssignCommunityAdminModal, type AssignAdminTarget } from "@/components/admin/assign-community-admin-modal";
import { AdjustFeatureSetModal } from "@/components/admin/adjust-feature-set-modal";
import { ContextualActivityModal } from "@/components/admin/contextual-activity-modal";
import { ProvisionUserModal, type PresetCommunityAssignment } from "@/components/admin/provision-user-modal";
import { fetchRegions, type Region } from "@/lib/api/regions";
import { apiError, apiFieldErrors } from "@/lib/api/client";
import { PhoneDisplay } from "@/components/admin/phone-display";
import { UtilityBillPreview } from "@/components/admin/utility-bill-preview";
import { PageError, PageLoader } from "@/components/shared/page-states";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { adminTableBusy, isAdminSearchPending, shouldSkipStalePageFetch } from "@/lib/admin/table-loading";
import { ADMIN_TABLE_PAGE_SIZE } from "@/lib/admin/table-pagination";
import { Check, X } from "lucide-react";
import { useTouchedFieldErrors } from "@/hooks/use-touched-field-errors";
import {
  DUPLICATE_COMMUNITY_NAME_MESSAGE,
  validateCommunityForm,
  type ExistingCommunityName,
} from "@/lib/admin/community-form-validation";
import { hasFieldErrors, inputClass } from "@/lib/admin/form-validation-utils";
import { CommunityAddressPicker } from "@/components/admin/community-address-picker";

type Tab = "pending" | "communities" | "assigned" | "unassigned" | "inactive" | "rejected";

const COMMUNITY_TABS: { key: Tab; label: string }[] = [
  { key: "pending", label: "Pending Requests" },
  { key: "communities", label: "All Communities" },
  { key: "assigned", label: "Assigned Communities" },
  { key: "unassigned", label: "Unassigned Communities" },
  { key: "inactive", label: "Inactive Communities" },
  { key: "rejected", label: "Rejected Requests" },
];

function getInitialTab(): Tab {
  if (typeof window === "undefined") return "communities";
  const value = new URLSearchParams(window.location.search).get("tab");
  if (value === "requests" || value === "pending") return "pending";
  if (COMMUNITY_TABS.some((item) => item.key === value)) return value as Tab;
  return "communities";
}

function isRequestTab(tab: Tab) {
  return tab === "pending" || tab === "rejected";
}

function tabCount(tab: Tab, stats: AdminCommunityStats) {
  switch (tab) {
    case "pending":
      return stats.pending;
    case "communities":
      return stats.total;
    case "assigned":
      return stats.assigned ?? 0;
    case "unassigned":
      return stats.unassigned ?? 0;
    case "inactive":
      return stats.inactive ?? 0;
    case "rejected":
      return stats.rejected;
  }
}

const EMPTY_STATS: AdminCommunityStats = { total: 0, pending: 0, approved: 0, rejected: 0 };

const emptyForm = {
  name: "",
  region_id: "" as number | "",
  address: "",
  latitude: null as number | null,
  longitude: null as number | null,
  description: "",
};

function PlaidStatusBadge({ connection }: { connection?: AdminCommunityPlaidConnection | null }) {
  const status = connection?.status ?? "not_connected";
  if (status === "connected") {
    return (
      <div className="space-y-1">
        <AdminBadge tone="green">Connected</AdminBadge>
        {connection?.institution_name ? (
          <p className="max-w-[10rem] truncate text-xs text-slate-500">{connection.institution_name}</p>
        ) : null}
      </div>
    );
  }
  if (status === "needs_attention") {
    return <AdminBadge tone="amber">Needs attention</AdminBadge>;
  }
  if (status === "error") {
    return <AdminBadge tone="red">Error</AdminBadge>;
  }
  if (status === "disconnected") {
    return <AdminBadge tone="slate">Disconnected</AdminBadge>;
  }
  return <AdminBadge tone="slate">Not linked</AdminBadge>;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
}

export default function CommunitiesPage() {
  const [tab, setTab] = useState<Tab>(getInitialTab);
  const [communities, setCommunities] = useState<AdminCommunity[]>([]);
  const [requests, setRequests] = useState<CommunityRequest[]>([]);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 450);
  const isSearchPending = isAdminSearchPending(searchInput, debouncedSearch);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdminCommunity | null>(null);
  const [form, setForm] = useState(emptyForm);
  const { touch, clearError, showError, validateOnSubmit, resetTouched, setErrors } = useTouchedFieldErrors();
  const [knownNames, setKnownNames] = useState<ExistingCommunityName[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [viewing, setViewing] = useState<CommunityRequest | null>(null);
  const [approveRegionId, setApproveRegionId] = useState<number | "">("");
  const [rejectReason, setRejectReason] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [statusSubmitting, setStatusSubmitting] = useState(false);
  const [assignTarget, setAssignTarget] = useState<AssignAdminTarget | null>(null);
  const [assignPreset, setAssignPreset] = useState<PresetCommunityAssignment | null>(null);
  const [featureTarget, setFeatureTarget] = useState<{ id: number; name: string } | null>(null);
  const [activityTarget, setActivityTarget] = useState<{ id: number; name: string } | null>(null);
  const hasLoadedOnce = useRef(false);
  const prevFilterKey = useRef(`${tab}|`);

  const isAdminSuspended = (item: AdminCommunity) => item.admin_user?.status === "suspended";

  const existingNames = useMemo(() => {
    const byId = new Map<number, string>();
    for (const item of [...knownNames, ...communities, ...requests]) {
      byId.set(item.id, item.name);
    }
    return [...byId.entries()].map(([id, name]) => ({ id, name }));
  }, [knownNames, communities, requests]);

  const liveErrors = useMemo(
    () => validateCommunityForm(form, { existing: existingNames, exceptId: editing?.id ?? null }),
    [form, existingNames, editing],
  );
  const canSubmitForm = !hasFieldErrors(liveErrors);
  const nameFieldError =
    showError("name", liveErrors) ??
    (liveErrors.name === DUPLICATE_COMMUNITY_NAME_MESSAGE ? liveErrors.name : undefined);

  useEffect(() => {
    fetchRegions({ status: "active", per_page: 100 })
      .then((res) => setRegions(res.data.filter((r) => r.status === "active")))
      .catch(() => setRegions([]));
  }, []);

  useEffect(() => {
    if (!modalOpen) return;
    let cancelled = false;
    Promise.all([
      fetchAdminCommunities().catch(() => ({ data: [] })),
      fetchAdminCommunitiesList({ per_page: 100, page: 1, status: "inactive" }).catch(() => ({ data: [] })),
      fetchAdminCommunitiesList({ per_page: 100, page: 1, review_status: "rejected" }).catch(() => ({ data: [] })),
      fetchCommunityRequests({ per_page: 100, page: 1 }).catch(() => ({ data: [] })),
    ]).then(([active, inactive, rejected, pending]) => {
      if (cancelled) return;
      setKnownNames([
        ...active.data.map((item) => ({ id: item.id, name: item.name })),
        ...inactive.data.map((item) => ({ id: item.id, name: item.name })),
        ...rejected.data.map((item) => ({ id: item.id, name: item.name })),
        ...pending.data.map((item) => ({ id: item.id, name: item.name })),
      ]);
    });
    return () => {
      cancelled = true;
    };
  }, [modalOpen]);

  const load = useCallback(async (silent = false) => {
    if (!hasLoadedOnce.current) setInitialLoading(true);
    else if (!silent) setRefreshing(true);
    setError(null);

    try {
      const search = debouncedSearch.trim();
      if (isRequestTab(tab)) {
        const res = await fetchCommunityRequests({
          page,
          per_page: ADMIN_TABLE_PAGE_SIZE,
          review_status: tab === "rejected" ? "rejected" : "pending",
          ...(search ? { q: search } : {}),
        });
        setRequests(res.data);
        setTotal(res.meta.total);
        setLastPage(res.meta.last_page);
        if (res.meta.stats) setStats(res.meta.stats);
      } else {
        const res = await fetchAdminCommunitiesList({
          page,
          per_page: ADMIN_TABLE_PAGE_SIZE,
          ...(search ? { q: search } : {}),
          ...(tab === "assigned" ? { status: "active", assignment: "assigned" } : {}),
          ...(tab === "unassigned" ? { status: "active", assignment: "unassigned" } : {}),
          ...(tab === "inactive" ? { status: "inactive" } : {}),
        });
        setCommunities(res.data);
        setTotal(res.meta.total);
        setLastPage(res.meta.last_page);
        if (res.meta.stats) setStats(res.meta.stats);
      }
    } catch (err) {
      setError(apiError(err));
    } finally {
      hasLoadedOnce.current = true;
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [tab, page, debouncedSearch]);

  useEffect(() => {
    const filterKey = `${tab}|${debouncedSearch}`;
    if (shouldSkipStalePageFetch(filterKey, page, setPage, prevFilterKey)) return;
    void load();
  }, [tab, debouncedSearch, page, load]);

  const statTiles = useMemo(
    () => [
      { label: "Active Communities", value: String(stats.active ?? stats.total), hint: "Live and accessible", tone: "green" as const, icon: <IcoCheck /> },
      { label: "Inactive Communities", value: String(stats.inactive ?? 0), hint: "Deactivated by system admin", tone: "slate" as const, icon: <IcoX /> },
      { label: "Pending Requests", value: String(stats.pending), hint: "Awaiting review", tone: "amber" as const, icon: <IcoClock /> },
      { label: "Approved Total", value: String(stats.approved), hint: "All approved communities", tone: "blue" as const, icon: <IcoBuilding /> },
    ],
    [stats],
  );

  const communityFilters = useMemo(
    () =>
      COMMUNITY_TABS.map((item) => ({
        key: item.key,
        label: item.label,
        count: tabCount(item.key, stats),
      })),
    [stats],
  );

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    resetTouched();
    setModalOpen(true);
  };

  const openEdit = (community: AdminCommunity) => {
    setEditing(community);
    setForm({
      name: community.name,
      region_id: community.region_id ?? "",
      address: community.address ?? "",
      latitude: community.latitude ?? null,
      longitude: community.longitude ?? null,
      description: community.description ?? "",
    });
    resetTouched();
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!validateOnSubmit(liveErrors)) return;

    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        region_id: Number(form.region_id),
        address: form.address.trim(),
        description: form.description.trim() || undefined,
        latitude: form.latitude,
        longitude: form.longitude,
      };

      if (editing) {
        await updateAdminCommunity(editing.id, payload);
        toastSuccess("Community updated.");
      } else {
        await createAdminCommunity(payload);
        toastSuccess("Community created.");
        if (tab !== "communities") setTab("communities");
      }
      setModalOpen(false);
      setEditing(null);
      setForm(emptyForm);
      load(true);
    } catch (err) {
      const fields = apiFieldErrors(err);
      if (fields.name) {
        setErrors({ name: fields.name });
        touch("name");
        return;
      }
      toastError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const openReview = (item: CommunityRequest) => {
    setViewing(item);
    setApproveRegionId(item.region_id ?? item.region_detail?.id ?? "");
    setRejectReason("");
  };

  const handleApprove = async () => {
    if (!viewing || !approveRegionId) {
      toastError("Select a region before approving.");
      return;
    }
    const ok = await confirmAction({
      title: "Approve community?",
      text: `${viewing.name} will become active and visible under the selected region.`,
      confirmText: "Approve",
      color: "green",
    });
    if (!ok.isConfirmed) return;

    setReviewSubmitting(true);
    try {
      const picked = regions.find((r) => r.id === Number(approveRegionId));
      await approveCommunityRequest(viewing.id, Number(approveRegionId), picked?.area);
      toastSuccess("Community approved.");
      setViewing(null);
      load(true);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!viewing) return;
    const ok = await confirmAction({
      title: "Reject community request?",
      text: "The requester will be notified and must submit a new request.",
      confirmText: "Reject",
      color: "red",
    });
    if (!ok.isConfirmed) return;

    setReviewSubmitting(true);
    try {
      await rejectCommunityRequest(viewing.id, rejectReason.trim() || undefined);
      toastSuccess("Community request rejected.");
      setViewing(null);
      load(true);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleToggleStatus = async (community: AdminCommunity) => {
    const nextStatus = community.status === "active" ? "inactive" : "active";
    const ok = await confirmAction({
      title: nextStatus === "inactive" ? "Deactivate community?" : "Reactivate community?",
      text:
        nextStatus === "inactive"
          ? `${community.name} will be marked inactive. All community admins and residents will lose access until reactivated.`
          : `${community.name} will be reactivated and members restored.`,
      confirmText: nextStatus === "inactive" ? "Deactivate" : "Reactivate",
      color: nextStatus === "inactive" ? "red" : "green",
    });
    if (!ok.isConfirmed) return;

    setStatusSubmitting(true);
    try {
      const res = await updateCommunityStatus(community.id, nextStatus);
      toastSuccess(res.message);
      load(true);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setStatusSubmitting(false);
    }
  };

  const openManage = (item: AdminCommunity) => {
    setAssignTarget({
      communityId: item.id,
      communityName: item.name,
      region: item.region_title ?? item.region,
      previousAdminName: item.admin_user?.name,
    });
  };

  const openUnassignedAssign = (item: AdminCommunity) => {
    if (item.admin_user) return;
    setAssignPreset({
      id: item.id,
      name: item.name,
      regionId: item.region_id,
      regionTitle: item.region_title ?? item.region,
    });
  };

  const handleReleaseAdmin = async (community: AdminCommunity) => {
    if (!community.admin_user) return;
    const ok = await confirmAction({
      title: "Release Community Admin?",
      text: "This admin will be removed from the community. The community will remain active and can be assigned to another admin later.",
      confirmText: "Release Admin",
      color: "red",
    });
    if (!ok.isConfirmed) return;

    setStatusSubmitting(true);
    try {
      const res = await releaseCommunityAdmin(community.id);
      toastSuccess(res.message || "Community Admin released successfully.");
      await load(true);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setStatusSubmitting(false);
    }
  };

  if (initialLoading) return <PageLoader text="Loading communities…" skeleton />;
  if (error && !communities.length && !requests.length) {
    return <PageError message={error} onRetry={() => load()} />;
  }

  const requestTab = isRequestTab(tab);
  const rows = requestTab ? requests : communities;
  const tableCopy = {
    pending: {
      title: "Pending requests",
      empty: "No pending community requests.",
      search: "Search by name or address…",
    },
    communities: {
      title: "All communities",
      empty: "No communities yet. Add one to get started.",
      search: "Search by name, region, or address…",
    },
    assigned: {
      title: "Assigned communities",
      empty: "No communities have a Community Admin assigned.",
      search: "Search by name, region, or address…",
    },
    unassigned: {
      title: "Unassigned communities",
      empty: "No approved communities are waiting for a Community Admin.",
      search: "Search by name, region, or address…",
    },
    inactive: {
      title: "Inactive communities",
      empty: "No inactive communities.",
      search: "Search by name, region, or address…",
    },
    rejected: {
      title: "Rejected requests",
      empty: "No rejected community requests.",
      search: "Search by name or address…",
    },
  }[tab];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="nl-eyebrow">Community</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Communities</h2>
          <p className="mt-1 text-sm text-slate-500">
            Manage communities by region and review resident requests in one place.
          </p>
        </div>
        <button type="button" className="nl-btn-primary" onClick={openCreate}>
          <IcoPlus /> Add Community
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {statTiles.map((tile) => (
          <StatTile key={tile.label} {...tile} />
        ))}
      </div>

      <div className="relative">
        <DataTable
          title={tableCopy.title}
          totalCount={total}
          visibleCount={rows.length}
          search={searchInput}
          onSearch={setSearchInput}
          searching={isSearchPending}
          loading={adminTableBusy(refreshing, statusSubmitting, reviewSubmitting)}
          searchPlaceholder={tableCopy.search}
          filters={communityFilters}
          activeFilter={tab}
          onFilter={(key) => setTab(key as Tab)}
          contained
          isEmpty={rows.length === 0}
          empty={tableCopy.empty}
        >
          {!requestTab ? (
            <DtTable>
              <DtHead
                cols={[
                  { label: "Community" },
                  { label: "Region" },
                  { label: "Residents", center: true },
                  { label: "Community Admin" },
                  { label: "Bank" },
                  { label: "Status" },
                  { label: "Created" },
                  { label: "", right: true },
                ]}
              />
              <tbody>
                {communities.map((item) => (
                  <DtRow key={item.id}>
                    <DtCell first>
                      <p className="font-semibold text-slate-900">{item.name}</p>
                      <p className="mt-0.5 max-w-xs truncate text-xs text-slate-500">{item.address ?? "—"}</p>
                    </DtCell>
                    <DtCell>{item.region_title ?? item.region ?? "—"}</DtCell>
                    <DtCell nowrap center>
                      <div className="mx-auto inline-flex min-w-[3.5rem] flex-col items-center justify-center leading-none">
                        <span className="text-base font-bold tabular-nums text-slate-900">
                          {(item.residents_count ?? 0).toLocaleString()}
                        </span>
                        <span className="mt-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                          residents
                        </span>
                      </div>
                    </DtCell>
                    <DtCell>
                      {item.admin_user ? (
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-slate-800">{item.admin_user.name}</p>
                          <PhoneDisplay value={item.admin_user.phone ?? item.admin_user.email} compact />
                          <AdminBadge tone={isAdminSuspended(item) ? "red" : "green"}>
                            {isAdminSuspended(item) ? "Admin suspended" : "Admin active"}
                          </AdminBadge>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openUnassignedAssign(item)}
                          aria-label={`Assign a community admin to ${item.name}`}
                          className="rounded-md text-left text-sm font-semibold text-blue-700 underline-offset-2 transition hover:text-blue-800 hover:underline"
                        >
                          No Admin Assigned
                        </button>
                      )}
                    </DtCell>
                    <DtCell nowrap>
                      <PlaidStatusBadge connection={item.plaid_connection} />
                    </DtCell>
                    <DtCell nowrap>
                      <AdminBadge tone={item.status === "active" ? "green" : "red"}>
                        {item.status === "active" ? "Active" : "Inactive"}
                      </AdminBadge>
                    </DtCell>
                    <DtCell nowrap muted>{formatDate(item.created_at)}</DtCell>
                    <DtCell last right>
                      <AdminActionsMenu
                        disabled={statusSubmitting}
                        actions={[
                          { label: "Activity", icon: "view", onClick: () => setActivityTarget({ id: item.id, name: item.name }) },
                          { label: "Adjust Feature Set", icon: "view", onClick: () => setFeatureTarget({ id: item.id, name: item.name }) },
                          { label: "Edit", icon: "edit", onClick: () => openEdit(item) },
                          {
                            label: "Assign Admin",
                            icon: "plus",
                            tone: "primary",
                            hidden: Boolean(item.admin_user),
                            onClick: () => openUnassignedAssign(item),
                          },
                          {
                            label: "Manage",
                            icon: "view",
                            tone: "primary",
                            hidden: !isAdminSuspended(item),
                            onClick: () => openManage(item),
                          },
                          {
                            label: item.status === "active" ? "Deactivate" : "Reactivate",
                            icon: item.status === "active" ? "ban" : "approve",
                            tone: item.status === "active" ? "danger" : "success",
                            onClick: () => handleToggleStatus(item),
                          },
                        ]}
                      />
                    </DtCell>
                  </DtRow>
                ))}
              </tbody>
            </DtTable>
          ) : (
            <DtTable>
              <DtHead
                cols={[
                  { label: "Community" },
                  { label: "Region" },
                  { label: "Requested by" },
                  { label: "Submitted" },
                  ...(tab === "rejected" ? [{ label: "Reason" }] : []),
                  { label: "Status" },
                  { label: "", right: true },
                ]}
              />
              <tbody>
                {requests.map((item) => (
                  <DtRow key={item.id}>
                    <DtCell first>
                      <p className="font-semibold text-slate-900">{item.name}</p>
                      <p className="mt-0.5 max-w-xs truncate text-xs text-slate-500">{item.address ?? "—"}</p>
                    </DtCell>
                    <DtCell>{item.region_detail?.title ?? item.region ?? "—"}</DtCell>
                    <DtCell>
                      <p className="text-sm text-slate-800">{item.requested_by?.name ?? "—"}</p>
                      <PhoneDisplay value={item.requested_by?.phone ?? item.requested_by?.email} compact />
                    </DtCell>
                    <DtCell nowrap muted>{formatDate(item.created_at)}</DtCell>
                    {tab === "rejected" ? (
                      <DtCell>
                        <p className="max-w-xs text-sm text-slate-600">{item.rejection_reason?.trim() || "—"}</p>
                      </DtCell>
                    ) : null}
                    <DtCell nowrap>
                      <AdminBadge tone={tab === "rejected" ? "red" : "amber"}>
                        {tab === "rejected" ? "Rejected" : "Pending"}
                      </AdminBadge>
                    </DtCell>
                    <DtCell last right>
                      <AdminActionsMenu
                        actions={tab === "rejected" ? [
                          { label: "View Details", icon: "view", tone: "primary", onClick: () => openReview(item) },
                        ] : [
                          { label: "View Details", icon: "view", tone: "primary", onClick: () => openReview(item) },
                          { label: "Approve", icon: "approve", tone: "success", onClick: () => openReview(item) },
                          { label: "Reject", icon: "ban", tone: "danger", onClick: () => openReview(item) },
                          { label: "Adjust Feature Set", icon: "edit", onClick: () => setFeatureTarget({ id: item.id, name: item.name }) },
                        ]}
                      />
                    </DtCell>
                  </DtRow>
                ))}
              </tbody>
            </DtTable>
          )}

          <DtPagination
            showing={rows.length}
            total={total}
            page={page}
            lastPage={lastPage}
            onPageChange={setPage}
          />
        </DataTable>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-600">
                  {editing ? "Edit community" : "New community"}
                </p>
                <h3 className="text-[15px] font-bold text-slate-900">
                  {editing ? "Update Community" : "Add Community"}
                </h3>
                <p className="mt-0.5 text-[12.5px] text-slate-500">
                  {editing ? "Change region or community details." : "Select a region, then enter community details."}
                </p>
              </div>
              <button type="button" onClick={() => { setModalOpen(false); setEditing(null); }} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">✕</button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
              <div>
                <label className="nl-label">Region <span className="text-red-500">*</span></label>
                <select
                  value={form.region_id}
                  onChange={(e) => {
                    clearError("region_id");
                    setForm((f) => ({ ...f, region_id: e.target.value ? Number(e.target.value) : "" }));
                  }}
                  onBlur={() => touch("region_id")}
                  className={inputClass(showError("region_id", liveErrors), "nl-input nl-select mt-1.5")}
                >
                  <option value="">Select region…</option>
                  {regions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.hierarchy_label ?? r.title}{r.area && !(r.hierarchy_label ?? "").includes(r.area) ? ` · ${r.area}` : ""}
                    </option>
                  ))}
                </select>
                {showError("region_id", liveErrors) ? (
                  <p className="mt-1 text-xs text-red-600">{showError("region_id", liveErrors)}</p>
                ) : null}
              </div>
              <div>
                <label className="nl-label">Community name <span className="text-red-500">*</span></label>
                <ClearableInput
                  value={form.name}
                  onChange={(e) => {
                    clearError("name");
                    setForm((f) => ({ ...f, name: e.target.value }));
                  }}
                  onBlur={() => touch("name")}
                  className={inputClass(nameFieldError, "nl-input mt-1.5")}
                  placeholder="Oak Valley Residences"
                />
                {nameFieldError ? (
                  <p className="mt-1 text-xs text-red-600">{nameFieldError}</p>
                ) : null}
              </div>
              <div>
                <label className="nl-label">Address <span className="text-red-500">*</span></label>
                <div className="mt-1.5">
                  <CommunityAddressPicker
                    required
                    value={{
                      address: form.address,
                      latitude: form.latitude,
                      longitude: form.longitude,
                    }}
                    onChange={(next) => {
                      clearError("address");
                      setForm((f) => ({ ...f, ...next }));
                    }}
                    onBlur={() => touch("address")}
                    inputClassName={inputClass(showError("address", liveErrors), "nl-input")}
                    placeholder="123 Main Street, City, State"
                  />
                </div>
                {showError("address", liveErrors) ? (
                  <p className="mt-1 text-xs text-red-600">{showError("address", liveErrors)}</p>
                ) : null}
              </div>
              <div>
                <label className="nl-label">Description</label>
                <ClearableTextarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="nl-input mt-1.5 min-h-[80px] resize-none"
                  placeholder="Optional notes about this community"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
              <button type="button" onClick={() => { setModalOpen(false); setEditing(null); }} className="nl-btn-secondary">
                <X />
                Cancel
              </button>
              <button type="button" onClick={handleSave} disabled={submitting || !canSubmitForm} className="nl-btn-primary disabled:opacity-60">
                <Check />
                {submitting ? (editing ? "Saving…" : "Creating…") : (editing ? "Save Changes" : "Create Community")}
              </button>
            </div>
          </div>
        </div>
      )}

      {featureTarget ? (
        <AdjustFeatureSetModal
          communityId={featureTarget.id}
          communityName={featureTarget.name}
          onClose={() => setFeatureTarget(null)}
        />
      ) : null}

      <ContextualActivityModal
        target={activityTarget ? { kind: "community", ...activityTarget } : null}
        onClose={() => setActivityTarget(null)}
      />

      <AssignCommunityAdminModal
        target={assignTarget}
        open={Boolean(assignTarget)}
        onClose={() => setAssignTarget(null)}
        onAssigned={() => load(true)}
      />

      <ProvisionUserModal
        type="community_admin"
        open={Boolean(assignPreset)}
        presetCommunity={assignPreset}
        onClose={() => setAssignPreset(null)}
        onCreated={() => load(true)}
      />

      {viewing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className={`text-[11px] font-semibold uppercase tracking-wide ${viewing.review_status === "rejected" ? "text-red-600" : "text-amber-600"}`}>
                  {viewing.review_status === "rejected" ? "Rejected request" : "Pending request"}
                </p>
                <h2 className="mt-1 text-lg font-bold text-slate-900">{viewing.name}</h2>
                <p className="mt-1 text-sm text-slate-500">{viewing.address}</p>
              </div>
              <button type="button" onClick={() => setViewing(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <dl className="mt-5 grid gap-4 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Requested region</dt>
                <dd className="mt-0.5 font-medium text-slate-800">{viewing.region_detail?.title ?? viewing.region ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Requester</dt>
                <dd className="mt-0.5 font-medium text-slate-800">
                  <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
                    {viewing.requested_by?.name}
                    {viewing.requested_by?.phone ? (
                      <>
                        <span className="text-slate-300" aria-hidden>·</span>
                        <PhoneDisplay value={viewing.requested_by.phone} compact />
                      </>
                    ) : null}
                  </span>
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Submitted</dt>
                <dd className="mt-0.5 text-slate-800">{formatDate(viewing.created_at)}</dd>
              </div>
            </dl>

            {viewing.requester_profile?.utility_bill_url ? (
              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                <UtilityBillPreview url={viewing.requester_profile.utility_bill_url} />
              </div>
            ) : null}

            {viewing.review_status === "rejected" ? (
              <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-800">
                <p className="text-xs font-semibold uppercase tracking-wide text-red-500">Rejection reason</p>
                <p className="mt-1 whitespace-pre-wrap">{viewing.rejection_reason?.trim() || "No reason was recorded."}</p>
              </div>
            ) : (
            <div className="mt-6 space-y-4 border-t border-slate-100 pt-4">
              <div>
                <label className="nl-label">Assign region <span className="text-red-500">*</span></label>
                <select
                  value={approveRegionId}
                  onChange={(e) => setApproveRegionId(e.target.value ? Number(e.target.value) : "")}
                  className="nl-input nl-select mt-1.5"
                >
                  <option value="">Select region…</option>
                  {regions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.hierarchy_label ?? r.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="nl-label">Rejection reason (optional)</label>
                <ClearableTextarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  placeholder="Tell the resident why this request was declined…"
                  className="nl-input mt-1.5 min-h-[80px] resize-none"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={reviewSubmitting || !approveRegionId}
                  onClick={handleApprove}
                  className="nl-btn-primary bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                >
                  Approve & activate
                </button>
                <button
                  type="button"
                  disabled={reviewSubmitting}
                  onClick={handleReject}
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  Reject request
                </button>
              </div>
            </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function IcoPlus() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IcoBuilding() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M3 15V6l6-3 6 3v9H3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M7 15v-4h4v4" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

function IcoClock() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9 5.5V9l2.5 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IcoCheck() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M4.5 9.5l3 3 6-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IcoX() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M5 5l8 8M13 5l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
