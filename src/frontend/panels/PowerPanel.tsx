import { useState } from "react";
import {
  usePermission,
  useToast,
  useTranslation,
} from "@termix-ssh/plugin-sdk/frontend";
import { Button } from "@termix-ssh/plugin-sdk/ui";
import { Power, RotateCw, Trash2 } from "lucide-react";
import { ros, toCallError } from "../api";
import { CheckField, Field, FormDialog, TextInput } from "../components/forms";
import type { ViewProps } from "../menus/types";
import { Section } from "./widgets";

type Act = "reboot" | "shutdown" | "reset";

/**
 * System > Reboot, Shutdown and Reset Configuration. Each asks for the
 * router's identity first, since the router goes away, and with it maybe
 * the way Termix reaches it.
 */
export function PowerPanel({ hostId, info }: ViewProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const canAdmin = usePermission("administer");
  const [act, setAct] = useState<Act | null>(null);
  const [typed, setTyped] = useState("");
  const [keepUsers, setKeepUsers] = useState(true);
  const [noDefaults, setNoDefaults] = useState(false);
  const [skipBackup, setSkipBackup] = useState(false);
  const identity = info?.identity ?? "";

  if (!canAdmin) {
    return (
      <p className="text-xs text-muted-foreground">{t("power.needsAdmin")}</p>
    );
  }

  const confirm = async () => {
    try {
      if (act === "reboot") await ros(hostId, "system", "reboot");
      if (act === "shutdown") await ros(hostId, "system", "shutdown");
      if (act === "reset") {
        await ros(hostId, "system", "reset-configuration", {
          "keep-users": keepUsers ? "yes" : "no",
          "no-defaults": noDefaults ? "yes" : "no",
          "skip-backup": skipBackup ? "yes" : "no",
        });
      }
    } catch (err) {
      // The router drops the connection as it goes down: that is success.
      const e = toCallError(err);
      if (e.code !== "ROS_UNREACHABLE" && e.code !== "ROS_TIMEOUT") throw err;
    }
    toast.success(t(`power.${act}Done`));
  };

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Section title={t("power.title")}>
        <p className="text-xs text-muted-foreground">{t("power.hint")}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setAct("reboot")}>
            <RotateCw className="mr-1 size-3.5" />
            {t("power.reboot")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAct("shutdown")}
          >
            <Power className="mr-1 size-3.5" />
            {t("power.shutdown")}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setAct("reset")}
          >
            <Trash2 className="mr-1 size-3.5" />
            {t("power.reset")}
          </Button>
        </div>
      </Section>
      {act && (
        <FormDialog
          title={t(`power.${act}Title`, { name: identity })}
          submitLabel={t(`power.${act}`)}
          destructive
          canSubmit={typed === identity}
          onClose={() => {
            setAct(null);
            setTyped("");
          }}
          onSubmit={confirm}
        >
          <p className="text-xs">{t(`power.${act}Description`)}</p>
          {act === "reset" && (
            <div className="flex flex-col gap-2">
              <CheckField
                label={t("power.keepUsers")}
                checked={keepUsers}
                onChange={setKeepUsers}
              />
              <CheckField
                label={t("power.noDefaults")}
                checked={noDefaults}
                onChange={setNoDefaults}
              />
              <CheckField
                label={t("power.skipBackup")}
                checked={skipBackup}
                onChange={setSkipBackup}
              />
            </div>
          )}
          <Field label={t("power.typeIdentity", { name: identity })}>
            <TextInput
              value={typed}
              onChange={setTyped}
              placeholder={identity}
            />
          </Field>
        </FormDialog>
      )}
    </div>
  );
}
