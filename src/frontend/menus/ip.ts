import {
  action,
  area,
  check,
  comment,
  form,
  iface,
  ifaceList,
  name,
  num,
  ref,
  secret,
  select,
  status,
  table,
  tabs,
  text,
  v6,
  v7,
} from "./dsl";
import type { FieldSpec, TableSpec } from "./types";

// Firewall rules: one field list for filter, NAT, mangle and raw, as WinBox
// shows the same General, Advanced, Extra and Action tabs for each.

const CHAINS: Record<string, string[]> = {
  filter: ["input", "forward", "output"],
  nat: ["srcnat", "dstnat"],
  mangle: ["prerouting", "input", "forward", "output", "postrouting"],
  raw: ["prerouting", "output"],
};

const ACTIONS: Record<string, string[]> = {
  filter: [
    "accept",
    "drop",
    "reject",
    "jump",
    "return",
    "log",
    "passthrough",
    "add-src-to-address-list",
    "add-dst-to-address-list",
    "fasttrack-connection",
    "tarpit",
  ],
  nat: [
    "masquerade",
    "src-nat",
    "dst-nat",
    "redirect",
    "netmap",
    "same",
    "accept",
    "jump",
    "return",
    "log",
    "passthrough",
    "add-src-to-address-list",
    "add-dst-to-address-list",
    "endpoint-independent-nat",
  ],
  mangle: [
    "mark-connection",
    "mark-packet",
    "mark-routing",
    "change-dscp",
    "change-mss",
    "change-ttl",
    "set-priority",
    "strip-ipv4-options",
    "clear-df",
    "route",
    "sniff-tzsp",
    "sniff-pc",
    "accept",
    "jump",
    "return",
    "log",
    "passthrough",
    "add-src-to-address-list",
    "add-dst-to-address-list",
    "fasttrack-connection",
  ],
  raw: [
    "accept",
    "drop",
    "notrack",
    "jump",
    "return",
    "log",
    "add-src-to-address-list",
    "add-dst-to-address-list",
  ],
};

const PROTOCOLS = [
  "tcp",
  "udp",
  "icmp",
  "gre",
  "ipsec-esp",
  "ipsec-ah",
  "ospf",
  "igmp",
  "ipv6-icmp",
  "l2tp",
  "sctp",
  "vrrp",
];

const is =
  (key: string, ...values: string[]) =>
  (v: Record<string, string>) =>
    values.includes(v[key]);

function ruleFields(kind: keyof typeof CHAINS, base = "ip"): FieldSpec[] {
  const lists = `${base}/firewall/address-list`;
  // What each table takes, as RouterOS 7's own /console/inspect lists it.
  const stateful = kind === "filter" || kind === "mangle";
  const v4 = base === "ip";
  return [
    text("chain", { required: true, options: CHAINS[kind] }),
    select("action", ACTIONS[kind], { default: "accept" }),
    text("src-address"),
    text("dst-address"),
    text("protocol", { options: PROTOCOLS }),
    text("src-port"),
    text("dst-port"),
    text("port"),
    iface("in-interface"),
    iface("out-interface"),
    ifaceList("in-interface-list"),
    ifaceList("out-interface-list"),
    ref("src-address-list", lists, { refKey: "list" }),
    ref("dst-address-list", lists, { refKey: "list" }),
    ...(!stateful
      ? []
      : [
          text("connection-state", {
            options: [
              "established,related",
              "invalid",
              "new",
              "untracked",
              "established,related,untracked",
            ],
          }),
          text("connection-nat-state", { options: ["srcnat", "dstnat"] }),
          text("connection-mark"),
        ]),
    ...(kind === "nat" ? [text("connection-mark")] : []),
    text("packet-mark"),
    ...(kind === "raw" ? [] : [text("routing-mark")]),
    ...(stateful ? [text("tcp-flags")] : []),
    text("icmp-options"),
    text("limit"),
    text("dst-limit"),
    ...(kind === "raw" ? [] : [text("connection-limit")]),
    text("content"),
    ...(kind !== "raw" && v4
      ? [ref("layer7-protocol", "ip/firewall/layer7-protocol")]
      : []),
    ...(kind === "filter" && v4 ? [text("tls-host")] : []),
    text("ipsec-policy", {
      options: ["in,ipsec", "out,ipsec", "in,none", "out,none"],
    }),
    text("jump-target", { showIf: is("action", "jump") }),
    text("to-addresses", {
      showIf: is("action", "src-nat", "dst-nat", "netmap", "same"),
    }),
    text("to-ports", {
      showIf: is(
        "action",
        "src-nat",
        "dst-nat",
        "masquerade",
        "redirect",
        "netmap",
        "same",
      ),
    }),
    text("new-connection-mark", { showIf: is("action", "mark-connection") }),
    text("new-packet-mark", { showIf: is("action", "mark-packet") }),
    text("new-routing-mark", { showIf: is("action", "mark-routing") }),
    text("new-mss", { showIf: is("action", "change-mss") }),
    text("new-ttl", { showIf: is("action", "change-ttl") }),
    text("new-dscp", { showIf: is("action", "change-dscp") }),
    check("passthrough", {
      showIf: is(
        "action",
        "mark-connection",
        "mark-packet",
        "mark-routing",
        "change-mss",
        "change-ttl",
        "change-dscp",
      ),
    }),
    text("address-list", {
      showIf: is(
        "action",
        "add-src-to-address-list",
        "add-dst-to-address-list",
      ),
    }),
    text("address-list-timeout", {
      showIf: is(
        "action",
        "add-src-to-address-list",
        "add-dst-to-address-list",
      ),
    }),
    select(
      "reject-with",
      [
        "icmp-network-unreachable",
        "icmp-host-unreachable",
        "icmp-port-unreachable",
        "icmp-protocol-unreachable",
        "icmp-net-prohibited",
        "icmp-host-prohibited",
        "icmp-admin-prohibited",
        "tcp-reset",
      ],
      { showIf: is("action", "reject") },
    ),
    check("hw-offload", { showIf: is("action", "fasttrack-connection") }),
    check("log"),
    text("log-prefix"),
    comment(),
  ];
}

