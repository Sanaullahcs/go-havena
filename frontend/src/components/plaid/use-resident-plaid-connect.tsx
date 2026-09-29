"use client";

import { useCallback, useRef, useState } from "react";
import type { PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import { PlaidLinkLauncher } from "@/components/plaid/plaid-link-launcher";
import { apiError } from "@/lib/api/client";
import { toastError } from "@/lib/alert";
import {
  createResidentPlaidLinkToken,
  exchangeResidentPlaidToken,
  type PlaidExchangePayload,
} from "@/lib/api/resident-plaid";

/** Opens Plaid Link and returns the connected resident bank. */
export function useResidentPlaidConnect(
  onConnected: (resident: PlaidExchangePayload) => void | Promise<void>,
) {
  const onConnectedRef = useRef(onConnected);
  onConnectedRef.current = onConnected;
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const start = useCallback(async () => {
    setBusy(true);
    try {
      const payload = await createResidentPlaidLinkToken("create");
      setToken(payload.link_token);
    } catch (err) {
      setBusy(false);
      toastError(apiError(err));
    }
  }, []);

  const handleSuccess = useCallback(
    (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
      setToken(null);
      if (!publicToken) {
        setBusy(false);
        toastError("Plaid did not return a bank connection.");
        return;
      }
      const selected = metadata.accounts?.[0];
      void exchangeResidentPlaidToken(publicToken, {
        account_id: selected?.id ?? null,
        account: selected
          ? { name: selected.name, type: selected.type, subtype: selected.subtype, mask: selected.mask }
          : undefined,
        institution_id: metadata.institution?.institution_id ?? null,
        institution_name: metadata.institution?.name ?? null,
      })
        .then((resident) => onConnectedRef.current(resident))
        .catch((err) => toastError(apiError(err)))
        .finally(() => setBusy(false));
    },
    [],
  );

  const launcher = token ? (
    <PlaidLinkLauncher
      token={token}
      onSuccess={handleSuccess}
      onExit={() => {
        setBusy(false);
        setToken(null);
      }}
    />
  ) : null;

  return { start, busy, launcher };
}
