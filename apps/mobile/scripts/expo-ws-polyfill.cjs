/**
 * @expo/ws-tunnel expects global WebSocket; Node 22+ does not provide it by default.
 */
try {
  // eslint-disable-next-line import/no-extraneous-dependencies, global-require
  global.WebSocket = require("ws");
} catch (error) {
  console.warn("[havena] WebSocket polyfill unavailable:", error.message);
}