import type { Row } from "./api";

/** "rx-byte" → "Rx Byte", the way WinBox titles a property it has no name for. */
export function humanize(key: string): string {
  return key
    .replace(/^\./, "")
    .split("-")
    .map((part) =>
      /^(ip|mac|mtu|dns|dhcp|ntp|vlan|id|ssid|psk|ttl|mss|tcp|udp|nat|ppp|l2tp|sstp|pptp|ovpn|gre|eoip|mpls|ospf|bgp|rip|snmp|ssh|api|www|ftp|lte|sfp|poe|cpu|hdd|rx|tx|ra|pd|vrf|wds|dfs|ht|vht|he|ac|ax|mstp|rstp|stp|igmp|pim|sni|url|uri|ca|crl|scep|ike|esp|ah|pfs|dpd|ipv6|ipv4)$/i.test(
        part,
      )
        ? part.toUpperCase()
        : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join(" ");
}

type TFunction = (key: string, options?: Record<string, unknown>) => string;

/** A property's label: a translation when there is one, else humanized. */
export function propLabel(t: TFunction, key: string): string {
  return t(`props.${key}`, { defaultValue: humanize(key) });
}

/** Properties RouterOS keeps itself: counters, state and what it worked out. */
const READ_ONLY_RE =
  /^\.|^(dynamic|invalid|running|slave|inactive|active|builtin|default|bound|status|uptime|last-.*|link-downs|actual-.*|.*-(byte|bytes|packet|packets|drop|drops|error|errors|count|bps|pps)|bytes|packets|fp-.*|hw-.*|factory-.*|current-.*|ro|expires-after|age|registered|connected|local|static|counters?|creation-time|dynamic-.*|rx-rate|tx-rate|signal-strength.*|tx-ccq|rx-ccq|p-throughput|overall-tx-ccq)$/;

export const isReadOnlyProp = (key: string) => READ_ONLY_RE.test(key);

/** RouterOS flags as WinBox shows them in a list's first column. */
export function flagsOf(row: Row): string {
  let flags = "";
  if (row.disabled === "true") flags += "X";
  if (row.invalid === "true") flags += "I";
  if (row.dynamic === "true") flags += "D";
  if (row.running === "true") flags += "R";
  if (row.slave === "true") flags += "S";
  if (row.active === "true" && !row.running) flags += "A";
  if (row.inactive === "true") flags += "U";
  return flags;
}

/** "true"/"false" as yes/no, the way WinBox reads them. */
export function displayValue(value: string | undefined): string {
  if (value === undefined) return "";
  if (value === "true") return "yes";
  if (value === "false") return "no";
  return value;
}

/** Bytes as KiB, MiB, GiB. */
export function formatBytes(value: number | string | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Bits per second as kbps, Mbps, Gbps. */
export function formatBps(value: number | string | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  const units = ["bps", "kbps", "Mbps", "Gbps"];
  let v = n;
  let i = 0;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** A row's name for dialogs: its name, or what the spec says names it. */
export function rowName(row: Row, nameKey?: string): string {
  return (
    (nameKey && row[nameKey]) ||
    row.name ||
    row.address ||
    row["dst-address"] ||
    row.comment ||
    row[".id"] ||
    ""
  );
}
