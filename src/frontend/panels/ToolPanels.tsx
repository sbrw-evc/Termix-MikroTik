import { useEffect, useRef, useState } from "react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { Button } from "@termix-ssh/plugin-sdk/ui";
import { Play, Repeat, Square } from "lucide-react";
import { atLeast, ros, toCallError, type Row } from "../api";
import { check, iface, num, ref, secret, select, text } from "../menus/dsl";
import type { FieldSpec, ViewProps } from "../menus/types";
import { formatBps, propLabel } from "../props";
import { FieldInput, initialValues } from "../views/RecordDialog";
import { ResultTable } from "./widgets";

interface ToolSpec {
  path: string[];
  command: string;
  fields: FieldSpec[];
  /** Arguments the tool always sends, like count for ping. */
  fixed?: Record<string, string>;
  columns: string[];
  /** Updates come as numbered sections: keep only the last one. */
  lastSection?: boolean;
  /** Runs again by itself until stopped, like Torch in WinBox. */
  repeat?: boolean;
  /** Formats a column. */
  format?: Record<string, (value: string) => string>;
}

function lastSection(rows: Row[]): Row[] {
  const sections = rows
    .map((r) => r[".section"])
    .filter((s) => s !== undefined);
  if (!sections.length) return rows;
  const last = sections[sections.length - 1];
  return rows.filter((r) => r[".section"] === last);
}

function ToolRunner({
  hostId,
  isVisible,
  spec,
}: ViewProps & { spec: ToolSpec }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [values, setValues] = useState(() => initialValues(spec.fields, null));
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [looping, setLooping] = useState(false);
  const loop = useRef(false);

  const missing = spec.fields.find((f) => f.required && !values[f.key]?.trim());

  const once = async () => {
    const attrs: Record<string, string> = { ...(spec.fixed ?? {}) };
    for (const field of spec.fields) {
      const v = values[field.key]?.trim();
      if (!v) continue;
      if (field.kind === "check") {
        if (v === "yes") attrs[field.key] = "yes";
      } else {
        attrs[field.key] = v;
      }
    }
    const reply = await ros(hostId, spec.path, spec.command, attrs);
    setRows(spec.lastSection ? lastSection(reply.rows) : reply.rows);
  };

  const run = async () => {
    setRunning(true);
    try {
      await once();
    } catch (err) {
      toast.error(toCallError(err).message);
    } finally {
      setRunning(false);
    }
  };

  const start = async () => {
    loop.current = true;
    setLooping(true);
    while (loop.current) {
      try {
        await once();
      } catch (err) {
        toast.error(toCallError(err).message);
        break;
      }
    }
    loop.current = false;
    setLooping(false);
  };

  useEffect(() => {
    if (!isVisible) loop.current = false;
    return () => {
      loop.current = false;
    };
  }, [isVisible]);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3">
        {spec.fields.map((field) => (
          <FieldInput
            key={field.key}
            hostId={hostId}
            field={field}
            value={values[field.key] ?? ""}
            onChange={(v) => setValues((s) => ({ ...s, [field.key]: v }))}
          />
        ))}
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!!missing || running || looping}
          onClick={() => void run()}
        >
          <Play className="mr-1 size-3.5" />
          {running ? t("app.working") : t("tools.start")}
        </Button>
        {spec.repeat &&
          (looping ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => (loop.current = false)}
            >
              <Square className="mr-1 size-3.5" />
              {t("tools.stop")}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={!!missing || running}
              onClick={() => void start()}
            >
              <Repeat className="mr-1 size-3.5" />
              {t("tools.repeat")}
            </Button>
          ))}
      </div>
      <ResultTable
        empty={t("tools.noResults")}
        rows={rows}
        columns={spec.columns.map((key) => ({
          key,
          label: propLabel(t, key),
          render: spec.format?.[key]
            ? (row) => spec.format![key](row[key] ?? "")
            : undefined,
        }))}
      />
    </div>
  );
}

const bps = (v: string) => (v ? formatBps(v) : "");

