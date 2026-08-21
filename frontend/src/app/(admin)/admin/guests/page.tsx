"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Calendar, Check, ChevronLeft, ChevronRight, Clock, Eye, Info, LogIn, Mail, Phone, Plus, RefreshCw, Shield, UserPlus, X } from "lucide-react";
import { AdminBadge, DataTable, DtPagination, StatTile } from "@/components/admin/ui";
import { AdminActionsMenu } from "@/components/admin/admin-actions-menu";
import { UserAvatar } from "@/components/admin/user-avatar";
import { confirmAction, confirmRejectWithReason, alertError, toastError, toastSuccess } from "@/lib/alert";
import { apiError } from "@/lib/api/client";
import { PageLoader, PageError } from "@/components/shared/page-states";
import { PhoneDisplay } from "@/components/admin/phone-display";
import { AdminPhoneInput } from "@/components/admin/phone-input";
import { emptyPhoneField, type PhoneFieldState } from "@/lib/phone/format";
import {
  approveGuest,
  extendGuest,
  fetchGuest,
  fetchGuestActivity,
  fetchGuests,
  inviteGuest,
  rejectGuest,
  revokeGuest,
  GUEST_STATUS_LABELS,
  GUEST_STATUS_TONE,
  type GuestActivity,
  type GuestActivityMeta,
  type GuestForm,
  type GuestInvitation,
  type GuestStatus,
  DEFAULT_GUEST_PERMISSIONS,
  normalizeGuestPermissions,
  GUEST_PERMISSION_OPTIONS,
  type GuestPermissions,
} from "@/lib/api/guests";
import { inputClass } from "@/lib/admin/form-validation-utils";
import { ADMIN_TABLE_PAGE_SIZE } from "@/lib/admin/table-pagination";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { canAccessCommunityDashboard, getUser, type WebUser } from "@/lib/auth/session";

const emptyForm: GuestForm = {
  guest_name: "",
  guest_email: "",
  guest_phone: "",
  starts_at: "",
  ends_at: "",
  permissions: { ...DEFAULT_GUEST_PERMISSIONS },
};

type GuestFilter = GuestStatus | "all" | "pending";

const ACTIVITY_PAGE_SIZE = 5;

const INVITE_DURATION_PRESETS = [
  { label: "1 hour", hours: 1 },
  { label: "6 hours", hours: 6 },
  { label: "1 day", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "1 week", hours: 168 },
];

function defaultInviteWindow() {
  const start = new Date();
  start.setSeconds(0, 0);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const toLocal = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  return { starts_at: toLocal(start), ends_at: toLocal(end) };
}

const GUEST_ACTION_VISUAL: Record<string, { bg: string; color: string; label: string }> = {
  login: { bg: "#E8F0F7", color: "#1B4F8A", label: "Logged in" },
  verification_complete: { bg: "#FFFBEB", color: "#D97706", label: "Verified invite" },
  access_activated: { bg: "#ECFDF5", color: "#059669", label: "Access activated" },
  access_rejected: { bg: "#FEF2F2", color: "#DC2626", label: "Access rejected" },
  access_revoked: { bg: "#FEF2F2", color: "#DC2626", label: "Access revoked" },
  access_extended: { bg: "#F5F3FF", color: "#7C3AED", label: "Access extended" },
  viewed_posts: { bg: "#F0FDF4", color: "#16A34A", label: "Viewed posts" },
  viewed_notices: { bg: "#E8F0F7", color: "#1B4F8A", label: "Viewed notices" },
  viewed_events: { bg: "#F5F3FF", color: "#7C3AED", label: "Viewed events" },
  viewed_marketplace: { bg: "#E8F0F7", color: "#EA580C", label: "Viewed marketplace" },
  viewed_businesses: { bg: "#ECFEFF", color: "#0891B2", label: "Viewed businesses" },
  blocked_action: { bg: "#FEF2F2", color: "#DC2626", label: "Blocked action" },
};

