import { isDeviceOfflineSnapshot } from "../utils/connectivity-state.js";
import { getApiErrorMessage, isNetworkLikeError } from "../utils/api-error-core.js";

function assert(condition, label) {
  if (!condition) {
    console.error("FAIL", label);
    process.exitCode = 1;
    return;
  }
  console.log("ok", label);
}

assert(isDeviceOfflineSnapshot({ isConnected: false, isInternetReachable: false }) === true, "airplane mode is offline");
assert(isDeviceOfflineSnapshot({ isConnected: true, isInternetReachable: false }) === true, "connected without internet is offline");
assert(isDeviceOfflineSnapshot({ isConnected: true, isInternetReachable: true }) === false, "wifi with internet is online");
assert(isDeviceOfflineSnapshot({ isConnected: true, isInternetReachable: null }) === false, "unknown reachability is not offline");
assert(isDeviceOfflineSnapshot({ isConnected: null, isInternetReachable: null }) === false, "unknown state is not offline");

assert(isNetworkLikeError({ code: "NETWORK_ERROR", status: 0 }) === true, "offline code");
assert(isNetworkLikeError({ code: "TIMEOUT", status: 408, message: "Connection timed out" }) === false, "timeout is not no-internet");
assert(isNetworkLikeError({ code: "SERVER_UNREACHABLE", status: 0, message: "Network request failed" }) === false, "api down is not no-internet");
assert(isNetworkLikeError({ status: 401, message: "Unauthenticated" }) === false, "auth failure is not no-internet");
assert(isNetworkLikeError({ status: 500, message: "Server error" }) === false, "server error is not no-internet");
assert(isNetworkLikeError({ status: 422, message: "Invalid email https://example.com" }) === false, "validation url is not no-internet");
assert(isNetworkLikeError({ message: "Network request failed" }) === false, "raw transport failure is not no-internet");
assert(isNetworkLikeError({ message: "The Internet connection appears to be offline." }) === true, "os offline message");

assert(getApiErrorMessage({ code: "SERVER_UNREACHABLE" }).includes("server"), "api down uses server message");
assert(getApiErrorMessage({ code: "TIMEOUT" }).toLowerCase().includes("timed out"), "timeout keeps timeout message");
assert(getApiErrorMessage({ code: "NETWORK_ERROR" }).toLowerCase().includes("internet"), "offline uses internet message");
assert(!getApiErrorMessage({ status: 401, message: "Your session expired. Please sign in again." }).toLowerCase().includes("internet"), "session expiry is not an internet message");

if (process.exitCode) process.exit(process.exitCode);
console.log("connectivity error checks passed");