export function rules(kind: keyof typeof CHAINS, base = "ip"): TableSpec {
  return table(
    `${base}/firewall/${kind}`,
    [
      "chain",
      "action",
      "src-address",
      "dst-address",
      "protocol",
      "src-port",
      "dst-port",
      "in-interface",
      "out-interface",
      "bytes",
      "packets",
    ],
    ruleFields(kind, base),
    {
      ordered: true,
      printAttrs: { stats: "" },
      actions: [
        action("resetCounters", "reset-counters", { perRow: true }),
        action("resetCountersAll", "reset-counters-all"),
      ],
    },
  );
}

const addressList = (base: string) =>
  table(
    `${base}/firewall/address-list`,
    ["list", "address", "timeout", "creation-time"],
    [
      ref("list", `${base}/firewall/address-list`, {
        refKey: "list",
        required: true,
      }),
      text("address", { required: true }),
      text("timeout"),
      comment(),
    ],
  );

const connections = (base: string) =>
  table(
    `${base}/firewall/connection`,
    [
      "protocol",
      "src-address",
      "dst-address",
      "reply-src-address",
      "reply-dst-address",
      "tcp-state",
      "timeout",
      "orig-bytes",
      "repl-bytes",
    ],
    [],
    { noAdd: true, noEdit: true, noToggle: true, refreshMs: 3000 },
  );

export const FIREWALL = tabs(
  ["filter", rules("filter")],
  ["nat", rules("nat")],
  ["mangle", rules("mangle")],
  ["raw", rules("raw")],
  [
    "servicePorts",
    table(
      "ip/firewall/service-port",
      ["name", "ports", "sip-direct-media"],
      [text("ports"), check("sip-direct-media")],
      { noAdd: true, noRemove: true },
    ),
  ],
  ["connections", connections("ip")],
  ["addressLists", addressList("ip")],
  [
    "layer7",
    table(
      "ip/firewall/layer7-protocol",
      ["name", "regexp"],
      [name(), area("regexp", { required: true }), comment()],
    ),
  ],
  [
    "connectionTracking",
    form(
      "ip/firewall/connection/tracking",
      [
        select("enabled", ["auto", "yes", "no"]),
        text("tcp-established-timeout"),
        text("tcp-syn-sent-timeout"),
        text("tcp-close-timeout"),
        text("udp-timeout"),
        text("udp-stream-timeout"),
        text("icmp-timeout"),
        text("generic-timeout"),
        check("loose-tcp-tracking"),
      ],
      { status: ["total-entries", "max-entries"] },
    ),
  ],
);

export const ADDRESSES = table(
  "ip/address",
  ["address", "network", "interface"],
  [
    text("address", { required: true, placeholder: "192.168.88.1/24" }),
    text("network"),
    iface("interface", { required: true }),
    comment(),
  ],
);

