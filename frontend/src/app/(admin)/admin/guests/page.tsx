"use client";

import { ClearableInput } from "@/components/admin/clearable-field";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Activity, Calendar, Check, ChevronLeft, ChevronRight, Clock, Eye, Info, LogIn, Mail, Phone, Plus, RefreshCw, Shield, UserPlus, X } from "lucide-react";
import { AdminBadge, DataTable, DtPagination, StatTile } from "@/components/admin/ui";
import { AdminActionsMenu } from "@/components/admin/admin-actions-menu";
import { UserAvatar } from "@/components/admin/user-avatar";
import { MemberUnitsLabel } from "@/components/admin/member-units-label";
import { confirmAction, confirmDelete, confirmRejectWithReason, alertError, toastError, toastSuccess } from "@/lib/alert";
import { apiError, apiFieldErrors } from "@/lib/api/client";
import { PageLoader, PageError } from "@/components/shared/page-states";
import { PhoneDisplay } from "@/components/admin/phone-display";
import { AdminPhoneInput } from "@/components/admin/phone-input";
import { emptyPhoneField, type PhoneFieldState } from "@/lib/phone/format";
import {
  approveGuest,
  deleteGuestInvitation,
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
  INITIAL_GUEST_INVITE_PERMISSIONS,
  applyGuestPermissionToggle,
  normalizeGuestPermissions,
  GUEST_PERMISSION_OPTIONS,
  type GuestPermissions,
} from "@/lib/api/guests";
import { inputClass } from "@/lib/admin/form-validation-utils";
import { ThemedDatePicker } from "@/components/ui/themed-date-picker";
import { ThemedTimePicker } from "@/components/ui/themed-time-picker";
import { toDatetimeLocalValue } from "@/lib/admin/datetime-local";
import {
  canSubmitGuestInvite,
  guestAccessEarliestEndLocalValue,
  guestAccessLatestEnd,
  guestAccessLatestEndLocalValue,
  guestDurationFieldError,
  guestEmailFieldError,
  GUEST_DURATION_MAX_MESSAGE,
  GUEST_EMAIL_EXISTS_MESSAGE,
  GUEST_NAME_MAX,
  guestNameFieldError,
  guestPermissionsFieldError,
  guestStartFieldError,
  isDuplicateGuestEmailError,
  normalizeGuestInviteWindow,
} from "@/lib/admin/guest-invite-validation";
import { parseDatetimeLocalValue } from "@/lib/admin/datetime-local";
import { ADMIN_TABLE_PAGE_SIZE } from "@/lib/admin/table-pagination";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { adminTableBusy, isAdminSearchPending, shouldSkipStalePageFetch } from "@/lib/admin/table-loading";
import { canAccessCommunityDashboard, getUser, type WebUser } from "@/lib/auth/session";

const emptyForm: GuestForm = {
  guest_name: "",
  guest_email: "",
  guest_phone: "",
  starts_at: "",
  ends_at: "",
  permissions: { ...INITIAL_GUEST_INVITE_PERMISSIONS },
};

type GuestFilter = GuestStatus | "all" | "pending";

const ACTIVITY_PAGE_SIZE = 5;
const GUEST_LIST_POLL_MS = 15_000;

const INVITE_DURATION_PRESETS = [
  { label: "1 hour", hours: 1 },
  { label: "6 hours", hours: 6 },
  { label: "1 day", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "1 week", hours: 168 },
];

function resolveInviteDurationPresetHours(startsAt: string, endsAt: string): number | null {
  const start = parseDatetimeLocalValue(startsAt);
  const end = parseDatetimeLocalValue(endsAt);
  if (!start || !end) return null;

  const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60_000);
  if (durationMinutes <= 0) return null;

  const match = INVITE_DURATION_PRESETS.find(
    (preset) => Math.abs(durationMinutes - preset.hours * 60) <= 1,
  );
  return match?.hours ?? null;
}

function defaultInviteWindow() {
  const start = new Date();
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { starts_at: toDatetimeLocalValue(start), ends_at: toDatetimeLocalValue(end) };
}

