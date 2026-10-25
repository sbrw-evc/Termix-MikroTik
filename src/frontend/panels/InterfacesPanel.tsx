import { useEffect, useRef, useState } from "react";
import { ros, type Row } from "../api";
import { INTERFACES } from "../menus/interfaces";
import type { ViewProps } from "../menus/types";
import { formatBps } from "../props";
import { TableView } from "../views/TableView";
import { useRows } from "../views/useRows";

const RATE_MS = 2000;

/**
 * Interface > Interface with live Tx and Rx, as WinBox shows them: one
 * monitor-traffic for every interface at once, every two seconds.
 */
export function InterfacesPanel({ hostId, isVisible }: ViewProps) {
  const { rows } = useRows(hostId, "interface", {
    proplist: ["name"],
    refreshMs: 30000,
    isVisible,
  });
  const [rates, setRates] = useState<Record<string, Row>>({});
  const names = (rows ?? [])
    .map((r) => r.name)
    .filter(Boolean)
    .join(",");
  const busy = useRef(false);

  useEffect(() => {
    if (!isVisible || !names) return;
    let live = true;
    const tick = async () => {
      if (busy.current || document.hidden) return;
      busy.current = true;
      try {
        const reply = await ros(hostId, "interface", "monitor-traffic", {
          interface: names,
          once: "",
        });
        if (live) {
          setRates(Object.fromEntries(reply.rows.map((r) => [r.name, r])));
        }
      } catch {
        // The list still shows; rates come back on the next try.
      } finally {
        busy.current = false;
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), RATE_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [hostId, isVisible, names]);

  return (
    <TableView
      hostId={hostId}
      spec={INTERFACES}
      isVisible={isVisible}
      renderCell={(row, key) => {
        if (key === "tx-rate") {
          const r = rates[row.name];
          return r ? formatBps(r["tx-bits-per-second"]) : "";
        }
        if (key === "rx-rate") {
          const r = rates[row.name];
          return r ? formatBps(r["rx-bits-per-second"]) : "";
        }
        return undefined;
      }}
    />
  );
}
