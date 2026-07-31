import React, { useCallback, useMemo, useState } from "react";
import AdminRowActionsMenu from "../admin/admin-row-actions-menu";
import FeedPostReportSheet from "./feed-post-report-sheet";
import { fileReport } from "../../services/reports-api";
import { useApiAction } from "../../hooks/use-api-action";

/**
 * More-menu + report sheet wiring for feed posts.
 */
export default function FeedPostOptions({ post }) {
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
      setReporting(true);
      try {
        await runAction({
          action: () => fileReport(payload),
          successTitle: "Report submitted",
          successMessage: "Community admins will review this post.",
          silentSuccess: false,
        });
        setReportOpen(false);
      } finally {
        setReporting(false);
      }
    },
    [runAction],
  );

  const actions = useMemo(
    () => [
      {
        id: "download",
        label: "Download photo",
        icon: "download-outline",
        tone: "primary",
        hidden: !hasImage,
        onPress: handleDownload,
      },
      {
        id: "report",
        label: "Report post",
        icon: "flag-outline",
        tone: "danger",
        onPress: () => setReportOpen(true),
      },
    ],
    [hasImage, handleDownload],
  );

  return (
    <>
      <AdminRowActionsMenu
        actions={actions}
        disabled={reporting}
        compact
        title="Post options"
        message="Download the photo or report this post to community admins."
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