export const ROUTES = tabs(
  [
    "routes",
    table(
      "ip/route",
      [
        "dst-address",
        "gateway",
        "distance",
        "routing-table",
        "routing-mark",
        "immediate-gw",
        "scope",
        "vrf-interface",
      ],
      [
        text("dst-address", { required: true, default: "0.0.0.0/0" }),
        text("gateway"),
        num("distance"),
        num("scope"),
        num("target-scope"),
        ref("routing-table", "routing/table", { extra: ["main"] }),
        text("routing-mark", { onlyIfPresent: true }),
        text("pref-src"),
        select("check-gateway", ["none", "ping", "arp", "bfd", "bfd-multihop"]),
        check("blackhole"),
        text("vrf-interface"),
        comment(),
      ],
      { refreshMs: 5000 },
    ),
  ],
  [
    "nexthops",
    status("routing/nexthop", [
      "address",
      "immediate-gw.address",
      "scope",
      "gw-check-ok",
      "reachable",
    ]),
    v7,
  ],
  [
    "routingRules",
    table(
      "routing/rule",
      [
        "src-address",
        "dst-address",
        "routing-mark",
        "interface",
        "action",
        "table",
      ],
      [
        text("src-address"),
        text("dst-address"),
        text("routing-mark"),
        iface("interface"),
        select("action", [
          "lookup",
          "lookup-only-in-table",
          "drop",
          "unreachable",
        ]),
        ref("table", "routing/table", { extra: ["main"] }),
        comment(),
      ],
      { ordered: true },
    ),
    v7,
  ],
  [
    "vrf",
    table(
      "ip/vrf",
      ["name", "interfaces"],
      [name(), iface("interfaces", { required: true, wide: true }), comment()],
    ),
    v7,
  ],
);

export const POOLS = tabs(
  [
    "pools",
    table(
      "ip/pool",
      ["name", "ranges", "next-pool", "used", "available"],
      [
        name(),
        text("ranges", {
          required: true,
          placeholder: "192.168.88.10-192.168.88.254",
        }),
        ref("next-pool", "ip/pool", { extra: ["none"] }),
        comment(),
      ],
    ),
  ],
  ["used", status("ip/pool/used", ["pool", "address", "owner", "info"])],
);

export const ARP = table(
  "ip/arp",
  ["address", "mac-address", "interface", "status", "published"],
  [
    text("address", { required: true }),
    text("mac-address", { required: true }),
    iface("interface", { required: true }),
    check("published"),
    comment(),
  ],
  { refreshMs: 5000 },
);

export const DHCP_CLIENT = table(
  "ip/dhcp-client",
  [
    "interface",
    "use-peer-dns",
    "add-default-route",
    "status",
    "address",
    "gateway",
    "expires-after",
  ],
  [
    iface("interface", { required: true }),
    check("use-peer-dns", { default: "yes" }),
    check("use-peer-ntp", { default: "yes" }),
    select("add-default-route", ["yes", "no", "special-classless"]),
    num("default-route-distance"),
    text("default-route-tables"),
    text("dhcp-options"),
    area("script"),
    comment(),
  ],
  {
    refreshMs: 5000,
    actions: [
      action("renew", "renew", { perRow: true }),
      action("release", "release", { perRow: true }),
    ],
  },
);

export const DHCP_SERVER = tabs(
  [
    "dhcp",
    table(
      "ip/dhcp-server",
      ["name", "interface", "address-pool", "lease-time", "add-arp"],
      [
        name(),
        iface("interface", { required: true }),
        ref("address-pool", "ip/pool", { extra: ["static-only"] }),
        text("lease-time", { placeholder: "30m" }),
        select("authoritative", [
          "yes",
          "no",
          "after-2sec-delay",
          "after-10sec-delay",
        ]),
        check("add-arp"),
        check("always-broadcast"),
        check("conflict-detection"),
        text("relay"),
        select("use-radius", ["no", "yes", "accounting"]),
        text("address-lists"),
        area("lease-script"),
        comment(),
      ],
    ),
  ],
  [
    "networks",
    table(
      "ip/dhcp-server/network",
      ["address", "gateway", "dns-server", "domain", "ntp-server"],
      [
        text("address", { required: true, placeholder: "192.168.88.0/24" }),
        text("gateway"),
        num("netmask"),
        text("dns-server"),
        text("domain"),
        text("ntp-server"),
        text("wins-server"),
        text("next-server"),
        text("boot-file-name"),
        ref("dhcp-option", "ip/dhcp-server/option"),
        ref("dhcp-option-set", "ip/dhcp-server/option/sets"),
        comment(),
      ],
    ),
  ],
  [
    "leases",
    table(
      "ip/dhcp-server/lease",
      [
        "address",
        "mac-address",
        "client-id",
        "server",
        "active-address",
        "host-name",
        "expires-after",
        "status",
      ],
      [
        text("address", { required: true }),
        text("mac-address", { required: true }),
        text("client-id"),
        ref("server", "ip/dhcp-server", { extra: ["all"] }),
        text("lease-time"),
        text("rate-limit"),
        text("address-lists"),
        check("block-access"),
        ref("dhcp-option", "ip/dhcp-server/option"),
        comment(),
      ],
      {
        refreshMs: 5000,
        actions: [
          action("makeStatic", "make-static", {
            perRow: true,
            when: (r) => r.dynamic === "true",
          }),
        ],
      },
    ),
  ],
  [
    "options",
    table(
      "ip/dhcp-server/option",
      ["name", "code", "value", "raw-value"],
      [
        name(),
        num("code", { required: true }),
        text("value", {
          required: true,
          wide: true,
          hintKey: "hints.dhcpOption",
        }),
      ],
    ),
  ],
  [
    "optionSets",
    table(
      "ip/dhcp-server/option/sets",
      ["name", "options"],
      [name(), ref("options", "ip/dhcp-server/option", { wide: true })],
    ),
  ],
  [
    "alerts",
    table(
      "ip/dhcp-server/alert",
      ["interface", "valid-server", "unknown-server", "alert-timeout"],
      [
        iface("interface", { required: true }),
        text("valid-server"),
        text("alert-timeout"),
        area("on-alert"),
        comment(),
      ],
    ),
  ],
);

