import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Platform } from "react-native";
import LocaleTextInput from "../../../components/ui/locale-text-input";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../../constants/font";
import { Ionicons } from "@expo/vector-icons";
import { MapPin } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import BackButton from "../../../components/ui/back-button";
import RegionPicker from "../../../components/ui/region-picker";
import { requestCommunity } from "../../../services/auth-api";
import { fetchRegionsOnly } from "../../../services/regions-api";
import { showApiFailure } from "../../../utils/auth-errors";
import { useAppDialog } from "../../../providers/app-dialog-provider";
import { goToCompleteProfile, goToRegion } from "../../../constants/onboarding-routes";
import { useSubmitLock } from "../../../hooks/use-submit-lock";
import { useTouchedFieldErrors } from "../../../hooks/use-touched-field-errors";
import { validateCommunityRequestForm, hasFieldErrors, LIMITS } from "../../../utils/form-validation";
import ScreenStatusBar from "../../../components/layout/screen-status-bar";
import { HomeTheme as T } from "../../../constants/home-theme";
import { ScreenBrand as B } from "../../../constants/screen-brand";

const FIELD_BOX_HEIGHT = 52;
const FIELD_FONT_SIZE = 14;

/**
 * Match complete-profile single-line fields. iOS shifts placeholder + value
 * down when lineHeight, a 52px input height, and paddingVertical are combined.
 * The wrapper owns the 52px box; the TextInput stays intrinsically sized and
 * centered. A little extra bottom padding lifts Poppins on iOS.
 */
const fieldTextStyle = {
  fontFamily: Fonts.regular,
  fontSize: FIELD_FONT_SIZE,
  color: T.navy,
  width: "100%",
  margin: 0,
  paddingHorizontal: 0,
  paddingVertical: 0,
  paddingTop: 0,
  paddingBottom: Platform.OS === "ios" ? 3 : 0,
  textAlignVertical: "center",
  includeFontPadding: false,
};

