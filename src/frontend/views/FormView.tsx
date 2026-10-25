import { useEffect, useMemo, useState } from "react";
import {
  usePermission,
  useToast,
  useTranslation,
} from "@termix-ssh/plugin-sdk/frontend";
import { Button } from "@termix-ssh/plugin-sdk/ui";
import { RefreshCw } from "lucide-react";
import { app, ros, toCallError } from "../api";
import { Field, TextInput } from "../components/forms";
import type { FormSpec } from "../menus/types";
import { displayValue, isReadOnlyProp, propLabel } from "../props";
import { FieldInput, changedAttrs, initialValues } from "./RecordDialog";
import { useRows } from "./useRows";
import { useArgs, usableFields } from "./refs";
import { TableView } from "./TableView";
import { table } from "../menus/dsl";

/**
 * A menu of settings rather than entries, like IP > DNS or System > Clock:
 * one form, applied with set.
 */
export function FormView({
  hostId,
  spec,
  isVisible,
}: {
  hostId: number;
  spec: FormSpec;
  isVisible: boolean;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const canConfigure = usePermission("configure") && !spec.readOnly;
  const { rows, error, loading, load } = useRows(hostId, spec.path, {
    refreshMs: spec.refreshMs ?? 0,
    isVisible,
  });
  const row = rows?.[0] ?? null;
  const accepted = useArgs(hostId, spec.path, "set");
  const fields = useMemo(
    () => usableFields(spec.fields, row, accepted),
    [spec.fields, row, accepted],
  );
  // Some settings became lists in later versions (OVPN servers, LDP).
  const isList = !!rows && (rows.length !== 1 || ".id" in rows[0]);
  const initial = useMemo(
    () => (row ? initialValues(fields, row) : null),
    [row, fields],
  );
  const [values, setValues] = useState<Record<string, string> | null>(null);
  const [others, setOthers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // A refresh brings the router's values back, unless something is typed.
  const dirty =
    !!values &&
    !!initial &&
    (Object.keys(changedAttrs(fields, values, initial, false)).length > 0 ||
      Object.entries(others).some(([k, v]) => v !== (row?.[k] ?? "")));
  useEffect(() => {
    if (initial && !dirty) {
      setValues(initial);
      setOthers({});
    }
    // dirty is read, not followed: typing must not reset the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  if (isList) {
    return (
      <TableView
        hostId={hostId}
        isVisible={isVisible}
        spec={table(
          spec.path,
          [
            "name",
            ...spec.fields.map((f) => f.key).filter((k) => k !== "name"),
          ].slice(0, 8),
          [{ key: "name", kind: "text" }, ...spec.fields],
        )}
      />
    );
  }

  if (error && !row) {
    return (
      <p role="alert" className="text-xs text-destructive">
        {error.message}
      </p>
    );
  }
  if (!row || !values || !initial) {
    return <p className="text-xs text-muted-foreground">{t("app.loading")}</p>;
  }

  const known = new Set(spec.fields.map((f) => f.key));
  const settable = (k: string) =>
    accepted ? accepted.has(k) : !isReadOnlyProp(k);
  const status = new Set(spec.status ?? []);
  const rest = Object.keys(row).filter(
    (k) => !known.has(k) && !status.has(k) && !k.startsWith("."),
  );
  const editableRest = spec.readOnly ? [] : rest.filter(settable);
  const readOnly = [
    ...(spec.status ?? []).filter((k) => k in row),
    ...rest.filter((k) => spec.readOnly || !settable(k)),
  ];
  const hidden = new Set((row[".hidden"] ?? "").split(",").filter(Boolean));

  const apply = async () => {
    const attrs = changedAttrs(fields, values, initial, false);
    for (const [k, v] of Object.entries(others)) {
      if (v !== (row[k] ?? "")) attrs[k] = v;
    }
    if (!Object.keys(attrs).length) return;
    setBusy(true);
    try {
      await ros(hostId, spec.path, "set", attrs);
      toast.success(t("crud.applied"));
      await load();
    } catch (err) {
      toast.error(toCallError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex max-w-3xl flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {fields
          .filter(
            (f) =>
              (!f.showIf || f.showIf(values)) &&
              (!f.onlyIfPresent || f.key in row),
          )
          .map((field) => (
            <div
              key={field.key}
              className={
                field.wide || field.kind === "textarea"
                  ? "sm:col-span-2"
                  : undefined
              }
            >
              <FieldInput
                hostId={hostId}
                field={field}
                value={values[field.key] ?? ""}
                disabled={!canConfigure}
                hidden={hidden.has(field.key)}
                onChange={(v) =>
                  setValues((s) => ({ ...(s ?? {}), [field.key]: v }))
                }
              />
            </div>
          ))}
      </div>
      {editableRest.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs font-medium">
            {t("crud.otherProperties", { count: editableRest.length })}
          </summary>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {editableRest.map((key) => (
              <Field key={key} label={propLabel(t, key)}>
                <TextInput
                  mono
                  disabled={!canConfigure}
                  value={others[key] ?? row[key] ?? ""}
                  onChange={(v) => setOthers((s) => ({ ...s, [key]: v }))}
                />
              </Field>
            ))}
          </div>
        </details>
      )}
      {readOnly.length > 0 && (
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          {readOnly.map((key) => (
            <div
              key={key}
              className="flex justify-between gap-3 border-b border-border/60 py-1 text-xs"
            >
              <span className="text-muted-foreground">{propLabel(t, key)}</span>
              <span className="truncate font-mono">
                {displayValue(row[key])}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        {canConfigure && (
          <Button
            size="sm"
            disabled={busy || !dirty}
            onClick={() => void apply()}
          >
            {busy ? t("app.working") : t("crud.apply")}
          </Button>
        )}
        {canConfigure && dirty && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setValues(initial);
              setOthers({});
            }}
          >
            {t("crud.revert")}
          </Button>
        )}
        {(spec.actions ?? []).map((action) => (
          <Button
            key={action.id}
            size="sm"
            variant="outline"
            onClick={async () => {
              if (action.confirmKey) {
                const ok = await app().confirm({
                  title: t(action.labelKey),
                  description: t(action.confirmKey),
                  confirmLabel: t(action.labelKey),
                });
                if (!ok) return;
              }
              try {
                await ros(
                  hostId,
                  spec.path,
                  action.command,
                  action.attrs ?? {},
                );
                toast.success(t("crud.done"));
                await load();
              } catch (err) {
                toast.error(toCallError(err).message);
              }
            }}
          >
            {t(action.labelKey)}
          </Button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-7 px-2"
          onClick={() => void load()}
          title={t("app.refresh")}
        >
          <RefreshCw
            className={loading ? "size-3.5 animate-spin" : "size-3.5"}
          />
        </Button>
      </div>
    </div>
  );
}
