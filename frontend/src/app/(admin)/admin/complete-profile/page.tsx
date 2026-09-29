"use client";

import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText, Home, Upload, User } from "lucide-react";
import { RingSpinner, ShimmerBlock } from "@/components/shared/loaders";
import { OnboardingField } from "@/components/admin/onboarding/onboarding-ui";
import { AdminPhoneInput } from "@/components/admin/phone-input";
import { useTouchedFieldErrors } from "@/hooks/use-touched-field-errors";
import { communityAdminOnboardingPath } from "@/lib/admin/community-admin-onboarding";
import {
  completeProfileOnboardingRole,
  getCompleteProfileFieldVisibility,
  isPlaceholderResidenceType,
  isPlaceholderUnitNumber,
  shouldUseSimpleCompleteProfileSubmit,
} from "@/lib/admin/complete-profile-fields";
import {
  COMMUNITY_ADMIN_NAME_MAX,
  COMMUNITY_ADMIN_OFFICE_MAX,
  COMMUNITY_ADMIN_UNIT_MAX,
  applyCharacterLimit,
} from "@/lib/admin/community-admin-field-limits";
import {
  COMPLETE_PROFILE_LIMITS,
  isPlaceholderDisplayName,
  isPlaceholderEmail,
  validateCompleteProfileForm,
  type UtilityFileInput,
} from "@/lib/admin/complete-profile-validation";
import { hasFieldErrors, inputClass, type FieldErrors } from "@/lib/admin/form-validation-utils";
import {
  fetchMe,
  meToSessionUser,
  updateMe,
  uploadUtilityBill,
  type MeProfile,
} from "@/lib/api/profile";
import { apiError, apiFieldErrors } from "@/lib/api/client";
import { COMPLETE_PROFILE_SIGN_OUT_MESSAGE, confirmAdminSignOutAndRedirect } from "@/lib/auth/sign-out";
import {
  canAccessCommunityDashboard,
  getCommunityAdminNextStep,
  getToken,
  getUser,
  updateUser,
} from "@/lib/auth/session";
import { emptyPhoneField, phoneFieldFromE164, type PhoneFieldState } from "@/lib/phone/format";

