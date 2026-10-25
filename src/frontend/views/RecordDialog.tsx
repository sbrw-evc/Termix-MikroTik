import { useMemo, useState } from "react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { ros, type Row } from "../api";
import {
  CheckField,
  Field,
  FormDialog,
  SelectInput,
  TextArea,
  TextInput,
} from "../components/forms";
import type { FieldSpec } from "../menus/types";
import { displayValue, isReadOnlyProp, propLabel } from "../props";
import { dropNames, useArgs, useNames, usableFields } from "./refs";

const isOn = (value: string | undefined) => value === "true" || value === "yes";

/** A form's values from an entry, or the defaults for a new one. */
export function initialValues(
  fields: FieldSpec[],
  row: Row | null,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of fields) {
    const raw = row?.[field.key];
    if (field.kind === "check") {
      values[field.key] =
        raw === undefined
          ? isOn(field.default)
            ? "yes"
            : "no"
          : isOn(raw)
            ? "yes"
            : "no";
    } else if (field.kind === "secret") {
      values[field.key] = "";
    } else {
      values[field.key] = raw ?? (row ? "" : (field.default ?? ""));
    }
  }
  return values;
}

/** "name=value" lines into arguments; lines without "=" are flags. */
export function parseExtra(text: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) attrs[trimmed] = "";
    else attrs[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return attrs;
}

/**
 * What to send: on add every field with a value, on edit only what changed.
 * A secret left empty keeps the router's.
 */
export function changedAttrs(
  fields: FieldSpec[],
  values: Record<string, string>,
  initial: Record<string, string>,
  creating: boolean,
): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const field of fields) {
    if (field.showIf && !field.showIf(values)) continue;
    if (!creating && field.createOnly) continue;
    const value = values[field.key] ?? "";
    if (field.kind === "secret" && !value) continue;
    if (creating) {
      // A box nobody ticked keeps RouterOS's own default.
      if (field.kind === "check") {
        if (field.default !== undefined || value === "yes") {
          attrs[field.key] = value;
        }
      } else if (value.trim()) attrs[field.key] = value.trim();
    } else if (value !== (initial[field.key] ?? "")) {
      attrs[field.key] = field.kind === "check" ? value : value.trim();
    }
  }
  return attrs;
}

export function FieldInput({
  hostId,
  field,
  value,
  onChange,
  disabled,
  hidden,
}: {
  hostId: number;
  field: FieldSpec;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** The router has a secret here that the caller may not see. */
  hidden?: boolean;
}) {
  const { t } = useTranslation();
  const names = useNames(
    hostId,
    field.kind === "ref" ? field.ref : undefined,
    field.refKey,
  );
  const label = propLabel(t, field.key);
  const hint = field.hintKey ? t(field.hintKey) : undefined;
  if (field.kind === "check") {
    return (
      <CheckField
        label={label}
        hint={hint}
        disabled={disabled}
        checked={isOn(value)}
        onChange={(on) => onChange(on ? "yes" : "no")}
      />
    );
  }
  let input;
  if (field.kind === "select") {
    input = (
      <SelectInput
        value={value}
        disabled={disabled}
        onChange={onChange}
        placeholder={field.required ? undefined : t("crud.notSet")}
        options={(field.options ?? []).map((o) => ({ value: o, label: o }))}
      />
    );
  } else if (field.kind === "textarea") {
    input = (
      <TextArea
        value={value}
        disabled={disabled}
        onChange={onChange}
        placeholder={field.placeholder}
        rows={field.key === "source" ? 12 : 4}
      />
    );
  } else {
    input = (
      <TextInput
        type={
          field.kind === "secret"
            ? "password"
            : field.kind === "number"
              ? "number"
              : "text"
        }
        value={value}
        disabled={disabled}
        onChange={onChange}
        placeholder={
          field.kind === "secret"
            ? hidden
              ? t("crud.secretKept")
              : field.placeholder
            : field.placeholder
        }
        suggestions={
          field.kind === "ref"
            ? [...(field.extra ?? []), ...names]
            : field.options
        }
      />
    );
  }
  return (
    <Field label={label} hint={hint}>
      {input}
    </Field>
  );
}

/** Values the form starts with, kept apart so edits can be compared. */
function useInitial(fields: FieldSpec[], row: Row | null) {
  return useMemo(() => initialValues(fields, row), [fields, row]);
}

