import { useEffect, useState } from "react";
import { Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";

/**
 * Which biometric buttons to show:
 * - Android: fingerprint and/or face unlock when enrolled
 * - iOS: Face ID when available; Touch ID only on older devices without Face ID
 */
export function useBiometricCapabilities() {
  const [state, setState] = useState({
    loading: true,
    fingerprint: false,
    facial: false,
    enrolled: false,
  });

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();

        if (!mounted) return;

        const canUse = hasHardware && enrolled;
        let fingerprint =
          canUse &&
          types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
        let facial =
          canUse &&
          types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);

        if (Platform.OS === "ios") {
          // Apple: Face ID only when available; otherwise Touch ID on older devices
          if (facial) {
            fingerprint = false;
          }
        }

        setState({
          loading: false,
          fingerprint,
          facial,
          enrolled: canUse,
        });
      } catch {
        if (mounted) {
          setState({
            loading: false,
            fingerprint: false,
            facial: false,
            enrolled: false,
          });
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  return state;
}
