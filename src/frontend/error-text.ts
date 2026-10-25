import type { RosCallError } from "./api";

// Codes whose fix the user can act on get their own words; the rest show
// the server's message as it came, which is RouterOS's own when it gave one.
const KEYS: Record<string, string> = {
  ROS_NOT_ENABLED: "errors.notEnabled",
  ROS_HOST_ACCESS: "errors.hostAccess",
  ROS_TLS_UNTRUSTED: "errors.tlsUntrusted",
  ROS_TLS_NEEDS_CA: "errors.tlsNeedsCa",
};

/** The text to show for a failed call. */
export function errorText(
  t: (key: string) => string,
  error: RosCallError,
): string {
  const key = error.code ? KEYS[error.code] : undefined;
  return key ? t(key) : error.message;
}
