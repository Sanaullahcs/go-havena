import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import AdminRowActionsMenu from "../admin/admin-row-actions-menu";
import FeedPostReportSheet from "./feed-post-report-sheet";
import { reportFeedPost } from "../../services/feed-api";
import { useApiAction } from "../../hooks/use-api-action";

/**
 * More-menu + report sheet wiring for feed posts.
 */
export default function FeedPostOptions({ post }) {
  const { t } = useTranslation();
  const { runAction, showFailure, showSuccess } = useApiAction();
  const [reportOpen, setReportOpen] = useState(false);
  const [reporting, setReporting] = useState(false);

  const hasImage = Boolean(post?.image_url);

  const handleDownload = useCallback(async () => {
    if (!hasImage) return;
    const { saveImageToGallery } = await import("../../utils/save-media-to-gallery");
    await saveImageToGallery(post.image_url, { showError: showFailure, showSuccess });
  }, [hasImage, post?.image_url, showFailure, showSuccess]);

  const handleReportSubmit = useCallback(
    async (payload) => {
      if (!post?.id) return;
      setReporting(true);
      try {
        await runAction({
          action: () =>
            reportFeedPost(post.id, {
              type: payload.type,
              description: payload.description,
            }),
          successTitle: t("feed.options.reportSubmitted"),
          successMessage: t("feed.options.adminWillReview"),
          silentSuccess: false,
        });
        setReportOpen(false);
      } finally {
        setReporting(false);
      }
    },
    [post?.id, runAction],
  );

  const actions = useMemo(
    () => [
      {
        id: "download",
        label: t("feed.options.downloadPhoto"),
        icon: "download-outline",
        tone: "primary",
        hidden: !hasImage,
        onPress: handleDownload,
      },
      {
        id: "report",
        label: t("feed.options.reportPost"),
        icon: "flag-outline",
        tone: "danger",
        onPress: () => setReportOpen(true),
      },
    ],
    [hasImage, handleDownload, t],
  );

  return (
    <>
      <AdminRowActionsMenu
        actions={actions}
        disabled={reporting}
        compact
        title={t("feed.options.postOptions")}
        message={t("feed.options.optionsMessage")}
        headerIcon={hasImage ? "image-outline" : "document-text-outline"}
      />
      <FeedPostReportSheet
        visible={reportOpen}
        post={post}
        submitting={reporting}
        onClose={() => setReportOpen(false)}
        onSubmit={handleReportSubmit}
      />
    </>
  );
}