export function PingPanel(props: ViewProps) {
  const v7 = atLeast(props.info, 7);
  return (
    <ToolRunner
      {...props}
      spec={{
        path: [],
        command: "ping",
        fields: [
          text("address", { required: true, placeholder: "8.8.8.8" }),
          num("count", { default: "4", required: true }),
          num("size"),
          text("interval", { placeholder: "1s" }),
          text("src-address"),
          iface("interface"),
          num("ttl"),
          ...(v7
            ? [ref("routing-table", "routing/table")]
            : [text("routing-table")]),
          check("do-not-fragment"),
        ],
        columns: [
          "seq",
          "host",
          "size",
          "ttl",
          "time",
          "status",
          "sent",
          "received",
          "packet-loss",
          "avg-rtt",
        ],
      }}
    />
  );
}

export function TraceroutePanel(props: ViewProps) {
  return (
    <ToolRunner
      {...props}
      spec={{
        path: ["tool"],
        command: "traceroute",
        fixed: { count: "1" },
        fields: [
          text("address", { required: true, placeholder: "8.8.8.8" }),
          num("max-hops"),
          text("src-address"),
          iface("interface"),
          select("protocol", ["icmp", "udp"]),
          check("use-dns"),
          text("timeout"),
        ],
        columns: [
          "address",
          "loss",
          "sent",
          "last",
          "avg",
          "best",
          "worst",
          "std-dev",
          "status",
        ],
        lastSection: true,
      }}
    />
  );
}

export function TorchPanel(props: ViewProps) {
  return (
    <ToolRunner
      {...props}
      spec={{
        path: ["tool"],
        command: "torch",
        fixed: { duration: "3s" },
        fields: [
          iface("interface", { required: true }),
          text("src-address", { default: "0.0.0.0/0" }),
          text("dst-address", { default: "0.0.0.0/0" }),
          text("port", { default: "any" }),
          text("ip-protocol", { default: "any" }),
          text("mac-protocol"),
          text("vlan-id"),
          text("dscp"),
        ],
        columns: [
          "mac-protocol",
          "ip-protocol",
          "src-address",
          "src-port",
          "dst-address",
          "dst-port",
          "tx",
          "rx",
          "tx-packets",
          "rx-packets",
        ],
        lastSection: true,
        repeat: true,
        format: { tx: bps, rx: bps },
      }}
    />
  );
}

export function IpScanPanel(props: ViewProps) {
  return (
    <ToolRunner
      {...props}
      spec={{
        path: ["tool"],
        command: "ip-scan",
        fields: [
          iface("interface"),
          text("address-range", { placeholder: "192.168.88.0/24" }),
          num("duration", { default: "10", required: true }),
        ],
        columns: ["address", "mac-address", "time", "dns", "snmp", "netbios"],
        lastSection: true,
      }}
    />
  );
}

export function WolPanel(props: ViewProps) {
  return (
    <ToolRunner
      {...props}
      spec={{
        path: ["tool"],
        command: "wol",
        fields: [
          text("mac", { required: true, placeholder: "AA:BB:CC:DD:EE:FF" }),
          iface("interface"),
        ],
        columns: [],
      }}
    />
  );
}

export function BandwidthTestPanel(props: ViewProps) {
  return (
    <ToolRunner
      {...props}
      spec={{
        path: ["tool"],
        command: "bandwidth-test",
        fields: [
          text("address", { required: true }),
          text("user"),
          secret("password"),
          select("direction", ["receive", "transmit", "both"]),
          select("protocol", ["tcp", "udp"]),
          num("duration", { default: "10", required: true }),
          text("local-tx-speed"),
          text("remote-tx-speed"),
          num("connection-count"),
        ],
        columns: [
          "status",
          "duration",
          "tx-current",
          "tx-10-second-average",
          "tx-total-average",
          "rx-current",
          "rx-10-second-average",
          "rx-total-average",
          "lost-packets",
        ],
        lastSection: true,
        format: {
          "tx-current": bps,
          "tx-10-second-average": bps,
          "tx-total-average": bps,
          "rx-current": bps,
          "rx-10-second-average": bps,
          "rx-total-average": bps,
        },
      }}
    />
  );
}

export function ProfilePanel(props: ViewProps) {
  return (
    <ToolRunner
      {...props}
      spec={{
        path: ["tool"],
        command: "profile",
        fixed: { duration: "3" },
        fields: [text("cpu", { default: "total" })],
        columns: ["name", "cpu", "usage"],
        lastSection: true,
        repeat: true,
      }}
    />
  );
}
