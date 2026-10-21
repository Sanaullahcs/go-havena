"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import {
  approveCommunityAdmin,
  deleteCommunityAdmin,
  fetchCommunityAdmins,
  reactivateCommunityAdmin,
  rejectCommunityAdmin,
  reapproveCommunityAdmin,
  releaseCommunityAdminAccount,
  suspendCommunityAdmin,
  type CommunityAdminApplicant,
  type CommunityAdminStats,
} from "@/lib/api/community-admins";
import { communityAdminAllows, resolveCommunityAdminLifecycle } from "@/lib/admin/community-admin-actions";
import { AdminAccountStatusBadge } from "@/components/admin/assign-community-admin-modal";
import { AssignAdminCommunityModal } from "@/components/admin/assign-admin-community-modal";
import { AdminActionsMenu } from "@/components/admin/admin-actions-menu";
import { UserAvatar } from "@/components/admin/user-avatar";
import { PhoneDisplay } from "@/components/admin/phone-display";
import { DataTable, DtCell, DtHead, DtPagination, DtRow, DtTable, StatTile } from "@/components/admin/ui";
import { ProvisionUserModal } from "@/components/admin/provision-user-modal";
import { EditCommunityAdminModal } from "@/components/admin/edit-community-admin-modal";
import { ContextualActivityModal } from "@/components/admin/contextual-activity-modal";
import { PageLoader } from "@/components/shared/page-states";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { adminTableBusy, isAdminSearchPending, shouldSkipStalePageFetch } from "@/lib/admin/table-loading";
import { confirmAction, confirmDeleteCommunityAdmin, confirmRejectWithReason, toastError, toastSuccess } from "@/lib/alert";
import { apiError } from "@/lib/api/client";
import { ADMIN_TABLE_PAGE_SIZE } from "@/lib/admin/table-pagination";
import { UtilityBillPreview } from "@/components/admin/utility-bill-preview";
import { formatAccountContact, formatAccountDisplayName, formatDisplayEmail } from "@/lib/user/email-display";

type StatusTab = "pending" | "approved" | "suspended" | "rejected";

const STATUS_FILTERS: { key: StatusTab; label: string; description: string }[] = [
  { key: "pending", label: "Pending", description: "Applications awaiting review" },
  { key: "approved", label: "Active", description: "Approved admins currently assigned to a community" },
  { key: "suspended", label: "Suspended", description: "Suspended administrators — access is restricted until they are reactivated" },
  { key: "rejected", label: "Rejected", description: "Declined applications" },
];

const EMPTY_STATS: CommunityAdminStats = {
  total: 0,
  pending: 0,
  approved: 0,
  active: 0,
  suspended: 0,
  needs_reassign: 0,
  rejected: 0,
};

function relDate(value?: string) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function communityFor(item: CommunityAdminApplicant) {
  return item.community_request;
}

