import type { ComponentType } from "react";
import type { Row, RouterInfo } from "../api";

/*
 * WinBox is a menu of windows, most of them a list from one RouterOS menu
 * with a dialog per entry, some a form of one menu's settings. This plugin
 * draws those from specs, so each menu only says what it holds.
 */

export type FieldKind =
  | "text"
  | "number"
  | "check"
  | "select"
  | "textarea"
  | "secret"
  /** A name from another menu, like an interface: suggested, not forced. */
  | "ref";

export interface FieldSpec {
  /** The RouterOS property name. */
  key: string;
  kind?: FieldKind;
  /** RouterOS words to pick from, shown as they are. */
  options?: string[];
  /** For ref: where the names come from, "interface" or "ip/pool". */
  ref?: string;
  /** For ref: the property that names an entry. Default name. */
  refKey?: string;
  /** For ref: words offered besides the names, like "all" or "none". */
  extra?: string[];
  required?: boolean;
  /** Set on add only, read only after. */
  createOnly?: boolean;
  placeholder?: string;
  /** Spans both columns. */
  wide?: boolean;
  /** Shown only when this holds for the form's values. */
  showIf?: (values: Record<string, string>) => boolean;
  /** Filled in on add. */
  default?: string;
  /** Translation key of a hint under the input. */
  hintKey?: string;
  /**
   * On edit, only when the entry has this property: for names RouterOS
   * changed between versions, or that only some hardware has.
   */
  onlyIfPresent?: boolean;
}

/** A command a row's menu or the toolbar runs, like Flush or Renew. */
export interface ActionSpec {
  id: string;
  labelKey: string;
  command: string;
  /** Extra arguments; the selected rows go in as numbers. */
  attrs?: Record<string, string>;
  /** Applies to the selected rows rather than the whole menu. */
  perRow?: boolean;
  /** Asks first, with this text. */
  confirmKey?: string;
  /** Shown only for rows where this holds. */
  when?: (row: Row) => boolean;
}

export interface TableSpec {
  kind: "table";
  path: string;
  /** Property names shown as columns, in order. */
  columns: string[];
  fields?: FieldSpec[];
  /** Order matters (firewall rules, queues): offer Move up and Move down. */
  ordered?: boolean;
  /** Nothing can be added, changed or removed here. */
  readOnly?: boolean;
  noAdd?: boolean;
  noRemove?: boolean;
  /** Has no enable and disable (status tables). */
  noToggle?: boolean;
  /** Entries can be removed but not edited, like connections. */
  noEdit?: boolean;
  actions?: ActionSpec[];
  /** Arguments for print, like stats. */
  printAttrs?: Record<string, string>;
  /** Only rows matching these. */
  query?: Record<string, string>;
  /** Arguments every add sends, like type=vlan. */
  addDefaults?: Record<string, string>;
  /** How often the list refreshes while on screen; 0 turns it off. */
  refreshMs?: number;
  /** The property that names a row in dialogs; name by default. */
  nameKey?: string;
}

export interface FormSpec {
  kind: "form";
  path: string;
  fields: FieldSpec[];
  actions?: ActionSpec[];
  /** Read only properties to show under the form. */
  status?: string[];
  /** Everything here is RouterOS's own: nothing to apply. */
  readOnly?: boolean;
  refreshMs?: number;
}

export interface ViewProps {
  hostId: number;
  info: RouterInfo | null;
  menus: string[];
  isVisible: boolean;
}

export interface CustomSpec {
  kind: "custom";
  component: ComponentType<ViewProps>;
}

export interface TabsSpec {
  kind: "tabs";
  tabs: Array<{
    id: string;
    labelKey: string;
    view: ViewSpec;
    requires?: Requirement;
  }>;
}

export type ViewSpec = TableSpec | FormSpec | CustomSpec | TabsSpec;

/** What a router must have for a menu to show. */
export type Requirement = (router: {
  info: RouterInfo | null;
  menus: string[];
}) => boolean;

export interface MenuNode {
  id: string;
  labelKey: string;
  icon?: ComponentType<{ className?: string }>;
  view?: ViewSpec;
  children?: MenuNode[];
  requires?: Requirement;
}