function isPdfFile(file: File | string | null): boolean {
  if (!file) return false;
  if (typeof file === "string") {
    return file.toLowerCase().split("?")[0].endsWith(".pdf");
  }
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function CompleteProfileInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planHint = searchParams.get("plan");
  const intervalHint = searchParams.get("interval") === "year" ? "year" : "month";
  const invited = searchParams.get("invited") === "1";
  const communityRequest = searchParams.get("communityRequest") === "1";
  const planQuery = planHint
    ? `?plan=${encodeURIComponent(planHint)}&interval=${intervalHint}`
    : "";

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [profileUser, setProfileUser] = useState<MeProfile | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState<PhoneFieldState>(emptyPhoneField);
  const [bio, setBio] = useState("");
  const [unitNumber, setUnitNumber] = useState("");
  const [residenceType, setResidenceType] = useState("");
  const [officeAddress, setOfficeAddress] = useState("");
  const [utilityFile, setUtilityFile] = useState<File | null>(null);
  const [existingUtilityBillUrl, setExistingUtilityBillUrl] = useState<string | null>(null);
  const [communityName, setCommunityName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { touch, clearError, showError, validateOnSubmit } = useTouchedFieldErrors();

  const fields = useMemo(
    () =>
      getCompleteProfileFieldVisibility({
        user: profileUser,
        role: completeProfileOnboardingRole(profileUser),
        invited,
        communityRequest,
      }),
    [profileUser, invited, communityRequest],
  );

  const isCommunityAdminProfile =
    completeProfileOnboardingRole(profileUser) === "admin" || communityRequest;
  const nameMax = isCommunityAdminProfile ? COMMUNITY_ADMIN_NAME_MAX : COMPLETE_PROFILE_LIMITS.profileName;
  const unitMax = isCommunityAdminProfile ? COMMUNITY_ADMIN_UNIT_MAX : COMPLETE_PROFILE_LIMITS.profileUnit;
  const officeMax = COMMUNITY_ADMIN_OFFICE_MAX;

  const useSimpleSubmitLabel = useMemo(
    () =>
      shouldUseSimpleCompleteProfileSubmit(profileUser, {
        invited,
        isAdminClaim: completeProfileOnboardingRole(profileUser) === "admin" && !communityRequest,
      }),
    [profileUser, invited, communityRequest],
  );

  const utilityInput: UtilityFileInput = utilityFile
    ? { kind: "file", file: utilityFile }
    : existingUtilityBillUrl
      ? { kind: "existing", url: existingUtilityBillUrl }
      : null;

  const utilityPreviewUrl = useMemo(() => {
    if (!utilityFile || isPdfFile(utilityFile)) return null;
    return URL.createObjectURL(utilityFile);
  }, [utilityFile]);

  useEffect(() => {
    return () => {
      if (utilityPreviewUrl) URL.revokeObjectURL(utilityPreviewUrl);
    };
  }, [utilityPreviewUrl]);

  const liveErrors = useMemo(
    () =>
      validateCompleteProfileForm({
        name,
        email,
        phoneDigits: phone.digits,
        phoneCountry: phone.country,
        bio,
        unitNumber,
        residenceType,
        officeAddress,
        utilityFile: utilityInput,
        requireUtilityFile: fields.showUtilityBill && !existingUtilityBillUrl,
        requireResidenceType: fields.showResidenceType,
        requireUnitNumber: fields.showUnitNumber,
        requireOfficeAddress: fields.showOfficeAddress,
        guestMode: fields.isGuestProfile,
        communityAdmin: isCommunityAdminProfile,
      }),
    [
      name,
      email,
      phone.digits,
      phone.country,
      bio,
      unitNumber,
      residenceType,
      officeAddress,
      utilityFile,
      existingUtilityBillUrl,
      fields.showUtilityBill,
      fields.showResidenceType,
      fields.showUnitNumber,
      fields.showOfficeAddress,
      fields.isGuestProfile,
      isCommunityAdminProfile,
    ],
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
        setPhone(me.phone ? phoneFieldFromE164(me.phone) : emptyPhoneField());
        setBio(me.profile?.bio?.trim() ?? "");
        setUnitNumber(
          isPlaceholderUnitNumber(me.profile?.unit_number) ? "" : (me.profile?.unit_number?.trim() ?? ""),
        );
        setOfficeAddress(me.profile?.office_address?.trim() ?? "");
        const rawResidence = me.profile?.residence_type ?? "";
        setResidenceType(isPlaceholderResidenceType(rawResidence) ? "" : rawResidence);
        setExistingUtilityBillUrl(me.profile?.utility_bill_url ?? null);
        setProfileUser(me);

        const membership = me.memberships?.find((m) => m.role === "admin") ?? me.memberships?.[0];
        setCommunityName(membership?.community?.name ?? null);

        updateUser(meToSessionUser(me));
      })
      .catch(() => setFormError("Could not load your profile. Refresh and try again."))
      .finally(() => setLoading(false));
  }, [router, planHint, planQuery]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || loading) return;
    setFormError(null);

    if (!validateOnSubmit(liveErrors)) return;

    setBusy(true);
    try {
      if (fields.showUtilityBill && utilityFile) {
        await uploadUtilityBill(utilityFile);
      }

      const me = await updateMe({
        display_name: name.trim(),
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.e164,
        bio: bio.trim(),
        ...(fields.showOfficeAddress
          ? { office_address: officeAddress.trim() }
          : {
              unit_number: unitNumber.trim(),
              ...(fields.showResidenceType && residenceType ? { residence_type: residenceType } : {}),
            }),
      });

      updateUser(meToSessionUser(me));

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
  const phoneErr = showError("phone", liveErrors);
  const bioErr = showError("bio", liveErrors);
  const unitErr = showError("unitNumber", liveErrors);
  const officeErr = showError("officeAddress", liveErrors);
  const residenceErr = showError("residenceType", liveErrors);
  const utilityErr = showError("utilityFile", liveErrors);

  return (
    <div className="w-full min-w-0">
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[minmax(18rem,26rem)_minmax(0,1fr)]">
        <aside className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#1B4F8A]">
            Your profile
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-brand)] text-[1.75rem] font-bold tracking-tight text-slate-900 sm:text-[2.1rem]">
            Complete your profile
          </h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-600 sm:text-[15px]">
            {communityName ? (
              <>
                Almost there — complete your profile for{" "}
                <span className="font-semibold text-slate-800">{communityName}</span>.
              </>
            ) : (
              "Tell us about yourself as the community administrator. These details help Havena verify your account."
            )}
          </p>
        </aside>

      <form
        onSubmit={onSubmit}
        noValidate
        className="min-w-0 space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 lg:p-8"
      >
        {formError ? (
          <div
            className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
            role="alert"
          >
            {formError}
          </div>
        ) : null}

        <div className="grid gap-5 sm:grid-cols-2">
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
            maxLength={name.length > nameMax ? undefined : nameMax}
            className={inputClass(
              nameErr,
              "h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-600/20",
            )}
            value={name}
            onChange={(e) => {
              setName(applyCharacterLimit(name, e.target.value, nameMax));
              clearError("name");
              setFormError(null);
            }}
            onBlur={() => touch("name")}
            placeholder="Jane Doe"
            aria-invalid={Boolean(nameErr)}
          />
          {isCommunityAdminProfile ? (
            <p className={`text-right text-[11px] tabular-nums ${name.length > nameMax ? "text-red-600" : "text-slate-500"}`}>
              {name.length} / {nameMax}
            </p>
          ) : null}
        </OnboardingField>

        <OnboardingField
          id="profile-email"
          label="Email address"
          required
          error={emailErr}
          hint="Used for important account notifications."
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
        </div>

        <OnboardingField
          id="profile-phone"
          label="Phone number"
          required
          hint="Your primary phone number for community-related communication."
        >
          <AdminPhoneInput
            id="profile-phone"
            value={phone.e164}
            required
            showError={Boolean(phoneErr)}
            onChange={(state) => {
              setPhone(state);
              clearError("phone");
              setFormError(null);
            }}
            onBlur={() => touch("phone")}
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

        {fields.showOfficeAddress ? (
          <OnboardingField
            id="profile-office"
            label="Office address"
            required
            error={officeErr}
            hint="The community office address residents can use to reach you"
          >
            <input
              id="profile-office"
              type="text"
              maxLength={officeAddress.length > officeMax ? undefined : officeMax}
              className={inputClass(
                officeErr,
                "h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-600/20",
              )}
              value={officeAddress}
              onChange={(e) => {
                setOfficeAddress(applyCharacterLimit(officeAddress, e.target.value, officeMax));
                clearError("officeAddress");
                setFormError(null);
              }}
              onBlur={() => touch("officeAddress")}
              placeholder="e.g. 100 Management Office, Oak Valley"
              aria-invalid={Boolean(officeErr)}
            />
            <p className={`text-right text-[11px] tabular-nums ${officeAddress.length > officeMax ? "text-red-600" : "text-slate-500"}`}>
              {officeAddress.length} / {officeMax}
            </p>
          </OnboardingField>
        ) : null}

        {fields.showUnitNumber ? (
        <OnboardingField
          id="profile-unit"
          label="Unit number"
          required={fields.unitRequired}
          error={unitErr}
          hint="Your unit or office identifier within the community"
        >
          <input
            id="profile-unit"
            type="text"
            maxLength={unitNumber.length > unitMax ? undefined : unitMax}
            className={inputClass(
              unitErr,
              "h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-600/20",
            )}
            value={unitNumber}
            onChange={(e) => {
              setUnitNumber(applyCharacterLimit(unitNumber, e.target.value, unitMax));
              clearError("unitNumber");
              setFormError(null);
            }}
            onBlur={() => touch("unitNumber")}
            placeholder="e.g. 101 or Admin Office"
            aria-invalid={Boolean(unitErr)}
          />
        </OnboardingField>
        ) : null}

        {fields.showResidenceType ? (
          <div>
            <p className="mb-1.5 text-sm font-semibold leading-tight text-slate-700">
              I am a <span className="text-red-500">*</span>
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setResidenceType("homeowner");
                  touch("residenceType");
                  clearError("residenceType");
                  setFormError(null);
                }}
                className={[
                  "rounded-xl border p-4 text-left transition",
                  residenceType === "homeowner"
                    ? "border-teal-500 bg-teal-50"
                    : "border-slate-200 bg-white hover:border-slate-300",
                ].join(" ")}
              >
                <Home
                  className={[
                    "mb-2 h-6 w-6",
                    residenceType === "homeowner" ? "text-slate-800" : "text-slate-400",
                  ].join(" ")}
                />
                <p className="text-sm font-bold text-slate-800">Homeowner</p>
                <p className="mt-0.5 text-[11px] text-slate-500">I own this unit</p>
              </button>
              <button
                type="button"
                onClick={() => {
                  setResidenceType("tenant");
                  touch("residenceType");
                  clearError("residenceType");
                  setFormError(null);
                }}
                className={[
                  "rounded-xl border p-4 text-left transition",
                  residenceType === "tenant"
                    ? "border-teal-500 bg-teal-50"
                    : "border-slate-200 bg-white hover:border-slate-300",
                ].join(" ")}
              >
                <User
                  className={[
                    "mb-2 h-6 w-6",
                    residenceType === "tenant" ? "text-slate-800" : "text-slate-400",
                  ].join(" ")}
                />
                <p className="text-sm font-bold text-slate-800">Tenant</p>
                <p className="mt-0.5 text-[11px] text-slate-500">I rent this unit</p>
              </button>
            </div>
            {residenceErr ? (
              <p className="mt-1 text-[12px] font-medium text-red-600" role="alert">
                {residenceErr}
              </p>
            ) : null}
          </div>
        ) : null}

        {fields.showUtilityBill ? (
          <OnboardingField
            id="profile-utility"
            label="Upload lease or utility bill"
            required={!existingUtilityBillUrl}
            error={utilityErr}
            hint="Used to verify you live in this community. JPG, PNG, or PDF — 10 MB max."
          >
            <input
              ref={fileInputRef}
              id="profile-utility"
              type="file"
              accept=".jpg,.jpeg,.png,.pdf,.heic,.heif,image/jpeg,image/png,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setUtilityFile(file);
                touch("utilityFile");
                clearError("utilityFile");
                setFormError(null);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={[
                "flex min-h-[140px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-6 text-center transition",
                utilityErr
                  ? "border-red-300 bg-red-50/40"
                  : utilityFile || existingUtilityBillUrl
                    ? "border-teal-400 bg-teal-50/50"
                    : "border-slate-300 bg-slate-50 hover:border-teal-400 hover:bg-teal-50/40",
              ].join(" ")}
            >
              {utilityFile ? (
                isPdfFile(utilityFile) ? (
                  <>
                    <FileText className="h-10 w-10 text-slate-700" />
                    <p className="text-sm font-medium text-slate-700">{utilityFile.name}</p>
                  </>
                ) : (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {utilityPreviewUrl ? (
                      <img
                        src={utilityPreviewUrl}
                        alt="Selected utility bill"
                        className="max-h-44 w-full rounded-lg object-contain"
                      />
                    ) : null}
                    <p className="text-xs text-slate-500">{utilityFile.name}</p>
                  </>
                )
              ) : existingUtilityBillUrl ? (
                isPdfFile(existingUtilityBillUrl) ? (
                  <>
                    <FileText className="h-10 w-10 text-slate-700" />
                    <p className="text-sm font-medium text-slate-700">Uploaded document</p>
                    <p className="text-xs text-teal-700">Tap to replace</p>
                  </>
                ) : (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={existingUtilityBillUrl}
                      alt="Uploaded utility bill"
                      className="max-h-44 w-full rounded-lg object-contain"
                    />
                    <p className="text-xs text-teal-700">Tap to replace</p>
                  </>
                )
              ) : (
                <>
                  <Upload className="h-8 w-8 text-slate-400" />
                  <p className="text-sm font-medium text-slate-600">Upload file</p>
                  <p className="text-[11px] text-slate-500">
                    JPG, PNG, or PDF — max 10 MB
                  </p>
                </>
              )}
            </button>
            <p className="text-[11px] text-slate-500">
              Verification may take a short time after you submit.
            </p>
          </OnboardingField>
        ) : null}

        <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            className="order-2 text-center text-xs font-semibold text-slate-500 transition hover:text-slate-800 sm:order-1 sm:text-left"
            onClick={() => {
              void confirmAdminSignOutAndRedirect(router, "/login", {
                text: COMPLETE_PROFILE_SIGN_OUT_MESSAGE,
              });
            }}
          >
            Sign out
          </button>
          <button
            type="submit"
            disabled={busy || hasFieldErrors(liveErrors)}
            className="order-1 inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#1B4F8A] px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-[#163A66] focus:outline-none focus:ring-2 focus:ring-[#1B4F8A]/30 disabled:cursor-not-allowed disabled:opacity-60 sm:order-2 sm:w-auto sm:min-w-[14rem]"
          >
            {busy ? "Saving profile…" : useSimpleSubmitLabel ? "Submit" : "Save & continue"}
          </button>
        </div>
        <p className="text-center text-[11px] leading-relaxed text-slate-500 sm:text-left">
          By continuing, you agree to Havena&apos;s Terms of Service and Privacy Policy.
        </p>
      </form>
      </div>
    </div>
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
