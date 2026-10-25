import {
  action,
  check,
  comment,
  iface,
  name,
  num,
  ref,
  secret,
  select,
  status,
  table,
  tabs,
  text,
  v7,
  has,
} from "./dsl";
import type { FieldSpec, TableSpec, ViewSpec } from "./types";

const ARP = [
  "enabled",
  "disabled",
  "proxy-arp",
  "reply-only",
  "local-proxy-arp",
];
const FRAME_TYPES = [
  "admit-all",
  "admit-only-untagged-and-priority-tagged",
  "admit-only-vlan-tagged",
];

const mtu = (): FieldSpec => num("mtu");
const arp = (): FieldSpec => select("arp", ARP);

/** Interface > Interface, the list of every interface with its traffic. */
export const INTERFACES: TableSpec = table(
  "interface",
  [
    "name",
    "type",
    "actual-mtu",
    "l2mtu",
    "tx-rate",
    "rx-rate",
    "tx-byte",
    "rx-byte",
    "link-downs",
  ],
  [name(), mtu(), num("l2mtu"), comment()],
  {
    noAdd: true,
    noRemove: true,
    refreshMs: 3000,
    actions: [
      action("resetCounters", "reset-counters", { perRow: true }),
      action("resetCountersAll", "reset-counters-all"),
    ],
  },
);

export const ETHERNET = table(
  "interface/ethernet",
  [
    "name",
    "default-name",
    "mtu",
    "l2mtu",
    "mac-address",
    "auto-negotiation",
    "switch",
    "arp",
  ],
  [
    name(),
    mtu(),
    num("l2mtu"),
    text("mac-address"),
    arp(),
    check("auto-negotiation"),
    text("advertise", { wide: true }),
    text("speed"),
    check("full-duplex"),
    select("poe-out", ["auto-on", "forced-on", "off"]),
    comment(),
  ],
  {
    noAdd: true,
    noRemove: true,
    actions: [
      action("resetCounters", "reset-counters", { perRow: true }),
      action("resetMac", "reset-mac-address", { perRow: true }),
      action("blink", "blink", { perRow: true }),
    ],
  },
);

export const VLAN = table(
  "interface/vlan",
  ["name", "vlan-id", "interface", "mtu", "arp"],
  [
    name(),
    num("vlan-id", { required: true }),
    iface("interface", { required: true }),
    mtu(),
    arp(),
    check("use-service-tag"),
    comment(),
  ],
);

export const BONDING = table(
  "interface/bonding",
  ["name", "slaves", "mode", "mtu", "transmit-hash-policy"],
  [
    name(),
    iface("slaves", { required: true, wide: true, hintKey: "hints.commaList" }),
    select("mode", [
      "balance-rr",
      "active-backup",
      "balance-xor",
      "broadcast",
      "802.3ad",
      "balance-tlb",
      "balance-alb",
    ]),
    select("transmit-hash-policy", [
      "layer-2",
      "layer-2-and-3",
      "layer-3-and-4",
      "encap-2-and-3",
      "encap-3-and-4",
    ]),
    select("lacp-rate", ["30secs", "1sec"]),
    select("link-monitoring", ["mii", "arp", "none"]),
    text("mii-interval"),
    iface("primary", { extra: ["none"] }),
    mtu(),
    comment(),
  ],
);

const tunnel = (extra: FieldSpec[] = []): FieldSpec[] => [
  name(),
  text("local-address"),
  text("remote-address", { required: true }),
  ...extra,
  mtu(),
  text("keepalive", { placeholder: "10s,10" }),
  secret("ipsec-secret"),
  check("allow-fast-path"),
  check("clamp-tcp-mss"),
  comment(),
];

export const EOIP = table(
  "interface/eoip",
  ["name", "tunnel-id", "local-address", "remote-address", "mtu"],
  tunnel([num("tunnel-id", { required: true }), text("mac-address"), arp()]),
);

export const GRE = table(
  "interface/gre",
  ["name", "local-address", "remote-address", "mtu"],
  tunnel(),
);

export const IPIP = table(
  "interface/ipip",
  ["name", "local-address", "remote-address", "mtu"],
  tunnel(),
);

export const SIX_TO_FOUR = table(
  "interface/6to4",
  ["name", "local-address", "remote-address", "mtu"],
  tunnel(),
);

