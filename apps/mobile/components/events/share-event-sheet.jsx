import React, { useMemo } from "react";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import NewChatSheet from "../messages/new-chat-sheet";
import { formatEventShareMessage } from "../../services/notices-api";

/** Pick a community member and send the event as a private message. */
export default function ShareEventSheet({ visible, event, onClose }) {
  const router = useRouter();
  const { t } = useTranslation();
  const initialMessage = useMemo(
    () => (event ? formatEventShareMessage(event, t) : ""),
    [event, t],
  );

  return (
    <NewChatSheet
      visible={visible}
      title={t("events.shareWithNeighbors")}
      subtitle={t("events.shareWithNeighborsSub")}
      initialMessage={initialMessage}
      onClose={onClose}
      onStarted={({ conversationId, recipientName, recipientRole }) => {
        onClose?.();
        router.push({
          pathname: "/screens/messages/chat",
          params: {
            conversationId: String(conversationId),
            recipientName,
            recipientRole: recipientRole ?? "resident",
          },
        });
      }}
    />
  );
}
