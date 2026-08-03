import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Share,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import SchedulePickerField from "../forms/schedule-picker-field";
import { FormPhoneInput } from "../ui/phone-input";
import ThemedIconBox from "../ui/themed-icon-box";
import { Fonts } from "../../constants/font";
import { Colors, Layout, Shadows } from "../../constants/tokens";
import { DEFAULT_PHONE_COUNTRY } from "../../constants/phone-countries";
import { sw, sf } from "../../utils/responsive";
import { formatDisplayDate, formatDisplayTime, formatAccessDay, toApiScheduleDateTime, mergeDateAndTime, buildAccessWindowFromDuration, roundToNextHour } from "../../utils/form-datetime";
import { validateGuestInviteForm, hasFieldErrors } from "../../utils/form-validation";
import GuestPermissionsSection from "./guest-permissions-section";
import { DEFAULT_GUEST_PERMISSIONS, normalizeGuestPermissions } from "../../constants/guest-permissions";
import KeyboardSafeScreen from "../layout/keyboard-safe-screen";
import { toE164 } from "../../utils/phone";
import { useSubmitLock } from "../../hooks/use-submit-lock";
import { useApiAction } from "../../hooks/use-api-action";
import { useTouchedFieldErrors } from "../../hooks/use-touched-field-errors";

const DURATION_PRESETS = [
  { label: "1 hour", hours: 1 },
  { label: "6 hours", hours: 6 },
  { label: "1 day", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "1 week", hours: 168 },
];

const FLOW_STEPS = {
  resident: [
    {
      icon: "send",
      title: "Send invite",
      desc: "Fill in guest details and how long they can access the app.",
    },
    {
      icon: "smartphone",
      title: "Guest verifies",
      desc: "They log in with their phone, OTP, and the invite code you share.",
    },
    {
      icon: "check-circle",
      title: "You approve",
      desc: "Approve the request from Guest approvals after they verify their invite.",
    },
  ],
  admin: [
    {
      icon: "send",
      title: "Send invite",
      desc: "Fill in guest details and the access window for community features.",
    },
    {
      icon: "smartphone",
      title: "Guest verifies",
      desc: "They sign in with phone OTP and the invite code you provide.",
    },
    {
      icon: "unlock",
      title: "Host approval",
      desc: "You approve guest access after they verify their phone and invite code.",
    },
  ],
};

function defaultFormDates() {
  return buildAccessWindowFromDuration(roundToNextHour(new Date()), 24);
}

