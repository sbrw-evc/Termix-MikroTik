import { afterEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { createMockCtx } from "@termix-ssh/plugin-sdk/testing";
import type { PluginHostSummary } from "@termix-ssh/plugin-sdk/backend";
import { activate } from "../../src/backend/index.js";
import manifest from "../../manifest.json";
import { fakeSsh, routerAnswers } from "./fake-router.js";

const host = {
  id: 1,
  name: "gw",
  ip: "192.168.88.1",
  port: 22,
  username: "admin",
  password: "secret",
  userId: "user-1",
} as unknown as PluginHostSummary;

let server: Server | null = null;

afterEach(() => {
  server?.close();
  server = null;
});

async function start(options: { permissions: string[]; enabled?: boolean }) {
  const log: string[][] = [];
  const ssh = fakeSsh(routerAnswers(log));
  const router = express.Router();
  const mock = createMockCtx({
    pluginId: manifest.id,
    actor: "user-1",
    permissions: options.permissions,
    hosts: [host],
    sshHosts: [host as never],
    sshClient: ssh.client,
    router: () => router,
    capabilities: manifest.capabilities,
  });
  const ctx = mock.ctx;
  if (options.enabled !== false) {
    await ctx.settings.setHost(1, "enableRouterOs", true);
  }
  await activate(ctx);
  const app = express();
  app.use(express.json());
  app.use(router);
  server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const post = (path: string, body: unknown) =>
    fetch(`http://127.0.0.1:${port}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  return {
    log,
    ssh,
    call: (body: unknown) => post("/hosts/1/call", body),
    batch: (calls: unknown[]) => post("/hosts/1/batch", { calls }),
    post,
    get: (path: string) => fetch(`http://127.0.0.1:${port}${path}`),
  };
}

const view = ["mikrotik.view"];

describe("POST /hosts/:hostId/call", () => {
  it("prints through the API over the SSH tunnel with view", async () => {
    const { call, log, ssh } = await start({ permissions: view });
    const res = await call({ path: ["ip", "address"], command: "print" });
    expect(res.status).toBe(200);
    expect((await res.json()).rows).toEqual([
      { ".id": "*1", address: "192.168.88.1/24", interface: "bridge" },
    ]);
    expect(ssh.forwards).toEqual([{ host: "127.0.0.1", port: 8728 }]);
    expect(log[0]).toEqual(
      expect.arrayContaining(["/login", "=name=admin", "=password=secret"]),
    );
  });

  it("refuses everything without view", async () => {
    const { call } = await start({ permissions: [] });
    expect(
      (await call({ path: ["ip", "address"], command: "print" })).status,
    ).toBe(403);
  });

  it("needs configure to add", async () => {
    const viewer = await start({ permissions: view });
    const res = await viewer.call({
      path: ["ip", "address"],
      command: "add",
      attrs: { address: "10.0.0.1/24", interface: "ether2" },
    });
    expect(res.status).toBe(403);
    expect((await res.json()).permission).toBe("configure");
    server?.close();

    const editor = await start({
      permissions: [...view, "mikrotik.configure"],
    });
    const ok = await editor.call({
      path: ["ip", "address"],
      command: "add",
      attrs: { address: "10.0.0.1/24", interface: "ether2" },
    });
    expect(ok.status).toBe(200);
    expect((await ok.json()).ret).toBe("*2");
  });

  it("blanks secrets unless the caller may administer", async () => {
    const viewer = await start({ permissions: view });
    const rows = (
      await (
        await viewer.call({
          path: ["interface", "wireguard"],
          command: "print",
        })
      ).json()
    ).rows;
    expect(rows[0]["private-key"]).toBe("");
    expect(rows[0][".hidden"]).toBe("private-key");
    server?.close();

    const admin = await start({
      permissions: [...view, "mikrotik.administer"],
    });
    const all = (
      await (
        await admin.call({ path: ["interface", "wireguard"], command: "print" })
      ).json()
    ).rows;
    expect(all[0]["private-key"]).toBe("PRIVATE");
  });

  it("refuses a print that would never end", async () => {
    const { call } = await start({ permissions: view });
    const res = await call({
      path: ["log"],
      command: "print",
      attrs: { follow: "" },
    });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("ROS_COMMAND_NOT_ALLOWED");
  });

  it("refuses names that are not RouterOS menus", async () => {
    const { call } = await start({ permissions: view });
    expect(
      (await call({ path: ["ip", "../etc"], command: "print" })).status,
    ).toBe(400);
  });

  it("answers 409 for a host without MikroTik on", async () => {
    const { call } = await start({ permissions: view, enabled: false });
    expect(
      (await call({ path: ["ip", "address"], command: "print" })).status,
    ).toBe(409);
  });

  it("passes RouterOS's own refusal on as a 404", async () => {
    const { call } = await start({
      permissions: [...view, "mikrotik.administer"],
    });
    const res = await call({ path: ["ip", "address"], command: "frobnicate" });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/no such command/);
  });
});

