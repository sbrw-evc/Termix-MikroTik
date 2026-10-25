import {
  area,
  check,
  comment,
  form,
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
} from "./dsl";

// RouterOS v7: routing was rewritten, with instances, templates and filter rules.

export const BGP_V7 = tabs(
  [
    "bgpConnections",
    table(
      "routing/bgp/connection",
      [
        "name",
        "as",
        "remote.address",
        "remote.as",
        "local.role",
        "routing-table",
        "address-families",
      ],
      [
        name(),
        text("as", { required: true }),
        text("remote.address", { required: true }),
        text("remote.as"),
        select("local.role", [
          "ebgp",
          "ibgp",
          "ebgp-customer",
          "ebgp-peer",
          "ebgp-provider",
          "ebgp-rs",
          "ebgp-rs-client",
          "ibgp-rr",
          "ibgp-rr-client",
        ]),
        text("local.address"),
        text("router-id"),
        ref("templates", "routing/bgp/template"),
        text("address-families", {
          options: ["ip", "ipv6", "ip,ipv6", "l2vpn", "vpnv4"],
        }),
        ref("input.filter", "routing/filter/rule", { refKey: "chain" }),
        ref("output.filter-chain", "routing/filter/rule", { refKey: "chain" }),
        ref("output.network", "ip/firewall/address-list", { refKey: "list" }),
        text("output.redistribute", {
          options: [
            "connected",
            "static",
            "ospf",
            "rip",
            "bgp",
            "connected,static",
          ],
        }),
        select("output.default-originate", ["never", "if-installed", "always"]),
        check("multihop"),
        check("connect", { default: "yes" }),
        check("listen", { default: "yes" }),
        text("hold-time"),
        text("keepalive-time"),
        secret("tcp-md5-key"),
        ref("routing-table", "routing/table", { extra: ["main"] }),
        text("vrf"),
        comment(),
      ],
    ),
  ],
  [
    "bgpTemplates",
    table(
      "routing/bgp/template",
      ["name", "as", "address-families", "routing-table"],
      [
        name(),
        text("as"),
        text("address-families"),
        ref("input.filter", "routing/filter/rule", { refKey: "chain" }),
        ref("output.filter-chain", "routing/filter/rule", { refKey: "chain" }),
        text("output.redistribute"),
        check("multihop"),
        text("hold-time"),
        comment(),
      ],
    ),
  ],
  [
    "bgpSessions",
    table(
      "routing/bgp/session",
      [
        "name",
        "remote.address",
        "remote.as",
        "established",
        "uptime",
        "prefix-count",
        "remote.messages",
      ],
      [],
      {
        noAdd: true,
        noEdit: true,
        noToggle: true,
        noRemove: true,
        refreshMs: 5000,
      },
    ),
  ],
);

