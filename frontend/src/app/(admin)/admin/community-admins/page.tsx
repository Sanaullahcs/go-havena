"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import {
  approveCommunityAdmin,
  fetchCommunityAdmins,
  rejectCommunityAdmin,
  reapproveCommunityAdmin,
  suspendCommunityAdmin,
  type CommunityAdminApplicant,
  type CommunityAdminStats,
} from "@/lib/api/community-admins";
import {
  AdminAccountStatusBadge,
  AssignCommunityAdminModal,
  type AssignAdminTarget,
} from "@/components/admin/assign-community-admin-modal";
import { AdminActionsMenu } from "@/components/admin/admin-actions-menu";
import { UserAvatar } from "@/components/admin/user-avatar";
import { PhoneDisplay } from "@/components/admin/phone-display";
import { DataTable, DtCell, DtHead, DtPagination, DtRow, DtTable, StatTile } from "@/components/admin/ui";
import { ProvisionUserModal } from "@/components/admin/provision-user-modal";
import { PageLoader } from "@/components/shared/page-states";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { confirmAction, toastError, toastSuccess } from "@/lib/alert";
import { apiError } from "@/lib/api/client";
import { ADMIN_TABLE_PAGE_SIZE } from "@/lib/admin/table-pagination";
import { UtilityBillPreview } from "@/components/admin/utility-bill-preview";
import { formatDisplayEmail } from "@/lib/user/email-display";

type StatusTab = "pending" | "approved" | "suspended" | "reassign" | "rejected";

