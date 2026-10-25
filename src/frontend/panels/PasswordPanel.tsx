import { useState } from "react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { Button } from "@termix-ssh/plugin-sdk/ui";
import { ros, toCallError } from "../api";
import { Field, TextInput } from "../components/forms";
import type { ViewProps } from "../menus/types";

/**
 * System > Password: changes the password of the RouterOS user Termix logs
 * in as. The host's saved password has to follow, or the next login fails.
 */
export function PasswordPanel({ hostId }: ViewProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const [oldPassword, setOld] = useState("");
  const [newPassword, setNew] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const mismatch = !!again && newPassword !== again;

  const save = async () => {
    setBusy(true);
    try {
      await ros(hostId, [], "password", {
        "old-password": oldPassword,
        "new-password": newPassword,
        "confirm-new-password": again,
      });
      toast.success(t("password.changed"));
      setOld("");
      setNew("");
      setAgain("");
    } catch (err) {
      toast.error(toCallError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex max-w-sm flex-col gap-3">
      <p className="text-xs text-muted-foreground">{t("password.hint")}</p>
      <Field label={t("password.old")}>
        <TextInput type="password" value={oldPassword} onChange={setOld} />
      </Field>
      <Field label={t("password.new")}>
        <TextInput type="password" value={newPassword} onChange={setNew} />
      </Field>
      <Field
        label={t("password.again")}
        error={mismatch ? t("password.mismatch") : undefined}
      >
        <TextInput type="password" value={again} onChange={setAgain} />
      </Field>
      <div>
        <Button
          size="sm"
          disabled={busy || !newPassword || mismatch || !again}
          onClick={() => void save()}
        >
          {busy ? t("app.working") : t("password.change")}
        </Button>
      </div>
    </div>
  );
}
