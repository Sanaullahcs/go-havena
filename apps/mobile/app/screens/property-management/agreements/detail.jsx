import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  Image,
  Switch,
} from "react-native";
import LocaleTextInput from "../../../../components/ui/locale-text-input";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import InternalScreenHeader from "../../../../components/layout/internal-screen-header";
import { pageStyles } from "../../../../constants/page-styles";
import { propertyStyles } from "../../../../constants/property-styles";
import { Fonts } from "../../../../constants/font";
import { sw, sf } from "../../../../utils/responsive";
import { getCurrentRole } from "../../../../constants/role-session";
import { useApiAction } from "../../../../hooks/use-api-action";
import { useSubmitLock } from "../../../../hooks/use-submit-lock";
import MobileSignaturePad from "../../../../components/agreements/signature-pad";
import {
  authorizeAgreementFee,
  categoryLabel,
  closeAgreement,
  declineAgreement,
  fetchAdminAgreement,
  fetchAgreement,
  remindAgreement,
  removeRecipient,
  reopenAgreement,
  reopenRecipient,
  sendAgreement,
  signAgreement,
  withdrawAgreement,
} from "../../../../services/agreements-api";

function formatDate(value, withTime = false) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}

export default function AgreementDetail() {
  const { t } = useTranslation();
  const params = useLocalSearchParams();
  const id = Number(params.agreementId || params.agreement_id);
  const isAdmin = getCurrentRole() === "admin";
  const { submitting, run } = useSubmitLock();
  const { showFailure, showSuccess } = useApiAction();
  const padRef = useRef(null);

  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [signerName, setSignerName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const hasLoadedOnce = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (!id) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = isAdmin ? await fetchAdminAgreement(id) : await fetchAgreement(id);
      setRow(data);
      if (data?.signer_name) setSignerName(data.signer_name);
    } catch (err) {
      setError(err?.message ?? t("propertyMgmt.couldNotLoadAgreements"));
    } finally {
      setLoading(false);
      hasLoadedOnce.current = true;
    }
  }, [id, isAdmin, t]);

  useFocusEffect(
    useCallback(() => {
      load(hasLoadedOnce.current);
    }, [load]),
  );

  const onAuthorize = () => {
    run(async () => {
      const res = await authorizeAgreementFee(id);
      setRow(res.data);
      await showSuccess(t("propertyMgmt.feeAuthorized"), res.message);
    });
  };

  const onSign = () => {
    run(async () => {
      const pad = await padRef.current?.exportSignature?.();
      if (!pad || pad.empty || !pad.dataUrl) {
        await showFailure(t("propertyMgmt.drawSignature"), new Error(t("propertyMgmt.drawSignature")));
        return;
      }
      if (signerName.trim().length < 3) {
        await showFailure(t("propertyMgmt.legalNameRequired"), new Error(t("propertyMgmt.legalNameRequired")));
        return;
      }
      if (!accepted) {
        await showFailure(t("propertyMgmt.acceptSignatureTerms"), new Error(t("propertyMgmt.acceptSignatureTerms")));
        return;
      }
      const res = await signAgreement(id, {
        signer_name: signerName.trim(),
        signature: pad.dataUrl,
        accepted_terms: true,
      });
      setRow(res.data);
      await showSuccess(t("propertyMgmt.signatureRecorded"), res.message);
    });
  };

  const onDecline = () => {
    Alert.alert(t("propertyMgmt.declineAgreement"), t("propertyMgmt.declineAgreementMsg"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("propertyMgmt.declineBtn"),
        style: "destructive",
        onPress: () => {
          run(async () => {
            const res = await declineAgreement(id);
            setRow(res.data);
          });
        },
      },
    ]);
  };

  const onSend = () => {
    Alert.alert(t("propertyMgmt.sendAgreement"), t("propertyMgmt.sendAgreementMsg"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("propertyMgmt.sendNow"),
        onPress: () => {
          run(async () => {
            const res = await sendAgreement(id);
            setRow(res.data);
            await showSuccess(t("propertyMgmt.agreementSent"), res.message);
          });
        },
      },
    ]);
  };

  const onClose = () => {
    Alert.alert(t("propertyMgmt.closeAgreement"), t("propertyMgmt.closeAgreementMsg"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("propertyMgmt.closeBtn"),
        onPress: () => {
          run(async () => {
            const res = await closeAgreement(id);
            setRow(res.data);
          });
        },
      },
    ]);
  };

  if (loading && !hasLoadedOnce.current) {
    return (
      <SafeAreaView style={propertyStyles.screen} edges={["left", "right"]}>
        <InternalScreenHeader title={t("propertyMgmt.agreementsTitle")} subtitle={t("common.loading")} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1B4F8A" />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !row) {
    return (
      <SafeAreaView style={propertyStyles.screen} edges={["left", "right"]}>
        <InternalScreenHeader title={t("propertyMgmt.agreementsTitle")} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error ?? t("propertyMgmt.notFoundAgreement")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const signed = row.my_status === "signed";
  const declined = row.my_status === "declined";
  const recipients = row.recipients ?? [];

  return (
    <SafeAreaView style={propertyStyles.screen} edges={["left", "right"]}>
      <InternalScreenHeader title={row.title} subtitle={categoryLabel(row.category)} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={pageStyles.scrollBottom}>
        <View style={propertyStyles.sectionBlock}>
          <Text style={[styles.due, row.is_overdue && { color: "#E11D48" }]}>
            {row.is_overdue ? t("propertyMgmt.overdueLabel") : row.is_due_soon ? t("propertyMgmt.dueSoonLabel") : t("propertyMgmt.dueLabel")} {formatDate(row.due_at)}
            {row.is_required ? ` · ${t("propertyMgmt.requiredBadge")}` : ""}
          </Text>
          {row.cover_message ? (
            <View style={styles.coverNote}>
              <Text style={styles.coverNoteText}>{row.cover_message}</Text>
            </View>
          ) : null}
          <View style={styles.docCard}>
            <Text style={styles.body}>{row.body}</Text>
          </View>
        </View>

        {isAdmin ? (
          <View style={propertyStyles.sectionBlock}>
            <Text style={styles.sectionTitle}>{t("propertyMgmt.recipientsTitle")}</Text>
            <Text style={styles.meta}>
              {row.counts?.signed ?? 0}/{row.counts?.total ?? 0} {t("propertyMgmt.signedTab").toLowerCase()}
            </Text>
            {row.status === "draft" ? (
              <Pressable disabled={submitting} onPress={onSend} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>{t("propertyMgmt.sendNow")}</Text>
              </Pressable>
            ) : row.status === "sent" ? (
              <>
                <Pressable
                  disabled={submitting}
                  onPress={() => {
                    Alert.alert(t("propertyMgmt.remindUnsigned"), t("propertyMgmt.remindUnsignedMsg"), [
                      { text: t("common.cancel"), style: "cancel" },
                      {
                        text: t("propertyMgmt.sendReminder"),
                        onPress: () => {
                          run(async () => {
                            const res = await remindAgreement(id);
                            await showSuccess(t("propertyMgmt.reminderSent"), res.message);
                          });
                        },
                      },
                    ]);
                  }}
                  style={styles.primaryBtn}
                >
                  <Text style={styles.primaryBtnText}>{t("propertyMgmt.remindUnsigned")}</Text>
                </Pressable>
                {row.can_withdraw ? (
                  <Pressable
                    disabled={submitting}
                    onPress={() => {
                      Alert.alert(t("propertyMgmt.withdrawDraft"), t("propertyMgmt.withdrawDraftMsg"), [
                        { text: t("common.cancel"), style: "cancel" },
                        {
                          text: t("propertyMgmt.withdrawBtn"),
                          onPress: () => {
                            run(async () => {
                              const res = await withdrawAgreement(id);
                              setRow(res.data);
                              await showSuccess(t("propertyMgmt.agreementWithdrawn"), res.message);
                            });
                          },
                        },
                      ]);
                    }}
                    style={styles.secondaryBtn}
                  >
                    <Text style={styles.secondaryBtnText}>{t("propertyMgmt.withdrawDraft")}</Text>
                  </Pressable>
                ) : null}
                <Pressable disabled={submitting} onPress={onClose} style={styles.secondaryBtn}>
                  <Text style={styles.secondaryBtnText}>{t("propertyMgmt.closeAgreement")}</Text>
                </Pressable>
              </>
            ) : row.status === "closed" ? (
              <Pressable
                disabled={submitting}
                onPress={() => {
                  Alert.alert(t("propertyMgmt.reopenAgreement"), t("propertyMgmt.reopenAgreementMsg"), [
                    { text: t("common.cancel"), style: "cancel" },
                    {
                      text: t("propertyMgmt.reopenBtn"),
                      onPress: () => {
                        run(async () => {
                          const res = await reopenAgreement(id);
                          setRow(res.data);
                          await showSuccess(t("propertyMgmt.agreementReopened"), res.message);
                        });
                      },
                    },
                  ]);
                }}
                style={styles.primaryBtn}
              >
                <Text style={styles.primaryBtnText}>{t("propertyMgmt.reopenAgreement")}</Text>
              </Pressable>
            ) : null}
            {recipients.map((person) => (
              <View key={person.id} style={styles.person}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{(person.name || "?").slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.personName}>{person.name}</Text>
                  <Text style={styles.meta}>{person.status}{person.certificate_id ? ` · ${person.certificate_id}` : ""}</Text>
                  {row.status === "sent" && (person.can_remind || person.can_reopen || person.can_remove) ? (
                    <View style={styles.personActions}>
                      {person.can_remind ? (
                        <Pressable
                          disabled={submitting}
                          onPress={() => {
                            run(async () => {
                              const res = await remindAgreement(id, [person.user_id]);
                              await showSuccess(t("propertyMgmt.reminderSent"), res.message);
                            });
                          }}
                        >
                          <Text style={styles.linkAction}>{t("propertyMgmt.remindOne")}</Text>
                        </Pressable>
                      ) : null}
                      {person.can_reopen ? (
                        <Pressable
                          disabled={submitting}
                          onPress={() => {
                            run(async () => {
                              const res = await reopenRecipient(id, person.user_id);
                              setRow(res.data);
                              await showSuccess(t("propertyMgmt.inviteAgain"), res.message);
                            });
                          }}
                        >
                          <Text style={styles.linkAction}>{t("propertyMgmt.inviteAgain")}</Text>
                        </Pressable>
                      ) : null}
                      {person.can_remove ? (
                        <Pressable
                          disabled={submitting}
                          onPress={() => {
                            Alert.alert(t("propertyMgmt.removeRecipient"), t("propertyMgmt.removeRecipientMsg"), [
                              { text: t("common.cancel"), style: "cancel" },
                              {
                                text: t("propertyMgmt.removeRecipient"),
                                style: "destructive",
                                onPress: () => {
                                  run(async () => {
                                    const res = await removeRecipient(id, person.user_id);
                                    setRow(res.data);
                                    await showSuccess(t("propertyMgmt.recipientRemoved"), res.message);
                                  });
                                },
                              },
                            ]);
                          }}
                        >
                          <Text style={styles.dangerAction}>{t("propertyMgmt.removeRecipient")}</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ) : signed ? (
          <View style={[propertyStyles.sectionBlock, styles.cert]}>
            <View style={styles.certIcon}>
              <Feather name="check-circle" size={sf(22)} color="#047857" />
            </View>
            <Text style={styles.sectionTitle}>{t("propertyMgmt.certificateTitle")}</Text>
            <Text style={styles.meta}>{t("propertyMgmt.signedBy", { name: row.signer_name })} · {formatDate(row.signed_at, true)}</Text>
            {row.certificate_id ? <Text style={styles.hash}>ID {row.certificate_id}</Text> : null}
            {row.content_hash ? <Text style={styles.hash}>SHA-256 {row.content_hash}</Text> : null}
            {row.signature_url ? <Image source={{ uri: row.signature_url }} style={styles.signatureImg} /> : null}
          </View>
        ) : declined ? (
          <View style={propertyStyles.sectionBlock}>
            <Text style={styles.errorText}>{t("propertyMgmt.youDeclined")}</Text>
          </View>
        ) : row.status === "closed" ? (
          <View style={propertyStyles.sectionBlock}>
            <Text style={styles.meta}>{t("propertyMgmt.agreementClosed")}</Text>
          </View>
        ) : (
          <View style={propertyStyles.sectionBlock}>
            <Text style={styles.sectionTitle}>{t("propertyMgmt.paidSignature")}</Text>
            <Text style={styles.meta}>
              {row.requires_payment
                ? t("propertyMgmt.feeHint", { fee: row.signature_fee_label })
                : t("propertyMgmt.noFeeHint")}
            </Text>
            {row.needs_payment ? (
              <Pressable disabled={submitting} onPress={onAuthorize} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>{t("propertyMgmt.authorizeFee", { fee: row.signature_fee_label })}</Text>
              </Pressable>
            ) : null}
            {row.can_sign ? (
              <>
                <View style={{ marginTop: sw(16) }}>
                  <MobileSignaturePad padRef={padRef} />
                </View>
                <Text style={styles.fieldLabel}>{t("propertyMgmt.legalName")}</Text>
                <LocaleTextInput
                  value={signerName}
                  onChangeText={setSignerName}
                  placeholder={t("propertyMgmt.legalNamePlaceholder")}
                  style={styles.input}
                />
                <View style={styles.acceptRow}>
                  <Switch value={accepted} onValueChange={setAccepted} trackColor={{ true: "#1B4F8A" }} />
                  <Text style={styles.acceptText}>{t("propertyMgmt.acceptSignatureTerms")}</Text>
                </View>
                <Pressable disabled={submitting} onPress={onSign} style={styles.primaryBtn}>
                  <Text style={styles.primaryBtnText}>{t("propertyMgmt.applySignature")}</Text>
                </Pressable>
                {row.can_decline ? (
                  <Pressable disabled={submitting} onPress={onDecline} style={styles.declineBtn}>
                    <Text style={styles.declineText}>{t("propertyMgmt.declineBtn")}</Text>
                  </Pressable>
                ) : row.is_required ? (
                  <Text style={styles.requiredHint}>{t("propertyMgmt.requiredHint")}</Text>
                ) : null}
              </>
            ) : null}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: sw(24) },
  due: { fontFamily: Fonts.medium, fontSize: sf(12), color: "#6A7282", marginBottom: sw(12) },
  coverNote: {
    backgroundColor: "#E8F0F7",
    borderRadius: sw(12),
    padding: sw(12),
    marginBottom: sw(12),
  },
  coverNoteText: { fontFamily: Fonts.medium, fontSize: sf(13), color: "#1B4F8A", lineHeight: sf(18) },
  personActions: { flexDirection: "row", flexWrap: "wrap", gap: sw(10), marginTop: sw(6) },
  linkAction: { fontFamily: Fonts.bold, fontSize: sf(12), color: "#1B4F8A", fontWeight: "700" },
  dangerAction: { fontFamily: Fonts.bold, fontSize: sf(12), color: "#E11D48", fontWeight: "700" },
  requiredHint: { fontFamily: Fonts.medium, fontSize: sf(12), color: "#6D28D9", textAlign: "center", marginTop: sw(10) },
  docCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: sw(16),
    padding: sw(16),
  },
  body: { fontFamily: Fonts.regular, fontSize: sf(14), lineHeight: sf(22), color: "#334155" },
  sectionTitle: { fontFamily: Fonts.bold, fontSize: sf(16), color: "#101828", fontWeight: "700" },
  meta: { fontFamily: Fonts.regular, fontSize: sf(12), color: "#6A7282", marginTop: sw(6) },
  primaryBtn: {
    marginTop: sw(16),
    backgroundColor: "#1B4F8A",
    borderRadius: sw(12),
    paddingVertical: sw(13),
    alignItems: "center",
  },
  primaryBtnText: { fontFamily: Fonts.bold, fontSize: sf(14), color: "#FFFFFF", fontWeight: "700" },
  secondaryBtn: {
    marginTop: sw(16),
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: sw(12),
    paddingVertical: sw(13),
    alignItems: "center",
  },
  secondaryBtnText: { fontFamily: Fonts.bold, fontSize: sf(14), color: "#334155", fontWeight: "700" },
  person: { flexDirection: "row", alignItems: "center", gap: sw(10), marginTop: sw(12) },
  avatar: {
    width: sw(36),
    height: sw(36),
    borderRadius: sw(18),
    backgroundColor: "#E8F0F7",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: Fonts.bold, fontSize: sf(13), color: "#1B4F8A", fontWeight: "700" },
  personName: { fontFamily: Fonts.bold, fontSize: sf(14), color: "#101828", fontWeight: "700" },
  cert: { backgroundColor: "#ECFDF5" },
  certIcon: {
    width: sw(44),
    height: sw(44),
    borderRadius: sw(12),
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(10),
  },
  hash: { fontFamily: Fonts.regular, fontSize: sf(11), color: "#64748B", marginTop: sw(8) },
  signatureImg: { width: sw(180), height: sw(72), marginTop: sw(12), backgroundColor: "#FFFFFF", borderRadius: sw(10) },
  fieldLabel: { fontFamily: Fonts.medium, fontSize: sf(13), color: "#334155", marginTop: sw(16), marginBottom: sw(6) },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: sw(12),
    paddingHorizontal: sw(12),
    paddingVertical: sw(10),
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    color: "#101828",
  },
  acceptRow: { flexDirection: "row", alignItems: "center", gap: sw(10), marginTop: sw(14) },
  acceptText: { flex: 1, fontFamily: Fonts.regular, fontSize: sf(13), color: "#475569", lineHeight: sf(18) },
  declineBtn: { alignItems: "center", paddingVertical: sw(12) },
  declineText: { fontFamily: Fonts.bold, fontSize: sf(13), color: "#E11D48", fontWeight: "700" },
  errorText: { fontFamily: Fonts.regular, fontSize: sf(13), color: "#E7000B", textAlign: "center" },
});
