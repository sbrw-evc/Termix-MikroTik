import { RosError } from "./errors.js";

/**
 * One RouterOS command, the same for both transports: a menu path, a command
 * in it and its arguments. The API sends it as `/ip/address/add =address=…`,
 * REST as `POST /rest/ip/address/add {"address": …}`.
 */
export interface RosCommand {
  /** Menu segments, like ["ip", "address"]. */
  path: string[];
  /** print, add, set, remove, enable, monitor-traffic, ping… */
  command: string;
  /** Arguments, ".id" and "numbers" among them. */
  attrs?: Record<string, string>;
  /** For print: only these properties. */
  proplist?: string[];
  /** For print: equality filters, all of which must match. */
  query?: Record<string, string>;
  timeoutMs?: number;
}

/** What a command answered: the rows it printed and the id an add made. */
export interface RosReply {
  rows: Array<Record<string, string>>;
  ret?: string;
}

export interface RosClient {
  readonly transport: RosTransport;
  run(command: RosCommand): Promise<RosReply>;
  /** Closes the session the client holds, if any. */
  close(): void;
}

export type RosTransport = "api-tunnel" | "rest-tunnel" | "rest" | "api";

// Menus: ip, dhcp-server, 6to4, wifiwave2. Commands the same.
const SEGMENT_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;
// Argument names: address, .id, .proplist, value-name, 802.1x-…
const ATTR_RE = /^\.?[a-z0-9][a-z0-9.-]{0,63}$/;
const MAX_PATH = 8;
const MAX_VALUE = 64 * 1024;

export const isSegment = (value: string) => SEGMENT_RE.test(value);
export const isAttrName = (value: string) => ATTR_RE.test(value);

/** Checks a command's shape, so neither transport can be steered elsewhere. */
export function checkCommand(command: RosCommand): void {
  const bad = (message: string) => {
    throw new RosError(message, "ROS_BAD_REQUEST", 400);
  };
  // A few commands live at the root: /ping.
  if (command.path.length > MAX_PATH) bad("path has too many segments");
  for (const segment of command.path) {
    if (!isSegment(segment)) bad(`Invalid menu: ${segment}`);
  }
  if (!isSegment(command.command)) bad(`Invalid command: ${command.command}`);
  for (const [key, value] of Object.entries(command.attrs ?? {})) {
    if (!isAttrName(key)) bad(`Invalid argument: ${key}`);
    if (typeof value !== "string") bad(`${key} must be text`);
    if (value.length > MAX_VALUE) bad(`${key} is too long`);
  }
  for (const name of command.proplist ?? []) {
    if (!isAttrName(name)) bad(`Invalid property: ${name}`);
  }
  for (const [key, value] of Object.entries(command.query ?? {})) {
    if (!isAttrName(key)) bad(`Invalid filter: ${key}`);
    if (typeof value !== "string" || value.length > 1024) {
      bad(`Invalid filter value for ${key}`);
    }
  }
}

/** "/ip/address/add" for messages and the audit log. */
export function commandLabel(command: RosCommand): string {
  return `/${[...command.path, command.command].join("/")}`;
}