function guestActionVisual(action: string) {
  return (
    GUEST_ACTION_VISUAL[action] ?? {
      bg: "#F8FAFC",
      color: "#475569",
      label: action.replace(/_/g, " "),
    }
  );
}

function activityDayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

function groupActivityByDay(logs: GuestActivity[]) {
  const groups: { label: string; items: GuestActivity[] }[] = [];
  for (const log of logs) {
    const label = activityDayLabel(log.created_at);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(log);
    else groups.push({ label, items: [log] });
  }
  return groups;
}

function ActivityTimelineIcon({ action }: { action: string }) {
  if (action === "login") return <LogIn className="h-4 w-4" />;
  if (action.startsWith("access_")) return <Shield className="h-4 w-4" />;
  if (action.startsWith("viewed_")) return <Eye className="h-4 w-4" />;
  if (action === "verification_complete") return <Check className="h-4 w-4" />;
  return <Activity className="h-4 w-4" />;
}

function formatWhen(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatShortDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function inviteTypeLabel(type: GuestInvitation["invitation_type"]) {
  return type === "admin" ? "Admin invite" : "Resident invite";
}

function invitedByLabel(guest: GuestInvitation) {
  if (guest.resident) {
    const name = guest.resident.display_name || guest.resident.name;
    return guest.resident.unit_number ? `Invited by ${name} · Unit ${guest.resident.unit_number}` : `Invited by ${name}`;
  }
  if (guest.invited_by) {
    return `Invited by ${guest.invited_by.display_name || guest.invited_by.name}`;
  }
  return null;
}

function isPendingApproval(guest: GuestInvitation) {
  return guest.status === "pending_approval";
}

function canApproveOrRejectGuest(guest: GuestInvitation, currentUser?: WebUser | null) {
  if (!isPendingApproval(guest) || !currentUser?.id) return false;

  const userId = Number(currentUser.id);
  if (!Number.isFinite(userId)) return false;

  const inviterId =
    guest.invited_by?.id != null && Number.isFinite(Number(guest.invited_by.id))
      ? Number(guest.invited_by.id)
      : null;

  if (inviterId != null && inviterId === userId) return true;

  // Dashboard admins may approve admin-invited guests for their community.
  if (guest.invitation_type === "admin" && canAccessCommunityDashboard(currentUser)) {
    return true;
  }

  return false;
}

function pendingApprovalMessage(guest: GuestInvitation, canDecide: boolean) {
  if (canDecide) {
    return "Guest verified their invite — approve or reject access below.";
  }
  const host =
    guest.resident?.display_name ||
    guest.resident?.name ||
    guest.invited_by?.display_name ||
    guest.invited_by?.name ||
    "the inviting resident";
  return `Awaiting approval from ${host}. Resident invites must be approved by the host who sent the invitation.`;
}

export default function GuestsPage() {
  const [currentUser, setCurrentUser] = useState<WebUser | null>(null);
  const [guests, setGuests] = useState<GuestInvitation[]>([]);
  const [stats, setStats] = useState({ total: 0, active: 0, pending_verification: 0, pending_approval: 0, expired: 0 });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 450);
  const [filterStatus, setFilterStatus] = useState<GuestFilter>("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<GuestForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [actionId, setActionId] = useState<number | null>(null);
  const [viewing, setViewing] = useState<GuestInvitation | null>(null);
  const [activity, setActivity] = useState<GuestActivity[]>([]);
  const [activityMeta, setActivityMeta] = useState<GuestActivityMeta | null>(null);
  const [activityPage, setActivityPage] = useState(1);
  const [activityLoading, setActivityLoading] = useState(false);
  const [inviteResult, setInviteResult] = useState<GuestInvitation | null>(null);
  const [phoneField, setPhoneField] = useState<PhoneFieldState>(emptyPhoneField());
  const [phoneShowError, setPhoneShowError] = useState(false);
  const [inviteFormKey, setInviteFormKey] = useState(0);

  const hasLoadedOnce = useRef(false);

  useEffect(() => {
    setCurrentUser(getUser());
    const onSessionUpdate = () => setCurrentUser(getUser());
    window.addEventListener("nbr-session-updated", onSessionUpdate);
    return () => window.removeEventListener("nbr-session-updated", onSessionUpdate);
  }, []);

  const load = useCallback(async () => {
    if (!hasLoadedOnce.current) {
      setInitialLoading(true);
    } else {
      setRefreshing(true);
    }
    try {
      const res = await fetchGuests({
        status: filterStatus,
        search: debouncedSearch,
        page,
        per_page: ADMIN_TABLE_PAGE_SIZE,
      });
      setGuests(res.data);
      setTotal(res.meta.total);
      setLastPage(res.meta.last_page ?? 1);
      setStats({
        total: res.meta.stats?.total ?? res.meta.total,
        active: res.meta.stats?.active ?? 0,
        pending_verification: res.meta.stats?.pending_verification ?? 0,
        pending_approval: res.meta.stats?.pending_approval ?? 0,
        expired: res.meta.stats?.expired ?? 0,
      });
      setPageError(null);
    } catch (err) {
      setPageError(apiError(err));
    } finally {
      hasLoadedOnce.current = true;
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [filterStatus, debouncedSearch, page]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setPage(1);
  }, [filterStatus, debouncedSearch]);

  const statusFilters = useMemo(() => [
    { key: "all", label: "All", count: stats.total },
    { key: "active", label: "Active", count: stats.active },
    { key: "pending", label: "Pending", count: stats.pending_verification + stats.pending_approval },
    { key: "expired", label: "Expired", count: stats.expired },
  ], [stats]);

  const loadActivity = useCallback(async (guestId: number, page: number) => {
    setActivityLoading(true);
    try {
      const res = await fetchGuestActivity(guestId, { page, perPage: ACTIVITY_PAGE_SIZE });
      setActivity(res.data);
      setActivityMeta(res.meta);
      setActivityPage(page);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setActivityLoading(false);
    }
  }, []);

  const openView = async (guest: GuestInvitation) => {
    try {
      const full = await fetchGuest(guest.id);
      setViewing(full);
      setActivityPage(1);
      await loadActivity(guest.id, 1);
    } catch (err) {
      toastError(apiError(err));
    }
  };

  const activityGroups = useMemo(() => groupActivityByDay(activity), [activity]);

  const handleInvite = async () => {
    if (!form.guest_name.trim() || !form.guest_email.trim() || !form.starts_at || !form.ends_at) {
      toastError("Fill in all required fields, including email.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.guest_email.trim())) {
      toastError("Enter a valid email address.");
      return;
    }
    if (!phoneField.valid || !phoneField.e164) {
      setPhoneShowError(true);
      toastError("Enter a valid phone number.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        guest_phone: phoneField.e164,
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: new Date(form.ends_at).toISOString(),
        permissions: normalizeGuestPermissions(form.permissions),
      };
      const created = await inviteGuest(payload);
      toastSuccess("Guest invitation created");
      setInviteResult(created);
      setShowForm(false);
      setForm(emptyForm);
      setPhoneField(emptyPhoneField());
      setPhoneShowError(false);
      await load();
    } catch (err) {
      await alertError("Could not create invitation", apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (guest: GuestInvitation, opts?: { closeModal?: boolean }) => {
    const ok = await confirmAction({
      title: `Approve ${guest.guest_name}?`,
      text: "The guest will gain access to the community immediately.",
      confirmText: "Approve",
      color: "green",
    });
    if (!ok.isConfirmed) return;

    setActionId(guest.id);
    try {
      await approveGuest(guest.id);
      toastSuccess(`${guest.guest_name} approved`);
      if (opts?.closeModal) setViewing(null);
      await load();
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setActionId(null);
    }
  };

  const handleReject = async (guest: GuestInvitation, opts?: { closeModal?: boolean }) => {
    const r = await confirmRejectWithReason({
      title: `Reject ${guest.guest_name}?`,
      text: "The guest will not be able to access the community.",
      confirmText: "Reject",
    });
    if (!r.isConfirmed) return;

    setActionId(guest.id);
    try {
      await rejectGuest(guest.id, String(r.value ?? "").trim() || undefined);
      toastSuccess(`${guest.guest_name}'s guest access was rejected`);
      if (opts?.closeModal) setViewing(null);
      await load();
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setActionId(null);
    }
  };

  const handleRevoke = async (guest: GuestInvitation) => {
    const ok = await confirmAction({
      title: `Revoke access for ${guest.guest_name}?`,
      text: "The guest will be logged out and cannot access the community.",
      confirmText: "Revoke",
    });
    if (!ok.isConfirmed) return;
    try {
      await revokeGuest(guest.id);
      toastSuccess("Guest access revoked");
      if (viewing?.id === guest.id) setViewing(null);
      await load();
    } catch (err) {
      toastError(apiError(err));
    }
  };

  const handleExtend = async (guest: GuestInvitation) => {
    const nextWeek = new Date(guest.ends_at);
    nextWeek.setDate(nextWeek.getDate() + 7);
    try {
      await extendGuest(guest.id, nextWeek.toISOString());
      toastSuccess("Guest access extended by 7 days");
      await load();
      if (viewing?.id === guest.id) openView(guest);
    } catch (err) {
      toastError(apiError(err));
    }
  };

  if (initialLoading) return <PageLoader skeleton />;
  if (pageError && !guests.length) {
    return <PageError message={pageError} onRetry={() => { setInitialLoading(true); load(); }} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="nl-eyebrow">Community Admin</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Guest Users</h2>
          <p className="mt-1 text-sm text-slate-500">
            Invite temporary guests, review resident requests, and manage access windows.
          </p>
        </div>
        <button type="button" onClick={() => { setForm({ ...emptyForm, ...defaultInviteWindow() }); setPhoneField(emptyPhoneField()); setPhoneShowError(false); setInviteFormKey((k) => k + 1); setShowForm(true); }} className="nl-btn-primary">
          <Plus className="h-4 w-4" />
          Invite Guest User
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Total Guests" value={String(stats.total)} hint="All invitations" tone="blue" icon={<UserPlus className="h-5 w-5" />} />
        <StatTile label="Active" value={String(stats.active)} hint="Currently allowed" tone="green" icon={<RefreshCw className="h-5 w-5" />} />
        <StatTile label="Pending approval" value={String(stats.pending_approval)} hint="Awaiting host decision" tone="amber" icon={<Clock className="h-5 w-5" />} />
        <StatTile label="Admin invites" value={String(guests.filter((g) => g.invitation_type === "admin").length)} hint="Created from dashboard" tone="violet" icon={<Eye className="h-5 w-5" />} />
      </div>

      <DataTable
        title="Guest Users"
        totalCount={total}
        visibleCount={guests.length}
        search={searchInput}
        onSearch={setSearchInput}
        searchPlaceholder="Search name, phone, code…"
        filters={statusFilters}
        activeFilter={filterStatus}
        onFilter={(key) => setFilterStatus(key as GuestFilter)}
        isEmpty={guests.length === 0}
        empty={searchInput || filterStatus !== "all" ? "No guests match your filters." : "No guest invitations yet. Click \"Invite Guest User\" to get started."}
      >
        <div className={`divide-y divide-slate-100 ${refreshing ? "opacity-60" : ""}`}>
          {guests.map((guest) => {
            const invitedBy = invitedByLabel(guest);
            const pending = isPendingApproval(guest);
            const canDecide = canApproveOrRejectGuest(guest, currentUser);
            const busy = actionId === guest.id;

            return (
              <div
                key={guest.id}
                className={`flex flex-col gap-4 p-4 transition sm:flex-row sm:items-center sm:justify-between ${
                  pending ? "bg-amber-50/40" : "hover:bg-slate-50/60"
                }`}
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <UserAvatar name={guest.guest_name} src={guest.guest_avatar_url} size={44} color={pending ? "#d97706" : "#1B4F8A"} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold text-slate-900">{guest.guest_name}</h4>
                      <AdminBadge tone={GUEST_STATUS_TONE[guest.status]}>{GUEST_STATUS_LABELS[guest.status]}</AdminBadge>
                      <AdminBadge tone={guest.invitation_type === "admin" ? "violet" : "blue"}>
                        {inviteTypeLabel(guest.invitation_type)}
                      </AdminBadge>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <PhoneDisplay value={guest.guest_phone} compact />
                      {guest.guest_email ? <span>{guest.guest_email}</span> : null}
                      <span className="font-mono text-[11px] tracking-wide text-slate-400">{guest.invite_code}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                      <span>{formatShortDate(guest.starts_at)} → {formatShortDate(guest.ends_at)}</span>
                      {invitedBy ? <span>{invitedBy}</span> : null}
                    </div>
                    {pending ? (
                      <p className={`mt-2 text-xs font-medium ${canDecide ? "text-amber-700" : "text-slate-500"}`}>
                        {pendingApprovalMessage(guest, canDecide)}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  {pending && canDecide ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleApprove(guest)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
                      >
                        <Check className="h-3.5 w-3.5" />
                        {busy ? "Working…" : "Approve"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleReject(guest)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                      >
                        <X className="h-3.5 w-3.5" />
                        Reject
                      </button>
                    </>
                  ) : null}
                  <AdminActionsMenu
                    actions={[
                      { label: "View details", icon: "view", onClick: () => openView(guest) },
                      ...(pending && canDecide
                        ? [
                            { label: "Approve", icon: "approve", tone: "primary" as const, onClick: () => handleApprove(guest) },
                            { label: "Reject", icon: "reject", tone: "danger" as const, onClick: () => handleReject(guest) },
                          ]
                        : []),
                      ...(guest.status === "active" || guest.status === "expired"
                        ? [{ label: "Extend 7 days", icon: "edit", onClick: () => handleExtend(guest) }]
                        : []),
                      ...(guest.status === "active" || guest.status === "pending_approval"
                        ? [{ label: "Revoke access", icon: "delete", tone: "danger" as const, onClick: () => handleRevoke(guest) }]
                        : []),
                    ]}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <DtPagination
          showing={guests.length}
          total={total}
          page={page}
          lastPage={lastPage}
          onPageChange={setPage}
        />
      </DataTable>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
            <div className="border-b border-slate-100 bg-gradient-to-r from-indigo-600 to-sky-500 px-6 py-5 text-white">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
                    <UserPlus className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="text-lg font-bold">Invite Guest User</h3>
                    <p className="mt-1 text-sm text-white/85">Create temporary access for a visitor to your community.</p>
                  </div>
                </div>
                <button type="button" onClick={() => setShowForm(false)} className="rounded-lg p-1 text-white/80 hover:bg-white/10 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="max-h-[70vh] space-y-5 overflow-y-auto px-6 py-5">
              <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Guest details</p>
                <div className="mt-3 space-y-4">
                  <div>
                    <label className="mb-1.5 flex items-center gap-2 text-[13px] font-medium text-slate-700">
                      <UserPlus className="h-3.5 w-3.5 text-slate-400" />
                      Guest Name *
                    </label>
                    <input className={inputClass(false, "nl-input")} value={form.guest_name} onChange={(e) => setForm((f) => ({ ...f, guest_name: e.target.value }))} placeholder="e.g. Alex Johnson" />
                  </div>
                  <div>
                    <label className="mb-1.5 flex items-center gap-2 text-[13px] font-medium text-slate-700">
                      <Mail className="h-3.5 w-3.5 text-slate-400" />
                      Email *
                    </label>
                    <input type="email" className={inputClass(false, "nl-input")} value={form.guest_email} onChange={(e) => setForm((f) => ({ ...f, guest_email: e.target.value }))} placeholder="guest@email.com" />
                  </div>
                  <div>
                    <label className="mb-1.5 flex items-center gap-2 text-[13px] font-medium text-slate-700">
                      <Phone className="h-3.5 w-3.5 text-slate-400" />
                      Phone *
                    </label>
                    <AdminPhoneInput
                      resetKey={inviteFormKey}
                      required
                      showError={phoneShowError}
                      onChange={(state) => {
                        setPhoneField(state);
                        if (state.valid) setPhoneShowError(false);
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Access window</p>
                  <Calendar className="h-4 w-4 text-slate-400" />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {INVITE_DURATION_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        const start = new Date(form.starts_at || defaultInviteWindow().starts_at);
                        const end = new Date(start.getTime() + preset.hours * 60 * 60 * 1000);
                        const pad = (n: number) => String(n).padStart(2, "0");
                        const toLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                        setForm((f) => ({ ...f, starts_at: toLocal(start), ends_at: toLocal(end) }));
                      }}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Start *</label>
                    <input type="datetime-local" className={inputClass(false, "nl-input")} value={form.starts_at} onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[13px] font-medium text-slate-700">End *</label>
                    <input type="datetime-local" className={inputClass(false, "nl-input")} value={form.ends_at} onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-slate-400" />
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Guest permissions</p>
                </div>
                <p className="mt-2 text-sm text-slate-600">Choose what this guest can view after approval.</p>
                <div className="mt-4 space-y-3">
                  {GUEST_PERMISSION_OPTIONS.map((option) => {
                    const enabled = form.permissions?.[option.key] !== false;
                    return (
                      <label
                        key={option.key}
                        className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
                      >
                        <span>
                          <span className="block text-sm font-semibold text-slate-800">{option.label}</span>
                          <span className="mt-0.5 block text-xs text-slate-500">{option.description}</span>
                        </span>
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          checked={enabled}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              permissions: {
                                ...(f.permissions ?? DEFAULT_GUEST_PERMISSIONS),
                                [option.key]: e.target.checked,
                              },
                            }))
                          }
                        />
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                <p className="text-sm leading-6 text-blue-800">
                  After the guest verifies their phone and invite code, you must approve access before they can use the community.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-6 py-4">
              <button type="button" onClick={() => setShowForm(false)} className="nl-btn-secondary">Cancel</button>
              <button type="button" onClick={handleInvite} disabled={submitting} className="nl-btn-primary disabled:opacity-60">
                <Plus />
                {submitting ? "Creating…" : "Create Invitation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {inviteResult && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
            <h3 className="text-lg font-bold text-slate-900">Invitation ready</h3>
            <p className="mt-2 text-sm text-slate-600">Share this code with {inviteResult.guest_name}:</p>
            <p className="mt-3 rounded-xl bg-blue-50 px-4 py-3 text-center font-mono text-lg font-bold tracking-wider text-blue-700">{inviteResult.invite_code}</p>
            {inviteResult.invite_qr_value ? (
              <p className="mt-2 break-all text-xs text-slate-400">{inviteResult.invite_qr_value}</p>
            ) : null}
            <button type="button" onClick={() => setInviteResult(null)} className="nl-btn-primary mt-4 w-full">Done</button>
          </div>
        </div>
      )}

      {viewing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 backdrop-blur-sm sm:items-center">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
            <div className="border-b border-slate-100 px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <UserAvatar name={viewing.guest_name} src={viewing.guest_avatar_url} size={52} color={isPendingApproval(viewing) ? "#d97706" : "#1B4F8A"} />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <AdminBadge tone={GUEST_STATUS_TONE[viewing.status]}>{GUEST_STATUS_LABELS[viewing.status]}</AdminBadge>
                      <AdminBadge tone={viewing.invitation_type === "admin" ? "violet" : "blue"}>
                        {inviteTypeLabel(viewing.invitation_type)}
                      </AdminBadge>
                    </div>
                    <h3 className="mt-2 text-xl font-bold text-slate-900">{viewing.guest_name}</h3>
                    <p className="text-sm text-slate-500"><PhoneDisplay value={viewing.guest_phone} compact /></p>
                    {viewing.guest_email ? <p className="text-sm text-slate-500">{viewing.guest_email}</p> : null}
                  </div>
                </div>
                <button type="button" onClick={() => setViewing(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["Invite code", viewing.invite_code],
                  ["Access type", viewing.invitation_type === "admin" ? "Admin" : "Guest"],
                  ["Start", formatWhen(viewing.starts_at)],
                  ["End", formatWhen(viewing.ends_at)],
                  ["Last activity", formatWhen(viewing.last_activity_at)],
                  ["Invited by", invitedByLabel(viewing) ?? "—"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{label}</p>
                    <p className={`mt-1 text-sm font-medium text-slate-800 ${label === "Invite code" ? "font-mono tracking-wide" : ""}`}>{value}</p>
                  </div>
                ))}
              </div>

              <div>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Activity timeline</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {activityMeta ? `${activityMeta.total} event${activityMeta.total === 1 ? "" : "s"} logged` : "Guest actions in the community"}
                    </p>
                  </div>
                  {activityMeta && activityMeta.total > 0 ? (
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                      Page {activityMeta.current_page} of {activityMeta.last_page}
                    </span>
                  ) : null}
                </div>

                {activityLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-100" />
                    ))}
                  </div>
                ) : activity.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center text-sm text-slate-400">
                    No activity logged yet.
                  </p>
                ) : (
                  <div className="space-y-5">
                    {activityGroups.map((group) => (
                      <div key={group.label}>
                        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">{group.label}</p>
                        <ul className="relative space-y-0 pl-1">
                          {group.items.map((log, index) => {
                            const visual = guestActionVisual(log.action);
                            const isLastInGroup = index === group.items.length - 1;
                            return (
                              <li key={log.id} className="relative flex gap-3 pb-4">
                                {!isLastInGroup ? (
                                  <span className="absolute left-[17px] top-9 bottom-0 w-px bg-slate-200" aria-hidden />
                                ) : null}
                                <div
                                  className="relative z-[1] flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border shadow-sm"
                                  style={{ backgroundColor: visual.bg, color: visual.color, borderColor: `${visual.color}33` }}
                                >
                                  <ActivityTimelineIcon action={log.action} />
                                </div>
                                <div className="min-w-0 flex-1 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="font-semibold capitalize text-slate-800">{visual.label}</p>
                                      {log.description ? (
                                        <p className="mt-0.5 text-sm text-slate-500">{log.description}</p>
                                      ) : null}
                                    </div>
                                    <p className="shrink-0 text-xs font-medium text-slate-400">{formatWhen(log.created_at)}</p>
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}

                {activityMeta && activityMeta.last_page > 1 ? (
                  <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3">
                    <p className="text-xs text-slate-500">
                      Showing {(activityMeta.current_page - 1) * activityMeta.per_page + 1}–
                      {Math.min(activityMeta.current_page * activityMeta.per_page, activityMeta.total)} of {activityMeta.total}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={activityLoading || activityMeta.current_page <= 1}
                        onClick={() => viewing && loadActivity(viewing.id, activityPage - 1)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        Previous
                      </button>
                      <button
                        type="button"
                        disabled={activityLoading || activityMeta.current_page >= activityMeta.last_page}
                        onClick={() => viewing && loadActivity(viewing.id, activityPage + 1)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Next
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {isPendingApproval(viewing) && canApproveOrRejectGuest(viewing, currentUser) ? (
              <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/80 px-6 py-4 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setViewing(null)} className="nl-btn-secondary w-full sm:w-auto">Close</button>
                <button
                  type="button"
                  disabled={actionId === viewing.id}
                  onClick={() => handleReject(viewing, { closeModal: true })}
                  className="nl-btn-secondary w-full !border-red-200 !text-red-700 hover:!bg-red-50 sm:w-auto"
                >
                  Reject
                </button>
                <button
                  type="button"
                  disabled={actionId === viewing.id}
                  onClick={() => handleApprove(viewing, { closeModal: true })}
                  className="nl-btn-primary w-full sm:w-auto"
                >
                  {actionId === viewing.id ? "Working…" : "Approve access"}
                </button>
              </div>
            ) : (
              <div className="flex shrink-0 justify-end border-t border-slate-100 bg-slate-50/80 px-6 py-4">
                <button type="button" onClick={() => setViewing(null)} className="nl-btn-secondary">Close</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