export default function RequestForCommunityScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const dialog = useAppDialog();
  const {
    role = "resident",
    regionId: regionIdParam,
    regionTitle: regionTitleParam,
    rejected,
  } = useLocalSearchParams();

  const [communityName, setCommunityName] = useState("");
  const [address, setAddress] = useState("");
  const [regions, setRegions] = useState([]);
  const [selectedRegionId, setSelectedRegionId] = useState(
    regionIdParam ? Number(regionIdParam) : null,
  );
  const [pickerVisible, setPickerVisible] = useState(false);
  const [loadingRegions, setLoadingRegions] = useState(true);
  const { touch, clearError, showError, validateOnSubmit } = useTouchedFieldErrors();
  const { submitting, run } = useSubmitLock();

  const liveErrors = useMemo(
    () =>
      validateCommunityRequestForm({
        communityName,
        address,
        regionId: selectedRegionId,
      }),
    [communityName, address, selectedRegionId],
  );

  const loadRegions = useCallback(async () => {
    setLoadingRegions(true);
    try {
      const list = await fetchRegionsOnly({});
      setRegions(list);
      if (!selectedRegionId && list.length === 1) {
        setSelectedRegionId(list[0].id);
      }
    } catch {
      setRegions([]);
    } finally {
      setLoadingRegions(false);
    }
  }, [selectedRegionId]);

  useEffect(() => {
    loadRegions();
  }, [loadRegions]);

  const selectedRegion = regions.find((r) => r.id === selectedRegionId);
  const selectedRegionLabel =
    selectedRegion?.title ||
    (regionTitleParam ? String(regionTitleParam) : "");

  const isAdminRequest = role === "admin";
  const isValid = !hasFieldErrors(liveErrors);

  const handleContinue = () => {
    if (submitting) return;
    if (!validateOnSubmit(liveErrors)) return;

    run(async () => {
      try {
        const data = await requestCommunity({
          communityName: communityName.trim(),
          address: address.trim(),
          regionId: selectedRegionId,
        });
        await dialog.showSuccess(
          t('guests.requestSentTitle'),
          isAdminRequest
            ? t('guests.requestSentAdminMessage')
            : t('guests.requestSentResidentMessage'),
        );
        if (isAdminRequest) {
          goToCompleteProfile(router, {
            role: "admin",
            communityId: String(data.community.id),
            communityName: data.community.name,
            regionId: String(selectedRegionId),
            communityRequest: "1",
          });
          return;
        }
        goToCompleteProfile(router, {
          role,
          communityId: String(data.community.id),
          communityName: data.community.name,
          regionId: String(selectedRegionId),
          communityRequest: "1",
        });
      } catch (err) {
        await showApiFailure(dialog, t('guests.requestFailedTitle'), err);
      }
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right", "bottom"]}>
      <ScreenStatusBar style="dark" opaque androidBackgroundColor={T.canvas} />

      <View style={styles.headerRow}>
        <BackButton
          iconOnly
          compact
          onPress={() => {
            if (selectedRegionId) {
              router.replace({
                pathname: "/screens/region/communities",
                params: {
                  role: role === "admin" || role === "resident" ? role : "resident",
                  regionId: String(selectedRegionId),
                  regionTitle: selectedRegionLabel || String(regionTitleParam || ""),
                },
              });
              return;
            }
            goToRegion(router, { role: role === "admin" ? "admin" : "resident" });
          }}
        />
        <Text style={styles.headerTitle} numberOfLines={1}>
          {t('guests.requestAddCommunity')}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {rejected === "1" ? (
          <View style={styles.rejectedBanner}>
            <Ionicons name="alert-circle-outline" size={20} color="#B91C1C" />
            <View style={styles.rejectedTextWrap}>
              <Text style={styles.rejectedTitle}>{t('guests.previousRequestDeclined')}</Text>
              <Text style={styles.rejectedText}>
                {t('guests.submitUpdatedDetails')}
              </Text>
            </View>
          </View>
        ) : null}

        <Text style={styles.subtitle}>
          {isAdminRequest
            ? t('guests.requestSubtitleAdmin')
            : t('guests.requestSubtitleResident')}
        </Text>

        <View style={styles.formWrap}>
          <Text style={styles.label}>
            {t('guests.regionLabel')} <Text style={styles.required}>*</Text>
          </Text>
          <TouchableOpacity
            style={[
              styles.selectField,
              !selectedRegionId && styles.selectFieldEmpty,
              showError("regionId", liveErrors) && styles.inputError,
            ]}
            activeOpacity={0.85}
            onPress={() => {
              setPickerVisible(true);
              clearError("regionId");
            }}
          >
            <View style={styles.selectIconWrap}>
              <MapPin size={16} color={T.teal} strokeWidth={1.75} />
            </View>
            <View style={styles.selectTextWrap}>
              {selectedRegionId ? (
                <>
                  <Text style={styles.selectValue}>{selectedRegionLabel}</Text>
                  {selectedRegion ? (
                    <Text style={styles.selectHint}>
                      {[selectedRegion.area, selectedRegion.state].filter(Boolean).join(" · ")}
                    </Text>
                  ) : null}
                </>
              ) : (
                <Text style={styles.selectPlaceholder}>{t('guests.selectRegion')}</Text>
              )}
            </View>
            <Ionicons name="chevron-down" size={18} color={T.gray} />
          </TouchableOpacity>
          {showError("regionId", liveErrors) ? (
            <Text style={styles.errorText}>{showError("regionId", liveErrors)}</Text>
          ) : null}
          {loadingRegions ? (
            <Text style={styles.fieldHint}>{t('guests.loadingRegions')}</Text>
          ) : (
            <Text style={styles.fieldHint}>
              {t('guests.regionHint')}
            </Text>
          )}

          <Text style={[styles.label, styles.labelSpacing]}>
            {t('guests.communityNameLabel')} <Text style={styles.required}>*</Text>
          </Text>
          <View style={[styles.inputBox, showError("communityName", liveErrors) && styles.inputError]}>
            <LocaleTextInput
              value={communityName}
              onChangeText={(text) => {
                setCommunityName(text);
                clearError("communityName");
              }}
              onBlur={() => touch("communityName")}
              placeholder={t('guests.communityNamePlaceholder')}
              placeholderTextColor={T.gray}
              style={fieldTextStyle}
              maxLength={LIMITS.communityName}
              underlineColorAndroid="transparent"
              textAlignVertical="center"
              allowFontScaling={false}
            />
          </View>
          {showError("communityName", liveErrors) ? (
            <Text style={styles.errorText}>{showError("communityName", liveErrors)}</Text>
          ) : null}

          <Text style={[styles.label, styles.labelSpacing]}>
            {t('guests.addressLabel')} <Text style={styles.required}>*</Text>
          </Text>
          <View style={[styles.addressInputWrap, showError("address", liveErrors) && styles.inputError]}>
            <View style={styles.addressIconSlot} pointerEvents="none">
              <MapPin size={16} color={T.gray} strokeWidth={1.75} />
            </View>
            <View style={styles.addressTextSlot}>
              <LocaleTextInput
                value={address}
                onChangeText={(text) => {
                  setAddress(text);
                  clearError("address");
                }}
                onBlur={() => touch("address")}
                placeholder={t('guests.addressPlaceholder')}
                placeholderTextColor={T.gray}
                style={fieldTextStyle}
                maxLength={LIMITS.communityAddress}
                underlineColorAndroid="transparent"
                textAlignVertical="center"
                allowFontScaling={false}
              />
            </View>
          </View>
          {showError("address", liveErrors) ? (
            <Text style={styles.errorText}>{showError("address", liveErrors)}</Text>
          ) : null}

          <View style={styles.stepsCard}>
            <Text style={styles.stepsTitle}>{t('guests.whatHappensNext')}</Text>
            <View style={styles.stepRow}>
              <View style={styles.stepDot}>
                <Text style={styles.stepNum}>1</Text>
              </View>
              <Text style={styles.stepText}>
                {isAdminRequest
                  ? t('guests.step1Admin')
                  : t('guests.step1Resident')}
              </Text>
            </View>
            <View style={styles.stepRow}>
              <View style={styles.stepDot}>
                <Text style={styles.stepNum}>2</Text>
              </View>
              <Text style={styles.stepText}>{t('guests.step2')}</Text>
            </View>
            <View style={styles.stepRow}>
              <View style={styles.stepDot}>
                <Text style={styles.stepNum}>3</Text>
              </View>
              <Text style={styles.stepText}>{t('guests.step3')}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.ctaButton, !isValid && styles.ctaButtonDisabled, B.buttonShadow]}
            activeOpacity={0.85}
            disabled={!isValid || submitting}
            onPress={handleContinue}
          >
            {submitting ? (
              <ActivityIndicator color={T.white} />
            ) : (
              <Text style={styles.ctaText}>{t('guests.submitRequest')}</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.bottomHint}>
            {t('guests.completeProfileHint')}
          </Text>
        </View>
      </ScrollView>

      <RegionPicker
        visible={pickerVisible}
        regions={regions}
        selectedId={selectedRegionId}
        loading={loadingRegions}
        onClose={() => setPickerVisible(false)}
        onSelect={(region) => {
          setSelectedRegionId(region.id);
          touch("regionId");
          clearError("regionId");
          setPickerVisible(false);
        }}
      />
    </SafeAreaView>
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
    fontSize: 17,
    lineHeight: 22,
    color: T.navy,
    fontWeight: "700",
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  rejectedBanner: {
    marginBottom: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  rejectedTextWrap: {
    flex: 1,
  },
  rejectedTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    color: "#991B1B",
  },
  rejectedText: {
    marginTop: 4,
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: "#B91C1C",
    lineHeight: 17,
  },
  subtitle: {
    marginBottom: 20,
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: T.gray,
  },
  formWrap: {
    borderTopWidth: 1,
    borderTopColor: T.border,
    paddingTop: 20,
  },
  label: {
    fontFamily: Fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    color: T.navy,
    fontWeight: "500",
  },
  required: {
    color: "#E11D48",
  },
  selectField: {
    marginTop: 8,
    minHeight: 56,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: T.white,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  selectFieldEmpty: {
    borderColor: T.border,
  },
  selectIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: T.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  selectTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  selectValue: {
    fontFamily: Fonts.semiBold,
    fontSize: 14,
    color: T.navy,
  },
  selectHint: {
    marginTop: 2,
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: T.gray,
  },
  selectPlaceholder: {
    fontFamily: Fonts.regular,
    fontSize: 14,
    color: T.gray,
  },
  fieldHint: {
    marginTop: 8,
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: T.gray,
    lineHeight: 17,
  },
  inputBox: {
    marginTop: 8,
    height: FIELD_BOX_HEIGHT,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: T.white,
    overflow: "hidden",
    justifyContent: "center",
  },
  labelSpacing: {
    marginTop: 20,
  },
  addressInputWrap: {
    marginTop: 8,
    height: FIELD_BOX_HEIGHT,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: T.white,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    overflow: "hidden",
  },
  addressIconSlot: {
    width: 16,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  addressTextSlot: {
    flex: 1,
    height: "100%",
    justifyContent: "center",
  },
  stepsCard: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.22)",
    borderRadius: 14,
    backgroundColor: T.mint,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  stepsTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    color: T.navy,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: T.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNum: {
    fontFamily: Fonts.bold,
    fontSize: 11,
    color: T.white,
  },
  stepText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: T.navy,
    paddingTop: 2,
  },
  ctaButton: {
    marginTop: 20,
    height: 48,
    borderRadius: 12,
    backgroundColor: B.cta,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaButtonDisabled: {
    backgroundColor: T.border,
  },
  ctaText: {
    fontFamily: Fonts.semiBold,
    fontSize: 14,
    lineHeight: 20,
    color: T.white,
    fontWeight: "600",
  },
  bottomHint: {
    marginTop: 14,
    textAlign: "center",
    fontFamily: Fonts.regular,
    fontSize: 11,
    lineHeight: 18,
    color: T.gray,
  },
  inputError: {
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
