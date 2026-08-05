import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Fonts } from "../../../constants/font";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { UserPlus, Users } from "lucide-react-native";
import BackButton from "../../../components/ui/back-button";
import { Image } from "expo-image";
import { pickImage } from "../../../utils/pickImage";
import { updateProfile, joinCommunity, fetchMe } from "../../../services/auth-api";
import {
  checkFamilyNumberAvailability,
  ensureMyFamily,
  fetchMyFamily,
  fetchSuggestedFamilyNumber,
  requestJoinFamily,
} from "../../../services/family-api";
import { uploadUtilityBill } from "../../../services/profile-api";
import { finishOnboarding, Routes, goToPendingFamily } from "../../../constants/onboarding-routes";
import { isGuestUser } from "../../../services/community-access";
import { showApiFailure } from "../../../utils/auth-errors";
import { useAppDialog } from "../../../providers/app-dialog-provider";
import AuthSuccessOverlay from "../../../components/ui/auth-success-overlay";
import { isAuthenticated } from "../../../services/auth-session";
import { useSubmitLock } from "../../../hooks/use-submit-lock";
import { useTouchedFieldErrors } from "../../../hooks/use-touched-field-errors";
import { hasFieldErrors, LIMITS, validateCompleteProfileForm } from "../../../utils/form-validation";
import { getProfileFields, isPlaceholderDisplayName } from "../../../utils/profile-display";
import ScreenStatusBar from "../../../components/layout/screen-status-bar";
import KeyboardSafeScreen from "../../../components/layout/keyboard-safe-screen";
import { HomeTheme as T } from "../../../constants/home-theme";
import { ScreenBrand as B } from "../../../constants/screen-brand";

function isPdfAsset(asset) {
  const mime = String(asset?.mimeType ?? "").toLowerCase();
  const uri = String(asset?.uri ?? "").toLowerCase();
  return mime === "application/pdf" || uri.endsWith(".pdf");
}

