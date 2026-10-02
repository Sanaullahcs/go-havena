import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform, BackHandler } from "react-native";
import LocaleTextInput from "../../../components/ui/locale-text-input";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../../constants/font";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { UserPlus, Users } from "lucide-react-native";
import BackButton from "../../../components/ui/back-button";
import { FormPhoneInput } from "../../../components/ui/phone-input";
import { Image } from "expo-image";
import { pickImage } from "../../../utils/pickImage";
import { updateProfile, joinCommunity, fetchMe } from "../../../services/auth-api";
import { createCommunityUnit, fetchCommunityUnits } from "../../../services/property-services-api";
import UnitPickerField from "../../../components/ui/unit-picker-field";
import {
  checkFamilyNumberAvailability,
  ensureMyFamily,
  fetchMyFamily,
  fetchSuggestedFamilyNumber,
  requestJoinFamily,
} from "../../../services/family-api";
import { uploadUtilityBill } from "../../../services/profile-api";
import { finishOnboarding, Routes, goToPendingFamily } from "../../../constants/onboarding-routes";
import {
  isGuestUser,
  shouldShowUtilityVerificationDelay,
  shouldSkipUtilityBill,
  shouldUseSimpleCompleteProfileSubmit,
} from "../../../services/community-access";
import { isNetworkLikeError, showApiFailure } from "../../../utils/auth-errors";
import { useAppDialog } from "../../../providers/app-dialog-provider";
import { confirmLeaveOnboarding } from "../../../services/sign-out";
import AuthSuccessOverlay from "../../../components/ui/auth-success-overlay";
import { isAuthenticated } from "../../../services/auth-session";
import { useSubmitLock } from "../../../hooks/use-submit-lock";
import { useTouchedFieldErrors } from "../../../hooks/use-touched-field-errors";
import { applyCharacterLimit, hasFieldErrors, LIMITS, validateCompleteProfileForm } from "../../../utils/form-validation";
import { extractNationalDigits, toE164 } from "../../../utils/phone";
import { DEFAULT_PHONE_COUNTRY } from "../../../constants/phone-countries";
import { getProfileFields, isPlaceholderDisplayName, isPlaceholderResidenceType, isPlaceholderUnitNumber } from "../../../utils/profile-display";
import ScreenStatusBar from "../../../components/layout/screen-status-bar";
import KeyboardSafeScreen, { useScrollFieldRefIntoView } from "../../../components/layout/keyboard-safe-screen";
import { HomeTheme as T } from "../../../constants/home-theme";
import { ScreenBrand as B } from "../../../constants/screen-brand";

function isPdfAsset(asset) {
  const mime = String(asset?.mimeType ?? "").toLowerCase();
  const uri = String(asset?.uri ?? "").toLowerCase();
  return mime === "application/pdf" || uri.endsWith(".pdf");
}

const PLACEHOLDER_COLOR = "#9CA3AF";
const UTILITY_UPLOAD_LABEL =
  "Upload your lease agreement or a utility bill issued within the last 3 months.";

function utilityUploadLabel(t, language) {
  if (!language || language.toLowerCase().startsWith("en")) {
    return UTILITY_UPLOAD_LABEL;
  }
  const translated = t("onboarding.uploadLease");
  if (!translated || translated.includes("last 3 month")) {
    return UTILITY_UPLOAD_LABEL;
  }
  return translated;
}

/** Plain object so the text-metrics patch cannot add lineHeight. */
const utilityUploadLabelStyle = {
  fontFamily: Fonts.semiBold,
  fontSize: 13,
  lineHeight: 20,
  fontWeight: "600",
  color: T.navy,
  flexShrink: 1,
};

const fieldTextStyle = {
  fontFamily: Fonts.regular,
  fontSize: 14,
  color: T.navy,
  width: "100%",
  margin: 0,
  paddingHorizontal: 0,
  paddingTop: 0,
  paddingBottom: 0,
  textAlignVertical: "center",
  includeFontPadding: false,
};

const familyFieldTextStyle = {
  ...fieldTextStyle,
  fontFamily: Fonts.bold,
  letterSpacing: 1,
  paddingEnd: 44,
};

/** Multiline bio — pad from the top so typed text is not vertically centered. */
const bioFieldTextStyle = {
  fontFamily: Fonts.regular,
  fontSize: 14,
  color: T.navy,
  width: "100%",
  minHeight: 88,
  margin: 0,
  padding: 0,
  textAlignVertical: "top",
  includeFontPadding: false,
};

