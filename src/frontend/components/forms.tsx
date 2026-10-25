import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select2,
  Textarea,
} from "@termix-ssh/plugin-sdk/ui";
import { toCallError, type RosCallError } from "../api";

/**
 * A dialog that submits once, shows RouterOS's own reason when it refuses,
 * and closes on success.
 */
export function FormDialog({
  title,
  submitLabel,
  destructive,
  canSubmit = true,
  onSubmit,
  onClose,
  wide,
  hideCancel,
  extraActions,
  children,
}: {
  title: string;
  submitLabel: string;
  destructive?: boolean;
  canSubmit?: boolean;
  /**
   * Resolves when done; a throw keeps the dialog open with the error, and
   * false keeps it open to show a result.
   */
  onSubmit: () => Promise<void | boolean>;
  onClose: () => void;
  wide?: boolean;
  hideCancel?: boolean;
  /** Buttons left of Cancel, like WinBox's Disable and Comment. */
  extraActions?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<RosCallError | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      if ((await onSubmit()) !== false) onClose();
    } catch (err) {
      setError(toCallError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className={wide ? "sm:max-w-3xl" : "sm:max-w-lg"}>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="flex max-h-[65vh] flex-col gap-3 overflow-y-auto pr-1">
            {children}
          </div>
          {error && (
            <p
              role="alert"
              className="whitespace-pre-wrap text-xs text-destructive"
            >
              {error.message}
            </p>
          )}
          <DialogFooter className="gap-2">
            {extraActions}
            {!hideCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={busy}
              >
                {t("app.cancel")}
              </Button>
            )}
            <Button
              type="submit"
              variant={destructive ? "destructive" : "default"}
              disabled={busy || !canSubmit}
            >
              {busy ? t("app.working") : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    // In a grid, a field spans two of its rows, the label's and the input's,
    // and shares them with the fields beside it (subgrid): a label that wraps
    // or a hint under one input still leaves the inputs of a row level.
    <div
      data-ros-field=""
      className="grid gap-1 [.grid>&]:row-span-2 [.grid>&]:grid-rows-subgrid"
    >
      <Label className="self-end text-xs">{label}</Label>
      <div className="flex flex-col gap-1">
        {children}
        {error ? (
          <span className="text-[11px] text-destructive">{error}</span>
        ) : hint ? (
          <span className="text-[11px] text-muted-foreground">{hint}</span>
        ) : null}
      </div>
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  min,
  max,
  disabled,
  suggestions,
  mono,
}: {
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "number" | "password";
  min?: number;
  max?: number;
  disabled?: boolean;
  /** Offered while typing; any other value is still allowed. */
  suggestions?: string[];
  mono?: boolean;
}) {
  const listId = useId();
  return (
    <>
      <Input
        className={mono ? "h-8 font-mono text-xs" : "h-8 text-xs"}
        type={type}
        min={min}
        max={max}
        disabled={disabled}
        value={value}
        placeholder={placeholder}
        list={suggestions?.length ? listId : undefined}
        autoComplete={type === "password" ? "new-password" : "off"}
        onChange={(e) => onChange(e.target.value)}
      />
      {!!suggestions?.length && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </>
  );
}

export function SelectInput({
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  disabled?: boolean;
}) {
  // A value the router has that the list doesn't know still shows.
  const all =
    value && !options.some((o) => o.value === value)
      ? [...options, { value, label: value }]
      : options;
  return (
    <Select2
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 w-full border border-border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {all.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select2>
  );
}

export function CheckField({
  label,
  checked,
  onChange,
  hint,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start gap-2 text-xs [.grid:has(>[data-ros-field])>&]:row-span-2 [.grid:has(>[data-ros-field])>&]:min-h-8 [.grid:has(>[data-ros-field])>&]:items-center [.grid:has(>[data-ros-field])>&]:self-end">
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onChange(value === true)}
        className="mt-0.5"
      />
      <span className="flex flex-col">
        {label}
        {hint && (
          <span className="text-[11px] text-muted-foreground">{hint}</span>
        )}
      </span>
    </label>
  );
}

export function TextArea({
  value,
  onChange,
  rows = 4,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <Textarea
      value={value}
      rows={rows}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="font-mono text-xs"
    />
  );
}