export default function CompleteProfile() {
  const dialog = useAppDialog();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [bio, setBio] = useState("");
  const [unitNumber, setUnitNumber] = useState("");
  const [familyNumber, setFamilyNumber] = useState("");
  const [familyNumberError, setFamilyNumberError] = useState(null);
  const [familyNumberChecking, setFamilyNumberChecking] = useState(false);
  const [familyNumberLoading, setFamilyNumberLoading] = useState(false);
  const [familyNumberLocked, setFamilyNumberLocked] = useState(false);
  /** @type {['create' | 'join' | 'skip', Function]} */
  const [familyMode, setFamilyMode] = useState("create");
  const [residenceType, setResidenceType] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const { touch, clearError, showError, validateOnSubmit } = useTouchedFieldErrors();
  const [existingUtilityBillUrl, setExistingUtilityBillUrl] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [isGuestProfile, setIsGuestProfile] = useState(false);

  const { submitting, run } = useSubmitLock();
  const [showSuccess, setShowSuccess] = useState(false);
  const [savedUser, setSavedUser] = useState(null);
  const [generatedFamilyNumber, setGeneratedFamilyNumber] = useState(null);
  const [familyJoinPending, setFamilyJoinPending] = useState(false);
  const router = useRouter();
  const {
    role = "resident",
    regionId,
    communityId,
    communityName = "Oak Valley Residences",
    communityRequest,
    mode,
    familyMode: familyModeParam,
  } = useLocalSearchParams();

  const isEditMode = mode === "edit";

  const isCommunityRequest = communityRequest === "1";
  const isAdminClaim = role === "admin" && Boolean(communityId) && !isCommunityRequest;
  const isResidentJoin = !isCommunityRequest && role !== "admin" && Boolean(communityId);
  const showFamilyNumberField = role !== "admin" && !isCommunityRequest;

  const scrollRef = useRef(null);
  const familyCheckSeq = useRef(0);

  useEffect(() => {
    if (familyModeParam === "create" || familyModeParam === "join") {
      setFamilyMode(familyModeParam);
    }
  }, [familyModeParam]);

  useEffect(() => {
    if (!showFamilyNumberField || isGuestProfile) return undefined;

    let cancelled = false;

    (async () => {
      setFamilyNumberLoading(true);
      try {
        const mine = await fetchMyFamily();
        if (cancelled) return;

        if (mine.state === "pending") {
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

        if (mine.family?.family_number) {
          setFamilyMode("create");
          setFamilyNumber(mine.family.family_number);
          if (isEditMode) {
            setFamilyNumberLocked(true);
          }
          if (isEditMode) return;
        }

        if (isEditMode) return;

        if (familyModeParam === "join") {
          setFamilyMode("join");
          setFamilyNumber("");
          return;
        }

        const suggested = await fetchSuggestedFamilyNumber();
        if (!cancelled && suggested.family_number) {
          setFamilyMode(familyModeParam === "join" ? "join" : "create");
          setFamilyNumber(suggested.family_number);
        }
      } catch {
        if (!cancelled && !isEditMode) {
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
        if (!cancelled) setFamilyNumberLoading(false);
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
            setFamilyNumberError(result.message || "This Family Number already exists.");
          } else {
            setFamilyNumberError(null);
          }
        } else {
          // Join mode — number must already exist.
          if (result.available) {
            setFamilyNumberError("Family Number not found.");
          } else if (result.message && !/already (exists|taken)/i.test(result.message)) {
            setFamilyNumberError(result.message);
          } else {
            setFamilyNumberError(null);
          }
        }
      } catch {
        if (seq === familyCheckSeq.current) {
          setFamilyNumberError("Could not verify this family number.");
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
      setFamilyNumberError("Could not generate a family number. Try again.");
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
      setFamilyNumberError("Could not generate a new family number.");
    } finally {
      setFamilyNumberLoading(false);
    }
  };

  const selectFamilyMode = async (mode) => {
    if (familyNumberLocked || mode === familyMode) return;
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
    } catch {
      setFamilyNumberError("Could not generate a family number. Try again.");
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
        setIsGuestProfile(isGuestUser(user));
        const fields = getProfileFields(user);
        setName(isPlaceholderDisplayName(fields.displayName) ? "" : fields.displayName);
        setEmail(fields.displayEmail ?? "");
        setBio(fields.bio ?? "");
        setUnitNumber(fields.unitNumber ?? "");
        setResidenceType(user.profile?.residence_type ?? user.residence_type ?? "");
        setExistingUtilityBillUrl(fields.utilityBillUrl);
      } catch (err) {
        if (!cancelled && isEditMode) {
          await showApiFailure(dialog, "Could not load profile", err);
          router.back();
        }
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEditMode, router, dialog]);

  const liveErrors = useMemo(
    () =>
      validateCompleteProfileForm({
        name,
        email,
        bio,
        unitNumber,
        residenceType,
        utilityFile: selectedFile ?? (existingUtilityBillUrl ? { uri: existingUtilityBillUrl } : null),
        requireUtilityFile: !isGuestProfile && ((!isEditMode && familyModeParam !== "create") || !existingUtilityBillUrl),
        guestMode: isGuestProfile,
      }),
    [name, email, bio, unitNumber, residenceType, selectedFile, existingUtilityBillUrl, isEditMode, isGuestProfile, familyModeParam],
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
            ? "Enter the Family Number from your Family Head."
            : "Family Number is required.",
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
          !isGuestProfile &&
          selectedFile?.uri &&
          !/^https?:\/\//i.test(selectedFile.uri);

        if (isLocalUpload) {
          await uploadUtilityBill(selectedFile.uri, selectedFile);
        }

        const profileResult = await updateProfile({
          display_name: name.trim(),
          email: email.trim().toLowerCase(),
          bio: bio.trim(),
          unit_number: unitNumber.trim(),
          ...(isGuestProfile
            ? {}
            : {
                residence_type: residenceType,
                ...(regionId ? { region_id: Number(regionId) } : {}),
              }),
        });

        if (!isEditMode && communityId && !isCommunityRequest) {
          await joinCommunity(Number(communityId));
        }

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
              await showApiFailure(dialog, "Family number required", {
                message: "We could not generate a family number. Check your connection and try again.",
              });
              return;
            }

            if (familyNumberError) {
              await showApiFailure(dialog, "Invalid family number", {
                message: familyNumberError,
              });
              return;
            }

            try {
              const family = await ensureMyFamily(numberToSave);
              savedFamilyNumber = family?.family_number ?? numberToSave;
            } catch (err) {
              await showApiFailure(dialog, "Could not create family", err);
              return;
            }
          } else {
            if (!numberToSave) {
              await showApiFailure(dialog, "Family Number required", {
                message: "Enter the Family Number shared by your Family Head.",
              });
              return;
            }

            if (familyNumberError) {
              await showApiFailure(dialog, "Invalid family number", {
                message: familyNumberError,
              });
              return;
            }

            try {
              await requestJoinFamily(numberToSave);
              savedFamilyNumber = numberToSave;
              joinPending = true;
            } catch (err) {
              await showApiFailure(dialog, "Could not send join request", err);
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

        setGeneratedFamilyNumber(savedFamilyNumber);
        setFamilyJoinPending(joinPending);
        if (isEditMode) {
          setSavedUser(user);
          setShowSuccess(true);
          return;
        }

        setShowSuccess(true);
        setSavedUser(user);
      } catch (err) {
        await showApiFailure(dialog, "Unable to complete profile", err);
      }
    });


  return (
    <>
      <ScreenStatusBar style="dark" opaque androidBackgroundColor={T.canvas} />
      <AuthSuccessOverlay
        visible={showSuccess}
        title={
          isEditMode
            ? "Profile updated!"
            : isAdminClaim || isCommunityRequest
              ? "Application submitted!"
              : isResidentJoin
                ? "Profile submitted!"
                : "Profile saved!"
        }
        subtitle={
          isEditMode
            ? "Your profile changes have been saved."
            : isCommunityRequest
              ? role === "admin"
                ? "A system administrator must approve your account and community before you get full access."
                : "We'll notify you when your community is approved"
              : isAdminClaim
                ? "A system administrator must approve your account before you can manage this community."
                : familyJoinPending
                  ? "Your family join request was sent. You'll wait for Family Head approval before community admin review."
                  : isResidentJoin
                    ? familyMode === "skip"
                      ? "Your membership request was sent. You can set up a family anytime from My Family after you're approved."
                      : generatedFamilyNumber
                        ? `Your membership request was sent. Your family number ${generatedFamilyNumber} is ready in My Family — you are the Family Head.`
                        : "Your community admin will review your membership request. You'll get access once approved."
                    : familyMode === "skip"
                      ? "Welcome! You can create or join a family anytime from My Family."
                      : generatedFamilyNumber
                        ? `Welcome! Your family number ${generatedFamilyNumber} is ready in My Family — you are the Family Head.`
                        : "Welcome to your community"
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
    <SafeAreaView style={styles.container} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.headerRow}>
        <BackButton iconOnly compact />
        <Text style={styles.headerTitle} numberOfLines={1}>
          {isEditMode ? "Edit Profile" : "Complete Your Profile"}
        </Text>
      </View>

      <KeyboardSafeScreen
        scrollRef={scrollRef}
        keyboardAvoiding={false}
        footerBorderless
        footerStyle={styles.footer}
        contentContainerStyle={styles.scrollContainer}
        keyboardFieldGap={20}
        scrollProps={
          Platform.OS === "android"
            ? { automaticallyAdjustKeyboardInsets: false }
            : undefined
        }
        footer={
          !profileLoading ? (
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
                        ? "Save Changes"
                        : isCommunityRequest || isAdminClaim
                          ? "Save & continue"
                          : isResidentJoin
                            ? "Submit for approval"
                            : "Join Community"}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>

              <Text style={styles.footerHint}>
                By continuing you agree to our Terms of Service & Privacy Policy
              </Text>
            </View>
          ) : null
        }
      >
        <View style={styles.content}>
          <View>
            <Text style={styles.subHeading}>
              {isEditMode
                ? isGuestProfile
                  ? "Update your guest profile details."
                  : "Update your name, email, bio, and verification documents."
                : isCommunityRequest && role === "admin"
                  ? "Registering "
                  : isAdminClaim
                    ? "Applying to manage "
                    : isResidentJoin
                      ? "Almost there — complete your profile for "
                      : "Joining "}
              {!isEditMode ? (
                <Text style={styles.subHeadingBold}>{communityName}</Text>
              ) : null}
            </Text>
            {isResidentJoin && !isEditMode ? (
              <Text style={styles.stepHint}>
                {familyMode === "skip"
                  ? "After you submit, your community admin will review your membership. You can set up a family later from My Family."
                  : familyMode === "join"
                    ? "After you submit, your Family Head reviews first — then your community admin."
                    : "After you submit, your community admin will review and approve your request."}
              </Text>
            ) : null}
          </View>

          {!isEditMode ? (
          <View style={styles.progressRow}>
            <View style={styles.progressItem}>
              <View style={styles.doneDot}>
                <Ionicons name="checkmark" size={12} color="#FFFFFF" />
              </View>
              <Text style={styles.progressTextMuted}>Join</Text>
            </View>

            <View style={styles.progressLine} />

            <View style={styles.progressItem}>
              <View style={styles.doneDot}>
                <Ionicons name="checkmark" size={12} color="#FFFFFF" />
              </View>
              <Text style={styles.progressTextMuted}>Phone</Text>
            </View>

            <View style={styles.progressLine} />

            <View style={styles.progressItem}>
              <View style={styles.doneDot}>
                <Ionicons name="checkmark" size={12} color="#FFFFFF" />
              </View>
              <Text style={styles.progressTextMuted}>Verified</Text>
            </View>

            <View style={styles.progressLine} />

            <View style={styles.progressItem}>
              <View style={styles.currentDot}>
                <Text style={styles.currentDotText}>4</Text>
              </View>
              <Text style={styles.progressTextActive}>Profile</Text>
            </View>
          </View>
          ) : null}

          {isResidentJoin && !isEditMode ? (
            <View style={styles.infoBanner}>
              <Ionicons name="information-circle-outline" size={18} color={T.deepTeal} />
              <Text style={styles.infoBannerText}>
                Your details help the community admin verify you live in {communityName}.
              </Text>
            </View>
          ) : null}

          {profileLoading ? (
            <ActivityIndicator size="large" color={T.teal} style={{ marginVertical: 24 }} />
          ) : null}

          {!profileLoading ? (
          <>
          <View style={styles.form}>
            <View style={styles.fieldGroup}>
              <Text style={styles.inputText}>
                Full Name <Text style={styles.requiredMark}>*</Text>
              </Text>
              <TextInput
                style={[styles.input, showError("name", liveErrors) && styles.inputError]}
                placeholder="e.g. Alex Turner"
                placeholderTextColor={T.gray}
                value={name}
                onChangeText={(text) => {
                  setName(text);
                  clearError("name");
                }}
                onBlur={() => touch("name")}
                maxLength={LIMITS.profileName}
              />
              {showError("name", liveErrors) ? <Text style={styles.errorText}>{showError("name", liveErrors)}</Text> : null}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.inputText}>
                Email Address <Text style={styles.requiredMark}>*</Text>
              </Text>
              <TextInput
                style={[styles.input, showError("email", liveErrors) && styles.inputError]}
                placeholder="you@example.com"
                placeholderTextColor={T.gray}
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  clearError("email");
                }}
                onBlur={() => touch("email")}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                maxLength={LIMITS.profileEmail}
              />
              {showError("email", liveErrors) ? <Text style={styles.errorText}>{showError("email", liveErrors)}</Text> : null}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.inputText}>Bio</Text>
              <TextInput
                style={[styles.input, styles.textArea, showError("bio", liveErrors) && styles.inputError]}
                placeholder="Tell neighbors a little about yourself (optional)"
                placeholderTextColor={T.gray}
                value={bio}
                onChangeText={(text) => {
                  setBio(text);
                  clearError("bio");
                }}
                onBlur={() => touch("bio")}
                multiline
                textAlignVertical="top"
                maxLength={LIMITS.profileBio}
              />
              <Text style={styles.helperText}>{bio.length}/{LIMITS.profileBio} characters</Text>
              {showError("bio", liveErrors) ? <Text style={styles.errorText}>{showError("bio", liveErrors)}</Text> : null}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.inputText}>
                Unit / Apartment Number
                {!isGuestProfile ? <Text style={styles.requiredMark}> *</Text> : null}
              </Text>
              <TextInput
                style={[styles.input, showError("unitNumber", liveErrors) && styles.inputError]}
                placeholder="e.g. Unit 204 or 2345 Oak Valley Dr"
                placeholderTextColor={T.gray}
                value={unitNumber}
                onChangeText={(text) => {
                  setUnitNumber(text);
                  clearError("unitNumber");
                }}
                onBlur={() => touch("unitNumber")}
                maxLength={LIMITS.profileUnit}
              />
              {showError("unitNumber", liveErrors) ? <Text style={styles.errorText}>{showError("unitNumber", liveErrors)}</Text> : null}
            </View>

            {showFamilyNumberField && !isGuestProfile ? (
              <View style={styles.fieldGroup}>
                <Text style={styles.inputText}>Family</Text>
                <Text style={styles.fieldHint}>
                  Create a household, join one with a Family Number, or skip and set up family later.
                </Text>

                {!familyNumberLocked ? (
                  <>
                    <View style={styles.familyModeRow}>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        style={[
                          styles.familyModeCard,
                          familyMode === "create" && styles.familyModeCardActive,
                        ]}
                        onPress={() => selectFamilyMode("create")}
                      >
                        <View
                          style={[
                            styles.familyModeIconWrap,
                            familyMode === "create" && styles.familyModeIconWrapActive,
                          ]}
                        >
                          <Users
                            size={20}
                            color={familyMode === "create" ? T.teal : T.gray}
                            strokeWidth={2}
                          />
                        </View>
                        <Text style={styles.typeTitle}>Create My Family</Text>
                        <Text style={styles.typeSubTitle}>Become Family Head</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={0.85}
                        style={[
                          styles.familyModeCard,
                          familyMode === "join" && styles.familyModeCardActive,
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
                        <Text style={styles.typeTitle}>Join Family</Text>
                        <Text style={styles.typeSubTitle}>Request to join</Text>
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={[
                        styles.familySkipCard,
                        familyMode === "skip" && styles.familySkipCardActive,
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
                          Skip for Now
                        </Text>
                        <Text style={styles.typeSubTitle}>
                          Continue without a family. Set up later in My Family
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
                      <Text style={styles.familyPendingTitle}>Pending Approval</Text>
                      <Text style={styles.familyPendingText}>
                        Your request has been sent to the Family Head. You will join the family once
                        your request is approved.
                      </Text>
                    </View>
                  </View>
                ) : null}

                <View style={styles.familyNumberSection}>
                <View style={styles.familyLabelRow}>
                  <Text style={styles.inputText}>
                    {familyMode === "join" ? (
                      <>
                        Enter Family Number <Text style={styles.requiredMark}>*</Text>
                      </>
                    ) : (
                      "Family Number"
                    )}
                  </Text>
                  {familyMode === "create" && !familyNumberLocked ? (
                    <TouchableOpacity
                      onPress={regenerateFamilyNumber}
                      disabled={familyNumberLoading}
                      hitSlop={8}
                    >
                      <Text style={styles.familyRegenerateText}>Refresh</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                <View style={styles.familyInputWrap}>
                  <TextInput
                    style={[
                      styles.input,
                      styles.familyInput,
                      (familyNumberError || showError("familyNumber", liveErrors)) && styles.inputError,
                      familyNumberLocked && styles.inputReadOnly,
                    ]}
                    placeholder={familyMode === "join" ? "Enter Family Number" : "FAM-XXXXXX"}
                    placeholderTextColor={T.gray}
                    value={familyNumber}
                    onChangeText={(text) => {
                      if (familyNumberLocked) return;
                      setFamilyNumber(text.toUpperCase());
                      clearError("familyNumber");
                      setFamilyNumberError(null);
                    }}
                    onBlur={handleFamilyNumberBlur}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={30}
                    editable={!familyNumberLocked}
                  />
                  {familyNumberLoading || familyNumberChecking ? (
                    <ActivityIndicator size="small" color={T.navy} style={styles.familyInputSpinner} />
                  ) : null}
                </View>
                <Text style={styles.helperText}>
                  {familyNumberLocked
                    ? familyJoinPending
                      ? "Your join request is waiting for Family Head approval."
                      : "Your saved family number cannot be changed here."
                    : familyMode === "join"
                      ? "Enter the Family Number shared by your Family Head. Approval is required before you join."
                      : "A unique code is generated for you. You can edit it, or clear the field to get a new one."}
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
                      <Text style={styles.familySkipBannerTitle}>Family setup skipped</Text>
                      <Text style={styles.familySkipBannerText}>
                        No problem. You can create or join a household later from My Family in your
                        profile.
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            ) : null}

          {!isGuestProfile ? (
          <>
          <View style={styles.fieldGroup}>
            <Text style={styles.inputText}>
              I am a... <Text style={styles.requiredMark}>*</Text>
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
                <Text style={styles.typeTitle}>Homeowner</Text>
                <Text style={styles.typeSubTitle}>I own this unit</Text>
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
                <Text style={styles.typeTitle}>Tenant</Text>
                <Text style={styles.typeSubTitle}>I rent this unit</Text>
              </TouchableOpacity>
            </View>
            {showError("residenceType", liveErrors) ? (
              <Text style={styles.errorText}>{showError("residenceType", liveErrors)}</Text>
            ) : null}
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.inputText}>
              Upload lease or last 3 month utility bill{" "}
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
                    promptTitle: "Upload document",
                    promptMessage: "Take a photo or choose from your gallery.",
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
                      {selectedFile.fileName || "Document.pdf"}
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
                    <Text style={styles.uploadText}>Uploaded document</Text>
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
                  <Text style={styles.uploadText}>Upload file</Text>
                  <Text style={styles.helperText}>
                    Drag & Drop your file here, or{" "}
                    <Text style={styles.uploadLink}>Upload file</Text>
                  </Text>
                </>
              )}
            </TouchableOpacity>
            {showError("utilityFile", liveErrors) ? (
              <Text style={styles.errorText}>{showError("utilityFile", liveErrors)}</Text>
            ) : null}

            <Text style={styles.helperText}>
              Verification may take 48-72 hours.
            </Text>
          </View>
          </>
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
    lineHeight: 22,
    color: T.navy,
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
    paddingHorizontal: 0,
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
  input: {
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 12,
    backgroundColor: T.white,
    height: 52,
    paddingHorizontal: 16,
    fontFamily: Fonts.regular,
    fontSize: 14,
    color: T.navy,
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
  familyInput: {
    fontFamily: Fonts.bold,
    letterSpacing: 1,
    paddingRight: 44,
  },
  familyInputSpinner: {
    position: "absolute",
    right: 14,
    top: 20,
  },
  inputReadOnly: {
    backgroundColor: "rgba(243, 244, 246, 1)",
    color: "#475569",
  },
  textArea: {
    height: 112,
    paddingTop: 14,
    paddingBottom: 14,
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