export const VXLAN = table(
  "interface/vxlan",
  ["name", "vni", "port", "interface", "mtu"],
  [
    name(),
    num("vni", { required: true }),
    num("port", { default: "8472" }),
    iface("interface"),
    text("group"),
    text("local-address"),
    mtu(),
    arp(),
    comment(),
  ],
);

export const VXLAN_VTEPS = table(
  "interface/vxlan/vteps",
  ["interface", "remote-ip", "port"],
  [
    ref("interface", "interface/vxlan", { required: true }),
    text("remote-ip", { required: true }),
    num("port"),
    comment(),
  ],
);

export const VRRP = table(
  "interface/vrrp",
  ["name", "interface", "vrid", "priority", "interval", "version"],
  [
    name(),
    iface("interface", { required: true }),
    num("vrid", { required: true }),
    num("priority", { default: "100" }),
    text("interval"),
    select("version", ["2", "3"]),
    check("preemption-mode"),
    select("authentication", ["none", "simple", "ah"]),
    secret("password"),
    text("on-master"),
    text("on-backup"),
    comment(),
  ],
);

export const MACVLAN = table(
  "interface/macvlan",
  ["name", "interface", "mode", "mac-address"],
  [
    name(),
    iface("interface", { required: true }),
    select("mode", ["private", "bridge"]),
    text("mac-address"),
    mtu(),
    comment(),
  ],
);

export const VETH = table(
  "interface/veth",
  ["name", "address", "gateway", "gateway6"],
  [
    name(),
    text("address", { required: true }),
    text("gateway"),
    text("gateway6"),
    comment(),
  ],
);

export const LTE = table(
  "interface/lte",
  ["name", "mtu", "apn-profiles", "allow-roaming"],
  [
    name(),
    mtu(),
    ref("apn-profiles", "interface/lte/apn"),
    check("allow-roaming"),
    select("network-mode", ["auto", "3g", "lte", "5g", "gsm"]),
    text("band"),
    comment(),
  ],
  { noAdd: true },
);

export const LTE_APN = table(
  "interface/lte/apn",
  ["name", "apn", "ip-type", "use-peer-dns", "add-default-route"],
  [
    name(),
    text("apn"),
    select("ip-type", ["auto", "ipv4", "ipv4-ipv6", "ipv6"]),
    text("user"),
    secret("password"),
    select("authentication", ["none", "chap", "pap"]),
    check("add-default-route"),
    num("default-route-distance"),
    check("use-peer-dns"),
    comment(),
  ],
);

export const INTERFACE_LISTS = table(
  "interface/list",
  ["name", "include", "exclude"],
  [
    name(),
    ref("include", "interface/list"),
    ref("exclude", "interface/list"),
    comment(),
  ],
);

export const INTERFACE_LIST_MEMBERS = table(
  "interface/list/member",
  ["list", "interface"],
  [
    ref("list", "interface/list", { required: true }),
    iface("interface", { required: true }),
    comment(),
  ],
);

export const WIREGUARD = table(
  "interface/wireguard",
  ["name", "listen-port", "mtu", "public-key"],
  [
    name(),
    num("listen-port"),
    mtu(),
    secret("private-key", { hintKey: "hints.wgPrivateKey" }),
    comment(),
  ],
);

export const WIREGUARD_PEERS = table(
  "interface/wireguard/peers",
  [
    "interface",
    "name",
    "endpoint-address",
    "endpoint-port",
    "allowed-address",
    "last-handshake",
    "rx",
    "tx",
  ],
  [
    ref("interface", "interface/wireguard", { required: true }),
    text("name"),
    text("public-key", { required: true, wide: true }),
    secret("preshared-key"),
    text("endpoint-address"),
    num("endpoint-port"),
    text("allowed-address", {
      required: true,
      wide: true,
      placeholder: "10.0.0.2/32",
    }),
    text("persistent-keepalive", { placeholder: "25s" }),
    text("client-address"),
    text("client-dns"),
    text("client-endpoint"),
    text("client-allowed-address"),
    comment(),
  ],
  { refreshMs: 5000 },
);

/**
 * Interfaces, as WinBox's Interface window with a tab per type. The first
 * tab is the live list, drawn by a panel of its own.
 */
