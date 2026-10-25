import express, { type Request, type Response, type Router } from "express";
import type { Client, SFTPWrapper } from "ssh2";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { SETTINGS } from "./ros/connection.js";
import { hostLevelFor, type RosPermission } from "./ros/policy.js";
import { parseHostId } from "./routes.js";

/*
 * What only the router's own SSH server does: the CLI (/export, a command
 * typed into Terminal) and its files over SFTP. Everything here needs
 * mikrotik.administer and edit access to the host, and is audited.
 */

const MAX_UPLOAD = 64 * 1024 * 1024;
// RouterOS file names: letters, digits, dots, dashes, underscores, folders.
const FILE_RE = /^(?!.*\.\.)[A-Za-z0-9._\- ]+(\/[A-Za-z0-9._\- ]+)*$/;

async function gate(
  ctx: PluginContext,
  req: Request,
  res: Response,
  permission: RosPermission,
): Promise<number | null> {
  const hostId = parseHostId((req.params as { hostId?: string }).hostId);
  if (!hostId) {
    res.status(400).json({ error: "Invalid hostId" });
    return null;
  }
  if (!(await ctx.rbac.has(permission))) {
    res.status(403).json({
      error: `This needs the mikrotik.${permission} permission`,
      code: "ROS_PERMISSION",
      permission,
    });
    return null;
  }
  const access = await ctx.hosts.checkAccess(hostId, hostLevelFor(permission));
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
  if (
    (await ctx.settings.getHost<boolean>(hostId, SETTINGS.enabled)) !== true
  ) {
    res.status(409).json({
      error: "MikroTik is not turned on for this host",
      code: "ROS_NOT_ENABLED",
    });
    return null;
  }
  return hostId;
}

function sshFailure(
  ctx: PluginContext,
  res: Response,
  err: unknown,
  what: string,
) {
  const message = err instanceof Error ? err.message : String(err);
  ctx.log.warn(`${what} failed: ${message}`);
  if (!res.headersSent) {
    res.status(502).json({ error: message, code: "ROS_UNREACHABLE" });
  } else {
    res.destroy();
  }
}

function sftp(client: Client): Promise<SFTPWrapper> {
  return new Promise((resolve, reject) =>
    client.sftp((err, s) => (err ? reject(err) : resolve(s))),
  );
}

async function record(
  ctx: PluginContext,
  req: Request,
  hostId: number,
  action: string,
  details: string,
  error?: unknown,
) {
  await ctx.audit
    .record({
      action,
      resourceType: "host",
      resourceId: String(hostId),
      details,
      success: !error,
      errorMessage: error
        ? String((error as Error).message ?? error)
        : undefined,
      request: req,
    })
    .catch(() => {});
}

/** The RouterOS CLI command for an export: terse, with or without secrets. */
export function exportCommand(options: {
  sensitive: boolean;
  major: number;
  compact?: boolean;
}): string {
  const parts = ["/export", "terse"];
  // v7 hides secrets unless asked; v6 shows them unless told not to.
  if (options.major >= 7 && options.sensitive) parts.push("show-sensitive");
  if (options.major === 6 && !options.sensitive) parts.push("hide-sensitive");
  if (options.major === 6 && options.compact) parts.push("compact");
  if (options.major >= 7 && options.compact === false) parts.push("verbose");
  return parts.join(" ");
}

