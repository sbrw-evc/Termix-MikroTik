import type { PluginHostShareLevel } from "@termix-ssh/plugin-sdk/backend";
import type { RosCommand } from "./command.js";

/**
 * What a command needs. WinBox reaches every menu, so this plugin does too:
 * instead of a list of paths, commands are sorted by what they do.
 *
 * - view: print anything, with secrets left out.
 * - operate: bounded tools (ping, traceroute, torch, traffic), turning
 *   interfaces on and off, renewing a DHCP lease, dropping a connection.
 * - configure: add, change, remove, enable, disable and move entries.
 * - administer: users, packages, scripts, the scheduler, files, services,
 *   backups, reboot, reset, exports with secrets, anything that runs a
 *   script, and commands this file does not know.
 */
export type RosPermission = "view" | "operate" | "configure" | "administer";

export type PolicyAnswer =
  { permission: RosPermission; redact: boolean } | { error: string };

const READ = new Set(["print", "get"]);
const EDIT = new Set([
  "add",
  "set",
  "unset",
  "remove",
  "enable",
  "disable",
  "move",
  "comment",
  "reset-counters",
  "reset-counters-all",
  "make-static",
]);

/** print arguments that would keep it running or write a file. */
const PRINT_DENIED = new Set([
  "interval",
  "follow",
  "follow-only",
  "file",
  "append",
]);

/** Menus whose changes are the router's own administration. */
const ADMIN_MENUS = [
  "user",
  "user-manager",
  "system/package",
  "system/script",
  "system/scheduler",
  "system/reset-configuration",
  "system/backup",
  "system/license",
  "system/routerboard",
  "system/device-mode",
  "system/console",
  "system/upgrade",
  "file",
  "disk",
  "partitions",
  "certificate",
  "container",
  "import",
  "execute",
  "special-login",
  "ip/service",
  "ip/ssh",
  "tool/fetch",
  "tool/e-mail",
  "tool/sniffer",
  "tool/traffic-generator",
];

/** Arguments that hold a script RouterOS runs later. */
const SCRIPT_ARG_RE =
  /(^|-)script$|^on-(event|up|down|login|logout|error)$|^source$|^(up|down)-script$/;

/**
 * Commands that run once and stop, with the argument that bounds them and
 * its limit. Without that argument they would run until cancelled.
 */
interface Bounded {
  menu: string;
  command: string;
  permission: RosPermission;
  /** Argument that must be set, and its most. */
  bound?: { arg: string; max: number } | { arg: string; flag: true };
}

const BOUNDED: Bounded[] = [
  {
    menu: "",
    command: "ping",
    permission: "operate",
    bound: { arg: "count", max: 100 },
  },
  {
    menu: "tool",
    command: "ping",
    permission: "operate",
    bound: { arg: "count", max: 100 },
  },
  {
    menu: "tool",
    command: "traceroute",
    permission: "operate",
    bound: { arg: "count", max: 10 },
  },
  {
    menu: "tool",
    command: "torch",
    permission: "operate",
    bound: { arg: "duration", max: 10 },
  },
  {
    menu: "tool",
    command: "ip-scan",
    permission: "operate",
    bound: { arg: "duration", max: 30 },
  },
  {
    menu: "tool",
    command: "bandwidth-test",
    permission: "operate",
    bound: { arg: "duration", max: 30 },
  },
  {
    menu: "tool",
    command: "profile",
    permission: "view",
    bound: { arg: "duration", max: 10 },
  },
  { menu: "tool", command: "wol", permission: "operate" },
  {
    menu: "tool",
    command: "mac-scan",
    permission: "operate",
    bound: { arg: "duration", max: 30 },
  },
  {
    menu: "interface",
    command: "monitor-traffic",
    permission: "view",
    bound: { arg: "once", flag: true },
  },
  {
    menu: "interface/ethernet",
    command: "monitor",
    permission: "view",
    bound: { arg: "once", flag: true },
  },
  {
    menu: "interface/wireless",
    command: "monitor",
    permission: "view",
    bound: { arg: "once", flag: true },
  },
  {
    menu: "interface/wifi",
    command: "monitor",
    permission: "view",
    bound: { arg: "once", flag: true },
  },
  {
    menu: "interface/wireguard",
    command: "monitor",
    permission: "view",
    bound: { arg: "once", flag: true },
  },
  {
    menu: "interface/wireless",
    command: "scan",
    permission: "operate",
    bound: { arg: "duration", max: 30 },
  },
  {
    menu: "interface/wifi",
    command: "scan",
    permission: "operate",
    bound: { arg: "duration", max: 30 },
  },
  {
    menu: "interface/ethernet",
    command: "cable-test",
    permission: "operate",
    bound: { arg: "once", flag: true },
  },
  {
    menu: "system/resource/cpu",
    command: "print",
    permission: "view",
  },
  {
    menu: "system/routerboard",
    command: "upgrade",
    permission: "administer",
  },
  {
    menu: "system/package/update",
    command: "check-for-updates",
    permission: "view",
  },
  {
    menu: "system/package/update",
    command: "download",
    permission: "administer",
  },
  {
    menu: "system/package/update",
    command: "install",
    permission: "administer",
  },
  { menu: "system", command: "reboot", permission: "administer" },
  { menu: "system", command: "shutdown", permission: "administer" },
  { menu: "system/backup", command: "save", permission: "administer" },
  { menu: "system/backup", command: "load", permission: "administer" },
  { menu: "system/script", command: "run", permission: "administer" },
  { menu: "ip/dhcp-client", command: "renew", permission: "operate" },
  { menu: "ip/dhcp-client", command: "release", permission: "operate" },
  { menu: "ipv6/dhcp-client", command: "renew", permission: "operate" },
  { menu: "ipv6/dhcp-client", command: "release", permission: "operate" },
  { menu: "ip/cloud", command: "force-update", permission: "operate" },
  { menu: "system/ntp/client", command: "print", permission: "view" },
  { menu: "certificate", command: "sign", permission: "administer" },
  {
    menu: "certificate",
    command: "export-certificate",
    permission: "administer",
  },
  {
    menu: "interface/wireguard/peers",
    command: "show-client-config",
    permission: "administer",
  },
  { menu: "interface/bridge/host", command: "flush", permission: "operate" },
  { menu: "ip/arp", command: "flush", permission: "operate" },
  { menu: "ip/dns/cache", command: "flush", permission: "operate" },
  { menu: "system/clock", command: "print", permission: "view" },
  // The CLI's own help: which menus and commands a path has.
  { menu: "console", command: "inspect", permission: "view" },
];