export const interfaceTabs = (list: ViewSpec) =>
  tabs(
    ["interface", list],
    ["ethernet", ETHERNET],
    ["eoip", EOIP],
    ["gre", GRE],
    ["ipip", IPIP],
    ["sixToFour", SIX_TO_FOUR],
    ["vlan", VLAN],
    ["vxlan", VXLAN, has("interface/vxlan")],
    ["vxlanVteps", VXLAN_VTEPS, has("interface/vxlan")],
    ["vrrp", VRRP],
    ["bonding", BONDING],
    ["macvlan", MACVLAN, v7],
    ["veth", VETH, has("container")],
    ["lte", LTE, has("interface/lte")],
    ["lteApn", LTE_APN, has("interface/lte")],
    ["interfaceList", INTERFACE_LISTS],
    ["interfaceListMembers", INTERFACE_LIST_MEMBERS],
  );

// Bridge.

export const BRIDGE = tabs(
  [
    "bridge",
    table(
      "interface/bridge",
      ["name", "protocol-mode", "vlan-filtering", "pvid", "mtu", "mac-address"],
      [
        name(),
        select("protocol-mode", ["none", "stp", "rstp", "mstp"]),
        check("vlan-filtering"),
        num("pvid"),
        select("frame-types", FRAME_TYPES),
        check("ingress-filtering"),
        check("igmp-snooping"),
        check("dhcp-snooping"),
        check("fast-forward"),
        check("auto-mac"),
        text("admin-mac"),
        arp(),
        mtu(),
        num("priority"),
        text("ageing-time"),
        comment(),
      ],
    ),
  ],
  [
    "ports",
    table(
      "interface/bridge/port",
      ["interface", "bridge", "pvid", "frame-types", "horizon", "role", "hw"],
      [
        iface("interface", { required: true }),
        ref("bridge", "interface/bridge", { required: true }),
        num("pvid"),
        select("frame-types", FRAME_TYPES),
        check("ingress-filtering"),
        text("horizon"),
        select("edge", ["auto", "no", "no-discover", "yes", "yes-discover"]),
        select("point-to-point", ["auto", "yes", "no"]),
        select("learn", ["auto", "yes", "no"]),
        check("hw"),
        check("trusted"),
        text("priority"),
        num("path-cost"),
        comment(),
      ],
    ),
  ],
  [
    "vlans",
    table(
      "interface/bridge/vlan",
      [
        "bridge",
        "vlan-ids",
        "tagged",
        "untagged",
        "current-tagged",
        "current-untagged",
      ],
      [
        ref("bridge", "interface/bridge", { required: true }),
        text("vlan-ids", { required: true, placeholder: "10,20-30" }),
        iface("tagged", { wide: true, hintKey: "hints.commaList" }),
        iface("untagged", { wide: true, hintKey: "hints.commaList" }),
        comment(),
      ],
    ),
  ],
  [
    "msti",
    table(
      "interface/bridge/msti",
      ["bridge", "identifier", "vlan-mapping", "priority"],
      [
        ref("bridge", "interface/bridge", { required: true }),
        num("identifier", { required: true }),
        text("vlan-mapping", { required: true }),
        text("priority"),
        comment(),
      ],
    ),
  ],
  [
    "filters",
    table(
      "interface/bridge/filter",
      [
        "chain",
        "action",
        "in-interface",
        "out-interface",
        "mac-protocol",
        "src-mac-address",
        "dst-mac-address",
        "bytes",
        "packets",
      ],
      [
        select("chain", ["forward", "input", "output"], { required: true }),
        select("action", [
          "accept",
          "drop",
          "jump",
          "log",
          "mark-packet",
          "passthrough",
          "return",
          "set-priority",
        ]),
        text("jump-target"),
        iface("in-interface"),
        iface("out-interface"),
        ref("in-bridge", "interface/bridge"),
        text("mac-protocol"),
        text("src-mac-address"),
        text("dst-mac-address"),
        text("src-address"),
        text("dst-address"),
        num("vlan-id"),
        text("new-packet-mark"),
        comment(),
      ],
      { ordered: true, printAttrs: { stats: "" } },
    ),
  ],
  [
    "nat",
    table(
      "interface/bridge/nat",
      [
        "chain",
        "action",
        "in-interface",
        "out-interface",
        "src-mac-address",
        "dst-mac-address",
        "bytes",
        "packets",
      ],
      [
        select("chain", ["srcnat", "dstnat"], { required: true }),
        select("action", [
          "accept",
          "arp-reply",
          "drop",
          "dst-nat",
          "jump",
          "log",
          "mark-packet",
          "passthrough",
          "redirect",
          "return",
          "set-priority",
          "src-nat",
        ]),
        text("to-src-mac-address"),
        text("to-dst-mac-address"),
        text("to-arp-reply-mac-address"),
        iface("in-interface"),
        iface("out-interface"),
        text("mac-protocol"),
        text("src-mac-address"),
        text("dst-mac-address"),
        comment(),
      ],
      { ordered: true, printAttrs: { stats: "" } },
    ),
  ],
  [
    "hosts",
    status(
      "interface/bridge/host",
      [
        "mac-address",
        "on-interface",
        "bridge",
        "interface",
        "vid",
        "local",
        "external",
      ],
      {
        actions: [action("flush", "flush")],
      },
    ),
  ],
  [
    "mdb",
    status("interface/bridge/mdb", ["group", "on-ports", "bridge", "vid"]),
  ],
  [
    "bridgeSettings",
    {
      kind: "form",
      path: "interface/bridge/settings",
      fields: [
        check("use-ip-firewall"),
        check("use-ip-firewall-for-vlan"),
        check("use-ip-firewall-for-pppoe"),
        check("allow-fast-path"),
      ],
    },
  ],
);

