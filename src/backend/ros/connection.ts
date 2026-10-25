import crypto from "node:crypto";
import net from "node:net";
import tls from "node:tls";
import type { Duplex } from "node:stream";
import type { Client } from "ssh2";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { ApiSession, createApiClient } from "./api.js";
import type { RosClient, RosTransport } from "./command.js";
import { RosError } from "./errors.js";
import {
  createRestClient,
  fetchRequester,
  tunnelRequester,
  type StreamOpener,
} from "./rest.js";

export type RosTransportSetting = "auto" | RosTransport;

/** Host setting keys, declared in manifest.json under contributes.settings.host. */
export const SETTINGS = {
  enabled: "enableRouterOs",
  transport: "rosTransport",
  username: "rosUsername",
  password: "rosPassword",
  address: "rosAddress",
  restScheme: "rosRestScheme",
  restPort: "rosRestPort",
  apiTls: "rosApiTls",
  apiPort: "rosApiPort",
  caCert: "rosCaCert",
} as const;

export interface RosHostConfig {
  transport: RosTransportSetting;
  username: string | null;
  /** Direct only: the router's address, the host's own when empty. */
  address: string | null;
  restScheme: "https" | "http";
  /** 0 picks the service's usual port. */
  restPort: number;
  apiTls: boolean;
  apiPort: number;
  caCert: string | null;
}

const TRANSPORTS: RosTransportSetting[] = [
  "auto",
  "api-tunnel",
  "rest-tunnel",
  "rest",
  "api",
];

const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;
const port = (value: unknown) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : 0;
};

export function parseHostConfig(raw: Record<string, unknown>): RosHostConfig {
  const transport = raw[SETTINGS.transport] as RosTransportSetting;
  return {
    transport: TRANSPORTS.includes(transport) ? transport : "auto",
    username: text(raw[SETTINGS.username]),
    address: text(raw[SETTINGS.address]),
    restScheme: raw[SETTINGS.restScheme] === "http" ? "http" : "https",
    restPort: port(raw[SETTINGS.restPort]),
    apiTls: raw[SETTINGS.apiTls] === true,
    apiPort: port(raw[SETTINGS.apiPort]),
    caCert: text(raw[SETTINGS.caCert]),
  };
}

/**
 * Automatic is the API through the host's SSH connection: it works on v6 and
 * v7, needs no certificate and no API port open to the network.
 */
export function resolveTransport(config: RosHostConfig): RosTransport {
  return config.transport === "auto" ? "api-tunnel" : config.transport;
}

export function apiPortOf(config: RosHostConfig): number {
  return config.apiPort || (config.apiTls ? 8729 : 8728);
}

export function restPortOf(config: RosHostConfig): number {
  return config.restPort || (config.restScheme === "https" ? 443 : 80);
}

const SETTING_KEYS = Object.values(SETTINGS).filter(
  (key) => key !== SETTINGS.password && key !== SETTINGS.enabled,
);

export async function readHostConfig(
  ctx: PluginContext,
  hostId: number,
): Promise<RosHostConfig> {
  const values = await Promise.all(
    SETTING_KEYS.map((key) => ctx.settings.getHost(hostId, key)),
  );
  return parseHostConfig(
    Object.fromEntries(SETTING_KEYS.map((key, i) => [key, values[i]])),
  );
}

/**
 * The RouterOS login: this plugin's own when saved, the host's SSH login
 * otherwise. Neither ever leaves the server.
 */
async function readCredentials(
  ctx: PluginContext,
  hostId: number,
  config: RosHostConfig,
): Promise<{ username: string; password: string }> {
  const saved = await ctx.settings.getHost<unknown>(hostId, SETTINGS.password);
  const resolved = await ctx.ssh.resolveHost(hostId).catch(() => null);
  const username = config.username ?? resolved?.username ?? "";
  const password =
    typeof saved === "string" && saved
      ? saved
      : typeof resolved?.password === "string"
        ? resolved.password
        : "";
  if (!username) {
    throw new RosError(
      "This host has no RouterOS username. Set one in the host's MikroTik settings.",
      "ROS_NO_CREDENTIALS",
      400,
    );
  }
  return { username, password };
}

