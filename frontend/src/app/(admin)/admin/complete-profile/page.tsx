"use client";

import { FormEvent, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Home, Upload, User } from "lucide-react";
import {
  OnboardingField,
} from "@/components/admin/onboarding/onboarding-ui";
import { useTouchedFieldErrors } from "@/hooks/use-touched-field-errors";
import {
  communityAdminOnboardingPath,
} from "@/lib/admin/community-admin-onboarding";
import {
  COMPLETE_PROFILE_LIMITS,
  isPlaceholderDisplayName,
  isPlaceholderEmail,
  validateCompleteProfileForm,
  type UtilityFileInput,
} from "@/lib/admin/complete-profile-validation";
import { hasFieldErrors, inputClass } from "@/lib/admin/form-validation-utils";
import {
  fetchMe,
  meToSessionUser,
  updateMe,
  uploadUtilityBill,
} from "@/lib/api/profile";
import { apiError } from "@/lib/api/client";
import { confirmAdminSignOutAndRedirect } from "@/lib/auth/sign-out";
import {
  canAccessCommunityDashboard,
  getCommunityAdminNextStep,
  getToken,
  getUser,
  setSession,
  updateUser,
} from "@/lib/auth/session";

const ACCEPT_UTILITY = "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf";

function CompleteProfileInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planHint = searchParams.get("plan");
  const intervalHint = searchParams.get("interval") === "year" ? "year" : "month";
  const planQuery = planHint
    ? `?plan=${encodeURIComponent(planHint)}&interval=${intervalHint}`
    : "";

  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [bio, setBio] = useState("");
  const [unitNumber, setUnitNumber] = useState("");
  const [residenceType, setResidenceType] = useState("");
  const [utilityFile, setUtilityFile] = useState<File | null>(null);
  const [existingUtilityUrl, setExistingUtilityUrl] = useState<string | null>(null);
  const [communityName, setCommunityName] = useState<string | null>(null);

  const { touch, clearError, showError, validateOnSubmit } = useTouchedFieldErrors();

  const utilityInput: UtilityFileInput = useMemo(() => {
    if (utilityFile) return { kind: "file", file: utilityFile };
    if (existingUtilityUrl) return { kind: "existing", url: existingUtilityUrl };
    return null;
  }, [utilityFile, existingUtilityUrl]);

  const liveErrors = useMemo(
    () =>
      validateCompleteProfileForm({
        name,
        email,
        bio,
        unitNumber,
        residenceType,
        utilityFile: utilityInput,
        requireUtilityFile: !existingUtilityUrl,
        guestMode: false,
      }),
    [name, email, bio, unitNumber, residenceType, utilityInput, existingUtilityUrl],
  );

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace(planHint ? `/register${planQuery}` : "/login");
      return;
    }

    const cached = getUser();
    const step = getCommunityAdminNextStep(cached);
    if (canAccessCommunityDashboard(cached)) {
      router.replace("/admin");
      return;
    }
    if (step !== "complete_profile") {
      const path = communityAdminOnboardingPath(step);
      router.replace(planQuery ? `${path}${planQuery}` : path);
      return;
    }

    void fetchMe()
      .then((me) => {
        const displayName = me.profile?.display_name ?? me.name ?? "";
        setName(isPlaceholderDisplayName(displayName) ? "" : displayName.trim());
        setEmail(isPlaceholderEmail(me.email) ? "" : (me.email ?? "").trim());
        setBio(me.profile?.bio?.trim() ?? "");
        setUnitNumber(me.profile?.unit_number?.trim() ?? "");
        setResidenceType(me.profile?.residence_type ?? "");
        setExistingUtilityUrl(me.profile?.utility_bill_url ?? null);

        const membership = me.memberships?.find((m) => m.role === "admin") ?? me.memberships?.[0];
        setCommunityName(membership?.community?.name ?? null);

        updateUser(meToSessionUser(me));
      })
      .catch(() => setFormError("Could not load your profile. Refresh and try again."))
      .finally(() => setLoading(false));
  }, [router, planHint, planQuery]);

  const onPickUtility = (file: File | null) => {
    if (!file) return;
    setUtilityFile(file);
    clearError("utilityFile");
    setFormError(null);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || loading) return;
    setFormError(null);

    if (!validateOnSubmit(liveErrors)) return;

    setBusy(true);
    try {
      if (utilityFile) {
        await uploadUtilityBill(utilityFile);
      }

      const me = await updateMe({
        display_name: name.trim(),
        name: name.trim(),
        email: email.trim().toLowerCase(),
        bio: bio.trim(),
        unit_number: unitNumber.trim(),
        residence_type: residenceType,
      });

      const token = getToken();
      const current = getUser();
      if (token && current) {
        setSession(token, { ...current, ...meToSessionUser(me) });
      }

      const next = communityAdminOnboardingPath(getCommunityAdminNextStep(me));
      router.replace(`${next}${planQuery}`);
    } catch (err) {
      setFormError(apiError(err));
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="py-16 text-center text-sm text-slate-500">Loading your profile…</div>
    );
  }

  const nameErr = showError("name", liveErrors);
  const emailErr = showError("email", liveErrors);
  const bioErr = showError("bio", liveErrors);
  const unitErr = showError("unitNumber", liveErrors);
  const residenceErr = showError("residenceType", liveErrors);
  const utilityErr = showError("utilityFile", liveErrors);

  const utilityLabel = utilityFile?.name ?? (existingUtilityUrl ? "Document on file" : null);

  return (
    <div className="mx-auto w-full min-w-0 max-w-lg px-0">
      <div className="mt-1 sm:mt-2">
        <h1 className="font-[family-name:var(--font-brand)] text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
          Complete your profile
        </h1>
        <p className="mt-1.5 text-sm leading-snug text-slate-600">
          {communityName ? (
            <>
              Almost there — complete your profile for{" "}
              <span className="font-semibold text-slate-800">{communityName}</span>.
            </>
          ) : (
            "Tell us about yourself as the community administrator. These details help Havena verify your account."
          )}
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        noValidate
        className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:mt-5 sm:p-5"
      >
        {formError ? (
          <div
            className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
            role="alert"
          >
            {formError}
          </div>
        ) : null}

        <OnboardingField
          id="profile-name"
          label="Full name"
          required
          error={nameErr}
          hint="Your name as it appears to residents and system administrators"
        >
          <input
            id="profile-name"
            type="text"
            autoComplete="name"
            maxLength={COMPLETE_PROFILE_LIMITS.profileName}
            className={inputClass(
              nameErr,
              "h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-600/20",
            )}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              clearError("name");
              setFormError(null);
            }}
            onBlur={() => touch("name")}
            placeholder="Jane Doe"
            aria-invalid={Boolean(nameErr)}
          />
        </OnboardingField>

        <OnboardingField
          id="profile-email"
          label="Email address"
          required
          error={emailErr}
          hint="Used for account notifications — not your phone placeholder address"
        >
          <input
            id="profile-email"
            type="email"
            autoComplete="email"
            maxLength={COMPLETE_PROFILE_LIMITS.profileEmail}
            className={inputClass(
              emailErr,
              "h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-600/20",
            )}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              clearError("email");
              setFormError(null);
            }}
            onBlur={() => touch("email")}
            placeholder="you@example.com"
            aria-invalid={Boolean(emailErr)}
          />
        </OnboardingField>

        <OnboardingField
          id="profile-bio"
          label="Bio"
          error={bioErr}
          hint="Optional — a short introduction for your community"
        >
          <textarea
            id="profile-bio"
            rows={3}
            maxLength={COMPLETE_PROFILE_LIMITS.profileBio}
            className={inputClass(
              bioErr,
              "min-h-[88px] w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-600/20",
            )}
            value={bio}
            onChange={(e) => {
              setBio(e.target.value);
              clearError("bio");
            }}
            onBlur={() => touch("bio")}
            placeholder="Community manager for Palm Court HOA…"
            aria-invalid={Boolean(bioErr)}
          />
          <p className="text-[11px] text-slate-500">
            {bio.length} / {COMPLETE_PROFILE_LIMITS.profileBio} characters
          </p>
        </OnboardingField>

        <OnboardingField
          id="profile-unit"
          label="Unit number"
          required
          error={unitErr}
          hint="Your unit or office identifier within the community"
        >
          <input
            id="profile-unit"
            type="text"
            maxLength={COMPLETE_PROFILE_LIMITS.profileUnit}
            className={inputClass(
              unitErr,
              "h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-600/20",
            )}
            value={unitNumber}
            onChange={(e) => {
              setUnitNumber(e.target.value);
              clearError("unitNumber");
              setFormError(null);
            }}
            onBlur={() => touch("unitNumber")}
            placeholder="e.g. 101 or Admin Office"
            aria-invalid={Boolean(unitErr)}
          />
        </OnboardingField>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-700">
            I am a <span className="text-red-500">*</span>
          </p>
          <div className="grid grid-cols-2 gap-3">
            <ResidenceCard
              active={residenceType === "homeowner"}
              title="Homeowner"
              subtitle="I own my unit"
              icon={<Home className="h-5 w-5" aria-hidden />}
              onSelect={() => {
                setResidenceType("homeowner");
                touch("residenceType");
                clearError("residenceType");
              }}
            />
            <ResidenceCard
              active={residenceType === "tenant"}
              title="Tenant"
              subtitle="I rent my unit"
              icon={<User className="h-5 w-5" aria-hidden />}
              onSelect={() => {
                setResidenceType("tenant");
                touch("residenceType");
                clearError("residenceType");
              }}
            />
          </div>
          {residenceErr ? (
            <p className="text-[12px] font-medium text-red-600" role="alert">
              {residenceErr}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-700">
            Upload lease or utility bill{" "}
            {!existingUtilityUrl ? <span className="text-red-500">*</span> : null}
          </p>
          <p className="text-[12px] leading-snug text-slate-500">
            JPG, PNG, or PDF up to 10 MB — used to verify your residence
          </p>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className={[
              "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition",
              utilityErr
                ? "border-red-300 bg-red-50/40"
                : utilityLabel
                  ? "border-teal-300 bg-teal-50/40"
                  : "border-slate-200 bg-slate-50/80 hover:border-teal-300 hover:bg-teal-50/30",
            ].join(" ")}
          >
            <Upload className="h-5 w-5 text-teal-700" aria-hidden />
            <span className="text-sm font-medium text-slate-700">
              {utilityLabel ?? "Tap to choose a file"}
            </span>
            {existingUtilityUrl && !utilityFile ? (
              <span className="text-[11px] text-slate-500">Replace the document on file</span>
            ) : null}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT_UTILITY}
            className="sr-only"
            onChange={(e) => onPickUtility(e.target.files?.[0] ?? null)}
          />
          {utilityErr ? (
            <p className="text-[12px] font-medium text-red-600" role="alert">
              {utilityErr}
            </p>
          ) : null}
        </div>

        <div className="space-y-3 pt-1">
          <button
            type="submit"
            disabled={busy || hasFieldErrors(liveErrors)}
            className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-teal-600 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-600/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Saving profile…" : "Save & continue"}
          </button>
          <p className="text-center text-[11px] leading-relaxed text-slate-500">
            By continuing, you agree to Havena&apos;s Terms of Service and Privacy Policy.
          </p>
          <button
            type="button"
            className="w-full py-2 text-center text-xs font-semibold text-slate-500 transition hover:text-slate-800"
            onClick={() => {
              void confirmAdminSignOutAndRedirect(router);
            }}
          >
            Sign out
          </button>
        </div>
      </form>
    </div>
  );
}

function ResidenceCard({
  active,
  title,
  subtitle,
  icon,
  onSelect,
}: {
  active: boolean;
  title: string;
  subtitle: string;
  icon: ReactNode;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "rounded-xl border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-teal-600/25",
        active
          ? "border-teal-500 bg-teal-50/60 ring-1 ring-teal-500/20"
          : "border-slate-200 bg-white hover:border-slate-300",
      ].join(" ")}
    >
      <span className={active ? "text-teal-800" : "text-slate-500"}>{icon}</span>
      <p className="mt-2 text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{subtitle}</p>
    </button>
  );
}

export default function CompleteProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="py-16 text-center text-sm text-slate-500">Loading profile form…</div>
      }
    >
      <CompleteProfileInner />
    </Suspense>
  );
}