export const DHCP_RELAY = table(
  "ip/dhcp-relay",
  ["name", "interface", "dhcp-server", "local-address"],
  [
    name(),
    iface("interface", { required: true }),
    text("dhcp-server", { required: true }),
    text("local-address"),
    check("add-relay-info"),
    comment(),
  ],
);

export const DNS = tabs(
  [
    "dnsSettings",
    form(
      "ip/dns",
      [
        text("servers", { wide: true, placeholder: "1.1.1.1,8.8.8.8" }),
        check("allow-remote-requests"),
        num("max-udp-packet-size"),
        text("query-server-timeout"),
        text("query-total-timeout"),
        num("max-concurrent-queries"),
        num("cache-size"),
        text("cache-max-ttl"),
        text("use-doh-server", {
          wide: true,
          placeholder: "https://cloudflare-dns.com/dns-query",
        }),
        check("verify-doh-cert"),
      ],
      { status: ["dynamic-servers", "cache-used"] },
    ),
  ],
  [
    "dnsStatic",
    table(
      "ip/dns/static",
      ["name", "regexp", "type", "address", "cname", "forward-to", "ttl"],
      [
        text("name"),
        text("regexp"),
        select("type", [
          "A",
          "AAAA",
          "CNAME",
          "FWD",
          "MX",
          "NS",
          "NXDOMAIN",
          "SRV",
          "TXT",
        ]),
        text("address"),
        text("cname"),
        text("forward-to"),
        text("mx-exchange"),
        text("ns"),
        text("text"),
        text("ttl"),
        check("match-subdomain"),
        text("address-list"),
        comment(),
      ],
    ),
  ],
  [
    "dnsCache",
    status("ip/dns/cache", ["name", "type", "data", "ttl"], {
      readOnly: false,
      noAdd: true,
      noEdit: true,
      noToggle: true,
      actions: [action("flushCache", "flush")],
    }),
  ],
  [
    "dnsAdlist",
    table(
      "ip/dns/adlist",
      ["url", "file", "match-count", "name-count"],
      [text("url"), text("file"), check("ssl-verify")],
    ),
    v7,
  ],
);

export const HOTSPOT = tabs(
  [
    "hotspotServers",
    table(
      "ip/hotspot",
      ["name", "interface", "address-pool", "profile", "addresses-per-mac"],
      [
        name(),
        iface("interface", { required: true }),
        ref("address-pool", "ip/pool", { extra: ["none"] }),
        ref("profile", "ip/hotspot/profile"),
        text("idle-timeout"),
        text("keepalive-timeout"),
        text("addresses-per-mac"),
        comment(),
      ],
    ),
  ],
  [
    "hotspotProfiles",
    table(
      "ip/hotspot/profile",
      ["name", "hotspot-address", "dns-name", "html-directory", "login-by"],
      [
        name(),
        text("hotspot-address"),
        text("dns-name"),
        text("html-directory"),
        text("login-by", { wide: true }),
        check("use-radius"),
        text("rate-limit"),
      ],
    ),
  ],
  [
    "hotspotUsers",
    table(
      "ip/hotspot/user",
      [
        "server",
        "name",
        "address",
        "mac-address",
        "profile",
        "uptime",
        "bytes-in",
        "bytes-out",
      ],
      [
        ref("server", "ip/hotspot", { extra: ["all"] }),
        name(),
        secret("password"),
        text("address"),
        text("mac-address"),
        ref("profile", "ip/hotspot/user/profile"),
        text("limit-uptime"),
        text("limit-bytes-total"),
        comment(),
      ],
    ),
  ],
  [
    "hotspotUserProfiles",
    table(
      "ip/hotspot/user/profile",
      ["name", "shared-users", "rate-limit", "session-timeout"],
      [
        name(),
        text("address-pool"),
        text("shared-users"),
        text("rate-limit"),
        text("session-timeout"),
        text("idle-timeout"),
        text("keepalive-timeout"),
        text("address-list"),
      ],
    ),
  ],
  [
    "hotspotActive",
    table(
      "ip/hotspot/active",
      [
        "server",
        "user",
        "address",
        "mac-address",
        "uptime",
        "session-time-left",
        "bytes-in",
        "bytes-out",
      ],
      [],
      { noAdd: true, noEdit: true, noToggle: true, refreshMs: 5000 },
    ),
  ],
  [
    "hotspotHosts",
    table(
      "ip/hotspot/host",
      [
        "mac-address",
        "address",
        "to-address",
        "server",
        "authorized",
        "bypassed",
        "idle-time",
      ],
      [],
      { noAdd: true, noEdit: true, noToggle: true, refreshMs: 5000 },
    ),
  ],
  [
    "hotspotBindings",
    table(
      "ip/hotspot/ip-binding",
      ["mac-address", "address", "to-address", "server", "type"],
      [
        text("mac-address"),
        text("address"),
        text("to-address"),
        ref("server", "ip/hotspot", { extra: ["all"] }),
        select("type", ["regular", "bypassed", "blocked"]),
        comment(),
      ],
    ),
  ],
  [
    "walledGarden",
    table(
      "ip/hotspot/walled-garden",
      ["action", "dst-host", "dst-port", "path", "server"],
      [
        select("action", ["allow", "deny"]),
        text("dst-host"),
        text("dst-port"),
        text("path"),
        text("src-address"),
        ref("server", "ip/hotspot"),
        comment(),
      ],
      { ordered: true },
    ),
  ],
  [
    "walledGardenIp",
    table(
      "ip/hotspot/walled-garden/ip",
      ["action", "dst-address", "dst-host", "protocol", "dst-port"],
      [
        select("action", ["accept", "drop", "reject"]),
        text("dst-address"),
        text("dst-host"),
        text("protocol"),
        text("dst-port"),
        text("src-address"),
        comment(),
      ],
      { ordered: true },
    ),
  ],
);