export const OSPF_V7 = tabs(
  [
    "ospfInstances",
    table(
      "routing/ospf/instance",
      [
        "name",
        "version",
        "router-id",
        "vrf",
        "redistribute",
        "originate-default",
      ],
      [
        name(),
        select("version", ["2", "3"]),
        text("router-id"),
        text("vrf"),
        text("redistribute", {
          options: ["connected", "static", "bgp", "rip", "connected,static"],
        }),
        select("originate-default", ["never", "if-installed", "always"]),
        ref("in-filter-chain", "routing/filter/rule", { refKey: "chain" }),
        ref("out-filter-chain", "routing/filter/rule", { refKey: "chain" }),
        comment(),
      ],
    ),
  ],
  [
    "ospfAreas",
    table(
      "routing/ospf/area",
      ["name", "instance", "area-id", "type", "default-cost"],
      [
        name(),
        ref("instance", "routing/ospf/instance", { required: true }),
        text("area-id", { required: true, default: "0.0.0.0" }),
        select("type", ["default", "stub", "nssa"]),
        num("default-cost"),
        check("no-summaries"),
        comment(),
      ],
    ),
  ],
  [
    "ospfTemplates",
    table(
      "routing/ospf/interface-template",
      ["area", "interfaces", "networks", "type", "cost", "priority", "passive"],
      [
        ref("area", "routing/ospf/area", { required: true }),
        iface("interfaces", { wide: true }),
        text("networks", { wide: true }),
        select("type", [
          "broadcast",
          "nbma",
          "ptp",
          "ptmp",
          "ptp-unnumbered",
          "virtual-link",
        ]),
        num("cost"),
        num("priority"),
        check("passive"),
        select("auth", ["md5", "sha1", "sha256", "sha384", "sha512", "simple"]),
        secret("auth-key"),
        text("hello-interval"),
        text("dead-interval"),
        comment(),
      ],
    ),
  ],
  [
    "ospfInterfaces",
    status(
      "routing/ospf/interface",
      [
        "address",
        "area",
        "state",
        "network-type",
        "cost",
        "priority",
        "dr",
        "bdr",
      ],
      { refreshMs: 5000 },
    ),
  ],
  [
    "ospfNeighbors",
    status(
      "routing/ospf/neighbor",
      [
        "instance",
        "area",
        "address",
        "router-id",
        "state",
        "state-changes",
        "adjacency",
      ],
      { refreshMs: 5000 },
    ),
  ],
  [
    "ospfLsa",
    status("routing/ospf/lsa", [
      "instance",
      "area",
      "type",
      "id",
      "originator",
      "sequence",
      "age",
    ]),
  ],
  [
    "ospfStaticNeighbors",
    table(
      "routing/ospf/static-neighbor",
      ["address", "area", "poll-interval"],
      [
        text("address", { required: true }),
        ref("area", "routing/ospf/area", { required: true }),
        text("poll-interval"),
        comment(),
      ],
    ),
  ],
);

export const RIP_V7 = tabs(
  [
    "ripInstances",
    table(
      "routing/rip/instance",
      ["name", "afi", "redistribute", "originate-default"],
      [
        name(),
        select("afi", ["ipv4", "ipv6"]),
        text("redistribute"),
        select("originate-default", ["never", "if-installed", "always"]),
        ref("in-filter-chain", "routing/filter/rule", { refKey: "chain" }),
        ref("out-filter-chain", "routing/filter/rule", { refKey: "chain" }),
        comment(),
      ],
    ),
  ],
  [
    "ripTemplates",
    table(
      "routing/rip/interface-template",
      ["instance", "interfaces", "mode", "cost"],
      [
        ref("instance", "routing/rip/instance", { required: true }),
        iface("interfaces", { wide: true }),
        select("mode", ["passive", "strict"]),
        num("cost"),
        comment(),
      ],
    ),
  ],
  [
    "ripNeighbors",
    status("routing/rip/neighbor", [
      "instance",
      "address",
      "routes",
      "packets-total",
    ]),
  ],
);

export const FILTERS_V7 = tabs(
  [
    "filterRules",
    table(
      "routing/filter/rule",
      ["chain", "rule"],
      [
        text("chain", { required: true }),
        area("rule", {
          required: true,
          placeholder: "if (dst in 10.0.0.0/8) { accept }",
        }),
        comment(),
      ],
      { ordered: true },
    ),
  ],
  [
    "numLists",
    table(
      "routing/filter/num-list",
      ["list", "range"],
      [
        text("list", { required: true }),
        text("range", { required: true }),
        comment(),
      ],
    ),
  ],
  [
    "communityLists",
    table(
      "routing/filter/community-list",
      ["list", "communities", "regexp"],
      [
        text("list", { required: true }),
        text("communities"),
        text("regexp"),
        comment(),
      ],
    ),
  ],
);

export const ROUTING_TABLES = table(
  "routing/table",
  ["name", "fib"],
  [name(), check("fib", { default: "yes" }), comment()],
);

export const ROUTER_ID = table(
  "routing/id",
  ["name", "id", "select-dynamic-id", "select-from-vrf", "dynamic-id"],
  [
    name(),
    text("id"),
    text("select-dynamic-id", {
      options: [
        "any",
        "only-active",
        "only-loopback",
        "only-static",
        "only-vrf",
      ],
    }),
    text("select-from-vrf"),
    comment(),
  ],
);

