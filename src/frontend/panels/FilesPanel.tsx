import { useEffect, useRef, useState } from "react";
import {
  usePermission,
  useToast,
  useTranslation,
} from "@termix-ssh/plugin-sdk/frontend";
import { Button } from "@termix-ssh/plugin-sdk/ui";
import {
  Download,
  FileDown,
  HardDriveDownload,
  RotateCcw,
  Upload,
} from "lucide-react";
import { app, majorOf, ros, toCallError, type Row } from "../api";
import { Field, FormDialog, CheckField, TextInput } from "../components/forms";
import { table } from "../menus/dsl";
import type { ViewProps } from "../menus/types";
import { TableView } from "../views/TableView";
import { Section } from "./widgets";

const FILES = table("file", ["name", "type", "size", "creation-time"], [], {
  noAdd: true,
  noEdit: true,
  noToggle: true,
  refreshMs: 10000,
});

function saveBlob(data: Blob, name: string) {
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const BACKUP_RE = /\.backup$/;

const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");

/**
 * Files, with what WinBox keeps next to it: backups to make, restore and
 * download, an export of the configuration as a script, and uploads such as
 * a .npk to install on the next reboot.
 */
export function FilesPanel({ hostId, info, isVisible }: ViewProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const canAdmin = usePermission("administer");
  const input = useRef<HTMLInputElement>(null);
  const [backup, setBackup] = useState(false);
  const [restore, setRestore] = useState(false);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const identity = (info?.identity ?? "router").replace(
    /[^A-Za-z0-9._-]/g,
    "_",
  );

  const download = async (name: string) => {
    setBusy(name);
    try {
      const { data } = await app().api.get<Blob>(
        `/hosts/${hostId}/files/download`,
        {
          params: { name },
          responseType: "blob",
        },
      );
      saveBlob(data, name.split("/").pop() ?? name);
    } catch (err) {
      toast.error(toCallError(err).message);
    } finally {
      setBusy(null);
    }
  };

  const exportConfig = async (sensitive: boolean) => {
    setBusy("export");
    try {
      const { data } = await app().api.get<string>(`/hosts/${hostId}/export`, {
        params: { sensitive: sensitive ? "1" : "0", major: majorOf(info) },
        responseType: "text",
      });
      saveBlob(
        new Blob([data], { type: "text/plain" }),
        `${identity}-${stamp()}.rsc`,
      );
    } catch (err) {
      toast.error(toCallError(err).message);
    } finally {
      setBusy(null);
    }
  };

  const upload = async (file: File) => {
    setBusy("upload");
    try {
      await app().api.post(`/hosts/${hostId}/files/upload`, file, {
        params: { name: file.name },
        headers: { "Content-Type": "application/octet-stream" },
      });
      toast.success(t("files.uploaded", { name: file.name }));
      setReload((n) => n + 1);
    } catch (err) {
      toast.error(toCallError(err).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {canAdmin && (
        <Section title={t("files.backupTitle")}>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setBackup(true)}>
              <HardDriveDownload className="mr-1 size-3.5" />
              {t("files.backup")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRestore(true)}
            >
              <RotateCcw className="mr-1 size-3.5" />
              {t("files.restore")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy === "export"}
              onClick={() => void exportConfig(false)}
            >
              <FileDown className="mr-1 size-3.5" />
              {t("files.export")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy === "export"}
              onClick={() => void exportConfig(true)}
            >
              <FileDown className="mr-1 size-3.5" />
              {t("files.exportSensitive")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy === "upload"}
              onClick={() => input.current?.click()}
            >
              <Upload className="mr-1 size-3.5" />
              {busy === "upload" ? t("app.working") : t("files.upload")}
            </Button>
            <input
              ref={input}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void upload(file);
              }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">{t("files.hint")}</p>
        </Section>
      )}
      <TableView
        key={reload}
        hostId={hostId}
        spec={FILES}
        isVisible={isVisible}
        selectionToolbar={(selected) =>
          canAdmin ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              title={t("files.download")}
              disabled={
                selected.length !== 1 ||
                selected[0].type === "directory" ||
                !!busy
              }
              onClick={() => void download(selected[0].name)}
            >
              <Download className="size-3.5" />
            </Button>
          ) : null
        }
      />
      {backup && (
        <BackupDialog
          name={`${identity}-${stamp()}`}
          onClose={() => setBackup(false)}
          onSave={async (name, password) => {
            await ros(hostId, "system/backup", "save", {
              name,
              ...(password ? { password } : { "dont-encrypt": "yes" }),
            });
            toast.success(t("files.backupSaved", { name: `${name}.backup` }));
            setReload((n) => n + 1);
          }}
        />
      )}
      {restore && (
        <RestoreDialog
          hostId={hostId}
          onClose={() => setRestore(false)}
          onRestore={async (name, password) => {
            const ok = await app().confirm({
              title: t("files.restoreTitle", { name }),
              description: t("files.restoreDescription"),
              confirmLabel: t("files.restore"),
            });
            if (!ok) return;
            await ros(hostId, "system/backup", "load", { name, password });
            toast.success(t("files.restoring"));
          }}
        />
      )}
    </div>
  );
}

function FilePicker({
  hostId,
  value,
  onChange,
  only,
}: {
  hostId: number;
  value: string;
  onChange: (v: string) => void;
  only?: RegExp;
}) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<Row[]>([]);
  useEffect(() => {
    let live = true;
    void ros(hostId, "file", "print", {}, { proplist: ["name", "type"] })
      .then(
        (r) =>
          live &&
          setFiles(
            r.rows.filter(
              (f) => f.type !== "directory" && (!only || only.test(f.name)),
            ),
          ),
      )
      .catch(() => live && setFiles([]));
    return () => {
      live = false;
    };
  }, [hostId, only]);
  return (
    <Field label={t("files.file")}>
      <TextInput
        value={value}
        onChange={onChange}
        suggestions={files.map((f) => f.name)}
      />
    </Field>
  );
}

function BackupDialog({
  name: initialName,
  onClose,
  onSave,
}: {
  name: string;
  onClose: () => void;
  onSave: (name: string, password: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [encrypt, setEncrypt] = useState(true);
  const [password, setPassword] = useState("");
  return (
    <FormDialog
      title={t("files.backup")}
      submitLabel={t("files.backup")}
      canSubmit={!!name.trim() && (!encrypt || !!password)}
      onClose={onClose}
      onSubmit={() => onSave(name.trim(), encrypt ? password : "")}
    >
      <Field label={t("files.name")}>
        <TextInput value={name} onChange={setName} />
      </Field>
      <CheckField
        label={t("files.encrypt")}
        checked={encrypt}
        onChange={setEncrypt}
      />
      {encrypt && (
        <Field label={t("files.password")}>
          <TextInput type="password" value={password} onChange={setPassword} />
        </Field>
      )}
    </FormDialog>
  );
}

function RestoreDialog({
  hostId,
  onClose,
  onRestore,
}: {
  hostId: number;
  onClose: () => void;
  onRestore: (name: string, password: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  return (
    <FormDialog
      title={t("files.restore")}
      submitLabel={t("files.restore")}
      destructive
      canSubmit={!!name.trim()}
      onClose={onClose}
      onSubmit={() => onRestore(name.trim(), password)}
    >
      <FilePicker
        hostId={hostId}
        value={name}
        onChange={setName}
        only={BACKUP_RE}
      />
      <Field label={t("files.password")}>
        <TextInput type="password" value={password} onChange={setPassword} />
      </Field>
      <p className="text-[11px] text-muted-foreground">
        {t("files.restoreDescription")}
      </p>
    </FormDialog>
  );
}