/** Removing these drops a session or a connection; nothing is configured. */
const OPERATE_REMOVE = [
  "ppp/active",
  "ip/firewall/connection",
  "ip/hotspot/active",
  "ip/hotspot/host",
  "interface/wireless/registration-table",
  "interface/wifi/registration-table",
  "caps-man/registration-table",
  "interface/wifi/capsman/remote-cap",
  "ip/dns/cache",
];

/** Interfaces are turned on and off with operate, as a cable is plugged. */
const OPERATE_TOGGLE_RE = /^interface(\/[a-z0-9-]+)?$/;

const startsWith = (path: string, menu: string) =>
  path === menu || path.startsWith(`${menu}/`);

function seconds(value: string): number {
  const m = /^(\d+(?:\.\d+)?)(ms|s|m)?$/.exec(value.trim());
  if (!m) return NaN;
  const n = Number(m[1]);
  return m[2] === "ms" ? n / 1000 : m[2] === "m" ? n * 60 : n;
}

export function permissionFor(command: RosCommand): PolicyAnswer {
  const path = command.path.join("/");
  const attrs = command.attrs ?? {};
  const name = command.command;
  const admin = ADMIN_MENUS.some((menu) => startsWith(path, menu));

  if (READ.has(name)) {
    const denied = Object.keys(attrs).find((key) => PRINT_DENIED.has(key));
    if (denied) return { error: `print with ${denied} is not allowed` };
    // Secrets stay hidden unless the caller may administer; the route
    // decides that, since it knows the caller.
    return { permission: "view", redact: true };
  }

  const bounded = BOUNDED.find((b) => b.menu === path && b.command === name);
  if (bounded) {
    if (bounded.bound) {
      const value = attrs[bounded.bound.arg];
      if ("flag" in bounded.bound) {
        if (value === undefined) {
          return { error: `${name} needs ${bounded.bound.arg}` };
        }
      } else {
        const n =
          bounded.bound.arg === "duration"
            ? seconds(value ?? "")
            : Number(value);
        if (!(n > 0 && n <= bounded.bound.max)) {
          return {
            error: `${name} needs ${bounded.bound.arg} between 1 and ${bounded.bound.max}`,
          };
        }
      }
    }
    return { permission: bounded.permission, redact: true };
  }

  if (EDIT.has(name)) {
    if (admin) return { permission: "administer", redact: false };
    if (Object.keys(attrs).some((key) => SCRIPT_ARG_RE.test(key))) {
      return { permission: "administer", redact: false };
    }
    if (name === "remove" && OPERATE_REMOVE.includes(path)) {
      return { permission: "operate", redact: false };
    }
    if (
      (name === "enable" || name === "disable") &&
      OPERATE_TOGGLE_RE.test(path)
    ) {
      return { permission: "operate", redact: false };
    }
    if (name === "reset-counters" || name === "reset-counters-all") {
      return { permission: "operate", redact: false };
    }
    return { permission: "configure", redact: false };
  }

  // export, run and anything else this file does not know.
  return { permission: "administer", redact: false };
}

/** Property names that hold a secret. */
const SECRET_RE =
  /(^|-)(password|passphrase|secret|private-key|pre-shared-key|preshared-key|psk|auth-key|authentication-key)$|^wpa2?-pre-shared-key$|^key$/;

export const isSecretProperty = (name: string) => SECRET_RE.test(name);

/** Rows with secret values blanked, and the names that were blanked. */
export function redactRows(
  rows: Array<Record<string, string>>,
): Array<Record<string, string>> {
  return rows.map((row) => {
    const hidden: string[] = [];
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      if (isSecretProperty(key) && value) {
        hidden.push(key);
        out[key] = "";
      } else {
        out[key] = value;
      }
    }
    if (hidden.length) out[".hidden"] = hidden.join(",");
    return out;
  });
}

/** The share level the caller needs on the Termix host for a permission. */
export function hostLevelFor(permission: RosPermission): PluginHostShareLevel {
  return permission === "view" ? "connect" : "edit";
}
