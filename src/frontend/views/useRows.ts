import { useCallback, useEffect, useRef, useState } from "react";
import { print, toCallError, type RosCallError, type Row } from "../api";

/**
 * A menu's entries, printed while on screen and again every refreshMs, as
 * WinBox keeps its windows live. A failed refresh keeps what was there.
 */
export function useRows(
  hostId: number,
  path: string,
  options: {
    attrs?: Record<string, string>;
    query?: Record<string, string>;
    proplist?: string[];
    refreshMs?: number;
    isVisible: boolean;
  },
) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<RosCallError | null>(null);
  const [loading, setLoading] = useState(false);
  const key = JSON.stringify([
    hostId,
    path,
    options.attrs,
    options.query,
    options.proplist,
  ]);
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      setRows(
        await print(hostId, path, {
          attrs: options.attrs,
          query: options.query,
          proplist: options.proplist,
        }),
      );
      setError(null);
    } catch (err) {
      setError(toCallError(err));
    } finally {
      busy.current = false;
      setLoading(false);
    }
    // key holds everything the call uses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    setRows(null);
    setError(null);
  }, [key]);

  useEffect(() => {
    if (!options.isVisible) return;
    void load();
    const every = options.refreshMs ?? 0;
    if (!every) return;
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, every);
    return () => clearInterval(timer);
  }, [options.isVisible, options.refreshMs, load]);

  return { rows, error, loading, load, setRows };
}
