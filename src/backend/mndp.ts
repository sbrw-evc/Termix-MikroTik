import dgram from "node:dgram";
import type { Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { SETTINGS } from "./ros/connection.js";

/*
 * MikroTik Neighbor Discovery: routers announce themselves on UDP 5678 every
 * minute, and answer a four-byte request at once. This is how WinBox lists
 * routers before you connect. It only finds routers in the Termix server's
 * own broadcast domain.
 */

export const MNDP_PORT = 5678;

export interface MndpDevice {
  mac: string;
  identity: string;
  version: string;
  platform: string;
  board: string;
  uptime: number | null;
  softwareId: string;
  interfaceName: string;
  ipv4: string;
  ipv6: string;
  /** Where the packet came from, when it carried no address. */
  from: string;
}

/** Reads one MNDP packet: a 4-byte header, then type, length, value records. */
export function parseMndp(packet: Buffer, from: string): MndpDevice | null {
  if (packet.length < 8) return null;
  const device: MndpDevice = {
    mac: "",
    identity: "",
    version: "",
    platform: "",
    board: "",
    uptime: null,
    softwareId: "",
    interfaceName: "",
    ipv4: "",
    ipv6: "",
    from,
  };
  let offset = 4;
  while (offset + 4 <= packet.length) {
    const type = packet.readUInt16BE(offset);
    const length = packet.readUInt16BE(offset + 2);
    const value = packet.subarray(offset + 4, offset + 4 + length);
    offset += 4 + length;
    if (value.length < length) break;
    const text = () => value.toString("utf8").replace(/\0+$/, "");
    switch (type) {
      case 1:
        device.mac = [...value]
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(":")
          .toUpperCase();
        break;
      case 5:
        device.identity = text();
        break;
      case 7:
        device.version = text();
        break;
      case 8:
        device.platform = text();
        break;
      case 10:
        device.uptime = length >= 4 ? value.readUInt32LE(0) : null;
        break;
      case 11:
        device.softwareId = text();
        break;
      case 12:
        device.board = text();
        break;
      case 15:
        if (length === 16) {
          device.ipv6 = [...Array(8).keys()]
            .map((i) => value.readUInt16BE(i * 2).toString(16))
            .join(":")
            .replace(/(^|:)0(:0)+(:|$)/, "::");
        }
        break;
      case 16:
        device.interfaceName = text();
        break;
      case 17:
        if (length === 4) device.ipv4 = [...value].join(".");
        break;
      default:
        break;
    }
  }
  return device.mac || device.identity ? device : null;
}

/** Listens for a few seconds after asking, and returns who answered. */
export function scan(seconds: number): Promise<MndpDevice[]> {
  return new Promise((resolve, reject) => {
    const found = new Map<string, MndpDevice>();
    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    let done = false;
    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      try {
        socket.close();
      } catch {
        // Already closed.
      }
      if (err) reject(err);
      else resolve([...found.values()]);
    };
    socket.on("message", (msg, rinfo) => {
      const device = parseMndp(msg, rinfo.address);
      if (device)
        found.set(device.mac || `${rinfo.address}|${device.identity}`, device);
    });
    socket.on("error", (err) => finish(err));
    socket.bind(MNDP_PORT, () => {
      try {
        socket.setBroadcast(true);
        // An empty request makes every router that hears it answer now.
        socket.send(Buffer.alloc(4), MNDP_PORT, "255.255.255.255");
      } catch (err) {
        finish(err as Error);
        return;
      }
      setTimeout(() => finish(), seconds * 1000);
    });
  });
}

export function registerDiscovery(ctx: PluginContext, router: Router): void {
  /**
   * @openapi
   * /plugin-api/mikrotik/discovery:
   *   post:
   *     summary: Find MikroTik routers on the network
   *     description: Asks with MNDP on UDP 5678 and listens for up to 30 seconds. Finds routers in the Termix server's own broadcast domain only.
   *     tags: [MikroTik]
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               seconds: { type: integer, minimum: 1, maximum: 30 }
   *     responses:
   *       200: { description: The routers that answered, with which hosts already have them. }
   *       403: { description: Missing the mikrotik.view permission. }
   *       502: { description: The server could not listen on UDP 5678. }
   */
  router.post("/discovery", async (req, res) => {
    const seconds = Math.min(
      30,
      Math.max(1, Number((req.body as { seconds?: unknown })?.seconds) || 5),
    );
    try {
      const devices = await scan(seconds);
      // Mark the ones that already are hosts the caller can see.
      const hosts = await ctx.hosts.list();
      const known = new Map(hosts.map((h) => [String(h.ip), h.id]));
      res.json({
        devices: devices.map((d) => ({
          ...d,
          hostId: known.get(d.ipv4) ?? known.get(d.from) ?? null,
        })),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.log.warn(`MNDP scan failed: ${message}`);
      res.status(502).json({
        error: `Could not listen for routers on UDP ${MNDP_PORT}: ${message}`,
        code: "ROS_DISCOVERY_FAILED",
      });
    }
  });

  /**
   * @openapi
   * /plugin-api/mikrotik/discovery/add:
   *   post:
   *     summary: Add a found router as a Termix host
   *     description: Makes an SSH host for the router, with MikroTik turned on, in the MikroTik folder. Its login is added in the host editor.
   *     tags: [MikroTik]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [ip]
   *             properties:
   *               ip: { type: string }
   *               name: { type: string }
   *               username: { type: string }
   *     responses:
   *       201: { description: The new host. }
   *       400: { description: Invalid address. }
   *       403: { description: Missing the mikrotik.configure permission. }
   */
  router.post(
    "/discovery/add",
    ctx.rbac.require("configure") as never,
    async (req, res) => {
      const body = (req.body ?? {}) as {
        ip?: unknown;
        name?: unknown;
        username?: unknown;
      };
      const ip = typeof body.ip === "string" ? body.ip.trim() : "";
      if (
        !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip) ||
        ip.split(".").some((p) => Number(p) > 255)
      ) {
        return void res.status(400).json({ error: "Invalid address" });
      }
      const name =
        typeof body.name === "string" && body.name.trim()
          ? body.name.trim().slice(0, 120)
          : ip;
      const username =
        typeof body.username === "string" &&
        /^[A-Za-z0-9._@-]{1,64}$/.test(body.username)
          ? body.username
          : "admin";
      const host = await ctx.hosts.create({
        name,
        ip,
        port: 22,
        username,
        authType: "password",
        folder: "MikroTik",
        tags: ["mikrotik"],
        enableSsh: true,
        pluginEnable: { [ctx.pluginId]: true },
        pluginSettings: { [ctx.pluginId]: { [SETTINGS.transport]: "auto" } },
      });
      await ctx.audit
        .record({
          action: "routeros_host_added",
          resourceType: "host",
          resourceId: String(host.id),
          details: `${name} (${ip})`,
          success: true,
          request: req,
        })
        .catch(() => {});
      res.status(201).json({ id: host.id, name: host.name });
    },
  );
}