export const IPSEC = tabs(
  [
    "ipsecPolicies",
    table(
      "ip/ipsec/policy",
      [
        "src-address",
        "dst-address",
        "protocol",
        "action",
        "level",
        "tunnel",
        "peer",
        "proposal",
        "ph2-state",
      ],
      [
        text("src-address"),
        text("dst-address"),
        text("protocol"),
        select("action", ["encrypt", "discard", "none"]),
        select("level", ["require", "unique", "use"]),
        check("tunnel"),
        ref("peer", "ip/ipsec/peer"),
        ref("proposal", "ip/ipsec/proposal"),
        ref("group", "ip/ipsec/policy/group"),
        check("template"),
        text("sa-src-address"),
        text("sa-dst-address"),
        comment(),
      ],
      { ordered: true },
    ),
  ],
  [
    "ipsecProposals",
    table(
      "ip/ipsec/proposal",
      ["name", "auth-algorithms", "enc-algorithms", "pfs-group", "lifetime"],
      [
        name(),
        text("auth-algorithms", { placeholder: "sha256" }),
        text("enc-algorithms", { placeholder: "aes-256-cbc" }),
        select("pfs-group", [
          "none",
          "modp1024",
          "modp2048",
          "modp3072",
          "modp4096",
          "ecp256",
          "ecp384",
          "ecp521",
        ]),
        text("lifetime"),
        comment(),
      ],
    ),
  ],
  [
    "ipsecGroups",
    table("ip/ipsec/policy/group", ["name"], [name(), comment()]),
  ],
  [
    "ipsecPeers",
    table(
      "ip/ipsec/peer",
      [
        "name",
        "address",
        "local-address",
        "profile",
        "exchange-mode",
        "passive",
      ],
      [
        name(),
        text("address"),
        text("local-address"),
        num("port"),
        ref("profile", "ip/ipsec/profile"),
        select("exchange-mode", ["ike2", "main", "aggressive", "ike1"]),
        check("passive"),
        check("send-initial-contact"),
        comment(),
      ],
    ),
  ],
  [
    "ipsecIdentities",
    table(
      "ip/ipsec/identity",
      ["peer", "auth-method", "remote-id", "generate-policy", "mode-config"],
      [
        ref("peer", "ip/ipsec/peer", { required: true }),
        select("auth-method", [
          "pre-shared-key",
          "pre-shared-key-xauth",
          "digital-signature",
          "eap",
          "eap-radius",
          "rsa-key",
          "rsa-signature-hybrid",
        ]),
        secret("secret"),
        ref("certificate", "certificate"),
        ref("remote-certificate", "certificate", { extra: ["none"] }),
        text("my-id"),
        text("remote-id"),
        select("generate-policy", ["no", "port-override", "port-strict"]),
        ref("mode-config", "ip/ipsec/mode-config"),
        ref("policy-template-group", "ip/ipsec/policy/group"),
        text("username"),
        secret("password"),
        comment(),
      ],
    ),
  ],
  [
    "ipsecProfiles",
    table(
      "ip/ipsec/profile",
      [
        "name",
        "hash-algorithm",
        "enc-algorithm",
        "dh-group",
        "lifetime",
        "nat-traversal",
      ],
      [
        name(),
        text("hash-algorithm"),
        text("enc-algorithm"),
        text("dh-group"),
        text("lifetime"),
        check("nat-traversal"),
        text("dpd-interval"),
        num("dpd-maximum-failures"),
        select("proposal-check", ["obey", "claim", "exact", "strict"]),
      ],
    ),
  ],
  [
    "ipsecModeConfigs",
    table(
      "ip/ipsec/mode-config",
      [
        "name",
        "responder",
        "address-pool",
        "address",
        "split-include",
        "system-dns",
      ],
      [
        name(),
        check("responder"),
        ref("address-pool", "ip/pool"),
        text("address"),
        text("split-include"),
        text("static-dns"),
        check("system-dns"),
        text("src-address-list"),
      ],
    ),
  ],
  [
    "ipsecActivePeers",
    table(
      "ip/ipsec/active-peers",
      [
        "id",
        "state",
        "uptime",
        "local-address",
        "remote-address",
        "rx-bytes",
        "tx-bytes",
      ],
      [],
      { noAdd: true, noEdit: true, noToggle: true, refreshMs: 5000 },
    ),
  ],
  [
    "ipsecInstalledSa",
    table(
      "ip/ipsec/installed-sa",
      [
        "spi",
        "src-address",
        "dst-address",
        "state",
        "auth-algorithm",
        "enc-algorithm",
        "current-bytes",
      ],
      [],
      { noAdd: true, noEdit: true, noToggle: true, refreshMs: 5000 },
    ),
  ],
  [
    "ipsecKeys",
    table("ip/ipsec/key", ["name", "key-size"], [], {
      noAdd: true,
      noEdit: true,
      noToggle: true,
    }),
    v6,
  ],
);

