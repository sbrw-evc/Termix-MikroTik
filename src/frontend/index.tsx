import { useEffect, type ComponentType } from "react";
import { Router } from "lucide-react";
import {
  useHosts,
  type TabProps,
  type TermixApp,
} from "@termix-ssh/plugin-sdk/frontend";
import { isRosHost, setApp } from "./api";
import { MikrotikTab } from "./components/MikrotikTab";
import { TREE_PANEL, TreePanel } from "./components/TreePanel";
import { selectionId, setTreeState } from "./treeStore";

const TAB_ID = "mikrotik";

function MikrotikTabView(props: TabProps) {
  return <MikrotikTab {...props} />;
}

export function activate(app: TermixApp): void {
  setApp(app);
  app.onDispose(() => setApp(null));

  app.registerTab(TAB_ID, MikrotikTabView, {
    icon: Router,
    titleKey: "nav.title",
    hostless: true,
    singleton: true,
  });

  // The tree, in the left sidebar while the MikroTik tab is on screen.
  app.registerPanel(TREE_PANEL, TreePanel, { keepMounted: true });

  // The MikroTik tool sits in the rail's Tools band, and only once a host is
  // marked as a router: it has nothing to show before that.
  let shown: boolean | null = null;
  let removeRailItem: (() => void) | null = null;
  const showRailItem = (visible: boolean) => {
    if (visible === shown) return;
    shown = visible;
    removeRailItem?.();
    removeRailItem = app.registerRailItem({
      id: TAB_ID,
      icon: Router,
      titleKey: "nav.title",
      kind: "tab",
      group: "tools",
      permission: "view",
      hidden: !visible,
    });
  };
  showRailItem(false);
  app.onDispose(() => removeRailItem?.());

  // The sidebar takes its header title from a rail item.
  app.onDispose(
    app.registerRailItem({
      id: TREE_PANEL,
      icon: Router,
      titleKey: "nav.title",
      kind: "panel",
      hideable: false,
      permission: "view",
      hidden: true,
    }),
  );

  // Mounted once in the shell, so the rail follows the host list as it changes.
  function RailItemSync() {
    const { hosts, loaded } = useHosts();
    const any = hosts.some(isRosHost);
    useEffect(() => {
      if (loaded) showRailItem(any);
    }, [any, loaded]);
    return null;
  }
  app.registerSlotContribution("shell.overlay", {
    actionId: "mikrotik.railSync",
    titleKey: "nav.title",
    kind: "component",
    component: RailItemSync as ComponentType<Record<string, unknown>>,
  });

  // Tools is the way in. A router's own shortcut lives in its right-click
  // menu, not as another button on the host row.
  app.registerHostAction({
    id: "mikrotik-open",
    titleKey: "nav.openHost",
    icon: Router,
    kind: "open",
    order: 55,
    tabType: TAB_ID,
    tray: false,
    when: isRosHost,
  });
  app.registerHostContextMenuItem({
    id: "mikrotik-open",
    titleKey: "nav.openHost",
    icon: Router,
    when: isRosHost,
    run: (host, shell) => {
      setTreeState({ selection: selectionId(Number(host.id), "dashboard") });
      shell.openTab(host, TAB_ID);
    },
  });
}
