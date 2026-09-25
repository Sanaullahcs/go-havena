"use client";

import { useEffect } from "react";
import type { PlaidLinkOnExit, PlaidLinkOnSuccess } from "react-plaid-link";
import { usePlaidLink } from "react-plaid-link";

/**
 * Mount only when a link_token exists so Plaid's script is not embedded twice.
 * A double embed makes the modal look open but clicks (Continue) do nothing.
 */
export function PlaidLinkLauncher({
  token,
  onSuccess,
  onExit,
}: {
  token: string;
  onSuccess: PlaidLinkOnSuccess;
  onExit?: PlaidLinkOnExit;
}) {
  const { open, ready } = usePlaidLink({
    token,
    onSuccess,
    onExit,
  });

  useEffect(() => {
    if (ready) open();
  }, [ready, open]);

  return null;
}
