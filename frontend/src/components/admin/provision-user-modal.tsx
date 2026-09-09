"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UserPlus, Users, X } from "lucide-react";
import { AdminPhoneInput } from "@/components/admin/phone-input";
import { CommunityAssignmentPicker } from "@/components/admin/community-assignment-picker";
import { ThemedSelect } from "@/components/ui/themed-select";
import { assignCommunityAdmin, fetchAdminCommunitiesList, type AdminCommunity } from "@/lib/api/communities";
import { fetchCommunityAdmins, type CommunityAdminApplicant } from "@/lib/api/community-admins";
import { apiError } from "@/lib/api/client";
import { fetchRegions, type Region } from "@/lib/api/regions";
import { PhoneDisplay } from "@/components/admin/phone-display";
import { AdminBadge } from "@/components/admin/ui";
import { emptyPhoneField, type PhoneFieldState } from "@/lib/phone/format";
import {
  hasProvisionErrors,
  provisionInputClass,
  validateCommunityAdminForm,
  validateResidentForm,
  type ProvisionFieldErrors,
} from "@/lib/admin/provision-user-validation";
import {
  provisionAdminUser,
  type ProvisionUserType,
  type ProvisionedUser,
} from "@/lib/api/users";
import { alertError, toastError, toastSuccess } from "@/lib/alert";

const emptyAdminForm = {
  name: "",
  email: "",
  phone: "",
  region_id: "" as number | "",
  community_mode: "" as "" | "existing" | "new",
  community_id: "" as number | "",
  community_name: "",
  community_address: "",
  community_description: "",
};

const emptyResidentForm = {
  name: "",
  email: "",
  phone: "",
  region_id: "" as number | "",
  community_id: "" as number | "",
};

type TouchedFields = Partial<Record<string, boolean>>;
type AssignmentSource = "create" | "existing";

async function fetchAllApprovedCommunityAdmins(): Promise<CommunityAdminApplicant[]> {
  const first = await fetchCommunityAdmins({ status: "approved", page: 1, per_page: 100 });
  const lastPage = first.meta.last_page ?? 1;
  if (lastPage <= 1) return first.data;

  const rest = await Promise.all(
    Array.from({ length: lastPage - 1 }, (_, index) =>
      fetchCommunityAdmins({ status: "approved", page: index + 2, per_page: 100 }),
    ),
  );

  return [...first.data, ...rest.flatMap((page) => page.data)];
}

export type PresetCommunityAssignment = {
  id: number;
  name: string;
  regionId: number | null;
  regionTitle?: string | null;
};

