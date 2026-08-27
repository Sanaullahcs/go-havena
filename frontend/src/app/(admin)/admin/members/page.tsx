"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { AdminBadge, StatTile, DataTable, DtTable, DtHead, DtRow, DtCell, DtPagination } from "@/components/admin/ui";
import { X } from "lucide-react";
import { AdminActionsMenu } from "@/components/admin/admin-actions-menu";
import { UserAvatar } from "@/components/admin/user-avatar";
import { ProvisionUserModal } from "@/components/admin/provision-user-modal";
import { confirmAction, confirmDelete, confirmRejectWithReason, toastSuccess, toastError } from "@/lib/alert";
import {
  fetchMembers,
  fetchMember,
  inviteMember,
  approveMember,
  rejectMember,
  suspendMember,
  deleteMember,
  getAdminCommunityId,
  roleLabel,
  statusLabel,
  membersToCsv,
  downloadCsv,
  type Member,
  type MemberStats,
  type MembershipStatus,
} from "@/lib/api/members";
import { apiError } from "@/lib/api/client";
import { fetchBilling, type BillingPayload } from "@/lib/api/billing";
import { getManagedCommunityId, getUser, isSystemAdminUser } from "@/lib/auth/session";
import { PageLoader, PageError } from "@/components/shared/page-states";
import Link from "next/link";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ADMIN_TABLE_PAGE_SIZE } from "@/lib/admin/table-pagination";
import { PhoneDisplay } from "@/components/admin/phone-display";
import { UtilityBillPreview } from "@/components/admin/utility-bill-preview";
import { fetchAdminCommunities, type AdminCommunityOption } from "@/lib/api/communities";
import { MemberInviteResultModal } from "@/components/admin/member-invite-result-modal";
import { ResidentActivityModal } from "@/components/admin/resident-activity-modal";
import { formatDisplayEmail } from "@/lib/user/email-display";
import type { MemberInviteResult } from "@/lib/api/members";
import { useTouchedFieldErrors } from "@/hooks/use-touched-field-errors";
import { validateSystemMemberInviteForm } from "@/lib/admin/invite-member-validation";
import { hasFieldErrors, inputClass } from "@/lib/admin/form-validation-utils";

const STATUS_META: Record<MembershipStatus, { tone: "green" | "amber" | "slate" | "red" | "blue"; label: string }> = {
  approved:   { tone: "green", label: "Active" },
  pending:    { tone: "amber", label: "Pending" },
  onboarding: { tone: "blue",  label: "Onboarding" },
  banned:     { tone: "red",   label: "Suspended" },
  rejected:   { tone: "slate", label: "Rejected" },
};

const ROLE_STYLE: Record<string, string> = {
  admin:     "bg-blue-100 text-blue-700",
  moderator: "bg-violet-100 text-violet-700",
  member:    "bg-slate-100 text-slate-600",
};

type Filter = "all" | MembershipStatus;

const EMPTY_STATS: MemberStats = { total: 0, approved: 0, pending: 0, banned: 0, rejected: 0, onboarding: 0 };

function contactDisplay(m: Member) {
  const email = formatDisplayEmail(m.email);
  if (email) return <span className="text-[12px] text-slate-600 truncate">{email}</span>;
  if (m.phone || m.email) return <PhoneDisplay value={m.phone || m.email} compact />;
  return <span className="text-[12px] text-slate-400">—</span>;
}

type MembersPageMode = "community" | "system-residents";

function isOwnCommunityAdminRecord(m: Member, currentUserId?: number) {
  return Boolean(currentUserId && m.id === currentUserId && m.role === "admin");
}

function isPendingResident(m: Member) {
  return m.status === "pending" && m.role !== "admin" && Boolean(m.membership_id);
}

function canApproveRejectedMember(m: Member) {
  if (m.status !== "rejected" || !m.membership_id) return false;
  if (m.rejected_by === "system_admin") return isSystemAdminUser();
  return true;
}

