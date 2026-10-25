import { useState, type FormEvent } from "react";
import {
  useHost,
  usePermission,
  useTabs,
  useTranslation,
} from "@termix-ssh/plugin-sdk/frontend";
import { Button, Input } from "@termix-ssh/plugin-sdk/ui";
import { CornerDownLeft, SquareTerminal } from "lucide-react";
import { app, toCallError } from "../api";
import type { ViewProps } from "../menus/types";

interface Entry {
  command: string;
  output: string;
  failed: boolean;
}

/**
 * New Terminal: the router's own CLI in a Termix terminal tab, over the
 * host's SSH login, and a line here for one command at a time.
 */
export function TerminalPanel({ hostId }: ViewProps) {
  const { t } = useTranslation();
  const host = useHost(hostId);
  const tabs = useTabs();
  const canRun = usePermission("administer");
  const [command, setCommand] = useState("");
  const [history, setHistory] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);

  const run = async (event: FormEvent) => {
    event.preventDefault();
    const line = command.trim();
    if (!line || busy) return;
    setBusy(true);
    try {
      const { data } = await app().api.post<{
        stdout: string;
        stderr: string;
        code: number | null;
      }>(`/hosts/${hostId}/exec`, { command: line });
      setHistory((h) => [
        ...h,
        {
          command: line,
          output: (data.stdout + (data.stderr ? `\n${data.stderr}` : ""))
            .replace(/\r\n/g, "\n")
            .trimEnd(),
          failed: data.code !== 0 && data.code !== null && !data.stdout,
        },
      ]);
      setCommand("");
    } catch (err) {
      setHistory((h) => [
        ...h,
        { command: line, output: toCallError(err).message, failed: true },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={!host}
          onClick={() => host && tabs.connectHost(host)}
        >
          <SquareTerminal className="mr-1 size-3.5" />
          {t("terminal.open")}
        </Button>
        <span className="text-xs text-muted-foreground">
          {t("terminal.openHint")}
        </span>
      </div>
      {canRun && (
        <>
          <div className="max-h-[60vh] min-h-24 overflow-auto border border-border bg-muted/30 p-2 font-mono text-[11px]">
            {history.length === 0 && (
              <p className="text-muted-foreground">{t("terminal.empty")}</p>
            )}
            {history.map((entry, i) => (
              <div key={i} className="mb-2">
                <div className="text-accent-brand">
                  [{host?.username ?? "admin"}@{host?.name ?? ""}] &gt;{" "}
                  {entry.command}
                </div>
                <pre
                  className={
                    entry.failed
                      ? "whitespace-pre-wrap text-destructive"
                      : "whitespace-pre-wrap"
                  }
                >
                  {entry.output}
                </pre>
              </div>
            ))}
          </div>
          <form onSubmit={run} className="flex gap-2">
            <Input
              className="h-8 font-mono text-xs"
              value={command}
              placeholder="/ip address print"
              onChange={(e) => setCommand(e.target.value)}
            />
            <Button size="sm" type="submit" disabled={busy || !command.trim()}>
              <CornerDownLeft className="mr-1 size-3.5" />
              {busy ? t("app.working") : t("terminal.run")}
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
