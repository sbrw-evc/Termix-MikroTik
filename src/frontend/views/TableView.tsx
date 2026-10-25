import { useMemo, useState, type ReactNode } from "react";
import {
  usePermission,
  useToast,
  useTranslation,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  PanelSearch,
  cn,
} from "@termix-ssh/plugin-sdk/ui";
import {
  ArrowDown,
  ArrowUp,
  Check,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { app, ros, toCallError, type Row } from "../api";
import { Field, FormDialog, TextInput } from "../components/forms";
import type { ActionSpec, TableSpec } from "../menus/types";
import {
  displayValue,
  flagsOf,
  formatBps,
  formatBytes,
  propLabel,
  rowName,
} from "../props";
import { RecordDialog } from "./RecordDialog";
import { dropNames } from "./refs";
import { useRows } from "./useRows";

/** How a cell reads: counters as sizes, rates as bits per second. */
export function cellText(key: string, value: string | undefined): string {
  if (value === undefined || value === "") return "";
  if (/(^|-)bytes?$/.test(key) && /^\d+$/.test(value))
    return formatBytes(value);
  if (/bits-per-second$/.test(key)) return formatBps(value);
  return displayValue(value);
}

function useRunner(hostId: number, path: string, reload: () => void) {
  const toast = useToast();
  return async (command: string, attrs: Record<string, string> = {}) => {
    try {
      const reply = await ros(hostId, path, command, attrs);
      dropNames(hostId);
      reload();
      return reply;
    } catch (err) {
      toast.error(toCallError(err).message);
      return null;
    }
  };
}

export function TableView({
  hostId,
  spec,
  isVisible,
  extraToolbar,
  selectionToolbar,
  renderCell,
}: {
  hostId: number;
  spec: TableSpec;
  isVisible: boolean;
  extraToolbar?: ReactNode;
  /** Buttons that act on the selected rows, like Download. */
  selectionToolbar?: (selected: Row[]) => ReactNode;
  /** Draws a cell another way, such as live traffic. */
  renderCell?: (row: Row, key: string) => ReactNode | undefined;
}) {
  const { t } = useTranslation();
  const canConfigure = usePermission("configure");
  const canOperate = usePermission("operate");
  const { rows, error, loading, load } = useRows(hostId, spec.path, {
    attrs: spec.printAttrs,
    query: spec.query,
    refreshMs: spec.refreshMs ?? 5000,
    isVisible,
  });
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ row: Row | null } | null>(null);
  const [commenting, setCommenting] = useState<Row[] | null>(null);
  const run = useRunner(hostId, spec.path, () => void load());

  const shown = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      Object.values(row).some((v) => v.toLowerCase().includes(q)),
    );
  }, [rows, query]);

  const byId = new Map((rows ?? []).map((r) => [r[".id"], r]));
  const picked = selected.map((id) => byId.get(id)).filter(Boolean) as Row[];
  const ids = picked.map((r) => r[".id"]).join(",");
  const fields = spec.fields ?? [];
  const editable = !spec.readOnly && canConfigure;
  const canEditRows = editable && !spec.noEdit;
  const toggleable =
    !spec.readOnly && !spec.noToggle && (canConfigure || canOperate);

  const select = (row: Row, event: React.MouseEvent) => {
    const id = row[".id"];
    if (event.shiftKey && anchor) {
      const order = shown.map((r) => r[".id"]);
      const [a, b] = [order.indexOf(anchor), order.indexOf(id)].sort(
        (x, y) => x - y,
      );
      setSelected(order.slice(a, b + 1));
      return;
    }
    setAnchor(id);
    if (event.ctrlKey || event.metaKey) {
      setSelected((s) =>
        s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
      );
    } else {
      setSelected([id]);
    }
  };

  const remove = async () => {
    if (!picked.length) return;
    const ok = await app().confirm({
      title: t("crud.removeTitle", {
        count: picked.length,
        name: rowName(picked[0], spec.nameKey),
      }),
      description: t("crud.removeDescription"),
      confirmLabel: t("crud.remove"),
    });
    if (!ok) return;
    await run("remove", { numbers: ids });
    setSelected([]);
  };

  const move = async (direction: -1 | 1) => {
    if (picked.length !== 1 || !rows) return;
    const order = rows.map((r) => r[".id"]);
    const at = order.indexOf(picked[0][".id"]);
    // RouterOS moves an entry before the destination; past the end, none.
    const destination = direction === -1 ? order[at - 1] : order[at + 2];
    if (direction === -1 && at <= 0) return;
    if (direction === 1 && at >= order.length - 1) return;
    await run("move", {
      numbers: picked[0][".id"],
      ...(destination ? { destination } : {}),
    });
  };

  const runAction = async (action: ActionSpec, targets: Row[]) => {
    if (action.confirmKey) {
      const ok = await app().confirm({
        title: t(action.labelKey),
        description: t(action.confirmKey),
        confirmLabel: t(action.labelKey),
      });
      if (!ok) return;
    }
    const attrs = { ...(action.attrs ?? {}) };
    if (action.perRow) attrs.numbers = targets.map((r) => r[".id"]).join(",");
    await run(action.command, attrs);
  };

  const rowActions = (spec.actions ?? []).filter((a) => a.perRow);
  const menuActions = (spec.actions ?? []).filter((a) => !a.perRow);
  const hasComment =
    (rows ?? []).some((r) => "comment" in r) ||
    fields.some((f) => f.key === "comment");

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1">
        {editable && !spec.noAdd && !spec.noEdit && (
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            onClick={() => setDialog({ row: null })}
          >
            <Plus className="mr-1 size-3.5" />
            {t("crud.add")}
          </Button>
        )}
        {canEditRows && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            disabled={picked.length !== 1}
            title={t("app.edit")}
            onClick={() => setDialog({ row: picked[0] })}
          >
            <Pencil className="size-3.5" />
          </Button>
        )}
        {(editable || canOperate) && !spec.noRemove && !spec.readOnly && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            disabled={!picked.length}
            title={t("crud.remove")}
            onClick={() => void remove()}
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
        {toggleable && (
          <>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              disabled={!picked.length}
              title={t("crud.enable")}
              onClick={() => void run("enable", { numbers: ids })}
            >
              <Check className="size-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              disabled={!picked.length}
              title={t("crud.disable")}
              onClick={() => void run("disable", { numbers: ids })}
            >
              <X className="size-3.5" />
            </Button>
          </>
        )}
        {canEditRows && hasComment && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            disabled={!picked.length}
            title={t("crud.comment")}
            onClick={() => setCommenting(picked)}
          >
            <MessageSquare className="size-3.5" />
          </Button>
        )}
        {editable && spec.ordered && (
          <>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              disabled={picked.length !== 1}
              title={t("crud.moveUp")}
              onClick={() => void move(-1)}
            >
              <ArrowUp className="size-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              disabled={picked.length !== 1}
              title={t("crud.moveDown")}
              onClick={() => void move(1)}
            >
              <ArrowDown className="size-3.5" />
            </Button>
          </>
        )}
        {(rowActions.length > 0 || menuActions.length > 0) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2"
                aria-label={t("crud.more")}
              >
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {rowActions.map((action) => (
                <DropdownMenuItem
                  key={action.id}
                  disabled={
                    !picked.length ||
                    (action.when ? !picked.every(action.when) : false)
                  }
                  onClick={() => void runAction(action, picked)}
                >
                  {t(action.labelKey)}
                </DropdownMenuItem>
              ))}
              {menuActions.map((action) => (
                <DropdownMenuItem
                  key={action.id}
                  onClick={() => void runAction(action, [])}
                >
                  {t(action.labelKey)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {extraToolbar}
        {selectionToolbar?.(picked)}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {rows ? t("crud.items", { count: shown.length }) : ""}
          </span>
          <PanelSearch
            value={query}
            onChange={setQuery}
            placeholder={t("crud.filter")}
          />
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            onClick={() => void load()}
            title={t("app.refresh")}
          >
            <RefreshCw
              className={loading ? "size-3.5 animate-spin" : "size-3.5"}
            />
          </Button>
        </div>
      </div>
      {error && (
        <p
          role="alert"
          className="text-xs text-destructive whitespace-pre-wrap"
        >
          {error.message}
        </p>
      )}
      {!rows && !error && (
        <p className="text-xs text-muted-foreground">{t("app.loading")}</p>
      )}
      {rows && (
        <div className="min-h-0 overflow-auto border border-border">
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-[1] bg-muted">
              <tr>
                <th className="w-8 border-b border-border px-1.5 py-1 text-left font-medium text-muted-foreground" />
                {spec.columns.map((key) => (
                  <th
                    key={key}
                    className="whitespace-nowrap border-b border-border px-2 py-1 text-left font-medium text-muted-foreground"
                  >
                    {propLabel(t, key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td
                    colSpan={spec.columns.length + 1}
                    className="px-2 py-3 text-muted-foreground"
                  >
                    {t("crud.empty")}
                  </td>
                </tr>
              )}
              {shown.map((row) => {
                const id = row[".id"];
                const isSelected = selected.includes(id);
                const flags = flagsOf(row);
                return [
                  row.comment ? (
                    <tr
                      key={`${id}-comment`}
                      className={cn(
                        "cursor-default",
                        isSelected && "bg-accent",
                      )}
                      onClick={(e) => select(row, e)}
                    >
                      <td />
                      <td
                        colSpan={spec.columns.length}
                        className="px-2 pt-1 text-[11px] text-muted-foreground"
                      >
                        ;;; {row.comment}
                      </td>
                    </tr>
                  ) : null,
                  <tr
                    key={id ?? JSON.stringify(row)}
                    onClick={(e) => select(row, e)}
                    onDoubleClick={() => canEditRows && setDialog({ row })}
                    className={cn(
                      "cursor-default border-b border-border/50 hover:bg-accent/50",
                      isSelected && "bg-accent text-accent-foreground",
                      row.disabled === "true" &&
                        "text-muted-foreground line-through decoration-muted-foreground/40",
                      row.invalid === "true" && "text-destructive",
                      row.dynamic === "true" && "italic",
                    )}
                  >
                    <td className="px-1.5 py-1 font-mono text-[10px] text-muted-foreground">
                      {flags}
                    </td>
                    {spec.columns.map((key) => (
                      <td
                        key={key}
                        className="max-w-[24rem] truncate whitespace-nowrap px-2 py-1"
                      >
                        {renderCell?.(row, key) ?? cellText(key, row[key])}
                      </td>
                    ))}
                  </tr>,
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
      {dialog && (
        <RecordDialog
          hostId={hostId}
          path={spec.path}
          fields={fields}
          row={dialog.row}
          addDefaults={spec.addDefaults}
          title={
            dialog.row
              ? t("crud.editTitle", { name: rowName(dialog.row, spec.nameKey) })
              : t("crud.addTitle")
          }
          onClose={() => setDialog(null)}
          onSaved={() => void load()}
        />
      )}
      {commenting && (
        <CommentDialog
          rows={commenting}
          onClose={() => setCommenting(null)}
          onSave={async (comment) => {
            await ros(hostId, spec.path, "set", {
              numbers: commenting.map((r) => r[".id"]).join(","),
              comment,
            });
            void load();
          }}
        />
      )}
    </div>
  );
}

function CommentDialog({
  rows,
  onClose,
  onSave,
}: {
  rows: Row[];
  onClose: () => void;
  onSave: (comment: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [comment, setComment] = useState(
    rows.length === 1 ? (rows[0].comment ?? "") : "",
  );
  return (
    <FormDialog
      title={t("crud.comment")}
      submitLabel={t("app.save")}
      onClose={onClose}
      onSubmit={() => onSave(comment)}
    >
      <Field label={propLabel(t, "comment")}>
        <TextInput value={comment} onChange={setComment} />
      </Field>
    </FormDialog>
  );
}
