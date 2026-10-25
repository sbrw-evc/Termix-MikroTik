import { useState, type FormEvent } from "react";
import {
  usePermission,
  useToast,
  useTranslation,
} from "@termix-ssh/plugin-sdk/frontend";
import { Button, Input, cn } from "@termix-ssh/plugin-sdk/ui";
import { ChevronRight, FolderOpen, Play } from "lucide-react";
import { atLeast, print, ros, splitPath, toCallError, type Row } from "../api";
import { TextArea } from "../components/forms";
import { table } from "../menus/dsl";
import type { TableSpec, ViewProps } from "../menus/types";
import { parseExtra } from "../views/RecordDialog";
import { TableView } from "../views/TableView";
import { ResultTable } from "./widgets";

const MAX_COLUMNS = 10;

/**
 * Any menu, for what has no panel of its own: type a path like
 * ip/firewall/filter and get its list with add, edit and remove, or run any
 * command in it. On RouterOS v7 the router lists the menus under a path.
 */
export function AnyMenuPanel({ hostId, info, isVisible }: ViewProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const canAdmin = usePermission("administer");
  const [path, setPath] = useState("");
  const [spec, setSpec] = useState<TableSpec | null>(null);
  const [children, setChildren] = useState<Row[]>([]);
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [output, setOutput] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const v7 = atLeast(info, 7);

  const open = async (target: string) => {
    const clean = splitPath(target).join("/");
    setPath(clean);
    setSpec(null);
    setError(null);
    setOutput(null);
    if (v7) {
      // Submenus and commands, from the router's own help.
      ros(hostId, "console", "inspect", {
        request: "child",
        path: splitPath(clean).join(","),
      })
        .then((r) =>
          setChildren(
            r.rows.filter(
              (c) =>
                c.type === "child" &&
                (c["node-type"] === "dir" || c["node-type"] === "cmd"),
            ),
          ),
        )
        .catch(() => setChildren([]));
    }
    if (!clean) return;
    try {
      const rows = await print(hostId, clean);
      const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter(
        (k) =>
          !k.startsWith(".") &&
          k !== "disabled" &&
          k !== "comment" &&
          k !== "dynamic" &&
          k !== "invalid",
      );
      setSpec(
        table(clean, keys.slice(0, MAX_COLUMNS), [], { refreshMs: 10000 }),
      );
    } catch (err) {
      setError(toCallError(err).message);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void open(path);
  };

  const runCommand = async () => {
    try {
      const reply = await ros(hostId, path, command.trim(), parseExtra(args));
      setOutput(
        reply.rows.length ? reply.rows : reply.ret ? [{ ret: reply.ret }] : [],
      );
    } catch (err) {
      toast.error(toCallError(err).message);
    }
  };

  const dirs = children.filter((c) => c["node-type"] === "dir");
  const cmds = children.filter((c) => c["node-type"] === "cmd");

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={submit} className="flex gap-2">
        <Input
          className="h-8 font-mono text-xs"
          value={path}
          placeholder="ip/firewall/filter"
          onChange={(e) => setPath(e.target.value)}
        />
        <Button size="sm" type="submit">
          <FolderOpen className="mr-1 size-3.5" />
          {t("anyMenu.open")}
        </Button>
      </form>
      {path && (
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <button
            type="button"
            className="text-accent-brand hover:underline"
            onClick={() => void open("")}
          >
            /
          </button>
          {splitPath(path).map((seg, i, all) => (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight className="size-3 text-muted-foreground" />
              <button
                type="button"
                className="font-mono hover:underline"
                onClick={() => void open(all.slice(0, i + 1).join("/"))}
              >
                {seg}
              </button>
            </span>
          ))}
        </div>
      )}
      {dirs.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {dirs.map((d) => (
            <button
              key={d.name}
              type="button"
              onClick={() => void open(path ? `${path}/${d.name}` : d.name)}
              className={cn(
                "border border-border px-1.5 py-0.5 font-mono text-[11px] hover:bg-accent",
              )}
            >
              {d.name}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {spec && (
        <TableView
          key={spec.path}
          hostId={hostId}
          spec={spec}
          isVisible={isVisible}
        />
      )}
      {canAdmin && path && (
        <details className="border-t border-border pt-2">
          <summary className="cursor-pointer text-xs font-medium">
            {t("anyMenu.runCommand")}
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            <Input
              className="h-8 font-mono text-xs"
              value={command}
              list="ros-cmds"
              placeholder="print"
              onChange={(e) => setCommand(e.target.value)}
            />
            <datalist id="ros-cmds">
              {cmds.map((c) => (
                <option key={c.name} value={c.name} />
              ))}
            </datalist>
            <TextArea
              value={args}
              onChange={setArgs}
              rows={3}
              placeholder="name=value"
            />
            <div>
              <Button
                size="sm"
                disabled={!command.trim()}
                onClick={() => void runCommand()}
              >
                <Play className="mr-1 size-3.5" />
                {t("anyMenu.run")}
              </Button>
            </div>
            {output && (
              <ResultTable
                empty={t("tools.noResults")}
                rows={output}
                columns={[...new Set(output.flatMap((r) => Object.keys(r)))]
                  .slice(0, 12)
                  .map((k) => ({ key: k, label: k }))}
              />
            )}
          </div>
        </details>
      )}
    </div>
  );
}
