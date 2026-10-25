import express, { type Request, type Response, type Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import {
  checkCommand,
  commandLabel,
  type RosClient,
  type RosCommand,
  type RosReply,
} from "./ros/command.js";
import { RosError } from "./ros/errors.js";
import {
  SETTINGS,
  readHostConfig,
  resolveTransport,
  withRosClient,
} from "./ros/connection.js";
import {
  hostLevelFor,
  permissionFor,
  redactRows,
  type RosPermission,
} from "./ros/policy.js";

const MAX_BATCH = 24;
const RANK: RosPermission[] = ["view", "operate", "configure", "administer"];

export function parseHostId(raw: unknown): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Turns a failed call into an answer the UI can show, without failing the plugin. */
export function sendError(
  ctx: PluginContext,
  res: Response,
  err: unknown,
  what: string,
): void {
  const answer = errorAnswer(err);
  if (answer.code === "ROS_UNREACHABLE") {
    ctx.log.warn(`${what} failed: ${answer.error}`);
  }
  res.status(answer.status).json({
    error: answer.error,
    code: answer.code,
    detail: answer.detail,
  });
}

function errorAnswer(err: unknown): {
  status: number;
  error: string;
  code: string;
  detail?: string;
} {
  if (err instanceof RosError) {
    return {
      status: err.status,
      error: err.message,
      code: err.code,
      detail: err.detail,
    };
  }
  // SSH failures land here: unreachable host, auth, host key.
  const message = err instanceof Error ? err.message : String(err);
  return { status: 502, error: message, code: "ROS_UNREACHABLE" };
}

const isStringMap = (value: unknown): value is Record<string, string> =>
  !!value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.values(value).every((v) => typeof v === "string");

/** Checks the shape of one command in a body. Returns the reason when it is wrong. */
export function parseCommand(body: unknown): RosCommand | string {
  const raw = (body ?? {}) as Record<string, unknown>;
  if (
    !Array.isArray(raw.path) ||
    !raw.path.every((s) => typeof s === "string")
  ) {
    return "path must be a list of menu names";
  }
  if (typeof raw.command !== "string") return "command is required";
  const attrs = raw.attrs ?? {};
  if (!isStringMap(attrs)) return "attrs values must be text";
  const query = raw.query ?? {};
  if (!isStringMap(query)) return "query values must be text";
  if (
    raw.proplist !== undefined &&
    (!Array.isArray(raw.proplist) ||
      !raw.proplist.every((p) => typeof p === "string"))
  ) {
    return "proplist must be a list of names";
  }
  const command: RosCommand = {
    path: raw.path as string[],
    command: raw.command,
    attrs,
    query,
    proplist: raw.proplist as string[] | undefined,
  };
  try {
    checkCommand(command);
  } catch (err) {
    return (err as Error).message;
  }
  return command;
}

interface Checked {
  command: RosCommand;
  permission: RosPermission;
  redact: boolean;
}

async function isEnabled(ctx: PluginContext, hostId: number) {
  return (
    (await ctx.settings.getHost<boolean>(hostId, SETTINGS.enabled)) === true
  );
}

/**
 * Everything a call must pass before it reaches the router: the policy,
 * the plugin permission, access to the Termix host and the host's switch.
 * Answers the request itself and returns null when one fails.
 */
async function authorize(
  ctx: PluginContext,
  req: Request,
  res: Response,
  bodies: unknown[],
): Promise<{ hostId: number; checked: Checked[] } | null> {
  const hostId = parseHostId((req.params as { hostId?: string }).hostId);
  if (!hostId) {
    res.status(400).json({ error: "Invalid hostId" });
    return null;
  }
  const checked: Checked[] = [];
  for (const body of bodies) {
    const command = parseCommand(body);
    if (typeof command === "string") {
      res.status(400).json({ error: command, code: "ROS_BAD_REQUEST" });
      return null;
    }
    const answer = permissionFor(command);
    if ("error" in answer) {
      res.status(403).json({
        error: `${commandLabel(command)}: ${answer.error}`,
        code: "ROS_COMMAND_NOT_ALLOWED",
      });
      return null;
    }
    checked.push({ command, ...answer });
  }
  const needed = checked.reduce<RosPermission>(
    (most, c) =>
      RANK.indexOf(c.permission) > RANK.indexOf(most) ? c.permission : most,
    "view",
  );
  if (!(await ctx.rbac.has(needed))) {
    res.status(403).json({
      error: `This needs the mikrotik.${needed} permission`,
      code: "ROS_PERMISSION",
      permission: needed,
    });
    return null;
  }
  const access = await ctx.hosts.checkAccess(hostId, hostLevelFor(needed));
  if (!access.hasAccess) {
    const visible = (await ctx.hosts.checkAccess(hostId, "connect")).hasAccess;
    res.status(visible ? 403 : 404).json({
      error: visible
        ? "You need edit access to this host to change it"
        : "Host not found",
      code: visible ? "ROS_HOST_ACCESS" : undefined,
    });
    return null;
  }
  if (!(await isEnabled(ctx, hostId))) {
    res.status(409).json({
      error: "MikroTik is not turned on for this host",
      code: "ROS_NOT_ENABLED",
    });
    return null;
  }
  // Administrators see secrets; everyone else gets them blanked.
  const seesSecrets = await ctx.rbac.has("administer");
  for (const c of checked) if (seesSecrets) c.redact = false;
  return { hostId, checked };
}

async function runChecked(client: RosClient, c: Checked): Promise<RosReply> {
  const changes = c.command.command !== "print" && c.command.command !== "get";
  const reply = await client.run({
    ...c.command,
    timeoutMs: changes ? 90000 : 45000,
  });
  return c.redact ? { ...reply, rows: redactRows(reply.rows) } : reply;
}

function isChange(c: Checked) {
  return c.permission !== "view";
}

async function audit(
  ctx: PluginContext,
  req: Request,
  hostId: number,
  c: Checked,
  error?: unknown,
) {
  if (!isChange(c)) return;
  await ctx.audit
    .record({
      action: "routeros_call",
      resourceType: "host",
      resourceId: String(hostId),
      details: commandLabel(c.command),
      success: !error,
      errorMessage: error
        ? error instanceof Error
          ? error.message
          : String(error)
        : undefined,
      request: req,
    })
    .catch(() => {});
}

export function registerRoutes(ctx: PluginContext, router: Router): void {
  const hosts = express.Router({ mergeParams: true });
  router.use(ctx.rbac.require("view") as never);

  /**
   * @openapi
   * /plugin-api/mikrotik/hosts/{hostId}/connection:
   *   get:
   *     summary: Test the connection to a router
   *     description: Logs in with the transport the host is set to and returns the router's identity, resources, RouterBOARD and packages.
   *     tags: [MikroTik]
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200: { description: The transport used, identity, resources, routerboard and packages. }
   *       400: { description: Invalid hostId, or no username is set. }
   *       401: { description: RouterOS refused the login. }
   *       403: { description: Missing the mikrotik.view permission. }
   *       404: { description: Host not found. }
   *       409: { description: MikroTik is not turned on for this host. }
   *       502: { description: The router could not be reached. }
   */
  hosts.get("/connection", async (req, res) => {
    const ok = await authorize(ctx, req, res, []);
    if (!ok) return;
    const { hostId } = ok;
    try {
      const config = await readHostConfig(ctx, hostId);
      const result = await withRosClient(ctx, hostId, async (client) => {
        const print = (path: string[], proplist?: string[]) =>
          client
            .run({ path, command: "print", proplist })
            .then((r) => r.rows)
            .catch(() => null);
        const [resource, identity, routerboard, packages] = await Promise.all([
          client.run({ path: ["system", "resource"], command: "print" }),
          print(["system", "identity"]),
          print(["system", "routerboard"]),
          print(["system", "package"], ["name", "version", "disabled"]),
        ]);
        return {
          transport: client.transport,
          resource: resource.rows[0] ?? {},
          identity: identity?.[0]?.name ?? null,
          routerboard: routerboard?.[0] ?? null,
          packages: packages ?? [],
        };
      });
      res.json({
        ...result,
        configuredTransport: config.transport,
        resolvedTransport: resolveTransport(config),
      });
    } catch (err) {
      sendError(ctx, res, err, `RouterOS connection test for host ${hostId}`);
    }
  });

  /**
   * @openapi
   * /plugin-api/mikrotik/hosts/{hostId}/call:
   *   post:
   *     summary: Run one RouterOS command on a router
   *     description: >
   *       Runs a command such as /ip/address/print or /interface/enable on the
   *       router through the host's transport. Printing needs
   *       mikrotik.view, and secrets are left out unless the caller has
   *       mikrotik.administer. Bounded tools and switching interfaces need
   *       mikrotik.operate, changes mikrotik.configure, and users, packages,
   *       scripts, files, services, reboot and unknown commands
   *       mikrotik.administer. Changes need edit access to the host and are
   *       audited.
   *     tags: [MikroTik]
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema: { type: integer }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [path, command]
   *             properties:
   *               path:
   *                 type: array
   *                 items: { type: string }
   *                 example: [ip, address]
   *               command: { type: string, example: print }
   *               attrs: { type: object, additionalProperties: { type: string } }
   *               proplist: { type: array, items: { type: string } }
   *               query: { type: object, additionalProperties: { type: string } }
   *     responses:
   *       200: { description: "The rows the command printed, and ret, the id an add made." }
   *       400: { description: Invalid body, or RouterOS refused the arguments. }
   *       401: { description: RouterOS refused the login. }
   *       403: { description: The command is not allowed, or the permission it needs is missing. }
   *       404: { description: Host not found, or the menu or item does not exist. }
   *       409: { description: MikroTik is not turned on for this host. }
   *       502: { description: The router could not be reached. }
   */
  hosts.post("/call", async (req, res) => {
    const ok = await authorize(ctx, req, res, [req.body]);
    if (!ok) return;
    const { hostId, checked } = ok;
    const [c] = checked;
    try {
      const reply = await withRosClient(ctx, hostId, (client) =>
        runChecked(client, c),
      );
      await audit(ctx, req, hostId, c);
      res.json(reply);
    } catch (err) {
      await audit(ctx, req, hostId, c, err);
      sendError(
        ctx,
        res,
        err,
        `RouterOS ${commandLabel(c.command)} on host ${hostId}`,
      );
    }
  });

  /**
   * @openapi
   * /plugin-api/mikrotik/hosts/{hostId}/batch:
   *   post:
   *     summary: Run several RouterOS commands over one connection
   *     description: >
   *       Runs up to 24 commands, in order, over one login. Each answers on
   *       its own: rows and ret, or error and code. The permission needed is
   *       the highest any of them needs.
   *     tags: [MikroTik]
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema: { type: integer }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [calls]
   *             properties:
   *               calls:
   *                 type: array
   *                 items: { type: object }
   *     responses:
   *       200: { description: One result per call, in order. }
   *       400: { description: Invalid body. }
   *       403: { description: A command is not allowed, or the permission is missing. }
   *       404: { description: Host not found. }
   *       409: { description: MikroTik is not turned on for this host. }
   *       502: { description: The router could not be reached. }
   */
  hosts.post("/batch", async (req, res) => {
    const calls = (req.body as { calls?: unknown })?.calls;
    if (!Array.isArray(calls) || !calls.length || calls.length > MAX_BATCH) {
      return void res
        .status(400)
        .json({ error: `calls must be a list of 1 to ${MAX_BATCH} commands` });
    }
    const ok = await authorize(ctx, req, res, calls);
    if (!ok) return;
    const { hostId, checked } = ok;
    try {
      const results = await withRosClient(ctx, hostId, async (client) => {
        const out: unknown[] = [];
        for (const c of checked) {
          try {
            out.push(await runChecked(client, c));
            await audit(ctx, req, hostId, c);
          } catch (err) {
            await audit(ctx, req, hostId, c, err);
            const answer = errorAnswer(err);
            // A lost connection fails the rest too.
            if (answer.code === "ROS_UNREACHABLE") throw err;
            out.push({ error: answer.error, code: answer.code });
          }
        }
        return out;
      });
      res.json({ results });
    } catch (err) {
      sendError(ctx, res, err, `RouterOS batch on host ${hostId}`);
    }
  });

  router.use("/hosts/:hostId", hosts);
}