export function RecordDialog({
  hostId,
  path,
  fields,
  row,
  title,
  addDefaults,
  onClose,
  onSaved,
}: {
  hostId: number;
  path: string;
  fields: FieldSpec[];
  /** null to add. */
  row: Row | null;
  title: string;
  addDefaults?: Record<string, string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const creating = !row;
  const initial = useInitial(fields, row);
  const [values, setValues] = useState(initial);
  const [extra, setExtra] = useState("");
  const known = new Set(fields.map((f) => f.key));
  const hidden = new Set((row?.[".hidden"] ?? "").split(",").filter(Boolean));
  const accepted = useArgs(hostId, path, creating ? "add" : "set");
  const usable = usableFields(fields, row, accepted);

  // Everything else the entry has: editable unless RouterOS keeps it itself.
  const others = row
    ? Object.keys(row).filter(
        (k) =>
          !known.has(k) &&
          k !== "disabled" &&
          k !== "comment" &&
          !k.startsWith("."),
      )
    : [];
  // With the router's own list, what it won't set is status, not a guess.
  const settable = (k: string) =>
    accepted ? accepted.has(k) : !isReadOnlyProp(k);
  const editableOthers = others.filter(settable);
  const status = others.filter((k) => !settable(k));
  // Only what was typed; the rest keeps the entry's value.
  const [otherValues, setOtherValues] = useState<Record<string, string>>({});

  const visible = usable.filter((f) => !f.showIf || f.showIf(values));
  const missing = creating
    ? visible.find((f) => f.required && !values[f.key]?.trim())
    : undefined;

  const save = async () => {
    const attrs = changedAttrs(usable, values, initial, creating);
    for (const key of editableOthers) {
      const typed = otherValues[key];
      if (typed !== undefined && typed !== (row?.[key] ?? "")) {
        attrs[key] = typed;
      }
    }
    Object.assign(attrs, parseExtra(extra));
    if (creating) {
      await ros(hostId, path, "add", { ...(addDefaults ?? {}), ...attrs });
    } else {
      if (!Object.keys(attrs).length) return;
      await ros(hostId, path, "set", {
        ...(row?.[".id"] ? { ".id": row[".id"] } : {}),
        ...attrs,
      });
    }
    dropNames(hostId);
    onSaved();
  };

  return (
    <FormDialog
      title={title}
      submitLabel={creating ? t("crud.add") : t("app.save")}
      canSubmit={!missing}
      wide={visible.length + editableOthers.length > 6}
      onClose={onClose}
      onSubmit={save}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {visible.map((field) => (
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
              disabled={!creating && field.createOnly}
              hidden={hidden.has(field.key)}
              onChange={(v) => setValues((s) => ({ ...s, [field.key]: v }))}
            />
          </div>
        ))}
      </div>
      {missing && (
        <p className="text-[11px] text-muted-foreground">
          {t("crud.requiredField", { name: propLabel(t, missing.key) })}
        </p>
      )}
      {editableOthers.length > 0 && (
        <details className="border-t border-border pt-2">
          <summary className="cursor-pointer text-xs font-medium">
            {t("crud.otherProperties", { count: editableOthers.length })}
          </summary>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {editableOthers.map((key) => (
              <Field key={key} label={propLabel(t, key)}>
                <TextInput
                  value={otherValues[key] ?? row?.[key] ?? ""}
                  mono
                  placeholder={
                    hidden.has(key) ? t("crud.secretKept") : undefined
                  }
                  onChange={(v) => setOtherValues((s) => ({ ...s, [key]: v }))}
                />
              </Field>
            ))}
          </div>
        </details>
      )}
      <details className="border-t border-border pt-2">
        <summary className="cursor-pointer text-xs font-medium">
          {t("crud.extraArguments")}
        </summary>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {t("crud.extraArgumentsHint")}
        </p>
        <TextArea
          value={extra}
          onChange={setExtra}
          rows={3}
          placeholder="name=value"
        />
      </details>
      {status.length > 0 && (
        <details className="border-t border-border pt-2">
          <summary className="cursor-pointer text-xs font-medium">
            {t("crud.status")}
          </summary>
          <div className="mt-2 grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            {status.map((key) => (
              <div
                key={key}
                className="flex justify-between gap-3 border-b border-border/60 py-1 text-xs"
              >
                <span className="text-muted-foreground">
                  {propLabel(t, key)}
                </span>
                <span className="truncate font-mono">
                  {displayValue(row?.[key])}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </FormDialog>
  );
}