export const NEIGHBORS = tabs(
  [
    "neighbors",
    status(
      "ip/neighbor",
      [
        "interface",
        "address",
        "mac-address",
        "identity",
        "platform",
        "version",
        "board",
        "age",
        "discovered-by",
      ],
      { refreshMs: 10000 },
    ),
  ],
  [
    "discoverySettings",
    form("ip/neighbor/discovery-settings", [
      ifaceList("discover-interface-list"),
      text("protocol", { placeholder: "cdp,lldp,mndp" }),
      select("mode", ["rx-only", "tx-only", "tx-and-rx"]),
      text("lldp-med-net-policy-vlan"),
    ]),
  ],
);

export const SERVICES = table(
  "ip/service",
  [
    "name",
    "port",
    "available-from",
    "address",
    "certificate",
    "tls-version",
    "max-sessions",
  ],
  [
    num("port"),
    // address became available-from in later RouterOS v7.
    text("available-from", {
      wide: true,
      placeholder: "192.168.88.0/24",
      onlyIfPresent: true,
    }),
    text("address", {
      wide: true,
      placeholder: "192.168.88.0/24",
      onlyIfPresent: true,
    }),
    ref("certificate", "certificate", { extra: ["none"] }),
    select("tls-version", ["any", "only-1.2"]),
    num("max-sessions"),
    check("vrf"),
  ],
  { noAdd: true, noRemove: true },
);

export const IP_SETTINGS = form(
  "ip/settings",
  [
    check("ip-forward"),
    check("send-redirects"),
    check("accept-source-route"),
    check("accept-redirects"),
    check("secure-redirects"),
    select("rp-filter", ["no", "strict", "loose"]),
    check("tcp-syncookies"),
    check("allow-fast-path"),
    text("arp-timeout"),
    num("max-neighbor-entries"),
    text("icmp-rate-limit"),
  ],
  {
    status: [
      "ipv4-fast-path-active",
      "ipv4-fasttrack-active",
      "ipv4-fasttrack-packets",
      "ipv4-fasttrack-bytes",
    ],
  },
);

export const CLOUD = form(
  "ip/cloud",
  [
    check("ddns-enabled"),
    text("ddns-update-interval"),
    check("update-time"),
    check("back-to-home-vpn"),
  ],
  {
    status: [
      "public-address",
      "public-address-ipv6",
      "dns-name",
      "status",
      "warning",
    ],
    actions: [action("forceUpdate", "force-update")],
    refreshMs: 10000,
  },
);

export const UPNP = tabs(
  [
    "upnpSettings",
    form("ip/upnp", [
      check("enabled"),
      check("allow-disable-external-interface"),
      check("show-dummy-rule"),
    ]),
  ],
  [
    "upnpInterfaces",
    table(
      "ip/upnp/interfaces",
      ["interface", "type", "forced-ip"],
      [
        iface("interface", { required: true }),
        select("type", ["internal", "external"]),
        text("forced-ip"),
      ],
    ),
  ],
);

export const PROXY = tabs(
  [
    "proxySettings",
    form("ip/proxy", [
      check("enabled"),
      num("port"),
      text("src-address"),
      text("parent-proxy"),
      num("parent-proxy-port"),
      check("anonymous"),
      check("cache-on-disk"),
      text("max-cache-size"),
      text("cache-path"),
    ]),
  ],
  [
    "proxyAccess",
    table(
      "ip/proxy/access",
      ["src-address", "dst-address", "dst-host", "dst-port", "path", "action"],
      [
        text("src-address"),
        text("dst-address"),
        text("dst-host"),
        text("dst-port"),
        text("path"),
        select("action", ["allow", "deny"]),
        text("redirect-to"),
        comment(),
      ],
      { ordered: true },
    ),
  ],
);

