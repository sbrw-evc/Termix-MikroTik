import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { Button, PanelSearch, cn } from "@termix-ssh/plugin-sdk/ui";
import { Pause, Play, RefreshCw } from "lucide-react";
import { print, toCallError, type Row } from "../api";
import type { ViewProps } from "../menus/types";

const REFRESH_MS = 3000;

function severity(topics: string): string {
  if (/critical|error/.test(topics)) return "text-destructive";
  if (/warning/.test(topics)) return "text-amber-600 dark:text-amber-400";
  if (/debug/.test(topics)) return "text-muted-foreground";
  return "";
}

/**
 * Log, as WinBox's window: the router's memory log, newest at the bottom,
 * read again every few seconds while followed.
 */
export function LogPanel({ hostId, isVisible }: ViewProps) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [following, setFollowing] = useState(true);
  const [loading, setLoading] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      setRows(await print(hostId, "log"));
      setError(null);
    } catch (err) {
      setError(toCallError(err).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isVisible) return;
    void load();
    if (!following) return;
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, REFRESH_MS);
    return () => clearInterval(timer);
    // load reads only hostId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostId, isVisible, following]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows ?? [];
    return q
      ? list.filter((r) =>
          `${r.time} ${r.topics} ${r.message}`.toLowerCase().includes(q),
        )
      : list;
  }, [rows, query]);

  useEffect(() => {
    if (following) bottom.current?.scrollIntoView({ block: "end" });
  }, [shown.length, following]);

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant={following ? "default" : "outline"}
          className="h-7"
          onClick={() => setFollowing((f) => !f)}
        >
          {following ? (
            <Pause className="mr-1 size-3.5" />
          ) : (
            <Play className="mr-1 size-3.5" />
          )}
          {following ? t("log.pause") : t("log.follow")}
        </Button>
        <span className="ml-2 text-[11px] text-muted-foreground">
          {rows ? t("crud.items", { count: shown.length }) : ""}
        </span>
        <div className="ml-auto flex items-center gap-2">
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
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="max-h-[70vh] min-h-0 overflow-auto border border-border font-mono text-[11px]">
        {!rows && !error && (
          <p className="p-2 text-muted-foreground">{t("app.loading")}</p>
        )}
        {shown.map((r, i) => (
          <div
            key={r[".id"] ?? i}
            className={cn(
              "flex gap-3 border-b border-border/40 px-2 py-0.5",
              severity(r.topics ?? ""),
            )}
          >
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {r.time}
            </span>
            <span className="w-40 shrink-0 truncate">{r.topics}</span>
            <span className="min-w-0 whitespace-pre-wrap break-words">
              {r.message}
            </span>
          </div>
        ))}
        <div ref={bottom} />
      </div>
    </div>
  );
}
