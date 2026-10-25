import { useEffect, useMemo, useRef, useState } from "react";
import {
  useHosts,
  useShell,
  useTranslation,
  type ShellApi,
  type TabProps,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  Badge,
  Button,
  EmptyState,
  PanelSearch,
  PanelShell,
  ScrollArea,
} from "@termix-ssh/plugin-sdk/ui";
import { RefreshCw, Router, Search } from "lucide-react";
import { isRosHost } from "../api";
import { errorText } from "../error-text";
import { findMenu } from "../menus/catalog";
import { loadRouter, useRouters } from "../routers";
import {
  selectionId,
  selectionOf,
  setTreeState,
  useTreeState,
} from "../treeStore";
import { MenuView } from "../views/MenuView";
import { SafeModeButton } from "../panels/SafeMode";
import { DiscoveryDialog } from "../panels/DiscoveryDialog";
import { RouterTree } from "./RouterTree";
import { TREE_PANEL } from "./TreePanel";

/**
 * Shows the tree in the left sidebar while the MikroTik tab is on screen,
 * and gives the sidebar back to what it showed before when the tab is left.
 * Phones keep the tree in the tab: their sidebar is a drawer over everything.
 */
function useSidebarTree(isVisible: boolean, shell: ShellApi) {
  const live = useShell();
  const mobile = live?.env.isMobile ?? false;
  const leftView = live?.regions.left.view;
  const leftRef = useRef(leftView);
  leftRef.current = leftView;

  useEffect(() => {
    if (mobile || !isVisible) return;
    const previous = leftRef.current;
    if (previous !== TREE_PANEL) shell.openRailView(TREE_PANEL);
    return () => {
      if (leftRef.current !== TREE_PANEL) return;
      if (previous && previous !== TREE_PANEL) shell.openRailView(previous);
      else shell.closeRailView(TREE_PANEL);
    };
  }, [isVisible, mobile, shell]);
}

const VERSION_BADGE = (major: number) =>
  major >= 7 ? "v7" : major === 6 ? "v6" : "";

function Details({ isVisible }: { isVisible: boolean }) {
  const { t } = useTranslation();
  const { routers, state, selection } = useTreeState();
  const picked = selectionOf(selection);
  const router = routers.find((r) => r.id === picked?.hostId);
  if (!picked || !router) {
    return <EmptyState icon={Router} title={t("app.pickMenu")} />;
  }
  const routerState = state[router.id];
  const info = routerState?.info ?? null;
  const menu = findMenu(picked.menu);
  if (!info) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
        <EmptyState
          icon={Router}
          title={routerState?.error ? t("app.loadFailed") : t("app.loading")}
        />
        {routerState?.error && (
          <p
            role="alert"
            className="max-w-xl whitespace-pre-wrap text-xs text-muted-foreground"
          >
            {errorText(t, routerState.error)}
          </p>
        )}
        {routerState?.error && (
          <Button size="sm" onClick={() => void loadRouter(router.id)}>
            {t("app.retry")}
          </Button>
        )}
      </div>
    );
  }
  const major = Number(/^(\d+)/.exec(info.resource.version ?? "")?.[1] ?? 0);
  return (
    <div className="flex min-h-0 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">
          {menu ? t(menu.labelKey) : picked.menu}
        </h2>
        <span className="text-xs text-muted-foreground">
          {info.identity ?? router.name} · {info.resource["board-name"]} ·
          RouterOS {info.resource.version}
        </span>
        {VERSION_BADGE(major) && (
          <Badge variant="outline">{VERSION_BADGE(major)}</Badge>
        )}
        <Badge variant="outline">{t(`transport.${info.transport}`)}</Badge>
        <div className="ml-auto">
          <SafeModeButton hostId={router.id} />
        </div>
      </div>
      {menu?.view ? (
        <MenuView
          key={selection}
          view={menu.view}
          hostId={router.id}
          info={info}
          menus={routerState?.menus ?? []}
          isVisible={isVisible}
        />
      ) : (
        <EmptyState icon={Router} title={t("app.pickMenu")} />
      )}
    </div>
  );
}

