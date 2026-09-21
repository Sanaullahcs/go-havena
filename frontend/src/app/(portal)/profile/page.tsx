"use client";

import { useState, useRef, useEffect } from "react";
import { getUser } from "@/lib/auth/session";
import { toastSuccess, toastError, confirmAction } from "@/lib/alert";
import { useRouter } from "next/navigation";
import { clearSession } from "@/lib/auth/session";
import { fetchMe, updateMe, uploadAvatar, changePassword } from "@/lib/api/profile";
import { apiError } from "@/lib/api/client";
import { AdminPhoneInput } from "@/components/admin/phone-input";
import { PhoneDisplay } from "@/components/admin/phone-display";
import { emptyPhoneField, phoneFieldFromE164, type PhoneFieldState } from "@/lib/phone/format";
import { disableWebPush, enableWebPush, isWebPushEnabledLocally } from "@/lib/firebase/web-push";
import { PageLoader } from "@/components/shared/page-states";
import { formatAccountContact, formatAccountDisplayName, formatDisplayEmail } from "@/lib/user/email-display";

const ACHIEVEMENTS = [
  { id: 1, label: "Early Adopter",    color: "#7c3aed", desc: "One of the first 50 residents to join" },
  { id: 2, label: "Community Voice",  color: "#1B4F8A", desc: "Made 10+ community feed posts" },
  { id: 3, label: "Wellness Starter", color: "#0D9488", desc: "Completed your first wellness course" },
  { id: 4, label: "Marketplace Fan",  color: "#d97706", desc: "Saved 5+ marketplace listings" },
];

const NOTIFICATION_PREFS = [
  { key: "emailNotifications", label: "Email notifications",  desc: "Receive email summaries of new notices" },
  { key: "pushNotifications",  label: "Push notifications",   desc: "Browser push for urgent community alerts" },
  { key: "publicProfile",      label: "Public profile",       desc: "Allow other residents to view your profile" },
  { key: "weeklyDigest",       label: "Weekly digest",        desc: "Receive a weekly community digest email" },
];

