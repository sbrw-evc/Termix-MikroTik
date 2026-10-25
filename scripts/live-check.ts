/**
 * Checks the RouterOS clients against a real router, without Termix.
 * Reads .env.local (see .env.local.example) and prints what it found; it
 * only reads, it never changes the router.
 *
 *   npm run live
 */

import net from "node:net";
import tls from "node:tls";
import { Client } from "ssh2";
import type { Duplex } from "node:stream";
import { ApiSession, createApiClient } from "../src/backend/ros/api.js";
import type { RosClient } from "../src/backend/ros/command.js";
import {
  createRestClient,
  tunnelRequester,
  type RestRequester,
} from "../src/backend/ros/rest.js";
import { sshForwardOpener } from "../src/backend/ros/connection.js";

const env = (name: string, fallback = "") => process.env[name] ?? fallback;
const host = env("ROS_HOST");
const username = env("ROS_USER");
const password = env("ROS_PASSWORD");
const modes = env("ROS_MODES", "api,rest")
  .split(",")
  .map((m) => m.trim());

if (!host || !username) {
  console.error("Set ROS_HOST, ROS_USER and ROS_PASSWORD in .env.local");
  process.exit(2);
}

function connectTcp(port: number, useTls: boolean): Promise<Duplex> {
  return new Promise((resolve, reject) => {
    const socket = useTls
      ? tls.connect({ host, port, rejectUnauthorized: false })
      : net.connect({ host, port });
    socket.once(useTls ? "secureConnect" : "connect", () => resolve(socket));
    socket.once("error", reject);
  });
}

/** Plain fetch for the check script; the plugin uses ctx.fetch. */
function directRequester(origin: string): RestRequester {
  return async (path, body, headers, timeoutMs) => {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    const res = await fetch(`${origin}${path}`, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { status: res.status, text: await res.text() };
  };
}

function ssh(): Promise<Client> {
  return new Promise((resolve, reject) => {
    const client = new Client();
    client
      .on("ready", () => resolve(client))
      .on("error", reject)
      .connect({
        host,
        port: Number(env("ROS_SSH_PORT", "22")),
        username: env("ROS_SSH_USER", username),
        password: env("ROS_SSH_PASSWORD", password),
        readyTimeout: 15000,
      });
  });
}

async function report(label: string, client: RosClient) {
  const started = Date.now();
  const resource = await client.run({
    path: ["system", "resource"],
    command: "print",
  });
  const identity = await client.run({
    path: ["system", "identity"],
    command: "print",
  });
  const interfaces = await client.run({
    path: ["interface"],
    command: "print",
    proplist: ["name", "type", "running", "disabled"],
  });
  const ethers = await client.run({
    path: ["interface"],
    command: "print",
    query: { type: "ether" },
    proplist: ["name"],
  });
  const traffic = interfaces.rows[0]
    ? await client.run({
        path: ["interface"],
        command: "monitor-traffic",
        attrs: { interface: interfaces.rows[0].name, once: "" },
      })
    : null;
  let missing = "";
  try {
    await client.run({ path: ["no", "such", "menu"], command: "print" });
  } catch (err) {
    missing = (err as Error).message;
  }
  const r = resource.rows[0] ?? {};
  console.log(`\n[${label}] ok in ${Date.now() - started} ms`);
  console.log(
    `  ${identity.rows[0]?.name}: RouterOS ${r.version} on ${r["board-name"]} (${r["architecture-name"]}), uptime ${r.uptime}, cpu ${r["cpu-load"]}%`,
  );
  console.log(
    `  interfaces: ${interfaces.rows.map((i) => `${i.name}(${i.type})`).join(", ")}`,
  );
  console.log(`  ether filter: ${ethers.rows.map((i) => i.name).join(", ")}`);
  if (traffic) {
    const t = traffic.rows[0] ?? {};
    console.log(
      `  ${t.name}: rx ${t["rx-bits-per-second"]} bps, tx ${t["tx-bits-per-second"]} bps`,
    );
  }
  console.log(`  missing menu: ${missing}`);

  // What the other transports need: services, SSH forwarding, user policies.
  const services = await client.run({
    path: ["ip", "service"],
    command: "print",
    proplist: ["name", "port", "disabled", "address", "certificate"],
  });
  console.log(
    `  services: ${services.rows
      .map(
        (s) =>
          `${s.name}:${s.port}${s.disabled === "true" ? "(off)" : ""}${s.certificate && s.certificate !== "none" ? `[cert ${s.certificate}]` : ""}${s.address ? `[from ${s.address}]` : ""}`,
      )
      .join(", ")}`,
  );
  const sshSettings = await client
    .run({ path: ["ip", "ssh"], command: "print" })
    .catch(() => null);
  const s = sshSettings?.rows[0] ?? {};
  console.log(
    `  ssh: forwarding-enabled=${s["forwarding-enabled"]} always-allow-password-login=${s["always-allow-password-login"]} strong-crypto=${s["strong-crypto"]}`,
  );
  const users = await client.run({
    path: ["user"],
    command: "print",
    query: { name: username },
    proplist: ["name", "group", "address"],
  });
  const group = users.rows[0]?.group;
  if (group) {
    const groups = await client.run({
      path: ["user", "group"],
      command: "print",
      query: { name: group },
      proplist: ["name", "policy"],
    });
    console.log(
      `  user ${username}: group ${group}${users.rows[0].address ? `, from ${users.rows[0].address}` : ""}, policy ${groups.rows[0]?.policy}`,
    );
  }
}

async function main() {
  let failed = 0;
  const attempt = async (label: string, open: () => Promise<RosClient>) => {
    try {
      const client = await open();
      try {
        await report(label, client);
      } finally {
        client.close();
      }
    } catch (err) {
      failed++;
      console.log(`\n[${label}] FAILED: ${(err as Error).message}`);
    }
  };
  const login = async (stream: Duplex, label: "api" | "api-tunnel") => {
    const session = new ApiSession(stream);
    await session.login(username, password);
    return createApiClient(session, label);
  };

  if (modes.includes("api")) {
    const port = Number(env("ROS_API_PORT", "8728"));
    await attempt(`api ${port}`, async () =>
      login(await connectTcp(port, env("ROS_API_TLS") === "1"), "api"),
    );
  }
  if (modes.includes("rest")) {
    const scheme = env("ROS_REST_SCHEME", "https");
    const port = env("ROS_REST_PORT", scheme === "https" ? "443" : "80");
    await attempt(`rest ${scheme}:${port}`, async () =>
      createRestClient(
        directRequester(`${scheme}://${host}:${port}`),
        { username, password },
        "rest",
      ),
    );
  }
  if (modes.includes("api-tunnel") || modes.includes("rest-tunnel")) {
    let client: Client | null = null;
    try {
      client = await ssh();
    } catch (err) {
      failed++;
      console.log(`\n[ssh] FAILED: ${(err as Error).message}`);
    }
    if (client) {
      if (modes.includes("api-tunnel")) {
        await attempt("api-tunnel", async () =>
          login(await sshForwardOpener(client!, 8728)(), "api-tunnel"),
        );
      }
      if (modes.includes("rest-tunnel")) {
        await attempt("rest-tunnel", async () =>
          createRestClient(
            tunnelRequester(sshForwardOpener(client!, 80), false),
            { username, password },
            "rest-tunnel",
          ),
        );
      }
      client.end();
    }
  }
  process.exit(failed ? 1 : 0);
}

void main();
