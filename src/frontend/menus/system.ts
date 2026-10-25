import {
  action,
  has,
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

export const IDENTITY = form("system/identity", [
  text("name", { required: true }),
]);

export const CLOCK = tabs(
  [
    "clock",
    form(
      "system/clock",
      [
        text("time"),
        text("date"),
        check("time-zone-autodetect"),
        text("time-zone-name", { placeholder: "Europe/Moscow" }),
      ],
      {
        status: ["gmt-offset", "dst-active"],
        refreshMs: 5000,
      },
    ),
  ],
  [
    "clockManual",
    form("system/clock/manual", [
      text("time-zone"),
      text("dst-delta"),
      text("dst-start"),
      text("dst-end"),
    ]),
  ],
);

export const NTP = tabs(
  [
    "ntpClient",
    form(
      "system/ntp/client",
      [
        check("enabled"),
        select("mode", ["unicast", "broadcast", "multicast", "manycast"]),
        text("servers", { wide: true }),
        text("primary-ntp"),
        text("secondary-ntp"),
        text("server-dns-names", { wide: true }),
        text("vrf"),
      ],
      {
        status: [
          "status",
          "synced-server",
          "synced-stratum",
          "system-offset",
          "freq-drift",
          "last-update-from",
          "last-update-before",
        ],
        refreshMs: 10000,
      },
    ),
  ],
  [
    "ntpServers",
    table(
      "system/ntp/client/servers",
      ["address", "auth-key", "iburst", "max-poll", "min-poll"],
      [
        text("address", { required: true }),
        check("iburst"),
        num("min-poll"),
        num("max-poll"),
        comment(),
      ],
    ),
    v7,
  ],
  [
    "ntpServer",
    form("system/ntp/server", [
      check("enabled"),
      check("broadcast"),
      check("multicast"),
      check("manycast"),
      text("broadcast-addresses"),
      check("use-local-clock"),
      num("local-clock-stratum"),
      text("vrf"),
    ]),
    v7,
  ],
);

export const USERS = tabs(
  [
    "users",
    table(
      "user",
      ["name", "group", "address", "last-logged-in"],
      [
        name(),
        ref("group", "user/group", { required: true }),
        secret("password"),
        text("address", { wide: true }),
        text("inactivity-timeout"),
        text("inactivity-policy"),
        comment(),
      ],
    ),
  ],
  [
    "groups",
    table(
      "user/group",
      ["name", "policy", "skin"],
      [
        name(),
        text("policy", {
          required: true,
          wide: true,
          placeholder:
            "read,write,test,winbox,web,api,ssh,ftp,reboot,policy,password,sniff,sensitive,romon,local,telnet",
        }),
        text("skin"),
        comment(),
      ],
    ),
  ],
  [
    "activeUsers",
    status("user/active", ["name", "when", "address", "via", "group"], {
      refreshMs: 10000,
    }),
  ],
  [
    "sshKeys",
    table(
      "user/ssh-keys",
      ["user", "key-type", "bits", "fingerprint", "info"],
      [],
      {
        noAdd: true,
        noEdit: true,
        noToggle: true,
      },
    ),
  ],
  [
    "userSettings",
    form("user/settings", [
      num("minimum-password-length"),
      num("minimum-categories"),
    ]),
    v7,
  ],
  [
    "aaa",
    form("user/aaa", [
      check("use-radius"),
      check("accounting"),
      text("interim-update"),
      ref("default-group", "user/group"),
      check("exclude-groups"),
    ]),
  ],
);

export const PACKAGES = table(
  "system/package",
  ["name", "version", "build-time", "size", "scheduled"],
  [],
  {
    noAdd: true,
    noEdit: true,
    noRemove: true,
    actions: [
      action("uninstall", "uninstall", {
        perRow: true,
        confirmKey: "confirm.uninstall",
      }),
      action("unschedule", "unschedule", { perRow: true }),
    ],
  },
);

export const ROUTERBOARD = tabs(
  [
    "routerboard",
    form("system/routerboard", [], {
      readOnly: true,
      status: [
        "routerboard",
        "board-name",
        "model",
        "revision",
        "serial-number",
        "firmware-type",
        "factory-firmware",
        "current-firmware",
        "upgrade-firmware",
      ],
    }),
  ],
  [
    "routerboardSettings",
    form("system/routerboard/settings", [
      check("auto-upgrade"),
      select("boot-device", [
        "nand-if-fail-then-ethernet",
        "try-ethernet-once-then-nand",
        "flash-boot",
        "flash-boot-once-then-nand",
        "ethernet",
      ]),
      text("cpu-frequency"),
      check("protected-routerboot"),
      select("boot-os", ["router-os", "swos"]),
      text("baud-rate"),
      check("silent-boot"),
    ]),
  ],
  [
    "routerboardModeButton",
    form("system/routerboard/mode-button", [
      check("enabled"),
      ref("on-event", "system/script"),
    ]),
  ],
  [
    "routerboardResetButton",
    form("system/routerboard/reset-button", [
      check("enabled"),
      text("hold-time"),
      ref("on-event", "system/script"),
    ]),
  ],
);

export const RESOURCES = tabs(
  [
    "resources",
    form("system/resource", [], { readOnly: true, refreshMs: 5000 }),
  ],
  [
    "cpu",
    status("system/resource/cpu", ["cpu", "load", "irq", "disk"], {
      refreshMs: 3000,
    }),
  ],
  [
    "irq",
    status("system/resource/irq", [
      "irq",
      "users",
      "cpu",
      "active-cpu",
      "count",
    ]),
  ],
  [
    "usb",
    status("system/resource/usb", [
      "device",
      "name",
      "vendor",
      "speed",
      "ports",
    ]),
    has("system/resource/usb"),
  ],
  [
    "pci",
    status("system/resource/pci", [
      "device",
      "name",
      "vendor",
      "category",
      "irq",
    ]),
    has("system/resource/pci"),
  ],
);

export const HEALTH = tabs(
  [
    "health",
    status("system/health", ["name", "value", "type"], { refreshMs: 10000 }),
    v7,
  ],
  [
    "health",
    form("system/health", [], { readOnly: true, refreshMs: 10000 }),
    v6,
  ],
  [
    "healthSettings",
    form("system/health/settings", [
      text("cpu-overtemp-threshold"),
      text("cpu-overtemp-check-interval"),
      text("fan-mode"),
      text("fan-switch"),
      text("fan-on-threshold"),
    ]),
    v7,
  ],
);

export const HISTORY = status("system/history", [
  "action",
  "by",
  "policy",
  "time",
]);

export const LICENSE = form("system/license", [], { readOnly: true });

export const LOGGING = tabs(
  [
    "loggingRules",
    table(
      "system/logging",
      ["topics", "prefix", "action"],
      [
        text("topics", {
          required: true,
          wide: true,
          options: [
            "info",
            "warning",
            "error",
            "critical",
            "debug",
            "firewall",
            "dhcp",
            "wireless",
            "system",
            "ppp",
            "account",
            "interface",
          ],
        }),
        text("prefix"),
        ref("action", "system/logging/action", { required: true }),
        comment(),
      ],
      { ordered: true },
    ),
  ],
  [
    "loggingActions",
    table(
      "system/logging/action",
      [
        "name",
        "target",
        "memory-lines",
        "disk-file-name",
        "remote",
        "remote-port",
      ],
      [
        name(),
        select("target", ["memory", "disk", "echo", "remote", "email"]),
        num("memory-lines"),
        text("disk-file-name"),
        num("disk-lines-per-file"),
        num("disk-file-count"),
        text("remote"),
        num("remote-port", { default: "514" }),
        text("src-address"),
        check("bsd-syslog"),
        select("syslog-facility", [
          "kern",
          "user",
          "mail",
          "daemon",
          "auth",
          "syslog",
          "lpr",
          "news",
          "uucp",
          "cron",
          "local0",
          "local1",
          "local2",
          "local3",
          "local4",
          "local5",
          "local6",
          "local7",
        ]),
        select("syslog-severity", [
          "auto",
          "emergency",
          "alert",
          "critical",
          "error",
          "warning",
          "notice",
          "info",
          "debug",
        ]),
        check("remember"),
        text("email-to"),
      ],
    ),
  ],
);

export const SCHEDULER = table(
  "system/scheduler",
  [
    "name",
    "start-date",
    "start-time",
    "interval",
    "owner",
    "run-count",
    "next-run",
  ],
  [
    name(),
    text("start-date", { placeholder: "jan/01/2026" }),
    text("start-time", { placeholder: "startup" }),
    text("interval", { placeholder: "1d" }),
    text("policy", { wide: true }),
    area("on-event", { required: true }),
    comment(),
  ],
);

export const SCRIPTS = tabs(
  [
    "scripts",
    table(
      "system/script",
      ["name", "owner", "policy", "last-started", "run-count"],
      [
        name(),
        text("policy", { wide: true }),
        check("dont-require-permissions"),
        area("source", { wide: true }),
        comment(),
      ],
      {
        actions: [
          action("runScript", "run", {
            perRow: true,
            confirmKey: "confirm.runScript",
          }),
        ],
      },
    ),
  ],
  [
    "scriptJobs",
    table(
      "system/script/job",
      ["script", "owner", "policy", "started", "type"],
      [],
      { noAdd: true, noEdit: true, noToggle: true, refreshMs: 3000 },
    ),
  ],
  [
    "scriptEnvironment",
    table("system/script/environment", ["name", "value"], [], {
      noAdd: true,
      noEdit: true,
      noToggle: true,
    }),
  ],
);

export const CERTIFICATES = table(
  "certificate",
  [
    "name",
    "common-name",
    "issuer",
    "key-type",
    "invalid-after",
    "trusted",
    "fingerprint",
  ],
  [
    name(),
    text("common-name", { required: true }),
    text("subject-alt-name", { placeholder: "DNS:router.lan,IP:192.168.88.1" }),
    select("key-type", ["rsa", "ec"]),
    select("key-size", [
      "1024",
      "2048",
      "4096",
      "prime256v1",
      "secp384r1",
      "secp521r1",
    ]),
    num("days-valid", { default: "365" }),
    text("key-usage", { wide: true }),
    text("country"),
    text("state"),
    text("locality"),
    text("organization"),
    text("unit"),
    check("trusted"),
  ],
  {
    actions: [
      action("signCertificate", "sign", { perRow: true }),
      action("exportCertificate", "export-certificate", { perRow: true }),
    ],
  },
);

export const LEDS = tabs(
  [
    "leds",
    table(
      "system/leds",
      ["interface", "leds", "type"],
      [
        iface("interface"),
        text("leds"),
        select("type", [
          "align-down",
          "align-left",
          "align-right",
          "align-up",
          "flash-access",
          "interface-activity",
          "interface-receive",
          "interface-speed",
          "interface-status",
          "interface-transmit",
          "modem-signal",
          "modem-technology",
          "off",
          "on",
          "poe-out",
          "wireless-signal-strength",
          "wireless-status",
        ]),
        comment(),
      ],
    ),
  ],
  [
    "ledsSettings",
    form("system/leds/settings", [
      select("all-leds-off", ["never", "after-1h", "after-1min", "immediate"]),
    ]),
  ],
);

export const WATCHDOG = form("system/watchdog", [
  check("watchdog-timer"),
  text("watch-address"),
  text("ping-timeout"),
  num("ping-start-after-boot"),
  check("automatic-supout"),
  check("auto-send-supout"),
  text("send-email-to"),
]);

export const DISKS = table(
  "disk",
  ["slot", "type", "model", "size", "free", "fs"],
  [],
  { noAdd: true, noEdit: true, noToggle: true },
);

export const PORTS = table(
  "port",
  ["name", "used-by", "baud-rate", "channels"],
  [num("baud-rate"), select("flow-control", ["none", "hardware", "xon-xoff"])],
  { noAdd: true, noRemove: true, noToggle: true },
);

export const CONSOLE_SCREEN = form("system/console/screen", [
  select("blank-interval", ["10min", "never"]),
  select("line-count", ["25", "40", "50"]),
]);

// Queues.

export const QUEUES = tabs(
  [
    "simpleQueues",
    table(
      "queue/simple",
      [
        "name",
        "target",
        "max-limit",
        "limit-at",
        "rate",
        "packet-rate",
        "bytes",
      ],
      [
        name(),
        text("target", {
          required: true,
          wide: true,
          placeholder: "192.168.88.10/32",
        }),
        text("dst"),
        text("max-limit", { placeholder: "10M/10M" }),
        text("limit-at"),
        text("burst-limit"),
        text("burst-threshold"),
        text("burst-time"),
        text("priority", { placeholder: "8/8" }),
        text("queue", { placeholder: "default-small/default-small" }),
        ref("parent", "queue/simple", { extra: ["none"] }),
        text("packet-marks"),
        text("time"),
        comment(),
      ],
      {
        ordered: true,
        printAttrs: { stats: "" },
        refreshMs: 3000,
        actions: [
          action("resetCounters", "reset-counters", { perRow: true }),
          action("resetCountersAll", "reset-counters-all"),
        ],
      },
    ),
  ],
  [
    "queueTree",
    table(
      "queue/tree",
      [
        "name",
        "parent",
        "packet-mark",
        "limit-at",
        "max-limit",
        "priority",
        "rate",
        "bytes",
      ],
      [
        name(),
        ref("parent", "interface", { required: true, extra: ["global"] }),
        text("packet-mark"),
        text("limit-at"),
        text("max-limit"),
        num("priority"),
        text("queue"),
        text("burst-limit"),
        text("burst-threshold"),
        text("burst-time"),
        comment(),
      ],
      { printAttrs: { stats: "" }, refreshMs: 3000 },
    ),
  ],
  [
    "interfaceQueues",
    table(
      "queue/interface",
      ["interface", "queue", "active-queue"],
      [ref("queue", "queue/type")],
      { noAdd: true, noRemove: true, noToggle: true },
    ),
  ],
  [
    "queueTypes",
    table(
      "queue/type",
      [
        "name",
        "kind",
        "pfifo-limit",
        "pcq-rate",
        "pcq-classifier",
        "pcq-limit",
      ],
      [
        name(),
        select("kind", [
          "bfifo",
          "pfifo",
          "mq-pfifo",
          "red",
          "sfq",
          "pcq",
          "none",
          "fq-codel",
          "codel",
          "cake",
        ]),
        num("pfifo-limit"),
        num("bfifo-limit"),
        text("pcq-rate"),
        text("pcq-classifier", {
          options: ["src-address", "dst-address", "src-port", "dst-port"],
        }),
        num("pcq-limit"),
        num("pcq-total-limit"),
        text("cake-bandwidth"),
        comment(),
      ],
    ),
  ],
);

// Tools that are lists or settings; the live ones have panels of their own.

export const NETWATCH = table(
  "tool/netwatch",
  ["host", "type", "interval", "timeout", "status", "since"],
  [
    text("host", { required: true }),
    select("type", [
      "simple",
      "icmp",
      "tcp-conn",
      "http-get",
      "https-get",
      "dns",
    ]),
    text("interval", { placeholder: "10s" }),
    text("timeout"),
    num("port"),
    area("up-script"),
    area("down-script"),
    area("test-script"),
    comment(),
  ],
  { refreshMs: 5000 },
);

export const GRAPHING = tabs(
  [
    "graphingSettings",
    form("tool/graphing", [text("store-every"), text("page-refresh")]),
  ],
  [
    "graphingInterfaces",
    table(
      "tool/graphing/interface",
      ["interface", "allow-address", "store-on-disk"],
      [
        iface("interface", { extra: ["all"] }),
        text("allow-address"),
        check("store-on-disk"),
      ],
    ),
  ],
  [
    "graphingQueues",
    table(
      "tool/graphing/queue",
      ["simple-queue", "allow-address", "store-on-disk", "allow-target"],
      [
        ref("simple-queue", "queue/simple", { extra: ["all"] }),
        text("allow-address"),
        check("store-on-disk"),
        check("allow-target"),
      ],
    ),
  ],
  [
    "graphingResources",
    table(
      "tool/graphing/resource",
      ["allow-address", "store-on-disk"],
      [text("allow-address"), check("store-on-disk")],
    ),
  ],
);

export const BTEST_SERVER = form("tool/bandwidth-server", [
  check("enabled"),
  check("authenticate"),
  num("allocate-udp-ports-from"),
  num("max-sessions"),
]);

export const MAC_SERVER = tabs(
  ["macTelnet", form("tool/mac-server", [ifaceList("allowed-interface-list")])],
  [
    "macWinbox",
    form("tool/mac-server/mac-winbox", [ifaceList("allowed-interface-list")]),
  ],
  ["macPing", form("tool/mac-server/ping", [check("enabled")])],
  [
    "macSessions",
    status("tool/mac-server/sessions", ["interface", "src-address", "uptime"]),
  ],
);

export const ROMON = tabs(
  [
    "romonSettings",
    form("tool/romon", [check("enabled"), text("id"), secret("secrets")]),
  ],
  [
    "romonPorts",
    table(
      "tool/romon/port",
      ["interface", "forbid", "cost"],
      [
        iface("interface", { extra: ["all"] }),
        check("forbid"),
        num("cost"),
        secret("secrets"),
      ],
    ),
  ],
);

export const TRAFFIC_MONITOR = table(
  "tool/traffic-monitor",
  ["name", "interface", "traffic", "trigger", "threshold"],
  [
    name(),
    iface("interface", { required: true }),
    select("traffic", ["transmitted", "received"]),
    select("trigger", ["above", "always", "below"]),
    num("threshold"),
    area("on-event"),
    comment(),
  ],
);

export const EMAIL = form("tool/e-mail", [
  text("server", { required: true }),
  num("port"),
  select("tls", ["no", "yes", "starttls"]),
  text("from"),
  text("user"),
  secret("password"),
  text("vrf"),
]);

export const SNIFFER = form(
  "tool/sniffer",
  [
    ifaceList("filter-interface"),
    text("filter-ip-address"),
    text("filter-mac-address"),
    text("filter-port"),
    text("filter-ip-protocol"),
    text("file-name"),
    num("file-limit"),
    text("streaming-server"),
    check("streaming-enabled"),
  ],
  { status: ["running"] },
);

export const RADIUS = tabs(
  [
    "radius",
    table(
      "radius",
      [
        "service",
        "address",
        "authentication-port",
        "accounting-port",
        "timeout",
        "src-address",
      ],
      [
        text("service", {
          required: true,
          options: [
            "ppp",
            "login",
            "hotspot",
            "wireless",
            "dhcp",
            "ipsec",
            "dot1x",
          ],
        }),
        text("address", { required: true }),
        secret("secret"),
        num("authentication-port", { default: "1812" }),
        num("accounting-port", { default: "1813" }),
        text("timeout"),
        text("src-address"),
        text("realm"),
        text("domain"),
        comment(),
      ],
    ),
  ],
  [
    "radiusIncoming",
    form("radius/incoming", [
      check("accept"),
      num("port", { default: "3799" }),
    ]),
  ],
);

export const CONTAINER = tabs(
  [
    "containers",
    table(
      "container",
      ["name", "tag", "os", "arch", "interface", "status", "root-dir"],
      [
        text("remote-image", { placeholder: "library/nginx:latest" }),
        text("file"),
        ref("interface", "interface/veth", { required: true }),
        text("root-dir", { required: true }),
        text("envlist"),
        text("mounts"),
        text("hostname"),
        text("dns"),
        text("cmd"),
        text("entrypoint"),
        check("start-on-boot"),
        check("logging"),
        comment(),
      ],
      {
        noToggle: true,
        refreshMs: 5000,
        actions: [
          action("start", "start", { perRow: true }),
          action("stop", "stop", { perRow: true }),
        ],
      },
    ),
  ],
  [
    "containerConfig",
    form("container/config", [
      text("registry-url"),
      text("username"),
      secret("password"),
      text("tmpdir"),
      text("ram-high"),
      text("layer-dir"),
    ]),
  ],
  [
    "containerEnvs",
    table(
      "container/envs",
      ["name", "key", "value"],
      [name(), text("key", { required: true }), text("value")],
    ),
  ],
  [
    "containerMounts",
    table(
      "container/mounts",
      ["name", "src", "dst"],
      [
        name(),
        text("src", { required: true }),
        text("dst", { required: true }),
      ],
    ),
  ],
);

export const DEVICE_MODE = form("system/device-mode", [], { readOnly: true });
export const UPS = table(
  "system/ups",
  ["name", "port", "offline-time", "min-runtime", "alarm-setting"],
  [
    name(),
    ref("port", "port"),
    text("offline-time"),
    text("min-runtime"),
    select("alarm-setting", ["immediate", "delayed", "none"]),
    comment(),
  ],
);

export const SPECIAL_LOGIN = table(
  "special-login",
  ["user", "port"],
  [ref("user", "user"), ref("port", "port")],
);

export const USER_MANAGER = tabs(
  [
    "umSettings",
    form("user-manager", [
      check("enabled"),
      num("authentication-port"),
      num("accounting-port"),
      text("certificate"),
    ]),
  ],
  [
    "umRouters",
    table(
      "user-manager/router",
      ["name", "address", "coa-port"],
      [
        name(),
        text("address", { required: true }),
        secret("shared-secret"),
        num("coa-port"),
      ],
    ),
  ],
  [
    "umUsers",
    table(
      "user-manager/user",
      ["name", "group", "shared-users", "attributes"],
      [
        name(),
        secret("password"),
        ref("group", "user-manager/user/group"),
        num("shared-users"),
        text("attributes"),
        comment(),
      ],
    ),
  ],
  [
    "umGroups",
    table(
      "user-manager/user/group",
      ["name", "outer-auths", "inner-auths", "attributes"],
      [name(), text("outer-auths"), text("inner-auths"), text("attributes")],
    ),
  ],
  [
    "umProfiles",
    table(
      "user-manager/profile",
      ["name", "validity", "price", "name-for-users"],
      [name(), text("validity"), text("price"), text("name-for-users")],
    ),
  ],
  [
    "umSessions",
    status("user-manager/session", [
      "user",
      "nas-ip-address",
      "calling-station-id",
      "user-address",
      "started",
      "uptime",
      "status",
    ]),
  ],
);

export const MPLS = tabs(
  [
    "mplsLdp",
    form("mpls/ldp", [
      check("enabled"),
      text("lsr-id"),
      text("transport-address"),
    ]),
  ],
  [
    "mplsLdpInterfaces",
    table(
      "mpls/ldp/interface",
      ["interface", "hello-interval", "hold-time"],
      [
        iface("interface", { required: true }),
        text("hello-interval"),
        text("hold-time"),
      ],
    ),
  ],
  [
    "mplsForwarding",
    status("mpls/forwarding-table", [
      "in-label",
      "out-labels",
      "destination",
      "interface",
      "nexthop",
    ]),
  ],
);
