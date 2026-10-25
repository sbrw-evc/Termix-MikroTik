import { useEffect } from "react";
import {
  useShell,
  useTranslation,
  type PanelProps,
} from "@termix-ssh/plugin-sdk/frontend";
import { PanelSearch, PanelShell } from "@termix-ssh/plugin-sdk/ui";
import { Router } from "lucide-react";
import { setTreeState, useTreeState } from "../treeStore";
import { RouterTree } from "./RouterTree";

export const TREE_PANEL = "mikrotik-tree";

/**
 * The routers and their menus in the left sidebar, where the host list sits
 * otherwise. The MikroTik tab loads the routers; picking a menu here shows
 * it there.
 */
export function TreePanel({ active, placement }: PanelProps) {
  const { t } = useTranslation();
  const { query } = useTreeState();

  // While this is on screen, the tab leaves its own tree out. A collapsed
  // sidebar keeps the panel active, so its open state counts too.
  const leftOpen = useShell()?.regions.left.open ?? true;
  useEffect(() => {
    const shown = active && leftOpen && placement !== "tab";
    setTreeState({ inSidebar: shown });
    return () => setTreeState({ inSidebar: false });
  }, [active, leftOpen, placement]);

  return (
    <PanelShell
      icon={<Router className="size-4" />}
      title={t("nav.title")}
      scroll
      toolbar={
        <PanelSearch
          value={query}
          onChange={(next) => setTreeState({ query: next })}
          placeholder={t("app.search")}
          fill
        />
      }
    >
      <RouterTree />
    </PanelShell>
  );
}
