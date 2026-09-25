"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  Building2,
  Camera,
  Check,
  KeyRound,
  Loader2,
  MapPin,
  Pencil,
  Shield,
  User,
  X,
} from "lucide-react";
import { getUser, updateUser } from "@/lib/auth/session";
import { toastSuccess, toastError } from "@/lib/alert";
import { AdminPhoneInput } from "@/components/admin/phone-input";
import { PhoneDisplay } from "@/components/admin/phone-display";
import { emptyPhoneField, phoneFieldFromE164, type PhoneFieldState } from "@/lib/phone/format";
import {
  fetchMe,
  updateMe,
  uploadAvatar,
  changePassword,
  meToSessionUser,
  type MeProfile,
} from "@/lib/api/profile";
import { apiError } from "@/lib/api/client";
import { resolveMediaUrl } from "@/lib/media/resolve-url";
import {
  COMMUNITY_ADMIN_NAME_MAX,
  applyCharacterLimit,
} from "@/lib/admin/community-admin-field-limits";
import { validatePasswordForm, validateProfileForm } from "@/lib/admin/profile-validation";
import {
  adminRoleLabel,
  loadAdminNotificationPrefs,
  profileFormFromMe,
  saveAdminNotificationPrefs,
  type AdminNotificationPrefs,
} from "@/lib/admin/profile-utils";
import { hasFieldErrors, inputClass } from "@/lib/admin/form-validation-utils";
import { AdjustFeatureSetModal } from "@/components/admin/adjust-feature-set-modal";
import { DashboardHero } from "@/components/admin/dashboard/dashboard-shared";
import { DashboardPanel } from "@/components/admin/dashboard/dashboard-panel";
import { AdminBadge } from "@/components/admin/ui";
import { statusLabel, type MembershipStatus } from "@/lib/api/members";
import { NL } from "@/lib/design-tokens";
import { formatAccountContact, formatAccountDisplayName, formatDisplayEmail } from "@/lib/user/email-display";

const NOTIFICATION_PREFS = [
  { key: "newMemberAlerts" as const, label: "New member alerts", desc: "When a resident joins or requests approval" },
  { key: "moderationAlerts" as const, label: "Moderation reports", desc: "When a new moderation report is filed" },
  { key: "systemAlerts" as const, label: "System alerts", desc: "Critical platform and security notices" },
  { key: "weeklyDigest" as const, label: "Weekly summary", desc: "Weekly digest of community activity" },
];

type ProfileForm = {
  name: string;
  phone: string;
  bio: string;
  role: string;
  email: string;
  avatarUrl: string | null;
  status: string;
  region: string | null;
  communities: { id: number; name: string; status: string }[];
};

const EMPTY_FORM: ProfileForm = {
  name: "",
  phone: "",
  bio: "",
  role: "Administrator",
  email: "",
  avatarUrl: null,
  status: "Active",
  region: null,
  communities: [],
};

