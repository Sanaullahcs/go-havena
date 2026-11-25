import React from "react";
import { useTranslation } from "react-i18next";
import MinimalStatusCenter from "./minimal-status-center";

/**
 * Full-area offline state for tab outlets and list screens.
 */
export default function NetworkUnavailablePanel({ onRetry, busy = false }) {
  const { t } = useTranslation();

  return (
    <MinimalStatusCenter
      title={t("common.offlineTitle")}
      description={t("common.offlineBody")}
      actionLabel={t("common.retry")}
      onAction={onRetry}
      busy={busy}
    />
  );
}