export const BFD_V7 = tabs(
  [
    "bfdConfiguration",
    table(
      "routing/bfd/configuration",
      ["interfaces", "addresses", "min-rx", "min-tx", "multiplier"],
      [
        iface("interfaces"),
        text("addresses"),
        text("min-rx"),
        text("min-tx"),
        num("multiplier"),
        check("forbid-bfd"),
        comment(),
      ],
      { ordered: true },
    ),
  ],
  [
    "bfdSessions",
    status(
      "routing/bfd/session",
      ["remote-address", "local-address", "interface", "state", "uptime"],
      { refreshMs: 5000 },
    ),
  ],
);

export const IGMP_PROXY = table(
  "routing/igmp-proxy/interface",
  ["interface", "upstream", "alternative-subnets", "threshold"],
  [
    iface("interface", { required: true }),
    check("upstream"),
    text("alternative-subnets"),
    num("threshold"),
    comment(),
  ],
);

export const ROUTES_TABLE = status("routing/route", [
  "dst-address",
  "gateway",
  "distance",
  "routing-table",
  "belongs-to",
  "afi",
]);

// RouterOS v6.

export const BGP_V6 = tabs(
  [
    "bgpInstances",
    table(
      "routing/bgp/instance",
      [
        "name",
        "as",
        "router-id",
        "redistribute-connected",
        "redistribute-static",
      ],
      [
        name(),
        text("as", { required: true }),
        text("router-id"),
        check("redistribute-connected"),
        check("redistribute-static"),
        check("redistribute-ospf"),
        check("redistribute-rip"),
        check("client-to-client-reflection"),
        ref("out-filter", "routing/filter", { refKey: "chain" }),
        comment(),
      ],
    ),
  ],
  [
    "bgpPeers",
    table(
      "routing/bgp/peer",
      [
        "name",
        "instance",
        "remote-address",
        "remote-as",
        "state",
        "prefix-count",
        "uptime",
      ],
      [
        name(),
        ref("instance", "routing/bgp/instance", { required: true }),
        text("remote-address", { required: true }),
        text("remote-as", { required: true }),
        text("update-source"),
        text("ttl"),
        check("multihop"),
        check("route-reflect"),
        text("hold-time"),
        select("nexthop-choice", ["default", "force-self", "propagate"]),
        ref("in-filter", "routing/filter", { refKey: "chain" }),
        ref("out-filter", "routing/filter", { refKey: "chain" }),
        text("address-families"),
        select("default-originate", ["never", "if-installed", "always"]),
        secret("tcp-md5-key"),
        comment(),
      ],
      { refreshMs: 5000 },
    ),
  ],
  [
    "bgpNetworks",
    table(
      "routing/bgp/network",
      ["network", "synchronize"],
      [text("network", { required: true }), check("synchronize"), comment()],
    ),
  ],
  [
    "bgpAggregates",
    table(
      "routing/bgp/aggregate",
      ["prefix", "instance", "summary-only"],
      [
        text("prefix", { required: true }),
        ref("instance", "routing/bgp/instance", { required: true }),
        check("summary-only"),
        comment(),
      ],
    ),
  ],
  [
    "bgpAdvertisements",
    status("routing/bgp/advertisements", [
      "peer",
      "prefix",
      "nexthop",
      "as-path",
      "origin",
    ]),
  ],
);