export default function MembersPage({ mode = "community" }: { mode?: MembersPageMode }) {
  const isSystemResidents = mode === "system-residents";
  const searchParams = useSearchParams();
  const initialFilter = (searchParams.get("status") as Filter | null) ?? "all";
  const [filter, setFilter] = useState<Filter>(
    ["all", "approved", "pending", "banned", "rejected", "onboarding"].includes(initialFilter)
      ? initialFilter
      : "all",
  );
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 450);
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", unit: "", role: "Resident", communityId: "" });
  const { touch, clearError, showError, validateOnSubmit, resetTouched } = useTouchedFieldErrors();
  const [communities, setCommunities] = useState<AdminCommunityOption[]>([]);
  const [communitiesLoading, setCommunitiesLoading] = useState(false);
  const [viewing, setViewing] = useState<Member | null>(null);
  const [activityMember, setActivityMember] = useState<Member | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [profileActionLoading, setProfileActionLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [inviteResult, setInviteResult] = useState<MemberInviteResult | null>(null);
  const [provisionOpen, setProvisionOpen] = useState(false);
  const [scopeCommunityId, setScopeCommunityId] = useState<number | "all">(() => {
    if (isSystemResidents || isSystemAdminUser()) return "all";
    return getManagedCommunityId() ?? "all";
  });
  const [scopeCommunities, setScopeCommunities] = useState<AdminCommunityOption[]>([]);

  const [members, setMembers] = useState<Member[]>([]);
  const [stats, setStats] = useState<MemberStats>(EMPTY_STATS);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [billing, setBilling] = useState<BillingPayload | null>(null);
  const hasLoadedOnce = useRef(false);
  const currentUser = getUser();

  const inviteLiveErrors = useMemo(() => validateSystemMemberInviteForm(form), [form]);
  const canInvite = !hasFieldErrors(inviteLiveErrors);

  const load = useCallback(async (silent = false) => {
    if (!hasLoadedOnce.current) {
      setInitialLoading(true);
    } else if (!silent) {
      setRefreshing(true);
    }
    setError(null);
    try {
      const res = await fetchMembers({
        page,
        per_page: ADMIN_TABLE_PAGE_SIZE,
        community_id: scopeCommunityId,
        ...(isSystemResidents ? { role: "member" } : {}),
        ...(filter !== "all" ? { status: filter } : {}),
        ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
      });
      setMembers(res.data);
      setTotal(res.meta.total);
      setLastPage(res.meta.last_page);
      if (res.meta.stats) setStats(res.meta.stats);
    } catch (err) {
      setError(apiError(err));
    } finally {
      hasLoadedOnce.current = true;
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [filter, debouncedSearch, page, scopeCommunityId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setPage(1);
  }, [filter, debouncedSearch, scopeCommunityId]);

  useEffect(() => {
    fetchAdminCommunities()
      .then((res) => setScopeCommunities(res.data))
      .catch(() => setScopeCommunities([]));
  }, []);

  useEffect(() => {
    if (isSystemResidents || isSystemAdminUser()) {
      setBilling(null);
      return;
    }
    fetchBilling()
      .then(setBilling)
      .catch(() => setBilling(null));
  }, [isSystemResidents, members.length]);

  const viewingAllCommunities = scopeCommunityId === "all";

  const statTiles = useMemo(() => [
    { label: isSystemResidents ? "Total Residents" : "Total Members", value: String(stats.total), hint: isSystemResidents ? "Across all communities" : "All community members", tone: "blue" as const, icon: <IcoMembers /> },
    { label: "Pending Approval", value: String(stats.pending), hint: "Awaiting review", tone: "amber" as const, icon: <IcoClock /> },
    { label: "Active", value: String(stats.approved), hint: "Approved residents", tone: "green" as const, icon: <IcoActivity /> },
    { label: "Onboarding", value: String(stats.onboarding), hint: "Profile incomplete", tone: "cyan" as const, icon: <IcoUser /> },
    { label: "Suspended", value: String(stats.banned), hint: "Banned from community", tone: "slate" as const, icon: <IcoBanStat /> },
  ], [stats, isSystemResidents]);

  const filters = (["all", "approved", "pending", "onboarding", "banned", "rejected"] as Filter[]).map((f) => ({
    key: f,
    label: f === "all" ? "All" : STATUS_META[f as MembershipStatus]?.label ?? f,
    count: f === "all" ? stats.total : stats[f as keyof MemberStats],
  }));

  const openInviteModal = async () => {
    if (billing && !billing.setup.can_invite_residents) {
      if (!billing.setup.subscription_active) {
        toastError("An active subscription is required before inviting residents.");
      } else if (billing.seats.seats_available <= 0) {
        toastError("All seats are in use. Upgrade your plan to invite more residents.");
      } else if (!billing.setup.community_approved) {
        toastError("Your community is still awaiting platform approval.");
      } else {
        toastError("You cannot invite residents right now. Check Billing.");
      }
      return;
    }

    resetTouched();
    setModal(true);
    setCommunitiesLoading(true);
    try {
      const res = await fetchAdminCommunities();
      setCommunities(res.data);
      const defaultId = getAdminCommunityId();
      const match = defaultId ? res.data.find((c) => c.id === defaultId) : null;
      setForm({
        name: "",
        email: "",
        unit: "",
        role: "Resident",
        communityId: match ? String(match.id) : res.data[0] ? String(res.data[0].id) : "",
      });
    } catch (err) {
      toastError(apiError(err));
      setCommunities([]);
      setForm({ name: "", email: "", unit: "", role: "Resident", communityId: "" });
    } finally {
      setCommunitiesLoading(false);
    }
  };

  const closeInviteModal = () => {
    setModal(false);
    resetTouched();
    setForm({ name: "", email: "", unit: "", role: "Resident", communityId: "" });
  };

  const openProfile = async (member: Member) => {
    setViewLoading(true);
    setViewing(member);
    try {
      const detail = await fetchMember(member.id, member.community_id ?? undefined);
      setViewing(detail);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setViewLoading(false);
    }
  };

  const memberCommunityId = (member: Member) =>
    member.community_id ?? (scopeCommunityId !== "all" ? scopeCommunityId : undefined);

  const activityMenuItem = (member: Member) => ({
    label: "Activity",
    icon: "view" as const,
    onClick: () => setActivityMember(member),
  });

  const runApproveMember = async (member: Member, { closeProfile = false } = {}) => {
    const r = await confirmAction({
      title: `Approve ${member.name}?`,
      text: "They will be granted full resident access.",
      confirmText: "Approve",
      color: "blue",
    });
    if (!r.isConfirmed) return;

    setProfileActionLoading(true);
    try {
      await approveMember(member.id, memberCommunityId(member));
      toastSuccess(`${member.name} approved successfully.`);
      await load(true);
      if (closeProfile) setViewing(null);
      else if (viewing?.id === member.id) {
        const detail = await fetchMember(member.id, member.community_id ?? undefined);
        setViewing(detail);
      }
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setProfileActionLoading(false);
    }
  };

  const runRejectMember = async (member: Member, { closeProfile = false } = {}) => {
    const r = await confirmRejectWithReason({
      title: `Reject ${member.name}?`,
      text: "A reason is required. The resident will see it in the mobile app.",
      confirmText: "Reject",
    });
    if (!r.isConfirmed) return;

    setProfileActionLoading(true);
    try {
      await rejectMember(member.id, String(r.value ?? "").trim(), memberCommunityId(member));
      toastSuccess(`${member.name}'s request was rejected.`);
      await load(true);
      if (closeProfile) setViewing(null);
      else if (viewing?.id === member.id) {
        const detail = await fetchMember(member.id, member.community_id ?? undefined);
        setViewing(detail);
      }
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setProfileActionLoading(false);
    }
  };

  const showProfileApproveReject =
    viewing &&
    !viewLoading &&
    !isOwnCommunityAdminRecord(viewing, currentUser?.id) &&
    isPendingResident(viewing);

  const showProfileReapprove =
    viewing &&
    !viewLoading &&
    !isOwnCommunityAdminRecord(viewing, currentUser?.id) &&
    canApproveRejectedMember(viewing);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetchMembers({
        page: 1,
        per_page: 1000,
        community_id: scopeCommunityId,
        ...(isSystemResidents ? { role: "member" } : {}),
        ...(filter !== "all" ? { status: filter } : {}),
        ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
      });
      const csv = membersToCsv(res.data);
      downloadCsv(`members-${new Date().toISOString().slice(0, 10)}.csv`, csv);
      toastSuccess(`Exported ${res.data.length} member(s).`);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setExporting(false);
    }
  };

  if (initialLoading) return <PageLoader skeleton />;
  if (error) return <PageError message={error} onRetry={() => load()} />;

  const seatsBanner = !isSystemResidents && billing ? (
    <div
      className={[
        "flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-[13px]",
        billing.seats.in_grace
          ? "border-amber-200 bg-amber-50 text-amber-950"
          : !billing.setup.subscription_active
            ? "border-sky-200 bg-sky-50 text-sky-950"
            : billing.seats.seats_available <= 0
              ? "border-rose-200 bg-rose-50 text-rose-950"
              : "border-slate-200 bg-white text-slate-700",
      ].join(" ")}
    >
      <p>
        <span className="font-semibold">
          {billing.seats.seats_used} / {billing.seats.seat_limit || "—"} seats used
        </span>
        {!billing.setup.subscription_active
          ? " — choose a plan before inviting residents."
          : billing.seats.seats_available <= 0
            ? " — upgrade to add more residents."
            : billing.seats.in_grace
              ? " — update payment to keep inviting."
              : "."}
      </p>
      <Link href="/admin/billing" className="font-semibold text-[#1B4F8A] underline-offset-2 hover:underline">
        {billing.setup.subscription_active ? "Manage billing" : "Choose a plan"}
      </Link>
    </div>
  ) : null;

  return (
    <div className="space-y-6">
      {seatsBanner}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="nl-eyebrow">{isSystemResidents ? "User Management" : "Community"}</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            {isSystemResidents ? "Residents" : "Members"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {isSystemResidents
              ? "View residents across all communities, filter by status, and provision new accounts."
              : "Manage residents, approve new joiners, and monitor membership."}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {(isSystemResidents || isSystemAdminUser()) ? (
            <div className="min-w-[200px]">
              <label className="nl-label">Community scope</label>
              <select
                value={scopeCommunityId === "all" ? "all" : String(scopeCommunityId)}
                onChange={(e) => setScopeCommunityId(e.target.value === "all" ? "all" : Number(e.target.value))}
                className="nl-input nl-select mt-1.5 w-full min-w-[200px]"
              >
                <option value="all">All communities</option>
                {scopeCommunities.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}{c.region_title ? ` — ${c.region_title}` : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <button type="button" className="nl-btn-secondary" onClick={handleExport} disabled={exporting}>
              <IcoDownload /> {exporting ? "Exporting…" : "Export CSV"}
            </button>
            {isSystemResidents ? (
              <button type="button" className="nl-btn-primary" onClick={() => setProvisionOpen(true)}>
                <IcoPlus /> Create Resident
              </button>
            ) : (
              <button
                type="button"
                className="nl-btn-primary disabled:opacity-60"
                onClick={openInviteModal}
                disabled={Boolean(billing && !billing.setup.can_invite_residents)}
                title={
                  billing && !billing.setup.can_invite_residents
                    ? "Subscription or seats required — open Billing"
                    : undefined
                }
              >
                <IcoPlus /> Invite Member
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {statTiles.map((s) => <StatTile key={s.label} {...s} />)}
      </div>

      <DataTable
        title={isSystemResidents ? "All Residents" : "All Members"}
        totalCount={total}
        visibleCount={members.length}
        search={searchInput}
        onSearch={setSearchInput}
        searchPlaceholder="Search by name, email, unit…"
        filters={filters}
        activeFilter={filter}
        onFilter={(key) => setFilter(key as Filter)}
        isEmpty={members.length === 0}
        empty="No members match your search or filters."
        searching={refreshing}
      >
        <DtTable>
          <DtHead cols={[
            { label: "Member" },
            ...(viewingAllCommunities ? [{ label: "Community" }] : []),
            { label: "Unit" },
            { label: "Role" },
            { label: "Joined" },
            { label: "Status" },
            { label: "Actions", right: true },
          ]} />
          <tbody>
            {members.map((m) => {
              const st = STATUS_META[m.status] ?? STATUS_META.pending;
              return (
                <DtRow key={`${m.id}-${m.membership_id ?? "onboarding"}`} muted={m.status === "banned"}>
                  <DtCell first>
                    <div className="flex items-center gap-3">
                      <UserAvatar name={m.name} src={m.avatar_url} size={32} />
                      <div>
                        <p className="font-semibold text-slate-900">{m.name}</p>
                        <div className="text-[12px] text-slate-400">{contactDisplay(m)}</div>
                      </div>
                    </div>
                  </DtCell>
                  {viewingAllCommunities && (
                    <DtCell nowrap muted>{m.community_name ?? "—"}</DtCell>
                  )}
                  <DtCell nowrap><span className="font-mono text-[12px]">{m.unit_number ?? "—"}</span></DtCell>
                  <DtCell>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${ROLE_STYLE[m.role] ?? ROLE_STYLE.member}`}>
                      {roleLabel(m.role)}
                    </span>
                  </DtCell>
                  <DtCell nowrap muted>
                    {new Date(m.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </DtCell>
                  <DtCell>
                    <AdminBadge tone={st.tone}>{st.label}</AdminBadge>
                  </DtCell>
                  <DtCell last right>
                    <AdminActionsMenu
                      actions={
                        isOwnCommunityAdminRecord(m, currentUser?.id)
                          ? [{ label: "View profile", icon: "view", onClick: () => openProfile(m) }]
                          : isPendingResident(m)
                            ? [
                                { label: "Approve", icon: "approve", tone: "primary", onClick: () => runApproveMember(m) },
                                { label: "Reject", icon: "reject", tone: "danger", onClick: () => runRejectMember(m) },
                                activityMenuItem(m),
                                { label: "View profile", icon: "view", onClick: () => openProfile(m) },
                              ]
                            : [
                                {
                                  label: "Approve",
                                  icon: "approve",
                                  tone: "primary",
                                  hidden: !(m.status === "rejected" && canApproveRejectedMember(m)),
                                  onClick: () => runApproveMember(m),
                                },
                                {
                                  label: "Suspend",
                                  icon: "ban",
                                  tone: "danger",
                                  hidden: m.status !== "approved",
                                  onClick: async () => {
                                    const r = await confirmDelete({ title: `Suspend ${m.name}?`, text: "They will lose access until reinstated.", confirmText: "Suspend" });
                                    if (r.isConfirmed) {
                                      try {
                                        await suspendMember(m.id, memberCommunityId(m));
                                        toastSuccess(`${m.name} has been suspended.`);
                                        load(true);
                                      } catch (err) {
                                        toastError(apiError(err));
                                      }
                                    }
                                  },
                                },
                                {
                                  label: "Reinstate",
                                  icon: "approve",
                                  tone: "primary",
                                  hidden: m.status !== "banned",
                                  onClick: async () => {
                                    const r = await confirmAction({ title: `Reinstate ${m.name}?`, text: "They will regain community access.", confirmText: "Reinstate", color: "green" });
                                    if (r.isConfirmed) {
                                      try {
                                        await approveMember(m.id, memberCommunityId(m));
                                        toastSuccess(`${m.name} has been reinstated.`);
                                        load(true);
                                      } catch (err) {
                                        toastError(apiError(err));
                                      }
                                    }
                                  },
                                },
                                {
                                  label: "Delete member",
                                  icon: "delete",
                                  tone: "danger",
                                  hidden: isSystemResidents || m.role === "admin",
                                  onClick: async () => {
                                    const r = await confirmDelete({ title: `Delete ${m.name}?`, confirmText: "Delete" });
                                    if (r.isConfirmed) {
                                      try {
                                        await deleteMember(m.id);
                                        toastSuccess(`${m.name} deleted.`);
                                        load(true);
                                      } catch (err) {
                                        toastError(apiError(err));
                                      }
                                    }
                                  },
                                },
                                activityMenuItem(m),
                                { label: "View profile", icon: "view", onClick: () => openProfile(m) },
                              ]
                      }
                    />
                  </DtCell>
                </DtRow>
              );
            })}
          </tbody>
        </DtTable>
        <DtPagination
          showing={members.length}
          total={total}
          page={page}
          lastPage={lastPage}
          onPageChange={setPage}
        />
      </DataTable>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h3 className="text-[15px] font-bold text-slate-900">Invite New Member</h3>
                <p className="mt-0.5 text-[12.5px] text-slate-500">Create a resident account in your community.</p>
              </div>
              <button type="button" onClick={closeInviteModal} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"><X className="h-4 w-4" strokeWidth={2} /></button>
            </div>
            <div className="space-y-4 px-6 py-5">
              <div>
                <label className="nl-label">Community</label>
                <select
                  value={form.communityId}
                  onChange={(e) => {
                    clearError("communityId");
                    setForm((f) => ({ ...f, communityId: e.target.value }));
                  }}
                  onBlur={() => touch("communityId")}
                  className={inputClass(showError("communityId", inviteLiveErrors), "nl-input nl-select mt-1.5")}
                  disabled={communitiesLoading || communities.length === 0}
                >
                  {communitiesLoading ? (
                    <option value="">Loading communities…</option>
                  ) : communities.length === 0 ? (
                    <option value="">No active communities</option>
                  ) : (
                    communities.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.name}{c.region_title ? ` — ${c.region_title}` : ""}
                      </option>
                    ))
                  )}
                </select>
                {showError("communityId", inviteLiveErrors) ? (
                  <p className="mt-1 text-xs text-red-600">{showError("communityId", inviteLiveErrors)}</p>
                ) : null}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="nl-label">Full Name</label>
                  <input
                    value={form.name}
                    onChange={(e) => {
                      clearError("name");
                      setForm((f) => ({ ...f, name: e.target.value }));
                    }}
                    onBlur={() => touch("name")}
                    className={inputClass(showError("name", inviteLiveErrors), "nl-input mt-1.5")}
                    placeholder="e.g. Sarah Mitchell"
                  />
                  {showError("name", inviteLiveErrors) ? (
                    <p className="mt-1 text-xs text-red-600">{showError("name", inviteLiveErrors)}</p>
                  ) : null}
                </div>
                <div>
                  <label className="nl-label">Unit / Apartment</label>
                  <input
                    value={form.unit}
                    onChange={(e) => {
                      clearError("unit");
                      setForm((f) => ({ ...f, unit: e.target.value }));
                    }}
                    onBlur={() => touch("unit")}
                    className={inputClass(showError("unit", inviteLiveErrors), "nl-input mt-1.5")}
                    placeholder="e.g. B-12"
                  />
                  {showError("unit", inviteLiveErrors) ? (
                    <p className="mt-1 text-xs text-red-600">{showError("unit", inviteLiveErrors)}</p>
                  ) : null}
                </div>
              </div>
              <div>
                <label className="nl-label">Email Address</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => {
                    clearError("email");
                    setForm((f) => ({ ...f, email: e.target.value }));
                  }}
                  onBlur={() => touch("email")}
                  className={inputClass(showError("email", inviteLiveErrors), "nl-input mt-1.5")}
                  placeholder="resident@example.com"
                />
                {showError("email", inviteLiveErrors) ? (
                  <p className="mt-1 text-xs text-red-600">{showError("email", inviteLiveErrors)}</p>
                ) : null}
              </div>
              <div>
                <label className="nl-label">Role</label>
                <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className="nl-input nl-select mt-1.5">
                  <option>Resident</option>
                  <option>Moderator</option>
                  <option>Admin</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
              <button type="button" onClick={closeInviteModal} className="nl-btn-secondary">Cancel</button>
              <button type="button" onClick={async () => {
                if (!validateOnSubmit(inviteLiveErrors)) return;
                const selectedCommunity = communities.find((c) => String(c.id) === form.communityId);
                const r = await confirmAction({
                  title: "Send invitation?",
                  text: `An account will be created for ${form.email}${selectedCommunity ? ` in ${selectedCommunity.name}` : ""}.`,
                  confirmText: "Send Invite",
                  color: "blue",
                });
                if (r.isConfirmed) {
                  try {
                    const memberName = form.name;
                    const memberEmail = form.email;
                    const res = await inviteMember({
                      name: memberName,
                      email: memberEmail,
                      role: form.role,
                      unit_number: form.unit || undefined,
                      community_id: Number(form.communityId),
                    });
                    closeInviteModal();
                    setInviteResult({
                      ...res.data,
                      member_name: memberName,
                      member_email: memberEmail,
                    });
                    toastSuccess(`Invitation sent to ${memberEmail}`);
                    load(true);
                  } catch (err) {
                    toastError(apiError(err));
                  }
                }
              }} className="nl-btn-primary disabled:opacity-60" disabled={communitiesLoading || !canInvite}><IcoPlus /> Send Invitation</button>
            </div>
          </div>
        </div>
      )}

      {inviteResult && (
        <MemberInviteResultModal
          result={inviteResult}
          onClose={() => setInviteResult(null)}
        />
      )}

      {isSystemResidents && (
        <ProvisionUserModal
          type="resident"
          open={provisionOpen}
          onClose={() => setProvisionOpen(false)}
          onCreated={() => load(true)}
        />
      )}

      <ResidentActivityModal
        key={activityMember?.id ?? "closed"}
        member={activityMember}
        onClose={() => setActivityMember(null)}
      />

      {viewing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="flex max-h-[min(92dvh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-4 sm:px-6">
              <div className="min-w-0 pr-3">
                <h3 className="truncate text-[15px] font-bold text-slate-900">{viewing.name}</h3>
                <p className="mt-0.5 text-[12.5px] text-slate-500">Member profile</p>
              </div>
              <button type="button" onClick={() => setViewing(null)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"><X className="h-4 w-4" strokeWidth={2} /></button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm sm:px-6 sm:py-5">
              {viewLoading ? (
                <p className="text-slate-500">Loading profile…</p>
              ) : (
                <>
                  <ProfileRow label="Email" value={formatDisplayEmail(viewing.email) ?? "—"} />
                  <ProfileRow label="Unit" value={viewing.unit_number ?? "—"} />
                  <ProfileRow label="Role" value={roleLabel(viewing.role)} />
                  <ProfileRow label="Status" value={statusLabel(viewing.status)} />
                  {viewing.rejection_reason ? (
                    <ProfileRow label="Rejection reason" value={viewing.rejection_reason} />
                  ) : null}
                  {viewing.rejected_by ? (
                    <ProfileRow
                      label="Rejected by"
                      value={viewing.rejected_by === "system_admin" ? "System administrator" : "Community administrator"}
                    />
                  ) : null}
                  <ProfileRow label="Residence" value={viewing.residence_type ?? "—"} />
                  <ProfileRow label="Phone" value={<PhoneDisplay value={viewing.phone} />} />
                  <div className="pt-1">
                    <UtilityBillPreview url={viewing.utility_bill_url} compact />
                  </div>
                  <ProfileRow label="Bio" value={viewing.bio?.trim() ? viewing.bio : "—"} />
                  <ProfileRow label="Joined" value={new Date(viewing.created_at).toLocaleString()} />
                </>
              )}
            </div>
            {(showProfileApproveReject || showProfileReapprove) ? (
              <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-100 px-4 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:px-6">
                {showProfileApproveReject ? (
                  <>
                    <button
                      type="button"
                      className="nl-btn-primary w-full sm:w-auto"
                      disabled={profileActionLoading}
                      onClick={() => runApproveMember(viewing, { closeProfile: true })}
                    >
                      {profileActionLoading ? "Working…" : "Approve"}
                    </button>
                    <button
                      type="button"
                      className="nl-btn-secondary w-full !border-red-200 !text-red-700 hover:!bg-red-50 sm:w-auto"
                      disabled={profileActionLoading}
                      onClick={() => runRejectMember(viewing, { closeProfile: true })}
                    >
                      {profileActionLoading ? "Working…" : "Reject"}
                    </button>
                    <button
                      type="button"
                      className="nl-btn-secondary w-full sm:w-auto"
                      disabled={profileActionLoading}
                      onClick={() => setViewing(null)}
                    >
                      Close
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="nl-btn-primary w-full sm:w-auto"
                      disabled={profileActionLoading}
                      onClick={() => runApproveMember(viewing, { closeProfile: true })}
                    >
                      {profileActionLoading ? "Working…" : "Approve"}
                    </button>
                    <button
                      type="button"
                      className="nl-btn-secondary w-full sm:w-auto"
                      disabled={profileActionLoading}
                      onClick={() => setViewing(null)}
                    >
                      Close
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="flex shrink-0 justify-end border-t border-slate-100 px-4 py-4 sm:px-6">
                <button type="button" className="nl-btn-secondary w-full sm:w-auto" onClick={() => setViewing(null)}>
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-slate-50 pb-2 last:border-0 sm:flex-row sm:gap-3">
      <span className="w-full shrink-0 text-[12px] font-semibold text-slate-500 sm:w-24">{label}</span>
      <span className="min-w-0 text-[13px] text-slate-800 break-words">{value || "—"}</span>
    </div>
  );
}

function IcoMembers()  { return <svg viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><circle cx="18.5" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.6"/><path d="M16 20c0-2.2 1.3-4 3-4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>; }
function IcoClock()    { return <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/><path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function IcoActivity() { return <svg viewBox="0 0 24 24" fill="none"><path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function IcoUser()     { return <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8"/><path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>; }
function IcoBanStat() { return <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/><path d="M7.5 7.5l9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>; }
function IcoPlus()     { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>; }
function IcoDownload() { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 3v8M5 8l3 3 3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 13h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>; }
