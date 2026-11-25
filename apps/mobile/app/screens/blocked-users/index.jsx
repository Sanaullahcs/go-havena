import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";
import InternalPageShell from "../../../components/layout/internal-page-shell";
import UserAvatar from "../../../components/ui/user-avatar";
import { fetchBlockedUsers } from "../../../services/user-blocks-api";
import { useBlockUser } from "../../../hooks/use-block-user";
import { Fonts } from "../../../constants/font";
import { Colors } from "../../../constants/tokens";
import { sw, sf } from "../../../utils/responsive";

export default function BlockedUsersScreen() {
  const { t } = useTranslation();
  const { confirmAndUnblock } = useBlockUser();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const data = await fetchBlockedUsers();
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err?.message || t("blocks.couldNotLoad"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <InternalPageShell title={t("settings.blockedUsers")} subtitle={t("settings.blockedUsersSub")}>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.brandPrimaryDeep} />
        </View>
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : users.length === 0 ? (
        <Text style={styles.empty}>{t("blocks.empty")}</Text>
      ) : (
        users.map((user) => (
          <View key={String(user.id)} style={styles.row}>
            <UserAvatar source={user.avatar_url} name={user.name} size={sw(40)} />
            <Text style={styles.name} numberOfLines={1}>
              {user.name}
            </Text>
            <Pressable
              style={styles.unblockBtn}
              onPress={async () => {
                const ok = await confirmAndUnblock(user.id);
                if (ok) setUsers((prev) => prev.filter((item) => String(item.id) !== String(user.id)));
              }}
            >
              <Feather name="user-check" size={sf(13)} color={Colors.brandPrimaryDeep} />
              <Text style={styles.unblockText}>{t("blocks.unblockUser")}</Text>
            </Pressable>
          </View>
        ))
      )}
    </InternalPageShell>
  );
}

const styles = StyleSheet.create({
  centered: {
    paddingVertical: sw(32),
    alignItems: "center",
  },
  empty: {
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    color: Colors.textSecondary,
    lineHeight: sf(20),
  },
  error: {
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    color: "#DC2626",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    paddingVertical: sw(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
  },
  name: {
    flex: 1,
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: Colors.textPrimary,
  },
  unblockBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    paddingHorizontal: sw(10),
    paddingVertical: sw(6),
    borderRadius: 999,
    backgroundColor: "#EFF6FF",
  },
  unblockText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    color: Colors.brandPrimaryDeep,
  },
});