export const SWITCH = tabs(
  [
    "switch",
    table(
      "interface/ethernet/switch",
      ["name", "type", "mirror-target", "l3-hw-offloading"],
      [
        name(),
        iface("mirror-source", { onlyIfPresent: true }),
        iface("mirror-target"),
        check("l3-hw-offloading", { onlyIfPresent: true }),
        check("qos-hw-offloading", { onlyIfPresent: true }),
      ],
      { noAdd: true, noRemove: true },
    ),
  ],
  [
    "switchPorts",
    table(
      "interface/ethernet/switch/port",
      ["name", "switch", "mirror-ingress", "mirror-egress", "storm-rate"],
      [
        check("mirror-ingress", { onlyIfPresent: true }),
        check("mirror-egress", { onlyIfPresent: true }),
        num("storm-rate", { onlyIfPresent: true }),
        check("limit-broadcasts", { onlyIfPresent: true }),
        check("l3-hw-offloading", { onlyIfPresent: true }),
        // The older QCA switch chips.
        select("vlan-mode", ["disabled", "check", "fallback", "secure"], {
          onlyIfPresent: true,
        }),
        select(
          "vlan-header",
          ["add-if-missing", "always-strip", "leave-as-is"],
          {
            onlyIfPresent: true,
          },
        ),
        text("default-vlan-id", { onlyIfPresent: true }),
      ],
      { noAdd: true, noRemove: true },
    ),
  ],
  [
    "switchVlans",
    table(
      "interface/ethernet/switch/vlan",
      ["switch", "vlan-id", "ports", "independent-learning"],
      [
        text("switch", { required: true }),
        num("vlan-id", { required: true }),
        iface("ports", { wide: true }),
        check("independent-learning"),
        comment(),
      ],
    ),
    has("interface/ethernet/switch/vlan"),
  ],
  [
    "switchRules",
    table(
      "interface/ethernet/switch/rule",
      [
        "switch",
        "ports",
        "src-mac-address",
        "dst-mac-address",
        "new-dst-ports",
        "new-vlan-id",
      ],
      [
        text("switch", { required: true }),
        iface("ports"),
        text("src-mac-address"),
        text("dst-mac-address"),
        text("vlan-id"),
        text("new-dst-ports"),
        text("new-vlan-id"),
        check("redirect-to-cpu"),
        comment(),
      ],
      { ordered: true },
    ),
  ],
  [
    "switchHosts",
    status("interface/ethernet/switch/host", [
      "switch",
      "mac-address",
      "ports",
      "vlan-id",
      "dynamic",
    ]),
    has("interface/ethernet/switch/host"),
  ],
);