export default function AdminProfilePage() {
  const sessionUser = getUser();
  const [me, setMe] = useState<MeProfile | null>(null);
  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM);
  const [savedForm, setSavedForm] = useState<ProfileForm>(EMPTY_FORM);
  const [phoneField, setPhoneField] = useState<PhoneFieldState>(emptyPhoneField());
  const [prefs, setPrefs] = useState<AdminNotificationPrefs>(() =>
    loadAdminNotificationPrefs(sessionUser?.id),
  );
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profileErrors, setProfileErrors] = useState<Partial<Record<string, string>>>({});
  const [profileTouched, setProfileTouched] = useState<Partial<Record<string, boolean>>>({});
  const [profileSubmitAttempted, setProfileSubmitAttempted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const profileFormRef = useRef<HTMLFormElement>(null);
  const [featureTarget, setFeatureTarget] = useState<{ id: number; name: string } | null>(null);

  const applyMe = useCallback((data: MeProfile) => {
    const next = profileFormFromMe(data);
    setMe(data);
    setForm(next);
    setSavedForm(next);
    setPhoneField(phoneFieldFromE164(data.phone));
    setPrefs(loadAdminNotificationPrefs(data.id));
    updateUser(meToSessionUser(data));
  }, []);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      applyMe(await fetchMe());
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setLoading(false);
    }
  }, [applyMe]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const name = formatAccountDisplayName(
    { name: form.name, phone: form.phone, email: form.email },
    "Admin",
  );
  const contactLine = formatAccountContact({ phone: form.phone, email: form.email });
  const displayEmail = formatDisplayEmail(form.email);
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const isCommunityAdminAccount = me?.role === "community_admin";
  const nameMax = isCommunityAdminAccount ? COMMUNITY_ADMIN_NAME_MAX : 100;

  const showProfileError = (field: string) =>
    Boolean((profileSubmitAttempted || profileTouched[field]) && profileErrors[field]);

  const profileFieldErrors = (nameValue: string, phoneValue = phoneField, bioValue = form.bio) =>
    validateProfileForm(nameValue, phoneValue, bioValue, { communityAdmin: isCommunityAdminAccount });

  const cancelEdit = () => {
    setForm(savedForm);
    setPhoneField(phoneFieldFromE164(savedForm.phone));
    setEditing(false);
    setProfileErrors({});
    setProfileTouched({});
    setProfileSubmitAttempted(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSubmitAttempted(true);
    const nextErrors = profileFieldErrors(form.name);
    setProfileErrors(nextErrors);
    if (hasFieldErrors(nextErrors)) {
      const firstKey = Object.keys(nextErrors)[0];
      profileFormRef.current?.querySelector<HTMLElement>(`[data-field="${firstKey}"]`)?.focus();
      toastError("Please fix the highlighted fields before saving.");
      return;
    }

    setSaving(true);
    try {
      const updated = await updateMe({
        name: form.name.trim(),
        phone: phoneField.valid ? phoneField.e164 : form.phone || undefined,
        bio: form.bio.trim() || undefined,
        display_name: form.name.trim(),
      });
      applyMe(updated);
      setEditing(false);
      setProfileErrors({});
      setProfileTouched({});
      setProfileSubmitAttempted(false);
      toastSuccess("Profile updated successfully.");
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toastError("Photo must be 5 MB or smaller.");
      return;
    }

    setUploadingPhoto(true);
    try {
      const res = await uploadAvatar(file);
      setForm((f) => ({ ...f, avatarUrl: res.avatar_url }));
      setSavedForm((f) => ({ ...f, avatarUrl: res.avatar_url }));
      updateUser({
        name: form.name,
        profile: {
          display_name: form.name,
          avatar: res.avatar_url,
          avatar_url: res.avatar_url,
        },
      });
      toastSuccess("Profile photo updated.");
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handlePrefChange = (key: keyof AdminNotificationPrefs, value: boolean) => {
    if (!me?.id) return;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    saveAdminNotificationPrefs(me.id, next);
    toastSuccess("Notification preference saved.");
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin" style={{ color: NL.brandPrimary }} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <DashboardHero
        eyebrow="Account"
        title="My Profile"
        description="Update your account details, security settings, and notification preferences."
        variant="system"
        badges={
          <>
            <AdminBadge tone="blue">{form.role}</AdminBadge>
            <AdminBadge tone={form.status === "Active" ? "green" : "amber"}>{form.status}</AdminBadge>
          </>
        }
      />

      <section
        className="overflow-hidden rounded-2xl border bg-white"
        style={{ borderColor: NL.borderCard, boxShadow: NL.shadowCard }}
      >
        <div className="h-20 w-full" style={{ background: "linear-gradient(135deg, #F6F8FB 0%, #E8F0F7 100%)" }} />
        <div className="px-5 pb-5 sm:px-6">
          <div className="-mt-10 flex flex-wrap items-end gap-4">
            <div className="relative shrink-0">
              {form.avatarUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={resolveMediaUrl(form.avatarUrl) ?? form.avatarUrl}
                  alt={name}
                  className="h-20 w-20 rounded-2xl border-4 border-white object-cover shadow-md"
                />
              ) : (
                <div
                  className="flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-white text-2xl font-bold text-white shadow-md"
                  style={{ background: NL.fillCta }}
                >
                  {initials || "A"}
                </div>
              )}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploadingPhoto}
                title="Change photo"
                className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-white shadow transition hover:opacity-90 disabled:opacity-60"
                style={{ background: NL.brandPrimaryDeep }}
              >
                {uploadingPhoto ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Camera className="h-3.5 w-3.5" strokeWidth={2.25} />
                )}
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
            </div>

            <div className="min-w-0 flex-1 pb-1">
              <h1 className="text-xl font-bold" style={{ color: NL.textPrimary }}>
                {name}
              </h1>
              <p className="mt-0.5 text-[13px]" style={{ color: NL.textSecondary }}>
                {form.role}{contactLine ? ` · ${contactLine}` : ""}
              </p>
            </div>

            <button
              type="button"
              onClick={() => (editing ? cancelEdit() : setEditing(true))}
              className={editing ? "nl-btn-secondary inline-flex items-center gap-1.5" : "nl-btn-primary inline-flex items-center gap-1.5"}
            >
              {editing ? (
                <>
                  <X className="h-4 w-4" strokeWidth={2} /> Cancel
                </>
              ) : (
                <>
                  <Pencil className="h-4 w-4" strokeWidth={2} /> Edit Profile
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <DashboardPanel
            fit
            compact
            title={editing ? "Edit Information" : "Profile Information"}
            description="Details visible across the admin portal"
            icon={User}
            tone="blue"
            action={
              !editing ? (
                <button type="button" onClick={() => setEditing(true)} className="text-[12px] font-bold hover:opacity-80" style={{ color: NL.link }}>
                  Edit →
                </button>
              ) : null
            }
          >
            {editing ? (
              <form ref={profileFormRef} onSubmit={handleSave} noValidate className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="nl-label mb-1.5">
                      Full Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      data-field="name"
                      className={inputClass(showProfileError("name") ? profileErrors.name : undefined, "nl-input w-full")}
                      value={form.name}
                      maxLength={form.name.length > nameMax ? undefined : nameMax}
                      onBlur={() => {
                        setProfileTouched((t) => ({ ...t, name: true }));
                        const next = profileFieldErrors(form.name);
                        setProfileErrors((prev) => ({ ...prev, name: next.name }));
                      }}
                      onChange={(e) => {
                        const nextName = applyCharacterLimit(form.name, e.target.value, nameMax);
                        setForm((f) => ({ ...f, name: nextName }));
                        setProfileErrors((prev) => {
                          if (!(profileSubmitAttempted || profileTouched.name)) {
                            if (!prev.name) return prev;
                            const next = { ...prev };
                            delete next.name;
                            return next;
                          }
                          const nameError = profileFieldErrors(nextName).name;
                          const next = { ...prev };
                          if (nameError) next.name = nameError;
                          else delete next.name;
                          return next;
                        });
                      }}
                    />
                    <div className="mt-1 flex items-start justify-between gap-3">
                      {showProfileError("name") && profileErrors.name ? (
                        <p className="text-[11px] font-medium text-red-600">{profileErrors.name}</p>
                      ) : (
                        <span />
                      )}
                      {isCommunityAdminAccount ? (
                        <p className={`ml-auto shrink-0 text-[11px] tabular-nums ${form.name.length > nameMax ? "font-medium text-red-600" : ""}`} style={form.name.length > nameMax ? undefined : { color: NL.textMuted }}>
                          {form.name.length} / {nameMax}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <label className="nl-label">Email</label>
                      <span className="text-[11px] font-medium" style={{ color: NL.textMuted }}>
                        Read only
                      </span>
                    </div>
                    <input
                      className="nl-input w-full cursor-not-allowed"
                      style={{
                        background: NL.surfaceMuted,
                        color: NL.textSecondary,
                        borderColor: NL.borderCard,
                        WebkitTextFillColor: NL.textSecondary,
                      }}
                      value={displayEmail ?? ""}
                      placeholder="Phone sign-in — no email on file"
                      disabled
                      readOnly
                      aria-readonly="true"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="nl-label mb-1.5">Phone</label>
                    <div data-field="phone">
                      <AdminPhoneInput
                        value={form.phone}
                        onChange={(state) => {
                          setPhoneField(state);
                          setForm((f) => ({ ...f, phone: state.e164 || f.phone }));
                          setProfileErrors((prev) => {
                            if (!prev.phone) return prev;
                            const next = { ...prev };
                            delete next.phone;
                            return next;
                          });
                        }}
                        onBlur={() => {
                          setProfileTouched((t) => ({ ...t, phone: true }));
                          const next = profileFieldErrors(form.name);
                          setProfileErrors((prev) => ({ ...prev, phone: next.phone }));
                        }}
                      />
                    </div>
                    {showProfileError("phone") && profileErrors.phone ? (
                      <p className="mt-1 text-[11px] font-medium text-red-600">{profileErrors.phone}</p>
                    ) : null}
                  </div>
                </div>
                <div>
                  <label className="nl-label mb-1.5">Bio</label>
                  <textarea
                    data-field="bio"
                    className={inputClass(showProfileError("bio") ? profileErrors.bio : undefined, "nl-input w-full resize-none")}
                    rows={3}
                    maxLength={500}
                    value={form.bio}
                    onBlur={() => {
                      setProfileTouched((t) => ({ ...t, bio: true }));
                      const next = profileFieldErrors(form.name);
                      setProfileErrors((prev) => ({ ...prev, bio: next.bio }));
                    }}
                    onChange={(e) => {
                      setProfileErrors((prev) => {
                        if (!prev.bio) return prev;
                        const next = { ...prev };
                        delete next.bio;
                        return next;
                      });
                      setForm((f) => ({ ...f, bio: e.target.value }));
                    }}
                    placeholder="A short bio for your admin profile"
                  />
                  <p className="mt-1 text-[11px]" style={{ color: NL.textMuted }}>
                    {form.bio.length}/500 characters
                  </p>
                  {showProfileError("bio") && profileErrors.bio ? (
                    <p className="mt-1 text-[11px] font-medium text-red-600">{profileErrors.bio}</p>
                  ) : null}
                </div>
                <div className="flex gap-2 pt-1">
                  <button type="submit" disabled={saving} className="nl-btn-primary inline-flex items-center gap-2 disabled:opacity-60">
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" strokeWidth={2.25} /> Save Changes
                      </>
                    )}
                  </button>
                  <button type="button" onClick={cancelEdit} className="nl-btn-secondary">
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <dl className="space-y-2">
                {[
                  { label: "Full Name", value: form.name || "—" },
                  { label: "Email", value: displayEmail ?? "—" },
                  { label: "Phone", value: form.phone ? <PhoneDisplay value={form.phone} /> : "—" },
                  { label: "Role", value: form.role },
                  { label: "Bio", value: form.bio.trim() || "Not set" },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="flex gap-3 rounded-lg border px-3 py-2 text-[13px]"
                    style={{ borderColor: NL.borderCard, background: NL.surfaceMuted }}
                  >
                    <dt className="w-24 shrink-0 font-semibold" style={{ color: NL.textMuted }}>
                      {label}
                    </dt>
                    <dd className="min-w-0 font-medium" style={{ color: NL.textPrimary }}>
                      {typeof value === "string" ? value : value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </DashboardPanel>

          <PasswordSection />
        </div>

        <div className="space-y-4 lg:col-span-2">
          <DashboardPanel fit compact title="Account Overview" description="Your access and communities" icon={Shield} tone="slate">
            <dl className="space-y-2">
              {[
                { label: "Account type", value: form.role },
                { label: "Status", value: form.status },
                { label: "Region", value: form.region ?? "—" },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between gap-3 text-[13px]">
                  <dt style={{ color: NL.textMuted }}>{label}</dt>
                  <dd className="font-semibold" style={{ color: NL.textPrimary }}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>

            {form.communities.length > 0 ? (
              <div className="mt-3 border-t pt-3" style={{ borderColor: NL.borderCard }}>
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: NL.textMuted }}>
                  <Building2 className="h-3.5 w-3.5" />
                  Managed communities
                </p>
                <ul className="space-y-2">
                  {form.communities.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-[12px]"
                      style={{ borderColor: NL.borderCard, background: NL.surfaceMuted }}
                    >
                      <span className="min-w-0 truncate font-medium" style={{ color: NL.textBody }}>
                        {c.name}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <AdminBadge tone={c.status === "approved" ? "green" : "amber"}>
                          {statusLabel(c.status as MembershipStatus)}
                        </AdminBadge>
                        {c.status === "approved" ? (
                          <button
                            type="button"
                            onClick={() => setFeatureTarget({ id: c.id, name: c.name })}
                            className="font-semibold text-blue-700 underline-offset-2 transition hover:text-blue-800 hover:underline"
                          >
                            Adjust Feature Set
                          </button>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : me?.role === "system_admin" || me?.role === "admin" ? (
              <p className="mt-4 flex items-center gap-1.5 text-[12px]" style={{ color: NL.textSecondary }}>
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                Platform-wide access across all communities and regions.
              </p>
            ) : null}
          </DashboardPanel>

          <DashboardPanel
            fit
            compact
            title="Notifications"
            description="Saved on this device for your account"
            icon={Bell}
            tone="violet"
            action={
              <Link href="/admin/notifications" className="text-[12px] font-bold hover:opacity-80" style={{ color: NL.link }}>
                Inbox →
              </Link>
            }
          >
            <div className="divide-y" style={{ borderColor: NL.borderCard }}>
              {NOTIFICATION_PREFS.map((p) => (
                <div key={p.key} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold" style={{ color: NL.textPrimary }}>
                      {p.label}
                    </p>
                    <p className="mt-0.5 text-[11.5px] leading-snug" style={{ color: NL.textMuted }}>
                      {p.desc}
                    </p>
                  </div>
                  <Toggle value={prefs[p.key]} onChange={(v) => handlePrefChange(p.key, v)} />
                </div>
              ))}
            </div>
          </DashboardPanel>
        </div>
      </div>

      {featureTarget ? (
        <AdjustFeatureSetModal
          communityId={featureTarget.id}
          communityName={featureTarget.name}
          onClose={() => setFeatureTarget(null)}
        />
      ) : null}
    </div>
  );
}

function PasswordSection() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<string, boolean>>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const showError = (field: string) => Boolean((submitAttempted || touched[field]) && errors[field]);

  const reset = () => {
    setOpen(false);
    setForm({ current: "", next: "", confirm: "" });
    setErrors({});
    setTouched({});
    setSubmitAttempted(false);
  };

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitAttempted(true);
    const nextErrors = validatePasswordForm(form.current, form.next, form.confirm);
    setErrors(nextErrors);
    if (hasFieldErrors(nextErrors)) {
      const firstKey = Object.keys(nextErrors)[0];
      formRef.current?.querySelector<HTMLElement>(`[data-field="${firstKey}"]`)?.focus();
      toastError("Please fix the highlighted fields before updating.");
      return;
    }

    setSaving(true);
    try {
      await changePassword({
        current_password: form.current,
        new_password: form.next,
        new_password_confirmation: form.confirm,
      });
      reset();
      toastSuccess("Password changed successfully.");
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardPanel
      fit
      compact
      title="Password & Security"
      description="Keep your admin account secure"
      icon={KeyRound}
      tone="slate"
      action={
        <button type="button" onClick={() => (open ? reset() : setOpen(true))} className="text-[12px] font-bold hover:opacity-80" style={{ color: NL.link }}>
          {open ? "Cancel" : "Change password"}
        </button>
      }
    >
      {!open ? (
        <p className="text-[13px]" style={{ color: NL.textSecondary }}>
          Use a strong password you don&apos;t reuse elsewhere. Change it regularly if you share devices.
        </p>
      ) : (
        <form ref={formRef} onSubmit={handle} noValidate className="space-y-3">
          {(["current", "next", "confirm"] as const).map((field) => (
            <div key={field}>
              <label className="nl-label mb-1.5">
                {field === "current" ? "Current password" : field === "next" ? "New password" : "Confirm new password"}{" "}
                <span className="text-red-500">*</span>
              </label>
              <input
                data-field={field}
                type="password"
                className={inputClass(showError(field) ? errors[field] : undefined, "nl-input w-full")}
                value={form[field]}
                onBlur={() => {
                  setTouched((t) => ({ ...t, [field]: true }));
                  const next = validatePasswordForm(form.current, form.next, form.confirm);
                  setErrors((prev) => ({ ...prev, ...next }));
                }}
                onChange={(e) => {
                  setErrors((prev) => {
                    const next = { ...prev };
                    delete next[field];
                    if (field === "next") delete next.confirm;
                    return next;
                  });
                  setForm((f) => ({ ...f, [field]: e.target.value }));
                }}
              />
              {showError(field) && errors[field] ? (
                <p className="mt-1 text-[11px] font-medium text-red-600">{errors[field]}</p>
              ) : null}
            </div>
          ))}
          <button type="submit" disabled={saving} className="nl-btn-primary mt-1 inline-flex items-center gap-2 disabled:opacity-60">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Updating…
              </>
            ) : (
              "Update Password"
            )}
          </button>
        </form>
      )}
    </DashboardPanel>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      role="switch"
      aria-checked={value}
      className="flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors duration-200"
      style={{
        borderColor: value ? NL.brandPrimary : "#CBD5E1",
        background: value ? NL.brandPrimary : "#E2E8F0",
      }}
    >
      <span
        className={`h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${value ? "translate-x-5" : "translate-x-0.5"}`}
      />
    </button>
  );
}