export default function CommunityAdminsPage() {
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get("status");
  const [items, setItems] = useState<CommunityAdminApplicant[]>([]);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedOnce = useRef(false);
  const [status, setStatus] = useState<StatusTab>(() =>
    STATUS_FILTERS.some((f) => f.key === initialStatus) ? (initialStatus as StatusTab) : "approved",
  );
  const prevFilterKey = useRef(`${status}|`);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 400);
  const isSearchPending = isAdminSearchPending(searchInput, debouncedSearch);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<CommunityAdminApplicant | null>(null);
  const [viewing, setViewing] = useState<CommunityAdminApplicant | null>(null);
  const [editing, setEditing] = useState<CommunityAdminApplicant | null>(null);
  const [activityTarget, setActivityTarget] = useState<{ id: number; name: string } | null>(null);

  const load = useCallback(
    async (_silent = false) => {
      if (!hasLoadedOnce.current) setInitialLoading(true);
      else setRefreshing(true);
      try {
        const res = await fetchCommunityAdmins({
          status,
          search: debouncedSearch.trim() || undefined,
          page,
          per_page: ADMIN_TABLE_PAGE_SIZE,
        });
        setItems(res.data);
        setTotal(res.meta.total);
        setLastPage(res.meta.last_page);
        if (res.meta.stats) setStats(res.meta.stats);
      } catch {
        toastError("Could not load community admins");
        setItems([]);
      } finally {
        setInitialLoading(false);
        setRefreshing(false);
        hasLoadedOnce.current = true;
      }
    },
    [status, debouncedSearch, page],
  );

  useEffect(() => {
    const filterKey = `${status}|${debouncedSearch}`;
    if (shouldSkipStalePageFetch(filterKey, page, setPage, prevFilterKey)) return;
    void load();
  }, [status, debouncedSearch, page, load]);

  const activeTab = STATUS_FILTERS.find((f) => f.key === status);

  const filters = useMemo(
    () =>
      STATUS_FILTERS.map((f) => ({
        key: f.key,
        label: f.label,
        count:
          f.key === "approved"
            ? stats.active ?? stats.approved
            : f.key === "suspended"
              ? stats.suspended ?? 0
              : stats[f.key as keyof CommunityAdminStats] ?? 0,
      })),
    [stats],
  );

  const statTiles = useMemo(
    () => [
      {
        label: "Active Admins",
        value: String(stats.active ?? stats.approved),
        hint: "Approved with dashboard access",
        tone: "green" as const,
        icon: <IcoCheck />,
      },
      {
        label: "Needs Reassign",
        value: String(stats.needs_reassign ?? 0),
        hint: "Admins waiting to be assigned a community",
        tone: "amber" as const,
        icon: <IcoSwap />,
      },
      {
        label: "Suspended",
        value: String(stats.suspended ?? 0),
        hint: "All suspended admin accounts",
        tone: "red" as const,
        icon: <IcoBan />,
      },
      {
        label: "Pending Review",
        value: String(stats.pending),
        hint: "Awaiting approval",
        tone: "amber" as const,
        icon: <IcoClock />,
      },
      {
        label: "Total Registered",
        value: String(stats.total),
        hint: "All community admin accounts",
        tone: "blue" as const,
        icon: <IcoUsers />,
      },
    ],
    [stats],
  );

  const handleApprove = async (id: number, reapprove = false) => {
    setBusyId(id);
    try {
      if (reapprove) {
        await reapproveCommunityAdmin(id);
        toastSuccess("Community admin re-approved");
      } else {
        await approveCommunityAdmin(id);
        toastSuccess("Community admin approved");
      }
      setViewing((current) => (current?.id === id ? null : current));
      setStatus("approved");
      await load(true);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (id: number, revokeActive = false) => {
    const r = await confirmRejectWithReason({
      title: revokeActive ? "Revoke Access?" : "Reject this application?",
      text: revokeActive
        ? "Their subscription will be canceled immediately. A reason is required and will be shown to the admin."
        : "A reason is required. The applicant will see it in their account.",
      confirmText: revokeActive ? "Revoke Access" : "Reject",
    });
    if (!r.isConfirmed) return;

    setBusyId(id);
    try {
      const reason = String(r.value ?? "").trim();
      await rejectCommunityAdmin(id, reason);
      toastSuccess(revokeActive ? "Access revoked. Billing canceled." : "Application rejected");
      setViewing((current) =>
        current?.id === id
          ? {
              ...current,
              community_admin_status: "rejected",
              community_admin_rejection_reason: reason,
            }
          : current,
      );
      setStatus("rejected");
      await load(true);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleSuspend = async (item: CommunityAdminApplicant) => {
    const ok = await confirmAction({
      title: `Suspend ${item.name}?`,
      text: "This admin’s access will be suspended. The community and its residents will remain active and unaffected.",
      confirmText: "Suspend admin",
      color: "red",
    });
    if (!ok.isConfirmed) return;

    setBusyId(item.id);
    try {
      await suspendCommunityAdmin(item.id);
      toastSuccess("Community admin suspended. Access is restricted until you reactivate the account.");
      setStatus("suspended");
      await load(true);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleRelease = async (item: CommunityAdminApplicant) => {
    const community = communityFor(item);
    const ok = await confirmAction({
      title: `Release ${item.name}?`,
      text: community
        ? `${item.name} will be removed from ${community.name} only. The admin account stays active and can be assigned another community. The community is not deleted.`
        : "This removes only the community assignment. The admin account stays active and can be assigned another community.",
      confirmText: "Release from community",
      color: "amber",
    });
    if (!ok.isConfirmed) return;

    setBusyId(item.id);
    try {
      await releaseCommunityAdminAccount(item.id);
      toastSuccess("Community admin released. Assign a new community from the Active list when ready.");
      setStatus("approved");
      await load(true);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleReactivate = async (item: CommunityAdminApplicant) => {
    if (item.reactivate_blocked) return;
    const ok = await confirmAction({
      title: `Reactivate ${item.name}?`,
      text: "This restores the admin account. If another Community Admin is already assigned to the community, that assignment stays in place.",
      confirmText: "Reactivate admin",
      color: "green",
    });
    if (!ok.isConfirmed) return;

    setBusyId(item.id);
    try {
      const res = await reactivateCommunityAdmin(item.id);
      const next = res.data?.lifecycle_status;
      toastSuccess(
        next === "reassign"
          ? "Community admin reactivated. The current community assignment was left unchanged."
          : "Community admin reactivated.",
      );
      const nextTab: StatusTab = next === "suspended" ? "suspended" : "approved";
      if (nextTab !== status) setStatus(nextTab);
      else await load(true);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (item: CommunityAdminApplicant) => {
    if (!item.id || item.reassign_row_id) return;
    const isRecord = resolveCommunityAdminLifecycle(item) === "rejected";

    const confirmed = await confirmDeleteCommunityAdmin({
      adminName: item.name,
      assignedCommunities: item.community_request ? [item.community_request] : [],
      variant: isRecord ? "record" : "admin",
    });
    if (!confirmed.isConfirmed) return;

    setBusyId(item.id);
    try {
      await deleteCommunityAdmin(item.id);
      setItems((prev) => prev.filter((row) => row.id !== item.id));
      setViewing((current) => (current?.id === item.id ? null : current));
      toastSuccess(isRecord ? "Rejected record deleted successfully." : "Community Admin deleted successfully.");
      await load(true);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusyId(null);
    }
  };

  const openEdit = (item: CommunityAdminApplicant) => {
    if (!item.id) return;
    setEditing(item);
    setViewing((current) => (current?.id === item.id ? null : current));
  };

  const handleAdminSaved = (updated: CommunityAdminApplicant) => {
    setItems((prev) => prev.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)));
    setViewing((current) => (current?.id === updated.id ? updated : current));
  };

  const openAssign = (item: CommunityAdminApplicant) => {
    if (!item.id) return;
    setAssignTarget(item);
    setViewing((current) => (current?.id === item.id ? null : current));
  };

  const emptyMessage = useMemo(() => {
    const label = activeTab?.label.toLowerCase() ?? status;
    if (debouncedSearch.trim()) {
      return `No ${label} community admins match "${debouncedSearch.trim()}".`;
    }
    return `No ${label} community admins yet.`;
  }, [activeTab, status, debouncedSearch]);

  if (initialLoading) return <PageLoader text="Loading community admins…" skeleton />;

  const rowKey = (item: CommunityAdminApplicant) => item.reassign_row_id ?? String(item.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="nl-eyebrow">User Management</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Community Admins</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Manage pending, active, suspended, and reassignment workflows for community administrators.
          </p>
        </div>
        <button type="button" className="nl-btn-primary" onClick={() => setCreateOpen(true)}>
          <IcoPlus /> Create Community Admin
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {statTiles.map((tile) => (
          <StatTile key={tile.label} {...tile} />
        ))}
      </div>

      <div className="relative">
        {activeTab ? (
          <p className="mb-3 text-[13px] text-slate-500">{activeTab.description}</p>
        ) : null}

        <DataTable
          title={activeTab?.label ?? "Community Administrators"}
          totalCount={total}
          visibleCount={items.length}
          search={searchInput}
          onSearch={setSearchInput}
          searchPlaceholder="Search by name, email, phone, or community…"
          searching={isSearchPending}
          loading={adminTableBusy(refreshing, busyId !== null)}
          filters={filters}
          activeFilter={status}
          onFilter={(key) => setStatus(key as StatusTab)}
          isEmpty={items.length === 0}
          empty={emptyMessage}
        >
          <DtTable>
            <DtHead
              cols={[
                { label: "Administrator" },
                { label: "Contact" },
                { label: "Community" },
                { label: "Account status" },
                { label: "Billing" },
                { label: "Since" },
                { label: "", right: true },
              ]}
            />
            <tbody>
              {items.map((item) => {
                const community = communityFor(item);
                const lifecycle = resolveCommunityAdminLifecycle(item);
                const can = (action: Parameters<typeof communityAdminAllows>[1]) =>
                  communityAdminAllows(item, action);

                return (
                  <DtRow key={rowKey(item)} muted={lifecycle === "suspended" || lifecycle === "reassign"}>
                    <DtCell first>
                      <div className="flex items-center gap-3">
                        <UserAvatar
                          name={formatAccountDisplayName(item, "Community admin")}
                          src={item.avatar_url ?? item.profile?.avatar_url}
                          size={36}
                        />
                        <div>
                          <p className="font-semibold text-slate-900">
                            {formatAccountDisplayName(item, "Community admin")}
                          </p>
                          <p className="text-[12px] text-slate-400">
                            {lifecycle === "reassign" && item.reassign_summary
                              ? item.reassign_summary
                              : formatAccountContact(item) || "—"}
                          </p>
                        </div>
                      </div>
                    </DtCell>
                    <DtCell nowrap>
                      {item.phone ? <PhoneDisplay value={item.phone} compact /> : <span className="text-slate-400">—</span>}
                    </DtCell>
                    <DtCell>
                      <p className="font-medium text-slate-800">{community?.name ?? "—"}</p>
                      {community?.region ? (
                        <p className="text-[11px] text-slate-400">{community.region}</p>
                      ) : null}
                      {community?.status ? (
                        <p className="text-[11px] text-slate-400 capitalize">Community {community.status}</p>
                      ) : null}
                    </DtCell>
                    <DtCell>
                      <AdminAccountStatusBadge
                        accountStatus={lifecycle === "suspended" ? "suspended" : item.status}
                        applicationStatus={item.community_admin_status}
                        needsReassign={lifecycle === "reassign"}
                      />
                      {lifecycle === "reassign" ? (
                        <p className="mt-1 text-[11px] font-medium text-amber-700">Awaiting community</p>
                      ) : null}
                    </DtCell>
                    <DtCell>
                      <BillingStatusBadge billing={item.billing} />
                    </DtCell>
                    <DtCell nowrap muted>{relDate(item.created_at)}</DtCell>
                    <DtCell last right>
                      <AdminActionsMenu
                        disabled={busyId === item.id}
                        actions={[
                          { label: "View details", icon: "view", onClick: () => setViewing(item) },
                          {
                            label: "Activity",
                            icon: "view",
                            hidden: !item.id,
                            onClick: () => setActivityTarget({ id: item.id, name: formatAccountDisplayName(item) }),
                          },
                          {
                            label: "Edit",
                            icon: "edit",
                            hidden: !can("edit"),
                            onClick: () => openEdit(item),
                          },
                          {
                            label: "Approve",
                            icon: "approve",
                            tone: "primary",
                            hidden: !can("approve"),
                            onClick: () => handleApprove(item.id, lifecycle === "rejected"),
                          },
                          {
                            label: lifecycle === "active" ? "Revoke Access" : "Reject",
                            icon: "reject",
                            tone: "danger",
                            hidden: lifecycle === "active" ? false : lifecycle === "suspended" || !can("reject"),
                            onClick: () => handleReject(item.id, lifecycle === "active"),
                          },
                          {
                            label: "Suspend",
                            icon: "ban",
                            tone: "danger",
                            hidden: lifecycle !== "active" || !can("suspend"),
                            onClick: () => handleSuspend(item),
                          },
                          {
                            label: "Reactivate",
                            icon: "approve",
                            tone: "primary",
                            hidden: lifecycle !== "suspended" || !can("reactivate"),
                            disabled: Boolean(item.reactivate_blocked),
                            title: item.reactivate_blocked
                              ? item.reactivate_blocked_reason || "This community is already assigned to another Community Admin."
                              : undefined,
                            onClick: () => handleReactivate(item),
                          },
                          {
                            label: "Assign Community",
                            icon: "plus",
                            tone: "primary",
                            hidden: !can("assign_community"),
                            onClick: () => openAssign(item),
                          },
                          {
                            label: "Delete Record",
                            icon: "delete",
                            tone: "danger",
                            hidden: !can("delete_record"),
                            onClick: () => handleDelete(item),
                          },
                        ]}
                      />
                    </DtCell>
                  </DtRow>
                );
              })}
            </tbody>
          </DtTable>
          <DtPagination
            showing={items.length}
            total={total}
            page={page}
            lastPage={lastPage}
            onPageChange={setPage}
          />
        </DataTable>
      </div>

      <ProvisionUserModal
        type="community_admin"
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => load(true)}
      />

      <AssignAdminCommunityModal
        admin={assignTarget}
        open={Boolean(assignTarget)}
        onClose={() => setAssignTarget(null)}
        onAssigned={() => {
          setStatus("approved");
          void load(true);
        }}
      />

      <EditCommunityAdminModal
        item={editing}
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        onSaved={handleAdminSaved}
      />

      <ContextualActivityModal
        target={activityTarget ? { kind: "community_admin", ...activityTarget } : null}
        onClose={() => setActivityTarget(null)}
      />

      {viewing ? (
        <CommunityAdminDetailModal
          item={viewing}
          onClose={() => setViewing(null)}
          onApprove={
            communityAdminAllows(viewing, "approve")
              ? () => handleApprove(viewing.id, resolveCommunityAdminLifecycle(viewing) === "rejected")
              : undefined
          }
          onReject={communityAdminAllows(viewing, "reject") ? () => handleReject(viewing.id) : undefined}
          onReactivate={communityAdminAllows(viewing, "reactivate") ? () => handleReactivate(viewing) : undefined}
          reactivateBlocked={Boolean(viewing.reactivate_blocked)}
          reactivateBlockedReason={viewing.reactivate_blocked_reason}
          onAssign={communityAdminAllows(viewing, "assign_community") ? () => openAssign(viewing) : undefined}
          approveLabel={resolveCommunityAdminLifecycle(viewing) === "rejected" ? "Approve" : "Approve"}
          rejectLabel="Reject"
          deleteLabel="Delete Record"
          onDelete={communityAdminAllows(viewing, "delete_record") ? () => handleDelete(viewing) : undefined}
          busy={busyId === viewing.id}
        />
      ) : null}
    </div>
  );
}

function formatDateTime(value?: string) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function capitalize(value?: string | null) {
  if (!value) return "—";
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

function CommunityAdminDetailModal({
  item,
  onClose,
  onApprove,
  onReject,
  onReactivate,
  reactivateBlocked = false,
  reactivateBlockedReason,
  onAssign,
  onDelete,
  approveLabel = "Approve",
  rejectLabel = "Reject",
  deleteLabel = "Delete Admin",
  busy,
}: {
  item: CommunityAdminApplicant;
  onClose: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  onReactivate?: () => void;
  reactivateBlocked?: boolean;
  reactivateBlockedReason?: string | null;
  onAssign?: () => void;
  onDelete?: () => void;
  approveLabel?: string;
  rejectLabel?: string;
  deleteLabel?: string;
  busy?: boolean;
}) {
  const community = communityFor(item);
  const isReassignRow = Boolean(item.reassign_row_id) || item.id === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="sticky top-0 flex items-start justify-between border-b border-slate-100 bg-white px-6 py-4">
          <div>
            <h3 className="text-[15px] font-bold text-slate-900">
              {isReassignRow ? community?.name ?? "Community reassignment" : item.name}
            </h3>
            <p className="mt-0.5 text-[12.5px] text-slate-500">
              {isReassignRow ? "Community reassignment details" : "Community administrator details"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <div className="space-y-3 px-6 py-5 text-sm">
          {!isReassignRow ? (
            <>
              <ProfileRow label="Email" value={formatDisplayEmail(item.email) ?? "—"} />
              <ProfileRow label="Phone" value={item.phone ? <PhoneDisplay value={item.phone} /> : formatAccountContact(item) || "—"} />
              <ProfileRow label="Display name" value={formatAccountDisplayName(item, "—")} />
              <ProfileRow
                label="Office address"
                value={
                  item.profile?.office_address?.trim()
                  || item.profile?.unit_number?.trim()
                  || "—"
                }
              />
            </>
          ) : null}

          {item.reassign_summary ? (
            <ProfileRow label="Situation" value={item.reassign_summary} />
          ) : null}

          {item.previous_admin?.name ? (
            <ProfileRow
              label="Previous admin"
              value={`${item.previous_admin.name}${item.previous_admin.status ? ` (${item.previous_admin.status})` : ""}`}
            />
          ) : null}

          <ProfileRow
            label="Account status"
            value={
              <AdminAccountStatusBadge
                accountStatus={item.status}
                applicationStatus={item.community_admin_status}
                needsReassign={item.needs_reassign}
                reassignReason={item.reassign_reason}
              />
            }
          />

          {!isReassignRow ? (
            <ProfileRow
              label="Billing"
              value={<BillingStatusBadge billing={item.billing} />}
            />
          ) : null}

          {!isReassignRow && item.community_admin_rejection_reason ? (
            <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-500">
                Rejection reason
              </p>
              <p className="mt-1 text-sm leading-relaxed text-rose-800">
                {item.community_admin_rejection_reason}
              </p>
            </div>
          ) : null}

          {!isReassignRow && item.status === "suspended" && item.suspension_reason ? (
            <ProfileRow label="Suspension reason" value={item.suspension_reason} />
          ) : null}

          <div className="border-t border-slate-100 pt-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Community</p>
            <ProfileRow label="Name" value={community?.name ?? "—"} />
            <ProfileRow label="Region" value={community?.region ?? "—"} />
            <ProfileRow label="Community status" value={capitalize(community?.status)} />
            <ProfileRow label="Review status" value={capitalize(community?.review_status ?? "—")} />
          </div>

          {!isReassignRow && item.profile?.utility_bill_url ? (
            <div className="border-t border-slate-100 pt-3">
              <UtilityBillPreview
                url={item.profile.utility_bill_url}
                reviewStatus={item.profile.utility_bill_review_status}
              />
            </div>
          ) : null}

          <ProfileRow label="Registered" value={formatDateTime(item.created_at)} />
          {!isReassignRow && item.id ? <ProfileRow label="Admin ID" value={String(item.id)} /> : null}
        </div>

        {(onApprove || onReject || onReactivate || onAssign || onDelete) ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
            {onAssign ? (
              <button type="button" disabled={busy} onClick={onAssign} className="nl-btn-primary">
                Assign Community
              </button>
            ) : null}
            {onReject ? (
              <button
                type="button"
                disabled={busy}
                onClick={onReject}
                className="nl-btn-danger"
              >
                {rejectLabel}
              </button>
            ) : null}
            {onReactivate ? (
              <span
                title={reactivateBlocked
                  ? reactivateBlockedReason || "This community is already assigned to another Community Admin."
                  : undefined}
                className="inline-flex"
              >
                <button
                  type="button"
                  disabled={busy || reactivateBlocked}
                  onClick={onReactivate}
                  className="nl-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Reactivate
                </button>
              </span>
            ) : null}
            {onDelete ? (
              <button
                type="button"
                disabled={busy}
                onClick={onDelete}
                className="nl-btn-danger"
              >
                {deleteLabel}
              </button>
            ) : null}
            {onApprove ? (
              <button
                type="button"
                disabled={busy}
                onClick={onApprove}
                className="nl-btn-primary"
              >
                {approveLabel}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BillingStatusBadge({
  billing,
}: {
  billing?: CommunityAdminApplicant["billing"];
}) {
  const status = billing?.subscription_status ?? null;

  let label = "Not started";
  let className = "bg-slate-100 text-slate-600";

  if (status === "trialing") {
    label = "Free trial";
    className = "bg-teal-50 text-teal-700";
  } else if (status === "active") {
    label = "Active";
    className = "bg-emerald-50 text-emerald-700";
  } else if (status === "pending_trial") {
    label = "Card saved";
    className = "bg-sky-50 text-sky-700";
  } else if (status === "incomplete") {
    label = "Checkout incomplete";
    className = "bg-amber-50 text-amber-700";
  } else if (billing?.requires_replacement_card) {
    label = "Card required";
    className = "bg-rose-50 text-rose-700";
  } else if (billing?.has_leftover_service) {
    label = "Leftover period";
    className = "bg-amber-50 text-amber-800";
  } else if (status === "past_due" || status === "grace") {
    label = "Past due";
    className = "bg-orange-50 text-orange-700";
  } else if (status === "canceled" || status === "unpaid") {
    label = status === "canceled" ? "Canceled" : "Unpaid";
    className = "bg-rose-50 text-rose-700";
  } else if (billing?.billing_complete) {
    label = "Billing complete";
    className = "bg-emerald-50 text-emerald-700";
  }

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${className}`}>
      {label}
    </span>
  );
}

function ProfileRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-slate-50 pb-2 last:border-0">
      <span className="w-28 shrink-0 text-[12px] font-semibold text-slate-500">{label}</span>
      <span className="min-w-0 text-[13px] text-slate-800">{value || "—"}</span>
    </div>
  );
}

function IcoPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IcoUsers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="18.5" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M16 20c0-2.2 1.3-4 3-4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IcoClock() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IcoCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12l4 4 8-10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IcoBan() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7.5 7.5l9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IcoSwap() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M7 7h11M14 4l4 3-4 3M17 17H6M10 20l-4-3 4-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
