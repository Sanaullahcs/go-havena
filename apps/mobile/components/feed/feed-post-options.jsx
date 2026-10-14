import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import AdminRowActionsMenu from "../admin/admin-row-actions-menu";
import FeedPostReportSheet, { completeReportAndNotify } from "./feed-post-report-sheet";
import { deletePost, reportFeedPost } from "../../services/feed-api";
import { getCachedUser, getUser } from "../../services/auth-session";
import { useApiAction } from "../../hooks/use-api-action";
import { useAppDialog } from "../../providers/app-dialog-provider";
import { useBlockUser } from "../../hooks/use-block-user";
import { canShowBlockUser, getBlockableUserId } from "../../utils/block-target";

function postIsOwnedByCurrentUser(post, user) {
  if (post?.is_mine) return true;
  const uid = user?.id;
  const authorId = post?.user_id ?? post?.author_id ?? post?.user?.id;
  return uid != null && authorId != null && String(uid) === String(authorId);
}

/**
 * More-menu for feed posts: own posts get Edit/Delete; others get Report.
 */
export default function FeedPostOptions({ post, onDeleted, onReported, onUserBlocked }) {
  const { t } = useTranslation();
  const router = useRouter();
  const dialog = useAppDialog();
  const { runAction, showFailure, showSuccess } = useApiAction();
  const { confirmAndBlock } = useBlockUser();
  const [reportOpen, setReportOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [currentUser, setCurrentUser] = useState(() => getCachedUser());

  useEffect(() => {
    if (currentUser?.id) return;
    let cancelled = false;
    getUser()
      .then((user) => {
        if (!cancelled && user) setCurrentUser(user);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id]);

  const hasImage = Boolean(post?.image_url);
  const isMine = postIsOwnedByCurrentUser(post, currentUser);
  const canBlock = canShowBlockUser(
    {
      user_id: post?.user_id,
      author_id: post?.author_id,
      user: post?.user,
      can_block: post?.can_block,
      author_role: post?.author_role,
    },
    currentUser?.id,
  );

  const handleDownload = useCallback(async () => {
    if (!hasImage) return;
    const { saveImageToGallery } = await import("../../utils/save-media-to-gallery");
    await saveImageToGallery(post.image_url, { showError: showFailure, showSuccess });
  }, [hasImage, post?.image_url, showFailure, showSuccess]);

  const handleEdit = useCallback(() => {
    if (!post?.id) return;
    router.push({
      pathname: "/screens/create-post",
      params: { postId: String(post.id) },
    });
  }, [post?.id, router]);

  const handleDelete = useCallback(async () => {
    if (!post?.id) return;
    const choice = await dialog.showConfirm(
      t("feed.options.deletePost"),
      t("feed.options.deleteConfirm"),
      { confirmLabel: t("common.delete"), cancelLabel: t("common.cancel"), destructive: true },
    );
    if (choice !== "confirm") return;

    const result = await runAction({
      action: () => deletePost(post.id),
      successTitle: t("feed.options.postDeleted"),
      successMessage: t("feed.options.postDeletedMsg"),
      silentSuccess: false,
    });
    if (result === null) return;
    onDeleted?.(post.id);
  }, [dialog, onDeleted, post?.id, router, runAction, t]);

  const handleBlock = useCallback(async () => {
    const userId = getBlockableUserId(
      {
        user_id: post?.user_id,
        author_id: post?.author_id,
        user: post?.user,
        can_block: post?.can_block,
        author_role: post?.author_role,
      },
      currentUser?.id,
    );
    if (!userId) return;
    const ok = await confirmAndBlock(userId, {
      can_block: post?.can_block,
      author_role: post?.author_role,
      user: post?.user,
      currentUserId: currentUser?.id,
    });
    if (ok) onUserBlocked?.(userId);
  }, [confirmAndBlock, currentUser?.id, onUserBlocked, post]);

  const handleReportSubmit = useCallback(
    async (payload) => {
      if (!post?.id) return;
      await completeReportAndNotify({
        request: () =>
          reportFeedPost(post.id, {
            type: payload.type,
            description: payload.description,
          }),
        close: () => setReportOpen(false),
        setBusy: setReporting,
        notifySuccess: (result) => {
          onReported?.(post.id);
          showSuccess(
            t("feed.options.reportSubmitted"),
            result?.data?.review_queue === "system_admin"
              ? t("feed.options.systemAdminWillReview")
              : t("feed.options.adminWillReview"),
          );
        },
        notifyFailure: (error) => showFailure(t("apiAction.actionFailed"), error),
      });
    },
    [onReported, post?.id, showFailure, showSuccess, t],
  );

  const actions = useMemo(() => {
    const list = [
      {
        id: "download",
        label: t("feed.options.downloadPhoto"),
        icon: "download-outline",
        tone: "primary",
        hidden: !hasImage,
        onPress: handleDownload,
      },
    ];

    if (isMine) {
      list.push(
        {
          id: "edit",
          label: t("feed.options.editPost"),
          icon: "create-outline",
          tone: "primary",
          hidden: post?.category === "poll" || Boolean(post?.poll),
          onPress: handleEdit,
        },
        {
          id: "delete",
          label: t("feed.options.deletePost"),
          icon: "trash-outline",
          tone: "danger",
          onPress: handleDelete,
        },
      );
    } else {
      list.push(
        {
          id: "report",
          label: t("feed.options.reportPost"),
          icon: "flag-outline",
          tone: "danger",
          onPress: () => setReportOpen(true),
        },
        {
          id: "block",
          label: t("blocks.blockUser"),
          icon: "ban-outline",
          tone: "danger",
          hidden: !canBlock,
          onPress: handleBlock,
        },
      );
    }

    return list;
  }, [hasImage, isMine, canBlock, handleDownload, handleEdit, handleDelete, handleBlock, t]);

  return (
    <>
      <AdminRowActionsMenu
        actions={actions}
        disabled={reporting}
        compact
        title={t("feed.options.postOptions")}
        message={
          isMine
            ? t("feed.options.ownOptionsMessage")
            : t("feed.options.optionsMessage")
        }
        headerIcon={hasImage ? "image-outline" : "document-text-outline"}
      />
      {isMine ? null : (
        <FeedPostReportSheet
          visible={reportOpen}
          post={post}
          submitting={reporting}
          reasonKind="post"
          onClose={() => setReportOpen(false)}
          onSubmit={handleReportSubmit}
        />
      )}
    </>
  );
}
