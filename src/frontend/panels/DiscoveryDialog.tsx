import { useEffect, useState } from "react";
import {
  notifyHostsChanged,
  usePermission,
  useToast,
  useTranslation,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@termix-ssh/plugin-sdk/ui";
import { Plus, RefreshCw } from "lucide-react";
import { app, toCallError } from "../api";

interface Device {
  mac: string;
  identity: string;
  version: string;
  platform: string;
  board: string;
  uptime: number | null;
  interfaceName: string;
  ipv4: string;
  from: string;
  hostId: number | null;
}

function uptimeText(seconds: number | null): string {
  if (seconds === null) return "";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

/**
 * WinBox's Neighbors list: routers that answer MNDP on the Termix server's
 * network, each one a click from becoming a host.
 */
export function DiscoveryDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const canAdd = usePermission("configure");
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [added, setAdded] = useState<Record<string, number>>({});

  const scan = async () => {
    setScanning(true);
    setError(null);
    try {
      const { data } = await app().api.post<{ devices: Device[] }>(
        "/discovery",
        { seconds: 5 },
      );
      setDevices(
        data.devices.sort((a, b) =>
          (a.identity || a.ipv4).localeCompare(b.identity || b.ipv4),
        ),
      );
    } catch (err) {
      setError(toCallError(err).message);
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    void scan();
  }, []);

  const add = async (device: Device) => {
    try {
      const { data } = await app().api.post<{ id: number }>("/discovery/add", {
        ip: device.ipv4 || device.from,
        name: device.identity || device.ipv4,
      });
      setAdded((a) => ({ ...a, [device.mac]: data.id }));
      notifyHostsChanged();
      toast.success(
        t("discovery.added", { name: device.identity || device.ipv4 }),
      );
    } catch (err) {
      toast.error(toCallError(err).message);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t("discovery.title")}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground">{t("discovery.hint")}</p>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto h-7"
            disabled={scanning}
            onClick={() => void scan()}
          >
            <RefreshCw
              className={
                scanning ? "mr-1 size-3.5 animate-spin" : "mr-1 size-3.5"
              }
            />
            {scanning ? t("discovery.scanning") : t("discovery.scan")}
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        <div className="overflow-auto border border-border">
          <table className="w-full border-collapse text-xs">
            <thead className="bg-muted">
              <tr>
                {[
                  "identity",
                  "ipv4",
                  "mac",
                  "version",
                  "board",
                  "interfaceName",
                  "uptime",
                ].map((k) => (
                  <th
                    key={k}
                    className="whitespace-nowrap border-b border-border px-2 py-1 text-left font-medium text-muted-foreground"
                  >
                    {t(`discovery.columns.${k}`)}
                  </th>
                ))}
                <th className="border-b border-border" />
              </tr>
            </thead>
            <tbody>
              {devices?.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-2 py-3 text-muted-foreground">
                    {t("discovery.none")}
                  </td>
                </tr>
              )}
              {devices?.map((d) => (
                <tr key={d.mac || d.from} className="border-b border-border/50">
                  <td className="px-2 py-1 font-medium">{d.identity}</td>
                  <td className="px-2 py-1 font-mono">{d.ipv4 || d.from}</td>
                  <td className="px-2 py-1 font-mono">{d.mac}</td>
                  <td className="px-2 py-1">{d.version}</td>
                  <td className="px-2 py-1">{d.board}</td>
                  <td className="px-2 py-1">{d.interfaceName}</td>
                  <td className="px-2 py-1">{uptimeText(d.uptime)}</td>
                  <td className="px-2 py-1 text-right">
                    {d.hostId || added[d.mac] ? (
                      <Badge variant="outline">{t("discovery.isHost")}</Badge>
                    ) : (
                      canAdd && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6"
                          onClick={() => void add(d)}
                        >
                          <Plus className="mr-1 size-3" />
                          {t("discovery.add")}
                        </Button>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {t("discovery.addHint")}
        </p>
      </DialogContent>
    </Dialog>
  );
}
