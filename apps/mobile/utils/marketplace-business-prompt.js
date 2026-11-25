/**
 * Minimal styled prompt when a user tries to create a deal without a business.
 * Pass `t` from useTranslation() so copy resolves correctly at render time.
 */
export function promptAddBusinessBeforeDeal(showDialog, t, options = {}) {
  const {
    onContinue,
    titleKey = "marketplace.addBusinessFirst",
    confirmKey,
    hasExistingBusiness = false,
    isCommunityAdmin = false,
  } = options;

  const confirmLabel = confirmKey
    ? t(confirmKey)
    : hasExistingBusiness
      ? t("marketplace.editMyBusiness")
      : t("marketplace.addNewBusiness");

  const messageKey = isCommunityAdmin
    ? "marketplace.addBusinessPromptMessageAdmin"
    : "marketplace.addBusinessPromptMessage";

  const highlights = isCommunityAdmin
    ? [
        {
          icon: "storefront-outline",
          label: t("marketplace.addBusinessPromptFlow1"),
          color: "#0F766E",
          bg: "#CCFBF1",
        },
        {
          icon: "pricetag-outline",
          label: t("marketplace.addBusinessPromptFlow3"),
          color: "#B45309",
          bg: "#FEF3C7",
        },
      ]
    : [
        {
          icon: "storefront-outline",
          label: t("marketplace.addBusinessPromptFlow1"),
          color: "#0F766E",
          bg: "#CCFBF1",
        },
        {
          icon: "checkmark-circle-outline",
          label: t("marketplace.addBusinessPromptFlow2"),
          color: "#0369A1",
          bg: "#E0F2FE",
        },
        {
          icon: "pricetag-outline",
          label: t("marketplace.addBusinessPromptFlow3"),
          color: "#B45309",
          bg: "#FEF3C7",
        },
      ];

  return showDialog({
    type: "marketplace",
    layout: "prompt",
    title: t(titleKey),
    message: t(messageKey),
    highlights,
    actions: [
      {
        key: "continue",
        label: confirmLabel,
        variant: "primary",
        onPress: onContinue,
      },
      { key: "cancel", label: t("common.cancel"), variant: "secondary" },
    ],
  });
}