export const SOCKS = form("ip/socks", [
  check("enabled"),
  num("port"),
  select("version", ["4", "5"]),
  select("auth-method", ["none", "password"]),
  num("max-connections"),
  text("connection-idle-timeout"),
]);

export const SMB = tabs(
  [
    "smbSettings",
    form("ip/smb", [
      select("enabled", ["auto", "yes", "no"]),
      text("domain"),
      text("comment"),
      text("interfaces"),
    ]),
  ],
  [
    "smbShares",
    table(
      "ip/smb/shares",
      ["name", "directory", "valid-users", "read-only"],
      [
        name(),
        text("directory", { required: true }),
        text("valid-users"),
        comment(),
      ],
    ),
  ],
  [
    "smbUsers",
    table(
      "ip/smb/users",
      ["name", "read-only"],
      [name(), secret("password"), check("read-only")],
    ),
  ],
);

export const TFTP = table(
  "ip/tftp",
  ["ip-addresses", "req-filename", "real-filename", "allow", "read-only"],
  [
    text("ip-addresses"),
    text("req-filename"),
    text("real-filename"),
    check("allow"),
    check("read-only"),
    comment(),
  ],
);

export const TRAFFIC_FLOW = tabs(
  [
    "trafficFlowSettings",
    form("ip/traffic-flow", [
      check("enabled"),
      text("interfaces"),
      text("cache-entries"),
      text("active-flow-timeout"),
      text("inactive-flow-timeout"),
    ]),
  ],
  [
    "trafficFlowTargets",
    table(
      "ip/traffic-flow/target",
      ["dst-address", "port", "version", "src-address"],
      [
        text("dst-address", { required: true }),
        num("port", { default: "2055" }),
        select("version", ["1", "5", "9", "IPFIX"]),
        text("src-address"),
      ],
    ),
  ],
);

export const KID_CONTROL = tabs(
  [
    "kidControl",
    table(
      "ip/kid-control",
      [
        "name",
        "mon",
        "tue",
        "wed",
        "thu",
        "fri",
        "sat",
        "sun",
        "rate-limit",
        "blocked",
      ],
      [
        name(),
        text("mon"),
        text("tue"),
        text("wed"),
        text("thu"),
        text("fri"),
        text("sat"),
        text("sun"),
        text("rate-limit"),
        text("tur-mon"),
        comment(),
      ],
    ),
  ],
  [
    "kidControlDevices",
    table(
      "ip/kid-control/device",
      [
        "name",
        "user",
        "mac-address",
        "ip-address",
        "activity",
        "rate-up",
        "rate-down",
      ],
      [
        name(),
        ref("user", "ip/kid-control", { required: true }),
        text("mac-address"),
        comment(),
      ],
    ),
  ],
);

export const SSH = form("ip/ssh", [
  select("forwarding-enabled", ["no", "local", "remote", "both"]),
  check("strong-crypto"),
  // Later v7 replaced always-allow-password-login with password-authentication.
  select("password-authentication", ["yes", "no", "yes-if-no-key"], {
    onlyIfPresent: true,
  }),
  check("always-allow-password-login", { onlyIfPresent: true }),
  num("host-key-size"),
  select("host-key-type", ["rsa", "ed25519"]),
]);

export const SNMP = tabs(
  [
    "snmpSettings",
    form("snmp", [
      check("enabled"),
      text("contact"),
      text("location"),
      text("engine-id-suffix"),
      text("trap-target"),
      ref("trap-community", "snmp/community"),
      select("trap-version", ["1", "2", "3"]),
      text("trap-generators"),
      text("trap-interfaces"),
      text("src-address"),
    ]),
  ],
  [
    "snmpCommunities",
    table(
      "snmp/community",
      ["name", "addresses", "security", "read-access", "write-access"],
      [
        name(),
        text("addresses", { default: "::/0" }),
        select("security", ["none", "authorized", "private"]),
        check("read-access"),
        check("write-access"),
        select("authentication-protocol", ["MD5", "SHA1", "SHA256", "SHA512"]),
        secret("authentication-password"),
        select("encryption-protocol", ["DES", "AES", "AES256"]),
        secret("encryption-password"),
      ],
    ),
  ],
);

export const ACCOUNTING = form("ip/accounting", [
  check("enabled"),
  check("account-local-traffic"),
  num("threshold"),
]);

export const PACKING = table(
  "ip/packing",
  ["interface", "packing", "unpacking", "aggregated-size"],
  [
    iface("interface", { required: true }),
    select("packing", ["none", "simple", "compress-all", "compress-headers"]),
    select("unpacking", ["none", "simple", "compress-all", "compress-headers"]),
    num("aggregated-size"),
  ],
);

