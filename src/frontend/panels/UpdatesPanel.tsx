import { useState } from "react";
import {
  usePermission,
  useToast,
  useTranslation,
} from "@termix-ssh/plugin-sdk/frontend";
import { Button } from "@termix-ssh/plugin-sdk/ui";
import { CloudDownload, RefreshCw, Rocket } from "lucide-react";
import { app, ros, toCallError } from "../api";
import { SelectInput } from "../components/forms";
import { PACKAGES } from "../menus/system";
import type { ViewProps } from "../menus/types";
import { TableView } from "../views/TableView";
import { useRows } from "../views/useRows";
import { Fact, Section } from "./widgets";

const CHANNELS = ["stable", "long-term", "testing", "development"];

/** System > Packages and Check For Updates, with the RouterBOARD firmware beside them. */
export function UpdatesPanel({ hostId, info, isVisible }: ViewProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const canAdmin = usePermission("administer");
  const update = useRows(hostId, "system/package/update", { isVisible });
  const board = useRows(hostId, "system/routerboard", {
    isVisible: isVisible && !!info?.routerboard,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const u = update.rows?.[0];
  const rb = board.rows?.[0];

  const run = async (
    id: string,
    path: string,
    command: string,
    attrs: Record<string, string> = {},
    confirm?: { title: string; description: string },
  ) => {
    if (confirm) {
      const ok = await app().confirm({
        ...confirm,
        confirmLabel: confirm.title,
      });
      if (!ok) return;
    }
    setBusy(id);
    try {
      const reply = await ros(hostId, path, command, attrs);
      const status = reply.rows[reply.rows.length - 1]?.status;
      if (status) toast.success(status);
      await update.load();
      await board.load();
    } catch (err) {
      toast.error(toCallError(err).message);
    } finally {
      setBusy(null);
    }
  };

  const newer =
    u?.["latest-version"] && u["latest-version"] !== u["installed-version"];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title={t("updates.title")}>
          <div>
            <Fact label={t("updates.channel")}>
              {canAdmin && u ? (
                <div className="w-40">
                  <SelectInput
                    value={u.channel ?? ""}
                    options={CHANNELS.map((c) => ({ value: c, label: c }))}
                    onChange={(channel) =>
                      void run("channel", "system/package/update", "set", {
                        channel,
                      })
                    }
                  />
                </div>
              ) : (
                (u?.channel ?? "-")
              )}
            </Fact>
            <Fact label={t("updates.installed")}>
              {u?.["installed-version"] ?? info?.resource.version ?? "-"}
            </Fact>
            <Fact label={t("updates.latest")}>
              {u?.["latest-version"] ?? "-"}
            </Fact>
            <Fact label={t("updates.status")}>{u?.status ?? "-"}</Fact>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              disabled={!!busy}
              onClick={() =>
                void run("check", "system/package/update", "check-for-updates")
              }
            >
              <RefreshCw
                className={
                  busy === "check"
                    ? "mr-1 size-3.5 animate-spin"
                    : "mr-1 size-3.5"
                }
              />
              {t("updates.check")}
            </Button>
            {canAdmin && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!busy || !newer}
                  onClick={() =>
                    void run("download", "system/package/update", "download")
                  }
                >
                  <CloudDownload className="mr-1 size-3.5" />
                  {t("updates.download")}
                </Button>
                <Button
                  size="sm"
                  disabled={!!busy || !newer}
                  onClick={() =>
                    void run(
                      "install",
                      "system/package/update",
                      "install",
                      {},
                      {
                        title: t("updates.install"),
                        description: t("updates.installDescription", {
                          version: u?.["latest-version"] ?? "",
                        }),
                      },
                    )
                  }
                >
                  <Rocket className="mr-1 size-3.5" />
                  {t("updates.install")}
                </Button>
              </>
            )}
          </div>
        </Section>
        {rb && (
          <Section title={t("updates.firmware")}>
            <div>
              <Fact label={t("updates.model")}>
                {rb.model ?? rb["board-name"] ?? "-"}
              </Fact>
              <Fact label={t("updates.currentFirmware")}>
                {rb["current-firmware"] ?? "-"}
              </Fact>
              <Fact label={t("updates.upgradeFirmware")}>
                {rb["upgrade-firmware"] ?? "-"}
              </Fact>
            </div>
            {canAdmin && (
              <div className="pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    !!busy ||
                    !rb["upgrade-firmware"] ||
                    rb["upgrade-firmware"] === rb["current-firmware"]
                  }
                  onClick={() =>
                    void run(
                      "firmware",
                      "system/routerboard",
                      "upgrade",
                      {},
                      {
                        title: t("updates.upgradeFirmwareAction"),
                        description: t("updates.upgradeFirmwareDescription"),
                      },
                    )
                  }
                >
                  {t("updates.upgradeFirmwareAction")}
                </Button>
              </div>
            )}
          </Section>
        )}
      </div>
      <Section title={t("updates.packages")}>
        <TableView hostId={hostId} spec={PACKAGES} isVisible={isVisible} />
      </Section>
    </div>
  );
}