export function registerSshRoutes(ctx: PluginContext, router: Router): void {
  const hosts = express.Router({ mergeParams: true });

  /**
   * @openapi
   * /plugin-api/mikrotik/hosts/{hostId}/exec:
   *   post:
   *     summary: Run a RouterOS CLI command over SSH
   *     description: Runs one command, like `/ip address print`, in the router's CLI and returns what it printed. Needs mikrotik.administer and edit access to the host; audited.
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
   *             required: [command]
   *             properties:
   *               command: { type: string }
   *     responses:
   *       200: { description: "stdout, stderr and the exit code." }
   *       400: { description: Invalid body. }
   *       403: { description: Missing the mikrotik.administer permission or edit access. }
   *       404: { description: Host not found. }
   *       409: { description: MikroTik is not turned on for this host. }
   *       502: { description: SSH to the router failed. }
   */
  hosts.post("/exec", async (req, res) => {
    const command = (req.body as { command?: unknown })?.command;
    if (
      typeof command !== "string" ||
      !command.trim() ||
      command.length > 8192
    ) {
      return void res.status(400).json({ error: "command is required" });
    }
    const hostId = await gate(ctx, req, res, "administer");
    if (!hostId) return;
    try {
      const result = await ctx.ssh.exec(hostId, command, {
        purpose: "mikrotik",
        timeoutMs: 60000,
        maxOutputBytes: 1024 * 1024,
      });
      await record(ctx, req, hostId, "routeros_exec", command.slice(0, 200));
      res.json(result);
    } catch (err) {
      await record(
        ctx,
        req,
        hostId,
        "routeros_exec",
        command.slice(0, 200),
        err,
      );
      sshFailure(ctx, res, err, `RouterOS CLI on host ${hostId}`);
    }
  });

  /**
   * @openapi
   * /plugin-api/mikrotik/hosts/{hostId}/export:
   *   get:
   *     summary: Export the router's configuration as a script
   *     description: Runs /export over SSH and returns the .rsc text. sensitive=1 includes passwords and keys. Needs mikrotik.administer.
   *     tags: [MikroTik]
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema: { type: integer }
   *       - in: query
   *         name: sensitive
   *         schema: { type: string, enum: ["0", "1"] }
   *       - in: query
   *         name: major
   *         schema: { type: integer }
   *     responses:
   *       200: { description: The configuration script. }
   *       403: { description: Missing the mikrotik.administer permission or edit access. }
   *       404: { description: Host not found. }
   *       502: { description: SSH to the router failed. }
   */
  hosts.get("/export", async (req, res) => {
    const hostId = await gate(ctx, req, res, "administer");
    if (!hostId) return;
    const sensitive = req.query.sensitive === "1";
    const major = Number(req.query.major) === 6 ? 6 : 7;
    const command = exportCommand({ sensitive, major });
    try {
      const result = await ctx.ssh.exec(hostId, command, {
        purpose: "mikrotik",
        timeoutMs: 120000,
        maxOutputBytes: 4 * 1024 * 1024,
      });
      if (result.code !== 0 && !result.stdout) {
        throw new Error(
          result.stderr.trim() || `export exited with ${result.code}`,
        );
      }
      await record(ctx, req, hostId, "routeros_export", command);
      res
        .type("text/plain; charset=utf-8")
        .send(result.stdout.replace(/\r\n/g, "\n"));
    } catch (err) {
      await record(ctx, req, hostId, "routeros_export", command, err);
      sshFailure(ctx, res, err, `RouterOS export on host ${hostId}`);
    }
  });

  /**
   * @openapi
   * /plugin-api/mikrotik/hosts/{hostId}/files/download:
   *   get:
   *     summary: Download a file from the router
   *     description: Reads a file, such as a .backup, over SFTP. Needs mikrotik.administer.
   *     tags: [MikroTik]
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema: { type: integer }
   *       - in: query
   *         name: name
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200: { description: The file. }
   *       400: { description: Invalid file name. }
   *       403: { description: Missing the mikrotik.administer permission or edit access. }
   *       502: { description: SFTP to the router failed. }
   */
  hosts.get("/files/download", async (req, res) => {
    const name = String(req.query.name ?? "");
    if (!FILE_RE.test(name))
      return void res.status(400).json({ error: "Invalid file name" });
    const hostId = await gate(ctx, req, res, "administer");
    if (!hostId) return;
    try {
      await ctx.ssh.withConnection<void, Client>(
        hostId,
        { pool: "routeros-files", purpose: "mikrotik", profile: "stream" },
        async (client) => {
          const s = await sftp(client);
          try {
            await new Promise<void>((resolve, reject) => {
              const stream = s.createReadStream(`/${name}`);
              stream.once("error", reject);
              stream.once("open", () => {
                res.setHeader("Content-Type", "application/octet-stream");
                res.setHeader(
                  "Content-Disposition",
                  `attachment; filename="${name.split("/").pop()!.replace(/"/g, "")}"`,
                );
              });
              stream.once("end", () => resolve());
              stream.pipe(res);
            });
          } finally {
            s.end();
          }
        },
      );
      await record(ctx, req, hostId, "routeros_file_download", name);
    } catch (err) {
      await record(ctx, req, hostId, "routeros_file_download", name, err);
      sshFailure(ctx, res, err, `RouterOS file download on host ${hostId}`);
    }
  });

  /**
   * @openapi
   * /plugin-api/mikrotik/hosts/{hostId}/files/upload:
   *   post:
   *     summary: Upload a file to the router
   *     description: Writes the request body to a file over SFTP, for a .backup, .rsc or .npk. At most 64 MiB. Needs mikrotik.administer.
   *     tags: [MikroTik]
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema: { type: integer }
   *       - in: query
   *         name: name
   *         required: true
   *         schema: { type: string }
   *     requestBody:
   *       required: true
   *       content:
   *         application/octet-stream:
   *           schema: { type: string, format: binary }
   *     responses:
   *       201: { description: Uploaded. }
   *       400: { description: Invalid file name or empty body. }
   *       403: { description: Missing the mikrotik.administer permission or edit access. }
   *       413: { description: Larger than 64 MiB. }
   *       502: { description: SFTP to the router failed. }
   */
  hosts.post(
    "/files/upload",
    express.raw({ type: () => true, limit: MAX_UPLOAD }),
    async (req, res) => {
      const name = String(req.query.name ?? "");
      if (!FILE_RE.test(name))
        return void res.status(400).json({ error: "Invalid file name" });
      const body = req.body as Buffer;
      if (!Buffer.isBuffer(body) || !body.length) {
        return void res.status(400).json({ error: "The file is empty" });
      }
      const hostId = await gate(ctx, req, res, "administer");
      if (!hostId) return;
      try {
        await ctx.ssh.withConnection<void, Client>(
          hostId,
          { pool: "routeros-files", purpose: "mikrotik", profile: "stream" },
          async (client) => {
            const s = await sftp(client);
            try {
              await new Promise<void>((resolve, reject) =>
                s.writeFile(`/${name}`, body, (err) =>
                  err ? reject(err) : resolve(),
                ),
              );
            } finally {
              s.end();
            }
          },
        );
        await record(
          ctx,
          req,
          hostId,
          "routeros_file_upload",
          `${name} (${body.length} bytes)`,
        );
        res.status(201).json({ success: true });
      } catch (err) {
        await record(ctx, req, hostId, "routeros_file_upload", name, err);
        sshFailure(ctx, res, err, `RouterOS file upload on host ${hostId}`);
      }
    },
  );

  router.use("/hosts/:hostId", hosts);
}
