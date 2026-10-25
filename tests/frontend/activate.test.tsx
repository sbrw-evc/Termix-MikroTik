import { afterEach, describe, expect, it } from "vitest";
import {
  renderWithApp,
  type RenderedPluginApp,
} from "@termix-ssh/plugin-sdk/testing";
import type { PluginManifest } from "@termix-ssh/plugin-sdk/manifest";
import * as plugin from "../../src/frontend/index";
import manifestJson from "../../manifest.json";
import locales from "../../locales/en.json";
import { MENU, findMenu } from "../../src/frontend/menus/catalog";
import { menuFor } from "../../src/frontend/routers";
import { laterOnRouter } from "../../src/frontend/panels/SafeMode";
import { clientConfig } from "../../src/frontend/panels/WireGuardPanel";
import {
  changedAttrs,
  initialValues,
  parseExtra,
} from "../../src/frontend/views/RecordDialog";
import { check, secret, text } from "../../src/frontend/menus/dsl";
import type { RouterInfo } from "../../src/frontend/api";

const manifest = manifestJson as unknown as PluginManifest;

let rendered: RenderedPluginApp | null = null;

afterEach(async () => {
  await rendered?.deactivate();
  rendered = null;
});

describe(`${manifest.id} activate`, () => {
  it("registers the tab, the tree panel, the rail items and the host action", async () => {
    rendered = await renderWithApp(plugin, { manifest, locales });
    expect(rendered.registered.tabs()).toEqual(["mikrotik"]);
    expect(rendered.registered.panels()).toEqual(["mikrotik-tree"]);
    expect(rendered.registered.railItems()).toEqual([
      expect.objectContaining({ id: "mikrotik", permission: "mikrotik.view" }),
      expect.objectContaining({ id: "mikrotik-tree", hidden: true }),
    ]);
    expect(rendered.registered.hostActions()).toEqual([
      expect.objectContaining({ id: "mikrotik-open", tabType: "mikrotik" }),
    ]);
  });
});

const router = (version: string, menus: string[] = []) => ({
  info: {
    resource: { version },
    packages: [],
    transport: "api-tunnel",
    identity: "gw",
    routerboard: null,
  } as RouterInfo,
  menus,
});

const ids = (nodes: typeof MENU): string[] =>
  nodes.flatMap((n) => [n.id, ...(n.children ? ids(n.children) : [])]);

describe("menuFor", () => {
  it("shows each version its own routing and only the menus a router has", () => {
    const v7 = ids(
      menuFor(
        MENU,
        router("7.16.1 (stable)", ["interface/wifi", "interface/wireguard"]),
      ),
    );
    expect(v7).toEqual(
      expect.arrayContaining(["bgp", "ospf", "wifi", "wireguard"]),
    );
    expect(v7).not.toEqual(expect.arrayContaining(["bgpV6"]));
    expect(v7).not.toContain("wireless");

    const v6 = ids(
      menuFor(MENU, router("6.49.10 (long-term)", ["interface/wireless"])),
    );
    expect(v6).toEqual(expect.arrayContaining(["bgpV6", "ospfV6", "wireless"]));
    expect(v6).not.toContain("wireguard");
    expect(v6).not.toContain("bgp");
  });

  it("finds a menu by id anywhere", () => {
    expect(findMenu("firewall")?.view?.kind).toBe("tabs");
    expect(findMenu("nope")).toBeNull();
  });
});

describe("RecordDialog values", () => {
  const fields = [
    text("address", { required: true }),
    check("disabled"),
    secret("password"),
    text("comment"),
  ];

  it("sends only what changed, and keeps a secret left empty", () => {
    const row = {
      ".id": "*1",
      address: "10.0.0.1/24",
      disabled: "false",
      password: "",
      comment: "a",
    };
    const initial = initialValues(fields, row);
    expect(initial).toEqual({
      address: "10.0.0.1/24",
      disabled: "no",
      password: "",
      comment: "a",
    });
    expect(
      changedAttrs(fields, { ...initial, comment: "b" }, initial, false),
    ).toEqual({ comment: "b" });
    expect(
      changedAttrs(fields, { ...initial, disabled: "yes" }, initial, false),
    ).toEqual({ disabled: "yes" });
    expect(changedAttrs(fields, initial, initial, false)).toEqual({});
  });

  it("sends what is filled in on add", () => {
    const initial = initialValues(fields, null);
    expect(
      changedAttrs(
        fields,
        { ...initial, address: " 10.0.0.1/24 " },
        initial,
        true,
      ),
    ).toEqual({
      address: "10.0.0.1/24",
    });
  });

  it("reads more arguments as name=value lines", () => {
    expect(parseExtra("a=1\n# note\n\nb = x=y\nflag")).toEqual({
      a: "1",
      b: "x=y",
      flag: "",
    });
  });
});

describe("laterOnRouter", () => {
  it("adds minutes in both of RouterOS's date formats, across midnight", () => {
    expect(laterOnRouter("2025-10-25", "23:58:30", 5)).toEqual({
      date: "2025-10-26",
      time: "00:03:30",
    });
    expect(laterOnRouter("oct/25/2025", "10:00:00", 5)).toEqual({
      date: "oct/25/2025",
      time: "10:05:00",
    });
    expect(laterOnRouter("dec/31/2025", "23:59:00", 2)).toEqual({
      date: "jan/01/2026",
      time: "00:01:00",
    });
    expect(laterOnRouter("junk", "10:00:00", 5)).toBeNull();
  });
});

describe("clientConfig", () => {
  it("writes a WireGuard client config", () => {
    expect(
      clientConfig({
        privateKey: "PRIV",
        address: "10.10.10.2/32",
        dns: "10.10.10.1",
        serverPublicKey: "PUB",
        endpoint: "vpn.example.com:13231",
        allowedIps: "0.0.0.0/0",
        keepalive: "25",
      }),
    ).toBe(
      "[Interface]\nPrivateKey = PRIV\nAddress = 10.10.10.2/32\nDNS = 10.10.10.1\n\n[Peer]\nPublicKey = PUB\nAllowedIPs = 0.0.0.0/0\nEndpoint = vpn.example.com:13231\nPersistentKeepalive = 25\n",
    );
  });
});