/** A stream to 127.0.0.1:<port> on the router, through its own SSH server. */
export function sshForwardOpener(client: Client, port: number): StreamOpener {
  return () =>
    new Promise((resolve, reject) => {
      client.forwardOut("127.0.0.1", 0, "127.0.0.1", port, (err, stream) => {
        if (!err) return resolve(stream);
        if (/prohibited|forwarding|denied/i.test(err.message)) {
          reject(
            new RosError(
              `The router does not allow SSH port forwarding (${err.message}). Run /ip ssh set forwarding-enabled=local (RouterOS v7) or forwarding-enabled=yes (v6) on it, or pick another way to connect.`,
              "ROS_FORWARDING_DISABLED",
              502,
            ),
          );
        } else {
          reject(
            new RosError(
              `Could not reach port ${port} on the router: ${err.message}`,
              "ROS_UNREACHABLE",
            ),
          );
        }
      });
    });
}

function tlsOver(stream: Duplex, verify: boolean, ca?: string | null): Duplex {
  return tls.connect({
    socket: stream,
    rejectUnauthorized: verify,
    ...(ca ? { ca } : {}),
  });
}

/** Opens a TCP connection straight to the API port. */
function connectDirect(
  host: string,
  apiPort: number,
  useTls: boolean,
  caCert: string | null,
): Promise<Duplex> {
  return new Promise((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) =>
      reject(
        new RosError(
          `Could not reach the RouterOS API at ${host}:${apiPort}: ${err.message}`,
          err.code === "ETIMEDOUT" ? "ROS_TIMEOUT" : "ROS_UNREACHABLE",
        ),
      );
    if (useTls) {
      const socket = tls.connect({
        host,
        port: apiPort,
        ca: caCert ?? undefined,
        servername: net.isIP(host) ? undefined : host,
        timeout: 10000,
      });
      socket.once("secureConnect", () => resolve(socket));
      socket.once("error", onError);
    } else {
      const socket = net.connect({ host, port: apiPort, timeout: 10000 });
      socket.once("connect", () => {
        socket.setTimeout(0);
        resolve(socket);
      });
      socket.once("timeout", () =>
        socket.destroy(
          Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }),
        ),
      );
      socket.once("error", onError);
    }
  });
}

async function login(
  stream: Duplex,
  credentials: { username: string; password: string },
): Promise<ApiSession> {
  const session = new ApiSession(stream);
  try {
    await session.login(credentials.username, credentials.password);
  } catch (err) {
    session.close();
    throw err;
  }
  return session;
}

const IDLE_MS = 60000;

/**
 * Logged in API sessions, kept for a minute after their last use. Without
 * this every call is a login, and RouterOS logs each one: "user admin logged
 * in via api" fills the router's log in minutes. Commands are tagged, so
 * calls from several tabs share a session.
 */
export class ApiSessionPool {
  private sessions = new Map<
    string,
    {
      session: Promise<ApiSession>;
      timer: ReturnType<typeof setTimeout> | null;
    }
  >();

  async get(key: string, open: () => Promise<ApiSession>): Promise<ApiSession> {
    const entry = this.sessions.get(key);
    if (entry) {
      const session = await entry.session.catch(() => null);
      if (session && !session.isClosed) {
        this.touch(key);
        return session;
      }
      this.drop(key);
    }
    const session = open();
    this.sessions.set(key, { session, timer: null });
    try {
      const ready = await session;
      this.touch(key);
      return ready;
    } catch (err) {
      this.sessions.delete(key);
      throw err;
    }
  }

  private touch(key: string) {
    const entry = this.sessions.get(key);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => this.drop(key), IDLE_MS);
    entry.timer.unref?.();
  }

  drop(key: string) {
    const entry = this.sessions.get(key);
    if (!entry) return;
    this.sessions.delete(key);
    if (entry.timer) clearTimeout(entry.timer);
    void entry.session.then((s) => s.close()).catch(() => {});
  }

  closeAll() {
    for (const key of [...this.sessions.keys()]) this.drop(key);
  }
}

const pools = new WeakMap<PluginContext, ApiSessionPool>();

/** Made in activate; its sessions close when the plugin is turned off. */
export function registerSessionPool(ctx: PluginContext): ApiSessionPool {
  const pool = new ApiSessionPool();
  pools.set(ctx, pool);
  ctx.disposables.add(() => pool.closeAll());
  return pool;
}