function formatDurationLabel(start, end) {
  if (!start || !end) return null;
  const ms = end.getTime() - start.getTime();
  if (ms <= 0) return null;
  const totalMinutes = Math.round(ms / 60000);
  if (totalMinutes < 60) {
    return `${totalMinutes} min access`;
  }
  const hours = Math.round(totalMinutes / 60);
  if (hours < 48) {
    return `${hours} hour${hours === 1 ? "" : "s"} access`;
  }
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} access`;
}

function AccessWindowSummary({ start, end }) {
  if (!start || !end) return null;

  const duration = formatDurationLabel(start, end);
  const invalid = end.getTime() <= start.getTime();

  return (
    <View style={styles.accessSummary}>
      <LinearGradient
        colors={["#EFF6FF", "#F8FAFC"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.accessSummaryHeader}
      >
        <View style={styles.accessSummaryHeaderIcon}>
          <Feather name="calendar" size={sf(14)} color="#0052DF" />
        </View>
        <View style={styles.accessSummaryHeaderCopy}>
          <Text style={styles.accessSummaryTitle}>Access window</Text>
          <Text style={styles.accessSummarySub}>
            {invalid ? "End time must be after start" : "Guest can sign in during this period"}
          </Text>
        </View>
        {duration && !invalid ? (
          <View style={styles.durationBadge}>
            <Text style={styles.durationBadgeText}>{duration}</Text>
          </View>
        ) : null}
      </LinearGradient>

      <View style={[styles.accessTimeline, invalid && styles.accessTimelineInvalid]}>
        <View style={styles.accessPoint}>
          <View style={[styles.accessPointDot, styles.accessPointDotStart]} />
          <Text style={styles.accessPointLabel}>Starts</Text>
          <Text style={styles.accessPointDate}>{formatAccessDay(start)}</Text>
          <View style={styles.accessTimeRow}>
            <Feather name="clock" size={sf(11)} color="#64748B" />
            <Text style={styles.accessPointTime}>{formatDisplayTime(start)}</Text>
          </View>
        </View>

        <View style={styles.accessBridge}>
          <View style={styles.accessBridgeLine} />
          <View style={styles.accessBridgeIcon}>
            <Feather name="arrow-right" size={sf(12)} color="#0052DF" />
          </View>
          <View style={styles.accessBridgeLine} />
        </View>

        <View style={styles.accessPoint}>
          <View style={[styles.accessPointDot, styles.accessPointDotEnd]} />
          <Text style={styles.accessPointLabel}>Ends</Text>
          <Text style={styles.accessPointDate}>{formatAccessDay(end)}</Text>
          <View style={styles.accessTimeRow}>
            <Feather name="clock" size={sf(11)} color="#64748B" />
            <Text style={styles.accessPointTime}>{formatDisplayTime(end)}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function SectionCard({ icon, title, subtitle, children }) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <ThemedIconBox name={icon} size="sm" />
        <View style={styles.sectionHeaderCopy}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      {children}
    </View>
  );
}

function IconField({ icon, label, required, error, children }) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldLabelRow}>
        <Feather name={icon} size={sf(13)} color="#64748B" />
        <Text style={styles.fieldLabel}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
      </View>
      {children}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

function InviteHeroCard({ title, subtitle, variant }) {
  const chips =
    variant === "admin"
      ? [
          { icon: "shield", label: "Admin approval" },
          { icon: "clock", label: "Scheduled window" },
        ]
      : [
          { icon: "user-check", label: "You approve" },
          { icon: "clock", label: "Time-limited" },
          { icon: "lock", label: "Secure login" },
        ];

  return (
    <View style={styles.heroCard}>
      <LinearGradient
        colors={["#EFF6FF", "#E0F2FE", "#F0FDF4"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCardGradient}
      >
        <View style={styles.heroBadge}>
          <Feather name="users" size={sf(10)} color={Colors.brandPrimaryDeep} />
          <Text style={styles.heroBadgeText}>Guest invitation</Text>
        </View>

        <View style={styles.heroMainRow}>
          <View style={styles.heroIconShell}>
            <LinearGradient
              colors={[Colors.brandPrimaryDeep, Colors.brandGradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroIconGradient}
            >
              <Feather name="user-plus" size={sf(22)} color="#FFFFFF" />
            </LinearGradient>
          </View>
          <View style={styles.heroTextCol}>
            <Text style={styles.heroTitle}>{title}</Text>
            <Text style={styles.heroSubtitle}>{subtitle}</Text>
          </View>
        </View>

        <View style={styles.heroLabelRow}>
          {chips.map((chip, index) => (
            <React.Fragment key={chip.label}>
              {index > 0 ? <Text style={styles.heroLabelSep}>·</Text> : null}
              <View style={styles.heroLabelItem}>
                <Feather name={chip.icon} size={sf(10)} color={Colors.brandPrimaryDeep} />
                <Text style={styles.heroLabelText} numberOfLines={1}>
                  {chip.label}
                </Text>
              </View>
            </React.Fragment>
          ))}
        </View>
      </LinearGradient>
    </View>
  );
}

function FlowSteps({ variant }) {
  const steps = FLOW_STEPS[variant] ?? FLOW_STEPS.resident;
  return (
    <View style={styles.flowTimeline}>
      {steps.map((step, index) => {
        const isFirst = index === 0;
        const isLast = index === steps.length - 1;
        return (
          <View key={step.title} style={styles.flowItem}>
            <View style={styles.flowRail}>
              <View style={[styles.flowDot, isFirst && styles.flowDotActive]}>
                {isFirst ? (
                  <Feather name={step.icon} size={sf(13)} color="#FFFFFF" />
                ) : (
                  <Text style={styles.flowDotNumber}>{index + 1}</Text>
                )}
              </View>
              {!isLast ? <View style={styles.flowLine} /> : null}
            </View>
            <View style={[styles.flowContent, !isLast && styles.flowContentSpaced]}>
              <Text style={[styles.flowTitle, isFirst && styles.flowTitleActive]}>{step.title}</Text>
              <Text style={styles.flowDesc}>{step.desc}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function InviteSuccessCard({ result, variant, accessWindow, onShare, onInviteAnother, onDone }) {
  const guestSteps =
    variant === "admin"
      ? [
          "Open Havena and tap Login as Guest",
          "Enter the phone number from this invite",
          "Verify OTP, then enter the invite code below",
        ]
      : [
          "Open Havena and tap Login as Guest",
          "Enter the phone number from this invite",
          "Verify OTP and invite code, then wait for your approval",
        ];

  return (
    <View style={styles.successWrap}>
      <LinearGradient colors={["#ECFDF5", "#EFF6FF"]} style={styles.successHero}>
        <View style={styles.successIconRing}>
          <Feather name="check" size={sf(28)} color="#059669" />
        </View>
        <Text style={styles.successTitle}>Invitation ready</Text>
        <Text style={styles.successSub}>
          Share the code below so your guest can sign in during the access window.
        </Text>
      </LinearGradient>

      <View style={styles.codeCard}>
        <Text style={styles.codeLabel}>Invite code</Text>
        <Text style={styles.codeValue} selectable>
          {result.invite_code}
        </Text>
        {accessWindow ? <Text style={styles.codeWindow}>{accessWindow}</Text> : null}
        {result.invite_qr_value ? (
          <View style={styles.qrHint}>
            <Feather name="maximize" size={sf(12)} color="#64748B" />
            <Text style={styles.qrHintText} numberOfLines={2}>
              QR deep link: {result.invite_qr_value}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.guestStepsCard}>
        <Text style={styles.guestStepsTitle}>What your guest does next</Text>
        {guestSteps.map((step, i) => (
          <View key={step} style={styles.guestStepRow}>
            <View style={styles.guestStepBadge}>
              <Text style={styles.guestStepBadgeText}>{i + 1}</Text>
            </View>
            <Text style={styles.guestStepText}>{step}</Text>
          </View>
        ))}
      </View>

      <Pressable style={styles.shareBtn} onPress={onShare}>
        <Feather name="share-2" size={sf(16)} color="#0052DF" />
        <Text style={styles.shareBtnText}>Share invitation</Text>
      </Pressable>

      <View style={styles.successActions}>
        <Pressable style={styles.secondaryBtn} onPress={onInviteAnother}>
          <Feather name="plus" size={sf(15)} color="#0052DF" />
          <Text style={styles.secondaryBtnText}>Invite another</Text>
        </Pressable>
        {onDone ? (
          <Pressable style={styles.primaryBtn} onPress={onDone}>
            <Text style={styles.primaryBtnText}>Done</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export default function GuestInviteForm({ variant = "resident", createInvitation, onDone }) {
  const scrollRef = useRef(null);
  const { submitting, run } = useSubmitLock();
  const { showFailure, showSuccess } = useApiAction();
  const { touch, clearError, showError, validateOnSubmit } = useTouchedFieldErrors();
  const defaults = useMemo(() => defaultFormDates(), []);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [phoneDigits, setPhoneDigits] = useState("");
  const [phoneCountry, setPhoneCountry] = useState(DEFAULT_PHONE_COUNTRY);
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [startTime, setStartTime] = useState(defaults.startTime);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [endTime, setEndTime] = useState(defaults.endTime);
  const [activePreset, setActivePreset] = useState(null);
  const [permissions, setPermissions] = useState(() => ({ ...DEFAULT_GUEST_PERMISSIONS }));
  const [result, setResult] = useState(null);

  const startsAtIso = useMemo(() => toApiScheduleDateTime(startDate, startTime), [startDate, startTime]);
  const endsAtIso = useMemo(() => toApiScheduleDateTime(endDate, endTime), [endDate, endTime]);

  const fieldErrorsLive = useMemo(
    () =>
      validateGuestInviteForm(
        {
          guest_name: guestName,
          guest_email: guestEmail,
          phone_digits: phoneDigits,
          starts_at: startsAtIso,
          ends_at: endsAtIso,
          permissions,
        },
        { phoneCountry },
      ),
    [guestName, guestEmail, phoneDigits, phoneCountry, startsAtIso, endsAtIso, permissions],
  );

  const canSubmit = useMemo(() => !hasFieldErrors(fieldErrorsLive), [fieldErrorsLive]);

  const accessStart = useMemo(() => mergeDateAndTime(startDate, startTime), [startDate, startTime]);
  const accessEnd = useMemo(() => mergeDateAndTime(endDate, endTime), [endDate, endTime]);

  const accessWindow = useMemo(() => {
    if (!accessStart || !accessEnd) return "";
    return `${formatDisplayDate(accessStart)} ${formatDisplayTime(accessStart)} – ${formatDisplayDate(accessEnd)} ${formatDisplayTime(accessEnd)}`;
  }, [accessStart, accessEnd]);

  const resetForm = useCallback(() => {
    const next = defaultFormDates();
    setGuestName("");
    setGuestEmail("");
    setPhoneDigits("");
    setPhoneCountry(DEFAULT_PHONE_COUNTRY);
    setStartDate(next.startDate);
    setStartTime(next.startTime);
    setEndDate(next.endDate);
    setEndTime(next.endTime);
    setActivePreset(null);
    setPermissions({ ...DEFAULT_GUEST_PERMISSIONS });
    setResult(null);
  }, []);

  const applyDurationPreset = useCallback(
    (hours) => {
      const currentStart = mergeDateAndTime(startDate, startTime);
      const base =
        currentStart && !Number.isNaN(currentStart.getTime())
          ? currentStart
          : roundToNextHour(new Date());
      const window = buildAccessWindowFromDuration(base, hours);
      setStartDate(window.startDate);
      setStartTime(window.startTime);
      setEndDate(window.endDate);
      setEndTime(window.endTime);
      setActivePreset(hours);
    },
    [startDate, startTime],
  );

  const handleSubmit = () => {
    if (!validateOnSubmit(fieldErrorsLive)) {
      showFailure("Check the form", new Error("Fix the highlighted fields before sending the invite."));
      return;
    }

    const phoneE164 = toE164(phoneDigits, phoneCountry);
    if (!phoneE164) {
      showFailure("Invalid phone", new Error("Enter a valid phone number for your guest."));
      return;
    }

    run(async () => {
      const payload = {
        guest_name: guestName.trim(),
        guest_email: guestEmail.trim(),
        guest_phone: phoneE164,
        starts_at: startsAtIso,
        ends_at: endsAtIso,
        permissions: normalizeGuestPermissions(permissions),
      };
      const created = await createInvitation(payload);
      setResult(created);
      await showSuccess("Invitation created", `Share code ${created.invite_code} with your guest.`);
    }).catch((err) => showFailure("Could not create invitation", err));
  };

  const handleShare = async () => {
    if (!result?.invite_code) return;
    const lines = [
      "You're invited to Havena as a guest!",
      `Invite code: ${result.invite_code}`,
      accessWindow ? `Access window: ${accessWindow}` : null,
      result.invite_qr_value ? `Or open: ${result.invite_qr_value}` : null,
    ].filter(Boolean);

    try {
      await Share.share({
        title: "Guest invitation",
        message: lines.join("\n\n"),
      });
    } catch {
      // user dismissed
    }
  };

  const heroCopy =
    variant === "admin"
      ? {
          title: "Invite a guest user",
          subtitle: "You will approve guest access after they verify their phone and invite code.",
        }
      : {
          title: "Invite someone to visit",
          subtitle: "They'll verify their phone and code, then you'll approve before they get access.",
        };

  if (result) {
    return (
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <InviteSuccessCard
          result={result}
          variant={variant}
          accessWindow={accessWindow}
          onShare={handleShare}
          onInviteAnother={resetForm}
          onDone={onDone}
        />
      </ScrollView>
    );
  }

  return (
    <KeyboardSafeScreen
      scrollRef={scrollRef}
      keyboardAvoiding={false}
      footerBorderless
      footerStyle={styles.footer}
      contentContainerStyle={styles.scroll}
      keyboardFieldGap={20}
      scrollProps={
        Platform.OS === "android"
          ? { automaticallyAdjustKeyboardInsets: false }
          : undefined
      }
      footer={
        <Pressable
          style={[styles.submitBtn, (!canSubmit || submitting) && styles.submitBtnDisabled]}
          disabled={!canSubmit || submitting}
          onPress={handleSubmit}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Feather name="send" size={sf(16)} color="#FFFFFF" />
              <Text style={styles.submitBtnText}>Create invitation</Text>
            </>
          )}
        </Pressable>
      }
    >
      <InviteHeroCard title={heroCopy.title} subtitle={heroCopy.subtitle} variant={variant} />

        <View style={styles.flowCard}>
          <Text style={styles.flowCardTitle}>How it works</Text>
          <FlowSteps variant={variant} />
        </View>

        <SectionCard icon="user" title="Guest details" subtitle="Who are you inviting?">
          <IconField
            icon="user"
            label="Full name"
            required
            error={showError("guest_name", fieldErrorsLive)}
          >
            <TextInput
              value={guestName}
              onChangeText={(value) => {
                setGuestName(value);
                touch("guest_name");
                clearError("guest_name");
              }}
              placeholder="e.g., Alex Johnson"
              placeholderTextColor="#98A2B3"
              style={[
                styles.input,
                showError("guest_name", fieldErrorsLive) && styles.inputError,
              ]}
              autoCapitalize="words"
            />
          </IconField>

          <IconField
            icon="phone"
            label="Phone number"
            required
            error={showError("guest_phone", fieldErrorsLive)}
          >
            <FormPhoneInput
              digits={phoneDigits}
              country={phoneCountry}
              onChangeDigits={(value) => {
                setPhoneDigits(value);
                touch("guest_phone");
                clearError("guest_phone");
              }}
              onCountryChange={setPhoneCountry}
              showError={Boolean(showError("guest_phone", fieldErrorsLive))}
            />
          </IconField>

          <IconField
            icon="mail"
            label="Email"
            required
            error={showError("guest_email", fieldErrorsLive)}
          >
            <TextInput
              value={guestEmail}
              onChangeText={(value) => {
                setGuestEmail(value);
                touch("guest_email");
                clearError("guest_email");
              }}
              placeholder="guest@email.com"
              placeholderTextColor="#98A2B3"
              style={[
                styles.input,
                showError("guest_email", fieldErrorsLive) && styles.inputError,
              ]}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </IconField>
        </SectionCard>

        <SectionCard icon="clock" title="Access window" subtitle="When can they use the app as a guest?">
          <Text style={styles.presetLabel}>Quick duration</Text>
          <View style={styles.chipRow}>
            {DURATION_PRESETS.map((preset) => {
              const active = activePreset === preset.hours;
              return (
                <Pressable
                  key={preset.label}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => applyDurationPreset(preset.hours)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{preset.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.scheduleGroupLabel}>
            Starts<Text style={styles.required}> *</Text>
          </Text>
          <View style={styles.dateTimeRow}>
            <View style={styles.dateTimeCell}>
              <SchedulePickerField
                mode="date"
                value={startDate}
                onChange={(v) => {
                  setStartDate(v);
                  setActivePreset(null);
                  touch("starts_at");
                  clearError("starts_at");
                }}
                placeholder="Start date"
                inputStyle={[
                  styles.input,
                  showError("starts_at", fieldErrorsLive) && styles.inputError,
                ]}
              />
            </View>
            <View style={styles.dateTimeCell}>
              <SchedulePickerField
                mode="time"
                value={startTime}
                onChange={(v) => {
                  setStartTime(v);
                  setActivePreset(null);
                  touch("starts_at");
                  clearError("starts_at");
                }}
                placeholder="Start time"
                inputStyle={[
                  styles.input,
                  showError("starts_at", fieldErrorsLive) && styles.inputError,
                ]}
              />
            </View>
          </View>
          {showError("starts_at", fieldErrorsLive) ? (
            <Text style={styles.errorText}>{showError("starts_at", fieldErrorsLive)}</Text>
          ) : null}

          <Text style={styles.scheduleGroupLabel}>
            Ends<Text style={styles.required}> *</Text>
          </Text>
          <View style={styles.dateTimeRow}>
            <View style={styles.dateTimeCell}>
              <SchedulePickerField
                mode="date"
                value={endDate}
                onChange={(v) => {
                  setEndDate(v);
                  setActivePreset(null);
                  touch("ends_at");
                  clearError("ends_at");
                }}
                placeholder="End date"
                inputStyle={[
                  styles.input,
                  showError("ends_at", fieldErrorsLive) && styles.inputError,
                ]}
              />
            </View>
            <View style={styles.dateTimeCell}>
              <SchedulePickerField
                mode="time"
                value={endTime}
                onChange={(v) => {
                  setEndTime(v);
                  setActivePreset(null);
                  touch("ends_at");
                  clearError("ends_at");
                }}
                placeholder="End time"
                inputStyle={[
                  styles.input,
                  showError("ends_at", fieldErrorsLive) && styles.inputError,
                ]}
              />
            </View>
          </View>
          {showError("ends_at", fieldErrorsLive) ? (
            <Text style={styles.errorText}>{showError("ends_at", fieldErrorsLive)}</Text>
          ) : null}

          {accessStart && accessEnd ? (
            <AccessWindowSummary start={accessStart} end={accessEnd} />
          ) : null}
        </SectionCard>

        <SectionCard
          icon="shield"
          title="Guest permissions"
          subtitle="Control what your guest can view after approval"
        >
          <GuestPermissionsSection
            permissions={permissions}
            onChange={(key, value) => setPermissions((current) => ({ ...current, [key]: value }))}
          />
        </SectionCard>
    </KeyboardSafeScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: {
    paddingBottom: sw(24),
    backgroundColor: "#F8FAFC",
  },
  heroCard: {
    marginHorizontal: sw(16),
    marginTop: sw(12),
    borderRadius: sw(20),
    overflow: "hidden",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    ...Shadows.card,
  },
  heroCardGradient: {
    paddingHorizontal: sw(18),
    paddingTop: sw(18),
    paddingBottom: sw(16),
  },
  heroBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: sw(5),
    paddingHorizontal: sw(10),
    paddingVertical: sw(5),
    borderRadius: Layout.pillRadius,
    backgroundColor: "rgba(255,255,255,0.82)",
    borderWidth: 1,
    borderColor: "rgba(0, 82, 223, 0.12)",
    marginBottom: sw(14),
  },
  heroBadgeText: {
    fontFamily: Fonts.semibold,
    fontSize: sf(10),
    color: Colors.brandPrimaryDeep,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  heroMainRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(14),
  },
  heroIconShell: {
    ...Shadows.button,
    borderRadius: sw(16),
  },
  heroIconGradient: {
    width: sw(52),
    height: sw(52),
    borderRadius: sw(16),
    alignItems: "center",
    justifyContent: "center",
  },
  heroTextCol: {
    flex: 1,
    minWidth: 0,
    paddingTop: sw(2),
  },
  heroTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(19),
    lineHeight: sf(24),
    color: Colors.textPrimary,
    marginBottom: sw(6),
  },
  heroSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: Colors.textSecondary,
  },
  heroLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
    marginTop: sw(14),
  },
  heroLabelItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    flexShrink: 1,
  },
  heroLabelText: {
    fontFamily: Fonts.medium,
    fontSize: sf(10),
    color: Colors.textSecondary,
  },
  heroLabelSep: {
    marginHorizontal: sw(6),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: Colors.textMuted,
  },
  flowCard: {
    marginHorizontal: sw(16),
    marginTop: sw(14),
    padding: sw(16),
    borderRadius: sw(14),
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#EEF2F6",
  },
  flowCardTitle: {
    fontFamily: Fonts.semibold,
    fontSize: sf(13),
    color: "#64748B",
    marginBottom: sw(14),
  },
  flowTimeline: {
    gap: 0,
  },
  flowItem: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  flowRail: {
    width: sw(36),
    alignItems: "center",
    alignSelf: "stretch",
  },
  flowDot: {
    width: sw(32),
    height: sw(32),
    borderRadius: sw(16),
    backgroundColor: "#F1F5F9",
    borderWidth: 2,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  flowDotActive: {
    backgroundColor: "#0052DF",
    borderColor: "#0052DF",
  },
  flowDotNumber: {
    fontFamily: Fonts.bold,
    fontSize: sf(12),
    color: "#64748B",
  },
  flowLine: {
    width: 2,
    flex: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: sw(4),
  },
  flowContent: {
    flex: 1,
    paddingTop: sw(4),
    paddingLeft: sw(10),
  },
  flowContentSpaced: {
    paddingBottom: sw(18),
  },
  flowTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    color: "#334155",
    marginBottom: sw(4),
  },
  flowTitleActive: {
    color: "#0052DF",
  },
  flowDesc: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#64748B",
    lineHeight: sf(18),
  },
  sectionCard: {
    marginHorizontal: sw(16),
    marginTop: sw(14),
    padding: sw(16),
    borderRadius: sw(14),
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#EEF2F6",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    marginBottom: sw(14),
  },
  sectionHeaderCopy: {
    flex: 1,
  },
  sectionTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(15),
    color: "#0F172A",
  },
  sectionSubtitle: {
    marginTop: sw(2),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#64748B",
  },
  field: {
    marginBottom: sw(14),
  },
  fieldLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    marginBottom: sw(6),
  },
  fieldLabel: {
    fontFamily: Fonts.semibold,
    fontSize: sf(12),
    color: "#475569",
  },
  required: {
    color: "#EF4444",
  },
  input: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: sw(12),
    paddingHorizontal: sw(14),
    paddingVertical: sw(12),
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    backgroundColor: "#FAFBFC",
    color: "#0F172A",
  },
  inputError: {
    borderColor: "#FCA5A5",
    backgroundColor: "#FEF2F2",
  },
  errorText: {
    marginTop: sw(6),
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    color: "#DC2626",
    lineHeight: sf(16),
  },
  presetLabel: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: "#64748B",
    marginBottom: sw(8),
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: sw(8),
    marginBottom: sw(14),
  },
  chip: {
    paddingHorizontal: sw(12),
    paddingVertical: sw(8),
    borderRadius: sw(999),
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  chipActive: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
  },
  chipText: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: "#475569",
  },
  chipTextActive: {
    color: "#0052DF",
  },
  scheduleGroupLabel: {
    fontFamily: Fonts.semibold,
    fontSize: sf(12),
    color: "#475569",
    marginBottom: sw(6),
  },
  dateTimeRow: {
    flexDirection: "row",
    gap: sw(10),
    marginBottom: sw(12),
  },
  dateTimeCell: {
    flex: 1,
  },
  accessSummary: {
    marginTop: sw(6),
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: "#DBEAFE",
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  accessSummaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    paddingHorizontal: sw(14),
    paddingVertical: sw(12),
    borderBottomWidth: 1,
    borderBottomColor: "#E0E7FF",
  },
  accessSummaryHeaderIcon: {
    width: sw(32),
    height: sw(32),
    borderRadius: sw(10),
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  accessSummaryHeaderCopy: {
    flex: 1,
  },
  accessSummaryTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    color: "#1E3A8A",
  },
  accessSummarySub: {
    marginTop: sw(2),
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: "#64748B",
  },
  durationBadge: {
    paddingHorizontal: sw(10),
    paddingVertical: sw(5),
    borderRadius: sw(999),
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  durationBadgeText: {
    fontFamily: Fonts.semibold,
    fontSize: sf(10),
    color: "#0052DF",
  },
  accessTimeline: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingHorizontal: sw(12),
    paddingVertical: sw(14),
    gap: sw(8),
  },
  accessTimelineInvalid: {
    backgroundColor: "#FEF2F2",
  },
  accessPoint: {
    flex: 1,
    alignItems: "center",
  },
  accessPointDot: {
    width: sw(10),
    height: sw(10),
    borderRadius: sw(5),
    marginBottom: sw(8),
  },
  accessPointDotStart: {
    backgroundColor: "#22C55E",
  },
  accessPointDotEnd: {
    backgroundColor: "#F97316",
  },
  accessPointLabel: {
    fontFamily: Fonts.semibold,
    fontSize: sf(10),
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: sw(4),
  },
  accessPointDate: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    color: "#0F172A",
    textAlign: "center",
    marginBottom: sw(4),
  },
  accessTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
  },
  accessPointTime: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: "#475569",
  },
  accessBridge: {
    flexDirection: "row",
    alignItems: "center",
    width: sw(40),
    paddingTop: sw(30),
  },
  accessBridgeLine: {
    flex: 1,
    height: 2,
    backgroundColor: "#CBD5E1",
  },
  accessBridgeIcon: {
    width: sw(24),
    height: sw(24),
    borderRadius: sw(12),
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: sw(2),
  },
  footer: {
    paddingHorizontal: sw(2),
    backgroundColor: "#FFFFFF",
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
    backgroundColor: "#0052DF",
    borderRadius: sw(14),
    paddingVertical: sw(15),
  },
  submitBtnDisabled: {
    opacity: 0.55,
    backgroundColor: "#94A3B8",
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontFamily: Fonts.bold,
    fontSize: sf(15),
  },
  successWrap: {
    paddingHorizontal: sw(16),
    paddingTop: sw(12),
  },
  successHero: {
    borderRadius: sw(18),
    padding: sw(22),
    alignItems: "center",
    marginBottom: sw(14),
  },
  successIconRing: {
    width: sw(56),
    height: sw(56),
    borderRadius: sw(28),
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(12),
  },
  successTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(20),
    color: "#0F172A",
    marginBottom: sw(6),
  },
  successSub: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: "#64748B",
    textAlign: "center",
    lineHeight: sf(19),
  },
  codeCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: sw(18),
    alignItems: "center",
    marginBottom: sw(14),
  },
  codeLabel: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: "#64748B",
    marginBottom: sw(8),
  },
  codeValue: {
    fontFamily: Fonts.bold,
    fontSize: sf(26),
    color: "#0052DF",
    letterSpacing: 2,
  },
  codeWindow: {
    marginTop: sw(10),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#64748B",
    textAlign: "center",
  },
  qrHint: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(6),
    marginTop: sw(12),
    paddingTop: sw(12),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E2E8F0",
  },
  qrHintText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: "#64748B",
    lineHeight: sf(16),
  },
  guestStepsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: sw(16),
    marginBottom: sw(14),
  },
  guestStepsTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    color: "#0F172A",
    marginBottom: sw(12),
  },
  guestStepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(10),
    marginBottom: sw(10),
  },
  guestStepBadge: {
    width: sw(22),
    height: sw(22),
    borderRadius: sw(11),
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  guestStepBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: sf(11),
    color: "#0052DF",
  },
  guestStepText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: "#475569",
    lineHeight: sf(19),
  },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
    paddingVertical: sw(14),
    borderRadius: sw(14),
    borderWidth: 1.5,
    borderColor: "#0052DF",
    backgroundColor: "#FFFFFF",
    marginBottom: sw(12),
  },
  shareBtnText: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    color: "#0052DF",
  },
  successActions: {
    flexDirection: "row",
    gap: sw(10),
    marginBottom: sw(8),
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(6),
    paddingVertical: sw(14),
    borderRadius: sw(14),
    backgroundColor: "#EFF6FF",
  },
  secondaryBtnText: {
    fontFamily: Fonts.semibold,
    fontSize: sf(14),
    color: "#0052DF",
  },
  primaryBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: sw(14),
    borderRadius: sw(14),
    backgroundColor: "#0052DF",
  },
  primaryBtnText: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    color: "#FFFFFF",
  },
});