const STATUS_FILTERS: { key: StatusTab; label: string; description: string }[] = [
  { key: "pending", label: "Pending", description: "Applications awaiting review" },
  { key: "approved", label: "Active", description: "Approved admins with dashboard access" },
  { key: "suspended", label: "Suspended", description: "Suspended admins whose community already has a replacement" },
  { key: "reassign", label: "Reassign", description: "Communities that need an active administrator assigned" },
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState<StatusTab>(() =>
    STATUS_FILTERS.some((f) => f.key === initialStatus) ? (initialStatus as StatusTab) : "approved",
  );
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 400);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<AssignAdminTarget | null>(null);
  const [viewing, setViewing] = useState<CommunityAdminApplicant | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
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
        setLoading(false);
        setRefreshing(false);
      }
    },
    [status, debouncedSearch, page],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [status, debouncedSearch]);

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
              : f.key === "reassign"
                ? stats.needs_reassign ?? 0
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
        hint: "Communities without an active admin",
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
      await load(true);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (id: number) => {
    setBusyId(id);
    try {
      await rejectCommunityAdmin(id);
      toastSuccess("Application rejected");
      setViewing((current) => (current?.id === id ? null : current));
      await load(true);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleSuspend = async (item: CommunityAdminApplicant) => {
    const community = communityFor(item);
    const ok = await confirmAction({
      title: `Suspend ${item.name}?`,
      text: community
        ? `${community.name} and its residents will stay active. Only this admin loses access until you assign a replacement.`
        : "The community and its residents will stay active. Only this admin loses dashboard access.",
      confirmText: "Suspend admin",
      color: "red",
    });
    if (!ok.isConfirmed) return;

    setBusyId(item.id);
    try {
      await suspendCommunityAdmin(item.id);
      toastSuccess("Community admin suspended. Assign a replacement from the Reassign tab.");
      setStatus("reassign");
      await load(true);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusyId(null);
    }
  };

  const openAssign = (item: CommunityAdminApplicant, mode: "assign" | "reassign" = "assign") => {
    const community = communityFor(item);
    if (!community?.id) {
      toastError("No community linked to this admin.");
      return;
    }
    setAssignTarget({
      communityId: community.id,
      communityName: community.name,
      previousAdminName: item.reassign_reason === "missing_admin" ? undefined : item.name,
      mode,
    });
  };

  const emptyMessage = useMemo(() => {
    const label = activeTab?.label.toLowerCase() ?? status;
    if (debouncedSearch.trim()) {
      return `No ${label} community admins match "${debouncedSearch.trim()}".`;
    }
    if (status === "reassign") {
      return "All communities currently have an active administrator.";
    }
    return `No ${label} community admins yet.`;
  }, [activeTab, status, debouncedSearch]);

  if (loading) return <PageLoader text="Loading community admins…" skeleton />;

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
        {refreshing ? (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-start justify-center rounded-xl bg-white/55 pt-24 backdrop-blur-[1px]">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-[12px] font-medium text-slate-600 shadow-sm">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
              Updating…
            </span>
          </div>
        ) : null}

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
          searching={refreshing}
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
                { label: "Since" },
                { label: "", right: true },
              ]}
            />
            <tbody>
              {items.map((item, index) => {
                const community = communityFor(item);
                return (
                  <DtRow key={rowKey(item)} muted={status === "suspended" || status === "reassign"}>
                    <DtCell first>
                      <div className="flex items-center gap-3">
                        <UserAvatar
                          name={item.reassign_reason === "missing_admin" ? "!" : item.profile?.display_name ?? item.name}
                          src={item.avatar_url ?? item.profile?.avatar_url}
                          size={36}
                          color={item.reassign_reason === "missing_admin" ? "#dc2626" : undefined}
                        />
                        <div>
                          <p className="font-semibold text-slate-900">
                            {item.reassign_reason === "missing_admin" ? "No administrator assigned" : item.name}
                          </p>
                          <p className="text-[12px] text-slate-400">
                            {item.reassign_reason === "missing_admin"
                              ? "Assign a community admin to activate management"
                              : formatDisplayEmail(item.email) ?? "—"}
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
                        accountStatus={item.status}
                        applicationStatus={item.community_admin_status}
                        needsReassign={item.needs_reassign || status === "reassign"}
                        reassignReason={item.reassign_reason}
                      />
                    </DtCell>
                    <DtCell nowrap muted>{relDate(item.created_at)}</DtCell>
                    <DtCell last right>
                      <AdminActionsMenu
                        disabled={busyId === item.id}
                        actions={[
                          { label: "View details", icon: "view", onClick: () => setViewing(item) },
                          {
                            label: "Approve",
                            icon: "approve",
                            tone: "primary",
                            hidden: status !== "pending",
                            onClick: () => handleApprove(item.id),
                          },
                          {
                            label: "Reject",
                            icon: "reject",
                            tone: "danger",
                            hidden: status !== "pending",
                            onClick: () => handleReject(item.id),
                          },
                          {
                            label: "Suspend",
                            icon: "ban",
                            tone: "danger",
                            hidden: status !== "approved",
                            onClick: () => handleSuspend(item),
                          },
                          {
                            label: "Assign admin",
                            icon: "plus",
                            tone: "primary",
                            hidden: status !== "suspended" || !community?.id,
                            disabled: !community?.id,
                            onClick: () => openAssign(item, "assign"),
                          },
                          {
                            label: "Reassign admin",
                            icon: "edit",
                            tone: "primary",
                            hidden: status !== "reassign" || !community?.id,
                            disabled: !community?.id,
                            onClick: () => openAssign(item, "reassign"),
                          },
                          {
                            label: "Re-approve",
                            icon: "approve",
                            tone: "primary",
                            hidden: status !== "rejected",
                            onClick: () => handleApprove(item.id, true),
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

      <AssignCommunityAdminModal
        target={assignTarget}
        open={Boolean(assignTarget)}
        onClose={() => setAssignTarget(null)}
        onAssigned={() => {
          load(true);
        }}
      />

      {viewing ? (
        <CommunityAdminDetailModal
          item={viewing}
          onClose={() => setViewing(null)}
          onApprove={
            viewing.community_admin_status === "pending" && viewing.id
              ? () => handleApprove(viewing.id)
              : viewing.community_admin_status === "rejected" && viewing.id
                ? () => handleApprove(viewing.id, true)
                : undefined
          }
          onReject={viewing.community_admin_status === "pending" && viewing.id ? () => handleReject(viewing.id) : undefined}
          approveLabel={viewing.community_admin_status === "rejected" ? "Re-approve" : "Approve"}
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
  approveLabel = "Approve",
  busy,
}: {
  item: CommunityAdminApplicant;
  onClose: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  approveLabel?: string;
  busy?: boolean;
}) {
  const community = communityFor(item);
  const isMissingAdmin = item.reassign_reason === "missing_admin";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="sticky top-0 flex items-start justify-between border-b border-slate-100 bg-white px-6 py-4">
          <div>
            <h3 className="text-[15px] font-bold text-slate-900">
              {isMissingAdmin ? "Community reassignment" : item.name}
            </h3>
            <p className="mt-0.5 text-[12.5px] text-slate-500">
              {isMissingAdmin ? "No administrator assigned" : "Community administrator details"}
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
          {!isMissingAdmin ? (
            <>
              <ProfileRow label="Email" value={formatDisplayEmail(item.email) ?? "—"} />
              <ProfileRow label="Phone" value={item.phone ? <PhoneDisplay value={item.phone} /> : "—"} />
              <ProfileRow label="Display name" value={item.profile?.display_name ?? item.name} />
              <ProfileRow label="Unit" value={item.profile?.unit_number ?? "—"} />
              <ProfileRow label="Residence" value={capitalize(item.profile?.residence_type)} />
            </>
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

          {!isMissingAdmin && item.community_admin_status === "rejected" && item.community_admin_rejection_reason ? (
            <ProfileRow label="Rejection reason" value={item.community_admin_rejection_reason} />
          ) : null}

          {!isMissingAdmin && item.status === "suspended" && item.suspension_reason ? (
            <ProfileRow label="Suspension reason" value={item.suspension_reason} />
          ) : null}

          {item.reassign_reason === "previous_admin_suspended" ? (
            <ProfileRow label="Reassign note" value="Previous administrator was suspended; this community needs a replacement." />
          ) : null}

          <div className="border-t border-slate-100 pt-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Community</p>
            <ProfileRow label="Name" value={community?.name ?? "—"} />
            <ProfileRow label="Region" value={community?.region ?? "—"} />
            <ProfileRow label="Community status" value={capitalize(community?.status)} />
            <ProfileRow label="Review status" value={capitalize(community?.review_status ?? "—")} />
          </div>

          {!isMissingAdmin && item.profile?.utility_bill_url ? (
            <div className="border-t border-slate-100 pt-3">
              <UtilityBillPreview url={item.profile.utility_bill_url} />
            </div>
          ) : null}

          <ProfileRow label="Registered" value={formatDateTime(item.created_at)} />
          {!isMissingAdmin && item.id ? <ProfileRow label="Admin ID" value={String(item.id)} /> : null}
        </div>

        {(onApprove || onReject) ? (
          <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
            {onReject ? (
              <button
                type="button"
                disabled={busy}
                onClick={onReject}
                className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Reject
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
