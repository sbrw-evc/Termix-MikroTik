import { atLeast, majorOf } from "../api";
import type {
  ActionSpec,
  CustomSpec,
  FieldSpec,
  FormSpec,
  Requirement,
  TableSpec,
  TabsSpec,
  ViewSpec,
} from "./types";

/*
 * Short ways to write the catalog. A field is its RouterOS property name and
 * what kind of input it takes; labels come from the property names, so the
 * catalog stays a list of what WinBox has.
 */

type Opts = Omit<FieldSpec, "key" | "kind">;

export const text = (key: string, o: Opts = {}): FieldSpec => ({
  key,
  kind: "text",
  ...o,
});
export const num = (key: string, o: Opts = {}): FieldSpec => ({
  key,
  kind: "number",
  ...o,
});
export const check = (key: string, o: Opts = {}): FieldSpec => ({
  key,
  kind: "check",
  ...o,
});
export const secret = (key: string, o: Opts = {}): FieldSpec => ({
  key,
  kind: "secret",
  ...o,
});
export const area = (key: string, o: Opts = {}): FieldSpec => ({
  key,
  kind: "textarea",
  ...o,
});
export const select = (
  key: string,
  options: string[],
  o: Opts = {},
): FieldSpec => ({
  key,
  kind: "select",
  options,
  ...o,
});
export const ref = (key: string, path: string, o: Opts = {}): FieldSpec => ({
  key,
  kind: "ref",
  ref: path,
  ...o,
});
/** An interface name. */
export const iface = (key = "interface", o: Opts = {}): FieldSpec =>
  ref(key, "interface", o);
/** An interface list name, with all, none, dynamic as RouterOS offers. */
export const ifaceList = (key = "interface-list", o: Opts = {}): FieldSpec =>
  ref(key, "interface/list", {
    extra: ["all", "none", "dynamic", "static"],
    ...o,
  });
export const comment = (): FieldSpec => text("comment", { wide: true });
export const disabled = (): FieldSpec => check("disabled");
export const name = (o: Opts = {}): FieldSpec =>
  text("name", { required: true, ...o });

export function table(
  path: string,
  columns: string[],
  fields: FieldSpec[] = [],
  options: Partial<
    Omit<TableSpec, "kind" | "path" | "columns" | "fields">
  > = {},
): TableSpec {
  return { kind: "table", path, columns, fields, ...options };
}

/** A status list RouterOS keeps itself: nothing to add or change. */
export function status(
  path: string,
  columns: string[],
  options: Partial<Omit<TableSpec, "kind" | "path" | "columns">> = {},
): TableSpec {
  return {
    kind: "table",
    path,
    columns,
    readOnly: true,
    noToggle: true,
    ...options,
  };
}

export function form(
  path: string,
  fields: FieldSpec[],
  options: Partial<Omit<FormSpec, "kind" | "path" | "fields">> = {},
): FormSpec {
  return { kind: "form", path, fields, ...options };
}

export function custom(component: CustomSpec["component"]): CustomSpec {
  return { kind: "custom", component };
}

export function tabs(
  ...list: Array<[id: string, view: ViewSpec, requires?: Requirement]>
): TabsSpec {
  return {
    kind: "tabs",
    tabs: list.map(([id, view, requires]) => ({
      id,
      labelKey: `tab.${id}`,
      view,
      requires,
    })),
  };
}

export const action = (
  id: string,
  command: string,
  o: Partial<Omit<ActionSpec, "id" | "command">> = {},
): ActionSpec => ({ id, command, labelKey: `action.${id}`, ...o });

// Requirements.

export const v6: Requirement = ({ info }) => majorOf(info) === 6;
export const v7: Requirement = ({ info }) => majorOf(info) >= 7;
export const since =
  (major: number, minor: number): Requirement =>
  ({ info }) =>
    atLeast(info, major, minor);
export const has =
  (menu: string): Requirement =>
  ({ menus }) =>
    menus.includes(menu);
export const all =
  (...reqs: Requirement[]): Requirement =>
  (router) =>
    reqs.every((r) => r(router));

/** Menus that only some routers have, asked for once per router. */
export const OPTIONAL_MENUS = [
  "interface/wireless",
  "interface/wifi",
  "interface/wifiwave2",
  "caps-man",
  "container",
  "interface/lte",
  "ip/hotspot",
  "user-manager",
  "interface/ethernet/switch",
  "system/health",
  "system/routerboard",
  "ipv6/address",
  "interface/wireguard",
  "mpls",
  "interface/vxlan",
  "zerotier",
  "iot",
  "system/ups",
  "system/resource/usb",
  "system/resource/pci",
  "interface/ethernet/switch/vlan",
  "interface/ethernet/switch/host",
];