export const OSPF_V6 = tabs(
  [
    "ospfInstances",
    table(
      "routing/ospf/instance",
      [
        "name",
        "router-id",
        "redistribute-connected",
        "redistribute-static",
        "distribute-default",
      ],
      [
        name(),
        text("router-id"),
        select("distribute-default", [
          "never",
          "if-installed-as-type-1",
          "if-installed-as-type-2",
          "always-as-type-1",
          "always-as-type-2",
        ]),
        select("redistribute-connected", ["no", "as-type-1", "as-type-2"]),
        select("redistribute-static", ["no", "as-type-1", "as-type-2"]),
        select("redistribute-bgp", ["no", "as-type-1", "as-type-2"]),
        ref("in-filter", "routing/filter", { refKey: "chain" }),
        ref("out-filter", "routing/filter", { refKey: "chain" }),
        comment(),
      ],
    ),
  ],
  [
    "ospfAreas",
    table(
      "routing/ospf/area",
      ["name", "area-id", "type", "instance"],
      [
        name(),
        text("area-id", { required: true }),
        select("type", ["default", "stub", "nssa"]),
        ref("instance", "routing/ospf/instance"),
        comment(),
      ],
    ),
  ],
  [
    "ospfNetworks",
    table(
      "routing/ospf/network",
      ["network", "area"],
      [
        text("network", { required: true }),
        ref("area", "routing/ospf/area", { required: true }),
        comment(),
      ],
    ),
  ],
  [
    "ospfInterfacesV6",
    table(
      "routing/ospf/interface",
      [
        "interface",
        "cost",
        "priority",
        "network-type",
        "passive",
        "authentication",
      ],
      [
        iface("interface", { required: true, extra: ["all"] }),
        num("cost"),
        num("priority"),
        select("network-type", [
          "default",
          "broadcast",
          "nbma",
          "point-to-point",
          "ptmp",
        ]),
        check("passive"),
        select("authentication", ["none", "simple", "md5"]),
        secret("authentication-key"),
        comment(),
      ],
    ),
  ],
  [
    "ospfNeighbors",
    status(
      "routing/ospf/neighbor",
      [
        "instance",
        "router-id",
        "address",
        "interface",
        "state",
        "state-changes",
      ],
      { refreshMs: 5000 },
    ),
  ],
  [
    "ospfLsa",
    status("routing/ospf/lsa", [
      "instance",
      "area",
      "type",
      "id",
      "originator",
      "sequence-number",
      "age",
    ]),
  ],
  [
    "ospfNbma",
    table(
      "routing/ospf/nbma-neighbor",
      ["address", "instance", "poll-interval", "priority"],
      [
        text("address", { required: true }),
        ref("instance", "routing/ospf/instance"),
        text("poll-interval"),
        num("priority"),
        comment(),
      ],
    ),
  ],
);

export const RIP_V6 = tabs(
  [
    "ripSettings",
    form("routing/rip", [
      select("distribute-default", ["never", "if-installed", "always"]),
      check("redistribute-connected"),
      check("redistribute-static"),
      check("redistribute-ospf"),
      check("redistribute-bgp"),
      num("metric-default"),
      text("update-timer"),
      text("timeout-timer"),
      text("garbage-timer"),
    ]),
  ],
  [
    "ripInterfaces",
    table(
      "routing/rip/interface",
      ["interface", "send", "receive", "passive", "authentication"],
      [
        iface("interface", { required: true, extra: ["all"] }),
        select("send", ["v1", "v1-2", "v2"]),
        select("receive", ["v1", "v1-2", "v2"]),
        check("passive"),
        select("authentication", ["none", "simple", "md5"]),
        secret("authentication-key"),
        comment(),
      ],
    ),
  ],
  [
    "ripNetworks",
    table(
      "routing/rip/network",
      ["network"],
      [text("network", { required: true }), comment()],
    ),
  ],
  [
    "ripNeighbors",
    table(
      "routing/rip/neighbor",
      ["address"],
      [text("address", { required: true }), comment()],
    ),
  ],
  [
    "ripRoutes",
    status("routing/rip/route", [
      "dst-address",
      "gateway",
      "metric",
      "from",
      "timeout",
    ]),
  ],
);

export const FILTERS_V6 = table(
  "routing/filter",
  [
    "chain",
    "prefix",
    "prefix-length",
    "protocol",
    "action",
    "set-distance",
    "set-bgp-local-pref",
  ],
  [
    text("chain", { required: true }),
    text("prefix"),
    text("prefix-length"),
    text("protocol"),
    text("match-chain"),
    select("action", [
      "accept",
      "discard",
      "jump",
      "log",
      "passthrough",
      "reject",
      "return",
    ]),
    text("jump-target"),
    num("set-distance"),
    num("set-bgp-local-pref"),
    text("set-bgp-prepend"),
    text("set-bgp-communities"),
    text("set-routing-mark"),
    text("bgp-as-path"),
    text("bgp-communities"),
    comment(),
  ],
  { ordered: true },
);

export const BFD_V6 = table(
  "routing/bfd/interface",
  ["interface", "interval", "min-rx", "multiplier"],
  [
    iface("interface", { required: true, extra: ["all"] }),
    text("interval"),
    text("min-rx"),
    num("multiplier"),
    comment(),
  ],
);
