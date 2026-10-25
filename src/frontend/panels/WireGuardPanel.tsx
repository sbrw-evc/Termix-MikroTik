import { useEffect, useMemo, useState } from "react";
import { usePermission, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { Button, Textarea } from "@termix-ssh/plugin-sdk/ui";
import { Download, UserPlus } from "lucide-react";
import qrcode from "qrcode-generator";
import { print, ros } from "../api";
import { Field, FormDialog, SelectInput, TextInput } from "../components/forms";
import { WIREGUARD, WIREGUARD_PEERS } from "../menus/interfaces";
import type { ViewProps } from "../menus/types";
import { TableView } from "../views/TableView";
import { MenuView } from "../views/MenuView";
import { tabs } from "../menus/dsl";

const b64 = (base64url: string) => {
  const s = base64url.replace(/-/g, "+").replace(/_/g, "/");
  return s + "=".repeat((4 - (s.length % 4)) % 4);
};

/** A WireGuard key pair made in the browser; the private key never reaches the router. */
export async function generateKeyPair(): Promise<{
  privateKey: string;
  publicKey: string;
} | null> {
  try {
    const pair = (await crypto.subtle.generateKey({ name: "X25519" }, true, [
      "deriveBits",
    ])) as CryptoKeyPair;
    const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    if (!jwk.d || !jwk.x) return null;
    return { privateKey: b64(jwk.d), publicKey: b64(jwk.x) };
  } catch {
    // Browsers without X25519 in WebCrypto: the user pastes a public key.
    return null;
  }
}

export function clientConfig(options: {
  privateKey: string;
  address: string;
  dns: string;
  serverPublicKey: string;
  endpoint: string;
  allowedIps: string;
  keepalive: string;
}): string {
  return [
    "[Interface]",
    `PrivateKey = ${options.privateKey || "<private key>"}`,
    `Address = ${options.address}`,
    ...(options.dns ? [`DNS = ${options.dns}`] : []),
    "",
    "[Peer]",
    `PublicKey = ${options.serverPublicKey}`,
    `AllowedIPs = ${options.allowedIps}`,
    `Endpoint = ${options.endpoint}`,
    ...(options.keepalive
      ? [`PersistentKeepalive = ${options.keepalive}`]
      : []),
    "",
  ].join("\n");
}

function Qr({ text }: { text: string }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }, [text]);
  return (
    <div
      className="w-56 bg-white p-1"
      // Rectangles drawn by qrcode-generator from our own config text.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function NewClientDialog({
  hostId,
  onClose,
  onAdded,
}: {
  hostId: number;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { t } = useTranslation();
  const [interfaces, setInterfaces] = useState<Array<Record<string, string>>>(
    [],
  );
  const [wg, setWg] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [dns, setDns] = useState("");
  const [allowed, setAllowed] = useState("0.0.0.0/0, ::/0");
  const [keepalive, setKeepalive] = useState("25");
  const [keys, setKeys] = useState<{
    privateKey: string;
    publicKey: string;
  } | null>(null);
  const [pastedKey, setPastedKey] = useState("");
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    void print(hostId, "interface/wireguard").then((rows) => {
      setInterfaces(rows);
      if (rows[0]) setWg(rows[0].name);
    });
    // The router's public name, when IP > Cloud has one.
    void print(hostId, "ip/cloud")
      .then((rows) => {
        const dnsName = rows[0]?.["dns-name"] || rows[0]?.["public-address"];
        if (dnsName) setEndpoint((e) => e || dnsName);
      })
      .catch(() => {});
    void generateKeyPair().then(setKeys);
  }, [hostId]);

  const server = interfaces.find((i) => i.name === wg);
  // The interface's listen port, unless the endpoint names one.
  const fullEndpoint =
    server && !/:\d+$/.test(endpoint.trim())
      ? `${endpoint.trim()}:${server["listen-port"]}`
      : endpoint.trim();
  const publicKey = keys?.publicKey ?? pastedKey.trim();

  if (done) {
    return (
      <FormDialog
        title={t("wireguard.clientReady")}
        submitLabel={t("app.close")}
        hideCancel
        onClose={onClose}
        onSubmit={async () => {}}
      >
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
          {keys && <Qr text={done} />}
          <Textarea
            readOnly
            value={done}
            rows={12}
            className="font-mono text-[11px]"
          />
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([done], { type: "text/plain" }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = `${name || "wireguard"}.conf`;
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 5000);
            }}
          >
            <Download className="mr-1 size-3.5" />
            {t("wireguard.downloadConf")}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {t("wireguard.privateKeyNote")}
        </p>
      </FormDialog>
    );
  }

  return (
    <FormDialog
      title={t("wireguard.newClient")}
      submitLabel={t("crud.add")}
      wide
      canSubmit={!!wg && !!address.trim() && !!publicKey && !!endpoint.trim()}
      onClose={onClose}
      onSubmit={async () => {
        await ros(hostId, "interface/wireguard/peers", "add", {
          interface: wg,
          "public-key": publicKey,
          "allowed-address": address.trim(),
          ...(name ? { comment: name } : {}),
        });
        onAdded();
        setDone(
          clientConfig({
            privateKey: keys?.privateKey ?? "",
            address: address.trim(),
            dns: dns.trim(),
            serverPublicKey: server?.["public-key"] ?? "",
            endpoint: fullEndpoint,
            allowedIps: allowed.trim(),
            keepalive: keepalive.trim(),
          }),
        );
        return false;
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("wireguard.interface")}>
          <SelectInput
            value={wg}
            onChange={setWg}
            options={interfaces.map((i) => ({ value: i.name, label: i.name }))}
          />
        </Field>
        <Field label={t("wireguard.clientName")}>
          <TextInput value={name} onChange={setName} placeholder="phone" />
        </Field>
        <Field
          label={t("wireguard.clientAddress")}
          hint={t("wireguard.clientAddressHint")}
        >
          <TextInput
            value={address}
            onChange={setAddress}
            placeholder="10.10.10.2/32"
          />
        </Field>
        <Field label={t("wireguard.endpoint")}>
          <TextInput
            value={endpoint}
            onChange={setEndpoint}
            placeholder="vpn.example.com"
          />
        </Field>
        <Field label={t("wireguard.dns")}>
          <TextInput value={dns} onChange={setDns} placeholder="10.10.10.1" />
        </Field>
        <Field label={t("wireguard.allowedIps")}>
          <TextInput value={allowed} onChange={setAllowed} />
        </Field>
        <Field label={t("wireguard.keepalive")}>
          <TextInput value={keepalive} onChange={setKeepalive} />
        </Field>
      </div>
      {!keys && (
        <Field
          label={t("wireguard.clientPublicKey")}
          hint={t("wireguard.noWebCrypto")}
        >
          <TextInput value={pastedKey} onChange={setPastedKey} mono />
        </Field>
      )}
    </FormDialog>
  );
}

/** WireGuard as in WinBox v7: interfaces, peers, and a client made in one step. */
export function WireGuardPanel(props: ViewProps) {
  const { t } = useTranslation();
  const canConfigure = usePermission("configure");
  const [adding, setAdding] = useState(false);
  const [reload, setReload] = useState(0);
  const view = useMemo(
    () =>
      tabs(
        ["wireguardInterfaces", WIREGUARD],
        [
          "wireguardPeers",
          {
            kind: "custom",
            component: (p: ViewProps) => (
              <TableView
                key={reload}
                hostId={p.hostId}
                spec={WIREGUARD_PEERS}
                isVisible={p.isVisible}
                extraToolbar={
                  canConfigure ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7"
                      onClick={() => setAdding(true)}
                    >
                      <UserPlus className="mr-1 size-3.5" />
                      {t("wireguard.newClient")}
                    </Button>
                  ) : undefined
                }
              />
            ),
          },
        ],
      ),
    [reload, canConfigure, t],
  );
  return (
    <>
      <MenuView {...props} view={view} />
      {adding && (
        <NewClientDialog
          hostId={props.hostId}
          onClose={() => setAdding(false)}
          onAdded={() => setReload((n) => n + 1)}
        />
      )}
    </>
  );
}
