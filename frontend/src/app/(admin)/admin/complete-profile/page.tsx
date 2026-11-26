"use client";

import { ClearableInput } from "@/components/admin/clearable-field";

import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText, Home, Upload, User, X } from "lucide-react";
import { RingSpinner, ShimmerBlock } from "@/components/shared/loaders";
import { OnboardingField } from "@/components/admin/onboarding/onboarding-ui";
import { AdminPhoneInput } from "@/components/admin/phone-input";
import { useTouchedFieldErrors } from "@/hooks/use-touched-field-errors";
import { communityAdminOnboardingPath } from "@/lib/admin/community-admin-onboarding";
import {
  completeProfileOnboardingRole,
  COMPLETE_PROFILE_UTILITY_BILL_REQUIRED,
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
import { composePersonName, splitPersonName } from "@/lib/admin/person-name";
import { hasFieldErrors, inputClass, type FieldErrors } from "@/lib/admin/form-validation-utils";
import {
  fetchMe,
  meToSessionUser,
  updateMe,
  uploadUtilityBill,
  type MeProfile,
} from "@/lib/api/profile";
import { apiError, apiFieldErrors } from "@/lib/api/client";
import {
  canAccessCommunityDashboard,
  getCommunityAdminNextStep,
  getToken,
  getUser,
  updateUser,
} from "@/lib/auth/session";
import { emptyPhoneField, phoneFieldFromE164, type PhoneFieldState } from "@/lib/phone/format";
import { CompleteProfileLiveSummary } from "@/components/admin/complete-profile-live-summary";
import { UnitPickerField } from "@/components/admin/unit-picker-field";
import { createAdminUnit, fetchAdminUnits } from "@/lib/api/property-services";

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

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState<PhoneFieldState>(emptyPhoneField);
  const [unitNumber, setUnitNumber] = useState("");
  const [residenceType, setResidenceType] = useState("");
  const [officeAddress, setOfficeAddress] = useState("");
  const [utilityFile, setUtilityFile] = useState<File | null>(null);
  const [existingUtilityBillUrl, setExistingUtilityBillUrl] = useState<string | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
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

  const hasUtilitySelection = Boolean(utilityFile || existingUtilityBillUrl);

  function clearUtilitySelection() {
    setUtilityFile(null);
    setExistingUtilityBillUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    clearError("utilityFile");
    setFormError(null);
  }

  const liveErrors = useMemo(
    () =>
      validateCompleteProfileForm({
        firstName,
        lastName,
        email,
        phoneDigits: phone.digits,
        phoneCountry: phone.country,
        bio: "",
        unitNumber,
        residenceType,
        officeAddress,
        utilityFile: utilityInput,
        requireUtilityFile:
          COMPLETE_PROFILE_UTILITY_BILL_REQUIRED &&
          fields.showUtilityBill &&
          !existingUtilityBillUrl,
        requireResidenceType: fields.showResidenceType,
        requireUnitNumber: fields.showUnitNumber,
        requireOfficeAddress: fields.showOfficeAddress,
        requireAcceptedTerms: true,
        acceptedTerms,
        guestMode: fields.isGuestProfile,
        communityAdmin: isCommunityAdminProfile,
      }),
    [
      firstName,
      lastName,
      email,
      phone.digits,
      phone.country,
      unitNumber,
      residenceType,
      officeAddress,
      utilityFile,
      existingUtilityBillUrl,
      acceptedTerms,
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
        const profileFirst = me.profile?.first_name?.trim() ?? "";
        const profileLast = me.profile?.last_name?.trim() ?? "";
        if (profileFirst || profileLast) {
          setFirstName(profileFirst);
          setLastName(profileLast);
        } else {
          const displayName = me.profile?.display_name ?? me.name ?? "";
          const split = isPlaceholderDisplayName(displayName)
            ? { firstName: "", lastName: "" }
            : splitPersonName(displayName);
          setFirstName(split.firstName);
          setLastName(split.lastName);
        }
        setEmail(isPlaceholderEmail(me.email) ? "" : (me.email ?? "").trim());
        setPhone(me.phone ? phoneFieldFromE164(me.phone) : emptyPhoneField());
        setUnitNumber(
          isPlaceholderUnitNumber(me.profile?.unit_number) ? "" : (me.profile?.unit_number?.trim() ?? ""),
        );
        setOfficeAddress(me.profile?.office_address?.trim() ?? "");
        const rawResidence = me.profile?.residence_type ?? "";
        setResidenceType(isPlaceholderResidenceType(rawResidence) ? "" : rawResidence);
        setExistingUtilityBillUrl(me.profile?.utility_bill_url ?? null);
        setProfileUser(me);
        updateUser(meToSessionUser(me));
      })
      .catch(() => setFormError("Could not load your profile. Refresh and try again."))
      .finally(() => setLoading(false));
  }, [router, planHint, planQuery]);

  useEffect(() => {
    router.prefetch("/admin/billing");
    router.prefetch("/admin/pending-approval");
  }, [router]);

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

      const displayName = composePersonName(firstName, lastName);
      const me = await updateMe({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        display_name: displayName,
        name: displayName,
        email: email.trim().toLowerCase(),
        phone: phone.e164,
        ...(fields.showOfficeAddress
          ? { office_address: officeAddress.trim() }
          : {
              unit_number: unitNumber.trim(),
              ...(fields.showResidenceType && residenceType ? { residence_type: residenceType } : {}),
            }),
      });

      updateUser(meToSessionUser(me));

      const next = communityAdminOnboardingPath(getCommunityAdminNextStep(me));
      setBusy(false);
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

  const firstNameErr = showError("firstName", liveErrors);
  const lastNameErr = showError("lastName", liveErrors);
  const emailErr = showError("email", liveErrors);
  const combinedNameLength = composePersonName(firstName, lastName).length;
  const phoneErr = showError("phone", liveErrors);
  const unitErr = showError("unitNumber", liveErrors);
  const officeErr = showError("officeAddress", liveErrors);
  const residenceErr = showError("residenceType", liveErrors);
  const utilityErr = showError("utilityFile", liveErrors);
  const termsErr = showError("acceptedTerms", liveErrors);

  return (
    <div className="w-full min-w-0 overflow-x-hidden">
      <div className="grid w-full min-w-0 items-start gap-6 lg:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)] lg:gap-8">
        <CompleteProfileLiveSummary
          className="order-2 min-w-0 max-w-full lg:order-1 lg:sticky lg:top-6"
          firstName={firstName}
          lastName={lastName}
          email={email}
          phone={phone}
          officeAddress={officeAddress}
          unitNumber={unitNumber}
          residenceType={residenceType}
          utilityFile={utilityFile}
          existingUtilityBillUrl={existingUtilityBillUrl}
          utilityPreviewUrl={utilityPreviewUrl}
          acceptedTerms={acceptedTerms}
          showOfficeAddress={fields.showOfficeAddress}
          showUnitNumber={fields.showUnitNumber}
          showResidenceType={fields.showResidenceType}
          showUtilityBill={fields.showUtilityBill}
        />

      <form
        onSubmit={onSubmit}
        noValidate
        className="order-1 min-w-0 max-w-full overflow-hidden space-y-5 rounded-2xl border border-slate-200 bg-white p-4 pb-4 shadow-sm sm:p-6 sm:pb-5 lg:order-2 lg:px-8 lg:pt-8 lg:pb-5"
      >
        {formError ? (
          <div
            className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
            role="alert"
          >
            {formError}
          </div>
        ) : null}

        <div className="grid min-w-0 gap-5 sm:grid-cols-2">
        <OnboardingField
          id="profile-first-name"
          label="First name"
          required
          error={firstNameErr}
        >
          <ClearableInput
            id="profile-first-name"
            type="text"
            autoComplete="given-name"
            maxLength={firstName.length > nameMax ? undefined : nameMax}
            className={inputClass(
              firstNameErr,
              "h-11 w-full max-w-full min-w-0 overflow-x-auto rounded-xl border border-slate-200 px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-600/20",
            )}
            value={firstName}
            onChange={(e) => {
              setFirstName(applyCharacterLimit(firstName, e.target.value, nameMax));
              clearError("firstName");
              setFormError(null);
            }}
            onBlur={() => touch("firstName")}
            placeholder="Jane"
            aria-invalid={Boolean(firstNameErr)}
          />
        </OnboardingField>

        <OnboardingField
          id="profile-last-name"
          label="Last name"
          required
          error={lastNameErr}
        >
          <ClearableInput
            id="profile-last-name"
            type="text"
            autoComplete="family-name"
            maxLength={lastName.length > nameMax ? undefined : nameMax}
            className={inputClass(
              lastNameErr,
              "h-11 w-full max-w-full min-w-0 overflow-x-auto rounded-xl border border-slate-200 px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-600/20",
            )}
            value={lastName}
            onChange={(e) => {
              setLastName(applyCharacterLimit(lastName, e.target.value, nameMax));
              clearError("lastName");
              setFormError(null);
            }}
            onBlur={() => touch("lastName")}
            placeholder="Doe"
            aria-invalid={Boolean(lastNameErr)}
          />
          {isCommunityAdminProfile && combinedNameLength > 0 ? (
            <p
              className={`mt-2 text-right text-[11px] tabular-nums ${
                combinedNameLength > nameMax ? "text-red-600" : "text-slate-500"
              }`}
            >
              {combinedNameLength} / {nameMax} combined
            </p>
          ) : null}
        </OnboardingField>

        </div>

        <div className="grid min-w-0 gap-5 sm:grid-cols-2">
          <OnboardingField
            id="profile-email"
            label="Email address"
            required
            error={emailErr}
          >
            <ClearableInput
              id="profile-email"
              type="email"
              autoComplete="email"
              maxLength={COMPLETE_PROFILE_LIMITS.profileEmail}
              className={inputClass(
                emailErr,
                "h-11 w-full max-w-full min-w-0 overflow-x-auto rounded-xl border border-slate-200 px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-600/20",
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
            id="profile-phone"
            label="Phone number"
            required
          >
            <div className="min-w-0">
              <AdminPhoneInput
                id="profile-phone"
                value={phone.e164}
                required
                showHelper={false}
                showError={Boolean(phoneErr)}
                onChange={(state) => {
                  setPhone(state);
                  clearError("phone");
                  setFormError(null);
                }}
                onBlur={() => touch("phone")}
              />
            </div>
          </OnboardingField>
        </div>

        {fields.showOfficeAddress ? (
          <OnboardingField
            id="profile-office"
            label="Office address"
            required
            error={officeErr}
          >
            <ClearableInput
              id="profile-office"
              type="text"
              maxLength={officeAddress.length > officeMax ? undefined : officeMax}
              className={inputClass(
                officeErr,
                "h-11 w-full max-w-full min-w-0 overflow-x-auto rounded-xl border border-slate-200 px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-600/20",
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
            {officeAddress.length > 0 ? (
              <p className={`mt-2 text-right text-[11px] tabular-nums ${officeAddress.length > officeMax ? "text-red-600" : "text-slate-500"}`}>
                {officeAddress.length} / {officeMax}
              </p>
            ) : null}
          </OnboardingField>
        ) : null}

        {fields.showUnitNumber ? (
        <OnboardingField
          id="profile-unit"
          label="Unit number"
          required={fields.unitRequired}
          error={unitErr}
        >
          <UnitPickerField
            id="profile-unit"
            dataField="unitNumber"
            value={unitNumber}
            placeholder="Select unit"
            unitMax={unitMax}
            error={unitErr}
            loadUnits={async () => {
              const rows = await fetchAdminUnits();
              return rows
                .filter((row) => row.kind !== "office")
                .map((row) => ({
                  id: row.id,
                  unit_number: row.unit_number,
                  resident_count: row.resident_count ?? 0,
                }));
            }}
            createUnit={async (num) => {
              const created = await createAdminUnit({ unit_number: num });
              return {
                id: created.id,
                unit_number: created.unit_number,
                resident_count: created.resident_count ?? 0,
              };
            }}
            onChange={(num) => {
              setUnitNumber(applyCharacterLimit(unitNumber, num, unitMax));
              clearError("unitNumber");
              setFormError(null);
            }}
            onBlur={() => touch("unitNumber")}
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
            required={
              COMPLETE_PROFILE_UTILITY_BILL_REQUIRED && !existingUtilityBillUrl
            }
            error={utilityErr}
          >
            <ClearableInput
              ref={fileInputRef}
              id="profile-utility"
              type="file"
              accept=".jpg,.jpeg,.jfif,.png,.pdf,.heic,.heif,image/jpeg,image/png,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setUtilityFile(file);
                touch("utilityFile");
                clearError("utilityFile");
                setFormError(null);
              }}
            />
            <div className="relative">
              {hasUtilitySelection ? (
                <button
                  type="button"
                  onClick={clearUtilitySelection}
                  className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-200/60"
                  aria-label="Remove uploaded file"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={[
                  "flex min-h-[140px] w-full min-w-0 max-w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border border-dashed px-4 py-6 text-center transition",
                  utilityErr
                    ? "border-red-300 bg-red-50/40"
                    : hasUtilitySelection
                      ? "border-teal-400 bg-teal-50/50"
                      : "border-slate-300 bg-slate-50 hover:border-teal-400 hover:bg-teal-50/40",
                ].join(" ")}
              >
              {utilityFile ? (
                isPdfFile(utilityFile) ? (
                  <>
                    <FileText className="h-10 w-10 text-slate-700" />
                    <p className="max-w-full truncate px-2 text-sm font-medium text-slate-700" title={utilityFile.name}>
                      {utilityFile.name}
                    </p>
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
                    <p className="max-w-full truncate px-2 text-xs text-slate-500" title={utilityFile.name}>
                      {utilityFile.name}
                    </p>
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
            </div>
            <p className="text-[11px] text-slate-500">
              Verification may take a short time after you submit.
            </p>
          </OnboardingField>
        ) : null}

        <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0 flex-1">
            <label className="flex cursor-pointer items-center gap-2.5">
              <ClearableInput
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => {
                  setAcceptedTerms(e.target.checked);
                  clearError("acceptedTerms");
                  if (!e.target.checked) touch("acceptedTerms");
                }}
                onBlur={() => touch("acceptedTerms")}
                className={`h-4 w-4 shrink-0 rounded border-slate-300 text-[#1B4F8A] focus:ring-[#1B4F8A]/30 ${
                  termsErr ? "border-rose-400" : ""
                }`}
                aria-invalid={Boolean(termsErr)}
                aria-describedby={termsErr ? "accepted-terms-error" : undefined}
              />
              <span className="text-[11px] leading-snug text-slate-500">
                By continuing, you agree to Havena&apos;s{" "}
                <a
                  href="/terms-and-conditions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-[#1B4F8A] underline underline-offset-2 hover:text-[#163A66]"
                  onClick={(e) => e.stopPropagation()}
                >
                  Terms of Service
                </a>{" "}
                and{" "}
                <a
                  href="/privacy-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-[#1B4F8A] underline underline-offset-2 hover:text-[#163A66]"
                  onClick={(e) => e.stopPropagation()}
                >
                  Privacy Policy
                </a>
                .
              </span>
            </label>
            {termsErr ? (
              <p id="accepted-terms-error" className="mt-1 pl-6 text-[11px] text-rose-600">
                {termsErr}
              </p>
            ) : null}
          </div>
          <button
            type="submit"
            disabled={busy || hasFieldErrors(liveErrors)}
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-[#1B4F8A] px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-[#163A66] focus:outline-none focus:ring-2 focus:ring-[#1B4F8A]/30 disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-[10.5rem]"
          >
            {busy ? "Saving profile…" : useSimpleSubmitLabel ? "Submit" : "Save & continue"}
          </button>
        </div>
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