describe("API sessions", () => {
  it("log in once and serve the next calls on the same session", async () => {
    const { call, log, ssh } = await start({ permissions: view });
    for (let i = 0; i < 3; i++) {
      expect(
        (await call({ path: ["ip", "address"], command: "print" })).status,
      ).toBe(200);
    }
    expect(log.filter((w) => w[0] === "/login")).toHaveLength(1);
    expect(ssh.forwards).toHaveLength(1);
  });
});

describe("POST /hosts/:hostId/batch", () => {
  it("runs several commands over one login, each answering on its own", async () => {
    const { batch, log } = await start({
      permissions: [...view, "mikrotik.administer"],
    });
    const res = await batch([
      { path: ["system", "resource"], command: "print" },
      { path: ["ip", "address"], command: "frobnicate" },
      { path: ["system", "identity"], command: "print" },
    ]);
    expect(res.status).toBe(200);
    const { results } = await res.json();
    expect(results[0].rows[0].version).toBe("7.16.1 (stable)");
    expect(results[1].error).toMatch(/no such command/);
    expect(results[2].rows[0].name).toBe("gw");
    expect(log.filter((w) => w[0] === "/login")).toHaveLength(1);
  });

  it("needs the highest permission any command needs", async () => {
    const { batch } = await start({ permissions: view });
    const res = await batch([
      { path: ["system", "resource"], command: "print" },
      { path: ["system"], command: "reboot" },
    ]);
    expect(res.status).toBe(403);
    expect((await res.json()).permission).toBe("administer");
  });
});

describe("GET /hosts/:hostId/connection", () => {
  it("reads what the router is", async () => {
    const { get } = await start({ permissions: view });
    const res = await get("/hosts/1/connection");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      transport: "api-tunnel",
      identity: "gw",
      resource: { "board-name": "hAP ax3" },
    });
  });
});

describe("SSH routes", () => {
  it("refuse the CLI, exports and files without administer", async () => {
    const { post, get } = await start({
      permissions: [...view, "mikrotik.configure"],
    });
    expect(
      (await post("/hosts/1/exec", { command: "/ip address print" })).status,
    ).toBe(403);
    expect((await get("/hosts/1/export")).status).toBe(403);
    expect((await get("/hosts/1/files/download?name=a.backup")).status).toBe(
      403,
    );
  });

  it("refuse file names that leave the router's files", async () => {
    const { get } = await start({
      permissions: [...view, "mikrotik.administer"],
    });
    expect(
      (await get("/hosts/1/files/download?name=../etc/passwd")).status,
    ).toBe(400);
  });
});

describe("POST /discovery/add", () => {
  it("needs configure", async () => {
    const { post } = await start({ permissions: view });
    expect((await post("/discovery/add", { ip: "192.168.88.2" })).status).toBe(
      403,
    );
  });
});