export default function ProfilePage() {
  const router   = useRouter();
  const user     = getUser();
  const email    = formatDisplayEmail(user?.email);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [editing, setEditing]     = useState(false);
  const [form, setForm]           = useState({ name: "", phone: "", unit: "", bio: "" });
  const [phoneField, setPhoneField] = useState<PhoneFieldState>(emptyPhoneField());
  const [prefs, setPrefs]         = useState<Record<string, boolean>>({ emailNotifications: true, pushNotifications: false, publicProfile: true, weeklyDigest: true });
  const [saving, setSaving]       = useState(false);
  const [loading, setLoading]     = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchMe()
      .then((data) => {
        setForm({
          name: data.name ?? data.profile?.display_name ?? "",
          phone: data.phone ?? "",
          unit: data.profile?.unit_number ?? "",
          bio: data.profile?.bio ?? "",
        });
        setPhoneField(phoneFieldFromE164(data.phone));
        setAvatarUrl(data.profile?.avatar_url ?? null);
      })
      .catch((err) => toastError(apiError(err)))
      .finally(() => setLoading(false));

    setPrefs((prev) => ({
      ...prev,
      pushNotifications: isWebPushEnabledLocally(),
    }));
  }, []);

  const handlePrefChange = async (key: string, value: boolean) => {
    if (key === "pushNotifications") {
      if (value) {
        const result = await enableWebPush();
        if (!result.ok) {
          toastError(result.message);
          return;
        }
        toastSuccess("Browser push notifications enabled.");
      } else {
        await disableWebPush();
      }
    }

    setPrefs((prev) => ({ ...prev, [key]: value }));
  };

  const name     = formatAccountDisplayName(
    { name: form.name || user?.name, phone: form.phone || user?.phone, email: user?.email },
    "Resident",
  );
  const contactLine = formatAccountContact({ phone: form.phone || user?.phone, email: user?.email });
  const initials = name.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase();

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateMe({
        name: form.name,
        phone: phoneField.valid ? phoneField.e164 : form.phone || undefined,
        unit_number: form.unit,
        bio: form.bio,
      });
      setEditing(false);
      toastSuccess("Profile updated successfully.");
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await uploadAvatar(file);
      setAvatarUrl(res.avatar_url);
      toastSuccess("Profile photo updated.");
    } catch (err) {
      toastError(apiError(err));
    }
  };

  const handleLogout = async () => {
    const r = await confirmAction({ title: "Sign out?", text: "You will be returned to the resident login screen.", confirmText: "Sign out", icon: "question", color: "red" });
    if (r.isConfirmed) { clearSession(); router.replace("/resident-login"); }
  };

  if (loading) return <PageLoader variant="form" />;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header card */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="h-28 w-full" style={{ background: "#1B4F8A" }} />
        <div className="px-6 pb-6">
          <div className="-mt-12 flex flex-wrap items-end gap-4">
            {/* Avatar */}
            <div className="relative shrink-0">
              {avatarUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={avatarUrl} alt={name} className="h-24 w-24 rounded-2xl border-4 border-white object-cover shadow-lg" />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-2xl border-4 border-white text-3xl font-bold text-white shadow-lg" style={{ background: "linear-gradient(to bottom right, #14B8A6, #0A2A43)" }}>
                  {initials}
                </div>
              )}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                title="Change photo"
                className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-slate-700 text-white shadow transition hover:bg-slate-900"
              >
                <IcoCamera />
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
            </div>

            <div className="min-w-0 flex-1 pb-1">
              <h1 className="text-xl font-bold text-slate-900">{name}</h1>
              <p className="text-[13px] text-slate-500">{form.unit || "—"}{contactLine ? ` · ${contactLine}` : ""}</p>
            </div>

            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className={`shrink-0 flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-semibold transition ${editing ? "bg-slate-100 text-slate-700 hover:bg-slate-200" : "text-white hover:opacity-90"}`}
              style={editing ? undefined : { background: "#1B4F8A" }}
            >
              {editing ? <><IcoX /> Cancel</> : <><IcoPencil /> Edit Profile</>}
            </button>
          </div>

          {/* Stats */}
          <div className="mt-5 grid grid-cols-3 gap-3">
            {[
              { label: "Community Points", value: "482", color: "text-[#0D9488]" },
              { label: "Feed Posts",       value: "18",  color: "text-slate-900"   },
              { label: "Badges",           value: "4",   color: "text-slate-900"   },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-center">
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left column */}
        <div className="lg:col-span-3 space-y-5">
          {/* Profile info / edit form */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-[14px] font-bold text-slate-900">
              {editing ? "Edit Information" : "Profile Information"}
            </h2>

            {editing ? (
              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="nl-label mb-1.5">Full Name</label>
                    <input className="nl-input w-full" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
                  </div>
                  <div>
                    <label className="nl-label mb-1.5">Unit Number</label>
                    <input className="nl-input w-full" value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className="nl-label mb-1.5">Phone</label>
                  <AdminPhoneInput
                    value={form.phone}
                    onChange={(state) => {
                      setPhoneField(state);
                      setForm((f) => ({ ...f, phone: state.e164 || f.phone }));
                    }}
                  />
                </div>
                <div>
                  <label className="nl-label mb-1.5">Bio</label>
                  <textarea className="nl-input w-full resize-none" rows={3} value={form.bio} onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))} />
                </div>
                <div className="flex gap-2 pt-1">
                  <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-semibold text-white transition hover:opacity-90 disabled:opacity-60" style={{ background: "#1B4F8A" }}>
                    {saving ? <><svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Saving…</> : "Save Changes"}
                  </button>
                  <button type="button" onClick={() => setEditing(false)} className="nl-btn-secondary">Cancel</button>
                </div>
              </form>
            ) : (
              <dl className="space-y-3">
                {[
                  { label: "Full Name", value: form.name  },
                  { label: "Email",     value: email ?? "—" },
                  { label: "Phone",     value: form.phone ? <PhoneDisplay value={form.phone} compact /> : "—" },
                  { label: "Unit",      value: form.unit   },
                  { label: "Bio",       value: form.bio    },
                ].map(({ label, value }) => (
                  <div key={label} className="flex gap-3 text-[13px]">
                    <dt className="w-24 shrink-0 font-semibold text-slate-500">{label}</dt>
                    <dd className="text-slate-800">{value || "—"}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          {/* Change password */}
          <PasswordSection />

          {/* Sign out */}
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
            <h3 className="text-[14px] font-semibold text-rose-700">Sign out</h3>
            <p className="mt-0.5 text-[12.5px] text-rose-600">You will be returned to the resident login page.</p>
            <button type="button" onClick={handleLogout} className="mt-3 flex items-center gap-2 rounded-xl border border-rose-300 bg-white px-4 py-2 text-[13px] font-semibold text-rose-700 transition hover:bg-rose-100">
              <IcoLogout />
              Sign Out
            </button>
          </div>
        </div>

        {/* Right column */}
        <div className="lg:col-span-2 space-y-5">
          {/* Achievements */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-3.5">
              <h2 className="text-[14px] font-bold text-slate-900">Achievements</h2>
              <p className="text-[11px] text-slate-400">Earned through community participation</p>
            </div>
            <div className="p-4 space-y-2">
              {ACHIEVEMENTS.map((a) => (
                <div key={a.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-bold text-white text-[13px]" style={{ background: a.color }}>
                    {a.label.slice(0, 2)}
                  </span>
                  <div>
                    <p className="text-[13px] font-semibold text-slate-900">{a.label}</p>
                    <p className="text-[11px] text-slate-500">{a.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notification prefs */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-3.5">
              <h2 className="text-[14px] font-bold text-slate-900">Notification Preferences</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {NOTIFICATION_PREFS.map((p) => (
                <div key={p.key} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-slate-800">{p.label}</p>
                    <p className="text-[11px] text-slate-400">{p.desc}</p>
                  </div>
                  <Toggle value={prefs[p.key]} onChange={(v) => handlePrefChange(p.key, v)} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Password section ─── */

function PasswordSection() {
  const [open, setOpen]     = useState(false);
  const [form, setForm]     = useState({ current: "", next: "", confirm: "" });
  const [saving, setSaving] = useState(false);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.next !== form.confirm) { toastError("Passwords don't match."); return; }
    if (form.next.length < 8)      { toastError("Password must be at least 8 characters."); return; }
    setSaving(true);
    try {
      await changePassword({ current_password: form.current, new_password: form.next, new_password_confirmation: form.confirm });
      setOpen(false);
      setForm({ current: "", next: "", confirm: "" });
      toastSuccess("Password changed successfully.");
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-bold text-slate-900">Password &amp; Security</h2>
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-[12px] font-semibold text-[#0D9488] hover:text-[#0A2A43]">
          {open ? "Cancel" : "Change password"}
        </button>
      </div>
      {!open && <p className="mt-3 text-[13px] text-slate-500">Last changed 30 days ago. Keep your account secure with a strong password.</p>}
      {open && (
        <form onSubmit={handle} className="mt-4 space-y-3">
          <div>
            <label className="nl-label mb-1.5">Current password</label>
            <input type="password" className="nl-input w-full" value={form.current} onChange={(e) => setForm((f) => ({ ...f, current: e.target.value }))} required />
          </div>
          <div>
            <label className="nl-label mb-1.5">New password</label>
            <input type="password" className="nl-input w-full" value={form.next} onChange={(e) => setForm((f) => ({ ...f, next: e.target.value }))} required />
          </div>
          <div>
            <label className="nl-label mb-1.5">Confirm new password</label>
            <input type="password" className="nl-input w-full" value={form.confirm} onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))} required />
          </div>
          <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-semibold text-white transition hover:opacity-90 disabled:opacity-60 mt-1" style={{ background: "#1B4F8A" }}>
            {saving ? <><svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Updating…</> : "Update Password"}
          </button>
        </form>
      )}
    </div>
  );
}

/* ─── Toggle ─── */
function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      role="switch"
      aria-checked={value}
      className={`flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors duration-200 ${value ? "border-[#14B8A6] bg-[#14B8A6]" : "border-slate-300 bg-slate-200"}`}
    >
      <span className={`h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${value ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

/* ─── Icons ─── */
function IcoPencil()  { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M11 2l3 3-9 9H2v-3l9-9z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>; }
function IcoX()       { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>; }
function IcoCamera()  { return <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M1 5.5A1.5 1.5 0 012.5 4h1l1-2h7l1 2h1A1.5 1.5 0 0115 5.5v7A1.5 1.5 0 0113.5 14h-11A1.5 1.5 0 011 12.5v-7z" stroke="currentColor" strokeWidth="1.2" /><circle cx="8" cy="9" r="2" stroke="currentColor" strokeWidth="1.2" /></svg>; }
function IcoLogout()  { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M10 2H3a1 1 0 00-1 1v10a1 1 0 001 1h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /><path d="M7 8h7M11 5.5l2.5 2.5L11 10.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
