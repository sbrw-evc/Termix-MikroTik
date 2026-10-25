import { describe, expect, it } from "vitest";
import { permissionFor, redactRows } from "../../src/backend/ros/policy.js";
import { checkCommand } from "../../src/backend/ros/command.js";
import {
  parseRestReply,
  restBody,
  restPath,
} from "../../src/backend/ros/rest.js";

const perm = (
  path: string,
  command: string,
  attrs?: Record<string, string>,
) => {
  const answer = permissionFor({
    path: path ? path.split("/") : [],
    command,
    attrs,
  });
  return "error" in answer ? `error: ${answer.error}` : answer.permission;
};

describe("permissionFor", () => {
  it("lets anyone with view print, but never keep printing", () => {
    expect(perm("ip/address", "print")).toBe("view");
    expect(perm("log", "print", { follow: "" })).toMatch(/^error/);
    expect(perm("interface", "print", { interval: "1" })).toMatch(/^error/);
  });

  it("sorts changes by what they touch", () => {
    expect(perm("ip/firewall/filter", "add", { chain: "input" })).toBe(
      "configure",
    );
    expect(perm("interface", "disable", { ".id": "*1" })).toBe("operate");
    expect(perm("ppp/active", "remove", { ".id": "*1" })).toBe("operate");
    expect(perm("user", "add", { name: "x" })).toBe("administer");
    expect(perm("system/scheduler", "add", {})).toBe("administer");
    expect(
      perm("tool/netwatch", "add", { "up-script": "/system reboot" }),
    ).toBe("administer");
    expect(perm("system", "reboot")).toBe("administer");
    expect(perm("", "export")).toBe("administer");
    expect(perm("ip/address", "frobnicate")).toBe("administer");
  });

  it("needs a bound on tools that would run forever", () => {
    expect(perm("", "ping", { address: "1.1.1.1", count: "4" })).toBe(
      "operate",
    );
    expect(perm("", "ping", { address: "1.1.1.1" })).toMatch(/^error/);
    expect(perm("", "ping", { address: "1.1.1.1", count: "1000" })).toMatch(
      /^error/,
    );
    expect(perm("tool", "torch", { interface: "ether1", duration: "3s" })).toBe(
      "operate",
    );
    expect(perm("tool", "torch", { interface: "ether1" })).toMatch(/^error/);
    expect(
      perm("interface", "monitor-traffic", { interface: "ether1" }),
    ).toMatch(/^error/);
    expect(
      perm("interface", "monitor-traffic", { interface: "ether1", once: "" }),
    ).toBe("view");
  });
});

describe("redactRows", () => {
  it("blanks secrets and says which", () => {
    expect(
      redactRows([
        { name: "wg1", "private-key": "abc", "public-key": "def" },
        { name: "p", password: "" },
      ]),
    ).toEqual([
      {
        name: "wg1",
        "private-key": "",
        "public-key": "def",
        ".hidden": "private-key",
      },
      { name: "p", password: "" },
    ]);
  });
});

describe("checkCommand", () => {
  it("refuses names that could leave the menu", () => {
    expect(() =>
      checkCommand({ path: ["ip", "../x"], command: "print" }),
    ).toThrow();
    expect(() =>
      checkCommand({ path: ["ip"], command: "print", attrs: { "a b": "" } }),
    ).toThrow();
    expect(() =>
      checkCommand({ path: ["ip", "address"], command: "print" }),
    ).not.toThrow();
  });
});

describe("REST", () => {
  it("posts every command with its arguments as JSON", () => {
    const command = {
      path: ["ip", "address"],
      command: "print",
      proplist: ["address"],
      query: { interface: "ether1" },
    };
    expect(restPath(command)).toBe("/rest/ip/address/print");
    expect(JSON.parse(restBody(command))).toEqual({
      ".proplist": ["address"],
      ".query": ["interface=ether1"],
    });
  });

  it("reads rows, an add's id and errors", () => {
    expect(parseRestReply(200, '[{"name":"ether1","mtu":1500}]').rows).toEqual([
      { name: "ether1", mtu: "1500" },
    ]);
    expect(parseRestReply(201, '{"ret":"*5"}').ret).toBe("*5");
    expect(() =>
      parseRestReply(
        400,
        '{"error":400,"message":"Bad Request","detail":"failure: already have such address"}',
      ),
    ).toThrow(/already have such address/);
    expect(() => parseRestReply(401, "")).toThrow(/refused/);
  });
});
