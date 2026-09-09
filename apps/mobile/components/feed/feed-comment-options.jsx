import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import AdminRowActionsMenu from "../admin/admin-row-actions-menu";
import FeedPostReportSheet, { completeReportAndNotify } from "./feed-post-report-sheet";
import { reportFeedComment } from "../../services/feed-api";
import { getCachedUser, getUser } from "../../services/auth-session";
import { useApiAction } from "../../hooks/use-api-action";

function commentIsOwnedByCurrentUser(comment, user) {
  if (comment?.is_mine) return true;
  const uid = user?.id;
  const authorId = comment?.user_id ?? comment?.author_id ?? comment?.user?.id;
  return uid != null && authorId != null && String(uid) === String(authorId);
}

function isPersistedComment(comment) {
  const id = Number(comment?.id);
  return Number.isInteger(id) && id > 0 && !comment?.pending;
}

/**
 * More-menu for comments: other comments get Report. Own comments keep
 * existing actions only (no Report).
 */
export default function FeedCommentOptions({ comment, postId }) {
  const { t } = useTranslation();
  const { showSuccess, showFailure } = useApiAction();
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

  const isMine = commentIsOwnedByCurrentUser(comment, currentUser);
  const canReport = !isMine && isPersistedComment(comment) && postId;
  const authorName = comment?.user?.display_name ?? comment?.user?.name ?? t("feed.neighbor");

  const handleReportSubmit = useCallback(
    async (payload) => {
      if (!postId || !comment?.id) return;
      await completeReportAndNotify({
        request: () =>
          reportFeedComment(postId, comment.id, {
            type: payload.type,
            description: payload.description,
          }),
        close: () => setReportOpen(false),
        setBusy: setReporting,
        notifySuccess: () =>
          showSuccess(t("feed.options.reportSubmitted"), t("feed.options.adminWillReviewComment")),
        notifyFailure: (error) => showFailure(t("apiAction.actionFailed"), error),
      });
    },
    [comment?.id, postId, showFailure, showSuccess, t],
  );

  const actions = useMemo(() => {
    if (!canReport) return [];
    return [
      {
        id: "report",
        label: t("feed.options.reportComment"),
        icon: "flag-outline",
        tone: "danger",
        onPress: () => setReportOpen(true),
      },
    ];
  }, [canReport, t]);

  if (!canReport) return null;

  return (
    <>
      <AdminRowActionsMenu
        actions={actions}
        disabled={reporting}
        compact
        title={t("feed.options.commentOptions")}
        message={t("feed.options.commentOptionsMessage")}
        headerIcon="chatbubble-ellipses-outline"
      />
      <FeedPostReportSheet
        visible={reportOpen}
        post={comment}
        submitting={reporting}
        reasonKind="comment"
        resetKey={comment?.id}
        title={t("feed.report.commentTitle")}
        subtitle={t("feed.report.commentSubtitle", { name: authorName })}
        onClose={() => setReportOpen(false)}
        onSubmit={handleReportSubmit}
      />
    </>
  );
}
