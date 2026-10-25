import { useEffect, useState } from "react";
import { print, ros, type Row } from "../api";
import type { FieldSpec } from "../menus/types";

/*
 * Names other menus hold, for the suggestions of ref fields: interfaces,
 * pools, profiles, lists. Cached briefly per router, so a dialog with
 * several interface fields asks once.
 */

const TTL_MS = 30000;
const cache = new Map<string, { at: number; names: Promise<string[]> }>();

export function loadNames(
  hostId: number,
  path: string,
  key = "name",
): Promise<string[]> {
  const id = `${hostId}|${path}|${key}`;
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.names;
  const names = print(hostId, path, { proplist: [key] })
    .then((rows) =>
      [...new Set(rows.map((r) => r[key]).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
      ),
    )
    .catch(() => {
      cache.delete(id);
      return [] as string[];
    });
  cache.set(id, { at: Date.now(), names });
  return names;
}

/** Forgets a router's names, after a change that adds or renames one. */
export function dropNames(hostId: number): void {
  for (const id of cache.keys()) {
    if (id.startsWith(`${hostId}|`)) cache.delete(id);
  }
}

export function useNames(
  hostId: number,
  path: string | undefined,
  key?: string,
): string[] {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    if (!path) return;
    let live = true;
    void loadNames(hostId, path, key).then((n) => live && setNames(n));
    return () => {
      live = false;
    };
  }, [hostId, path, key]);
  return names;
}

/*
 * The arguments a command takes, from RouterOS v7's own help
 * (/console/inspect). Forms leave out fields the router's version doesn't
 * know. v6 has no inspect: null, and every field shows.
 */
const argsCache = new Map<string, Promise<Set<string> | null>>();

export function loadArgs(
  hostId: number,
  path: string,
  command: string,
): Promise<Set<string> | null> {
  const id = `${hostId}|${path}|${command}`;
  const hit = argsCache.get(id);
  if (hit) return hit;
  const args = ros(hostId, "console", "inspect", {
    request: "child",
    path: [...path.split("/"), command].join(","),
  })
    .then((reply) => {
      const names = reply.rows
        .filter((r) => r["node-type"] === "arg")
        .map((r) => r.name);
      return names.length ? new Set(names) : null;
    })
    .catch(() => null);
  argsCache.set(id, args);
  return args;
}

export function useArgs(
  hostId: number,
  path: string,
  command: string,
): Set<string> | null {
  const [args, setArgs] = useState<Set<string> | null>(null);
  useEffect(() => {
    let live = true;
    void loadArgs(hostId, path, command).then((a) => live && setArgs(a));
    return () => {
      live = false;
    };
  }, [hostId, path, command]);
  return args;
}

/**
 * The fields a form shows: ones the router takes (dotted wifi names are
 * kept, inspect lists them apart), and onlyIfPresent ones the entry has.
 */
export function usableFields(
  fields: FieldSpec[],
  row: Row | null,
  accepted: Set<string> | null,
): FieldSpec[] {
  return fields.filter(
    (f) =>
      (!f.onlyIfPresent || (row !== null && f.key in row)) &&
      (!accepted || f.key.includes(".") || accepted.has(f.key)),
  );
}
