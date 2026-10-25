import type { ReactNode } from "react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { cn } from "@termix-ssh/plugin-sdk/ui";
import { ChevronDown, ChevronRight, Circle, Router } from "lucide-react";
import { MENU } from "../menus/catalog";
import type { MenuNode } from "../menus/types";
import { menuFor } from "../routers";
import {
  selectionId,
  setTreeState,
  useTreeState,
  type RouterState,
} from "../treeStore";

function statusColor(state: RouterState | undefined): string {
  if (!state || (!state.info && state.loading)) return "text-muted-foreground";
  if (state.error) return "text-destructive";
  return "text-emerald-500";
}

function matches(
  node: MenuNode,
  query: string,
  t: (key: string) => string,
): boolean {
  if (!query) return true;
  if (t(node.labelKey).toLowerCase().includes(query)) return true;
  return !!node.children?.some((child) => matches(child, query, t));
}

/**
 * Every router with WinBox's menu under it. The selection is
 * "<hostId>|<menu id>"; picking a router row opens its dashboard.
 */
export function RouterTree() {
  const { t } = useTranslation();
  const { routers, state, query, selection, collapsed } = useTreeState();
  const q = query.trim().toLowerCase();

  const toggle = (key: string) =>
    setTreeState({
      collapsed: collapsed.includes(key)
        ? collapsed.filter((k) => k !== key)
        : [...collapsed, key],
    });

  const renderNodes = (
    hostId: number,
    nodes: MenuNode[],
    depth: number,
  ): ReactNode =>
    nodes
      .filter((node) => matches(node, q, t))
      .map((node) => {
        const key = selectionId(hostId, node.id);
        const Icon = node.icon;
        if (node.children) {
          // A search opens every group it finds something in.
          const open = q ? true : !collapsed.includes(key);
          const Chevron = open ? ChevronDown : ChevronRight;
          return (
            <div key={key} role="treeitem" aria-expanded={open}>
              <button
                type="button"
                onClick={() => toggle(key)}
                className="flex w-full items-center gap-1.5 py-1 pr-2 text-left text-xs hover:bg-accent"
                style={{ paddingLeft: 8 + depth * 14 }}
              >
                <Chevron className="size-3.5 shrink-0" />
                {Icon && <Icon className="size-3.5 shrink-0" />}
                <span className="min-w-0 flex-1 truncate">
                  {t(node.labelKey)}
                </span>
              </button>
              {open && renderNodes(hostId, node.children, depth + 1)}
            </div>
          );
        }
        return (
          <button
            key={key}
            type="button"
            role="treeitem"
            onClick={() => setTreeState({ selection: key })}
            className={cn(
              "flex w-full items-center gap-1.5 py-1 pr-2 text-left text-xs hover:bg-accent",
              selection === key && "bg-accent text-accent-foreground",
            )}
            style={{ paddingLeft: 8 + depth * 14 + (Icon ? 0 : 20) }}
          >
            {Icon && (
              <>
                <span className="size-3.5 shrink-0" />
                <Icon className="size-3.5 shrink-0" />
              </>
            )}
            <span className="min-w-0 flex-1 truncate">{t(node.labelKey)}</span>
          </button>
        );
      });

  if (!routers.length) {
    return (
      <p className="px-3 py-4 text-xs text-muted-foreground">
        {t("tree.noRouters")}
      </p>
    );
  }

  return (
    <div className="py-1" role="tree">
      {routers.map((router) => {
        const routerState = state[router.id];
        const key = `${router.id}|`;
        const open = q ? true : !collapsed.includes(key);
        const Chevron = open ? ChevronDown : ChevronRight;
        const info = routerState?.info;
        const nodes = menuFor(MENU, {
          info: info ?? null,
          menus: routerState?.menus ?? [],
        });
        const dashboard = selectionId(router.id, "dashboard");
        return (
          <div key={router.id} role="treeitem" aria-expanded={open}>
            <div
              className={cn(
                "flex w-full items-center gap-1.5 py-1 pr-2 text-xs font-medium hover:bg-accent",
                selection === dashboard && "bg-accent text-accent-foreground",
              )}
              style={{ paddingLeft: 8 }}
            >
              <span
                role="button"
                aria-label={t(open ? "tree.collapse" : "tree.expand")}
                onClick={() => toggle(key)}
              >
                <Chevron className="size-3.5 shrink-0" />
              </span>
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                onClick={() => setTreeState({ selection: dashboard })}
                title={
                  info
                    ? `${info.identity ?? router.name} · RouterOS ${info.resource.version ?? ""} · ${info.resource["board-name"] ?? ""}`
                    : routerState?.error?.message
                }
              >
                <Router className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">
                  {router.name}
                  {info?.identity && info.identity !== router.name && (
                    <span className="ml-1 font-normal text-muted-foreground">
                      ({info.identity})
                    </span>
                  )}
                </span>
                <Circle
                  className={cn(
                    "size-2 shrink-0 fill-current",
                    statusColor(routerState),
                  )}
                />
              </button>
            </div>
            {open && info && renderNodes(router.id, nodes, 1)}
            {open && !info && routerState?.error && (
              <p
                className="py-1 pr-2 text-[11px] text-destructive"
                style={{ paddingLeft: 30 }}
              >
                {routerState.error.message}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