// IPv6.

export const IPV6 = {
  addresses: table(
    "ipv6/address",
    ["address", "from-pool", "interface", "advertise", "eui-64", "no-dad"],
    [
      text("address", { required: true }),
      ref("from-pool", "ipv6/pool"),
      iface("interface", { required: true }),
      check("advertise", { default: "yes" }),
      check("eui-64"),
      check("no-dad"),
      comment(),
    ],
  ),
  routes: table(
    "ipv6/route",
    ["dst-address", "gateway", "distance", "routing-table", "scope"],
    [
      text("dst-address", { required: true, default: "::/0" }),
      text("gateway"),
      num("distance"),
      num("scope"),
      ref("routing-table", "routing/table", { extra: ["main"] }),
      select("check-gateway", ["none", "ping", "bfd"]),
      check("blackhole"),
      comment(),
    ],
  ),
  pools: tabs(
    [
      "pools",
      table(
        "ipv6/pool",
        ["name", "prefix", "prefix-length", "expires-after"],
        [
          name(),
          text("prefix", { required: true }),
          num("prefix-length", { required: true }),
          comment(),
        ],
      ),
    ],
    ["used", status("ipv6/pool/used", ["pool", "prefix", "owner", "info"])],
  ),
  dhcpClient: table(
    "ipv6/dhcp-client",
    ["interface", "request", "pool-name", "status", "prefix", "address"],
    [
      iface("interface", { required: true }),
      text("request", {
        options: ["address", "prefix", "address,prefix"],
        required: true,
      }),
      text("pool-name"),
      num("pool-prefix-length"),
      check("add-default-route"),
      check("use-peer-dns", { default: "yes" }),
      check("rapid-commit"),
      area("script"),
      comment(),
    ],
    {
      refreshMs: 5000,
      actions: [
        action("renew", "renew", { perRow: true }),
        action("release", "release", { perRow: true }),
      ],
    },
  ),
  dhcpServer: tabs(
    [
      "dhcp",
      table(
        "ipv6/dhcp-server",
        ["name", "interface", "address-pool", "lease-time"],
        [
          name(),
          iface("interface", { required: true }),
          ref("address-pool", "ipv6/pool"),
          text("lease-time"),
          text("dhcp-option"),
          comment(),
        ],
      ),
    ],
    [
      "bindings",
      table(
        "ipv6/dhcp-server/binding",
        ["address", "duid", "iaid", "server", "status", "expires-after"],
        [
          text("address", { required: true }),
          text("duid", { required: true }),
          num("iaid"),
          ref("server", "ipv6/dhcp-server", { extra: ["all"] }),
          text("life-time"),
          comment(),
        ],
      ),
    ],
  ),
  dhcpRelay: table(
    "ipv6/dhcp-relay",
    ["name", "interface", "dhcp-server", "link-address"],
    [
      name(),
      iface("interface", { required: true }),
      text("dhcp-server", { required: true }),
      text("link-address"),
      comment(),
    ],
  ),
  firewall: tabs(
    ["filter", rules("filter", "ipv6")],
    ["nat", rules("nat", "ipv6"), v7],
    ["mangle", rules("mangle", "ipv6")],
    ["raw", rules("raw", "ipv6")],
    ["connections", connections("ipv6")],
    ["addressLists", addressList("ipv6")],
  ),
  nd: tabs(
    [
      "nd",
      table(
        "ipv6/nd",
        [
          "interface",
          "ra-interval",
          "ra-lifetime",
          "managed-address-configuration",
          "other-configuration",
          "advertise-dns",
        ],
        [
          iface("interface", { required: true, extra: ["all"] }),
          text("ra-interval"),
          text("ra-lifetime"),
          num("hop-limit"),
          num("mtu"),
          check("managed-address-configuration"),
          check("other-configuration"),
          check("advertise-mac-address"),
          check("advertise-dns"),
          text("dns"),
          comment(),
        ],
      ),
    ],
    [
      "ndPrefixes",
      table(
        "ipv6/nd/prefix",
        [
          "prefix",
          "interface",
          "valid-lifetime",
          "preferred-lifetime",
          "autonomous",
          "on-link",
        ],
        [
          text("prefix", { required: true }),
          iface("interface", { required: true }),
          text("valid-lifetime"),
          text("preferred-lifetime"),
          check("autonomous", { default: "yes" }),
          check("on-link", { default: "yes" }),
          comment(),
        ],
      ),
    ],
  ),
  neighbors: status(
    "ipv6/neighbor",
    ["address", "interface", "mac-address", "status"],
    { refreshMs: 5000 },
  ),
  settings: form("ipv6/settings", [
    check("disable-ipv6"),
    check("forward"),
    check("accept-redirects"),
    select("accept-router-advertisements", [
      "yes",
      "no",
      "yes-if-forwarding-disabled",
    ]),
    num("max-neighbor-entries"),
    check("allow-fast-path"),
  ]),
};
