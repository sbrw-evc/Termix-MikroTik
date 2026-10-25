import { describe, expect, it } from "vitest";
import { exportCommand } from "../../src/backend/ssh-routes.js";
import { parseMndp } from "../../src/backend/mndp.js";
import {
  SETTINGS,
  parseHostConfig,
  resolveTransport,
  apiPortOf,
  restPortOf,
} from "../../src/backend/ros/connection.js";

describe("parseHostConfig", () => {
  it("reads the host settings with defaults", () => {
    const config = parseHostConfig({});
    expect(config).toMatchObject({
      transport: "auto",
      username: null,
      restScheme: "https",
      apiTls: false,
    });
    expect(resolveTransport(config)).toBe("api-tunnel");
    expect(apiPortOf(config)).toBe(8728);
    expect(restPortOf(config)).toBe(443);
    expect(apiPortOf({ ...config, apiTls: true })).toBe(8729);
    expect(restPortOf({ ...config, restScheme: "http" })).toBe(80);
  });

  it("keeps an explicit choice and drops what it can't use", () => {
    const config = parseHostConfig({
      [SETTINGS.transport]: "rest",
      [SETTINGS.restPort]: 70000,
      [SETTINGS.username]: "  termix ",
    });
    expect(resolveTransport(config)).toBe("rest");
    expect(config.restPort).toBe(0);
    expect(config.username).toBe("termix");
    expect(parseHostConfig({ [SETTINGS.transport]: "telnet" }).transport).toBe(
      "auto",
    );
  });
});

describe("exportCommand", () => {
  it("asks each version for secrets its own way", () => {
    expect(exportCommand({ sensitive: false, major: 7 })).toBe("/export terse");
    expect(exportCommand({ sensitive: true, major: 7 })).toBe(
      "/export terse show-sensitive",
    );
    expect(exportCommand({ sensitive: false, major: 6 })).toBe(
      "/export terse hide-sensitive",
    );
    expect(exportCommand({ sensitive: true, major: 6 })).toBe("/export terse");
  });
});

describe("parseMndp", () => {
  it("reads identity, MAC, version, board and address", () => {
    const tlv = (type: number, value: Buffer) => {
      const head = Buffer.alloc(4);
      head.writeUInt16BE(type, 0);
      head.writeUInt16BE(value.length, 2);
      return Buffer.concat([head, value]);
    };
    const uptime = Buffer.alloc(4);
    uptime.writeUInt32LE(3600, 0);
    const packet = Buffer.concat([
      Buffer.alloc(4),
      tlv(1, Buffer.from([0x48, 0xa9, 0x8a, 0x01, 0x02, 0x03])),
      tlv(5, Buffer.from("gw")),
      tlv(7, Buffer.from("7.16.1 (stable)")),
      tlv(8, Buffer.from("MikroTik")),
      tlv(10, uptime),
      tlv(12, Buffer.from("hAP ax3")),
      tlv(16, Buffer.from("bridge")),
      tlv(17, Buffer.from([192, 168, 88, 1])),
    ]);
    expect(parseMndp(packet, "192.168.88.1")).toMatchObject({
      mac: "48:A9:8A:01:02:03",
      identity: "gw",
      version: "7.16.1 (stable)",
      platform: "MikroTik",
      uptime: 3600,
      board: "hAP ax3",
      interfaceName: "bridge",
      ipv4: "192.168.88.1",
    });
  });

  it("ignores what is not MNDP", () => {
    expect(parseMndp(Buffer.alloc(4), "1.2.3.4")).toBeNull();
  });
});