export function ProvisionUserModal({
  type,
  open,
  onClose,
  onCreated,
  presetCommunity,
}: {
  type: ProvisionUserType;
  open: boolean;
  onClose: () => void;
  onCreated?: (user: ProvisionedUser) => void;
  presetCommunity?: PresetCommunityAssignment | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [communities, setCommunities] = useState<AdminCommunity[]>([]);
  const [loadingRegions, setLoadingRegions] = useState(true);
  const [loadingCommunities, setLoadingCommunities] = useState(false);
  const [adminForm, setAdminForm] = useState(emptyAdminForm);
  const [residentForm, setResidentForm] = useState(emptyResidentForm);
  const [adminPhone, setAdminPhone] = useState<PhoneFieldState>(emptyPhoneField());
  const [residentPhone, setResidentPhone] = useState<PhoneFieldState>(emptyPhoneField());
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<ProvisionFieldErrors>({});
  const [touched, setTouched] = useState<TouchedFields>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [assignmentSource, setAssignmentSource] = useState<AssignmentSource>("create");
  const [existingAdmins, setExistingAdmins] = useState<CommunityAdminApplicant[]>([]);
  const [loadingExistingAdmins, setLoadingExistingAdmins] = useState(false);
  const [selectedExistingId, setSelectedExistingId] = useState<number | null>(null);

  const isPresetAssign = type === "community_admin" && Boolean(presetCommunity);

  useEffect(() => {
    if (!open) return;
    setLoadingRegions(true);
    fetchRegions({ status: "active", per_page: 100 })
      .then((res) => setRegions(res.data.filter((r) => r.status === "active")))
      .catch(() => setRegions([]))
      .finally(() => setLoadingRegions(false));
  }, [open]);

  const loadCommunities = useCallback(async (regionId: number) => {
    setLoadingCommunities(true);
    try {
      const res = await fetchAdminCommunitiesList({
        region_id: regionId,
        status: "active",
        per_page: 100,
        page: 1,
      });
      setCommunities(
        [...res.data].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
      );
    } catch {
      setCommunities([]);
    } finally {
      setLoadingCommunities(false);
    }
  }, []);

  useEffect(() => {
    if (!open || isPresetAssign) return;
    const regionId = type === "resident" ? residentForm.region_id : adminForm.region_id;
    if (!regionId) {
      setCommunities([]);
      if (type === "resident") {
        setResidentForm((prev) => ({ ...prev, community_id: "" }));
      }
      return;
    }
    loadCommunities(Number(regionId));
  }, [open, type, isPresetAssign, residentForm.region_id, adminForm.region_id, loadCommunities]);

  useEffect(() => {
    if (!open) {
      setAdminForm(emptyAdminForm);
      setResidentForm(emptyResidentForm);
      setAdminPhone(emptyPhoneField());
      setResidentPhone(emptyPhoneField());
      setSubmitting(false);
      setErrors({});
      setTouched({});
      setSubmitAttempted(false);
      setAssignmentSource("create");
      setExistingAdmins([]);
      setSelectedExistingId(null);
      return;
    }

    if (type === "community_admin" && presetCommunity) {
      setAdminForm({
        ...emptyAdminForm,
        region_id: presetCommunity.regionId ?? "",
        community_mode: "existing",
        community_id: presetCommunity.id,
      });
    }
  }, [open, type, presetCommunity]);

  useEffect(() => {
    if (!open || !isPresetAssign) return;
    let cancelled = false;
    setLoadingExistingAdmins(true);
    fetchAllApprovedCommunityAdmins()
      .then((admins) => {
        if (!cancelled) setExistingAdmins(admins);
      })
      .catch(() => {
        if (!cancelled) setExistingAdmins([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingExistingAdmins(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, isPresetAssign]);

  const showError = (field: string) =>
    Boolean((submitAttempted || touched[field]) && errors[field]);

  const touch = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const clearFieldError = (field: string) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const focusFirstError = (nextErrors: ProvisionFieldErrors) => {
    const firstKey = Object.keys(nextErrors)[0];
    if (!firstKey || !formRef.current) return;
    const el = formRef.current.querySelector<HTMLElement>(`[data-field="${firstKey}"]`);
    el?.focus();
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const collectLiveErrors = useCallback((): ProvisionFieldErrors => {
    if (isPresetAssign && assignmentSource === "existing") {
      return selectedExistingId
        ? {}
        : { existing_admin: "Select an available community admin." };
    }

    if (isPresetAssign) {
      const next = validateCommunityAdminForm(
        {
          ...adminForm,
          region_id: adminForm.region_id || 1,
          community_mode: "existing",
          community_id: adminForm.community_id || presetCommunity?.id || 1,
        },
        adminPhone,
      );
      delete next.region_id;
      delete next.community_id;
      return next;
    }

    return type === "community_admin"
      ? validateCommunityAdminForm(adminForm, adminPhone)
      : validateResidentForm(residentForm, residentPhone);
  }, [
    isPresetAssign,
    assignmentSource,
    selectedExistingId,
    adminForm,
    adminPhone,
    presetCommunity?.id,
    type,
    residentForm,
    residentPhone,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    setSubmitAttempted(true);
    const nextErrors = collectLiveErrors();
    setErrors(nextErrors);

    if (hasProvisionErrors(nextErrors)) {
      focusFirstError(nextErrors);
      return;
    }

    setSubmitting(true);
    try {
      if (isPresetAssign && presetCommunity) {
        if (assignmentSource === "existing" && selectedExistingId) {
          const res = await assignCommunityAdmin(presetCommunity.id, { user_id: selectedExistingId });
          toastSuccess(res.message);
          onCreated?.({
            id: res.data.admin.id,
            name: res.data.admin.name,
            email: res.data.admin.email,
            phone: res.data.admin.phone ?? "",
            role: res.data.admin.role,
            community_admin_status: "approved",
            status: "active",
            region_id: presetCommunity.regionId,
            membership: {
              community_id: presetCommunity.id,
              role: "admin",
              status: "approved",
            },
            community: {
              id: presetCommunity.id,
              name: presetCommunity.name,
              region_id: presetCommunity.regionId,
              region: presetCommunity.regionTitle ?? null,
            },
          });
          onClose();
          return;
        }

        const res = await assignCommunityAdmin(presetCommunity.id, {
          name: adminForm.name.trim() || undefined,
          email: adminForm.email.trim(),
          phone: adminPhone.e164,
        });
        toastSuccess(res.message);
        onCreated?.({
          id: res.data.admin.id,
          name: res.data.admin.name,
          email: res.data.admin.email,
          phone: res.data.admin.phone ?? "",
          role: res.data.admin.role,
          community_admin_status: "approved",
          status: "active",
          region_id: presetCommunity.regionId,
          membership: {
            community_id: presetCommunity.id,
            role: "admin",
            status: "approved",
          },
          community: {
            id: presetCommunity.id,
            name: presetCommunity.name,
            region_id: presetCommunity.regionId,
            region: presetCommunity.regionTitle ?? null,
          },
        });
        onClose();
        return;
      }

      if (type === "community_admin") {
        const res = await provisionAdminUser(
          adminForm.community_mode === "existing"
            ? {
                type: "community_admin",
                name: adminForm.name.trim() || undefined,
                email: adminForm.email.trim(),
                phone: adminPhone.e164,
                region_id: Number(adminForm.region_id),
                community_id: Number(adminForm.community_id),
              }
            : {
                type: "community_admin",
                name: adminForm.name.trim() || undefined,
                email: adminForm.email.trim(),
                phone: adminPhone.e164,
                region_id: Number(adminForm.region_id),
                community_name: adminForm.community_name.trim(),
                community_address: adminForm.community_address.trim(),
                community_description: adminForm.community_description.trim() || undefined,
              },
        );
        toastSuccess(res.message);
        onCreated?.(res.data);
        onClose();
      } else {
        const res = await provisionAdminUser({
          type: "resident",
          name: residentForm.name.trim() || undefined,
          email: residentForm.email.trim(),
          phone: residentPhone.e164,
          region_id: Number(residentForm.region_id),
          community_id: Number(residentForm.community_id),
        });
        toastSuccess(res.message);
        onCreated?.(res.data);
        onClose();
      }
    } catch (err) {
      await alertError("Could not create user", apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const liveErrors = useMemo(() => collectLiveErrors(), [collectLiveErrors]);

  const canSubmit = !hasProvisionErrors(liveErrors);

  const regionOptions = useMemo(
    () =>
      regions.map((region) => ({
        value: String(region.id),
        label: `${region.title}${region.area ? ` · ${region.area}` : ""}`,
      })),
    [regions],
  );

  const communityOptions = useMemo(
    () => communities.map((community) => ({ value: String(community.id), label: community.name })),
    [communities],
  );

  if (!open) return null;

  const title = isPresetAssign
    ? "Assign Community Admin"
    : type === "community_admin"
      ? "Create Community Admin"
      : "Create Resident";
  const subtitle = isPresetAssign
    ? "Create a new community admin for this community, or assign an existing unassigned account."
    : type === "community_admin"
      ? "Assign this admin to an available community, or create a new one in the selected region."
      : "Add a resident to an existing community with phone and email.";

  const nameValue = type === "community_admin" ? adminForm.name : residentForm.name;
  const emailValue = type === "community_admin" ? adminForm.email : residentForm.email;
  const regionValue = type === "community_admin" ? adminForm.region_id : residentForm.region_id;

  const HeaderIcon = type === "community_admin" ? UserPlus : Users;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 nl-modal-backdrop bg-slate-900/45 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close dialog"
      />
      <div
        data-popover-boundary
        className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-modal-in"
      >
        <div className="flex shrink-0 items-start gap-4 border-b border-slate-100 px-6 py-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-sm shadow-blue-500/25">
            <HeaderIcon className="h-5 w-5" strokeWidth={2} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-slate-900">{title}</h3>
            <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <form
          id="provision-user-form"
          ref={formRef}
          onSubmit={handleSubmit}
          noValidate
          className="min-h-0 flex-1 overflow-y-auto px-6 py-5"
        >
          {isPresetAssign && presetCommunity ? (
            <div className="mb-5 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Region</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">
                  {presetCommunity.regionTitle || "—"}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Community</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">{presetCommunity.name}</p>
              </div>
            </div>
          ) : null}

          {isPresetAssign ? (
            <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => {
                  setAssignmentSource("create");
                  setSelectedExistingId(null);
                  clearFieldError("existing_admin");
                }}
                className={[
                  "rounded-lg px-3 py-2 text-sm font-semibold transition",
                  assignmentSource === "create"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700",
                ].join(" ")}
              >
                Create new
              </button>
              <button
                type="button"
                onClick={() => {
                  setAssignmentSource("existing");
                  setSubmitAttempted(false);
                }}
                className={[
                  "rounded-lg px-3 py-2 text-sm font-semibold transition",
                  assignmentSource === "existing"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700",
                ].join(" ")}
              >
                Assign existing
              </button>
            </div>
          ) : null}

          {isPresetAssign && assignmentSource === "existing" ? (
            <ExistingAdminPicker
              admins={existingAdmins}
              loading={loadingExistingAdmins}
              selectedId={selectedExistingId}
              error={showError("existing_admin") ? errors.existing_admin : undefined}
              onSelect={(id) => {
                setSelectedExistingId(id);
                clearFieldError("existing_admin");
              }}
            />
          ) : (
          <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name (optional)" error={showError("name") ? errors.name : undefined}>
              <input
                data-field="name"
                className={provisionInputClass(showError("name") ? errors.name : undefined)}
                value={nameValue}
                maxLength={100}
                onBlur={() => {
                  touch("name");
                  const next =
                    type === "community_admin"
                      ? validateCommunityAdminForm(adminForm, adminPhone)
                      : validateResidentForm(residentForm, residentPhone);
                  setErrors((prev) => ({ ...prev, name: next.name }));
                }}
                onChange={(e) => {
                  clearFieldError("name");
                  if (type === "community_admin") {
                    setAdminForm((f) => ({ ...f, name: e.target.value }));
                  } else {
                    setResidentForm((f) => ({ ...f, name: e.target.value }));
                  }
                }}
                placeholder="e.g. Ahmed Hassan"
              />
            </Field>
            <Field label="Email address" required error={showError("email") ? errors.email : undefined}>
              <input
                data-field="email"
                type="email"
                className={provisionInputClass(showError("email") ? errors.email : undefined)}
                value={emailValue}
                maxLength={255}
                onBlur={() => {
                  touch("email");
                  const next =
                    type === "community_admin"
                      ? validateCommunityAdminForm(adminForm, adminPhone)
                      : validateResidentForm(residentForm, residentPhone);
                  setErrors((prev) => ({ ...prev, email: next.email }));
                }}
                onChange={(e) => {
                  clearFieldError("email");
                  if (type === "community_admin") {
                    setAdminForm((f) => ({ ...f, email: e.target.value }));
                  } else {
                    setResidentForm((f) => ({ ...f, email: e.target.value }));
                  }
                }}
                placeholder="user@example.com"
              />
            </Field>
            <Field
              label="Phone number"
              required
              className="sm:col-span-2"
              error={showError("phone") ? errors.phone : undefined}
            >
              <AdminPhoneInput
                resetKey={`${type}-${open}-${assignmentSource}`}
                required
                showError={showError("phone")}
                onChange={(state) => {
                  clearFieldError("phone");
                  if (type === "community_admin") {
                    setAdminPhone(state);
                  } else {
                    setResidentPhone(state);
                  }
                }}
                onBlur={() => {
                  touch("phone");
                  const next =
                    type === "community_admin"
                      ? validateCommunityAdminForm(adminForm, adminPhone)
                      : validateResidentForm(residentForm, residentPhone);
                  setErrors((prev) => ({ ...prev, phone: next.phone }));
                }}
              />
            </Field>
            {type === "community_admin" && !isPresetAssign ? (
              <div className="col-span-full grid grid-cols-2 items-start gap-4 [&>label]:min-w-0 [&>label]:w-full [&>label]:overflow-hidden [&>label>span:first-child]:flex [&>label>span:first-child]:h-5 [&>label>span:first-child]:items-center [&_.nl-notice-field]:min-w-0 [&_.nl-notice-field]:w-full [&_.nl-picker-wrap]:min-w-0 [&_.nl-picker-wrap]:w-full [&_.nl-picker-trigger]:box-border [&_.nl-picker-trigger]:h-[47px] [&_.nl-picker-trigger]:min-h-[47px]">
                <Field label="Region" required error={showError("region_id") ? errors.region_id : undefined}>
                  <ThemedSelect
                    fieldKey="region_id"
                    value={regionValue ? String(regionValue) : ""}
                    placeholder={loadingRegions ? "Loading regions…" : "Select region"}
                    error={showError("region_id") ? errors.region_id : undefined}
                    options={regionOptions}
                    onChange={(value) => {
                      clearFieldError("region_id");
                      const next = value ? Number(value) : "";
                      setAdminForm((f) => ({
                        ...f,
                        region_id: next,
                        community_mode: "",
                        community_id: "",
                        community_name: "",
                        community_address: "",
                        community_description: "",
                      }));
                      clearFieldError("community_id");
                      clearFieldError("community_name");
                      clearFieldError("community_address");
                      clearFieldError("community_description");
                    }}
                  />
                </Field>
                <Field
                  label="Community"
                  required
                  hint={!adminForm.region_id ? "Select a region first" : undefined}
                  error={showError("community_id") ? errors.community_id : undefined}
                >
                  <CommunityAssignmentPicker
                    regionSelected={Boolean(adminForm.region_id)}
                    loading={loadingCommunities}
                    communities={communities}
                    selectedCommunityId={adminForm.community_id}
                    addingNew={adminForm.community_mode === "new"}
                    error={showError("community_id") ? errors.community_id : undefined}
                    autoOpenToken={adminForm.region_id}
                    onSelectExisting={(community) => {
                      clearFieldError("community_id");
                      clearFieldError("community_name");
                      clearFieldError("community_address");
                      setAdminForm((f) => ({
                        ...f,
                        community_mode: "existing",
                        community_id: community.id,
                        community_name: "",
                        community_address: "",
                        community_description: "",
                      }));
                    }}
                    onAddNew={() => {
                      clearFieldError("community_id");
                      setAdminForm((f) => ({
                        ...f,
                        community_mode: "new",
                        community_id: "",
                      }));
                    }}
                  />
                </Field>
              </div>
            ) : type === "resident" ? (
              <Field label="Region" required error={showError("region_id") ? errors.region_id : undefined}>
                <ThemedSelect
                  fieldKey="region_id"
                  value={regionValue ? String(regionValue) : ""}
                  placeholder={loadingRegions ? "Loading regions…" : "Select region"}
                  error={showError("region_id") ? errors.region_id : undefined}
                  options={regionOptions}
                  onChange={(value) => {
                    clearFieldError("region_id");
                    const next = value ? Number(value) : "";
                    setResidentForm((f) => ({ ...f, region_id: next, community_id: "" }));
                    clearFieldError("community_id");
                  }}
                />
              </Field>
            ) : null}
          </div>

          {!isPresetAssign && type === "community_admin" && adminForm.community_mode === "new" ? (
            <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
              <p className="text-sm font-medium text-slate-800">New community for this admin</p>
              <p className="text-[12px] text-slate-500">
                This community will be created in the selected region and assigned to this admin.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Community name"
                  required
                  className="sm:col-span-2"
                  error={showError("community_name") ? errors.community_name : undefined}
                >
                  <input
                    data-field="community_name"
                    className={provisionInputClass(showError("community_name") ? errors.community_name : undefined)}
                    value={adminForm.community_name}
                    maxLength={255}
                    onBlur={() => {
                      touch("community_name");
                      const next = validateCommunityAdminForm(adminForm, adminPhone);
                      setErrors((prev) => ({ ...prev, community_name: next.community_name }));
                    }}
                    onChange={(e) => {
                      clearFieldError("community_name");
                      setAdminForm((f) => ({ ...f, community_name: e.target.value }));
                    }}
                    placeholder="e.g. Nile Gardens"
                  />
                </Field>
                <Field
                  label="Address"
                  required
                  className="sm:col-span-2"
                  error={showError("community_address") ? errors.community_address : undefined}
                >
                  <input
                    data-field="community_address"
                    className={provisionInputClass(showError("community_address") ? errors.community_address : undefined)}
                    value={adminForm.community_address}
                    maxLength={500}
                    onBlur={() => {
                      touch("community_address");
                      const next = validateCommunityAdminForm(adminForm, adminPhone);
                      setErrors((prev) => ({ ...prev, community_address: next.community_address }));
                    }}
                    onChange={(e) => {
                      clearFieldError("community_address");
                      setAdminForm((f) => ({ ...f, community_address: e.target.value }));
                    }}
                    placeholder="Street address"
                  />
                </Field>
                <Field
                  label="Description (optional)"
                  className="sm:col-span-2"
                  error={showError("community_description") ? errors.community_description : undefined}
                  hint={`${adminForm.community_description.length}/1000`}
                >
                  <textarea
                    data-field="community_description"
                    rows={3}
                    maxLength={1000}
                    className={`${provisionInputClass(showError("community_description") ? errors.community_description : undefined)} resize-none`}
                    value={adminForm.community_description}
                    onBlur={() => {
                      touch("community_description");
                      const next = validateCommunityAdminForm(adminForm, adminPhone);
                      setErrors((prev) => ({ ...prev, community_description: next.community_description }));
                    }}
                    onChange={(e) => {
                      clearFieldError("community_description");
                      setAdminForm((f) => ({ ...f, community_description: e.target.value }));
                    }}
                    placeholder="Brief community description"
                  />
                </Field>
              </div>
            </div>
          ) : type === "resident" ? (
            <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
              <Field
                label="Community"
                required
                hint={!residentForm.region_id ? "Select a region first" : undefined}
                error={showError("community_id") ? errors.community_id : undefined}
              >
                <ThemedSelect
                  fieldKey="community_id"
                  value={residentForm.community_id ? String(residentForm.community_id) : ""}
                  placeholder={
                    !residentForm.region_id
                      ? "Select a region first"
                      : loadingCommunities
                        ? "Loading communities…"
                        : communities.length
                          ? "Select community"
                          : "No communities in this region"
                  }
                  error={showError("community_id") ? errors.community_id : undefined}
                  options={communityOptions}
                  onChange={(value) => {
                    clearFieldError("community_id");
                    setResidentForm((f) => ({
                      ...f,
                      community_id: value ? Number(value) : "",
                    }));
                  }}
                />
              </Field>
            </div>
          ) : null}
          </>
          )}

        </form>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
          <button type="button" onClick={onClose} className="nl-btn-secondary">
            Cancel
          </button>
          <button
            type="submit"
            form="provision-user-form"
            disabled={submitting || (!isPresetAssign && loadingRegions) || !canSubmit}
            className="nl-btn-primary disabled:opacity-60"
          >
            {submitting
              ? isPresetAssign
                ? "Saving…"
                : "Creating…"
              : isPresetAssign
                ? assignmentSource === "existing"
                  ? "Assign admin"
                  : "Create Community Admin"
                : type === "community_admin"
                  ? "Create Community Admin"
                  : "Create Resident"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ExistingAdminPicker({
  admins,
  loading,
  selectedId,
  error,
  onSelect,
}: {
  admins: CommunityAdminApplicant[];
  loading: boolean;
  selectedId: number | null;
  error?: string;
  onSelect: (id: number) => void;
}) {
  const available = admins.filter((admin) => !admin.community_request);
  const assigned = admins.filter((admin) => Boolean(admin.community_request));

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Unassigned accounts can be attached to this community even if they were created in another region.
        Admins already managing a community stay unavailable.
      </p>
      {loading ? (
        <p className="rounded-xl border border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
          Loading community admins…
        </p>
      ) : admins.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
          No approved community admin accounts yet. Create a new one instead.
        </p>
      ) : (
        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {available.map((admin) => {
            const selected = selectedId === admin.id;
            return (
              <button
                key={admin.id}
                type="button"
                data-field="existing_admin"
                onClick={() => onSelect(admin.id)}
                className={[
                  "flex w-full items-start justify-between gap-3 rounded-xl border px-4 py-3 text-left transition",
                  selected
                    ? "border-blue-300 bg-blue-50"
                    : "border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50",
                ].join(" ")}
              >
                <span>
                  <span className="block text-sm font-semibold text-slate-900">{admin.name}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{admin.email}</span>
                  {admin.phone ? (
                    <span className="mt-0.5 block text-xs text-slate-500">
                      <PhoneDisplay value={admin.phone} compact />
                    </span>
                  ) : null}
                </span>
                <AdminBadge tone="green">Available</AdminBadge>
              </button>
            );
          })}
          {assigned.map((admin) => (
            <div
              key={admin.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 opacity-70"
            >
              <div>
                <p className="text-sm font-semibold text-slate-700">{admin.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Assigned to {admin.community_request?.name ?? "another community"}
                </p>
              </div>
              <AdminBadge tone="slate">Unavailable</AdminBadge>
            </div>
          ))}
          {available.length === 0 && assigned.length > 0 ? (
            <p className="pt-1 text-center text-xs text-slate-500">
              Every listed admin already manages a community. Create a new admin instead.
            </p>
          ) : null}
        </div>
      )}
      {error ? <p className="text-[11px] font-medium text-red-600">{error}</p> : null}
    </div>
  );
}

function Field({
  label,
  children,
  required,
  hint,
  error,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
  error?: string;
  className?: string;
}) {
  return (
    <label className={`block space-y-1.5 ${className}`}>
      <span className="text-[13px] font-medium text-slate-700">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </span>
      {children}
      {error ? (
        <span className="block text-[11px] font-medium text-red-600">{error}</span>
      ) : hint ? (
        <span className="block text-[11px] text-slate-400">{hint}</span>
      ) : null}
    </label>
  );
}
