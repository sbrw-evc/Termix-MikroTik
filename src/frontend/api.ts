import type {
  PluginHostRecord,
  TermixApp,
} from "@termix-ssh/plugin-sdk/frontend";
import manifest from "../../manifest.json";

/** This plugin's id, the key its host settings sit under on a host record. */
export const PLUGIN_ID = manifest.id;

let current: TermixApp | null = null;

/** Set in activate, cleared on deactivate. */
export function setApp(app: TermixApp | null): void {
  current = app;
}

export function app(): TermixApp {
  if (!current) throw new Error("The MikroTik plugin is not active");
  return current;
}

/** Whether a host is marked as a RouterOS router in its settings. */
export function isRosHost(host: Pick<PluginHostRecord, "pluginSettings">) {
  return host.pluginSettings?.[PLUGIN_ID]?.enableRouterOs === true;
}

export type Row = Record<string, string>;

export interface RosCommand {
  path: string[];
  command: string;
  attrs?: Record<string, string>;
  proplist?: string[];
  query?: Record<string, string>;
}

export interface RosReply {
  rows: Row[];
  ret?: string;
}

/** What a failed call carries, for the UI to show. */
export interface RosCallError {
  message: string;
  code?: string;
  detail?: string;
}

export function toCallError(err: unknown): RosCallError {
  const data = (
    err as {
      response?: { data?: { error?: string; code?: string; detail?: string } };
    }
  )?.response?.data;
  if (data?.error) {
    return { message: data.error, code: data.code, detail: data.detail };
  }
  if (err && typeof err === "object" && "message" in err && "code" in err) {
    return err as RosCallError;
  }
  return { message: err instanceof Error ? err.message : String(err) };
}

/** "ip/address" → ["ip", "address"]. */
export const splitPath = (path: string) => path.split("/").filter(Boolean);

/** One RouterOS command on a router, through the plugin's checked proxy. */
export async function ros(
  hostId: number,
  path: string | string[],
  command: string,
  attrs?: Record<string, string>,
  extra?: Pick<RosCommand, "proplist" | "query">,
): Promise<RosReply> {
  const { data } = await app().api.post<RosReply>(`/hosts/${hostId}/call`, {
    path: typeof path === "string" ? splitPath(path) : path,
    command,
    attrs: attrs ?? {},
    ...extra,
  });
  return data;
}

/** print, as rows. */
export async function print(
  hostId: number,
  path: string,
  extra?: Pick<RosCommand, "proplist" | "query"> & {
    attrs?: Record<string, string>;
  },
): Promise<Row[]> {
  return (await ros(hostId, path, "print", extra?.attrs, extra)).rows;
}

export type BatchResult = RosReply | { error: string; code?: string };

export const failed = (r: BatchResult): r is { error: string; code?: string } =>
  "error" in r;

/** Several commands over one login; each answers on its own. */
export async function batch(
  hostId: number,
  calls: RosCommand[],
): Promise<BatchResult[]> {
  const { data } = await app().api.post<{ results: BatchResult[] }>(
    `/hosts/${hostId}/batch`,
    { calls },
  );
  return data.results;
}

export type RosTransport = "api-tunnel" | "rest-tunnel" | "rest" | "api";

export interface RouterInfo {
  transport: RosTransport;
  resource: Row;
  identity: string | null;
  routerboard: Row | null;
  packages: Row[];
}

export async function testConnection(hostId: number): Promise<RouterInfo> {
  return (await app().api.get<RouterInfo>(`/hosts/${hostId}/connection`)).data;
}

/** RouterOS's major version, 6 or 7, from "7.16.1 (stable)". */
export function majorOf(info: Pick<RouterInfo, "resource"> | null): number {
  const m = /^(\d+)/.exec(info?.resource.version ?? "");
  return m ? Number(m[1]) : 0;
}

/** Version as numbers for comparing: "7.13.2" → [7, 13, 2]. */
export function versionOf(info: Pick<RouterInfo, "resource"> | null): number[] {
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(info?.resource.version ?? "");
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] : [0, 0, 0];
}

export function atLeast(
  info: Pick<RouterInfo, "resource"> | null,
  major: number,
  minor = 0,
): boolean {
  const [a, b] = versionOf(info);
  return a > major || (a === major && b >= minor);
}

/** Whether a package is installed and on. */
export function hasPackage(info: RouterInfo | null, name: string): boolean {
  return !!info?.packages.some((p) => p.name === name && p.disabled !== "true");
}

export const isTrue = (value: string | undefined) =>
  value === "true" || value === "yes";
