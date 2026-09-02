import React, { useMemo } from "react";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import NewChatSheet from "../messages/new-chat-sheet";
import { formatPostShareMessage } from "../../services/feed-api";

/** Pick a community member and send the post as a private message. */
export default function SharePostSheet({ visible, post, onClose }) {
  const router = useRouter();
  const { t } = useTranslation();
  const initialMessage = useMemo(
    () => (post ? formatPostShareMessage(post, t) : ""),
    [post, t],
  );

  return (
    <NewChatSheet
      visible={visible}
      title={t("feed.shareWithNeighbors")}
      subtitle={t("feed.shareWithNeighborsSub")}
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
