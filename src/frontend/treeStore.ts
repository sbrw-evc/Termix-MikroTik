import { useSyncExternalStore } from "react";
import type { RosCallError, RouterInfo } from "./api";

/** One router as the MikroTik tab last loaded it. */
export interface RouterState {
  info: RouterInfo | null;
  /** Optional menus this router has, like "interface/wifi" or "container". */
  menus: string[];
  error: RosCallError | null;
  loading: boolean;
}

/**
 * What the MikroTik tab and the tree in the left sidebar share: the tab
 * loads the routers and shows the details, the sidebar draws the tree, and
 * either can change what is selected. They render apart, so this lives
 * outside React.
 */
export interface TreeState {
  routers: Array<{ id: number; name: string }>;
  state: Record<number, RouterState>;
  query: string;
  /** "<hostId>|<menu id>". */
  selection: string | null;
  /** Menu groups that are folded, as "<hostId>|<group id>". */
  collapsed: string[];
  /** The sidebar tree is the one on screen, so the tab leaves its own out. */
  inSidebar: boolean;
}

const COLLAPSED_KEY = "mikrotik.collapsed";

function readCollapsed(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

const fresh = (): TreeState => ({
  routers: [],
  state: {},
  query: "",
  selection: null,
  collapsed: readCollapsed(),
  inSidebar: false,
});

let state: TreeState = fresh();
const listeners = new Set<() => void>();

export function getTreeState(): TreeState {
  return state;
}

export function setTreeState(patch: Partial<TreeState>): void {
  const next = { ...state, ...patch };
  if (
    Object.keys(patch).every(
      (k) => next[k as keyof TreeState] === state[k as keyof TreeState],
    )
  )
    return;
  if (patch.collapsed) {
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify(patch.collapsed));
    } catch {
      // Storage off: folding lasts until the page reloads.
    }
  }
  state = next;
  for (const listener of listeners) listener();
}

export function setRouterState(hostId: number, patch: Partial<RouterState>) {
  const before = state.state[hostId] ?? {
    info: null,
    menus: [],
    error: null,
    loading: false,
  };
  setTreeState({
    state: { ...state.state, [hostId]: { ...before, ...patch } },
  });
}

export function subscribeTree(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTreeState(): TreeState {
  return useSyncExternalStore(subscribeTree, getTreeState, getTreeState);
}

export function selectionOf(
  selection: string | null,
): { hostId: number; menu: string } | null {
  if (!selection) return null;
  const bar = selection.indexOf("|");
  if (bar < 1) return null;
  const hostId = Number(selection.slice(0, bar));
  return Number.isInteger(hostId)
    ? { hostId, menu: selection.slice(bar + 1) }
    : null;
}

export const selectionId = (hostId: number, menu: string) =>
  `${hostId}|${menu}`;

/** For tests: back to a fresh state. */
export function resetTreeState(): void {
  state = { ...fresh(), collapsed: [] };
  for (const listener of listeners) listener();
}