const GUEST_ACTION_VISUAL: Record<string, { bg: string; color: string; label: string }> = {
  login: { bg: "#E8F0F7", color: "#1B4F8A", label: "Logged in" },
  verification_complete: { bg: "#FFFBEB", color: "#D97706", label: "Verified invite" },
  access_activated: { bg: "#ECFDF5", color: "#059669", label: "Access activated" },
  access_rejected: { bg: "#FEF2F2", color: "#DC2626", label: "Access rejected" },
  access_revoked: { bg: "#FEF2F2", color: "#DC2626", label: "Access revoked" },
  invitation_cancelled: { bg: "#FEF2F2", color: "#DC2626", label: "Invitation deleted" },
  access_extended: { bg: "#F5F3FF", color: "#7C3AED", label: "Access extended" },
  viewed_posts: { bg: "#F0FDF4", color: "#16A34A", label: "Viewed feed" },
  viewed_notices: { bg: "#E8F0F7", color: "#1B4F8A", label: "Viewed notices" },
  viewed_events: { bg: "#F5F3FF", color: "#7C3AED", label: "Viewed events" },
  viewed_marketplace: { bg: "#E8F0F7", color: "#EA580C", label: "Viewed marketplace" },
  viewed_businesses: { bg: "#ECFEFF", color: "#0891B2", label: "Viewed businesses" },
  viewed_wellness: { bg: "#FDF2F8", color: "#DB2777", label: "Viewed wellness" },
  viewed_services: { bg: "#EEF2FF", color: "#4F46E5", label: "Viewed services" },
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

function invitedByLabel(guest: GuestInvitation): ReactNode {
  if (guest.resident) {
    const name = guest.resident.display_name || guest.resident.name;
    const units = guest.resident.units?.length
      ? guest.resident.units
      : guest.resident.unit_number
        ? [guest.resident.unit_number]
        : [];
    if (units.length === 0) return `Invited by ${name}`;
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        <span>Invited by {name} ·</span>
        <MemberUnitsLabel units={units} variant="inline" empty={null} />
      </span>
    );
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

function dateTimeParts(value: string) {
  return {
    date: value.slice(0, 10),
    time: value.length >= 16 ? value.slice(11, 16) : "",
  };
}

function joinDateTime(date: string, time: string) {
  if (!date) return "";
  return `${date}T${time || "00:00"}`;
}

function GuestDateTimeField({
  value,
  min,
  max,
  invalid,
  onChange,
}: {
  value: string;
  min?: string;
  max?: string;
  invalid?: boolean;
  onChange: (value: string) => void;
}) {
  const { date, time } = dateTimeParts(value);
  return (
    <div className="grid grid-cols-1 gap-2">
      <ThemedDatePicker
        value={date}
        min={min?.slice(0, 10) || undefined}
        max={max?.slice(0, 10) || undefined}
        error={invalid ? " " : undefined}
        onChange={(nextDate) => onChange(joinDateTime(nextDate, time))}
      />
      <ThemedTimePicker
        value={time}
        error={invalid ? " " : undefined}
        onChange={(nextTime) => onChange(joinDateTime(date || min?.slice(0, 10) || "", nextTime))}
      />
    </div>
  );
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
  const isSearchPending = isAdminSearchPending(searchInput, debouncedSearch);
  const [filterStatus, setFilterStatus] = useState<GuestFilter>("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<GuestForm>(emptyForm);
  const activeInvitePresetHours = useMemo(
    () => resolveInviteDurationPresetHours(form.starts_at, form.ends_at),
    [form.starts_at, form.ends_at],
  );
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
  const [nameTouched, setNameTouched] = useState(false);
  const [permissionsError, setPermissionsError] = useState<string | null>(null);
  const [emailExistsError, setEmailExistsError] = useState<string | null>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const hasLoadedOnce = useRef(false);
  const prevFilterKey = useRef(`${filterStatus}|`);

  useEffect(() => {
    setCurrentUser(getUser());
    const onSessionUpdate = () => setCurrentUser(getUser());
    window.addEventListener("nbr-session-updated", onSessionUpdate);
    return () => window.removeEventListener("nbr-session-updated", onSessionUpdate);
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      if (!hasLoadedOnce.current) {
        setInitialLoading(true);
      } else {
        setRefreshing(true);
      }
    }
    try {
      const res = await fetchGuests({
        status: filterStatus,
        search: debouncedSearch,
        page,
        per_page: ADMIN_TABLE_PAGE_SIZE,
      });
      setGuests(res.data);
      setViewing((current) => {
        if (!current) return current;
        return res.data.find((guest) => guest.id === current.id) ?? current;
      });
      setTotal(res.meta.total);
      setLastPage(res.meta.last_page ?? 1);
      setStats({
        total: res.meta.stats?.total ?? res.meta.total,
        active: res.meta.stats?.active ?? 0,
        pending_verification: res.meta.stats?.pending_verification ?? 0,
        pending_approval: res.meta.stats?.pending_approval ?? 0,
        expired: res.meta.stats?.expired ?? 0,
      });
      if (!silent) setPageError(null);
    } catch (err) {
      if (!silent) setPageError(apiError(err));
    } finally {
      hasLoadedOnce.current = true;
      if (!silent) {
        setInitialLoading(false);
        setRefreshing(false);
      }
    }
  }, [filterStatus, debouncedSearch, page]);

  useEffect(() => {
    const filterKey = `${filterStatus}|${debouncedSearch}`;
    if (shouldSkipStalePageFetch(filterKey, page, setPage, prevFilterKey)) return;
    void load();
  }, [filterStatus, debouncedSearch, page, load]);

  useEffect(() => {
    if (actionId !== null || submitting) return undefined;
    const timer = window.setInterval(() => {
      void load(true);
    }, GUEST_LIST_POLL_MS);
    return () => window.clearInterval(timer);
  }, [load, actionId, submitting]);

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

  const minStartAt = useMemo(() => toDatetimeLocalValue(new Date()), [showForm]);
  const startValidationNow = useMemo(() => new Date(), [form.starts_at]);
  const nameError = form.guest_name.trim() || nameTouched ? guestNameFieldError(form.guest_name) : null;
  const emailError = guestEmailFieldError(form.guest_email) ?? emailExistsError;
  const startError = guestStartFieldError(form.starts_at, startValidationNow);
  const durationError = guestDurationFieldError(form.starts_at, form.ends_at);
  const minEndAt = guestAccessEarliestEndLocalValue(form.starts_at);
  const maxEndAt = guestAccessLatestEndLocalValue(form.starts_at);
  const canCreateInvitation =
    canSubmitGuestInvite(form, phoneField, startValidationNow) && !submitting && !emailExistsError;

  const handlePermissionToggle = (key: keyof GuestPermissions, checked: boolean) => {
    setForm((f) => {
      const current = f.permissions ?? { ...INITIAL_GUEST_INVITE_PERMISSIONS };
      const result = applyGuestPermissionToggle(current, key, checked);
      setPermissionsError(result.error);
      return { ...f, permissions: result.permissions };
    });
  };

  const handleInvite = async () => {
    const permissionError = guestPermissionsFieldError(form.permissions);
    if (permissionError) {
      setPermissionsError(permissionError);
      return;
    }
    const normalizedWindow = normalizeGuestInviteWindow(form.starts_at, form.ends_at);
    if (
      normalizedWindow.starts_at !== form.starts_at ||
      normalizedWindow.ends_at !== form.ends_at
    ) {
      setForm((f) => ({ ...f, ...normalizedWindow }));
    }

    const submitForm = { ...form, ...normalizedWindow };
    if (!canSubmitGuestInvite(submitForm, phoneField)) {
      if (phoneField.digits && (!phoneField.valid || !phoneField.e164)) {
        setPhoneShowError(true);
        toastError("Enter a valid phone number, or leave phone blank.");
      }
      const windowError = guestDurationFieldError(submitForm.starts_at, submitForm.ends_at);
      if (windowError) toastError(windowError);
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        ...submitForm,
        guest_phone: phoneField.e164 || "",
        starts_at: parseDatetimeLocalValue(submitForm.starts_at)!.toISOString(),
        ends_at: parseDatetimeLocalValue(submitForm.ends_at)!.toISOString(),
        permissions: normalizeGuestPermissions(submitForm.permissions),
      };
      const created = await inviteGuest(payload);
      toastSuccess("Guest invitation created");
      setInviteResult(created);
      setShowForm(false);
      setForm(emptyForm);
      setPhoneField(emptyPhoneField());
      setPhoneShowError(false);
      setPermissionsError(null);
      setEmailExistsError(null);
      setNameTouched(false);
      await load();
    } catch (err) {
      const fields = apiFieldErrors(err);
      if (fields.permissions) setPermissionsError(fields.permissions);
      if (fields.starts_at) toastError(fields.starts_at);
      if (fields.ends_at) toastError(fields.ends_at);
      if (isDuplicateGuestEmailError(fields, err)) {
        setEmailExistsError(GUEST_EMAIL_EXISTS_MESSAGE);
        requestAnimationFrame(() => emailInputRef.current?.focus());
        return;
      }
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
      const updated = await rejectGuest(guest.id, String(r.value ?? "").trim() || undefined);
      toastSuccess(`Guest access request for ${guest.guest_name} has been rejected.`);
      if (opts?.closeModal) setViewing(null);
      else if (viewing?.id === guest.id) setViewing(updated);
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

  const handleDeleteInvitation = async (guest: GuestInvitation) => {
    const ok = await confirmDelete({
      title: `Delete invitation for ${guest.guest_name}?`,
      text: "This cancels the pending invite. They will not be able to join with this code.",
      confirmText: "Delete invitation",
    });
    if (!ok.isConfirmed) return;

    setActionId(guest.id);
    try {
      await deleteGuestInvitation(guest.id);
      toastSuccess("Guest invitation deleted successfully.");
      if (viewing?.id === guest.id) setViewing(null);
      setGuests((rows) => rows.filter((row) => row.id !== guest.id));
      setTotal((count) => Math.max(0, count - 1));
      setStats((current) => ({
        ...current,
        total: Math.max(0, current.total - 1),
        pending_verification: Math.max(0, current.pending_verification - 1),
      }));
      await load();
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setActionId(null);
    }
  };

  const handleExtend = async (guest: GuestInvitation) => {
    const nextWeek = new Date(guest.ends_at);
    nextWeek.setDate(nextWeek.getDate() + 7);
    const start = new Date(guest.starts_at);
    if (!Number.isNaN(start.getTime()) && nextWeek.getTime() > guestAccessLatestEnd(start).getTime()) {
      toastError(GUEST_DURATION_MAX_MESSAGE);
      return;
    }
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
            Invite temporary guests, review resident requests and manage access windows.
          </p>
        </div>
        <button type="button" onClick={() => { setForm({ ...emptyForm, permissions: { ...INITIAL_GUEST_INVITE_PERMISSIONS }, ...defaultInviteWindow() }); setPhoneField(emptyPhoneField()); setPhoneShowError(false); setPermissionsError(null); setEmailExistsError(null); setNameTouched(false); setInviteFormKey((k) => k + 1); setShowForm(true); }} className="nl-btn-primary">
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
        searching={isSearchPending}
        loading={adminTableBusy(refreshing, actionId !== null, submitting)}
        isEmpty={guests.length === 0}
        empty={searchInput || filterStatus !== "all" ? "No guests match your filters." : "No guest invitations yet. Click \"Invite Guest User\" to get started."}
      >
        <div className="divide-y divide-slate-100">
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
                      ...(guest.status === "pending_verification"
                        ? [{ label: "Delete Invitation", icon: "delete", tone: "danger" as const, onClick: () => handleDeleteInvitation(guest) }]
                        : []),
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
          <div className="nl-guest-invite-card w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
            <div className="border-b border-slate-100 bg-gradient-to-r from-[var(--navy)] via-[#163A66] to-[var(--deep-teal)] px-6 py-5 text-white">
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

            <div className="nl-guest-invite-body max-h-[70vh] space-y-5 overflow-y-auto px-6 py-5">
              <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Guest details</p>
                <div className="mt-3 space-y-4">
                  <div>
                    <label className="mb-1.5 flex items-center gap-2 text-[13px] font-medium text-slate-700">
                      <UserPlus className="h-3.5 w-3.5 text-slate-400" />
                      Guest Name *
                    </label>
                    <ClearableInput
                      className={inputClass(nameError, "nl-input")}
                      value={form.guest_name}
                      maxLength={GUEST_NAME_MAX}
                      onChange={(e) => setForm((f) => ({ ...f, guest_name: e.target.value.slice(0, GUEST_NAME_MAX) }))}
                      onBlur={() => setNameTouched(true)}
                      placeholder="e.g. Alex Johnson"
                      aria-invalid={Boolean(nameError)}
                    />
                    {nameError ? <p className="mt-1 text-xs text-red-600">{nameError}</p> : null}
                  </div>
                  <div>
                    <label className="mb-1.5 flex items-center gap-2 text-[13px] font-medium text-slate-700">
                      <Mail className="h-3.5 w-3.5 text-slate-400" />
                      Email *
                    </label>
                    <ClearableInput
                      ref={emailInputRef}
                      type="email"
                      className={inputClass(emailError, "nl-input")}
                      value={form.guest_email}
                      onChange={(e) => {
                        setEmailExistsError(null);
                        setForm((f) => ({ ...f, guest_email: e.target.value }));
                      }}
                      placeholder="guest@email.com"
                      aria-invalid={Boolean(emailError)}
                    />
                    {emailError ? <p className="mt-1 text-xs text-red-600">{emailError}</p> : null}
                  </div>
                  <div>
                    <label className="mb-1.5 flex items-center gap-2 text-[13px] font-medium text-slate-700">
                      <Phone className="h-3.5 w-3.5 text-slate-400" />
                      Phone (optional)
                    </label>
                    <AdminPhoneInput
                      resetKey={inviteFormKey}
                      required={false}
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
                  {INVITE_DURATION_PRESETS.map((preset) => {
                    const isActive = activeInvitePresetHours === preset.hours;

                    return (
                      <button
                        key={preset.label}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => {
                          const now = new Date();
                          now.setSeconds(0, 0);
                          const parsedStart =
                            parseDatetimeLocalValue(form.starts_at) ??
                            parseDatetimeLocalValue(defaultInviteWindow().starts_at) ??
                            now;
                          const start = parsedStart.getTime() < now.getTime() ? now : parsedStart;
                          const end = new Date(start.getTime() + preset.hours * 60 * 60 * 1000);
                          setForm((f) => ({
                            ...f,
                            starts_at: toDatetimeLocalValue(start),
                            ends_at: toDatetimeLocalValue(end),
                          }));
                        }}
                        className={[
                          "nl-schedule-chip px-3 py-1.5 text-xs",
                          isActive ? "nl-schedule-chip--active" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Start *</label>
                    <GuestDateTimeField
                      value={form.starts_at}
                      min={minStartAt}
                      invalid={Boolean(startError)}
                      onChange={(starts_at) => setForm((f) => ({ ...f, starts_at }))}
                    />
                    {startError ? <p className="mt-1 text-xs text-red-600">{startError}</p> : null}
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[13px] font-medium text-slate-700">End *</label>
                    <GuestDateTimeField
                      value={form.ends_at}
                      min={minEndAt || undefined}
                      max={maxEndAt || undefined}
                      invalid={Boolean(durationError)}
                      onChange={(ends_at) => setForm((f) => ({ ...f, ends_at }))}
                    />
                    {durationError ? <p className="mt-1 text-xs text-red-600">{durationError}</p> : null}
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
                    const enabled = Boolean(form.permissions?.[option.key]);
                    return (
                      <label
                        key={option.key}
                        className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
                      >
                        <span>
                          <span className="block text-sm font-semibold text-slate-800">{option.label}</span>
                          <span className="mt-0.5 block text-xs text-slate-500">{option.description}</span>
                        </span>
                        <ClearableInput
                          type="checkbox"
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          checked={enabled}
                          onChange={(e) => handlePermissionToggle(option.key, e.target.checked)}
                        />
                      </label>
                    );
                  })}
                </div>
                {permissionsError ? <p className="mt-2 text-xs text-red-600">{permissionsError}</p> : null}
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
              <button
                type="button"
                onClick={handleInvite}
                disabled={!canCreateInvitation}
                className="nl-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
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
              {viewing.status === "rejected" && viewing.rejection_reason ? (
                <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-rose-500">
                    Rejection reason
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-rose-800">{viewing.rejection_reason}</p>
                </div>
              ) : null}
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
