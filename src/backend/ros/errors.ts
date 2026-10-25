export type RosErrorCode =
  | "ROS_API_ERROR"
  | "ROS_AUTH_FAILED"
  | "ROS_NOT_FOUND"
  | "ROS_BAD_REQUEST"
  | "ROS_BAD_OUTPUT"
  | "ROS_UNREACHABLE"
  | "ROS_TIMEOUT"
  | "ROS_FORWARDING_DISABLED"
  | "ROS_NO_REST"
  | "ROS_NO_CREDENTIALS"
  | "ROS_TLS_UNTRUSTED"
  | "ROS_TLS_HOSTNAME"
  | "ROS_TLS_EXPIRED"
  | "ROS_TLS_NEEDS_CA";

/**
 * A failed RouterOS call, with the HTTP status the route answers with. The
 * message is RouterOS's own when it gave one, like "failure: already have
 * such address".
 */
export class RosError extends Error {
  constructor(
    message: string,
    readonly code: RosErrorCode,
    readonly status = 502,
    /** RouterOS's own category or detail, when it sent one. */
    readonly detail?: string,
  ) {
    super(message);
    this.name = "RosError";
  }
}

/** RouterOS words for a missing menu, command or item. */
const NOT_FOUND_RE =
  /no such (command|item|directory)|unknown (command|parameter)|not found|bad command name/i;

/** A RouterOS "failure" or "trap" message as an error with the right status. */
export function trapError(message: string, category?: string): RosError {
  if (/invalid user name or password|not logged in/i.test(message)) {
    return new RosError(message, "ROS_AUTH_FAILED", 401, category);
  }
  if (/not enough permissions|permission denied/i.test(message)) {
    return new RosError(message, "ROS_AUTH_FAILED", 403, category);
  }
  if (NOT_FOUND_RE.test(message)) {
    return new RosError(message, "ROS_NOT_FOUND", 404, category);
  }
  // Everything else RouterOS refuses is about what was asked: a value out of
  // range, a duplicate, a missing argument.
  return new RosError(message, "ROS_BAD_REQUEST", 400, category);
}