/** A client on a pooled session: closing it leaves the session open. */
function pooledClient(
  pool: ApiSessionPool,
  key: string,
  session: ApiSession,
  transport: RosTransport,
): RosClient {
  const client = createApiClient(session, transport);
  return {
    transport,
    async run(command) {
      try {
        return await client.run(command);
      } catch (err) {
        if (err instanceof RosError && err.code === "ROS_UNREACHABLE") {
          pool.drop(key);
        }
        throw err;
      }
    },
    close() {},
  };
}

/** Who and where a session is for; a changed password makes a new one. */
function sessionKey(
  parts: Array<string | number | boolean | undefined>,
  password: string,
) {
  const secret = crypto
    .createHash("sha256")
    .update(password)
    .digest("hex")
    .slice(0, 16);
  return [...parts, secret].join("|");
}

/**
 * Runs fn with a client for the router behind a Termix host, as the acting
 * user. The tunnels borrow a pooled SSH connection, so core checks access to
 * the host the way it does for a terminal.
 */
export async function withRosClient<T>(
  ctx: PluginContext,
  hostId: number,
  fn: (client: RosClient) => Promise<T>,
): Promise<T> {
  const host = await ctx.hosts.get(hostId);
  if (!host) throw new RosError("Host not found", "ROS_NOT_FOUND", 404);
  const config = await readHostConfig(ctx, hostId);
  const credentials = await readCredentials(ctx, hostId, config);
  const transport = resolveTransport(config);
  const address = config.address ?? String(host.ip);

  const use = async (client: RosClient) => {
    try {
      return await fn(client);
    } finally {
      client.close();
    }
  };

  if (transport === "rest") {
    return use(
      createRestClient(
        fetchRequester(ctx.fetch, {
          scheme: config.restScheme,
          host: address,
          port: restPortOf(config),
          caCert: config.caCert,
        }),
        credentials,
        transport,
      ),
    );
  }

  if (transport === "api") {
    if (config.apiTls && !config.caCert) {
      throw new RosError(
        "The API over TLS needs the router's CA in CA certificate, or connect through the SSH tunnel.",
        "ROS_TLS_NEEDS_CA",
        400,
      );
    }
    const open = async () =>
      login(
        await connectDirect(
          address,
          apiPortOf(config),
          config.apiTls,
          config.caCert,
        ),
        credentials,
      );
    const pool = pools.get(ctx);
    if (!pool) return use(createApiClient(await open(), transport));
    const key = sessionKey(
      [
        ctx.currentActor(),
        hostId,
        transport,
        address,
        apiPortOf(config),
        config.apiTls,
        credentials.username,
      ],
      credentials.password,
    );
    return use(pooledClient(pool, key, await pool.get(key, open), transport));
  }

  if (transport === "api-tunnel") {
    const pool = pools.get(ctx);
    const key = sessionKey(
      [
        ctx.currentActor(),
        hostId,
        transport,
        apiPortOf(config),
        config.apiTls,
        credentials.username,
      ],
      credentials.password,
    );
    // The SSH channel stays open with the session; if core closes the SSH
    // connection, the session ends and the next call opens both again.
    const open = () =>
      ctx.ssh.withConnection<ApiSession, Client>(
        hostId,
        { pool: "routeros", purpose: "mikrotik", profile: "forward" },
        async (ssh) => {
          const raw = await sshForwardOpener(ssh, apiPortOf(config))();
          // Inside the SSH channel the host key already proves the router.
          return login(config.apiTls ? tlsOver(raw, false) : raw, credentials);
        },
      );
    if (!pool) return use(createApiClient(await open(), transport));
    return use(pooledClient(pool, key, await pool.get(key, open), transport));
  }

  return ctx.ssh.withConnection<T, Client>(
    hostId,
    { pool: "routeros", purpose: "mikrotik", profile: "forward" },
    async (ssh) => {
      return use(
        createRestClient(
          tunnelRequester(
            sshForwardOpener(ssh, restPortOf(config)),
            config.restScheme === "https",
          ),
          credentials,
          transport,
        ),
      );
    },
  );
}