export default function CompleteProfile() {
  const { t, i18n } = useTranslation();
  const dialog = useAppDialog();
  const router = useRouter();
  const {
    role = "resident",
    regionId,
    communityId,
    communityName = "Oak Valley Residences",
    communityRequest,
    mode,
    familyMode: familyModeParam,
    invited: invitedParam,
  } = useLocalSearchParams();
  const isEditMode = mode === "edit";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneDigits, setPhoneDigits] = useState("");
  const [phoneCountry, setPhoneCountry] = useState(DEFAULT_PHONE_COUNTRY);
  const [bio, setBio] = useState("");
  const [unitNumber, setUnitNumber] = useState("");
  const [officeAddress, setOfficeAddress] = useState("");
  const [familyNumber, setFamilyNumber] = useState("");
  const [familyNumberError, setFamilyNumberError] = useState(null);
  const [familyNumberChecking, setFamilyNumberChecking] = useState(false);
  const [familyNumberLoading, setFamilyNumberLoading] = useState(false);
  // Edit Profile: true until /families/mine hydrates — does not hide option cards.
  const [familyStatusHydrating, setFamilyStatusHydrating] = useState(() => isEditMode);
  const [familyNumberLocked, setFamilyNumberLocked] = useState(false);
  /** @type {['create' | 'join' | 'skip', Function]} */
  // Edit Profile: provisional "skip" until /families/mine hydrates (avoid defaulting to Create).
  const [familyMode, setFamilyMode] = useState(() => (isEditMode ? "skip" : "create"));
  const [residenceType, setResidenceType] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const { touch, clearError, showError, validateOnSubmit } = useTouchedFieldErrors();
  const [existingUtilityBillUrl, setExistingUtilityBillUrl] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [isGuestProfile, setIsGuestProfile] = useState(false);
  const [profileUser, setProfileUser] = useState(null);

  const { submitting, run } = useSubmitLock();
  const [showSuccess, setShowSuccess] = useState(false);
  const [savedUser, setSavedUser] = useState(null);
  const [generatedFamilyNumber, setGeneratedFamilyNumber] = useState(null);
  const [familyJoinPending, setFamilyJoinPending] = useState(false);
  const [skipUtilityBill, setSkipUtilityBill] = useState(false);
  const [hideUtilityVerificationDelay, setHideUtilityVerificationDelay] = useState(
    invitedParam === "1",
  );
  const isCommunityRequest = communityRequest === "1";
  const isCommunityAdminProfile =
    role === "admin" ||
    isCommunityRequest ||
    profileUser?.role === "community_admin" ||
    profileUser?.role === "admin";
  const nameMax = LIMITS.profileName;
  const unitMax = isCommunityAdminProfile ? LIMITS.communityAdminUnit : LIMITS.profileUnit;
  const officeMax = LIMITS.officeAddress;

  // Non-edit onboarding: never `router.back()` / splash — auth redirect would loop here again.
  const leaveOnboardingOnBack = !isEditMode;

  const handleBack = useCallback(() => {
    if (leaveOnboardingOnBack) {
      confirmLeaveOnboarding(dialog);
      return;
    }
    if (router.canGoBack?.()) {
      router.back();
      return;
    }
    router.replace("/");
  }, [leaveOnboardingOnBack, dialog, router]);

  useEffect(() => {
    if (!leaveOnboardingOnBack) return undefined;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      confirmLeaveOnboarding(dialog);
      return true;
    });
    return () => sub.remove();
  }, [leaveOnboardingOnBack, dialog]);

  const isAdminClaim = role === "admin" && Boolean(communityId) && !isCommunityRequest;
  const continuesToBilling = ["complete_billing_web", "ready"].includes(
    savedUser?.access?.next_step,
  );
  const isResidentJoin = !isCommunityRequest && role !== "admin" && Boolean(communityId);
  const useSimpleSubmitLabel = shouldUseSimpleCompleteProfileSubmit(profileUser, {
    invitedParam,
    isAdminClaim,
  });
  const showFamilyNumberField = role !== "admin" && !isCommunityRequest;
  const showResidenceType = !isGuestProfile && !isCommunityAdminProfile;
  const showUnitNumber = !isCommunityAdminProfile;
  const showOfficeAddress = isCommunityAdminProfile;
  // Utility bill is required for residents and community admins on every entry path.
  const showUtilityBill = (showResidenceType || showOfficeAddress) && !skipUtilityBill;

  const scrollRef = useRef(null);
  const contentRef = useRef(null);
  const nameFieldRef = useRef(null);
  const emailFieldRef = useRef(null);
  const phoneFieldRef = useRef(null);
  const bioFieldRef = useRef(null);
  const unitFieldRef = useRef(null);
  const familyFieldRef = useRef(null);
  const familyCheckSeq = useRef(0);
  const { scrollIntoView, onScroll } = useScrollFieldRefIntoView(scrollRef, {
    footerHeight: 120,
    topPad: 24,
  });

  const handleFieldFocus = useCallback(
    (fieldRef) => {
      scrollIntoView(fieldRef);
    },
    [scrollIntoView],
  );

  useEffect(() => {
    if (familyModeParam === "create" || familyModeParam === "join") {
      setFamilyMode(familyModeParam);
    }
  }, [familyModeParam]);

  useEffect(() => {
    if (!showFamilyNumberField || isGuestProfile) {
      if (isEditMode) setFamilyStatusHydrating(false);
      return undefined;
    }

    let cancelled = false;

    (async () => {
      if (isEditMode) setFamilyStatusHydrating(true);
      else setFamilyNumberLoading(true);
      try {
        const mine = await fetchMyFamily();
        if (cancelled) return;

        const applyEditFamilyFromMine = () => {
          if (mine.state === "pending" || mine.state === "awaiting_admin") {
            setFamilyMode("join");
            setFamilyNumber(mine.pending_request?.family?.family_number ?? "");
            setFamilyNumberLocked(true);
            setFamilyJoinPending(true);
            return;
          }

          if (mine.state === "member" || mine.state === "suspended") {
            const membershipRole = mine.membership?.role;
            setFamilyMode(membershipRole === "head" ? "create" : "join");
            setFamilyNumber(mine.family?.family_number ?? "");
            setFamilyNumberLocked(true);
            setFamilyJoinPending(false);
            return;
          }

          if (mine.state === "rejected") {
            // Prior join was rejected — unlock so they can choose again; do not invent Create.
            setFamilyMode("join");
            setFamilyNumber("");
            setFamilyNumberLocked(false);
            setFamilyJoinPending(false);
            return;
          }

          // state === "none" | "blocked" | unknown → saved Skip / no family
          setFamilyMode("skip");
          setFamilyNumber("");
          setFamilyNumberLocked(false);
          setFamilyJoinPending(false);
        };

        if (isEditMode) {
          applyEditFamilyFromMine();
          return;
        }

        if (mine.state === "pending" || mine.state === "awaiting_admin") {
          setFamilyMode("join");
          setFamilyNumber(mine.pending_request?.family?.family_number ?? "");
          setFamilyNumberLocked(true);
          setFamilyJoinPending(true);
          return;
        }

        if (mine.state === "rejected" && familyModeParam === "create") {
          setFamilyMode("create");
          setFamilyNumberLocked(false);
          setFamilyJoinPending(false);
          const suggested = await fetchSuggestedFamilyNumber();
          if (!cancelled && suggested.family_number) {
            setFamilyNumber(suggested.family_number);
          }
          return;
        }

        if (mine.family?.family_number || mine.state === "member" || mine.state === "suspended") {
          const membershipRole = mine.membership?.role;
          setFamilyMode(membershipRole === "head" ? "create" : "join");
          setFamilyNumber(mine.family?.family_number ?? "");
          setFamilyNumberLocked(true);
          return;
        }

        if (familyModeParam === "join") {
          setFamilyMode("join");
          setFamilyNumber("");
          return;
        }

        if (familyModeParam === "skip") {
          setFamilyMode("skip");
          setFamilyNumber("");
          return;
        }

        const suggested = await fetchSuggestedFamilyNumber();
        if (!cancelled && suggested.family_number) {
          setFamilyMode(familyModeParam === "join" ? "join" : "create");
          setFamilyNumber(suggested.family_number);
        }
      } catch {
        if (!cancelled && isEditMode) {
          // Keep provisional skip — do not invent Create My Family on load failure.
          setFamilyMode("skip");
          setFamilyNumber("");
          setFamilyNumberLocked(false);
        } else if (!cancelled && !isEditMode) {
          try {
            const suggested = await fetchSuggestedFamilyNumber();
            if (suggested.family_number) {
              setFamilyMode("create");
              setFamilyNumber(suggested.family_number);
            }
          } catch {
            // Offline — validated on submit.
          }
        }
      } finally {
        if (!cancelled) {
          if (!isEditMode) setFamilyNumberLoading(false);
          setFamilyStatusHydrating(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [showFamilyNumberField, isGuestProfile, isEditMode, familyModeParam]);

  useEffect(() => {
    if (!showFamilyNumberField || familyNumberLocked || familyMode === "skip") {
      return undefined;
    }

    const trimmed = familyNumber.trim();
    if (!trimmed) {
      setFamilyNumberError(null);
      return undefined;
    }

    const seq = ++familyCheckSeq.current;
    const timer = setTimeout(async () => {
      setFamilyNumberChecking(true);
      try {
        const result = await checkFamilyNumberAvailability(trimmed);
        if (seq !== familyCheckSeq.current) return;

        if (result.normalized && result.normalized !== trimmed.toUpperCase()) {
          setFamilyNumber(result.normalized);
        }

        if (familyMode === "create") {
          if (!result.available) {
            setFamilyNumberError(result.message || t("onboarding.familyNumberRequired"));
          } else {
            setFamilyNumberError(null);
          }
        } else {
          // Join mode — number must already exist.
          if (result.available) {
            setFamilyNumberError(t("onboarding.familyNumberNotFound"));
          } else if (result.message && !/already (exists|taken)/i.test(result.message)) {
            setFamilyNumberError(result.message);
          } else {
            setFamilyNumberError(null);
          }
        }
      } catch {
        if (seq === familyCheckSeq.current) {
          setFamilyNumberError(t("onboarding.couldNotVerifyFamily"));
        }
      } finally {
        if (seq === familyCheckSeq.current) {
          setFamilyNumberChecking(false);
        }
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [familyNumber, showFamilyNumberField, familyNumberLocked, familyMode]);

  const handleFamilyNumberBlur = async () => {
    touch("familyNumber");
    if (familyNumberLocked || familyNumber.trim()) return;
    if (familyMode !== "create") return;

    setFamilyNumberLoading(true);
    try {
      const suggested = await fetchSuggestedFamilyNumber();
      if (suggested.family_number) {
        setFamilyNumber(suggested.family_number);
        setFamilyNumberError(null);
      }
    } catch {
      setFamilyNumberError(t("onboarding.couldNotGenerateFamily"));
    } finally {
      setFamilyNumberLoading(false);
    }
  };

  const regenerateFamilyNumber = async () => {
    if (familyNumberLocked || familyMode !== "create") return;
    setFamilyNumberLoading(true);
    try {
      const suggested = await fetchSuggestedFamilyNumber();
      if (suggested.family_number) {
        setFamilyNumber(suggested.family_number);
        setFamilyNumberError(null);
      }
    } catch {
      setFamilyNumberError(t("onboarding.couldNotGenerateNewFamily"));
    } finally {
      setFamilyNumberLoading(false);
    }
  };

  const selectFamilyMode = async (mode) => {
    if (familyNumberLocked || mode === familyMode || familyNumberLoading || familyStatusHydrating) {
      return;
    }
    const previousMode = familyMode;
    const previousNumber = familyNumber;
    setFamilyMode(mode);
    setFamilyNumberError(null);
    clearError("familyNumber");

    if (mode === "skip") {
      setFamilyNumber("");
      return;
    }

    if (mode === "join") {
      setFamilyNumber("");
      return;
    }

    setFamilyNumberLoading(true);
    try {
      const suggested = await fetchSuggestedFamilyNumber();
      if (suggested.family_number) {
        setFamilyNumber(suggested.family_number);
      }
    } catch (err) {
      if (__DEV__) {
        console.warn("[complete-profile] suggest family number failed", err);
      }
      setFamilyMode(previousMode);
      setFamilyNumber(previousNumber);
      setFamilyNumberError(null);
      await dialog.showError(
        t("onboarding.couldNotGenerateFamily"),
        t("common.tryAgain", { defaultValue: "Please try again." }),
      );
    } finally {
      setFamilyNumberLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const authed = await isAuthenticated();
      if (!authed && !cancelled) {
        router.replace(Routes.LOGIN);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setProfileLoading(true);
      try {
        const user = await fetchMe();
        if (cancelled) return;
        setProfileUser(user);
        setIsGuestProfile(isGuestUser(user));
        setSkipUtilityBill(shouldSkipUtilityBill(user, { role }));
        setHideUtilityVerificationDelay(
          !shouldShowUtilityVerificationDelay(user, {
            invitedParam,
            isAdminClaim,
            isCommunityRequest,
          }),
        );
        const fields = getProfileFields(user);
        setName(isPlaceholderDisplayName(fields.displayName) ? "" : fields.displayName);
        setEmail(fields.displayEmail ?? "");
        const rawPhone = user.phone ?? "";
        if (rawPhone) {
          setPhoneDigits(extractNationalDigits(rawPhone));
        }
        setBio(fields.bio ?? "");
        setUnitNumber(isPlaceholderUnitNumber(fields.unitNumber) ? "" : (fields.unitNumber ?? ""));
        setOfficeAddress(fields.officeAddress ?? user.profile?.office_address ?? "");
        const rawResidence = user.profile?.residence_type ?? user.residence_type ?? "";
        setResidenceType(isPlaceholderResidenceType(rawResidence) ? "" : rawResidence);
        setExistingUtilityBillUrl(fields.utilityBillUrl);
      } catch (err) {
        if (!cancelled && isEditMode) {
          await showApiFailure(dialog, t("onboarding.couldNotLoadProfile"), err);
          router.back();
        }
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEditMode, router, dialog, role, invitedParam, isAdminClaim, isCommunityRequest]);

  useEffect(() => {
    if (name && isPlaceholderDisplayName(name)) {
      setName("");
    }
  }, [name]);

  const liveErrors = useMemo(
    () =>
      validateCompleteProfileForm({
        name,
        email,
        phoneDigits,
        phoneCountry,
        bio,
        unitNumber,
        residenceType,
        officeAddress,
        utilityFile: selectedFile ?? (existingUtilityBillUrl ? { uri: existingUtilityBillUrl } : null),
        requireUtilityFile: showUtilityBill && !existingUtilityBillUrl,
        requireResidenceType: showResidenceType,
        requireUnitNumber: showUnitNumber,
        requireOfficeAddress: showOfficeAddress,
        guestMode: isGuestProfile,
        communityAdmin: isCommunityAdminProfile,
      }),
    [name, email, phoneDigits, phoneCountry, bio, unitNumber, residenceType, officeAddress, selectedFile, existingUtilityBillUrl, isGuestProfile, showUtilityBill, showResidenceType, showUnitNumber, showOfficeAddress, isCommunityAdminProfile],
  );

  const isValid = useMemo(() => {
    if (hasFieldErrors(liveErrors)) return false;
    if (
      showFamilyNumberField &&
      !isGuestProfile &&
      !familyNumberLocked &&
      familyMode !== "skip"
    ) {
      if (familyNumberLoading || familyNumberChecking) return false;
      if (!familyNumber.trim() || familyNumberError) return false;
    }
    return true;
  }, [
    liveErrors,
    showFamilyNumberField,
    isGuestProfile,
    familyNumberLocked,
    familyMode,
    familyNumberLoading,
    familyNumberChecking,
    familyNumber,
    familyNumberError,
  ]);

  const showProfileSubmitFailure = async (err, fallbackTitleKey = "onboarding.unableToCompleteProfile") => {
    if (__DEV__) {
      console.warn("[complete-profile] submit failed", err);
    }
    if (isNetworkLikeError(err)) {
      await dialog.showError(
        t("onboarding.noInternetConnection"),
        t("onboarding.unableToCompleteProfileOffline"),
      );
      return;
    }
    await showApiFailure(dialog, t(fallbackTitleKey), err);
  };

  const handleJoinCommunity = () => {
    if (submitting) return;
    if (
      showFamilyNumberField &&
      !isGuestProfile &&
      !familyNumberLocked &&
      familyMode !== "skip"
    ) {
      if (familyNumberError) {
        touch("familyNumber");
        return;
      }
      if (!familyNumber.trim()) {
        touch("familyNumber");
        setFamilyNumberError(
          familyMode === "join"
            ? t("onboarding.enterFamilyFromHead")
            : t("onboarding.familyNumberRequired"),
        );
        return;
      }
    }
    if (!validateOnSubmit(liveErrors)) return;
    submitProfile();
  };

  const submitProfile = () =>
    run(async () => {
      try {
        const isLocalUpload =
          showUtilityBill &&
          selectedFile?.uri &&
          !/^https?:\/\//i.test(selectedFile.uri);

        if (isLocalUpload) {
          await uploadUtilityBill(selectedFile.uri, selectedFile);
        }

        const profileResult = await updateProfile({
          display_name: name.trim(),
          ...(isEditMode ? {} : { email: email.trim().toLowerCase() }),
          phone: toE164(phoneDigits, phoneCountry),
          bio: bio.trim(),
          ...(showOfficeAddress
            ? { office_address: officeAddress.trim() }
            : isEditMode
              ? {}
              : { unit_number: unitNumber.trim() }),
          ...(showResidenceType
            ? {
                residence_type: residenceType,
                ...(regionId ? { region_id: Number(regionId) } : {}),
              }
            : {
                ...(regionId ? { region_id: Number(regionId) } : {}),
              }),
        });

        let savedFamilyNumber = familyNumberLocked ? familyNumber.trim() : null;
        let joinPending = false;

        if (
          !isGuestProfile &&
          !isEditMode &&
          role !== "admin" &&
          showFamilyNumberField &&
          !familyNumberLocked &&
          familyMode !== "skip"
        ) {
          let numberToSave = familyNumber.trim();

          if (familyMode === "create") {
            if (!numberToSave) {
              const suggested = await fetchSuggestedFamilyNumber();
              numberToSave = suggested.family_number ?? "";
              setFamilyNumber(numberToSave);
            }

            if (!numberToSave) {
              await showApiFailure(dialog, t("onboarding.familyNumberRequired"), {
                message: t("onboarding.couldNotGenerateFamily"),
              });
              return;
            }

            if (familyNumberError) {
              await showApiFailure(dialog, t("onboarding.couldNotVerifyFamily"), {
                message: familyNumberError,
              });
              return;
            }

            try {
              const family = await ensureMyFamily(numberToSave);
              savedFamilyNumber = family?.family_number ?? numberToSave;
            } catch (err) {
              await showProfileSubmitFailure(err, "onboarding.couldNotVerifyFamily");
              return;
            }
          } else {
            if (!numberToSave) {
              await showApiFailure(dialog, t("onboarding.familyNumberRequired"), {
                message: t("onboarding.enterFamilyFromHead"),
              });
              return;
            }

            if (familyNumberError) {
              await showApiFailure(dialog, t("onboarding.couldNotVerifyFamily"), {
                message: familyNumberError,
              });
              return;
            }

            try {
              await requestJoinFamily(numberToSave);
              savedFamilyNumber = numberToSave;
              joinPending = true;
            } catch (err) {
              await showProfileSubmitFailure(err, "onboarding.couldNotVerifyFamily");
              return;
            }
          }
        }

        let user = profileResult.user ?? profileResult;
        try {
          user = await fetchMe();
        } catch {
          // Fall back to profile response if /me refresh fails.
        }

        const alreadyJoined = (user?.memberships ?? []).some(
          (m) => String(m.community_id) === String(communityId),
        );
        if (!isEditMode && communityId && !isCommunityRequest && !alreadyJoined) {
          await joinCommunity(Number(communityId));
          try {
            user = await fetchMe();
          } catch {
            // Session already updated by joinCommunity when possible.
          }
        }

        setGeneratedFamilyNumber(savedFamilyNumber);
        setFamilyJoinPending(joinPending);
        setSavedUser(user);
        setShowSuccess(true);
      } catch (err) {
        await showProfileSubmitFailure(err);
      }
    });


  const submitBlock = (
    <View style={styles.buttonContainer}>
      <TouchableOpacity
        activeOpacity={isValid && !submitting ? 0.9 : 1}
        onPress={handleJoinCommunity}
        disabled={!isValid || submitting}
      >
        <View
          style={[
            styles.button,
            isValid && !submitting ? styles.buttonActive : styles.buttonDisabled,
            isValid && !submitting ? B.buttonShadow : null,
          ]}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>
              {isEditMode
                ? t("onboarding.saveChanges")
                : useSimpleSubmitLabel
                  ? t("onboarding.submit")
                  : isCommunityRequest || isAdminClaim
                    ? t("onboarding.saveContinue")
                    : isResidentJoin
                      ? t("onboarding.submitForApproval")
                      : t("onboarding.joinCommunity")}
            </Text>
          )}
        </View>
      </TouchableOpacity>

      <Text style={styles.footerHint}>{t("onboarding.termsAgreement")}</Text>
    </View>
  );

  return (
    <>
      <ScreenStatusBar style="dark" opaque androidBackgroundColor={T.canvas} />
      <AuthSuccessOverlay
        visible={showSuccess}
        title={
          isEditMode
            ? t("onboarding.profileUpdated")
            : continuesToBilling
              ? t("onboarding.profileSaved")
              : isAdminClaim || isCommunityRequest
              ? t("onboarding.applicationSubmitted")
              : isResidentJoin
                ? t("onboarding.profileSubmitted")
                : t("onboarding.profileSaved")
        }
        subtitle={
          isEditMode
            ? t("onboarding.profileChangesSaved")
            : continuesToBilling
              ? t("onboarding.welcomeToCommunity")
            : isCommunityRequest
              ? role === "admin"
                ? t("onboarding.adminApprovalRequired")
                : t("onboarding.communityApprovalNotify")
              : isAdminClaim
                ? t("onboarding.adminApprovalManage")
                : familyJoinPending
                  ? t("onboarding.familyJoinSentPending")
                  : isResidentJoin
                    ? familyMode === "skip"
                      ? t("onboarding.membershipSentSkipFamily")
                      : generatedFamilyNumber
                        ? t("onboarding.membershipSentFamilyReady", { number: generatedFamilyNumber })
                        : t("onboarding.adminReviewMembership")
                    : familyMode === "skip"
                      ? t("onboarding.welcomeSkipFamily")
                      : generatedFamilyNumber
                        ? t("onboarding.welcomeFamilyReady", { number: generatedFamilyNumber })
                        : t("onboarding.welcomeToCommunity")
        }
        onComplete={() => {
          setShowSuccess(false);
          if (isEditMode) {
            router.back();
            return;
          }
          if (familyJoinPending) {
            goToPendingFamily(router, { role });
            return;
          }
          finishOnboarding(router, { role, user: savedUser });
        }}
      />
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]} importantForAutofill="no">
      <View style={styles.headerRow}>
        <BackButton iconOnly compact onPress={handleBack} />
        <Text style={styles.headerTitle}>
          {isEditMode ? t("onboarding.editProfile") : t("onboarding.completeProfile")}
        </Text>
      </View>

      <KeyboardSafeScreen
        scrollRef={scrollRef}
        keyboardAvoiding={Platform.OS === "ios"}
        footerKeyboardLift={false}
        footerBorderless
        footerStyle={styles.footer}
        contentContainerStyle={styles.scrollContainer}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
        scrollProps={{
          bounces: false,
          onScroll,
          scrollEventThrottle: 16,
        }}
        footer={!profileLoading ? submitBlock : null}
      >
        <View ref={contentRef} collapsable={false} style={styles.content}>
          <View>
            <Text style={styles.subHeading}>
              {isEditMode
                ? isGuestProfile
                  ? t("onboarding.updateGuestProfile")
                  : t("onboarding.updateProfileDetails")
                : isCommunityRequest && role === "admin"
                  ? t("onboarding.registering") + " "
                  : isAdminClaim
                    ? t("onboarding.applyingToManage") + " "
                    : isResidentJoin
                      ? t("onboarding.almostThere") + " "
                      : t("onboarding.joining") + " "}
              {!isEditMode ? (
                <Text style={styles.subHeadingBold}>{communityName}</Text>
              ) : null}
            </Text>
            {isResidentJoin && !isEditMode ? (
              <Text style={styles.stepHint}>
                {familyMode === "skip"
                  ? t("onboarding.afterSubmitSkipFamily")
                  : familyMode === "join"
                    ? t("onboarding.afterSubmitFamilyHead")
                    : t("onboarding.afterSubmitAdmin")}
              </Text>
            ) : null}
          </View>

          {!isEditMode ? (
          <View style={styles.progressRow} importantForAutofill="no">
            <View style={styles.progressItem}>
              <View style={styles.doneDot}>
                <Ionicons name="checkmark" size={12} color="#FFFFFF" />
              </View>
              <Text style={styles.progressTextMuted}>{t("onboarding.join")}</Text>
            </View>

            <View style={styles.progressLine} />

            <View style={styles.progressItem}>
              <View style={styles.doneDot}>
                <Ionicons name="checkmark" size={12} color="#FFFFFF" />
              </View>
              <Text style={styles.progressTextMuted}>{t("onboarding.phone")}</Text>
            </View>

            <View style={styles.progressLine} />

            <View style={styles.progressItem}>
              <View style={styles.doneDot}>
                <Ionicons name="checkmark" size={12} color="#FFFFFF" />
              </View>
              <Text style={styles.progressTextMuted}>{t("onboarding.verified")}</Text>
            </View>

            <View style={styles.progressLine} />

            <View style={styles.progressItem}>
              <View style={styles.currentDot}>
                <Text style={styles.currentDotText}>4</Text>
              </View>
              <Text style={styles.progressTextActive}>{t("onboarding.profileStep")}</Text>
            </View>
          </View>
          ) : null}

          {isResidentJoin && !isEditMode ? (
            <View style={styles.infoBanner}>
              <Ionicons name="information-circle-outline" size={18} color={T.deepTeal} />
              <Text style={styles.infoBannerText}>
                {t("onboarding.detailsHelpVerify", { community: communityName })}
              </Text>
            </View>
          ) : null}

          {profileLoading ? (
            <ActivityIndicator size="large" color={T.teal} style={{ marginVertical: 24 }} />
          ) : null}

          {!profileLoading ? (
          <>
          <View style={styles.form}>
            <View ref={nameFieldRef} collapsable={false} style={styles.fieldGroup}>
              <Text style={styles.inputText}>
                {t("onboarding.fullName")} <Text style={styles.requiredMark}>*</Text>
              </Text>
              <View style={[styles.inputBox, showError("name", liveErrors) && styles.inputError]}>
                <LocaleTextInput
                  style={fieldTextStyle}
                  placeholder={t("onboarding.namePlaceholder")}
                  placeholderTextColor={PLACEHOLDER_COLOR}
                  value={name}
                  onChangeText={(text) => {
                    setName(applyCharacterLimit(name, text, nameMax));
                    clearError("name");
                  }}
                  onBlur={() => touch("name")}
                  onFocus={() => {
                    if (name && isPlaceholderDisplayName(name)) {
                      setName("");
                    }
                    handleFieldFocus(nameFieldRef);
                  }}
                  autoComplete="off"
                  textContentType="none"
                  importantForAutofill="no"
                  autoCorrect={false}
                  maxLength={name.length > nameMax ? undefined : nameMax}
                  underlineColorAndroid="transparent"
                  textAlignVertical="center"
                />
              </View>
              {isCommunityAdminProfile ? (
                <Text style={[styles.helperText, name.length > nameMax && styles.errorText]}>
                  {name.length} / {nameMax}
                </Text>
              ) : null}
              {showError("name", liveErrors) ? <Text style={styles.errorText}>{showError("name", liveErrors)}</Text> : null}
            </View>

            <View ref={emailFieldRef} collapsable={false} style={styles.fieldGroup}>
              <Text style={styles.inputText}>
                {t("onboarding.emailAddress")} <Text style={styles.requiredMark}>*</Text>
              </Text>
              <View
                style={[
                  styles.inputBox,
                  isEditMode && styles.inputBoxDisabled,
                  !isEditMode && showError("email", liveErrors) && styles.inputError,
                ]}
                pointerEvents={isEditMode ? "none" : "auto"}
              >
                <LocaleTextInput
                  style={[fieldTextStyle, isEditMode && styles.inputTextDisabled]}
                  placeholder={t("onboarding.emailPlaceholder")}
                  placeholderTextColor={PLACEHOLDER_COLOR}
                  value={String(email ?? "")}
                  onChangeText={(text) => {
                    if (isEditMode) return;
                    setEmail(text);
                    clearError("email");
                  }}
                  onBlur={() => {
                    if (isEditMode) return;
                    touch("email");
                  }}
                  onFocus={() => {
                    if (isEditMode) return;
                    handleFieldFocus(emailFieldRef);
                  }}
                  editable={!isEditMode}
                  selectTextOnFocus={false}
                  autoCapitalize="none"
                  autoCorrect={false}
                  // Autofill + disabled email fields can SIGABRT on iOS; strip when read-only.
                  autoComplete={isEditMode ? "off" : "email"}
                  textContentType={isEditMode ? "none" : "emailAddress"}
                  importantForAutofill={isEditMode ? "no" : "yes"}
                  keyboardType="email-address"
                  maxLength={LIMITS.profileEmail}
                  forceLtr
                  textAlign="left"
                  underlineColorAndroid="transparent"
                  textAlignVertical="center"
                />
              </View>
              {!isEditMode && showError("email", liveErrors) ? (
                <Text style={styles.errorText}>{showError("email", liveErrors)}</Text>
              ) : null}
            </View>

            <View ref={phoneFieldRef} collapsable={false} style={styles.fieldGroup}>
              <Text style={styles.inputText}>
                {t("onboarding.phoneNumber")} <Text style={styles.requiredMark}>*</Text>
              </Text>
              <FormPhoneInput
                digits={phoneDigits}
                country={phoneCountry}
                onChangeDigits={(value) => {
                  setPhoneDigits(value);
                  clearError("phone");
                }}
                onCountryChange={(country) => {
                  setPhoneCountry(country);
                  clearError("phone");
                }}
                showError={Boolean(showError("phone", liveErrors))}
                onFocus={() => handleFieldFocus(phoneFieldRef)}
              />
              {showError("phone", liveErrors) ? <Text style={styles.errorText}>{showError("phone", liveErrors)}</Text> : null}
            </View>

            <View ref={bioFieldRef} collapsable={false} style={styles.fieldGroup}>
              <Text style={styles.inputText}>{t("onboarding.bio")}</Text>
              <View style={[styles.textAreaBox, showError("bio", liveErrors) && styles.inputError]}>
                {bio.length === 0 ? (
                  <Text style={[styles.bioPlaceholder, { pointerEvents: "none" }]}>
                    {t("onboarding.bioPlaceholder")}
                  </Text>
                ) : null}
                <LocaleTextInput
                  style={bioFieldTextStyle}
                  placeholder=""
                  placeholderTextColor="transparent"
                  value={bio}
                  onChangeText={(text) => {
                    setBio(text);
                    clearError("bio");
                  }}
                  onBlur={() => touch("bio")}
                  onFocus={() => handleFieldFocus(bioFieldRef)}
                  multiline
                  textAlignVertical="top"
                  maxLength={LIMITS.profileBio}
                  underlineColorAndroid="transparent"
                />
              </View>
              <Text style={styles.helperText}>{t("onboarding.characters", { count: bio.length, max: LIMITS.profileBio })}</Text>
              {showError("bio", liveErrors) ? <Text style={styles.errorText}>{showError("bio", liveErrors)}</Text> : null}
            </View>

            {showOfficeAddress ? (
            <View ref={unitFieldRef} collapsable={false} style={styles.fieldGroup}>
              <Text style={styles.inputText}>
                {t("onboarding.officeAddress")}
                <Text style={styles.requiredMark}> *</Text>
              </Text>
              <View style={[styles.inputBox, showError("officeAddress", liveErrors) && styles.inputError]}>
                <LocaleTextInput
                  style={fieldTextStyle}
                  placeholder={t("onboarding.officeAddressPlaceholder")}
                  placeholderTextColor={PLACEHOLDER_COLOR}
                  value={officeAddress}
                  onChangeText={(text) => {
                    setOfficeAddress(applyCharacterLimit(officeAddress, text, officeMax));
                    clearError("officeAddress");
                  }}
                  onBlur={() => touch("officeAddress")}
                  onFocus={() => handleFieldFocus(unitFieldRef)}
                  maxLength={officeAddress.length > officeMax ? undefined : officeMax}
                  underlineColorAndroid="transparent"
                  textAlignVertical="center"
                />
              </View>
              <Text style={styles.helperText}>{t("onboarding.officeAddressHint")}</Text>
              {showError("officeAddress", liveErrors) ? <Text style={styles.errorText}>{showError("officeAddress", liveErrors)}</Text> : null}
            </View>
            ) : null}

            {showUnitNumber ? (
            <View ref={unitFieldRef} collapsable={false} style={styles.fieldGroup}>
              <UnitPickerField
                label={
                  isGuestProfile
                    ? t("onboarding.unitNumber")
                    : `${t("onboarding.unitNumber")} *`
                }
                value={String(unitNumber ?? "")}
                disabled={isEditMode}
                placeholder={t("onboarding.unitPlaceholder")}
                unitMax={unitMax}
                error={!isEditMode && showError("unitNumber", liveErrors) ? showError("unitNumber", liveErrors) : undefined}
                onBlur={() => {
                  if (!isEditMode) touch("unitNumber");
                }}
                onChange={(text) => {
                  if (isEditMode) return;
                  setUnitNumber(applyCharacterLimit(unitNumber, text, unitMax));
                  clearError("unitNumber");
                }}
                loadUnits={
                  communityId && !isCommunityAdminProfile
                    ? async () => {
                        const rows = await fetchCommunityUnits(Number(communityId));
                        return (rows ?? []).map((unit) => ({
                          id: unit.id,
                          unit_number: unit.unit_number,
                          resident_count: unit.resident_count ?? 0,
                        }));
                      }
                    : async () => []
                }
                createUnit={
                  communityId && !isCommunityAdminProfile
                    ? async (num) => createCommunityUnit(Number(communityId), num)
                    : undefined
                }
              />
              {!isEditMode ? (
                <Text style={styles.helperText}>
                  First resident on a new unit becomes the billing contact. Joining an existing unit does not change the contact.
                </Text>
              ) : null}
            </View>
            ) : null}

            {showFamilyNumberField && !isGuestProfile ? (
              <View style={styles.fieldGroup}>
                <View style={styles.familyLabelRow}>
                  <Text style={styles.inputText}>{t("onboarding.family")}</Text>
                  {familyStatusHydrating || (familyNumberLoading && !familyNumberLocked) ? (
                    <ActivityIndicator size="small" color={T.navy} />
                  ) : null}
                </View>
                <Text style={styles.fieldHint}>
                  {t("onboarding.familyHint")}
                </Text>

                {!familyNumberLocked ? (
                  <>
                    <View style={styles.familyModeRow}>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        disabled={familyNumberLoading}
                        style={[
                          styles.familyModeCard,
                          familyMode === "create" && styles.familyModeCardActive,
                          familyNumberLoading && familyMode !== "create" && { opacity: 0.7 },
                        ]}
                        onPress={() => selectFamilyMode("create")}
                      >
                        <View
                          style={[
                            styles.familyModeIconWrap,
                            familyMode === "create" && styles.familyModeIconWrapActive,
                          ]}
                        >
                          {familyMode === "create" && familyNumberLoading ? (
                            <ActivityIndicator size="small" color={T.teal} />
                          ) : (
                            <Users
                              size={20}
                              color={familyMode === "create" ? T.teal : T.gray}
                              strokeWidth={2}
                            />
                          )}
                        </View>
                        <Text style={styles.typeTitle}>{t("onboarding.createMyFamily")}</Text>
                        <Text style={styles.typeSubTitle}>{t("onboarding.becomeFamilyHead")}</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={0.85}
                        disabled={familyNumberLoading}
                        style={[
                          styles.familyModeCard,
                          familyMode === "join" && styles.familyModeCardActive,
                          familyNumberLoading && familyMode !== "join" && { opacity: 0.7 },
                        ]}
                        onPress={() => selectFamilyMode("join")}
                      >
                        <View
                          style={[
                            styles.familyModeIconWrap,
                            familyMode === "join" && styles.familyModeIconWrapActive,
                          ]}
                        >
                          <UserPlus
                            size={20}
                            color={familyMode === "join" ? T.teal : T.gray}
                            strokeWidth={2}
                          />
                        </View>
                        <Text style={styles.typeTitle}>{t("onboarding.joinFamily")}</Text>
                        <Text style={styles.typeSubTitle}>{t("onboarding.requestToJoin")}</Text>
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                      activeOpacity={0.85}
                      disabled={familyNumberLoading}
                      style={[
                        styles.familySkipCard,
                        familyMode === "skip" && styles.familySkipCardActive,
                        familyNumberLoading && familyMode !== "skip" && { opacity: 0.7 },
                      ]}
                      onPress={() => selectFamilyMode("skip")}
                    >
                      <View
                        style={[
                          styles.familySkipIconWrap,
                          familyMode === "skip" && styles.familySkipIconWrapActive,
                        ]}
                      >
                        <Ionicons
                          name="time-outline"
                          size={20}
                          color={familyMode === "skip" ? T.teal : T.gray}
                        />
                      </View>
                      <View style={styles.familySkipCopy}>
                        <Text
                          style={[
                            styles.familySkipTitle,
                            familyMode === "skip" && styles.familySkipTitleActive,
                          ]}
                        >
                          {t("onboarding.skipForNow")}
                        </Text>
                        <Text style={styles.typeSubTitle}>
                          {t("onboarding.skipFamilyContinue")}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </>
                ) : null}

                {familyMode !== "skip" ? (
                  <>
                {familyJoinPending && familyNumberLocked ? (
                  <View style={styles.familyPendingBanner}>
                    <Ionicons name="time-outline" size={18} color="#B45309" />
                    <View style={styles.familyPendingCopy}>
                      <Text style={styles.familyPendingTitle}>{t("onboarding.pendingApproval")}</Text>
                      <Text style={styles.familyPendingText}>
                        {t("onboarding.pendingApprovalMsg")}
                      </Text>
                    </View>
                  </View>
                ) : null}

                <View ref={familyFieldRef} collapsable={false} style={styles.familyNumberSection}>
                <View style={styles.familyLabelRow}>
                  <Text style={styles.inputText}>
                    {familyMode === "join" ? (
                      <>
                        {t("onboarding.enterFamilyNumber")} <Text style={styles.requiredMark}>*</Text>
                      </>
                    ) : (
                      t("onboarding.familyNumber")
                    )}
                  </Text>
                  {familyMode === "create" && !familyNumberLocked ? (
                    <TouchableOpacity
                      onPress={regenerateFamilyNumber}
                      disabled={familyNumberLoading}
                      hitSlop={8}
                    >
                      <Text style={styles.familyRegenerateText}>{t("onboarding.refresh")}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                <View style={styles.familyInputWrap}>
                  <View
                    style={[
                      styles.inputBox,
                      (familyNumberError || showError("familyNumber", liveErrors)) && styles.inputError,
                      familyNumberLocked && styles.inputReadOnly,
                    ]}
                  >
                    <LocaleTextInput
                      style={[familyFieldTextStyle, familyNumberLocked && styles.familyInputLockedText]}
                      placeholder={familyMode === "join" ? t("onboarding.enterFamilyNumber") : "FAM-XXXXXX"}
                      placeholderTextColor={PLACEHOLDER_COLOR}
                      value={familyNumber}
                      onChangeText={(text) => {
                        if (familyNumberLocked) return;
                        setFamilyNumber(text.toUpperCase());
                        clearError("familyNumber");
                        setFamilyNumberError(null);
                      }}
                      onBlur={handleFamilyNumberBlur}
                      onFocus={() => handleFieldFocus({ familyField: true })}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      maxLength={30}
                      editable={!familyNumberLocked && !familyNumberLoading}
                      underlineColorAndroid="transparent"
                      textAlignVertical="center"
                    />
                  </View>
                  {familyNumberLoading || familyNumberChecking ? (
                    <ActivityIndicator size="small" color={T.navy} style={styles.familyInputSpinner} />
                  ) : null}
                </View>
                <Text style={styles.helperText}>
                  {familyNumberLocked
                    ? familyJoinPending
                      ? t("onboarding.joinRequestPending")
                      : t("onboarding.savedFamilyNumber")
                    : familyMode === "join"
                      ? t("onboarding.enterFamilyNumberJoinHint")
                      : t("onboarding.familyNumberCreateHint")}
                </Text>
                {familyNumberError || showError("familyNumber", liveErrors) ? (
                  <Text style={styles.errorText}>
                    {familyNumberError || showError("familyNumber", liveErrors)}
                  </Text>
                ) : null}
                </View>
                  </>
                ) : (
                  <View style={styles.familySkipSelectedBanner}>
                    <View style={styles.familySkipBannerIconWrap}>
                      <Ionicons name="checkmark-circle" size={22} color={T.teal} />
                    </View>
                    <View style={styles.familySkipBannerCopy}>
                      <Text style={styles.familySkipBannerTitle}>{t("onboarding.familySetupSkipped")}</Text>
                      <Text style={styles.familySkipBannerText}>
                        {t("onboarding.familySetupSkippedMsg")}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            ) : null}

          {showResidenceType ? (
          <View style={styles.fieldGroup}>
            <Text style={styles.inputText}>
              {t("onboarding.iAmA")} <Text style={styles.requiredMark}>*</Text>
            </Text>

            <View style={styles.residenceRow}>
              <TouchableOpacity
                activeOpacity={0.85}
                style={[
                  styles.typeCard,
                  residenceType === "homeowner" && styles.typeCardActive,
                ]}
                onPress={() => {
                  setResidenceType("homeowner");
                  touch("residenceType");
                  clearError("residenceType");
                }}
              >
                <Ionicons
                  name="home-outline"
                  size={26}
                  color={residenceType === "homeowner" ? T.navy : T.gray}
                  style={styles.roleIcon}
                />
                <Text style={styles.typeTitle}>{t("onboarding.homeowner")}</Text>
                <Text style={styles.typeSubTitle}>{t("onboarding.iOwnUnit")}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                style={[
                  styles.typeCard,
                  residenceType === "tenant" && styles.typeCardActive,
                ]}
                onPress={() => {
                  setResidenceType("tenant");
                  touch("residenceType");
                  clearError("residenceType");
                }}
              >
                <Ionicons
                  name="person-outline"
                  size={26}
                  color={residenceType === "tenant" ? T.navy : T.gray}
                  style={styles.roleIcon}
                />
                <Text style={styles.typeTitle}>{t("onboarding.tenant")}</Text>
                <Text style={styles.typeSubTitle}>{t("onboarding.iRentUnit")}</Text>
              </TouchableOpacity>
            </View>
            {showError("residenceType", liveErrors) ? (
              <Text style={styles.errorText}>{showError("residenceType", liveErrors)}</Text>
            ) : null}
          </View>
          ) : null}

          {showUtilityBill ? (
          <View style={styles.fieldGroup}>
            <Text style={utilityUploadLabelStyle}>
              {utilityUploadLabel(t, i18n.language)}{" "}
              {!isEditMode || !existingUtilityBillUrl ? (
                <Text style={styles.requiredMark}>*</Text>
              ) : null}
            </Text>

            <TouchableOpacity
              style={[
                styles.uploadBox,
                selectedFile || existingUtilityBillUrl ? styles.uploadBoxFilled : null,
                showError("utilityFile", liveErrors) && styles.uploadBoxError,
              ]}
              activeOpacity={0.85}
              onPress={() => {
                pickImage(
                  (file) => {
                    setSelectedFile(file);
                    touch("utilityFile");
                    clearError("utilityFile");
                  },
                  {
                    allowCamera: true,
                    allowFile: false,
                    documentPick: true,
                    uploadBaseName: "utility-bill",
                    promptTitle: t("onboarding.uploadDocument"),
                    promptMessage: t("onboarding.uploadDocumentMsg"),
                    showError: (title, message) => dialog.showError(title, message),
                  },
                );
              }}
            >
              {selectedFile ? (
                isPdfAsset(selectedFile) ? (
                  <View style={styles.uploadPdfPreview}>
                    <Ionicons name="document-text-outline" size={40} color={T.navy} />
                    <Text style={styles.uploadText}>
                      {selectedFile.fileName || t("onboarding.documentPdf")}
                    </Text>
                  </View>
                ) : (
                  <Image
                    source={{ uri: selectedFile.uri }}
                    style={[styles.uploadPreviewImage]}
                    contentFit="contain"
                  />
                )
              ) : existingUtilityBillUrl ? (
                isPdfAsset({ uri: existingUtilityBillUrl }) ? (
                  <View style={styles.uploadPdfPreview}>
                    <Ionicons name="document-text-outline" size={40} color={T.navy} />
                    <Text style={styles.uploadText}>{t("onboarding.uploadedDocument")}</Text>
                  </View>
                ) : (
                  <Image
                    source={{ uri: existingUtilityBillUrl }}
                    style={[styles.uploadPreviewImage]}
                    contentFit="contain"
                  />
                )
              ) : (
                <>
                  <Image
                    source={require("../../../assets/images/download-image-icon.png")}
                    style={{ width: 32, height: 32 }}
                  />
                  <Text style={styles.uploadText}>{t("onboarding.uploadFile")}</Text>
                  <Text style={styles.helperText}>
                    {t("onboarding.dragDropHint") + " "}
                    <Text style={styles.uploadLink}>{t("onboarding.uploadFile")}</Text>
                  </Text>
                </>
              )}
            </TouchableOpacity>
            {showError("utilityFile", liveErrors) ? (
              <Text style={styles.errorText}>{showError("utilityFile", liveErrors)}</Text>
            ) : null}

            {!hideUtilityVerificationDelay ? (
              <Text style={styles.helperText}>
                {t("onboarding.verificationDelay")}
              </Text>
            ) : null}
          </View>
          ) : null}
          </View>
          </>
          ) : null}
        </View>
      </KeyboardSafeScreen>
    </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: T.canvas,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 2,
    paddingBottom: 12,
  },
  headerTitle: {
    flex: 1,
    minWidth: 0,
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: 17,
    lineHeight: 26,
    color: T.navy,
    includeFontPadding: true,
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
  },
  backText: {
    fontFamily: Fonts.medium,
    fontSize: 16,
    lineHeight: 22,
    color: T.gray,
  },
  content: {
    paddingTop: 4,
    paddingBottom: 8,
    flexDirection: "column",
    gap: 20,
  },
  scrollContainer: {
    paddingHorizontal: 24,
  },
  footer: {
    paddingHorizontal: 24,
  },
  subHeading: {
    fontFamily: Fonts.regular,
    fontWeight: "400",
    fontSize: 13,
    lineHeight: 18,
    color: T.gray,
  },
  subHeadingBold: {
    fontFamily: Fonts.semiBold,
    color: T.navy,
    fontWeight: "600",
  },
  stepHint: {
    marginTop: 6,
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: T.gray,
  },
  upcomingDot: {
    width: 24,
    height: 24,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(229, 231, 235, 1)",
  },
  upcomingDotText: {
    color: "rgba(106, 114, 130, 1)",
    fontFamily: Fonts.bold,
    fontSize: 10,
    lineHeight: 15,
    fontWeight: "700",
  },
  infoBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: T.mint,
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.22)",
  },
  infoBannerText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    color: T.navy,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  progressItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  doneDot: {
    width: 24,
    height: 24,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: T.teal,
  },
  currentDot: {
    width: 24,
    height: 24,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: T.navy,
  },
  currentDotText: {
    color: "rgba(255, 255, 255, 1)",
    fontFamily: Fonts.bold,
    fontSize: 10,
    lineHeight: 15,
    fontWeight: "700",
  },
  progressLine: {
    flex: 1,
    height: 1,
    backgroundColor: T.border,
    marginHorizontal: 8,
  },
  progressTextMuted: {
    fontFamily: Fonts.medium,
    fontSize: 11,
    color: T.gray,
    lineHeight: 15,
    fontWeight: "400",
  },
  progressTextActive: {
    fontFamily: Fonts.semiBold,
    fontSize: 11,
    color: T.navy,
    fontWeight: "600",
  },
  form: {
    flexDirection: "column",
    gap: 20,
  },
  fieldGroup: {
    flexDirection: "column",
    gap: 8,
  },
  fieldHint: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: T.gray,
  },
  inputText: {
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    color: T.navy,
  },
  requiredMark: {
    color: "#E11D48",
  },
  inputBox: {
    height: 52,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 12,
    backgroundColor: T.white,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  inputBoxDisabled: {
    backgroundColor: T.canvas,
    borderColor: T.border,
  },
  inputTextDisabled: {
    color: T.gray,
  },
  familyNumberSection: {
    marginTop: 14,
    flexDirection: "column",
    gap: 8,
  },
  familyLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  familyModeRow: {
    flexDirection: "row",
    gap: 10,
  },
  familyModeCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 14,
    backgroundColor: T.white,
    padding: 14,
  },
  familyModeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: T.canvas,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.15)",
  },
  familyModeIconWrapActive: {
    backgroundColor: T.mint,
    borderColor: "rgba(20, 184, 166, 0.35)",
  },
  familyModeCardActive: {
    borderColor: T.teal,
    backgroundColor: T.mint,
  },
  familySkipCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(20, 184, 166, 0.4)",
    borderRadius: 14,
    backgroundColor: T.canvas,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  familySkipCardActive: {
    borderStyle: "solid",
    borderColor: T.teal,
    backgroundColor: T.mint,
  },
  familySkipIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: T.white,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.22)",
  },
  familySkipIconWrapActive: {
    backgroundColor: T.white,
    borderColor: "rgba(20, 184, 166, 0.45)",
  },
  familySkipTitle: {
    fontFamily: Fonts.bold,
    fontSize: 14,
    lineHeight: 19,
    color: T.navy,
    fontWeight: "700",
  },
  familySkipTitleActive: {
    color: T.navy,
  },
  familySkipCopy: {
    flex: 1,
    minWidth: 0,
  },
  familySkipSelectedBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: T.canvas,
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.22)",
  },
  familySkipBannerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: T.mint,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.2)",
  },
  familySkipBannerCopy: {
    flex: 1,
    minWidth: 0,
  },
  familySkipBannerTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: T.navy,
    fontWeight: "600",
  },
  familySkipBannerText: {
    marginTop: 4,
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: T.gray,
  },
  familyPendingBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  familyPendingCopy: {
    flex: 1,
    minWidth: 0,
  },
  familyPendingTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    color: "#B45309",
  },
  familyPendingText: {
    marginTop: 4,
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: "#92400E",
  },
  familyRegenerateText: {
    fontFamily: Fonts.semiBold,
    fontSize: 12,
    color: T.teal,
  },
  familyInputWrap: {
    position: "relative",
  },
  familyInputLockedText: {
    color: "#475569",
  },
  familyInputSpinner: {
    position: "absolute",
    end: 14,
    top: 20,
  },
  inputReadOnly: {
    backgroundColor: "rgba(243, 244, 246, 1)",
    color: "#475569",
  },
  textAreaBox: {
    minHeight: 112,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 12,
    backgroundColor: T.white,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    position: "relative",
    justifyContent: "flex-start",
  },
  bioPlaceholder: {
    position: "absolute",
    top: 12,
    left: 16,
    right: 16,
    fontFamily: Fonts.regular,
    fontSize: 14,
    color: PLACEHOLDER_COLOR,
    includeFontPadding: false,
  },
  residenceRow: {
    flexDirection: "row",
    gap: 10,
  },
  typeCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 14,
    backgroundColor: T.white,
    padding: 16,
  },
  typeCardActive: {
    borderColor: T.teal,
    backgroundColor: T.mint,
  },
  typeEmoji: {
    fontSize: 24,
    marginBottom: 8,
  },
  roleIcon: {
    marginBottom: 8,
  },
  typeTitle: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    lineHeight: 18,
    color: T.navy,
    fontWeight: "700",
  },
  typeSubTitle: {
    marginTop: 3,
    fontFamily: Fonts.medium,
    fontSize: 11,
    lineHeight: 15,
    color: T.gray,
  },
  uploadBox: {
    minHeight: 140,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: T.border,
    borderRadius: 12,
    backgroundColor: T.white,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
    paddingHorizontal: 28,
  },
  uploadBoxFilled: {
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderStyle: "solid",
    overflow: "hidden",
  },
  uploadPreviewImage: {
    width: "100%",
    minHeight: 140,
    height: 180,
  },
  uploadPdfPreview: {
    width: "100%",
    minHeight: 140,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
  },
  uploadText: {
    marginTop: 6,
    fontFamily: Fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: T.gray,
    textAlign: "center",
  },
  uploadLink: {
    color: T.teal,
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
  },
  helperText: {
    fontFamily: Fonts.regular,
    fontSize: 11,
    lineHeight: 15,
    color: T.gray,
  },
  buttonContainer: {
    flexDirection: "column",
    gap: 14,
  },
  button: {
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonActive: {
    backgroundColor: B.cta,
  },
  buttonDisabled: {
    backgroundColor: T.border,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    color: T.white,
    fontFamily: Fonts.bold,
  },
  secondaryButton: {
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(229, 231, 235, 0.5)",
    backgroundColor: "rgba(242, 244, 247, 1)",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    color: "rgba(54, 65, 83, 1)",
    fontFamily: Fonts.semiBold,
  },
  footerHint: {
    marginTop: 12,
    fontFamily: Fonts.regular,
    fontSize: 11,
    lineHeight: 15,
    color: T.gray,
    textAlign: "center",
  },
  inputError: {
    borderColor: "#DC2626",
  },
  uploadBoxError: {
    borderColor: "#DC2626",
  },
  errorText: {
    marginTop: 4,
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 16,
    color: "#DC2626",
  },
});
