/**
 * Lightweight checks for biometric login preconditions (no device APIs).
 * Run: node apps/mobile/scripts/test-biometric-flow.mjs
 */

const BIOMETRIC_ERROR = {
  NO_SESSION: "NO_SESSION",
  NOT_AVAILABLE: "NOT_AVAILABLE",
  NOT_ENROLLED: "NOT_ENROLLED",
  CANCELLED: "CANCELLED",
  FAILED: "FAILED",
};

function evaluateBiometricLogin({ token, hasHardware, isEnrolled, authSuccess, authError }) {
  if (!token) {
    return { success: false, code: BIOMETRIC_ERROR.NO_SESSION };
  }
  if (!hasHardware) {
    return { success: false, code: BIOMETRIC_ERROR.NOT_AVAILABLE };
  }
  if (!isEnrolled) {
    return { success: false, code: BIOMETRIC_ERROR.NOT_ENROLLED };
  }
  if (authSuccess) {
    return { success: true };
  }
  if (authError === "user_cancel" || authError === "system_cancel") {
    return { success: false, code: BIOMETRIC_ERROR.CANCELLED };
  }
  return { success: false, code: BIOMETRIC_ERROR.FAILED };
}

const cases = [
  {
    name: "no session blocks biometric",
    input: { token: null, hasHardware: true, isEnrolled: true, authSuccess: true },
    expect: BIOMETRIC_ERROR.NO_SESSION,
  },
  {
    name: "session + success unlocks",
    input: { token: "abc", hasHardware: true, isEnrolled: true, authSuccess: true },
    expect: "success",
  },
  {
    name: "not enrolled blocks biometric",
    input: { token: "abc", hasHardware: true, isEnrolled: false, authSuccess: true },
    expect: BIOMETRIC_ERROR.NOT_ENROLLED,
  },
  {
    name: "cancelled auth",
    input: {
      token: "abc",
      hasHardware: true,
      isEnrolled: true,
      authSuccess: false,
      authError: "user_cancel",
    },
    expect: BIOMETRIC_ERROR.CANCELLED,
  },
];

let failed = 0;

for (const testCase of cases) {
  const result = evaluateBiometricLogin(testCase.input);
  const pass =
    testCase.expect === "success"
      ? result.success === true
      : result.code === testCase.expect;

  if (!pass) {
    failed += 1;
    console.error(`FAIL: ${testCase.name}`, result);
  } else {
    console.log(`PASS: ${testCase.name}`);
  }
}

if (failed > 0) {
  process.exit(1);
}

console.log("All biometric flow checks passed.");
