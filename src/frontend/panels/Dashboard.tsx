import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { LineChart, Select2 } from "@termix-ssh/plugin-sdk/ui";
import { batch, failed, majorOf, toCallError, type Row } from "../api";
import type { ViewProps } from "../menus/types";
import { displayValue, formatBps, formatBytes, propLabel } from "../props";
import { Fact, Section, Usage } from "./widgets";

const REFRESH_MS = 3000;
const POINTS = 60;

interface Sample {
  at: string;
  cpu: number | null;
  memory: number | null;
  rx: number | null;
  tx: number | null;
}

const pct = (used: number, total: number) =>
  total > 0 ? (used / total) * 100 : null;

/**
 * A router at a glance: its use, health and identity, charts of CPU, memory
 * and one interface's traffic kept while on screen, and its interfaces and
 * addresses.
 */
export function Dashboard({ hostId, info, isVisible }: ViewProps) {
  const { t } = useTranslation();
  const [resource, setResource] = useState<Row | null>(info?.resource ?? null);
  const [health, setHealth] = useState<Row[]>([]);
  const [clock, setClock] = useState<Row | null>(null);
  const [interfaces, setInterfaces] = useState<Row[]>([]);
  const [addresses, setAddresses] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [watched, setWatched] = useState<string>("");
  const [samples, setSamples] = useState<Sample[]>([]);
  const busy = useRef(false);
  const major = majorOf(info);

  useEffect(() => {
    if (!isVisible) return;
    let live = true;
    const tick = async () => {
      if (busy.current || document.hidden) return;
      busy.current = true;
      try {
        const calls = [
          { path: ["system", "resource"], command: "print" },
          { path: ["system", "health"], command: "print" },
          { path: ["system", "clock"], command: "print" },
          {
            path: ["interface"],
            command: "print",
            proplist: ["name", "type", "running", "disabled", "comment"],
          },
          {
            path: ["ip", "address"],
            command: "print",
            proplist: ["address", "interface", "disabled", "dynamic"],
          },
        ];
        if (watched) {
          calls.push({
            path: ["interface"],
            command: "monitor-traffic",
            attrs: { interface: watched, once: "" },
          } as (typeof calls)[number]);
        }
        const [res, hp, ck, ifs, ads, traffic] = await batch(hostId, calls);
        if (!live) return;
        const r = !failed(res) ? (res.rows[0] ?? null) : null;
        setResource(r);
        setHealth(!failed(hp) ? hp.rows : []);
        setClock(!failed(ck) ? (ck.rows[0] ?? null) : null);
        const list = !failed(ifs) ? ifs.rows : [];
        setInterfaces(list);
        setAddresses(!failed(ads) ? ads.rows : []);
        if (!watched) {
          const first =
            list.find((i) => i.running === "true" && i.type === "ether") ??
            list[0];
          if (first) setWatched(first.name);
        }
        const tr = traffic && !failed(traffic) ? traffic.rows[0] : undefined;
        const mem = r
          ? pct(
              Number(r["total-memory"]) - Number(r["free-memory"]),
              Number(r["total-memory"]),
            )
          : null;
        setSamples((s) =>
          [
            ...s,
            {
              at: new Date().toISOString(),
              cpu: r ? Number(r["cpu-load"]) : null,
              memory: mem,
              rx: tr ? Number(tr["rx-bits-per-second"]) : null,
              tx: tr ? Number(tr["tx-bits-per-second"]) : null,
            },
          ].slice(-POINTS),
        );
        setError(null);
      } catch (err) {
        if (live) setError(toCallError(err).message);
      } finally {
        busy.current = false;
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), REFRESH_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [hostId, isVisible, watched]);

  const r = resource;
  const total = Number(r?.["total-memory"] ?? 0);
  const free = Number(r?.["free-memory"] ?? 0);
  const hddTotal = Number(r?.["total-hdd-space"] ?? 0);
  const hddFree = Number(r?.["free-hdd-space"] ?? 0);
  const timestamps = samples.map((s) => s.at);
  const maxRate = Math.max(
    1000,
    ...samples.flatMap((s) => [s.rx ?? 0, s.tx ?? 0]),
  );
  const healthRows =
    major >= 7
      ? health
      : Object.entries(health[0] ?? {})
          .filter(([k]) => !k.startsWith("."))
          .map(([name, value]) => ({ name, value, type: "" }));

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Usage
          label={t("dashboard.cpu")}
          value={r ? Number(r["cpu-load"]) : null}
          detail={
            r
              ? `${r["cpu-count"] ?? 1} × ${r.cpu ?? ""} ${r["cpu-frequency"] ?? ""} MHz`
              : ""
          }
        />
        <Usage
          label={t("dashboard.memory")}
          value={r ? pct(total - free, total) : null}
          detail={
            r ? `${formatBytes(total - free)} / ${formatBytes(total)}` : ""
          }
        />
        <Usage
          label={t("dashboard.storage")}
          value={r ? pct(hddTotal - hddFree, hddTotal) : null}
          detail={
            r
              ? `${formatBytes(hddTotal - hddFree)} / ${formatBytes(hddTotal)}`
              : ""
          }
        />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title={t("dashboard.system")}>
          <div>
            <Fact label={t("dashboard.identity")}>{info?.identity ?? "-"}</Fact>
            <Fact label={t("dashboard.board")}>{r?.["board-name"] ?? "-"}</Fact>
            <Fact label={t("dashboard.version")}>{r?.version ?? "-"}</Fact>
            <Fact label={t("dashboard.architecture")}>
              {r?.["architecture-name"] ?? "-"}
            </Fact>
            <Fact label={t("dashboard.uptime")}>{r?.uptime ?? "-"}</Fact>
            {info?.routerboard?.["serial-number"] && (
              <Fact label={t("dashboard.serial")}>
                {info.routerboard["serial-number"]}
              </Fact>
            )}
            {info?.routerboard?.["current-firmware"] && (
              <Fact label={t("dashboard.firmware")}>
                {info.routerboard["current-firmware"]}
                {info.routerboard["upgrade-firmware"] &&
                  info.routerboard["upgrade-firmware"] !==
                    info.routerboard["current-firmware"] &&
                  ` → ${info.routerboard["upgrade-firmware"]}`}
              </Fact>
            )}
            {clock && (
              <Fact label={t("dashboard.clock")}>
                {clock.date} {clock.time} {clock["time-zone-name"] ?? ""}
              </Fact>
            )}
            <Fact label={t("dashboard.transport")}>
              {info ? t(`transport.${info.transport}`) : "-"}
            </Fact>
          </div>
        </Section>
        <Section title={t("dashboard.health")}>
          {healthRows.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("dashboard.noHealth")}
            </p>
          ) : (
            <div>
              {healthRows.map((h) => (
                <Fact key={h.name} label={propLabel(t, h.name)}>
                  {displayValue(h.value)}{" "}
                  {h.type === "C" ? "°C" : (h.type ?? "")}
                </Fact>
              ))}
            </div>
          )}
        </Section>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="border border-border p-2.5">
          <div className="mb-1 text-xs text-muted-foreground">
            {t("dashboard.cpuMemory")}
          </div>
          <LineChart
            series={[
              {
                key: "cpu",
                label: t("dashboard.cpu"),
                color: "var(--chart-1)",
                data: samples.map((s) => s.cpu),
              },
              {
                key: "memory",
                label: t("dashboard.memory"),
                color: "var(--chart-2)",
                data: samples.map((s) => s.memory),
              },
            ]}
            timestamps={timestamps}
            domain={[0, 100]}
            yFormatter={(v) => `${Math.round(v)}%`}
            height={140}
          />
        </div>
        <div className="border border-border p-2.5">
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span>{t("dashboard.traffic")}</span>
            <Select2
              className="ml-auto h-6 border border-border bg-background px-1 text-xs"
              value={watched}
              onChange={(e) => {
                setWatched(e.target.value);
                setSamples((s) => s.map((x) => ({ ...x, rx: null, tx: null })));
              }}
            >
              {interfaces.map((i) => (
                <option key={i.name} value={i.name}>
                  {i.name}
                </option>
              ))}
            </Select2>
          </div>
          <LineChart
            series={[
              {
                key: "rx",
                label: t("dashboard.rx"),
                color: "var(--chart-1)",
                data: samples.map((s) => s.rx),
              },
              {
                key: "tx",
                label: t("dashboard.tx"),
                color: "var(--chart-2)",
                data: samples.map((s) => s.tx),
              },
            ]}
            timestamps={timestamps}
            domain={[0, maxRate * 1.1]}
            yFormatter={(v) => formatBps(v)}
            height={140}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title={t("dashboard.interfaces")}>
          <div className="flex flex-wrap gap-1">
            {interfaces.map((i) => (
              <span
                key={i.name}
                title={`${i.type}${i.comment ? ` — ${i.comment}` : ""}`}
                className={
                  "border px-1.5 py-0.5 font-mono text-[11px] " +
                  (i.disabled === "true"
                    ? "border-border text-muted-foreground line-through"
                    : i.running === "true"
                      ? "border-emerald-500/50 text-foreground"
                      : "border-border text-muted-foreground")
                }
              >
                {i.name}
              </span>
            ))}
          </div>
        </Section>
        <Section title={t("dashboard.addresses")}>
          <div>
            {addresses.map((a) => (
              <Fact key={`${a.address}-${a.interface}`} label={a.interface}>
                <span
                  className={
                    a.disabled === "true"
                      ? "text-muted-foreground line-through"
                      : "font-mono"
                  }
                >
                  {a.address}
                  {a.dynamic === "true" ? " (D)" : ""}
                </span>
              </Fact>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}
