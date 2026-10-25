import { useCallback, useEffect } from "react";
import { batch, failed, testConnection, toCallError } from "./api";
import { OPTIONAL_MENUS } from "./menus/dsl";
import type { MenuNode } from "./menus/types";
import { getTreeState, setRouterState } from "./treeStore";

const REFRESH_MS = 60000;

/** Logs in to a router, reads what it is and which optional menus it has. */
export async function loadRouter(hostId: number): Promise<void> {
  setRouterState(hostId, { loading: true });
  try {
    const info = await testConnection(hostId);
    // A menu answers count-only when the router has it; a missing one fails.
    const probes = await batch(
      hostId,
      OPTIONAL_MENUS.map((menu) => ({
        path: menu.split("/"),
        command: "print",
        attrs: { "count-only": "" },
      })),
    ).catch(() => []);
    const menus = OPTIONAL_MENUS.filter(
      (_, i) => probes[i] && !failed(probes[i]),
    );
    setRouterState(hostId, { info, menus, error: null, loading: false });
  } catch (err) {
    // Keep what was loaded before, so a hiccup doesn't empty the tree.
    setRouterState(hostId, { error: toCallError(err), loading: false });
  }
}

/** Every router's details, loaded while the tab shows and now and then after. */
export function useRouters(hostIds: number[], isVisible: boolean) {
  const key = hostIds.join(",");
  const loadAll = useCallback(async () => {
    await Promise.all(hostIds.map(loadRouter));
    // key stands for hostIds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!isVisible) return;
    const missing = hostIds.filter((id) => !getTreeState().state[id]?.info);
    void Promise.all(missing.map(loadRouter));
    const timer = setInterval(() => void loadAll(), REFRESH_MS);
    return () => clearInterval(timer);
    // key stands for hostIds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible, key, loadAll]);

  return { loadAll };
}

/** The menu as this router has it: entries it lacks are left out. */
export function menuFor(
  nodes: MenuNode[],
  router: Parameters<NonNullable<MenuNode["requires"]>>[0],
): MenuNode[] {
  const out: MenuNode[] = [];
  for (const node of nodes) {
    if (node.requires && !node.requires(router)) continue;
    if (node.children) {
      const children = menuFor(node.children, router);
      if (children.length) out.push({ ...node, children });
    } else {
      out.push(node);
    }
  }
  return out;
}