function RoutersView({
  routers,
  initialHostId,
  isVisible,
}: {
  routers: Array<{ id: number; name: string }>;
  initialHostId: number;
  isVisible: boolean;
}) {
  const { t } = useTranslation();
  const hostIds = useMemo(() => routers.map((r) => r.id), [routers]);
  const { loadAll } = useRouters(hostIds, isVisible);
  const { state, query, selection, inSidebar } = useTreeState();

  useEffect(() => {
    setTreeState({ routers });
  }, [routers]);

  // Opened from a host: its dashboard, unless something of it is picked.
  useEffect(() => {
    const picked = selectionOf(selection);
    if (!picked || !hostIds.includes(picked.hostId)) {
      setTreeState({ selection: selectionId(initialHostId, "dashboard") });
    }
    // Only when the tab opens or the host list changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialHostId, hostIds]);

  const [discovering, setDiscovering] = useState(false);
  const loading = routers.some((r) => state[r.id]?.loading);
  const online = routers.filter(
    (r) => state[r.id]?.info && !state[r.id]?.error,
  ).length;

  return (
    <PanelShell
      icon={<Router className="size-4" />}
      title={t("nav.title")}
      status={t("app.status", { online, total: routers.length })}
      scroll={false}
      actions={
        <>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDiscovering(true)}
            title={t("discovery.title")}
          >
            <Search className="mr-1 size-3.5" />
            {t("discovery.open")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void loadAll()}
            disabled={loading}
            title={t("app.refresh")}
          >
            <RefreshCw
              className={loading ? "size-3.5 animate-spin" : "size-3.5"}
            />
          </Button>
        </>
      }
      toolbar={
        inSidebar ? undefined : (
          <PanelSearch
            value={query}
            onChange={(next) => setTreeState({ query: next })}
            placeholder={t("app.search")}
            fill
          />
        )
      }
    >
      <div className="flex h-full min-h-0">
        {!inSidebar && (
          <ScrollArea className="w-64 shrink-0 border-r border-border">
            <RouterTree />
          </ScrollArea>
        )}
        {/* A plain scroller: Radix ScrollArea lays its content out as a
            table, which grows past the pane instead of wrapping. */}
        <div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
          <Details isVisible={isVisible} />
        </div>
      </div>
      {discovering && <DiscoveryDialog onClose={() => setDiscovering(false)} />}
    </PanelShell>
  );
}

function NoRouters({ loaded }: { loaded: boolean }) {
  const { t } = useTranslation();
  const [discovering, setDiscovering] = useState(false);
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <EmptyState
        icon={Router}
        title={loaded ? t("app.noHosts") : t("app.loading")}
      />
      {loaded && (
        <>
          <p className="max-w-md text-xs text-muted-foreground">
            {t("app.noHostsHint")}
          </p>
          <Button size="sm" onClick={() => setDiscovering(true)}>
            <Search className="mr-1 size-3.5" />
            {t("discovery.open")}
          </Button>
        </>
      )}
      {discovering && <DiscoveryDialog onClose={() => setDiscovering(false)} />}
    </div>
  );
}

export function MikrotikTab({ host, isVisible, shell }: TabProps) {
  const { t } = useTranslation();
  useSidebarTree(isVisible, shell);
  const { hosts, loaded } = useHosts();
  const routers = useMemo(
    () =>
      hosts
        .filter(isRosHost)
        .map((h) => ({ id: Number(h.id), name: String(h.name || h.ip) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [hosts],
  );
  const opened = host && isRosHost(host) ? Number(host.id) : null;

  if (!routers.length) {
    return <NoRouters loaded={loaded} />;
  }

  return (
    <RoutersView
      routers={routers}
      initialHostId={opened ?? routers[0].id}
      isVisible={isVisible}
    />
  );
}
